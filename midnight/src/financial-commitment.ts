import {
  CompactTypeBytes,
  CompactTypeUnsignedInteger,
  CompactTypeVector,
  persistentHash,
} from '@midnight-ntwrk/compact-runtime';
import type { FinancialInputs, ReconciliationPrivateState } from './types.js';

const u64 = new CompactTypeUnsignedInteger((1n << 64n) - 1n, 8);
const fiveAmounts = new CompactTypeVector(5, u64);
const twoDigests = new CompactTypeVector(2, new CompactTypeBytes(32));

/** The exact nested Compact persistentHash used by the circuit. The nonce is never public. */
export function computeFinancialCommitment(input: FinancialInputs, nonce: Uint8Array): Uint8Array {
  if (!(nonce instanceof Uint8Array) || nonce.length !== 32) throw new Error('Financial nonce must be 32 bytes');
  const amounts = persistentHash(fiveAmounts, [input.total_sales, input.pos, input.cash, input.eft, input.credit]);
  return persistentHash(twoDigests, [nonce, amounts]);
}

export function withFinancialNonce(input: FinancialInputs, nonce: Uint8Array): ReconciliationPrivateState {
  return { ...input, nonce };
}
