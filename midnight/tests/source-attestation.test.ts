import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { attestationMessage, verifyDualAttestation, type ReconciliationAttestation } from '../src/source-attestation.js';

const source = generateKeyPairSync('ed25519');
const manager = generateKeyPairSync('ed25519');
const sourcePem = source.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const managerPem = manager.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const statement: ReconciliationAttestation = {
  network: 'preview', contractAddress: 'ab'.repeat(32),
  contextDigest: 'fuelos:shift:v1:' + 'cd'.repeat(32),
  financialCommitment: 'ef'.repeat(32), sourceSnapshotHash: '12'.repeat(32),
  publicClass: 'MATCHED', toleranceKurus: '100', verifierKeySha256: '34'.repeat(32),
  statementVersion: 'reconcile-v4-financial-commitment',
};
const message = attestationMessage(statement);
const signatures = {
  source: sign(null, message, source.privateKey).toString('base64'),
  manager: sign(null, message, manager.privateKey).toString('base64'),
};

describe('independent source and manager attestations', () => {
  it('accepts two distinct trusted Ed25519 signatures over the same public statement', () => {
    expect(verifyDualAttestation(statement, signatures, sourcePem, managerPem)).toBe(true);
  });
  it('rejects tampered financial commitment, source hash, class and contract address', () => {
    for (const changed of [
      { financialCommitment: 'ff'.repeat(32) },
      { sourceSnapshotHash: 'ff'.repeat(32) },
      { publicClass: 'SURPLUS' as const },
      { contractAddress: 'ff'.repeat(32) },
    ]) {
      expect(verifyDualAttestation({ ...statement, ...changed }, signatures, sourcePem, managerPem)).toBe(false);
    }
  });
  it('rejects one reused signer, reversed trust roles and malformed signatures', () => {
    expect(verifyDualAttestation(statement, signatures, sourcePem, sourcePem)).toBe(false);
    expect(verifyDualAttestation(statement, signatures, managerPem, sourcePem)).toBe(false);
    expect(verifyDualAttestation(statement, { ...signatures, manager: 'invalid' }, sourcePem, managerPem)).toBe(false);
  });
});
