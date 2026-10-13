import { ledger, ReconciliationClass } from '../managed/reconciliation/contract/index.js';
import { verifyContractState } from '@midnight-ntwrk/midnight-js-contracts';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { ARTIFACT_ROOT, CIRCUIT_ID, verificationArtifactManifest } from './compiled-contract.js';
import { queryReconciliationTransition, singleReconcileCall } from './indexer-transaction-state.js';

const INDEXER = 'https://indexer.preview.midnight.network/api/v4/graphql';
const [txId, contextHex] = process.argv.slice(2);

if (!txId || !/^[0-9a-f]{66}$/i.test(txId) || !contextHex || !/^[0-9a-f]{64}$/i.test(contextHex)) {
  process.stderr.write('Usage: npm run inspect:preview -- <66-hex-tx-id> <64-hex-context-digest>\n');
  process.exitCode = 2;
} else {
  try {
    const body = JSON.stringify({
      query: `query PreviewTx($id: HexEncoded!) {
        transactions(offset: {identifier: $id}) {
          hash block {height hash}
          contractActions {
            __typename
            ... on ContractCall {
              address entryPoint
              deploy { transaction {hash block {height hash} ... on RegularTransaction {identifiers transactionResult {status}}} }
            }
          }
          ... on RegularTransaction {identifiers transactionResult {status}}
        }
      }`,
      variables: { id: txId },
    });
    const response = await fetch(INDEXER, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    if (!response.ok) throw new Error(`Preview indexer HTTP ${response.status}`);
    const payload = await response.json() as {
      errors?: unknown[];
      data?: { transactions: Array<{
        hash: string;
        block: { height: number; hash: string };
        identifiers?: string[];
        transactionResult?: { status: string };
        contractActions: Array<{
          __typename: string; address?: string; entryPoint?: string;
          deploy?: { transaction: {
            hash: string; block: { height: number; hash: string };
            identifiers?: string[]; transactionResult?: { status: string };
          } };
        }>;
      }> };
    };
    if (payload.errors?.length || !payload.data) throw new Error('Preview indexer GraphQL query failed');
    const tx = payload.data.transactions.find((item) => item.identifiers?.some((id) => id.toLowerCase() === txId.toLowerCase()));
    if (!tx || tx.transactionResult?.status !== 'SUCCESS') throw new Error('Target transaction is absent or not successful');
    const call = singleReconcileCall(tx.contractActions);
    if (!call) {
      throw new Error('Expected exactly one reconcile contract action in transaction');
    }
    const contractAddress = call.address!;
    const deployTx = call.deploy?.transaction;
    if (!deployTx || deployTx.transactionResult?.status !== 'SUCCESS' || !deployTx.identifiers?.length) {
      throw new Error('Successful contract deployment could not be located');
    }
    const transition = await queryReconciliationTransition(INDEXER, contractAddress, txId, tx.block.height, tx.block.hash);
    if (!transition?.before) throw new Error('Could not attribute complete before/after contract state to this transaction');
    const zkConfig = new NodeZkConfigProvider<typeof CIRCUIT_ID>(ARTIFACT_ROOT);
    const verifierKey = await zkConfig.getVerifierKey(CIRCUIT_ID);
    verifyContractState([[CIRCUIT_ID, verifierKey]], transition.before);
    verifyContractState([[CIRCUIT_ID, verifierKey]], transition.after);
    const artifact = await verificationArtifactManifest();
    const contextDigest = Uint8Array.from(Buffer.from(contextHex, 'hex'));
    const before = ledger(transition.before.data);
    const after = ledger(transition.after.data);
    if (before.reconciliationByContext.member(contextDigest)
      || !after.reconciliationByContext.member(contextDigest)
      || !after.toleranceByContext.member(contextDigest)
      || !after.financialCommitmentByContext.member(contextDigest)) {
      throw new Error('Public reconciliation record did not first appear in this transaction');
    }
    const classValue = after.reconciliationByContext.lookup(contextDigest);
    const publicClass = ReconciliationClass[classValue];
    if (!publicClass) throw new Error('Unknown reconciliation class in ledger');
    const commitment = after.financialCommitmentByContext.lookup(contextDigest);
    if (commitment.length !== 32) throw new Error('Invalid financial commitment length');
    const headResponse = await fetch(INDEXER, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ block { height } }' }),
    });
    if (!headResponse.ok) throw new Error('Preview indexer head query failed');
    const headPayload = await headResponse.json() as { data?: { block?: { height: number } }; errors?: unknown[] };
    const indexedHeadHeight = headPayload.data?.block?.height;
    if (headPayload.errors?.length || !Number.isSafeInteger(indexedHeadHeight)
      || indexedHeadHeight! < tx.block.height) throw new Error('Invalid Preview indexed head');
    process.stdout.write(JSON.stringify({
      network: 'preview', transactionAttributed: true, txId, txHash: tx.hash,
      blockHeight: tx.block.height, blockHash: tx.block.hash, contractAddress,
      indexedHeadHeight, confirmations: indexedHeadHeight! - tx.block.height + 1,
      deploymentTxId: deployTx.identifiers[0], deploymentTxHash: deployTx.hash,
      deploymentBlockHeight: deployTx.block.height, deploymentBlockHash: deployTx.block.hash,
      contextDigest: contextHex.toLowerCase(), publicClass,
      toleranceKurus: after.toleranceByContext.lookup(contextDigest).toString(),
      financialCommitment: Buffer.from(commitment).toString('hex'),
      verifierKeyMatchesLocalArtifact: true, verifierKeySha256: artifact.verifierKeySha256,
      sourceAuthenticated: false,
    }) + '\n');
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
