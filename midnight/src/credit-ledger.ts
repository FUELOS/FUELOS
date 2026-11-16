/**
 * FuelOS — Veresiye defteri taahhüt katmanı (saf TypeScript aynası).
 *
 * `backend/app/services/credit_commitment.py` ile bayt düzeyinde birebir aynı
 * kanonik JSON, tuzlu SHA-256 yaprak taahhüdü, RFC 6962 Merkle ağacı ve
 * vardiya beyan özeti hesaplamasını yapar.
 *
 * Not: Sadece Node.js yerleşik `node:crypto` modülünü kullanır; Compact
 * derleyicisi olmadan da çalışır ve çevrimdışı doğrulamaya olanak tanır.
 * Uygulama düzeyinde bütünlük/taahhüt katmanıdır; kendi başına ZK-SNARK değildir.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

export const LEAF_DOMAIN = 'FUELOS_VERESIYE_SALE_V1';
export const LEDGER_DOMAIN = 'FUELOS_VERESIYE_SHIFT_LEDGER_V1';

const HEX64_RE = /^[0-9a-f]{64}$/;

export type CreditAccountType = 'corporate' | 'individual';

export interface SaleLeaf {
  saleId: string;
  transactionId: string;
  shiftId: string;
  stationId: string;
  accountType: CreditAccountType;
  accountId: string;
  plate: string | null;
  driverId: string | null;
  fuelType: string | null;
  litersMl: number | null;
  amountKurus: number;
  saleTime: string;
}

export interface ShiftLedger {
  shiftId: string;
  leafCount: number;
  merkleRoot: string;
  orderedSaleIds: readonly string[];
  orderedCommitments: readonly string[];
  statementDigest: string;
}

function sha256(data: Buffer | string): Buffer {
  return createHash('sha256').update(data).digest();
}

export function requireHex64(value: unknown, name: string): string {
  if (typeof value !== 'string' || !HEX64_RE.test(value)) {
    throw new Error(`${name} must be a 64-character lowercase hex string`);
  }
  return value;
}

function escapeNonAscii(jsonStringLiteral: string): string {
  // Matches Python json.dumps(..., ensure_ascii=True): escapes U+007F and above
  // (including UTF-16 surrogate pairs) using lowercase \uXXXX escapes.
  return jsonStringLiteral.replace(/[\u007f-\uffff]/g, (ch) => {
    return '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0');
  });
}

function compareStringsCodeUnit(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Canonical JSON does not allow non-finite numbers');
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    return escapeNonAscii(JSON.stringify(value));
  }
  if (Array.isArray(value)) {
    return '[' + value.map((item) => canonicalJson(item)).join(',') + ']';
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort(compareStringsCodeUnit);
    const entries = keys.map((key) => {
      const val = obj[key];
      if (val === undefined) {
        throw new Error(`Undefined value for canonical JSON key "${key}"`);
      }
      return `${canonicalJson(key)}:${canonicalJson(val)}`;
    });
    return '{' + entries.join(',') + '}';
  }
  throw new Error(`Unsupported canonical JSON value type: ${typeof value}`);
}

export function buildLeafPayload(leaf: SaleLeaf, nonceHex: string): Record<string, string | null> {
  return {
    domain: LEAF_DOMAIN,
    saleId: leaf.saleId.toLowerCase(),
    transactionId: leaf.transactionId.toLowerCase(),
    shiftId: leaf.shiftId.toLowerCase(),
    stationId: leaf.stationId.toLowerCase(),
    accountType: leaf.accountType,
    accountId: leaf.accountId.toLowerCase(),
    plate: leaf.plate,
    driverId: leaf.driverId ? leaf.driverId.toLowerCase() : null,
    fuelType: leaf.fuelType,
    litersMl: leaf.litersMl === null ? null : String(leaf.litersMl),
    amountKurus: String(leaf.amountKurus),
    saleTime: leaf.saleTime,
    nonce: nonceHex,
  };
}

export function saleCommitment(leaf: SaleLeaf, nonceHex: string): string {
  requireHex64(nonceHex, 'nonce');
  if (leaf.accountType !== 'corporate' && leaf.accountType !== 'individual') {
    throw new Error('Invalid accountType: expected corporate or individual');
  }
  if (!Number.isInteger(leaf.amountKurus) || leaf.amountKurus <= 0) {
    throw new Error('amountKurus must be a positive integer');
  }
  if (leaf.litersMl !== null && (!Number.isInteger(leaf.litersMl) || leaf.litersMl < 0)) {
    throw new Error('litersMl must be null or a non-negative integer');
  }
  if (typeof leaf.saleTime !== 'string' || leaf.saleTime.length === 0) {
    throw new Error('saleTime must be a non-empty ISO-8601 UTC string');
  }
  for (const [field, val] of [
    ['saleId', leaf.saleId],
    ['transactionId', leaf.transactionId],
    ['shiftId', leaf.shiftId],
    ['stationId', leaf.stationId],
    ['accountId', leaf.accountId],
  ] as const) {
    if (typeof val !== 'string' || val.length === 0) {
      throw new Error(`${field} must be a non-empty string`);
    }
  }
  const canonical = canonicalJson(buildLeafPayload(leaf, nonceHex));
  return sha256(Buffer.from(canonical, 'ascii')).toString('hex');
}

export function verifySaleCommitment(leaf: SaleLeaf, nonceHex: string, commitment: string): boolean {
  try {
    const expected = saleCommitment(leaf, nonceHex);
    requireHex64(commitment, 'commitment');
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(commitment, 'hex'));
  } catch {
    return false;
  }
}

function leafHash(commitmentHex: string): Buffer {
  requireHex64(commitmentHex, 'commitment');
  return sha256(Buffer.concat([Buffer.from([0x00]), Buffer.from(commitmentHex, 'hex')]));
}

function nodeHash(left: Buffer, right: Buffer): Buffer {
  return sha256(Buffer.concat([Buffer.from([0x01]), left, right]));
}

function largestPowerOfTwoBelow(n: number): number {
  let k = 1;
  while (k * 2 < n) {
    k *= 2;
  }
  return k;
}

function subtreeRoot(hashes: readonly Buffer[]): Buffer {
  if (hashes.length === 1) {
    return hashes[0];
  }
  const k = largestPowerOfTwoBelow(hashes.length);
  return nodeHash(subtreeRoot(hashes.slice(0, k)), subtreeRoot(hashes.slice(k)));
}

export function merkleRoot(commitments: readonly string[]): string {
  if (commitments.length === 0) {
    return sha256(Buffer.alloc(0)).toString('hex');
  }
  return subtreeRoot(commitments.map(leafHash)).toString('hex');
}

export function merkleInclusionPath(commitments: readonly string[], index: number): string[] {
  if (!Number.isInteger(index) || index < 0 || index >= commitments.length) {
    throw new RangeError('Leaf index out of range');
  }
  const hashes = commitments.map(leafHash);

  function buildPath(slice: readonly Buffer[], idx: number): Buffer[] {
    if (slice.length === 1) {
      return [];
    }
    const k = largestPowerOfTwoBelow(slice.length);
    if (idx < k) {
      return [...buildPath(slice.slice(0, k), idx), subtreeRoot(slice.slice(k))];
    }
    return [...buildPath(slice.slice(k), idx - k), subtreeRoot(slice.slice(0, k))];
  }

  return buildPath(hashes, index).map((node) => node.toString('hex'));
}

export function verifyMerkleInclusion(
  commitment: string,
  index: number,
  leafCount: number,
  path: readonly string[],
  root: string,
): boolean {
  try {
    if (!Number.isInteger(leafCount) || leafCount <= 0 || !Number.isInteger(index) || index < 0 || index >= leafCount) {
      return false;
    }
    requireHex64(root, 'root');
    const siblings = path.map((p) => {
      requireHex64(p, 'path');
      return Buffer.from(p, 'hex');
    });
    let node = leafHash(commitment);
    let fn = index;
    let sn = leafCount - 1;
    for (const sibling of siblings) {
      if (sn === 0) {
        return false;
      }
      if (fn % 2 === 1 || fn === sn) {
        node = nodeHash(sibling, node);
        while (fn % 2 === 0 && fn !== 0) {
          fn = Math.floor(fn / 2);
          sn = Math.floor(sn / 2);
        }
      } else {
        node = nodeHash(node, sibling);
      }
      fn = Math.floor(fn / 2);
      sn = Math.floor(sn / 2);
    }
    return sn === 0 && timingSafeEqual(node, Buffer.from(root, 'hex'));
  } catch {
    return false;
  }
}

export function ledgerStatementDigest(shiftId: string, leafCount: number, root: string): string {
  if (typeof shiftId !== 'string' || shiftId.length === 0) {
    throw new Error('shiftId must be a non-empty string');
  }
  if (!Number.isInteger(leafCount) || leafCount < 0) {
    throw new Error('leafCount must be a non-negative integer');
  }
  const payload = {
    domain: LEDGER_DOMAIN,
    shiftId: shiftId.toLowerCase(),
    leafCount: String(leafCount),
    merkleRoot: requireHex64(root, 'root'),
  };
  return sha256(Buffer.from(canonicalJson(payload), 'ascii')).toString('hex');
}

export function buildShiftLedger(
  shiftId: string,
  sales: readonly (readonly [string, string])[],
): ShiftLedger {
  const normalized = sales
    .map(([saleId, commitment]): [string, string] => [String(saleId).toLowerCase(), commitment])
    .sort((a, b) => compareStringsCodeUnit(a[0], b[0]));

  const orderedSaleIds: string[] = [];
  const seen = new Set<string>();
  const orderedCommitments: string[] = [];

  for (const [saleId, commitment] of normalized) {
    if (seen.has(saleId)) {
      throw new Error(`Duplicate saleId in shift ledger: ${saleId}`);
    }
    seen.add(saleId);
    requireHex64(commitment, 'commitment');
    orderedSaleIds.push(saleId);
    orderedCommitments.push(commitment);
  }

  const root = merkleRoot(orderedCommitments);
  return {
    shiftId: String(shiftId).toLowerCase(),
    leafCount: orderedCommitments.length,
    merkleRoot: root,
    orderedSaleIds,
    orderedCommitments,
    statementDigest: ledgerStatementDigest(shiftId, orderedCommitments.length, root),
  };
}
