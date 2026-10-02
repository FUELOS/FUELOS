import type { Witnesses } from '../managed/reconciliation/contract/index.js';
import type { ReconciliationPrivateState } from './types.js';

/** Supplies data only; classification and range checks belong to Compact. */
export const witnesses: Witnesses<ReconciliationPrivateState> = {
  financialInputs: ({ privateState }) => [privateState, { ...privateState }],
};
