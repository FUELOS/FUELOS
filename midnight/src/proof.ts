import { fileURLToPath } from 'node:url';
import { httpClientProvingProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { executeReconciliation, ProvingStageError } from './execution.js';
import { ReconciliationClass, type ReconciliationPrivateState } from './types.js';

export const PROOF_SERVER_URL = 'http://127.0.0.1:6300';
export const ARTIFACT_ROOT = fileURLToPath(new URL('../managed/reconciliation/', import.meta.url));
export const CIRCUIT_ID = 'reconcile';

async function verifyServer() {
  try {
    for (const endpoint of ['health', 'version', 'ready']) {
      const response = await fetch(`${PROOF_SERVER_URL}/${endpoint}`, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error();
      const text = await response.text();
      if (endpoint === 'version') {
        if (text.trim().replace(/^"|"$/g, '') !== '8.1.0') throw new Error();
      } else if (JSON.parse(text).status !== 'ok') {
        throw new Error();
      }
    }
  } catch {
    throw new ProvingStageError('health');
  }
}

/** Real HTTP proving only. No mock, fallback, disk output, or private logging. */
export async function proveReconciliation(input: ReconciliationPrivateState, claim: ReconciliationClass) {
  // Reject incorrect claims locally before any HTTP call.
  const execution = executeReconciliation(input, claim);
  const zkConfigProvider = new NodeZkConfigProvider<typeof CIRCUIT_ID>(ARTIFACT_ROOT);
  try {
    try {
      const [pk, vk, ir] = await Promise.all([
        zkConfigProvider.getProverKey(CIRCUIT_ID),
        zkConfigProvider.getVerifierKey(CIRCUIT_ID),
        zkConfigProvider.getZKIR(CIRCUIT_ID),
      ]);
      if (!pk.byteLength || !vk.byteLength || !ir.byteLength) throw new Error();
    } catch {
      throw new ProvingStageError('artifacts');
    }
    await verifyServer();
    const provider = httpClientProvingProvider(PROOF_SERVER_URL, zkConfigProvider, { timeout: 300_000 });
    try {
      // A successful /check evaluates constraints; it does not verify a proof.
      await provider.check(execution.serializedPreimage, CIRCUIT_ID);
    } catch {
      throw new ProvingStageError('check');
    }
    let proof: Uint8Array;
    try {
      proof = await provider.prove(execution.serializedPreimage, CIRCUIT_ID);
      if (!(proof instanceof Uint8Array) || proof.byteLength === 0) throw new Error();
    } catch {
      throw new ProvingStageError('prove');
    }
    return { proof, claim, checkSucceeded: true as const, independentlyVerified: false as const };
  } finally {
    execution.serializedPreimage.fill(0);
    // Best effort lifetime reduction; JS does not guarantee secure erasure.
    execution.proofData.privateTranscriptOutputs.length = 0;
  }
}
