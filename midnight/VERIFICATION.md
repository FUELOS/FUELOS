# Verification boundary

The current implementation produces real reconciliation proofs with the
localhost Midnight proof server 8.1.0. FuelOS calls `check()` on the circuit
preimage and then `prove()` to obtain a non-empty binary proof.
FuelOS persists the 2940-byte proof as base64 plus its SHA-256 integrity hash.

This backend flow is proof generation, not independent ledger verification. The API uses
"proved" until a future Midnight transaction has been accepted and checked in
the ledger context. The "zk-verify" endpoint checks the stored proof's SHA-256
integrity, the version of the Compact public statement, current shift metadata
against the stored public context digest, and current reconciliation source
records against the saved proof-time source hash. These are application-level
checks; its response still exposes "ledger_verified: false". See
[the source-snapshot format](SOURCE_SNAPSHOT.md).

A separate opt-in integration test now builds a real Midnight transaction on a
disposable local network, waits for finalization, and checks its public contract
state through the indexer. This does not change the backend API status or
independently authenticate the financial source. There is no invented
"verifyProof" endpoint or custom proof envelope in this code.

The "fuelos:shift:v1:..." value is a SHA-256 digest over shift ID, station ID,
user ID, opening/closing timestamps, and the tolerance frozen at shift close.
The 32 digest bytes are now a public argument and ledger output of "reconcile".
The proof therefore binds the claimed class and tolerance to these caller-supplied
metadata bytes. Backend code recomputes the digest before proving and when
reading the proof status. Proofs made with the old statement have no version
marker and must be regenerated.

The public context digest does not include the transaction set or the five
monetary values. The separate source hash is stored privately by FuelOS.
The proof does not establish that its private witness came from the FuelOS
database, nor does it prevent another valid proof for the same shift. A future
on-chain verifier needs the expected context digest from a trusted shift
snapshot and must check it against the transaction's public output. The current
backend still controls the metadata and witness supplied to the prover.

Private witness values cross two local process boundaries during proving:

1. FuelOS backend to the Node CLI over stdin.
2. Node CLI to the proof server bound to "127.0.0.1:6300".

They are not logged, persisted, returned by the API, or written to files by this
integration. The proof server therefore remains a trusted local component.

## Network verification handoff

`src/compiled-contract.ts` binds the generated `Contract`, the real
`financialInputs` witness, and the full-compile assets with Midnight.js's
`CompiledContract` API. Run `npm run compile:full` and then
`npm run verification:manifest` to print the circuit ID, statement version,
and SHA-256 fingerprints of the verifier key and bZKIR. The command reads only
public verifier material; it performs no network operation and prints no
financial inputs or proof bytes. The deployer should compare these fingerprints
with the artifacts used by the deployed contract.

The existing standalone proof was produced using a dummy contract address and
is **not** a deployable transaction. The opt-in `npm run test:ledger` uses
`CompiledContract` and the six Midnight.js providers on the official local
`undeployed` network. It deploys a fresh contract, calls `reconcile` for vector
A/MATCHED, waits for finalization, and checks the indexer-visible class,
tolerance, and context digest. It also rejects a wrong class and digest. The
test keeps temporary wallet/private-state files outside the repository and
prints only public identifiers. Run it after `npm run compile:full` with the
local node, indexer, and proof server running; it deliberately is not part of
the fast `npm test` command.

`matchesCurrentLedgerState()` checks only the **current** public contract
state. A later call overwrites these fields, so it is not historical evidence
for a particular shift. The caller must obtain the expected digest and contract
address from a trusted source and trust the queried indexer. A production
`verified` status also needs a durable receipt tied to a finalized transaction,
historical shift-specific state or events, source authentication, replay
policy, and deployment on the chosen network. The current FuelOS backend
correctly remains at `proved`.

The private source snapshot hash is not a Compact public input. Independent
verification of the **financial source**, rather than just the reconciliation
calculation, still needs an authenticated source commitment and replay policy
agreed with the blockchain implementer. The local test is an isolated prototype;
it does not deploy to a public network or verify production FuelOS shifts.

Official references: [Midnight.js API](https://docs.midnight.network/api-reference/midnight-js),
[deploy/operate guide](https://docs.midnight.network/guides/deploy-and-operate),
and [compatibility matrix](https://docs.midnight.network/relnotes/support-matrix).
