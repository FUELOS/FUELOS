import {
  createCircuitContext,
  createConstructorContext,
  dummyContractAddress,
  proofDataIntoSerializedPreimage,
} from '@midnight-ntwrk/compact-runtime';
import { Contract } from '../managed/reconciliation/contract/index.js';
import { ReconciliationClass, type ReconciliationPrivateState } from './types.js';
import { witnesses } from './witnesses.js';

export type ProvingStage = 'execution' | 'artifacts' | 'health' | 'check' | 'prove';

/** Never attach the original error: runtime errors can contain private values. */
export class ProvingStageError extends Error {
  constructor(readonly stage: ProvingStage) {
    super(`Reconciliation proving failed at stage: ${stage}`);
    this.name = 'ProvingStageError';
  }
}

/** Returned data is PRIVATE, ephemeral, and must never be logged or persisted. */
export function executeReconciliation(input: ReconciliationPrivateState, claim: ReconciliationClass, tolerance: bigint = 100n) {
  try {
    const contract = new Contract<ReconciliationPrivateState>(witnesses);
    const coin = '00'.repeat(32);
    const initial = contract.initialState(createConstructorContext(input, coin));
    const context = createCircuitContext(dummyContractAddress(), coin, initial.currentContractState, input);
    const { proofData } = contract.impureCircuits.reconcile(context, claim, tolerance);
    const serializedPreimage = proofDataIntoSerializedPreimage(
      proofData.input,
      proofData.output,
      proofData.publicTranscript,
      proofData.privateTranscriptOutputs,
      'reconcile',
    );
    return { proofData, serializedPreimage };
  } catch {
    throw new ProvingStageError('execution');
  }
}
