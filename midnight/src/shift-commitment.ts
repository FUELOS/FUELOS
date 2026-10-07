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

const CONTEXT_PREFIX = 'fuelos:shift:v1:';

/** Public 32-byte shift metadata digest passed to the Compact circuit. */
export function parseShiftContextDigest(value: string): Uint8Array {
  if (!/^fuelos:shift:v1:[0-9a-f]{64}$/.test(value)) {
    throw new Error('Invalid shift context digest');
  }
  return Uint8Array.from(Buffer.from(value.slice(CONTEXT_PREFIX.length), 'hex'));
}

export function formatShiftContextDigest(value: Uint8Array): string {
  if (!(value instanceof Uint8Array) || value.length !== 32) {
    throw new Error('Shift context digest must be 32 bytes');
  }
  return `${CONTEXT_PREFIX}${Buffer.from(value).toString('hex')}`;
}

/**
 * Computes a deterministic cryptographic commitment for a FuelOS shift.
 * Binds the shift identity, station, cashier, timestamps, and authorized tolerance.
 * The circuit publishes this digest as part of its public statement. It binds
 * the proof to metadata supplied by FuelOS, but does not prove that private
 * monetary witnesses came from the FuelOS database.
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
