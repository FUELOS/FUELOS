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

## Removed because it was not cryptographic verification

- The custom zero-filled 2940-byte “proof envelope”.
- Digest substring matching presented as proof verification.
- Ignored "ledger.Proof.deserialize()" failures.
- Random deployment transaction hashes and dummy addresses presented as deploy
  output.
- Backend “verification” that recomputed its own deterministic SHA-256 value.
- UI behavior that marked every closed shift as verified.

## Still missing

1. **Financial source binding.** The circuit binds the metadata digest supplied
   by the backend, but the digest does not commit to the transaction set or the
   monetary witness. It does not prove that private inputs came from FuelOS's
   stored transactions. There is no uniqueness or replay protection yet.
2. **Independent ledger verification.** No wallet, indexer, submitted Midnight
   transaction, "Transaction.wellFormed" validation, finalization check, or
   on-chain verifier result exists.
3. **Network deployment.** There is no Compact contract deployment, funded
   wallet, faucet use, or Midnight network address.
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
| Closing tolerance snapshot | 2/2 passed |
| Existing Python reconciliation tests | 9/9 passed |
| Alembic migration chain | single head: `f7a8b9c0d2e3` |
| Frontend "npm run build" | passed; existing 510 kB chunk warning |

## Next safe milestone

Agree on a trusted transaction-snapshot commitment and its canonical encoding
with the blockchain implementer. Then construct a real Midnight transaction,
verify it through the supported ledger path, submit it to the selected network,
and only after finalization change "zk_proof_status" from "proved" to "verified".
