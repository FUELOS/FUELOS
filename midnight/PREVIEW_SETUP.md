# Preview wallet and deployment handoff

FuelOS has no funded Preview wallet or registered v4 contract address yet.
The following are user-controlled steps; do not send a seed phrase or private
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
4. The deployer must use a signing path they control (wallet connector or an
   independently protected Wallet SDK setup). There is no Preview deployment
   CLI in this repository that accepts a Lace seed. Never reuse the disposable
   `undeployed` genesis seed from the local integration test on Preview.
5. Before deployment, rerun `npm ci`, `npm test`, `npm run compile:full`,
   `npm run test:proof`, and `npm run verification:manifest` in WSL. Record the
   verifier-key and bZKIR fingerprints. The [support matrix](https://docs.midnight.network/relnotes/support-matrix)
   currently pins Compact compiler 0.31.1, runtime 0.16.0, Midnight.js 4.1.1,
   wallet SDK 1.2.0, and proof server 8.1.3 for Preview; recheck it on the day
   of deployment. Do not silently upgrade to a ledger-9 compiler.
6. Deploy the exact v4 contract to Preview, register its address as a trusted
   FuelOS deployment, and retain the deployment transaction and artifact
   fingerprints. The official Preview RPC and indexer endpoints are listed in
   the [environment reference](https://docs.midnight.network/relnotes/network).
   The deployment must be signed and submitted by the funded wallet owner.
7. Only after a real reconciliation call finalizes, create its public evidence,
   source/manager signatures, and run the independent read-only verifier in
   [VERIFICATION.md](VERIFICATION.md). Keep backend status `proved` until
   receipt attribution, source authenticity, and finality policy are complete.

Neither a wallet, faucet request, nor Preview transaction was created as part
of this code change. The user must complete steps 1–3 directly; a collaborator
can then implement the controlled signing/deployment flow without receiving
the recovery phrase.
