import { createHash } from 'node:crypto';

export interface ShiftBindingData {
  shiftId: string;
  stationId: string;
  userId?: string;
  startTime: string;
  endTime?: string | null;
  authorizedToleranceKurus: bigint;
}

export interface ShiftCommitmentResult {
  commitment: string;
  canonicalPayload: string;
  authorizedToleranceKurus: bigint;
}

/**
 * Computes a deterministic cryptographic commitment for a FuelOS shift.
 * Binds the shift identity, station, cashier, timestamps, and authorized tolerance.
 * This is an audit-context digest. The current Compact circuit does not take
 * this value as a public input, so it must not be described as proof-bound
 * replay protection until ledger integration adds that binding.
 */
export function computeShiftCommitment(data: ShiftBindingData): ShiftCommitmentResult {
  if (!data.shiftId || !data.stationId) {
    throw new Error('Shift ID and Station ID are required to compute commitment');
  }
  if (typeof data.authorizedToleranceKurus !== 'bigint' || data.authorizedToleranceKurus < 0n || data.authorizedToleranceKurus > 100000n) {
    throw new Error('Authorized tolerance must be an integer between 0 and 100000 kurus (1000 TL)');
  }

  const payloadObj = {
    domain: 'FUELOS_RECONCILIATION_V1',
    shiftId: data.shiftId.toLowerCase(),
    stationId: data.stationId.toLowerCase(),
    userId: (data.userId || '').toLowerCase(),
    startTime: data.startTime,
    endTime: data.endTime || null,
    authorizedToleranceKurus: data.authorizedToleranceKurus.toString(),
  };

  const canonicalPayload = JSON.stringify(payloadObj, Object.keys(payloadObj).sort());
  const hash = createHash('sha256').update(canonicalPayload, 'utf8').digest('hex');
  const commitment = `fuelos:shift:v1:${hash}`;

  return {
    commitment,
    canonicalPayload,
    authorizedToleranceKurus: data.authorizedToleranceKurus,
  };
}

/**
 * Verifies that a given shift commitment matches the expected shift data and authorized policy.
 */
export function verifyShiftCommitment(commitment: string, data: ShiftBindingData): boolean {
  try {
    const computed = computeShiftCommitment(data);
    return computed.commitment === commitment;
  } catch {
    return false;
  }
}
