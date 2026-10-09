# FuelOS proof-time source snapshot (v1)

FuelOS stores `zk_source_snapshot_hash` when a manager generates a local proof.
The hash is an application-level drift check. It is **not** a Compact public
input, a proof verification result, or an attestation by Midnight validators.
The v4 circuit's separate public `financialCommitment` is a nonce-salted hash
of the five financial witness amounts, not this database snapshot hash.
FuelOS retains that nonce in a private database column for later controlled
source review; it is not returned by the API.
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
does not constrain its private monetary witness to this snapshot hash. A separate
source service and station manager must authenticate the relationship between
the snapshot, monetary witness, and public financial commitment before an
independent verifier can rely on it. Neither signing service is deployed yet.
See [VERIFICATION.md](VERIFICATION.md).

This PoC loads the shift's reconciliation rows into memory for hashing. A
production implementation should stream or aggregate large shifts with a
bounded-memory canonicalization and define a database isolation policy for
concurrent writes.
