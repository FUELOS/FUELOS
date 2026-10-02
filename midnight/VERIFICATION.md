# Independent verification: next stage

Real proof generation is implemented and tested. Independent cryptographic
verification by a separate consumer has not been implemented or tested.

Tolerance is now a public integer-kurus argument and ledger field, with bounds
0..100000. A verifier must check it against the authorized closing policy, not
merely accept whichever tolerance the prover supplies. The standalone PoC does
not yet fetch or authenticate the backend's saved shift tolerance. Public class
and tolerance tampering both require negative verification tests in the next stage.

## Official API boundary

The pinned Midnight.js protocol 4.1.1 exposes ledger-v8 8.1.0 through
`@midnight-ntwrk/midnight-js-protocol/ledger`. Its actual type declarations expose:

- `Proof.deserialize(raw)` and `Proof.serialize()`: representation conversion,
  not cryptographic verification.
- `Transaction.wellFormed(ref_state, strictness, tblock)`: ledger validation
  returning `VerifiedTransaction` or failing.
- `WellFormedStrictness.verifyContractProofs`: must remain enabled to validate
  contract proofs.
- `ContractOperationVersionedVerifierKey`: associates versioned verifier
  material with a contract operation.

There is no standalone `verifyProof` API or proof-server verification endpoint
used or assumed here. Calling `/check` requires the private preimage and evaluates
constraints, so it is not a private-input-free verification method.

## Proposed next implementation

Build a local ledger transaction harness using these pinned official APIs.
Register the trusted reconciliation operation/verifier material in its reference
contract state, construct the contract call with its public context/transcript,
and carry the generated proof in a proven transaction. A separate verification
process should receive only that transaction, the trusted reference state/key
and the public validation context. It must not receive witness values or the
serialized proving preimage.

Call `Transaction.wellFormed` with contract proof checks enabled. The transaction
must satisfy the ledger's required structure/context; raw proof bytes alone do
not supply those. Explicitly document any signature, balance or other checks
disabled by an isolated harness: such a harness must not claim full network
transaction validity. This next step requires additional implementation and
testing; compatibility of the current standalone proof with the constructed
transaction must be established rather than assumed.

Add negative tests for modified proof bytes, changed public reconciliation
class and a different verifier key. No blockchain deployment is inherently
required to execute local ledger validation. Network submission later adds
actual chain state, addressing, transaction balancing/signing and submission.

The proof still does not authenticate FuelOS source records or bind them to a
shift identity. That requires a separately designed commitment/authentication
layer before financial audit claims are appropriate.

## Official references

- [Midnight local proving guide](https://docs.midnight.network/guides/local-proving)
- [Ledger 8.1.0 API source](https://github.com/midnightntwrk/midnight-ledger/blob/ledger-8.1.0/ledger-wasm/ledger-v8.template.d.ts)
- [Midnight.js 4.1.1 source](https://github.com/midnightntwrk/midnight-js/tree/v4.1.1)

The API names above were also checked against the installed ledger-v8 8.1.0
declarations. The local proving guide describes server-side self-verification;
that is distinct from the independent verification proposed here.
