# FuelOS proof-time source snapshot (v1)

FuelOS stores `zk_source_snapshot_hash` when a manager generates a local proof.
The hash is an application-level drift check. It is **not** a Compact public
input, a proof verification result, or an attestation by Midnight validators.
It is not returned by the API. A prior proof without this hash must be
regenerated before the status endpoint can report source consistency.

The backend reads every transaction for the shift as `(id, payment_method,
amount)` and derives the five private reconciliation inputs from those same
rows plus the shift's closing declarations. It then hashes a canonical JSON
object with SHA-256. The JSON uses sorted keys, no insignificant spaces, ASCII
escaping, and the following fields:

- `domain`: `FUELOS_ZK_SOURCE_SNAPSHOT_V1`
- `shiftId`: lowercase UUID
- `openingCashKurus`, `closingCashKurus`, `toleranceKurus`: decimal integer strings
- `declaredKurus`: keys `pos`, `eft`, `credit`; each a decimal integer string or
  JSON `null` when that declaration was omitted
- `transactions`: an array sorted by lowercase transaction UUID, with each row
  `[lowercase UUID, payment-method value, amount-in-kuruş decimal string]`

An omitted declaration retains the DEC-002 fallback to the corresponding
recorded payment total. Cash is `closingCashKurus - openingCashKurus`.
Only the fields used for reconciliation are included in each transaction row;
changing a description or fuel type does not change this hash.

`GET /api/shifts/{id}/zk-verify` recomputes the hash and returns HTTP 409 when
it differs. A matching hash shows that the current FuelOS source values match
those observed by this backend at proving time. Someone able to alter both the
database records and the saved hash can defeat this check. The Compact circuit
does not constrain its private monetary witness to this hash, and the hash
does not authenticate the source records to an independent verifier. A trusted,
externally anchored source commitment and a ledger transaction are still needed
before claiming independent verification.

This PoC loads the shift's reconciliation rows into memory for hashing. A
production implementation should stream or aggregate large shifts with a
bounded-memory canonicalization and define a database isolation policy for
concurrent writes.
