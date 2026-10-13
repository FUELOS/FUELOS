import { ContractState } from '@midnight-ntwrk/midnight-js-protocol/onchain-runtime';
import { fromHex } from '@midnight-ntwrk/midnight-js-utils';

type Action = { __typename: string; address: string; state: string; transaction: { hash: string; identifiers?: string[] } };
type GraphQLResult<T> = { data?: T; errors?: unknown[] };

/** Do not ignore deploy/update actions when attributing one reconciliation call. */
export function singleReconcileCall<T extends { __typename: string; address?: string; entryPoint?: string }>(
  actions: readonly T[],
): T | null {
  const action = actions.length === 1 ? actions[0] : undefined;
  return action?.__typename === 'ContractCall' && action.entryPoint === 'reconcile'
    && typeof action.address === 'string' && /^[0-9a-f]{64}$/i.test(action.address)
    ? action : null;
}

async function query<T>(url: string, document: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: document, variables }),
  });
  if (!response.ok) throw new Error(`Indexer HTTP ${response.status}`);
  const body = await response.json() as GraphQLResult<T>;
  if (body.errors?.length || !body.data) throw new Error('Indexer GraphQL query failed');
  return body.data;
}

const BLOCK_QUERY = `query ReconciliationBlock($height: Int!) {
  block(offset: {height: $height}) { hash height transactions { hash ... on RegularTransaction { identifiers } } }
}`;
const ACTION_QUERY = `query ReconciliationAction($address: HexEncoded!, $offset: ContractActionOffset!) {
  contractAction(address: $address, offset: $offset) {
    __typename
    ... on ContractCall { address state transaction { hash ... on RegularTransaction { identifiers } } }
    ... on ContractDeploy { address state transaction { hash ... on RegularTransaction { identifiers } } }
    ... on ContractUpdate { address state transaction { hash ... on RegularTransaction { identifiers } } }
  }
}`;
const CONTRACT_QUERY = `query ReconciliationContract($address: HexEncoded!, $height: Int!) {
  contract(address: $address, offset: {height: $height}) { state }
}`;

/** Read the state immediately before and after a specific transaction, not merely its block. */
export async function queryReconciliationTransition(
  indexerHttp: string,
  contractAddress: string,
  txId: string,
  blockHeight: number,
  blockHash: string,
): Promise<{ before: ContractState | null; after: ContractState } | null> {
  if (!Number.isSafeInteger(blockHeight) || blockHeight < 1) return null;
  const { block } = await query<{ block: { hash: string; height: number; transactions: { hash: string; identifiers?: string[] }[] } | null }>(
    indexerHttp, BLOCK_QUERY, { height: blockHeight },
  );
  if (!block || block.height !== blockHeight || block.hash.toLowerCase() !== blockHash.toLowerCase()) return null;
  const position = block.transactions.findIndex((tx) => tx.identifiers?.some((id) => id.toLowerCase() === txId.toLowerCase()));
  if (position < 0) return null;

  const atAction = async (offset: Record<string, unknown>): Promise<Action | null> => {
    const { contractAction } = await query<{ contractAction: Action | null }>(
      indexerHttp, ACTION_QUERY, { address: contractAddress, offset },
    );
    return contractAction;
  };
  const target = await atAction({ transactionOffset: { identifier: txId } });
  if (!target || target.__typename !== 'ContractCall'
    || target.address.toLowerCase() !== contractAddress.toLowerCase()
    || target.transaction.hash.toLowerCase() !== block.transactions[position].hash.toLowerCase()
    || !target.transaction.identifiers?.some((id) => id.toLowerCase() === txId.toLowerCase())) return null;

  const decode = (state: string): ContractState => ContractState.deserialize(fromHex(state));
  // The preceding transaction (or block) may not touch this contract. Search
  // backward within the same block, then read the contract's block-end state.
  for (let index = position - 1; index >= 0; index--) {
    const preceding = block.transactions[index];
    const action = await atAction({ transactionOffset: { hash: preceding.hash } });
    if (action && action.address.toLowerCase() === contractAddress.toLowerCase()
      && action.transaction.hash.toLowerCase() === preceding.hash.toLowerCase()) {
      return { before: decode(action.state), after: decode(target.state) };
    }
  }
  const { contract } = await query<{ contract: { state: string } | null }>(
    indexerHttp, CONTRACT_QUERY, { address: contractAddress, height: blockHeight - 1 },
  );
  return { before: contract ? decode(contract.state) : null, after: decode(target.state) };
}
