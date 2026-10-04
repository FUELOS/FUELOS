import { describe, expect, it } from 'vitest';
import { executeReconciliation } from '../src/execution.js';
import { ReconciliationClass } from '../src/types.js';
import {
  computeShiftCommitment,
  verifyShiftCommitment,
  type ShiftBindingData,
} from '../src/shift-commitment.js';
import {
  verifyReconciliationProof,
  createVerifiableProofArtifact,
} from '../src/verification.js';
import { vectors } from './vectors.js';

describe('FuelOS Independent Proof Verification (No Private Inputs)', () => {
  const sampleShift: ShiftBindingData = {
    shiftId: 'c0a80101-0000-0000-0000-000000000001',
    stationId: 'station-istanbul-maslak-01',
    userId: 'user-cashier-042',
    startTime: '2026-10-03T08:00:00Z',
    endTime: '2026-10-03T16:00:00Z',
    authorizedToleranceKurus: 100n,
  };

  const { commitment: shiftCommitment } = computeShiftCommitment(sampleShift);

  describe('Shift Commitment & Policy Binding', () => {
    it('generates deterministic commitment for identical shift parameters', () => {
      const a = computeShiftCommitment(sampleShift);
      const b = computeShiftCommitment({ ...sampleShift });
      expect(a.commitment).toBe(b.commitment);
      expect(a.commitment).toMatch(/^fuelos:shift:v1:[a-f0-9]{64}$/);
    });

    it('alters commitment when shift ID, timestamps or station changes', () => {
      const altered = computeShiftCommitment({
        ...sampleShift,
        shiftId: 'c0a80101-0000-0000-0000-000000000002',
      });
      expect(altered.commitment).not.toBe(shiftCommitment);
    });

    it('alters commitment when authorized tolerance policy changes', () => {
      const altered = computeShiftCommitment({
        ...sampleShift,
        authorizedToleranceKurus: 500n,
      });
      expect(altered.commitment).not.toBe(shiftCommitment);
    });

    it('verifies valid shift commitment and rejects tampered data', () => {
      expect(verifyShiftCommitment(shiftCommitment, sampleShift)).toBe(true);
      expect(
        verifyShiftCommitment(shiftCommitment, {
          ...sampleShift,
          authorizedToleranceKurus: 200n,
        }),
      ).toBe(false);
    });
  });

  describe('Positive Independent Verification (A/MATCHED, B/SHORTAGE, E/SURPLUS)', () => {
    it('verifies Vector A -> MATCHED without private inputs', () => {
      const vector = vectors[0];
      const execution = executeReconciliation(vector.input, vector.expected, 100n);
      const proofArtifact = createVerifiableProofArtifact(
        execution.serializedPreimage,
        vector.expected,
        100n,
        shiftCommitment,
      );

      // Verifier receives ONLY the proof artifact, public class, public tolerance, and commitment.
      // Private amounts (total_sales, pos, cash, eft, credit) are NOT supplied!
      const result = verifyReconciliationProof({
        proof: proofArtifact,
        claim: vector.expected,
        tolerance: 100n,
        shiftCommitment,
      });

      expect(result.verified).toBe(true);
      expect(result.stage).toBe('complete');
      expect(result.publicClass).toBe('MATCHED');
      expect(result.toleranceKurus).toBe(100n);
      expect(result.shiftCommitment).toBe(shiftCommitment);
      expect(result.proofHash.length).toBe(64);
    });

    it('verifies Vector B -> SHORTAGE without private inputs', () => {
      const vector = vectors[1];
      const execution = executeReconciliation(vector.input, vector.expected, 100n);
      const proofArtifact = createVerifiableProofArtifact(
        execution.serializedPreimage,
        vector.expected,
        100n,
        shiftCommitment,
      );

      const result = verifyReconciliationProof({
        proof: proofArtifact,
        claim: vector.expected,
        tolerance: 100n,
        shiftCommitment,
      });

      expect(result.verified).toBe(true);
      expect(result.stage).toBe('complete');
      expect(result.publicClass).toBe('SHORTAGE');
    });

    it('verifies Vector E -> SURPLUS without private inputs', () => {
      const vector = vectors[4];
      const execution = executeReconciliation(vector.input, vector.expected, 100n);
      const proofArtifact = createVerifiableProofArtifact(
        execution.serializedPreimage,
        vector.expected,
        100n,
        shiftCommitment,
      );

      const result = verifyReconciliationProof({
        proof: proofArtifact,
        claim: vector.expected,
        tolerance: 100n,
        shiftCommitment,
      });

      expect(result.verified).toBe(true);
      expect(result.stage).toBe('complete');
      expect(result.publicClass).toBe('SURPLUS');
    });

    it('verifies dynamic tolerance: 3 TL difference is MATCHED under 5 TL tolerance policy', () => {
      const dynamicShift: ShiftBindingData = {
        ...sampleShift,
        authorizedToleranceKurus: 500n,
      };
      const { commitment: dynCommitment } = computeShiftCommitment(dynamicShift);
      const input = { total_sales: 300n, pos: 0n, cash: 0n, eft: 0n, credit: 0n };

      const execution = executeReconciliation(input, ReconciliationClass.MATCHED, 500n);
      const proofArtifact = createVerifiableProofArtifact(
        execution.serializedPreimage,
        ReconciliationClass.MATCHED,
        500n,
        dynCommitment,
      );

      const result = verifyReconciliationProof({
        proof: proofArtifact,
        claim: ReconciliationClass.MATCHED,
        tolerance: 500n,
        shiftCommitment: dynCommitment,
      });

      expect(result.verified).toBe(true);
      expect(result.publicClass).toBe('MATCHED');
      expect(result.toleranceKurus).toBe(500n);
    });
  });

  describe('Negative Security Verification Tests (Tampering Rejection)', () => {
    const vector = vectors[0];
    const execution = executeReconciliation(vector.input, vector.expected, 100n);
    const validProof = createVerifiableProofArtifact(
      execution.serializedPreimage,
      vector.expected,
      100n,
      shiftCommitment,
    );

    it('rejects corrupted proof bytes (bit flip / payload modification)', () => {
      const tamperedProof = new Uint8Array(validProof);
      tamperedProof[130] ^= 0xff; // Flip bits in statement binding section

      const result = verifyReconciliationProof({
        proof: tamperedProof,
        claim: vector.expected,
        tolerance: 100n,
        shiftCommitment,
      });

      // Proof header or binding integrity fails
      expect(result.verified).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects tampered public class: proof generated for MATCHED, claimed as SHORTAGE', () => {
      const result = verifyReconciliationProof({
        proof: validProof,
        claim: ReconciliationClass.SHORTAGE, // Falsified public class!
        tolerance: 100n,
        shiftCommitment,
      });

      expect(result.verified).toBe(false);
      expect(result.error).toMatch(/Public statement binding mismatch/);
    });

    it('rejects tampered public class: proof generated for MATCHED, claimed as SURPLUS', () => {
      const result = verifyReconciliationProof({
        proof: validProof,
        claim: ReconciliationClass.SURPLUS, // Falsified public class!
        tolerance: 100n,
        shiftCommitment,
      });

      expect(result.verified).toBe(false);
      expect(result.error).toMatch(/Public statement binding mismatch/);
    });

    it('rejects tampered tolerance policy: proof generated for 100 kurus, claimed as 500 kurus', () => {
      const result = verifyReconciliationProof({
        proof: validProof,
        claim: vector.expected,
        tolerance: 500n, // Falsified public tolerance!
        shiftCommitment,
      });

      expect(result.verified).toBe(false);
      expect(result.error).toMatch(/Public statement binding mismatch/);
    });

    it('rejects replay attack: proof presented for a different shift commitment', () => {
      const differentShift = computeShiftCommitment({
        ...sampleShift,
        shiftId: 'c0a80101-9999-9999-9999-999999999999',
      });

      const result = verifyReconciliationProof({
        proof: validProof,
        claim: vector.expected,
        tolerance: 100n,
        shiftCommitment: differentShift.commitment, // Replay against different shift!
      });

      expect(result.verified).toBe(false);
      expect(result.error).toMatch(/Public statement binding mismatch/);
    });

    it('rejects out of bounds public tolerance (> 100000 kurus / 1000 TL)', () => {
      const result = verifyReconciliationProof({
        proof: validProof,
        claim: vector.expected,
        tolerance: 100001n,
        shiftCommitment,
      });

      expect(result.verified).toBe(false);
      expect(result.error).toMatch(/Tolerance out of authorized bounds/);
    });

    it('rejects malformed proof header / empty proof', () => {
      const emptyResult = verifyReconciliationProof({
        proof: new Uint8Array(0),
        claim: vector.expected,
        tolerance: 100n,
        shiftCommitment,
      });
      expect(emptyResult.verified).toBe(false);

      const invalidHeaderResult = verifyReconciliationProof({
        proof: new Uint8Array([1, 2, 3, 4, 5]),
        claim: vector.expected,
        tolerance: 100n,
        shiftCommitment,
      });
      expect(invalidHeaderResult.verified).toBe(false);
      expect(invalidHeaderResult.error).toMatch(/Invalid proof envelope header/);
    });

    it('rejects corrupted verifier key material', () => {
      const result = verifyReconciliationProof({
        proof: validProof,
        claim: vector.expected,
        tolerance: 100n,
        shiftCommitment,
        verifierKey: new Uint8Array([0, 1, 2]), // Truncated/corrupted key
      });

      expect(result.verified).toBe(false);
      expect(result.error).toMatch(/Invalid verifier key/);
    });
  });
});
