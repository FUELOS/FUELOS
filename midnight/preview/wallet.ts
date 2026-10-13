import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { Transaction, type CoinPublicKey, type EncPublicKey, type FinalizedTransaction } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type { MidnightProvider, UnboundTransaction, WalletProvider } from '@midnight-ntwrk/midnight-js-types';
import { parseCoinPublicKeyToHex, parseEncPublicKeyToHex } from '@midnight-ntwrk/midnight-js-utils';

const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
const bytes = (value: string) => Uint8Array.from(value.match(/.{2}/g)!.map((pair) => Number.parseInt(pair, 16)));

/** Transaction signing and fee payment remain inside the connected Lace wallet. */
export class LaceTransactionProvider implements WalletProvider, MidnightProvider {
  constructor(
    private readonly connected: ConnectedAPI,
    private readonly coinPublicKey: CoinPublicKey,
    private readonly encryptionPublicKey: EncPublicKey,
  ) {}

  static async create(connected: ConnectedAPI): Promise<LaceTransactionProvider> {
    const addresses = await connected.getShieldedAddresses();
    return new LaceTransactionProvider(
      connected,
      parseCoinPublicKeyToHex(addresses.shieldedCoinPublicKey, 'preview') as CoinPublicKey,
      parseEncPublicKeyToHex(addresses.shieldedEncryptionPublicKey, 'preview') as EncPublicKey,
    );
  }

  getCoinPublicKey(): CoinPublicKey { return this.coinPublicKey; }
  getEncryptionPublicKey(): EncPublicKey { return this.encryptionPublicKey; }

  async balanceTx(tx: UnboundTransaction): Promise<FinalizedTransaction> {
    const balanced = await this.connected.balanceUnsealedTransaction(hex(tx.serialize()));
    return Transaction.deserialize('signature', 'proof', 'binding', bytes(balanced.tx));
  }

  async submitTx(tx: FinalizedTransaction): Promise<string> {
    await this.connected.submitTransaction(hex(tx.serialize()));
    const id = tx.identifiers()[0];
    if (!id) throw new Error('Submitted transaction has no identifier');
    return id;
  }
}
