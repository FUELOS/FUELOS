# FuelOS Midnight implementation status

Date: 2026-10-13. Target shared test network: Preview.

## Implemented and tested

- The v4 Compact circuit proves that five private integer-kuruş amounts produce
  the public MATCHED, SHORTAGE, or SURPLUS class under the public tolerance.
  It also constrains a public 32-byte commitment to those amounts and a private
  random nonce. It publishes no monetary amount or exact difference.
- The backend creates the nonce, calls the localhost proof server, and persists
  the real proof, public class, tolerance, shift-context digest, financial
  commitment, private nonce, statement version, and private source-snapshot hash. The API
  remains `proved`; it does not claim network verification.
- A read-only verification path checks a successful finalized transaction,
  trusted contract address, a matching state transition at that transaction,
  public class/tolerance/context/financial commitment, the deployed verifier
  key before and after the call against the local artifact, and separate Ed25519 signatures
  by the FuelOS source and station manager. The trusted signer keys and
  contract address are supplied independently of the submitted evidence.
- The local integration test deployed v4 on a disposable Midnight network,
  submitted A/MATCHED, saw block 629 finalization, and checked the exact
  transaction's state transition through the indexer. This does not constitute
  Preview deployment.
- A Lace-signed v4 deployment and demo A/MATCHED reconciliation finalized on
  Preview. A read-only indexer inspection bound the MATCHED/100-kuruş public
  record to the exact transaction and matched the deployed verifier key to the
  local full-compile artifact. Public identifiers are in
  [deployment.preview.json](../midnight/preview/deployment.preview.json).
- A manager-scoped Preview handoff now prepares a real closed-shift transaction
  from the stored witness, lets Lace sign and submit it, and records only a
  matching receipt after six indexed blocks. The backend rechecks the source
  snapshot and ledger transaction before reporting Preview confirmation.
- `midnight/PREVIEW_SETUP.md` records the official user-controlled Lace,
  faucet tNIGHT, and Generate tDUST setup, plus deployment handoff.

| Check | Result |
| --- | --- |
| `npm test` (Compact compile, TypeScript, fast suites) | 98/98 passed |
| `npm run compile:full` | passed |
| Prover key / verifier key / binary ZKIR | 2,825,165 / 2,119 / 576 bytes |
| Real proof suite, server 8.1.3 | 5/5 passed; v4 proofs 4,508 bytes |
| Local v4 ledger integration | 1/1 passed; finalized A/MATCHED |
| Preview browser bundle | built; Lace connection, deploy and demo call succeeded |
| Preview read-only transaction inspection | passed; MATCHED, 100 kuruş, matching verifier key |
| Backend ZK/snapshot/tolerance including real proof bridge | 15 passed, 10 subtests |

## Still requires external setup or further implementation

1. **Real shift submission:** the handoff is implemented and a real unbound
   Preview transaction was proved without submission. No actual FuelOS shift
   transaction has been signed by Lace on Preview yet. The manager must operate
   that wallet and a closed FuelOS shift; no recovery phrase enters the repo.
2. **Independent source authentication:** the dual-signature verification code
   exists, but independent source and manager signing services, key custody,
   and their actual approvals of a real FuelOS snapshot are not deployed.
   The public financial commitment alone cannot certify database provenance.
3. **Finality policy:** the Preview handoff requires six indexed blocks and
   rechecks the recorded block hash on status reads. Production still needs an
   independent indexer/finality trust policy before `verified` can be set.
4. **Production rollout:** the handoff migration was applied to a disposable
   local PostgreSQL database, not a shared database. Independent signer custody,
   bounded proof jobs, rate limits, and monitoring are still required. The
   backend intentionally stays `proved`.

The current [official support matrix](https://docs.midnight.network/relnotes/support-matrix)
pins Preview to Compact 0.31.1/runtime 0.16.0, Midnight.js 4.1.1, wallet SDK
1.2.0, and proof server 8.1.3. Ledger-9 compiler 0.34/0.35 is incompatible
with Preview at this date. See [verification boundary](../midnight/VERIFICATION.md)
for the exact trust assumptions.
