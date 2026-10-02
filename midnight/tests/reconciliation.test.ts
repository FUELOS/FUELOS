import { describe, expect, it } from 'vitest';
import { createCircuitContext, createConstructorContext, dummyContractAddress } from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger } from '../managed/reconciliation/contract/index.js';
import { MAX_INPUT_KURUS as MAX, ReconciliationClass as Class, type FinancialInputs, type ReconciliationPrivateState } from '../src/types.js';
import { witnesses } from '../src/witnesses.js';
import { vectors } from './vectors.js';

const classes = [Class.MATCHED, Class.SHORTAGE, Class.SURPLUS];
const zero: FinancialInputs = { total_sales: 0n, pos: 0n, cash: 0n, eft: 0n, credit: 0n };

function execute(input: FinancialInputs, claim: Class, tolerance: bigint = 100n) {
  const contract = new Contract<ReconciliationPrivateState>(witnesses);
  const coin = '00'.repeat(32);
  const initial = contract.initialState(createConstructorContext(input, coin));
  const context = createCircuitContext(dummyContractAddress(), coin, initial.currentContractState, initial.currentPrivateState);
  return contract.impureCircuits.reconcile(context, claim, tolerance);
}

function checkClaims(name: string, input: FinancialInputs, expected: Class) {
  describe(name, () => {
    for (const claim of classes) {
      it(`${Class[claim]} is ${claim === expected ? 'accepted' : 'rejected'}`, () => {
        if (claim === expected) {
          const call = execute(input, claim);
          expect(call.result).toEqual([]);
          expect(ledger(call.context.currentQueryContext.state).reconciliationClass).toBe(expected);
          expect(call.context.currentPrivateState).toEqual(input);
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
        expect(() => execute(input, Class.MATCHED)).toThrow(/financialInputs/);
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
    it(`${Class[claim]} has the same public transcript for different private amounts`, () => {
      const a = execute(left, claim);
      const b = execute(right, claim);
      expect(a.proofData.input).toEqual(b.proofData.input);
      expect(a.proofData.output).toEqual(b.proofData.output);
      expect(a.proofData.publicTranscript.length).toBeGreaterThan(0);
      expect(a.proofData.publicTranscript).toEqual(b.proofData.publicTranscript);
      expect(a.proofData.privateTranscriptOutputs).not.toEqual(b.proofData.privateTranscriptOutputs);
      expect(Object.keys(ledger(a.context.currentQueryContext.state))).toEqual(['reconciliationClass', 'reconciliationTolerance']);
    });
  }
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
  it('3 TL shortage becomes matched at 5 TL', () => {
    const input = { ...zero, total_sales: 300n };
    execute(input, Class.SHORTAGE, 100n);
    execute(input, Class.MATCHED, 500n);
    expect(() => execute(input, Class.MATCHED, 100n)).toThrow();
  });
});
