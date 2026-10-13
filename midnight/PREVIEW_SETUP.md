# Preview wallet and deployment handoff

The user connected a funded Preview Lace wallet and deployed the v4 demo
contract. The verified public deployment and A/MATCHED transaction are in
[deployment.preview.json](preview/deployment.preview.json). The following are
user-controlled steps; do not send a seed phrase or private
key to a developer, chat, repository, CI log, or screenshot.

1. Install the [Lace wallet linked by Midnight's official guide](https://docs.midnight.network/guides/acquire-tokens)
   in the browser and create a **Preview** Midnight wallet. Back up its recovery
   phrase privately. Confirm that the selected network is Preview.
2. Copy Lace's unshielded `mn_addr_...` Preview address. Use the
   [official Preview faucet](https://midnight-tmnight-preview.nethermind.dev/)
   to request tNIGHT and complete its captcha yourself. Wait until Lace shows
   the balance. Do not use a shielded or DUST address at the faucet.
3. In Lace, select **Generate tDUST**, review and confirm the registration, and
   wait for the tDUST tank to accrue enough transaction capacity. Holding
   tNIGHT alone does not produce tDUST before registration.
4. From WSL, start the local proof server 8.1.3 on `127.0.0.1:6300`, run
   `npm run compile:full`, then `npm run dev:preview` in `midnight/`. Open
   `http://localhost:5188/preview/` in the browser profile containing Lace.
   The page must report a detected Midnight wallet. Choose Lace and approve
   its Preview connection in the extension. The wallet signs and pays fees;
   the page never asks for a seed. Never reuse the disposable `undeployed`
   genesis seed from the local integration test on Preview.
5. Before deployment, rerun `npm ci`, `npm test`, `npm run compile:full`,
   `npm run test:proof`, and `npm run verification:manifest` in WSL. Record the
   verifier-key and bZKIR fingerprints. The [support matrix](https://docs.midnight.network/relnotes/support-matrix)
   currently pins Compact compiler 0.31.1, runtime 0.16.0, Midnight.js 4.1.1,
   wallet SDK 1.2.0, and proof server 8.1.3 for Preview; recheck it on the day
   of deployment. Do not silently upgrade to a ledger-9 compiler.
6. On the local Preview page, enter a local private-state storage password,
   deploy the exact v4 contract, and approve the transaction in Lace. Record
   the contract address, deployment transaction, and artifact fingerprints in
   a trusted FuelOS deployment registry. The official Preview RPC and indexer
   endpoints are listed in the [environment reference](https://docs.midnight.network/relnotes/network).
   The deployment must be signed and submitted by the funded wallet owner.
   The page's A/MATCHED button is a demo call. For a real closed shift, start
   the migrated FuelOS backend and frontend, generate its proof, and use
   **Preview ağına gönder** in the shift's ZK modal. Lace signs the proved
   transaction; the backend records the pending ID and verifies the eventual
   receipt. Reopening the popup resumes a pending transaction.
   If Lace explicitly rejects submission and the popup closes before the same
   transaction is retried, the pending ID remains locked. An operator must
   inspect that ID on Preview and perform a controlled recovery; never clear
   it solely because the wallet UI reported an error or the indexer is late.
7. Only after a real reconciliation call finalizes, create its public evidence,
   source/manager signatures, and run the independent read-only verifier in
   [VERIFICATION.md](VERIFICATION.md). Keep backend status `proved` until
   receipt attribution, source authenticity, and finality policy are complete.

The Preview deploy and demo A/MATCHED transactions finalized successfully and
were checked against the Preview indexer. They do not establish that a real
FuelOS shift's private inputs came from the backend database. Keep backend
status `proved` until the independent source-authentication workflow is live.
