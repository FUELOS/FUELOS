import { prepareShiftCall, type ShiftCallRequest } from './prepare-shift-call.js';

let raw = '';
for await (const chunk of process.stdin) raw += chunk.toString();
try {
  const result = await prepareShiftCall(JSON.parse(raw) as ShiftCallRequest);
  process.stdout.write(JSON.stringify(result) + '\n');
} catch {
  // Midnight errors may contain private witness data; never echo them.
  process.stderr.write('Preview shift transaction preparation failed\n');
  process.exitCode = 1;
}
