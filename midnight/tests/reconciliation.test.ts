import { describe, expect, it } from 'vitest';
import { createCircuitContext, createConstructorContext, dummyContractAddress } from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger } from '../managed/reconciliation/contract/index.js';
import { MAX_INPUT_KURUS as MAX, ReconciliationClass as Class, type FinancialInputs, type ReconciliationPrivateState } from '../src/types.js';
import { witnesses } from '../src/witnesses.js';
import { vectors } from './vectors.js';
import { computeFinancialCommitment, withFinancialNonce } from '../src/financial-commitment.js';

const classes = [Class.MATCHED, Class.SHORTAGE, Class.SURPLUS];
const zero: FinancialInputs = { total_sales: 0n, pos: 0n, cash: 0n, eft: 0n, credit: 0n };
const contextDigest = Uint8Array.from({ length: 32 }, (_, index) => index);
const nonce = Uint8Array.from({ length: 32 }, (_, index) => index + 31);

function execute(input: FinancialInputs, claim: Class, tolerance: bigint = 100n, digest = contextDigest, commitment = computeFinancialCommitment(input, nonce)) {
  const contract = new Contract<ReconciliationPrivateState>(witnesses);
  const coin = '00'.repeat(32);
  const privateInput = withFinancialNonce(input, nonce);
  const initial = contract.initialState(createConstructorContext(privateInput, coin));
  const context = createCircuitContext(dummyContractAddress(), coin, initial.currentContractState, initial.currentPrivateState);
  return contract.impureCircuits.reconcile(context, claim, tolerance, digest, commitment);
}

function checkClaims(name: string, input: FinancialInputs, expected: Class) {
  describe(name, () => {
    for (const claim of classes) {
      it(`${Class[claim]} is ${claim === expected ? 'accepted' : 'rejected'}`, () => {
        if (claim === expected) {
          const call = execute(input, claim);
          expect(call.result).toEqual([]);
          expect(ledger(call.context.currentQueryContext.state).reconciliationClass).toBe(expected);
          expect(call.context.currentPrivateState).toEqual(withFinancialNonce(input, nonce));
        } else {
          expect(() => execute(input, claim)).toThrow('Reconciliation class mismatch');
        }
      });
    }
  });
}

for (const vector of vectors) checkClaims(vector.name, vector.input, vector.expected);

describe('integer boundaries and overflow', () => {
  checkClaims('zero', zero, Class.MATCHED);
  checkClaims('-100 is matched', { ...zero, cash: 100n }, Class.MATCHED);
  checkClaims('-101 is surplus', { ...zero, cash: 101n }, Class.SURPLUS);
  checkClaims('maximum sales, zero collection', { ...zero, total_sales: MAX }, Class.SHORTAGE);
  checkClaims('maximum equal values', { ...zero, total_sales: MAX, cash: MAX }, Class.MATCHED);
  checkClaims('four maximum channels need 66 bits', { total_sales: MAX, pos: MAX, cash: MAX, eft: MAX, credit: MAX }, Class.SURPLUS);
  checkClaims('no Uint64 wrap to a false match', { ...zero, total_sales: 0n, pos: MAX, cash: 1n }, Class.SURPLUS);
});

describe('generated Compact input validation (not a TS precheck)', () => {
  for (const field of Object.keys(zero) as (keyof FinancialInputs)[]) {
    for (const invalid of [-1n, MAX + 1n, 1.5, '100', undefined]) {
      it(`rejects ${field}=${String(invalid)}`, () => {
        // Deliberately bypass TS to test the actual generated witness validator.
        const input = { ...zero, [field]: invalid } as FinancialInputs;
        const validCommitment = computeFinancialCommitment(zero, nonce);
        expect(() => execute(input, Class.MATCHED, 100n, contextDigest, validCommitment)).toThrow(/financialInputs/);
      });
    }
  }
  it('rejects an unknown public class', () => {
    expect(() => execute(zero, 3 as Class)).toThrow(/reconcile/);
  });
});

describe('public/private boundary', () => {
  const pairs: [Class, FinancialInputs, FinancialInputs][] = [
    [Class.MATCHED, vectors[2].input, { ...zero, cash: 100n }],
    [Class.SHORTAGE, vectors[1].input, vectors[3].input],
    [Class.SURPLUS, vectors[4].input, { ...zero, cash: 101n }],
  ];
  for (const [claim, left, right] of pairs) {
    it(`${Class[claim]} commits to different private amounts without publishing them`, () => {
      const a = execute(left, claim);
      const b = execute(right, claim);
      expect(a.proofData.input).not.toEqual(b.proofData.input);
      expect(a.proofData.output).toEqual(b.proofData.output);
      expect(a.proofData.publicTranscript.length).toBeGreaterThan(0);
      expect(a.proofData.publicTranscript).not.toEqual(b.proofData.publicTranscript);
      expect(a.proofData.privateTranscriptOutputs).not.toEqual(b.proofData.privateTranscriptOutputs);
      expect(Object.keys(ledger(a.context.currentQueryContext.state))).toEqual([
        'reconciliationClass', 'reconciliationTolerance', 'reconciliationContextDigest',
        'reconciliationByContext', 'toleranceByContext', 'financialCommitmentByContext',
      ]);
    });
  }
});

