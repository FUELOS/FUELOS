import { readFileSync } from 'node:fs';
import {
  ledgerStatementDigest,
  type SaleLeaf,
  verifyMerkleInclusion,
  verifySaleCommitment,
} from './credit-ledger.js';

interface WireSaleDisclosure {
  sale_id: string;
  transaction_id: string;
  shift_id: string;
  station_id: string;
  account_type: 'corporate' | 'individual';
  account_id: string;
  plate: string | null;
  driver_id: string | null;
  fuel_type: string | null;
  liters_ml: number | null;
  amount_kurus: number;
  sale_time: string;
  nonce: string;
}

interface WireSaleInclusionProof {
  credit_sale_id: string;
  shift_id: string;
  leaf_index: number;
  leaf_count: number;
  commitment: string;
  merkle_path: string[];
  merkle_root: string;
  statement_digest: string;
  disclosure: WireSaleDisclosure | null;
}

function verifyDisclosure(proof: WireSaleInclusionProof, disclosure: WireSaleDisclosure): boolean {
  if (
    typeof disclosure.sale_id !== 'string' ||
    typeof disclosure.shift_id !== 'string' ||
    disclosure.sale_id.toLowerCase() !== String(proof.credit_sale_id).toLowerCase() ||
    disclosure.shift_id.toLowerCase() !== String(proof.shift_id).toLowerCase()
  ) {
    return false;
  }
  const leaf: SaleLeaf = {
    saleId: disclosure.sale_id,
    transactionId: disclosure.transaction_id,
    shiftId: disclosure.shift_id,
    stationId: disclosure.station_id,
    accountType: disclosure.account_type,
    accountId: disclosure.account_id,
    plate: disclosure.plate ?? null,
    driverId: disclosure.driver_id ?? null,
    fuelType: disclosure.fuel_type ?? null,
    litersMl: disclosure.liters_ml ?? null,
    amountKurus: disclosure.amount_kurus,
    saleTime: disclosure.sale_time,
  };
  return verifySaleCommitment(leaf, disclosure.nonce, proof.commitment);
}

function main(): void {
  let rawInput: string;
  try {
    rawInput = readFileSync(0, 'utf8');
  } catch {
    process.stderr.write('Failed to read SaleInclusionProof JSON from stdin.\n');
    process.exitCode = 2;
    return;
  }

  let proof: WireSaleInclusionProof;
  try {
    proof = JSON.parse(rawInput) as WireSaleInclusionProof;
  } catch {
    process.stderr.write('Invalid JSON on stdin; expected SaleInclusionProof.\n');
    process.exitCode = 2;
    return;
  }

  const inclusionValid =
    typeof proof?.commitment === 'string' &&
    Array.isArray(proof?.merkle_path) &&
    typeof proof?.merkle_root === 'string' &&
    verifyMerkleInclusion(
      proof.commitment,
      proof.leaf_index,
      proof.leaf_count,
      proof.merkle_path,
      proof.merkle_root,
    );

  let statementDigestValid = false;
  try {
    const expectedDigest = ledgerStatementDigest(
      proof.shift_id,
      proof.leaf_count,
      proof.merkle_root,
    );
    statementDigestValid =
      typeof proof.statement_digest === 'string' &&
      proof.statement_digest === expectedDigest;
  } catch {
    statementDigestValid = false;
  }

  const hasDisclosure = proof?.disclosure !== null && proof?.disclosure !== undefined;
  const verdict: {
    inclusionValid: boolean;
    statementDigestValid: boolean;
    commitmentOpens?: boolean;
  } = {
    inclusionValid,
    statementDigestValid,
  };

  let allPassed = inclusionValid && statementDigestValid;
  if (hasDisclosure && proof.disclosure) {
    const commitmentOpens = verifyDisclosure(proof, proof.disclosure);
    verdict.commitmentOpens = commitmentOpens;
    allPassed = allPassed && commitmentOpens;
  }

  process.stdout.write(JSON.stringify(verdict) + '\n');
  if (!allPassed) {
    process.exitCode = 1;
  }
}

main();
