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
provider. It requires a successful finalized transaction that calls `reconcile`
at the trusted contract address and a new historical ledger-map entry in its
block matching all four public values. A receipt and a matching map entry do
not, by themselves, authenticate FuelOS source rows. If multiple reconciliations
land in the same block, the current receipt check does not decode call arguments
to uniquely attribute a particular map entry to one transaction. Do not promote
a shift to `verified` based solely on this helper.

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
  TRUSTED_PREVIEW_INDEXER_WEBSOCKET_URL
```

The last URL is supplied explicitly because the [official environment
reference](https://docs.midnight.network/relnotes/network) publishes the Preview
GraphQL HTTP endpoint but not its WebSocket endpoint. Verify that address with
the Preview indexer operator before using this command. The command reads only
public evidence and public keys; it never needs private amounts, nonce, wallet
seed, or a proof server. The `public-evidence.json` shape has `txId`,
`attestation`, and `signatures` with base64 `source` and `manager` signatures.
The contract address argument is a locally trusted registry value. The command
compares the signed verifier-key SHA-256 with its own compiled artifact and
prints a public receipt only on success. A successful result still depends on
the trustworthiness of the indexer and source/manager signing process.

The local `npm run test:ledger` test uses an isolated disposable wallet/network
and does not register a Preview contract. Before any backend status can become
`verified`, deploy and register the exact v4 contract on Preview, complete
independent source and manager signing, bind a specific finalized receipt to a
shift, and define an indexer/finality policy. Do not reuse the v3 artifact or
old proof rows: they have a different statement version.

Official references: [Midnight.js API](https://docs.midnight.network/api-reference/midnight-js),
[deploy/operate guide](https://docs.midnight.network/guides/deploy-and-operate),
[compatibility matrix](https://docs.midnight.network/relnotes/support-matrix),
[Preview endpoints](https://docs.midnight.network/relnotes/network).
