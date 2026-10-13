# Reconciliation verification boundary

FuelOS generates a real proof locally with the pinned Compact 0.31.1 artifacts
and proof server 8.1.3. `check()` checks circuit constraints and `prove()`
returns nonempty binary proof bytes. This alone is **not** a finalized Midnight
transaction and must remain `proved` in the backend.

The v4 circuit keeps all five integer-kuruş financial amounts and a random
32-byte nonce private. It discloses the reconciliation class, tolerance,
shift-context digest, and a salted `persistentHash` commitment to the five
amounts. Exact amounts and difference are not disclosed. The backend stores
the public commitment, private nonce, and a separate private proof-time source snapshot hash.
The hash detects later database drift; it does not prove to an outside party
that the private witness came from that database.

`verifyFinalizedReconciliation()` uses the official Midnight.js public-data
provider and the indexer's transaction-offset `contractAction` query. It
requires a successful finalized transaction that calls `reconcile` at the
trusted contract address, then compares that transaction's contract state with
the state immediately before it. The four public values must first appear in
the target transaction's state, even when another call lands in the same block.
A receipt and matching map entry do not, by themselves, authenticate FuelOS
source rows. Do not promote a shift to `verified` based solely on this helper.

`verifyPublicReconciliationEvidence()` adds two Ed25519 approvals over the same
canonical public attestation: one by an independent FuelOS source service and
one by a station manager. The attestation includes network, trusted contract
address, context digest, salted financial commitment, private source snapshot
hash, public class and tolerance, verifier-key fingerprint, and statement
version. The verifier receives the two trusted public keys and contract address
from its own registry, not from the submitted evidence. Each signer must verify
the source snapshot and its relationship to the private witness as part of its
own controlled workflow. The private nonce must be available to the trusted
source signer but never included in public evidence. These signing services and their key custody are not
deployed in this PoC; therefore no production source-authenticity claim is made.

For a read-only public verification handoff, full-compile the contract and run:

```sh
npm run compile:full
npm run verify:public -- public-evidence.json source-public.pem manager-public.pem \
  TRUSTED_CONTRACT_ADDRESS \
  https://indexer.preview.midnight.network/api/v4/graphql \
  wss://indexer.preview.midnight.network/api/v4/graphql/ws
```

The [official environment reference](https://docs.midnight.network/relnotes/network)
provides the Preview host, and the [Indexer API reference](https://docs.midnight.network/api-reference/midnight-indexer)
specifies the `/api/v4/graphql/ws` WebSocket path and `graphql-transport-ws`
subprotocol. The command reads only
public evidence and public keys; it never needs private amounts, nonce, wallet
seed, or a proof server. The `public-evidence.json` shape has `txId`,
`attestation`, and `signatures` with base64 `source` and `manager` signatures.
The contract address argument is a locally trusted registry value. The command
compares the signed verifier-key SHA-256 with its own compiled artifact, then
checks that the deployed contract state contains that exact verifier key, and
prints a public receipt only on success. A successful result still depends on
the trustworthiness of the indexer and source/manager signing process.

The local `npm run test:ledger` test uses an isolated disposable wallet/network.
The transaction-offset check also passed on Preview for the public demo
transaction recorded in [deployment.preview.json](preview/deployment.preview.json).
Run `npm run inspect:preview -- <tx-id> <context-digest>` to repeat that
read-only inspection. It confirms transaction success, newly written public
class/tolerance/commitment, and that the deployed verifier key matches the
locally compiled artifact. It does **not** authenticate FuelOS database rows.
Before any backend status can become `verified`, independently operated source
and manager signers must approve a real shift snapshot, its receipt must be
bound to that shift, and an indexer/finality policy must be defined. Do not
reuse v3 proof rows: they have a different statement version.

Official references: [Midnight.js API](https://docs.midnight.network/api-reference/midnight-js),
[deploy/operate guide](https://docs.midnight.network/guides/deploy-and-operate),
[compatibility matrix](https://docs.midnight.network/relnotes/support-matrix),
[Preview endpoints](https://docs.midnight.network/relnotes/network).
