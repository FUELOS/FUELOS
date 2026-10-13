import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stdout } from 'node:process';
import { attestationMessage, type ReconciliationAttestation } from './source-attestation.js';

const [statementPath, privateKeyPath] = process.argv.slice(2);
if (!statementPath || !privateKeyPath || process.argv.length !== 4) {
  throw new Error('Usage: npm run sign:attestation -- <attestation-request.json> <external-ed25519-private-key.pem>');
}

// This helper signs only. The operator must independently validate the source
// records and their link to the private witness before invoking it.
const request = JSON.parse(readFileSync(statementPath, 'utf8')) as {
  attestation?: ReconciliationAttestation;
};
if (!request.attestation) throw new Error('Missing attestation');
const message = attestationMessage(request.attestation);
const key = createPrivateKey(readFileSync(privateKeyPath));
if (key.asymmetricKeyType !== 'ed25519') throw new Error('Expected an Ed25519 private key');
stdout.write(`${sign(null, message, key).toString('base64')}\n`);
