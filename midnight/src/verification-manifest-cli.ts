import { stdout } from 'node:process';
import { verificationArtifactManifest } from './compiled-contract.js';

stdout.write(`${JSON.stringify(await verificationArtifactManifest(), null, 2)}\n`);
