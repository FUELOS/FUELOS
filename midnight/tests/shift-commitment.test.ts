import { describe, expect, it } from 'vitest';
import { computeShiftCommitment, verifyShiftCommitment } from '../src/shift-commitment.js';

describe('shift context digest', () => {
  const shift = {
    shiftId: 'shift-1',
    stationId: 'station-1',
    userId: 'user-1',
    startTime: '2026-10-03T08:00:00Z',
    endTime: '2026-10-03T16:00:00Z',
    authorizedToleranceKurus: 100n,
  };

  it('is deterministic and detects changed metadata', () => {
    const result = computeShiftCommitment(shift);
    expect(result.commitment).toMatch(/^fuelos:shift:v1:[a-f0-9]{64}$/);
    expect(verifyShiftCommitment(result.commitment, shift)).toBe(true);
    expect(verifyShiftCommitment(result.commitment, { ...shift, shiftId: 'shift-2' })).toBe(false);
  });

  it('changes when the authorized tolerance changes', () => {
    const first = computeShiftCommitment(shift).commitment;
    const second = computeShiftCommitment({ ...shift, authorizedToleranceKurus: 500n }).commitment;
    expect(second).not.toBe(first);
  });
});
