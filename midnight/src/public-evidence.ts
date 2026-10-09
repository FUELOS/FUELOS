import type { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { verifyFinalizedReconciliation, type FinalizedReconciliationReceipt } from './ledger-verification.js';
import { verifyDualAttestation, type AttestationSignatures, type ReconciliationAttestation } from './source-attestation.js';
import { ReconciliationClass } from './types.js';

type PublicDataProvider = Pick<ReturnType<typeof indexerPublicDataProvider>, 'queryContractState' | 'watchForTxData'>;

/** Contains only public values. Trusted addresses and signer keys are supplied separately. */
export interface PublicReconciliationEvidence {
  readonly txId: string;
  readonly attestation: ReconciliationAttestation;
  readonly signatures: AttestationSignatures;
}

export interface TrustedReconciliationRegistry {
  readonly network: 'preview' | 'undeployed';
  readonly contractAddress: string;
  readonly verifierKeySha256: string;
  readonly sourcePublicKeyPem: string;
  readonly managerPublicKeyPem: string;
}

/** A true result requires both independent approvals and finalized ledger state. */
export async function verifyPublicReconciliationEvidence(
  provider: PublicDataProvider,
  evidence: PublicReconciliationEvidence,
  trusted: TrustedReconciliationRegistry,
): Promise<FinalizedReconciliationReceipt | null> {
  const signed = evidence.attestation;
  if (signed.network !== trusted.network
    || signed.contractAddress !== trusted.contractAddress
    || signed.verifierKeySha256 !== trusted.verifierKeySha256) return null;
  if (!verifyDualAttestation(signed, evidence.signatures, trusted.sourcePublicKeyPem, trusted.managerPublicKeyPem)) {
    return null;
  }
  const classByName = {
    MATCHED: ReconciliationClass.MATCHED,
    SHORTAGE: ReconciliationClass.SHORTAGE,
    SURPLUS: ReconciliationClass.SURPLUS,
  } as const;
  return verifyFinalizedReconciliation(provider, trusted.contractAddress, evidence.txId, {
    publicClass: classByName[signed.publicClass],
    toleranceKurus: BigInt(signed.toleranceKurus),
    contextDigest: Buffer.from(signed.contextDigest.slice('fuelos:shift:v1:'.length), 'hex'),
    financialCommitment: Buffer.from(signed.financialCommitment, 'hex'),
  });
}
