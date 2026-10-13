import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Transaction, ZswapSecretKeys } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { computeFinancialCommitment } from '../src/financial-commitment.js';
import { verificationArtifactManifest } from '../src/compiled-contract.js';
import { prepareShiftCall } from '../src/prepare-shift-call.js';

const contractAddress = '449953a0d1e907bc37ed0f36f10028809820cff7cb915bc18e09e03b7503b8bb';

describe('Preview private-to-public handoff (opt-in, no submission)', () => {
  it('proves a real unbound transaction without returning witness or nonce', async () => {
    const nonce = randomBytes(32);
    const context = randomBytes(32);
    const walletKeys = ZswapSecretKeys.fromSeed(randomBytes(32));
    const amounts = { total_sales: 123456789n, pos: 23456789n, cash: 30000000n,
      eft: 20000000n, credit: 50000000n };
    const commitment = computeFinancialCommitment(amounts, nonce);
    const manifest = await verificationArtifactManifest();
    const prepared = await prepareShiftCall({
      totalSales: amounts.total_sales.toString(), pos: amounts.pos.toString(),
      cash: amounts.cash.toString(), eft: amounts.eft.toString(), credit: amounts.credit.toString(),
      nonceHex: nonce.toString('hex'), publicClass: 'MATCHED', toleranceKurus: '100',
      contextDigest: `fuelos:shift:v1:${context.toString('hex')}`,
      financialCommitment: Buffer.from(commitment).toString('hex'),
      contractAddress,
      verifierKeySha256: manifest.verifierKeySha256,
      shieldedCoinPublicKey: walletKeys.coinPublicKey,
      shieldedEncryptionPublicKey: walletKeys.encryptionPublicKey,
    });
    const raw = Buffer.from(prepared.txHex, 'hex');
    expect(raw.length).toBeGreaterThan(100);
    const decoded = Transaction.deserialize('signature', 'proof', 'pre-binding', raw);
    expect(Buffer.from(decoded.serialize())).toEqual(raw);
    expect(JSON.stringify(prepared)).not.toContain(nonce.toString('hex'));
    expect(JSON.stringify(prepared)).not.toContain(amounts.total_sales.toString());
    expect(prepared).not.toHaveProperty('nonceHex');
    expect(prepared).not.toHaveProperty('totalSales');
    walletKeys.clear();
  }, 360_000);
});
