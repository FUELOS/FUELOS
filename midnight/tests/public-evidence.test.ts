import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createCircuitContext, createConstructorContext, dummyContractAddress } from '@midnight-ntwrk/compact-runtime';
import type { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { ContractState } from '@midnight-ntwrk/midnight-js-protocol/onchain-runtime';
import { Contract } from '../managed/reconciliation/contract/index.js';
import { computeFinancialCommitment, withFinancialNonce } from '../src/financial-commitment.js';
import { verifyPublicReconciliationEvidence, type PublicReconciliationEvidence } from '../src/public-evidence.js';
import { attestationMessage, type ReconciliationAttestation } from '../src/source-attestation.js';
import { STATEMENT_VERSION } from '../src/compiled-contract.js';
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
const attestation: ReconciliationAttestation = {
  network: 'preview', contractAddress: address,
  contextDigest: `fuelos:shift:v1:${contextDigest.toString('hex')}`,
  financialCommitment: Buffer.from(financialCommitment).toString('hex'),
  sourceSnapshotHash: '12'.repeat(32), publicClass: 'MATCHED',
  toleranceKurus: '100', verifierKeySha256: '34'.repeat(32),
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

describe('independent public evidence handoff', () => {
  it('requires both trusted signatures and the finalized public statement', async () => {
    expect(await verifyPublicReconciliationEvidence(provider(), evidence, trusted))
      .toMatchObject({ txId, blockHeight: 8 });
  });
  it('rejects an untrusted contract, signer or verifier key', async () => {
    expect(await verifyPublicReconciliationEvidence(provider(), evidence, { ...trusted, contractAddress: 'ff'.repeat(32) })).toBeNull();
    expect(await verifyPublicReconciliationEvidence(provider(), evidence, { ...trusted, verifierKeySha256: 'ff'.repeat(32) })).toBeNull();
    expect(await verifyPublicReconciliationEvidence(provider(), evidence, { ...trusted, managerPublicKeyPem: sourcePem })).toBeNull();
  });
  it('rejects altered public claims after signing', async () => {
    expect(await verifyPublicReconciliationEvidence(provider(), {
      ...evidence, attestation: { ...attestation, publicClass: 'SHORTAGE' },
    }, trusted)).toBeNull();
  });
});
