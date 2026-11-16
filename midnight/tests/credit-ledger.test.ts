import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildLeafPayload,
  buildShiftLedger,
  canonicalJson,
  ledgerStatementDigest,
  merkleInclusionPath,
  merkleRoot,
  type SaleLeaf,
  saleCommitment,
  verifyMerkleInclusion,
  verifySaleCommitment,
} from '../src/credit-ledger.js';

interface LeafVector {
  label: string;
  leaf: SaleLeaf;
  nonce: string;
  canonicalPayload: string;
  commitment: string;
}

interface MerkleCaseVector {
  count: number;
  shiftId: string;
  inputSales: [string, string][];
  orderedSaleIds: string[];
  orderedCommitments: string[];
  merkleRoot: string;
  statementDigest: string;
  inclusionPaths: { index: number; commitment: string; path: string[] }[];
}

interface VectorBundle {
  leaves: LeafVector[];
  merkleCases: MerkleCaseVector[];
}

const here = dirname(fileURLToPath(import.meta.url));
const vectors: VectorBundle = JSON.parse(
  readFileSync(resolve(here, 'vectors/credit-ledger.json'), 'utf8'),
);

function rawSha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function deterministicCommitment(idx: number): string {
  return createHash('sha256').update(`leaf-${idx}`).digest('hex');
}

