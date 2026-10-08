import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { Contract } from '../managed/reconciliation/contract/index.js';
import type { ReconciliationPrivateState } from './types.js';
import { witnesses } from './witnesses.js';

export const CONTRACT_NAME = 'fuelos-reconciliation';
export const CIRCUIT_ID = 'reconcile';
export const STATEMENT_VERSION = 'reconcile-v2-shift-context';
export const ARTIFACT_ROOT = fileURLToPath(new URL('../managed/reconciliation/', import.meta.url));

/** Contract binding for a future Midnight.js deploy/call; this performs no network action. */
export function compiledReconciliationContract() {
  type Generated = Contract<ReconciliationPrivateState>;
  const bare = CompiledContract.make<Generated, ReconciliationPrivateState>(CONTRACT_NAME, Contract);
  const witnessed = CompiledContract.withWitnesses<
    Generated,
    ReconciliationPrivateState,
    { readonly witnesses: typeof witnesses } | { readonly compiledAssetsPath: string }
  >(bare, witnesses);
  return CompiledContract.withCompiledFileAssets<
    Generated,
    ReconciliationPrivateState,
    { readonly compiledAssetsPath: string }
  >(
    witnessed,
    ARTIFACT_ROOT,
  );
}

/** Public artifact identity for matching a deployed verifier to this local build. */
export async function verificationArtifactManifest() {
  const zkConfig = new NodeZkConfigProvider<typeof CIRCUIT_ID>(ARTIFACT_ROOT);
  const [verifierKey, zkir] = await Promise.all([
    zkConfig.getVerifierKey(CIRCUIT_ID),
    zkConfig.getZKIR(CIRCUIT_ID),
  ]);
  if (!verifierKey.byteLength || !zkir.byteLength) {
    throw new Error('Full Compact compilation artifacts are missing or empty');
  }
  const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  return {
    contractName: CONTRACT_NAME,
    circuitId: CIRCUIT_ID,
    statementVersion: STATEMENT_VERSION,
    verifierKeySha256: sha256(verifierKey),
    zkirSha256: sha256(zkir),
  } as const;
}
