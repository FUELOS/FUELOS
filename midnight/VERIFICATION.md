# Verification boundary

The current implementation produces real reconciliation proofs with the
localhost Midnight proof server 8.1.0. The proof server runs the circuit check,
creates the binary proof, and checks that generated proof before returning it.
FuelOS persists the 2940-byte proof as base64 plus its SHA-256 integrity hash.

This is proof generation, not independent ledger verification. The API uses
"proved" until a future Midnight transaction has been accepted and checked in
the ledger context. The "zk-verify" endpoint currently checks only that the
stored proof bytes still match their stored SHA-256 hash; its response exposes
"ledger_verified: false".

The next cryptographic verification step must build a real Midnight transaction
containing the circuit call and proof, then use the supported ledger/network
flow, including transaction well-formedness and submission/finalization. There
is no invented "verifyProof" endpoint or custom proof envelope in this code.

The "fuelos:shift:v1:..." value is currently an audit-context digest over shift
metadata and tolerance. It is not a public input to "reconcile", so the proof
does not yet cryptographically bind that digest or a transaction snapshot.
That binding must be added to the Compact public statement before replay
protection can be claimed.

Private witness values cross two local process boundaries during proving:

1. FuelOS backend to the Node CLI over stdin.
2. Node CLI to the proof server bound to "127.0.0.1:6300".

They are not logged, persisted, returned by the API, or written to files by this
integration. The proof server therefore remains a trusted local component.
