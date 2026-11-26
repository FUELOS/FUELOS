# Veresiye audit fixes

Scope: the 15 reproduced findings in the 2026-11-26 review. No network deployment or unrelated edits.

1. [x] Add failing regressions for authorization, shift totals, dates, pumps, collection totals, retries and plate snapshots.
2. [x] Fix backend validation and accounting; add a migration for unique financial request identifiers.
3. [x] Fix sale entry, stale detail requests, partial uploads and company selection state.
4. [x] Separate global summaries from search, and add counted pagination.
5. [x] Independent code review; fix replay access after station transfer and form reset on parent renders.
6. [x] Final verification: 70 backend tests passed, one environment-dependent test skipped; three standalone veresiye integration suites passed; TypeScript and production build passed; real-API browser regressions passed at desktop and mobile sizes.
7. Delivery branch: `codex/veresiye-audit-fixes` (base: `feature/veresiye-borc-takip`).

Deployment: run `alembic upgrade head` before starting the updated backend.
Financial UI actions send a stable UUID `Idempotency-Key` for the same submitted
payload. Replays return the original resource; changed payloads return 409. The
API accepts legacy calls without this header for compatibility, but these callers
must adopt it to obtain retry protection. Only a fingerprint and result ID are
stored in `financial_requests`, atomically with the financial entry.

`total_payments` and `period_payments` now contain collections only. Signed
adjustments are exposed separately as `total_adjustments` and `period_adjustments`;
balances still subtract both. `/api/veresiye/summary` is independent of list search.
Sales, payments and unlinked transaction lists support `offset` and
`X-Total-Count` with stable ID tie breakers.

Product-policy questions in the audit (cash collection till, approval policy,
sale corrections, historical periods and platform-admin privacy) require separate
business rules; this patch preserves the existing policy and fixes the 15
reproduced defects. No new blockchain deployment or proof claim is introduced.
