import {
  createCircuitContext,
  createConstructorContext,
  dummyContractAddress,
  proofDataIntoSerializedPreimage,
} from '@midnight-ntwrk/compact-runtime';
import { Contract } from '../managed/reconciliation/contract/index.js';
import { ledger } from '../managed/reconciliation/contract/index.js';
import { ReconciliationClass, type ReconciliationPrivateState } from './types.js';
import { witnesses } from './witnesses.js';
import { computeFinancialCommitment } from './financial-commitment.js';

export type ProvingStage = 'execution' | 'artifacts' | 'health' | 'check' | 'prove';

/** Never attach the original error: runtime errors can contain private values. */
export class ProvingStageError extends Error {
  constructor(readonly stage: ProvingStage) {
    super(`Reconciliation proving failed at stage: ${stage}`);
    this.name = 'ProvingStageError';
  }
}

/** Returned data is PRIVATE, ephemeral, and must never be logged or persisted. */
export function executeReconciliation(input: ReconciliationPrivateState, claim: ReconciliationClass, tolerance: bigint = 100n, contextDigest: Uint8Array) {
  try {
    if (!(contextDigest instanceof Uint8Array) || contextDigest.length !== 32) throw new Error('invalid context digest');
    const contract = new Contract<ReconciliationPrivateState>(witnesses);
    const coin = '00'.repeat(32);
    const initial = contract.initialState(createConstructorContext(input, coin));
    const context = createCircuitContext(dummyContractAddress(), coin, initial.currentContractState, input);
    const financialCommitment = computeFinancialCommitment(input, input.nonce);
    const { proofData, context: finalContext } = contract.impureCircuits.reconcile(context, claim, tolerance, contextDigest, financialCommitment);
    const publicContextDigest = ledger(finalContext.currentQueryContext.state).reconciliationContextDigest;
    const serializedPreimage = proofDataIntoSerializedPreimage(
      proofData.input,
      proofData.output,
      proofData.publicTranscript,
      proofData.privateTranscriptOutputs,
      'reconcile',
    );
    return { proofData, serializedPreimage, publicContextDigest, financialCommitment };
  } catch {
    throw new ProvingStageError('execution');
  }
}
