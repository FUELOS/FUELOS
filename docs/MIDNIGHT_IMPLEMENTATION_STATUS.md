# FuelOS Midnight implementation status

Date: 2026-10-09

## Completed

- Compact reconciliation uses private integer-kuruş inputs and public
  MATCHED, SHORTAGE, or SURPLUS class, tolerance, and 32-byte shift context digest.
- Compact compiler 0.31.1 full compilation produces the prover key, verifier
  key, and binary ZKIR for circuit "reconcile".
- Local proof server 8.1.3 is the current Preview-supported version; it
  produced non-empty 2940-byte proofs for A/MATCHED,
  B/SHORTAGE, E/SURPLUS, and the dynamic-tolerance case.
- A false A/SHORTAGE claim is rejected during Compact execution before proving.
- A private-input-safe TypeScript CLI connects the backend to real circuit
  execution, proof-server "check()" and "prove()".
- The backend stores the real proof bytes as base64 and computes SHA-256 from
  those bytes. It no longer creates a deterministic placeholder hash.
- Proof generation is an explicit manager/admin operation and is scoped through
  the existing company/station shift query.
- Shift closing no longer hides proof-server errors or marks a closed shift as
  cryptographically verified.
- The UI distinguishes "proved" from ledger/network "verified", displays no
  fabricated proof hash, and calls the authenticated status endpoint.
- Zero tolerance remains zero; nullable tolerance fallbacks no longer use
  truthiness.
- The reconciliation tolerance is frozen at shift close. Historical rows without
  a saved value use the documented 1 TL fallback; a later company policy change
  cannot silently alter their old result.
- Proofs now bind a public digest of shift metadata and the frozen tolerance.
  Old proofs are explicitly marked as an earlier statement version and require
  regeneration before the status endpoint accepts them.
- New proofs also save a private SHA-256 snapshot of the reconciliation source
  rows and closing declarations. The status endpoint detects later source drift;
  pre-existing proofs without that snapshot require regeneration.
- The generated contract, witness, and full-compile assets are bound with the
  official `CompiledContract` API. A local manifest prints the verifier-key and
  bZKIR fingerprints for the future network integration without private inputs.
- An opt-in test deploys the contract on the official disposable local Midnight
  network, submits a real A/MATCHED call, waits for finalization, and checks
  its public class, tolerance, and context digest via the local indexer.
- The local ledger-state helper rejects mismatched public class and digest.
  It checks a durable public map entry by context digest and does not promote
  backend proof status.
- The contract rejects a second reconciliation for the same context digest
  within the same deployment. Other context records remain readable after
  subsequent calls.
- Proof input conversion now rejects sub-kuruş values instead of rounding them.
- API responses treat legacy database `verified` flags as `proved` until a
  finalized, trusted on-chain receipt verifier exists.

## Removed because it was not cryptographic verification

- The custom zero-filled 2940-byte “proof envelope”.
- Digest substring matching presented as proof verification.
- Ignored "ledger.Proof.deserialize()" failures.
- Random deployment transaction hashes and dummy addresses presented as deploy
  output.
- Backend “verification” that recomputed its own deterministic SHA-256 value.
- UI behavior that marked every closed shift as verified.

## Still missing

1. **Independent financial source binding.** The backend stores a source-drift
   hash, but the Compact circuit does not constrain its private witness to it.
   This does not prove to an outside verifier that amounts came from FuelOS's
   stored transactions. Context uniqueness is enforced within one contract,
   but this does not authenticate the financial source or prevent a second
   deployment from accepting the same context.
2. **Production ledger verification.** The local integration test proves the
   deploy/call/finalization/indexer path, but the backend has no durable
   transaction receipt or trusted indexer/network check that can set a real
   shift to `verified`. The on-chain historical map is now available.
3. **Public-network deployment.** The local test uses a disposable genesis
   wallet and network. There is no Preview/Preprod/Mainnet deployment, funded
   production wallet, or registered network contract address.
4. **Production prover operation.** The backend request waits synchronously for
   the local prover for up to 360 seconds. Production needs a job queue,
   concurrency limits, retries, health monitoring, and an availability policy.
5. **Artifact lifecycle.** Proving/verifier keys and bZKIR are generated files
   and are not committed. Deployment must build or securely distribute the
   exact pinned artifacts.
6. **Proof storage policy.** PostgreSQL Text is sufficient for this PoC.
   Production should define retention, immutable audit storage, backup, and
   proof-publication rules.
7. **Abuse controls.** The authenticated proof endpoint still needs rate
   limiting and an audit event for repeated or failed proving requests.
8. **Database rollout.** The Alembic migration exists but was not applied to a
   shared or production database in this work.

## Verified commands and results

| Check | Result |
| --- | --- |
| Compact/TypeScript fast suites (direct commands) | 87/87 passed; 82 circuit, 3 context, 2 artifact tests |
| "npm run compile:full" | passed |
| Prover key | 287862 bytes |
| Verifier key | 1351 bytes |
| Binary ZKIR | 464 bytes |
| Real proof tests, proof server 8.1.3 | 5/5 passed; A/B/E returned 2940 bytes |
| Backend ZK, source snapshot, reconciliation | 21 passed, 1 opt-in proof test skipped, 10 subtests passed |
| Backend real proof bridge, proof server 8.1.3 | 8 passed, 9 subtests passed |
| Midnight contract handoff | 2/2 tests passed |
| Local ledger integration | 1/1 passed; finalized A/MATCHED, historical map checked, duplicate rejected (with the prior 8.1.0 server) |

## Next safe milestone

Agree on an authenticated transaction-snapshot commitment and canonical
encoding with the blockchain implementer. The intended trust policy is a
FuelOS source attestation plus separate station-manager approval, both bound
to the same shift snapshot and statement version. Neither signature is yet
verified by the Compact circuit; wallet approval alone would not certify the
database rows. Preview is the selected first shared test network. Its wallet
must receive faucet tNIGHT and register for tDUST before deployment. Register
the trusted contract address and bind backend status to a finalized transaction
receipt before changing `proved` to `verified`.