describe('historical shift records and replay protection', () => {
  it('stores the class and tolerance under the public context digest', () => {
    const result = execute(vectors[0].input, Class.MATCHED);
    const state = ledger(result.context.currentQueryContext.state);
    expect(state.reconciliationByContext.member(contextDigest)).toBe(true);
    expect(state.reconciliationByContext.lookup(contextDigest)).toBe(Class.MATCHED);
    expect(state.toleranceByContext.lookup(contextDigest)).toBe(100n);
  });

  it('rejects a second call for the same context on the same contract', () => {
    const contract = new Contract<ReconciliationPrivateState>(witnesses);
    const coin = '00'.repeat(32);
    const privateInput = withFinancialNonce(vectors[0].input, nonce);
    const commitment = computeFinancialCommitment(vectors[0].input, nonce);
    const initial = contract.initialState(createConstructorContext(privateInput, coin));
    const firstContext = createCircuitContext(dummyContractAddress(), coin, initial.currentContractState, initial.currentPrivateState);
    const first = contract.impureCircuits.reconcile(firstContext, Class.MATCHED, 100n, contextDigest, commitment);
    const secondContext = createCircuitContext(dummyContractAddress(), coin,
      first.context.currentQueryContext.state, first.context.currentPrivateState);
    expect(() => contract.impureCircuits.reconcile(secondContext, Class.MATCHED, 100n, contextDigest, commitment))
      .toThrow('Shift context already reconciled');
  });

  it('preserves the first shift after reconciling a different context', () => {
    const contract = new Contract<ReconciliationPrivateState>(witnesses);
    const coin = '00'.repeat(32);
    const privateInput = withFinancialNonce(vectors[0].input, nonce);
    const commitment = computeFinancialCommitment(vectors[0].input, nonce);
    const initial = contract.initialState(createConstructorContext(privateInput, coin));
    const firstContext = createCircuitContext(dummyContractAddress(), coin, initial.currentContractState, initial.currentPrivateState);
    const first = contract.impureCircuits.reconcile(firstContext, Class.MATCHED, 100n, contextDigest, commitment);
    const secondDigest = Uint8Array.from(contextDigest);
    secondDigest[0] ^= 1;
    const secondContext = createCircuitContext(dummyContractAddress(), coin,
      first.context.currentQueryContext.state, first.context.currentPrivateState);
    const second = contract.impureCircuits.reconcile(secondContext, Class.MATCHED, 100n, secondDigest, commitment);
    const state = ledger(second.context.currentQueryContext.state);
    expect(state.reconciliationByContext.lookup(contextDigest)).toBe(Class.MATCHED);
    expect(state.toleranceByContext.lookup(contextDigest)).toBe(100n);
    expect(state.reconciliationByContext.lookup(secondDigest)).toBe(Class.MATCHED);
    expect(state.financialCommitmentByContext.lookup(contextDigest)).toEqual(commitment);
  });
});

describe('financial witness commitment', () => {
  it('rejects a public commitment for other monetary values', () => {
    const wrong = computeFinancialCommitment({ ...vectors[0].input, cash: 30001n }, nonce);
    expect(() => execute(vectors[0].input, Class.MATCHED, 100n, contextDigest, wrong))
      .toThrow('Financial commitment mismatch');
  });
  it('uses a nonce so identical totals can have distinct public commitments', () => {
    const first = computeFinancialCommitment(vectors[0].input, nonce);
    const otherNonce = Uint8Array.from(nonce);
    otherNonce[0] ^= 1;
    expect(computeFinancialCommitment(vectors[0].input, otherNonce)).not.toEqual(first);
  });
});

describe('public tolerance policy', () => {
  for (const tolerance of [0n, 100n, 500n, 100000n]) {
    for (const side of ['total_sales', 'cash'] as const) {
      it(`${side}: ${tolerance} boundary is inclusive`, () => {
        const call = execute({ ...zero, [side]: tolerance }, Class.MATCHED, tolerance);
        expect(ledger(call.context.currentQueryContext.state).reconciliationTolerance).toBe(tolerance);
        expect(() => execute({ ...zero, [side]: tolerance + 1n }, Class.MATCHED, tolerance)).toThrow();
        execute({ ...zero, [side]: tolerance + 1n }, side === 'cash' ? Class.SURPLUS : Class.SHORTAGE, tolerance);
      });
    }
  }
  for (const tolerance of [-1n, 100001n, 131072n]) {
    it(`rejects invalid tolerance ${tolerance}`, () => {
      expect(() => execute(zero, Class.MATCHED, tolerance)).toThrow();
    });
  }
  it('binds public tolerance even when the class is unchanged', () => {
    const a = execute(zero, Class.MATCHED, 100n);
    const b = execute(zero, Class.MATCHED, 500n);
    expect(a.proofData.publicTranscript).not.toEqual(b.proofData.publicTranscript);
  });
  it('binds the public shift context even when class and amounts are unchanged', () => {
    const first = execute(zero, Class.MATCHED);
    const changed = Uint8Array.from(contextDigest);
    changed[0] ^= 1;
    const second = execute(zero, Class.MATCHED, 100n, changed);
    expect(first.proofData.publicTranscript).not.toEqual(second.proofData.publicTranscript);
    expect(ledger(first.context.currentQueryContext.state).reconciliationContextDigest).toEqual(contextDigest);
    expect(ledger(second.context.currentQueryContext.state).reconciliationContextDigest).toEqual(changed);
  });
  it('3 TL shortage becomes matched at 5 TL', () => {
    const input = { ...zero, total_sales: 300n };
    execute(input, Class.SHORTAGE, 100n);
    execute(input, Class.MATCHED, 500n);
    expect(() => execute(input, Class.MATCHED, 100n)).toThrow();
  });
});
