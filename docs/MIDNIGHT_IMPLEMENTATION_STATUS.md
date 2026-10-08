# FuelOS Midnight implementation status

Date: 2026-10-08

## Completed

- Compact reconciliation uses private integer-kuruş inputs and public
  MATCHED, SHORTAGE, or SURPLUS class, tolerance, and 32-byte shift context digest.
- Compact compiler 0.31.1 full compilation produces the prover key, verifier
  key, and binary ZKIR for circuit "reconcile".
- Local proof server 8.1.0 produces non-empty 2940-byte proofs for A/MATCHED,
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
  It checks current state only and does not promote backend proof status.

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
   stored transactions. There is no uniqueness or replay protection yet.
2. **Production ledger verification.** The local integration test proves the
   deploy/call/finalization/indexer path, but the backend has no durable
   transaction receipt, historical per-shift state, or trusted indexer/network
   check that can set a real shift to `verified`.
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
| "npm test" in "midnight/" | 82/82 passed |
| "npm run compile:full" | passed |
| Prover key | 287580 bytes |
| Verifier key | 1351 bytes |
| Binary ZKIR | 279 bytes |
| "npm run test:proof" | 5/5 passed |
| Backend real-proof bridge | 8/8 passed, including one real 2940-byte proof |
| Full backend suite with local proof server | 23 passed, 5 subtests passed |
| Closing tolerance snapshot | 2/2 passed |
| Existing Python reconciliation tests | 9/9 passed |
| Alembic migration chain | single head: `a8b9c0d1e2f3` |
| Midnight contract handoff | 2/2 tests passed; manifest generated |
| Local ledger integration | 1/1 passed; finalized A/MATCHED transaction, public statement checked |
| npm audit | 0 vulnerabilities after Vitest update to 5.0.3 |
| Frontend "npm run build" | passed; existing 510 kB chunk warning |

## Next safe milestone

Agree on an authenticated transaction-snapshot commitment and canonical
encoding with the blockchain implementer, plus a historical/replay-safe ledger
record. Preview is the selected first shared test network; its wallet must
receive faucet tNIGHT and register for tDUST before deployment. Bind the backend status to a
trusted finalized transaction receipt before changing `proved` to `verified`.