describe('credit-ledger cross-language vectors', () => {
  it('matches Python canonical JSON and SHA-256 commitments for every leaf vector', () => {
    expect(vectors.leaves.length).toBeGreaterThanOrEqual(8);
    for (const entry of vectors.leaves) {
      const canonical = canonicalJson(buildLeafPayload(entry.leaf, entry.nonce));
      expect(canonical, entry.label).toBe(entry.canonicalPayload);

      const commitment = saleCommitment(entry.leaf, entry.nonce);
      expect(commitment, entry.label).toBe(entry.commitment);
      expect(verifySaleCommitment(entry.leaf, entry.nonce, entry.commitment)).toBe(true);

      // Mutating amount or nonce breaks commitment verification
      expect(
        verifySaleCommitment(
          { ...entry.leaf, amountKurus: entry.leaf.amountKurus + 1 },
          entry.nonce,
          entry.commitment,
        ),
      ).toBe(false);
      const flippedNonce = (entry.nonce.startsWith('0') ? '1' : '0') + entry.nonce.slice(1);
      expect(verifySaleCommitment(entry.leaf, flippedNonce, entry.commitment)).toBe(false);
    }
  });

  it('hides low-entropy amounts using distinct nonces', () => {
    const c1 = vectors.leaves[1];
    const c2 = vectors.leaves[2];
    expect(c1.leaf.amountKurus).toBe(c2.leaf.amountKurus);
    expect(c1.commitment).not.toBe(c2.commitment);
  });

  it('matches Python shift ledger, Merkle roots, inclusion paths, and statement digests', () => {
    for (const mCase of vectors.merkleCases) {
      const ledger = buildShiftLedger(mCase.shiftId, mCase.inputSales);
      expect(ledger.leafCount).toBe(mCase.count);
      expect(ledger.orderedSaleIds).toEqual(mCase.orderedSaleIds);
      expect(ledger.orderedCommitments).toEqual(mCase.orderedCommitments);
      expect(ledger.merkleRoot).toBe(mCase.merkleRoot);
      expect(ledger.statementDigest).toBe(mCase.statementDigest);

      expect(merkleRoot(mCase.orderedCommitments)).toBe(mCase.merkleRoot);
      expect(ledgerStatementDigest(mCase.shiftId, mCase.count, mCase.merkleRoot)).toBe(
        mCase.statementDigest,
      );

      // Order independence
      const reversed = buildShiftLedger(mCase.shiftId, [...mCase.inputSales].reverse());
      expect(reversed.merkleRoot).toBe(mCase.merkleRoot);
      expect(reversed.statementDigest).toBe(mCase.statementDigest);

      for (const item of mCase.inclusionPaths) {
        const path = merkleInclusionPath(mCase.orderedCommitments, item.index);
        expect(path).toEqual(item.path);
        expect(
          verifyMerkleInclusion(
            item.commitment,
            item.index,
            mCase.count,
            item.path,
            mCase.merkleRoot,
          ),
        ).toBe(true);
      }
    }
  });

  it('independently matches raw RFC 6962 definitions for 0, 1, and 2 leaves', () => {
    const emptyCase = vectors.merkleCases.find((c) => c.count === 0)!;
    expect(emptyCase.merkleRoot).toBe(rawSha256(Buffer.alloc(0)));

    const oneCase = vectors.merkleCases.find((c) => c.count === 1)!;
    const c0 = Buffer.from(oneCase.orderedCommitments[0], 'hex');
    const h0 = createHash('sha256')
      .update(Buffer.concat([Buffer.from([0x00]), c0]))
      .digest();
    expect(oneCase.merkleRoot).toBe(h0.toString('hex'));

    const twoCase = vectors.merkleCases.find((c) => c.count === 2)!;
    const d0 = createHash('sha256')
      .update(
        Buffer.concat([
          Buffer.from([0x00]),
          Buffer.from(twoCase.orderedCommitments[0], 'hex'),
        ]),
      )
      .digest();
    const d1 = createHash('sha256')
      .update(
        Buffer.concat([
          Buffer.from([0x00]),
          Buffer.from(twoCase.orderedCommitments[1], 'hex'),
        ]),
      )
      .digest();
    const root2 = createHash('sha256')
      .update(Buffer.concat([Buffer.from([0x01]), d0, d1]))
      .digest('hex');
    expect(twoCase.merkleRoot).toBe(root2);
  });

  it('verifies every index across trees of 1..17 leaves and rejects tampering', () => {
    for (let n = 1; n <= 17; n += 1) {
      const commitments = Array.from({ length: n }, (_, i) => deterministicCommitment(i));
      const root = merkleRoot(commitments);
      for (let i = 0; i < n; i += 1) {
        const path = merkleInclusionPath(commitments, i);
        expect(verifyMerkleInclusion(commitments[i], i, n, path, root)).toBe(true);

        // Wrong index & wrong leaf count
        if (n > 1) {
          expect(verifyMerkleInclusion(commitments[i], (i + 1) % n, n, path, root)).toBe(false);
          expect(verifyMerkleInclusion(commitments[i], i, i, path, root)).toBe(false);
        }
        expect(verifyMerkleInclusion(commitments[i], i, n * 2 + 1, path, root)).toBe(false);
        // Tampered root
        const badRoot = (root.startsWith('0') ? '1' : '0') + root.slice(1);
        expect(verifyMerkleInclusion(commitments[i], i, n, path, badRoot)).toBe(false);
        // Tampered path element
        if (path.length > 0) {
          const badPath = [...path];
          badPath[0] = (badPath[0].startsWith('0') ? '1' : '0') + badPath[0].slice(1);
          expect(verifyMerkleInclusion(commitments[i], i, n, badPath, root)).toBe(false);
        }
      }
    }
  });

  it('enforces strict input validation', () => {
    const sample = vectors.leaves[0];
    expect(() => saleCommitment(sample.leaf, 'short')).toThrow();
    expect(() => saleCommitment(sample.leaf, sample.nonce.toUpperCase())).toThrow();
    expect(() =>
      saleCommitment({ ...sample.leaf, amountKurus: 0 }, sample.nonce),
    ).toThrow();
    expect(() =>
      saleCommitment({ ...sample.leaf, litersMl: -1 }, sample.nonce),
    ).toThrow();
    expect(() =>
      saleCommitment({ ...sample.leaf, accountType: 'invalid' as 'corporate' }, sample.nonce),
    ).toThrow();
    expect(() =>
      buildShiftLedger(sample.leaf.shiftId, [
        ['5a1e0001-1111-4111-8111-000000000001', sample.commitment],
        ['5A1E0001-1111-4111-8111-000000000001', sample.commitment],
      ]),
    ).toThrow();
    expect(verifySaleCommitment(sample.leaf, 'invalid', sample.commitment)).toBe(false);
  });
});
