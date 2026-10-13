import { ErrorCodes, type APIError, type ConnectedAPI, type InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { Transaction, type SignatureEnabled, type Proof, type PreBinding, type FinalizedTransaction } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { Contract } from '../managed/reconciliation/contract/index.js';
import { computeFinancialCommitment } from '../src/financial-commitment.js';
import { ReconciliationClass, type ReconciliationPrivateState } from '../src/types.js';
import { witnesses } from '../src/witnesses.js';
import { LaceTransactionProvider } from './wallet.js';

declare global {
  interface Window { midnight?: Record<string, InitialAPI> }
}

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const walletSelect = byId<HTMLSelectElement>('wallet');
const status = byId<HTMLElement>('wallet-status');
const result = byId<HTMLElement>('result');
const addressInput = byId<HTMLInputElement>('address');
const vectorSelect = byId<HTMLSelectElement>('vector');
const passwordInput = byId<HTMLInputElement>('password');
const connectButton = byId<HTMLButtonElement>('connect');
const deployButton = byId<HTMLButtonElement>('deploy');
const reconcileButton = byId<HTMLButtonElement>('reconcile');
const shiftSection = byId<HTMLElement>('real-shift');
const shiftLabel = byId<HTMLElement>('shift-label');
const shiftResult = byId<HTMLElement>('shift-result');
const submitShiftButton = byId<HTMLButtonElement>('submit-shift');
const shiftId = new URLSearchParams(location.search).get('shift');
const pendingKey = shiftId ? `fuelos-preview-pending:${shiftId}` : '';
let fuelosToken: string | undefined;
if (shiftId && /^[0-9a-f-]{36}$/i.test(shiftId)) {
  shiftSection.hidden = false;
  shiftLabel.textContent = `Vardiya: ${shiftId}`;
  window.addEventListener('message', (event) => {
    if (event.source !== window.opener
      || !['http://localhost:5173', 'http://127.0.0.1:5173'].includes(event.origin)
      || event.data?.type !== 'fuelos-preview-auth'
      || event.data?.shiftId !== shiftId || typeof event.data?.token !== 'string') return;
    fuelosToken = event.data.token;
    shiftResult.textContent = 'FuelOS yetkisi alındı; Lace bağlantısını tamamlayın.';
    submitShiftButton.disabled = !connected;
  });
  const signal = window.setInterval(() => {
    if (fuelosToken || !window.opener) { window.clearInterval(signal); return; }
    window.opener.postMessage({ type: 'fuelos-preview-ready', shiftId }, '*');
  }, 1000);
}
function refreshWallets(): [string, InitialAPI][] {
  const entries = Object.entries(window.midnight ?? {}) as [string, InitialAPI][];
  const previous = walletSelect.value;
  walletSelect.replaceChildren();
  for (const [id, wallet] of entries) {
    const item = document.createElement('option');
    item.value = id;
    item.textContent = `${wallet.name} (${wallet.apiVersion})`;
    walletSelect.append(item);
  }
  if (entries.some(([id]) => id === previous)) walletSelect.value = previous;
  return entries;
}
const walletEntries = refreshWallets();
if (!walletEntries.length) status.textContent = 'Bu tarayıcıda Midnight/Lace eklentisi bulunamadı.';
else status.textContent = `${walletEntries.length} Midnight cüzdanı bulundu; Lace bağla düğmesine basın.`;
result.textContent = 'Uygulama hazır.';
connectButton.disabled = false;

let connected: ConnectedAPI | undefined;
let accountId: string | undefined;
let verifierReadError: string | undefined;
let rejectedSubmission: { txId: string; tx: FinalizedTransaction } | undefined;

type DemoVector = 'A' | 'B' | 'E';
const demoAmounts = {
  A: { total_sales: 100000n, pos: 40000n, cash: 30000n, eft: 20000n, credit: 10000n },
  B: { total_sales: 250000n, pos: 25000n, cash: 100000n, eft: 75000n, credit: 25000n },
  E: { total_sales: 100000n, pos: 40000n, cash: 40000n, eft: 20000n, credit: 10000n },
} as const;
const demoClaims = {
  A: ReconciliationClass.MATCHED,
  B: ReconciliationClass.SHORTAGE,
  E: ReconciliationClass.SURPLUS,
} as const;

function demoInput(vector: DemoVector): ReconciliationPrivateState {
  return {
    ...demoAmounts[vector],
    nonce: crypto.getRandomValues(new Uint8Array(32)),
  };
}

function compiledContract() {
  type Generated = Contract<ReconciliationPrivateState>;
  const bare = CompiledContract.make<Generated, ReconciliationPrivateState>('fuelos-reconciliation', Contract);
  const witnessed = CompiledContract.withWitnesses<
    Generated, ReconciliationPrivateState,
    { readonly witnesses: typeof witnesses } | { readonly compiledAssetsPath: string }
  >(bare, witnesses);
  return CompiledContract.withCompiledFileAssets<
    Generated, ReconciliationPrivateState, { readonly compiledAssetsPath: string }
  >(witnessed, `${location.origin}/managed/reconciliation`);
}

async function providers() {
  if (!connected || !accountId) throw new Error('Önce Lace bağlanmalı');
  const password = passwordInput.value;
  if (password.length < 16) throw new Error('Yerel özel durum parolası en az 16 karakter olmalı');
  const config = await connected.getConfiguration();
  if (config.networkId !== 'preview' || !config.indexerUri || !config.indexerWsUri) {
    throw new Error('Lace Preview indexer ayarı eksik veya yanlış');
  }
  const artifactRoot = `${location.origin}/managed/reconciliation`;
  const zkConfigProvider = new FetchZkConfigProvider<'reconcile'>(artifactRoot, (input, init) => window.fetch(input, init));
  verifierReadError = undefined;
  const readVerifierKey = zkConfigProvider.getVerifierKey.bind(zkConfigProvider);
  zkConfigProvider.getVerifierKey = async (circuitId) => {
    try { return await readVerifierKey(circuitId); }
    catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      verifierReadError = `${circuitId}: ${detail}`;
      throw error;
    }
  };
  try {
    await zkConfigProvider.getVerifierKey('reconcile');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Yerel verifier key okunamadı (${artifactRoot}/keys/reconcile.verifier): ${detail}`);
  }
  const walletProvider = await LaceTransactionProvider.create(connected);
  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'fuelos-preview-state',
      signingKeyStoreName: 'fuelos-preview-signing',
      privateStoragePasswordProvider: () => password,
      accountId,
    }),
    publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri,
      WebSocket as unknown as NonNullable<Parameters<typeof indexerPublicDataProvider>[2]>),
    zkConfigProvider,
    proofProvider: httpClientProofProvider('http://127.0.0.1:6300', zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };
}

async function run(action: () => Promise<void>) {
  result.textContent = 'İşlem sürüyor; Lace onayını kontrol edin…';
  deployButton.disabled = reconcileButton.disabled = submitShiftButton.disabled = true;
  try { await action(); }
  catch (error) {
    const message = error instanceof Error ? error.message : 'İşlem başarısız';
    result.textContent = message.includes('Failed to read verifier key') && verifierReadError
      ? `${message}; neden: ${verifierReadError}` : message;
  }
  finally {
    deployButton.disabled = !connected;
    reconcileButton.disabled = !connected;
    submitShiftButton.disabled = !connected || !fuelosToken;
  }
}

connectButton.onclick = () => run(async () => {
  const selected = refreshWallets().find(([id]) => id === walletSelect.value)?.[1];
  if (!selected) throw new Error('Lace bu tarayıcı profilinde bulunamadı; uzantıyı kontrol edip sayfayı yenileyin');
  setNetworkId('preview');
  connected = await selected.connect('preview');
  const connection = await connected.getConnectionStatus();
  if (connection.status !== 'connected' || connection.networkId !== 'preview') throw new Error('Preview bağlantısı kurulamadı');
  accountId = (await connected.getUnshieldedAddress()).unshieldedAddress;
  const dust = await connected.getDustBalance();
  status.textContent = `Preview bağlı: ${accountId}; tDUST ${dust.balance.toString()}`;
  result.textContent = 'Bağlandı';
  submitShiftButton.disabled = !fuelosToken;
});

const API = 'http://127.0.0.1:8000';
async function fuelosPost(path: string, body: object) {
  if (!fuelosToken) throw new Error('FuelOS yetkisi alınmadı; vardiya penceresini uygulamadan açın');
  const response = await fetch(`${API}/api/shifts/${shiftId}/zk-preview/${path}`, {
    method: 'POST', cache: 'no-store',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${fuelosToken}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`FuelOS ${path} başarısız (HTTP ${response.status})`);
  return response.json();
}

async function fuelosStatus() {
  if (!fuelosToken) throw new Error('FuelOS yetkisi alınmadı');
  const response = await fetch(`${API}/api/shifts/${shiftId}/zk-preview/status`, {
    cache: 'no-store', headers: { authorization: `Bearer ${fuelosToken}` },
  });
  if (!response.ok) throw new Error(`FuelOS durum sorgusu başarısız (HTTP ${response.status})`);
  return response.json() as Promise<{
    ledgerConfirmed: boolean; txId: string | null; blockHeight?: number;
    pendingTxId: string | null; handoffId: string | null;
  }>;
}

submitShiftButton.onclick = () => run(async () => {
  if (!shiftId || !connected) throw new Error('FuelOS vardiyası veya Lace bağlantısı eksik');
  const serverStatus = await fuelosStatus();
  if (serverStatus.ledgerConfirmed) {
    localStorage.removeItem(pendingKey);
    shiftResult.textContent = `Vardiya işlemi zincirde doğrulandı: ${serverStatus.txId}; blok ${serverStatus.blockHeight}. Kaynak imzaları bekleniyor.`;
    return;
  }
  let pending = localStorage.getItem(pendingKey);
  if (serverStatus.pendingTxId && serverStatus.handoffId) {
    pending = JSON.stringify({ handoffId: serverStatus.handoffId, txId: serverStatus.pendingTxId });
    localStorage.setItem(pendingKey, pending);
  } else if (pending) {
    localStorage.removeItem(pendingKey);
    pending = null;
  }
  let receipt: { handoffId: string; txId: string };
  if (pending) {
    receipt = JSON.parse(pending) as typeof receipt;
    if (rejectedSubmission?.txId === receipt.txId) {
      const wallet = await LaceTransactionProvider.create(connected);
      try {
        await wallet.submitTx(rejectedSubmission.tx);
        rejectedSubmission = undefined;
      } catch (error) {
        const walletError = error as Partial<APIError>;
        if (walletError.type === 'DAppConnectorAPIError'
          && (walletError.code === ErrorCodes.Rejected || walletError.code === ErrorCodes.PermissionRejected)) {
          throw new Error('Lace işlemi yeniden reddedildi; aynı işlemi tekrar onaylayabilirsiniz.');
        }
        rejectedSubmission = undefined;
        // The wallet may have submitted before losing its response. Poll the
        // reserved ID instead of preparing a second transaction.
      }
    }
  } else {
    shiftResult.textContent = 'Özel girdiler FuelOS sunucusunda kanıtlanıyor…';
    const addresses = await connected.getShieldedAddresses();
    const prepared = await fuelosPost('prepare', {
      shielded_coin_public_key: addresses.shieldedCoinPublicKey,
      shielded_encryption_public_key: addresses.shieldedEncryptionPublicKey,
    }) as { handoffId: string; txHex: string; contractAddress: string };
    const raw = Uint8Array.from(prepared.txHex.match(/.{2}/g)!.map((pair) => Number.parseInt(pair, 16)));
    const unbound = Transaction.deserialize<SignatureEnabled, Proof, PreBinding>('signature', 'proof', 'pre-binding', raw);
    shiftResult.textContent = 'Kanıt hazır; Lace işlem onayını bekliyor…';
    const wallet = await LaceTransactionProvider.create(connected);
    const finalized = await wallet.balanceTx(unbound);
    const txId = finalized.identifiers()[0];
    if (!txId) throw new Error('Lace işlemi için tx kimliği üretilemedi');
    await fuelosPost('intent', { handoff_id: prepared.handoffId, tx_id: txId });
    // Record the deterministic identifier before submission: a successful
    // network send followed by a lost browser response must remain recoverable.
    receipt = { handoffId: prepared.handoffId, txId };
    localStorage.setItem(pendingKey, JSON.stringify(receipt));
    try {
      await wallet.submitTx(finalized);
    } catch (error) {
      const walletError = error as Partial<APIError>;
      if (walletError.type === 'DAppConnectorAPIError'
        && (walletError.code === ErrorCodes.Rejected || walletError.code === ErrorCodes.PermissionRejected)) {
        rejectedSubmission = { txId, tx: finalized };
        throw new Error(`Lace işlemi reddedildi. Aynı işlemi yeniden onaylamak için tekrar tıklayın; kimlik ${txId} korunuyor.`);
      }
      throw new Error(`Lace gönderiminin sonucu belirsiz. İşlem kimliği ${txId}; tekrar tıklayınca zincir kontrol edilir.`);
    }
  }
  for (let attempt = 0; attempt < 36; attempt++) {
    shiftResult.textContent = `Preview işlemi doğrulanıyor: ${receipt.txId}`;
    try {
      const confirmed = await fuelosPost('receipt', {
        handoff_id: receipt.handoffId, tx_id: receipt.txId,
      }) as { ledgerConfirmed: boolean; blockHeight: number };
      if (confirmed.ledgerConfirmed) {
        localStorage.removeItem(pendingKey);
        shiftResult.textContent = `Vardiya işlemi zincirde doğrulandı: ${receipt.txId}; blok ${confirmed.blockHeight}. Kaynak imzaları bekleniyor.`;
        return;
      }
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('HTTP 409')) throw error;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 10_000));
  }
  throw new Error(`İşlem gönderildi; doğrulama bekliyor. Yeniden denemek için düğmeye basın. Tx: ${receipt.txId}`);
});

deployButton.onclick = () => run(async () => {
  const p = await providers();
  const deployed = await deployContract(p, {
    compiledContract: compiledContract(),
    privateStateId: 'fuelosReconciliationState',
    initialPrivateState: demoInput('A'),
  });
  addressInput.value = deployed.deployTxData.public.contractAddress;
  result.textContent = `Deploy kesinleşti: adres ${addressInput.value}; tx ${deployed.deployTxData.public.txId}; blok ${deployed.deployTxData.public.blockHeight}`;
});

reconcileButton.onclick = () => run(async () => {
  const address = addressInput.value.trim();
  if (!/^[0-9a-f]{64}$/i.test(address)) throw new Error('Geçerli 64 haneli sözleşme adresi girin');
  const p = await providers();
  const vector = vectorSelect.value as DemoVector;
  if (!(vector in demoAmounts)) throw new Error('Geçersiz demo vektörü');
  const input = demoInput(vector);
  const found = await findDeployedContract(p, {
    compiledContract: compiledContract(), contractAddress: address,
    privateStateId: 'fuelosReconciliationState', initialPrivateState: input,
  });
  const contextDigest = crypto.getRandomValues(new Uint8Array(32));
  const financialCommitment = computeFinancialCommitment(input, input.nonce);
  const claim = demoClaims[vector];
  const call = await found.callTx.reconcile(claim, 100n, contextDigest, financialCommitment);
  result.textContent = `${vector}/${ReconciliationClass[claim]} kesinleşti: tx ${call.public.txId}; blok ${call.public.blockHeight}; bağlam ${Array.from(contextDigest, (b) => b.toString(16).padStart(2, '0')).join('')}; taahhüt ${Array.from(financialCommitment, (b) => b.toString(16).padStart(2, '0')).join('')}`;
});
