import type { FinancialInputs } from '../managed/reconciliation/contract/index.js';

export { ReconciliationClass } from '../managed/reconciliation/contract/index.js';
export type { FinancialInputs };

/** All money is integer kurus. No TL parsing or rounding in this PoC. */
export type ReconciliationPrivateState = Readonly<FinancialInputs>;
export const MAX_INPUT_KURUS = (1n << 64n) - 1n;
