import { readFile } from 'node:fs/promises';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { WebSocket } from 'ws';
import { verificationArtifactManifest } from './compiled-contract.js';
import { verifyPublicReconciliationEvidence, type PublicReconciliationEvidence } from './public-evidence.js';

const [evidenceFile, sourceKeyFile, managerKeyFile, trustedContractAddress, indexerHttp, indexerWs] = process.argv.slice(2);
if (!evidenceFile || !sourceKeyFile || !managerKeyFile || !trustedContractAddress || !indexerHttp || !indexerWs) {
  process.stderr.write('Usage: npm run verify:public -- <public-evidence.json> <trusted-source-public.pem> <trusted-manager-public.pem> <trusted-contract-address> <indexer-http-url> <indexer-ws-url>\n');
  process.exitCode = 2;
} else {
  try {
    setNetworkId('preview');
    globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
    const [rawEvidence, sourceKey, managerKey, manifest] = await Promise.all([
      readFile(evidenceFile, 'utf8'), readFile(sourceKeyFile, 'utf8'), readFile(managerKeyFile, 'utf8'),
      verificationArtifactManifest(),
    ]);
    const evidence = JSON.parse(rawEvidence) as PublicReconciliationEvidence;
    const provider = indexerPublicDataProvider(indexerHttp, indexerWs);
    const receipt = await verifyPublicReconciliationEvidence(provider, evidence, {
      network: 'preview', contractAddress: trustedContractAddress,
      verifierKeySha256: manifest.verifierKeySha256,
      sourcePublicKeyPem: sourceKey, managerPublicKeyPem: managerKey,
    });
    process.stdout.write(JSON.stringify(receipt
      ? { verified: true, network: 'preview', ...receipt }
      : { verified: false, network: 'preview' }) + '\n');
    if (!receipt) process.exitCode = 1;
  } catch {
    process.stderr.write('Public evidence verification failed. Check trusted keys, artifact, indexer, and receipt.\n');
    process.exitCode = 1;
  }
}
