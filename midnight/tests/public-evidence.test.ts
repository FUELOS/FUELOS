import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createCircuitContext, createConstructorContext, dummyContractAddress } from '@midnight-ntwrk/compact-runtime';
import type { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import type { VerifierKey } from '@midnight-ntwrk/midnight-js-types';
import { ContractState } from '@midnight-ntwrk/midnight-js-protocol/onchain-runtime';
import { Contract } from '../managed/reconciliation/contract/index.js';
import { computeFinancialCommitment, withFinancialNonce } from '../src/financial-commitment.js';
import { verifyPublicReconciliationEvidence, type PublicReconciliationEvidence } from '../src/public-evidence.js';
import { attestationMessage, type ReconciliationAttestation } from '../src/source-attestation.js';
import { CIRCUIT_ID, STATEMENT_VERSION } from '../src/compiled-contract.js';
import { ReconciliationClass, type ReconciliationPrivateState } from '../src/types.js';
import { witnesses } from '../src/witnesses.js';
import { vectors } from './vectors.js';

const source = generateKeyPairSync('ed25519');
const manager = generateKeyPairSync('ed25519');
const sourcePem = source.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const managerPem = manager.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const address = 'ab'.repeat(32);
const txId = '00' + 'cd'.repeat(32);
const contextDigest = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
const nonce = Uint8Array.from({ length: 32 }, (_, i) => i + 31);
const financialCommitment = computeFinancialCommitment(vectors[0].input, nonce);
const verifierKey = Uint8Array.from([1, 2, 3, 4]) as VerifierKey;
const attestation: ReconciliationAttestation = {
  network: 'preview', txId, contractAddress: address,
  contextDigest: `fuelos:shift:v1:${contextDigest.toString('hex')}`,
  financialCommitment: Buffer.from(financialCommitment).toString('hex'),
  sourceSnapshotHash: '12'.repeat(32), publicClass: 'MATCHED',
  toleranceKurus: '100', verifierKeySha256: createHash('sha256').update(verifierKey).digest('hex'),
  statementVersion: STATEMENT_VERSION,
};
const message = attestationMessage(attestation);
const evidence: PublicReconciliationEvidence = {
  txId, attestation,
  signatures: {
    source: sign(null, message, source.privateKey).toString('base64'),
    manager: sign(null, message, manager.privateKey).toString('base64'),
  },
};
const trusted = {
  network: 'preview' as const, contractAddress: address,
  verifierKeySha256: attestation.verifierKeySha256,
  verifierKey,
  sourcePublicKeyPem: sourcePem, managerPublicKeyPem: managerPem,
};

function provider() {
  const input = withFinancialNonce(vectors[0].input, nonce);
  const contract = new Contract<ReconciliationPrivateState>(witnesses);
  const coin = '00'.repeat(32);
  const initial = contract.initialState(createConstructorContext(input, coin));
  const circuitContext = createCircuitContext(dummyContractAddress(), coin, initial.currentContractState, input);
  const result = contract.impureCircuits.reconcile(circuitContext, ReconciliationClass.MATCHED, 100n, contextDigest, financialCommitment);
  const after = ContractState.deserialize(initial.currentContractState.serialize());
  after.data = result.context.currentQueryContext.state;
  return {
    watchForTxData: async () => ({
      status: 'SucceedEntirely', txId, identifiers: [txId], txHash: 'ef'.repeat(32),
      blockHash: '12'.repeat(32), blockHeight: 8,
      tx: { intents: new Map([[1, { actions: [{ address, entryPoint: 'reconcile' }] }]]) },
    }),
    queryContractState: async (_address: string, config?: { blockHeight?: number }) =>
      config?.blockHeight === 7 ? initial.currentContractState : after,
  } as unknown as Pick<ReturnType<typeof indexerPublicDataProvider>, 'watchForTxData' | 'queryContractState'>;
}

const transition = async (_address?: string, _txId?: string, _height?: number, _hash?: string,
  keyLocation: 'both' | 'before' | 'after' | 'neither' = 'both') => {
  const input = withFinancialNonce(vectors[0].input, nonce);
  const contract = new Contract<ReconciliationPrivateState>(witnesses);
  const coin = '00'.repeat(32);
  const initial = contract.initialState(createConstructorContext(input, coin));
  const circuitContext = createCircuitContext(dummyContractAddress(), coin, initial.currentContractState, input);
  const result = contract.impureCircuits.reconcile(circuitContext, ReconciliationClass.MATCHED, 100n, contextDigest, financialCommitment);
  const after = ContractState.deserialize(initial.currentContractState.serialize());
  after.data = result.context.currentQueryContext.state;
  // Unit test supplies only the public operation shape read by verifyContractState.
  const deployedOperation = (name: string | Uint8Array) => name === CIRCUIT_ID
    ? { verifierKey } as unknown as ReturnType<typeof after.operation>
    : undefined;
  if (keyLocation === 'both' || keyLocation === 'before') initial.currentContractState.operation = deployedOperation;
  if (keyLocation === 'both' || keyLocation === 'after') after.operation = deployedOperation;
  return { before: initial.currentContractState, after };
};

describe('independent public evidence handoff', () => {
  it('requires both trusted signatures and the finalized public statement', async () => {
    expect(await verifyPublicReconciliationEvidence(provider(), evidence, trusted, transition))
      .toMatchObject({ txId, blockHeight: 8 });
    expect(await verifyPublicReconciliationEvidence(provider(), {
      ...evidence, txId: '00' + 'ff'.repeat(32),
    }, trusted, transition)).toBeNull();
  });
  it('rejects an untrusted contract, signer or verifier key', async () => {
    expect(await verifyPublicReconciliationEvidence(provider(), evidence, { ...trusted, contractAddress: 'ff'.repeat(32) }, transition)).toBeNull();
    expect(await verifyPublicReconciliationEvidence(provider(), evidence, { ...trusted, verifierKeySha256: 'ff'.repeat(32) }, transition)).toBeNull();
    expect(await verifyPublicReconciliationEvidence(provider(), evidence, { ...trusted, managerPublicKeyPem: sourcePem }, transition)).toBeNull();
    expect(await verifyPublicReconciliationEvidence(provider(), evidence, { ...trusted, verifierKey: new Uint8Array(0) as VerifierKey }, transition)).toBeNull();
    expect(await verifyPublicReconciliationEvidence(provider(), evidence, trusted,
      (address, txId, height, hash) => transition(address, txId, height, hash, 'neither'))).toBeNull();
    expect(await verifyPublicReconciliationEvidence(provider(), evidence, trusted,
      (address, txId, height, hash) => transition(address, txId, height, hash, 'before'))).toBeNull();
    expect(await verifyPublicReconciliationEvidence(provider(), evidence, trusted,
      (address, txId, height, hash) => transition(address, txId, height, hash, 'after'))).toBeNull();
  });
  it('rejects altered public claims after signing', async () => {
    expect(await verifyPublicReconciliationEvidence(provider(), {
      ...evidence, attestation: { ...attestation, publicClass: 'SHORTAGE' },
    }, trusted, transition)).toBeNull();
  });
});
