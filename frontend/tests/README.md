# Financial browser regressions

Use only an isolated, seeded PostgreSQL database whose name contains `audit`.
The API regression test refuses other databases. Start the backend on localhost
port 8000 and the frontend on localhost port 5173 against that same database.

1. Set `AUDIT_BROWSER_FIXTURE_PATH` to an absolute temporary JSON path.
2. From `backend`, run `python -m pytest tests/test_audit_api.py -q` with the
   disposable `DATABASE_URL`, `SECRET_KEY` and `PII_ENCRYPTION_KEY` configured.
   This creates synthetic accounts and emits only their IDs and test email addresses.
3. From `frontend`, run `node tests/audit-regressions.cjs` with the same fixture path.
   Playwright must be installed in the QA environment. Optionally set
   `PLAYWRIGHT_MODULE_PATH` to its installed module directory and
   `AUDIT_CHROME_PATH` to a Chromium/Chrome executable.

Create fresh fixtures for every browser run. The test posts synthetic sales,
payments and photographs to the real API. Requests are forwarded to localhost
port 8000, including when the frontend runs inside WSL; no API results are mocked.
