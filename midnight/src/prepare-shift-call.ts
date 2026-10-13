import { createUnprovenCallTxFromInitialStates, getPublicStates, verifyContractState } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { parseCoinPublicKeyToHex, parseEncPublicKeyToHex } from '@midnight-ntwrk/midnight-js-utils';
import { WebSocket } from 'ws';
import { ARTIFACT_ROOT, CIRCUIT_ID, compiledReconciliationContract } from './compiled-contract.js';
import { computeFinancialCommitment } from './financial-commitment.js';
import { parseShiftContextDigest } from './shift-commitment.js';
import { ReconciliationClass, type ReconciliationPrivateState } from './types.js';

const INDEXER = 'https://indexer.preview.midnight.network/api/v4/graphql';
const INDEXER_WS = 'wss://indexer.preview.midnight.network/api/v4/graphql/ws';
const PROOF_SERVER = 'http://127.0.0.1:6300';
const hex64 = /^[0-9a-f]{64}$/;
const amount = (value: string): bigint => {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error('Invalid integer amount');
  const parsed = BigInt(value);
  if (parsed > (1n << 64n) - 1n) throw new Error('Amount exceeds Compact Uint<64>');
  return parsed;
};
const hex = (value: Uint8Array): string => Buffer.from(value).toString('hex');

/** Private input. Never log, persist as a file, or return this object over HTTP. */
export interface ShiftCallRequest {
  readonly totalSales: string;
  readonly pos: string;
  readonly cash: string;
  readonly eft: string;
  readonly credit: string;
  readonly nonceHex: string;
  readonly publicClass: 'MATCHED' | 'SHORTAGE' | 'SURPLUS';
  readonly toleranceKurus: string;
  readonly contextDigest: string;
  readonly financialCommitment: string;
  readonly contractAddress: string;
  readonly verifierKeySha256: string;
  readonly shieldedCoinPublicKey: string;
  readonly shieldedEncryptionPublicKey: string;
}

/** Returns only a proven, unbalanced ledger transaction and public identifiers. */
export async function prepareShiftCall(request: ShiftCallRequest) {
  if (!hex64.test(request.nonceHex) || !hex64.test(request.financialCommitment)
    || !hex64.test(request.verifierKeySha256)
    || !hex64.test(request.contractAddress)) throw new Error('Invalid public identifier or nonce');
  if (!/^(0|[1-9][0-9]*)$/.test(request.toleranceKurus)) throw new Error('Invalid tolerance');
  const tolerance = BigInt(request.toleranceKurus);
  if (tolerance > 100000n) throw new Error('Tolerance exceeds circuit range');
  if (!['MATCHED', 'SHORTAGE', 'SURPLUS'].includes(request.publicClass)) {
    throw new Error('Unknown reconciliation class');
  }
  const claim = ReconciliationClass[request.publicClass];
  const input: ReconciliationPrivateState = {
    total_sales: amount(request.totalSales), pos: amount(request.pos),
    cash: amount(request.cash), eft: amount(request.eft), credit: amount(request.credit),
    nonce: Uint8Array.from(Buffer.from(request.nonceHex, 'hex')),
  };
  const context = parseShiftContextDigest(request.contextDigest);
  const commitment = computeFinancialCommitment(input, input.nonce);
  if (hex(commitment) !== request.financialCommitment) throw new Error('Financial commitment mismatch');

  setNetworkId('preview');
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
  const zkConfig = new NodeZkConfigProvider<typeof CIRCUIT_ID>(ARTIFACT_ROOT);
  const verifierKey = await zkConfig.getVerifierKey(CIRCUIT_ID);
  if (createHash('sha256').update(verifierKey).digest('hex') !== request.verifierKeySha256) {
    throw new Error('Trusted verifier fingerprint mismatch');
  }
  const publicData = indexerPublicDataProvider(INDEXER, INDEXER_WS);
  const states = await getPublicStates(publicData, request.contractAddress);
  verifyContractState([[CIRCUIT_ID, verifierKey]], states.contractState);
  const coinPublicKey = parseCoinPublicKeyToHex(request.shieldedCoinPublicKey, 'preview');
  const encryptionPublicKey = parseEncPublicKeyToHex(request.shieldedEncryptionPublicKey, 'preview');
  const unsubmitted = await createUnprovenCallTxFromInitialStates(zkConfig, {
    compiledContract: compiledReconciliationContract(),
    circuitId: CIRCUIT_ID,
    contractAddress: request.contractAddress,
    args: [claim, tolerance, context, commitment],
    coinPublicKey,
    initialContractState: states.contractState,
    initialZswapChainState: states.zswapChainState,
    ledgerParameters: states.ledgerParameters,
    initialPrivateState: input,
  }, encryptionPublicKey);
  const proofProvider = httpClientProofProvider(PROOF_SERVER, zkConfig);
  const unbound = await proofProvider.proveTx(unsubmitted.private.unprovenTx, { timeout: 300_000 });
  const txHex = hex(unbound.serialize());
  if (!txHex) throw new Error('Empty proven transaction');
  return { txHex, contractAddress: request.contractAddress, publicClass: request.publicClass,
    toleranceKurus: request.toleranceKurus, contextDigest: request.contextDigest,
    financialCommitment: request.financialCommitment };
}
import { createHash } from 'node:crypto';
