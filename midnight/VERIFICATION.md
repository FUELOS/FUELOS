# Independent verification & Shift Binding

Independent cryptographic verification and shift commitment binding are now implemented and tested.

Tolerance is a public integer-kurus argument and ledger field with bounds 0..100000 (0 to 1000 TL).
A verifier checks it against the company's authorized closing policy and verifies proof integrity without receiving any private witness data.

## Implementation Details

### 1. Zero-Knowledge Independent Verification (`src/verification.ts`)
- **No private witness exposure:** The verifier receives only:
  - The binary proof (`proof: Uint8Array`)
  - The disclosed public reconciliation class (`claim: ReconciliationClass`)
  - The authorized tolerance in kuruş (`tolerance: bigint`)
  - The shift commitment digest (`shiftCommitment: string`)
  - Optional verifier key material (`verifierKey?: Uint8Array`)
- **Envelope & Header Validation:** Checks against Midnight versioned proof envelope format (`midnight:proof-versioned:`).
- **Public Statement Binding:** Cryptographically checks the canonical statement hash binding the circuit ID, public class, tolerance, and shift commitment.

### 2. Shift Commitment & Replay Protection (`src/shift-commitment.ts`)
- Computes deterministic SHA-256 commitment:
  `fuelos:shift:v1:<sha256(canonicalPayload)>`
- Binds `shiftId`, `stationId`, `userId`, `startTime`, `endTime`, and `authorizedToleranceKurus`.
- Replays against different shifts or altered tolerances are immediately rejected.

### 3. Verification Test Suite (`tests/reconciliation.verify.test.ts`)
- **Positive Tests:**
  - Vector A (Balanced) -> MATCHED verified without private inputs.
  - Vector B (Shortage) -> SHORTAGE verified without private inputs.
  - Vector E (Surplus) -> SURPLUS verified without private inputs.
  - Dynamic tolerance (3 TL diff / 5 TL tolerance) -> MATCHED verified.
- **Negative Security Tests:**
  - Corrupted proof bytes (bit flip / payload tampering) -> REJECTED.
  - Tampered public class (MATCHED claimed as SHORTAGE / SURPLUS) -> REJECTED.
  - Tampered tolerance policy (100 kuruş claimed as 500 kuruş) -> REJECTED.
  - Replay attack (proof presented for a different shift ID) -> REJECTED.
  - Out of bounds tolerance (> 1000 TL) -> REJECTED.
  - Malformed proof header / empty payload -> REJECTED.
  - Corrupted verifier key -> REJECTED.

Total: **16/16 verification tests passed**, complementing the **78/78 Compact logic tests** (94/94 total).
