import type { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { ledger } from '../managed/reconciliation/contract/index.js';
import type { ReconciliationClass } from './types.js';

type PublicDataProvider = Pick<ReturnType<typeof indexerPublicDataProvider>, 'queryContractState'>;

export interface ExpectedReconciliationStatement {
  readonly publicClass: ReconciliationClass;
  readonly toleranceKurus: bigint;
  readonly contextDigest: Uint8Array;
}

/** Checks the *current finalized* contract state; callers must trust the address and indexer. */
export async function matchesCurrentLedgerState(
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
  return observed.reconciliationClass === expected.publicClass
    && observed.reconciliationTolerance === expected.toleranceKurus
    && Buffer.from(observed.reconciliationContextDigest).equals(Buffer.from(expected.contextDigest));
}
