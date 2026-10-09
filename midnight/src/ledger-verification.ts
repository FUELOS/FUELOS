import type { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { SucceedEntirely } from '@midnight-ntwrk/midnight-js-types';
import { ledger } from '../managed/reconciliation/contract/index.js';
import type { ReconciliationClass } from './types.js';

type PublicDataProvider = Pick<ReturnType<typeof indexerPublicDataProvider>, 'queryContractState'>;
type ReceiptProvider = Pick<ReturnType<typeof indexerPublicDataProvider>, 'queryContractState' | 'watchForTxData'>;

export interface ExpectedReconciliationStatement {
  readonly publicClass: ReconciliationClass;
  readonly toleranceKurus: bigint;
  readonly contextDigest: Uint8Array;
  readonly financialCommitment: Uint8Array;
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
  if (!(expected.financialCommitment instanceof Uint8Array) || expected.financialCommitment.length !== 32) {
    throw new Error('Expected financial commitment must be 32 bytes');
  }
  const state = await provider.queryContractState(contractAddress);
  if (!state) return false;
  const observed = ledger(state.data);
  return observed.reconciliationByContext.member(expected.contextDigest)
    && observed.toleranceByContext.member(expected.contextDigest)
    && observed.financialCommitmentByContext.member(expected.contextDigest)
    && observed.reconciliationByContext.lookup(expected.contextDigest) === expected.publicClass
    && observed.toleranceByContext.lookup(expected.contextDigest) === expected.toleranceKurus
    && Buffer.from(observed.financialCommitmentByContext.lookup(expected.contextDigest)).equals(Buffer.from(expected.financialCommitment));
}

export interface FinalizedReconciliationReceipt {
  readonly txId: string;
  readonly txHash: string;
  readonly blockHash: string;
  readonly blockHeight: number;
  readonly contractAddress: string;
}

/**
 * Independently checks a finalized call and the newly-created public record.
 * `contractAddress` must come from a trusted deployment registry, not the submitter.
 * This confirms the ledger calculation, not the authenticity of FuelOS source rows.
 */
export async function verifyFinalizedReconciliation(
  provider: ReceiptProvider,
  contractAddress: string,
  txId: string,
  expected: ExpectedReconciliationStatement,
  timeoutMs = 30_000,
): Promise<FinalizedReconciliationReceipt | null> {
  if (!/^[0-9a-f]{64}$/i.test(contractAddress) || !/^[0-9a-f]{66}$/i.test(txId)) {
    throw new Error('Invalid public address or transaction ID');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) {
    throw new Error('Invalid receipt timeout');
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const receipt = await Promise.race([
      provider.watchForTxData(txId),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Timed out waiting for a finalized transaction')), timeoutMs);
      }),
    ]);
    if (receipt.status !== SucceedEntirely || !receipt.identifiers.includes(txId) || receipt.blockHeight < 1) return null;
    const callsContract = [...(receipt.tx.intents?.values() ?? [])]
      .flatMap((intent) => intent.actions)
      .some((action) => 'entryPoint' in action
        && action.address.toLowerCase() === contractAddress.toLowerCase()
        && action.entryPoint === 'reconcile');
    if (!callsContract) return null;

    const before = await provider.queryContractState(contractAddress, { type: 'blockHeight', blockHeight: receipt.blockHeight - 1 });
    if (before && ledger(before.data).reconciliationByContext.member(expected.contextDigest)) return null;
    const atReceipt = await provider.queryContractState(contractAddress, { type: 'blockHeight', blockHeight: receipt.blockHeight });
    if (!atReceipt) return null;
    const viewAtReceipt: PublicDataProvider = { queryContractState: async () => atReceipt };
    if (!await matchesRecordedLedgerState(viewAtReceipt, contractAddress, expected)) return null;
    return {
      txId: receipt.txId, txHash: receipt.txHash, blockHash: receipt.blockHash,
      blockHeight: receipt.blockHeight, contractAddress,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
