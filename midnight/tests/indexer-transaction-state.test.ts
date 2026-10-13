import { afterEach, describe, expect, it, vi } from 'vitest';
import { createConstructorContext } from '@midnight-ntwrk/compact-runtime';
import { Contract } from '../managed/reconciliation/contract/index.js';
import { queryReconciliationTransition, singleReconcileCall } from '../src/indexer-transaction-state.js';
import { ReconciliationClass, type ReconciliationPrivateState } from '../src/types.js';
import { witnesses } from '../src/witnesses.js';
import { computeFinancialCommitment, withFinancialNonce } from '../src/financial-commitment.js';
import { createCircuitContext, dummyContractAddress } from '@midnight-ntwrk/compact-runtime';
import { ContractState } from '@midnight-ntwrk/midnight-js-protocol/onchain-runtime';
import { vectors } from './vectors.js';

const address = 'ab'.repeat(32);
const firstId = '00' + '11'.repeat(32);
const targetId = '00' + '22'.repeat(32);
const hash = '33'.repeat(32);
const firstHash = '44'.repeat(32);
const targetHash = '55'.repeat(32);

function states() {
  const input = withFinancialNonce(vectors[0].input, new Uint8Array(32).fill(7));
  const contract = new Contract<ReconciliationPrivateState>(witnesses);
  const coin = '00'.repeat(32);
  const before = contract.initialState(createConstructorContext(input, coin)).currentContractState;
  const context = createCircuitContext(dummyContractAddress(), coin, before, input);
  const output = contract.impureCircuits.reconcile(
    context, ReconciliationClass.MATCHED, 100n, new Uint8Array(32).fill(5),
    computeFinancialCommitment(input, input.nonce),
  );
  const after = ContractState.deserialize(before.serialize());
  after.data = output.context.currentQueryContext.state;
  return { before, after };
}

afterEach(() => vi.unstubAllGlobals());

describe('transaction-specific indexer state', () => {
  it('rejects a mixed reconcile/deploy transaction during attribution', () => {
    const call = { __typename: 'ContractCall', address, entryPoint: 'reconcile' };
    expect(singleReconcileCall([call])).toEqual(call);
    expect(singleReconcileCall([call, { __typename: 'ContractDeploy', address }])).toBeNull();
  });
  it('reads the state directly before and after the target transaction', async () => {
    const { before, after } = states();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: { body: string }) => {
      const request = JSON.parse(options.body) as { query: string; variables: { offset?: { transactionOffset?: { identifier?: string; hash?: string } } } };
      const data = request.query.includes('ReconciliationBlock')
        ? { block: { hash, height: 8, transactions: [{ hash: firstHash, identifiers: [firstId] }, { hash: targetHash, identifiers: [targetId] }] } }
        : { contractAction: {
          __typename: 'ContractCall', address,
          transaction: request.variables.offset?.transactionOffset?.identifier
            ? { hash: targetHash, identifiers: [targetId] }
            : { hash: firstHash, identifiers: [firstId] },
          state: Buffer.from(request.variables.offset?.transactionOffset?.identifier === targetId
            ? after.serialize() : before.serialize()).toString('hex'),
        } };
      return { ok: true, json: async () => ({ data }) };
    }));
    const result = await queryReconciliationTransition('https://example.test/graphql', address, targetId, 8, hash);
    expect(Buffer.from(result!.before!.serialize())).toEqual(Buffer.from(before.serialize()));
    expect(Buffer.from(result!.after.serialize())).toEqual(Buffer.from(after.serialize()));
  });

  it('rejects a state inherited from a different transaction in the same block', async () => {
    const { after } = states();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: { body: string }) => {
      const request = JSON.parse(options.body) as { query: string };
      const data = request.query.includes('ReconciliationBlock')
        ? { block: { hash, height: 8, transactions: [{ hash: firstHash, identifiers: [firstId] }, { hash: targetHash, identifiers: [targetId] }] } }
        : { contractAction: { __typename: 'ContractCall', address,
          transaction: { hash: firstHash, identifiers: [firstId] }, state: Buffer.from(after.serialize()).toString('hex') } };
      return { ok: true, json: async () => ({ data }) };
    }));
    expect(await queryReconciliationTransition('https://example.test/graphql', address, targetId, 8, hash)).toBeNull();
  });

  it('uses the previous block-end contract state when no earlier action exists in the block', async () => {
    const { before, after } = states();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: { body: string }) => {
      const request = JSON.parse(options.body) as { query: string };
      const data = request.query.includes('ReconciliationBlock')
        ? { block: { hash, height: 8, transactions: [{ hash: targetHash, identifiers: [targetId] }] } }
        : request.query.includes('ReconciliationContract')
          ? { contract: { state: Buffer.from(before.serialize()).toString('hex') } }
          : { contractAction: { __typename: 'ContractCall', address,
            transaction: { hash: targetHash, identifiers: [targetId] },
            state: Buffer.from(after.serialize()).toString('hex') } };
      return { ok: true, json: async () => ({ data }) };
    }));
    const result = await queryReconciliationTransition('https://example.test/graphql', address, targetId, 8, hash);
    expect(Buffer.from(result!.before!.serialize())).toEqual(Buffer.from(before.serialize()));
    expect(Buffer.from(result!.after.serialize())).toEqual(Buffer.from(after.serialize()));
  });
});
