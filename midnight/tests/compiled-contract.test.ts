import { describe, expect, it } from 'vitest';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import {
  ARTIFACT_ROOT,
  CIRCUIT_ID,
  compiledReconciliationContract,
  verificationArtifactManifest,
} from '../src/compiled-contract.js';

describe('Midnight verification handoff', () => {
  it('binds the generated contract and witnesses to the full-compile artifacts', () => {
    const compiled = compiledReconciliationContract();
    expect(compiled.tag).toBe('fuelos-reconciliation');
    expect(CompiledContract.getCompiledAssetsPath(compiled)).toBe(ARTIFACT_ROOT);
  });

  it('reads non-empty verifier materials and emits stable public fingerprints', async () => {
    const first = await verificationArtifactManifest();
    const second = await verificationArtifactManifest();
    expect(first).toEqual(second);
    expect(first.circuitId).toBe(CIRCUIT_ID);
    expect(first.statementVersion).toBe('reconcile-v4-financial-commitment');
    expect(first.verifierKeySha256).toMatch(/^[0-9a-f]{64}$/);
    expect(first.zkirSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
