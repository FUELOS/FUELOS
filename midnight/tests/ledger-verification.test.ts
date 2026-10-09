import { describe, expect, it } from 'vitest';
import { createCircuitContext, createConstructorContext, dummyContractAddress } from '@midnight-ntwrk/compact-runtime';
import type { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { ContractState } from '@midnight-ntwrk/midnight-js-protocol/onchain-runtime';
import { Contract } from '../managed/reconciliation/contract/index.js';
import { computeFinancialCommitment, withFinancialNonce } from '../src/financial-commitment.js';
import { verifyFinalizedReconciliation } from '../src/ledger-verification.js';
import { ReconciliationClass, type ReconciliationPrivateState } from '../src/types.js';
import { witnesses } from '../src/witnesses.js';
import { vectors } from './vectors.js';

const address = 'ab'.repeat(32);
const txId = '00' + 'cd'.repeat(32);
const contextDigest = Uint8Array.from({ length: 32 }, (_, i) => i);
const nonce = Uint8Array.from({ length: 32 }, (_, i) => i + 31);
const financialCommitment = computeFinancialCommitment(vectors[0].input, nonce);
const expected = { publicClass: ReconciliationClass.MATCHED, toleranceKurus: 100n, contextDigest, financialCommitment };

function states() {
  const privateInput = withFinancialNonce(vectors[0].input, nonce);
  const contract = new Contract<ReconciliationPrivateState>(witnesses);
  const coin = '00'.repeat(32);
  const initial = contract.initialState(createConstructorContext(privateInput, coin));
  const context = createCircuitContext(dummyContractAddress(), coin, initial.currentContractState, privateInput);
  const result = contract.impureCircuits.reconcile(context, ReconciliationClass.MATCHED, 100n, contextDigest, financialCommitment);
  const after = ContractState.deserialize(initial.currentContractState.serialize());
  after.data = result.context.currentQueryContext.state;
  return { before: initial.currentContractState, after };
}

function provider(options: { status?: string; entryPoint?: string; beforeAlreadyRecorded?: boolean } = {}) {
  const state = states();
  const call = { address, entryPoint: options.entryPoint ?? 'reconcile' };
  const receipt = {
    status: options.status ?? 'SucceedEntirely', txId, identifiers: [txId],
    txHash: 'ef'.repeat(32), blockHash: '12'.repeat(32), blockHeight: 8,
    tx: { intents: new Map([[1, { actions: [call] }]]) },
  };
  return {
    watchForTxData: async () => receipt,
    queryContractState: async (_address: string, config?: { blockHeight?: number }) =>
      config?.blockHeight === 7 && !options.beforeAlreadyRecorded ? state.before : state.after,
  } as unknown as Pick<ReturnType<typeof indexerPublicDataProvider>, 'watchForTxData' | 'queryContractState'>;
}

describe('finalized reconciliation receipt verification', () => {
  it('accepts a successful call that creates the exact public record in its block', async () => {
    const result = await verifyFinalizedReconciliation(provider(), address, txId, expected);
    expect(result).toMatchObject({ txId, blockHeight: 8, contractAddress: address });
  });
  it('rejects wrong class or salted financial commitment', async () => {
    expect(await verifyFinalizedReconciliation(provider(), address, txId, {
      ...expected, publicClass: ReconciliationClass.SHORTAGE,
    })).toBeNull();
    expect(await verifyFinalizedReconciliation(provider(), address, txId, {
      ...expected, financialCommitment: new Uint8Array(32),
    })).toBeNull();
  });
  it('rejects a failed or unrelated receipt and a pre-existing context', async () => {
    expect(await verifyFinalizedReconciliation(provider({ status: 'FailFallible' }), address, txId, expected)).toBeNull();
    expect(await verifyFinalizedReconciliation(provider({ entryPoint: 'other' }), address, txId, expected)).toBeNull();
    expect(await verifyFinalizedReconciliation(provider({ beforeAlreadyRecorded: true }), address, txId, expected)).toBeNull();
  });
});
