import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { type CoinPublicKey, type EncPublicKey, type FinalizedTransaction, DustSecretKey, LedgerParameters, ZswapSecretKeys } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { type MidnightProvider, type UnboundTransaction, type WalletProvider } from '@midnight-ntwrk/midnight-js-types';
import { ttlOneHour } from '@midnight-ntwrk/midnight-js-utils';
import { type WalletFacade } from '@midnight-ntwrk/wallet-sdk';
import { FluentWalletBuilder } from '@midnight-ntwrk/testkit-js';
import { firstValueFrom, filter, timeout } from 'rxjs';
import { WebSocket } from 'ws';
import { ARTIFACT_ROOT, CIRCUIT_ID, compiledReconciliationContract } from '../src/compiled-contract.js';
import { matchesCurrentLedgerState } from '../src/ledger-verification.js';
import { computeShiftCommitment, parseShiftContextDigest } from '../src/shift-commitment.js';
import { ReconciliationClass } from '../src/types.js';
import type { ReconciliationPrivateState } from '../src/types.js';

const INDEXER = 'http://127.0.0.1:8088/api/v4/graphql';
const INDEXER_WS = 'ws://127.0.0.1:8088/api/v4/graphql/ws';
const NODE_WS = 'ws://127.0.0.1:9944';
const PROOF_SERVER = 'http://127.0.0.1:6300';
// This public genesis seed only has value on a disposable local `undeployed` chain.
const LOCAL_GENESIS_SEED = '0'.repeat(63) + '1';

class LocalWalletProvider implements WalletProvider, MidnightProvider {
  constructor(
    private readonly wallet: WalletFacade,
    private readonly shieldedSecretKeys: ZswapSecretKeys,
    private readonly dustSecretKey: DustSecretKey,
  ) {}

  getCoinPublicKey(): CoinPublicKey { return this.shieldedSecretKeys.coinPublicKey; }
  getEncryptionPublicKey(): EncPublicKey { return this.shieldedSecretKeys.encryptionPublicKey; }

  async balanceTx(tx: UnboundTransaction, ttl: Date = ttlOneHour()): Promise<FinalizedTransaction> {
    const recipe = await this.wallet.balanceUnboundTransaction(
      tx,
      { shieldedSecretKeys: this.shieldedSecretKeys, dustSecretKey: this.dustSecretKey },
      { ttl },
    );
    return this.wallet.finalizeRecipe(recipe);
  }

  submitTx(tx: FinalizedTransaction): Promise<string> { return this.wallet.submitTransaction(tx); }
}

describe('local Midnight ledger verification (opt-in)', () => {
  let wallet: WalletFacade | undefined;
  let storageDir: string | undefined;
  const originalCwd = process.cwd();
  afterAll(async () => {
    try { await wallet?.stop(); } finally {
      process.chdir(originalCwd);
      if (storageDir) await rm(storageDir, { recursive: true, force: true });
    }
  });

  it('finalizes a real reconciliation call and reads its public statement from the indexer', async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'fuelos-midnight-local-'));
    // The wallet SDK also creates its own relative LevelDB; keep it outside the repository.
    process.chdir(storageDir);
    setNetworkId('undeployed');
    globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
    const environment = {
      walletNetworkId: 'undeployed', networkId: 'undeployed',
      indexer: INDEXER, indexerWS: INDEXER_WS,
      node: 'http://127.0.0.1:9944', nodeWS: NODE_WS,
      proofServer: PROOF_SERVER, faucet: '',
    };
    const dustOptions = {
      ledgerParams: LedgerParameters.initialParameters(),
      additionalFeeOverhead: 1_000n,
      feeBlocksMargin: 5,
    };
    const built = await FluentWalletBuilder.forEnvironment(environment)
      .withDustOptions(dustOptions).withSeed(LOCAL_GENESIS_SEED).buildWithoutStarting();
    wallet = built.wallet;
    const shieldedSecretKeys = ZswapSecretKeys.fromSeed(built.seeds.shielded);
    const dustSecretKey = DustSecretKey.fromSeed(built.seeds.dust);
    await wallet.start(shieldedSecretKeys, dustSecretKey);
    await firstValueFrom(wallet.state().pipe(
      filter((state) => state.shielded.state.progress.isStrictlyComplete()
        && state.unshielded.progress.isStrictlyComplete()
        && state.dust.state.progress.isStrictlyComplete()
        && state.dust.availableCoins.length > 0),
      timeout({ first: 300_000 }),
    ));

    const storagePassword = `A!${randomBytes(32).toString('hex')}`;
    const zkConfigProvider = new NodeZkConfigProvider<typeof CIRCUIT_ID>(ARTIFACT_ROOT);
    const publicDataProvider = indexerPublicDataProvider(INDEXER, INDEXER_WS);
    const walletProvider = new LocalWalletProvider(wallet, shieldedSecretKeys, dustSecretKey);
    const providers = {
      privateStateProvider: levelPrivateStateProvider({
        privateStateStoreName: join(storageDir, 'state'),
        signingKeyStoreName: join(storageDir, 'signing'),
        privateStoragePasswordProvider: () => storagePassword,
        accountId: built.keystore.getBech32Address().asString(),
      }),
      publicDataProvider,
      zkConfigProvider,
      proofProvider: httpClientProofProvider(PROOF_SERVER, zkConfigProvider),
      walletProvider,
      midnightProvider: walletProvider,
    };

    const privateInputs: ReconciliationPrivateState = {
      total_sales: 100000n, pos: 40000n, cash: 30000n, eft: 20000n, credit: 10000n,
    };
    const context = computeShiftCommitment({
      shiftId: 'local-ledger-test', stationId: 'local-station', userId: 'local-user',
      startTime: '2026-10-08T08:00:00Z', endTime: '2026-10-08T16:00:00Z',
      authorizedToleranceKurus: 100n,
    }).commitment;
    const contextBytes = parseShiftContextDigest(context);
    const deployed = await deployContract(providers, {
      compiledContract: compiledReconciliationContract(),
      privateStateId: 'fuelosReconciliationState',
      initialPrivateState: privateInputs,
    });
    const contractAddress = deployed.deployTxData.public.contractAddress;
    const call = await deployed.callTx.reconcile(ReconciliationClass.MATCHED, 100n, contextBytes);
    expect(call.public.txId).toBeTruthy();
    expect(call.public.blockHeight).toBeGreaterThan(0);

    const expected = {
      publicClass: ReconciliationClass.MATCHED,
      toleranceKurus: 100n,
      contextDigest: contextBytes,
    };
    expect(await matchesCurrentLedgerState(publicDataProvider, contractAddress, expected)).toBe(true);
    expect(await matchesCurrentLedgerState(publicDataProvider, contractAddress, {
      ...expected, publicClass: ReconciliationClass.SHORTAGE,
    })).toBe(false);
    expect(await matchesCurrentLedgerState(publicDataProvider, contractAddress, {
      ...expected, contextDigest: new Uint8Array(32),
    })).toBe(false);
    // Only public identifiers and class are emitted; no private amounts or preimage.
    process.stdout.write(JSON.stringify({
      contractAddress,
      txId: call.public.txId,
      blockHeight: call.public.blockHeight,
      publicClass: 'MATCHED',
      contextDigest: context,
      ledgerVerified: true,
    }) + '\n');
  }, 600_000);
});
