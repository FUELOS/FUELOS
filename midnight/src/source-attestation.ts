import { createPublicKey, verify } from 'node:crypto';
import { STATEMENT_VERSION } from './compiled-contract.js';

/** Signed off-chain by an independent FuelOS source service and a station manager. */
export interface ReconciliationAttestation {
  readonly network: 'undeployed' | 'preview' | 'preprod' | 'mainnet';
  readonly contractAddress: string;
  readonly contextDigest: string;
  readonly financialCommitment: string;
  readonly sourceSnapshotHash: string;
  readonly publicClass: 'MATCHED' | 'SHORTAGE' | 'SURPLUS';
  readonly toleranceKurus: string;
  readonly verifierKeySha256: string;
  readonly statementVersion: typeof STATEMENT_VERSION;
}

export interface AttestationSignatures {
  readonly source: string;
  readonly manager: string;
}

const hex32 = /^[0-9a-f]{64}$/;
const context = /^fuelos:shift:v1:[0-9a-f]{64}$/;

/** Exact UTF-8 message both independent signers must approve. No monetary amounts are public. */
export function attestationMessage(value: ReconciliationAttestation): Buffer {
  if (!['undeployed', 'preview', 'preprod', 'mainnet'].includes(value.network)
    || !hex32.test(value.contractAddress)
    || !context.test(value.contextDigest)
    || !hex32.test(value.financialCommitment)
    || !hex32.test(value.sourceSnapshotHash)
    || !hex32.test(value.verifierKeySha256)
    || !['MATCHED', 'SHORTAGE', 'SURPLUS'].includes(value.publicClass)
    || value.statementVersion !== STATEMENT_VERSION
    || !/^(0|[1-9][0-9]*)$/.test(value.toleranceKurus)
    || BigInt(value.toleranceKurus) > 100000n) {
    throw new Error('Invalid reconciliation attestation');
  }
  // Fixed property order and ASCII-only values make this encoding portable.
  return Buffer.from(JSON.stringify({
    domain: 'FUELOS_RECONCILIATION_ATTESTATION_V1',
    network: value.network,
    contractAddress: value.contractAddress,
    contextDigest: value.contextDigest,
    financialCommitment: value.financialCommitment,
    sourceSnapshotHash: value.sourceSnapshotHash,
    publicClass: value.publicClass,
    toleranceKurus: value.toleranceKurus,
    verifierKeySha256: value.verifierKeySha256,
    statementVersion: value.statementVersion,
  }), 'utf8');
}

function decodeSignature(value: string): Buffer | null {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(value)) return null;
  const bytes = Buffer.from(value, 'base64');
  return bytes.length === 64 && bytes.toString('base64') === value ? bytes : null;
}

/** Trusted public keys must be provisioned out-of-band, never taken from the submitted bundle. */
export function verifyDualAttestation(
  attestation: ReconciliationAttestation,
  signatures: AttestationSignatures,
  trustedSourcePublicKeyPem: string,
  trustedManagerPublicKeyPem: string,
): boolean {
  const message = attestationMessage(attestation);
  const sourceSignature = decodeSignature(signatures.source);
  const managerSignature = decodeSignature(signatures.manager);
  if (!sourceSignature || !managerSignature) return false;
  const sourceKey = createPublicKey(trustedSourcePublicKeyPem);
  const managerKey = createPublicKey(trustedManagerPublicKeyPem);
  if (sourceKey.asymmetricKeyType !== 'ed25519' || managerKey.asymmetricKeyType !== 'ed25519') return false;
  if (sourceKey.export({ format: 'der', type: 'spki' }).equals(managerKey.export({ format: 'der', type: 'spki' }))) return false;
  return verify(null, message, sourceKey, sourceSignature)
    && verify(null, message, managerKey, managerSignature);
}
