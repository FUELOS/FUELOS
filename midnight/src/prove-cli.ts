import { createHash } from 'node:crypto';
import { stdin, stdout } from 'node:process';
import { proveReconciliation } from './proof.js';
import { MAX_INPUT_KURUS, ReconciliationClass } from './types.js';

type ClaimName = 'matched' | 'shortage' | 'surplus';

interface ProveRequest {
  totalSales: string;
  pos: string;
  cash: string;
  eft: string;
  credit: string;
  toleranceKurus: string;
  claim: ClaimName;
}

const claims: Record<ClaimName, ReconciliationClass> = {
  matched: ReconciliationClass.MATCHED,
  shortage: ReconciliationClass.SHORTAGE,
  surplus: ReconciliationClass.SURPLUS,
};

function parseAmount(value: unknown, name: string, maximum = MAX_INPUT_KURUS): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`invalid_${name}`);
  }
  const parsed = BigInt(value);
  if (parsed > maximum) throw new Error(`invalid_${name}`);
  return parsed;
}

async function readRequest(): Promise<ProveRequest> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as ProveRequest;
}

async function main(): Promise<void> {
  try {
    const request = await readRequest();
    if (!(request.claim in claims)) throw new Error('invalid_claim');

    const tolerance = parseAmount(request.toleranceKurus, 'tolerance', 100000n);
    const result = await proveReconciliation(
      {
        total_sales: parseAmount(request.totalSales, 'total_sales'),
        pos: parseAmount(request.pos, 'pos'),
        cash: parseAmount(request.cash, 'cash'),
        eft: parseAmount(request.eft, 'eft'),
        credit: parseAmount(request.credit, 'credit'),
      },
      claims[request.claim],
      tolerance,
    );

    const proofHash = createHash('sha256').update(result.proof).digest('hex');
    stdout.write(JSON.stringify({
      status: 'proved',
      publicClass: request.claim,
      toleranceKurus: tolerance.toString(),
      proofBytes: result.proof.byteLength,
      proofHash,
      proofBase64: Buffer.from(result.proof).toString('base64'),
      proofServerChecked: result.checkSucceeded,
      ledgerVerified: false,
    }));
  } catch (error) {
    const stage = error instanceof Error && 'stage' in error
      ? String((error as { stage: unknown }).stage)
      : 'input';
    stdout.write(JSON.stringify({ status: 'failed', stage }));
    process.exitCode = 1;
  }
}

await main();
