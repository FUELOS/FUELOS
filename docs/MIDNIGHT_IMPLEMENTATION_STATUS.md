# FuelOS Midnight implementation status

Date: 2026-10-09. Target shared test network: Preview.

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
  trusted contract address, historical ledger class/tolerance/context/financial
  commitment, local verifier-key fingerprint, and separate Ed25519 signatures
  by the FuelOS source and station manager. The trusted signer keys and
  contract address are supplied independently of the submitted evidence.
- The local integration test deployed v4 on a disposable Midnight network,
  submitted A/MATCHED, saw block 489 finalization, and checked the public
  record through the indexer. This does not constitute Preview deployment.
- `midnight/PREVIEW_SETUP.md` records the official user-controlled Lace,
  faucet tNIGHT, and Generate tDUST setup, plus deployment handoff.

| Check | Result |
| --- | --- |
| `npm test` (Compact compile, TypeScript, fast suites) | 96/96 passed |
| `npm run compile:full` | passed |
| Prover key / verifier key / binary ZKIR | 2,825,165 / 2,119 / 576 bytes |
| Real proof suite, server 8.1.3 | 5/5 passed; v4 proofs 4,508 bytes |
| Local v4 ledger integration | 1/1 passed; finalized A/MATCHED |
| Backend ZK/snapshot/tolerance including real proof bridge | 15 passed, 10 subtests |

## Still requires external setup or further implementation

1. **Preview wallet and deployment:** there is no funded Preview wallet, no
   registered v4 contract, and no Preview transaction. The wallet owner must
   create Lace Preview wallet, obtain faucet tNIGHT, and register tDUST. No
   recovery phrase should enter the repo or chat. A controlled wallet signing
   and deployment flow must then be implemented and tested on Preview.
2. **Independent source authentication:** the dual-signature verification code
   exists, but independent source and manager signing services, key custody,
   and their actual approvals of a real FuelOS snapshot are not deployed.
   The public financial commitment alone cannot certify database provenance.
3. **Receipt attribution:** the read-only helper checks that a reconciliation
   call and matching public map entry exist in the finalized block. It does
   not decode per-call arguments, so same-block calls need stronger attribution
   before an API may set `verified`.
4. **Production rollout:** the new Alembic migration is committed but not
   applied to a shared database. A trusted deployment registry, finality
   policy, durable receipt/audit storage, bounded proof jobs, rate limits, and
   monitoring are still required. The backend intentionally stays `proved`.

The current [official support matrix](https://docs.midnight.network/relnotes/support-matrix)
pins Preview to Compact 0.31.1/runtime 0.16.0, Midnight.js 4.1.1, wallet SDK
1.2.0, and proof server 8.1.3. Ledger-9 compiler 0.34/0.35 is incompatible
with Preview at this date. See [verification boundary](../midnight/VERIFICATION.md)
for the exact trust assumptions.
