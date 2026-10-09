import type { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { ledger } from '../managed/reconciliation/contract/index.js';
import type { ReconciliationClass } from './types.js';

type PublicDataProvider = Pick<ReturnType<typeof indexerPublicDataProvider>, 'queryContractState'>;

export interface ExpectedReconciliationStatement {
  readonly publicClass: ReconciliationClass;
  readonly toleranceKurus: bigint;
  readonly contextDigest: Uint8Array;
}

/** Checks the durable shift record in finalized public state; callers must trust the address and indexer. */
export async function matchesRecordedLedgerState(
  provider: PublicDataProvider,
  contractAddress: string,
  expected: ExpectedReconciliationStatement,
): Promise<boolean> {
  if (!(expected.contextDigest instanceof Uint8Array) || expected.contextDigest.length !== 32) {
    throw new Error('Expected context digest must be 32 bytes');
  }
  const state = await provider.queryContractState(contractAddress);
  if (!state) return false;
  const observed = ledger(state.data);
  return observed.reconciliationByContext.member(expected.contextDigest)
    && observed.toleranceByContext.member(expected.contextDigest)
    && observed.reconciliationByContext.lookup(expected.contextDigest) === expected.publicClass
    && observed.toleranceByContext.lookup(expected.contextDigest) === expected.toleranceKurus;
}
