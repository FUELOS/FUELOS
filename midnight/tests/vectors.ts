import { ReconciliationClass as Class, type FinancialInputs } from '../src/types.js';

export interface TestVector {
  name: string;
  input: FinancialInputs;
  expected: Class;
  // Local test documentation only, never public contract outputs.
  calculatedTotal: bigint;
  difference: bigint;
}

export const vectors: TestVector[] = [
  { name: 'A: balanced', input: { total_sales: 100000n, pos: 40000n, cash: 30000n, eft: 20000n, credit: 10000n }, expected: Class.MATCHED, calculatedTotal: 100000n, difference: 0n },
  { name: 'B: shortage', input: { total_sales: 250000n, pos: 25000n, cash: 100000n, eft: 75000n, credit: 25000n }, expected: Class.SHORTAGE, calculatedTotal: 225000n, difference: 25000n },
  { name: 'C: inclusive +100 boundary', input: { total_sales: 100000n, pos: 39900n, cash: 30000n, eft: 20000n, credit: 10000n }, expected: Class.MATCHED, calculatedTotal: 99900n, difference: 100n },
  { name: 'D: +101 outside tolerance', input: { total_sales: 100000n, pos: 39900n, cash: 30000n, eft: 20000n, credit: 9999n }, expected: Class.SHORTAGE, calculatedTotal: 99899n, difference: 101n },
  { name: 'E: surplus', input: { total_sales: 100000n, pos: 40000n, cash: 40000n, eft: 20000n, credit: 10000n }, expected: Class.SURPLUS, calculatedTotal: 110000n, difference: -10000n },
];
