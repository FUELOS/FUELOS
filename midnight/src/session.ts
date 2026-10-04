import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { httpClientProvingProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import type { MidnightProviders, WalletProvider } from '@midnight-ntwrk/midnight-js-types';
import { ARTIFACT_ROOT, CIRCUIT_ID, PROOF_SERVER_URL } from './proof.js';

export type SupportedNetwork = 'preprod' | 'preview' | 'mainnet' | 'undeployed';

export interface FuelOSMidnightConfig {
  networkId: SupportedNetwork;
  indexerUrl?: string;
  indexerWsUrl?: string;
  proofServerUrl?: string;
  artifactPath?: string;
}

export const DEFAULT_CONFIG: FuelOSMidnightConfig = {
  networkId: 'preprod',
  indexerUrl: 'https://indexer.preprod.midnight.network/api/v4/graphql',
  indexerWsUrl: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  proofServerUrl: PROOF_SERVER_URL,
  artifactPath: ARTIFACT_ROOT,
};

/**
 * Initializes Midnight environment and providers for FuelOS ZK service.
 * Follows official Midnight.js configuration patterns from Midnight-Skills.
 */
export function initializeMidnight(config: Partial<FuelOSMidnightConfig> = {}) {
  const resolvedConfig = { ...DEFAULT_CONFIG, ...config };
  
  // Set global network ID first (required by Midnight.js)
  setNetworkId(resolvedConfig.networkId);

  const zkConfigProvider = new NodeZkConfigProvider<typeof CIRCUIT_ID>(resolvedConfig.artifactPath!);
  const proofProvider = httpClientProvingProvider(resolvedConfig.proofServerUrl!, zkConfigProvider);

  return {
    config: resolvedConfig,
    zkConfigProvider,
    proofProvider,
  };
}
