import { describe, expect, it } from 'vitest';
import { proveReconciliation } from '../src/proof.js';
import { ReconciliationClass } from '../src/types.js';
import { vectors } from './vectors.js';

describe.sequential('real proof server 8.1.0 (no network deployment)', () => {
  for (const index of [0, 1, 4]) {
    const vector = vectors[index];
    it(`proves ${vector.name}`, async () => {
      const result = await proveReconciliation(vector.input, vector.expected);
      expect(result.checkSucceeded).toBe(true);
      expect(result.proof).toBeInstanceOf(Uint8Array);
      expect(result.proof.byteLength).toBeGreaterThan(0);
      // Public metadata only. No witness/preimage/proof bytes are logged.
      console.info(JSON.stringify({
        case: vector.name[0], claim: ReconciliationClass[result.claim],
        execution: 'passed', check: 'passed', prove: 'passed',
        proofBytes: result.proof.byteLength, independentlyVerified: result.independentlyVerified,
      }));
    }, 360_000);
  }
  it('rejects A -> SHORTAGE during circuit execution, before check/prove', async () => {
    await expect(proveReconciliation(vectors[0].input, ReconciliationClass.SHORTAGE))
      .rejects.toMatchObject({ name: 'ProvingStageError', stage: 'execution' });
    console.info('A -> SHORTAGE: rejected at execution; check/prove not called');
  });
});
