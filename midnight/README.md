# FuelOS Compact reconciliation PoC

Reconciliation implementation of `backend/app/services/reconciliation.py`,
with real local proving through Docker and an explicit backend/UI integration.
An opt-in local Midnight network test verifies a finalized transaction and
public state. Public-network deployment and FuelOS production verification
are not included.

## Toolchain

Run from this directory in Ubuntu/WSL, using Linux Node/npm:

| Tool | Pinned version |
| --- | --- |
| Node.js | 22.23.3 |
| npm | 10.9.9 |
| Compact devtools | 0.5.1 |
| Compact compiler | 0.31.1 |
| Compiler language version | 0.23.0 |
| Compact runtime | 0.16.0 |

The compiler reports language version 0.23.0; it is not the compiler release
number. `package-lock.json` pins local dependencies. The previously installed
global runtime is not used to resolve this project's imports.

```sh
which node
node --version
which npm
npm --version
compact --version
compact compile +0.31.1 --version
npm ci --ignore-scripts --no-audit --no-fund
npm test
```

`npm test` runs compilation, TypeScript checking, then Vitest against the
compiler-generated JavaScript. Individual commands:

```sh
npm run compile
npm run typecheck
./node_modules/.bin/vitest run tests/reconciliation.test.ts
```

Compilation deliberately uses `--skip-zk`: it emits contract JavaScript, type
declarations, compiler metadata and ZKIR, but does not generate proving keys.
The default test command does not generate proofs. The separate full compilation
and real proving workflow is documented below. Runtime `proofData` is execution
data, not a cryptographic proof. Never publish its private transcript or state.

## Money and constraints

All five witness fields (`total_sales`, `pos`, `cash`, `eft`, `credit`) are
non-negative integer **kurus**, represented as TypeScript `bigint` and Compact
`Uint<64>`. Each is bounded by `0 <= amount <= 18446744073709551615`.
There is no floating-point conversion or rounding. Python parity is restricted
to inputs already normalized to whole kurus within these bounds.

The contract, not the TypeScript witness, computes:

- `calculated_total = pos + cash + eft + credit`
- absolute difference at most the public tolerance, inclusive: `MATCHED`
- sales exceed the collection total by more than the public tolerance: `SHORTAGE`
- collection total exceeds sales by more than the public tolerance: `SURPLUS`

Tolerance is a public circuit argument in integer kurus (0 through 100000), with a TypeScript default of 100. The FuelOS integration uses the tolerance frozen at shift close. Each pair of channels
fits `Uint<65>`; their sum is at most `4 * (2^64 - 1) = 2^66 - 4`, so it fits
`Uint<66>`. Sales are widened to the same type. Subtraction is performed only
after comparison, with the larger operand first, preventing unsigned underflow.

`cash` means the net cash supplied to the existing Python motor, not the gross
closing drawer count. The PoC does not select transactions, subtract opening
cash, or implement DEC-002 missing-declaration fallbacks. Channel discrepancies
may offset one another, as in the Python total-reconciliation rule.

## Private inputs and public result

`financialInputs()` is a witness returning one `FinancialInputs` struct from
the caller's local private state. It supplies data only; generated runtime
validation checks witness types/ranges, and the Compact circuit determines
the class. No separate TypeScript implementation of reconciliation is used.

The exported `reconcile(claim, tolerance, contextDigest)` circuit checks that its private computation
equals the supplied enum claim, then writes that claim into the public
`reconciliationClass` ledger field through explicit `disclose(claim)`.
`disclose()` alone is not publication: the ledger operation makes the class
public. The public `reconciliationTolerance` and `reconciliationContextDigest` fields record the disclosed tolerance and the caller-supplied 32-byte metadata digest. There are no ledger operations inside the private arithmetic branches.

| Enum | Encoding | FuelOS API equivalent |
| --- | --- | --- |
| MATCHED | 0 | matched |
| SHORTAGE | 1 | shortage |
| SURPLUS | 2 | surplus |

Neither monetary inputs, calculated total nor exact difference are public
contract fields or return values. The circuit returns an empty tuple.
The public state reveals the category, tolerance, and shift metadata digest, but no private amount or exact difference.

The default initial ledger class is MATCHED because the enum starts at zero;
it is **not** evidence that reconciliation has run. This prototype
records only the last successful call and is not a historical shift registry.

## Proof semantics and limitations

A valid SHORTAGE or SURPLUS claim is accepted. Financial disagreement is not
an invalid computation. A falsely claimed class causes the circuit assertion
to fail. Invalid witness amounts are rejected as well.

The proof statement is: "these private amounts imply this public class under
the disclosed tolerance policy and supplied shift context digest." Logic tests execute this relation; the separate
proof tests generate real proofs. The opt-in local ledger test submits a real
transaction and checks the finalized public statement; it does not prove that
the amounts came from FuelOS source records.

The backend authorizes access to a FuelOS shift and supplies a digest of shift
metadata to Compact. There is no commitment to its transaction snapshot,
uniqueness, or replay protection. The proof alone is not evidence that its
private amounts are a specific shift's complete records. See [VERIFICATION.md](VERIFICATION.md).

## Tests

Vectors are copied in whole kurus from the requested Python-reference cases:

| Case | Sales | POS | Cash | EFT | Credit | Total | Difference | Class |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| A | 100000 | 40000 | 30000 | 20000 | 10000 | 100000 | 0 | MATCHED |
| B | 250000 | 25000 | 100000 | 75000 | 25000 | 225000 | 25000 | SHORTAGE |
| C | 100000 | 39900 | 30000 | 20000 | 10000 | 99900 | 100 | MATCHED |
| D | 100000 | 39900 | 30000 | 20000 | 9999 | 99899 | 101 | SHORTAGE |
| E | 100000 | 40000 | 40000 | 20000 | 10000 | 110000 | -10000 | SURPLUS |

Total and difference in this table/vector metadata are local expectations,
not public circuit outputs. The tests inspect the actual compiled circuit's
class/ledger and require rejection of both incorrect enum claims per vector.

The original 65 tests cover:

- A-E: 15 correct/incorrect claim checks.
- Zero, -100/-101 boundaries, maximum values, four maximum channels and a
  potential Uint64-wrap false match: 21 claim checks.
- Each of five fields with negative, overflowing, fractional, string or
  missing values: 25 generated-runtime validation checks.
- Unknown public enum: 1 rejection check.
- Each class with distinct private inputs: 3 checks of identical public
  inputs/outputs/transcripts, different private transcripts, and the
  public ledger fields. These are regression checks, not a cryptographic audit.

After the context-binding update, `npm test` completed with **82 passed**, including compiler
0.31.1 and TypeScript checks.

## Generated files

`managed/` and `node_modules/` are ignored; do not edit generated code.
Compiler 0.31.1 with `--skip-zk` produces:

```text
managed/reconciliation/
  compiler/contract-info.json
  contract/index.js
  contract/index.js.map
  contract/index.d.ts
  zkir/reconcile.zkir
```

Metadata confirms language 0.23.0, runtime 0.16.0, a provable `reconcile`
circuit, an enum claim, integer tolerance and 32-byte context digest arguments, one financial witness, and public class/tolerance/digest ledger fields.

## Real local proving

Pinned additional dependencies (all **4.1.1**):
`@midnight-ntwrk/midnight-js-http-client-proof-provider`,
`@midnight-ntwrk/midnight-js-node-zk-config-provider`,
`@midnight-ntwrk/midnight-js-protocol`, and
`@midnight-ntwrk/midnight-js-types`. Compact runtime remains **0.16.0**.

```sh
npm test
npm run compile:full
npm run test:handoff
npm run verification:manifest
```

Compiler 0.31.1 replaces the output directory: running `npm test` or
`npm run compile` afterwards removes the keys and binary ZKIR. Run
`npm run compile:full` again before `npm run test:proof`, `npm run test:handoff`,
or `npm run verification:manifest`. The proof command
deliberately does not invoke the fast compile script.

Full compilation produces these artifacts in addition to the files
above (observed sizes for this contract/compiler):

| Artifact under managed/reconciliation | Bytes |
| --- | ---: |
| keys/reconcile.prover | 287580 |
| keys/reconcile.verifier | 1351 |
| zkir/reconcile.bzkir | 279 |

Docker Engine is installed inside Ubuntu/WSL from Docker's official APT
repository. Docker Desktop is not required for this setup. The user has not
been added to the Docker group; use `sudo` for Docker management.

```sh
sudo docker run -d --name fuelos-proof-server \
  --log-driver none -e RUST_LOG=warn \
  -p 127.0.0.1:6300:6300 \
  midnightntwrk/proof-server:8.1.0 midnight-proof-server
curl --fail http://127.0.0.1:6300/health
curl --fail http://127.0.0.1:6300/version
curl --fail http://127.0.0.1:6300/ready
npm run test:proof -- -t "proves A"
npm run test:proof
```

If the named container already exists, use `sudo docker start
fuelos-proof-server`. Stop it with `sudo docker stop fuelos-proof-server`.
The image digest used was
`sha256:801bbc0340e9e96f16735f77b523f23c7459e3359842f7c79c2c53f4e994d531`.
Do not enable verbose/debug request logging. Docker log persistence is disabled;
the server may still emit startup diagnostics. Startup downloads public proving
parameters; this is not a connection to a blockchain.

`src/execution.ts` runs the generated circuit and serializes its proving preimage
in memory. `src/proof.ts` checks the pinned server version/readiness, loads local
artifacts using `NodeZkConfigProvider`, then calls the low-level
`httpClientProvingProvider.check()` and `.prove()` for circuit ID `reconcile`.
No mock provider or fallback is used. Errors expose only their stage, not the
original private-bearing diagnostics. Preimages are not written to disk;
best-effort buffer cleanup is not a guarantee of secure JavaScript memory erasure.

The server receives private witness/transcript data and therefore can learn
the financial inputs. Only the local trusted prover should receive them.
The returned binary proof stays in memory. Tests log only case, public class,
stage outcomes and proof length. Keys and ZKIR are loaded from the filesystem,
not exposed through an HTTP artifact service.

Updated context-bound WSL results: A/MATCHED, B/SHORTAGE and E/SURPLUS each passed execution,
check and prove, returning **2940 bytes** each. A/SHORTAGE failed during circuit
execution before HTTP calls. A separate 3 TL difference / 5 TL public tolerance case also produced 2940 bytes. The real proof suite passed **5/5** tests.
`check()` checks constraints; it is not independent verification of a proof.
See [the independent verification note](VERIFICATION.md) for the local ledger
test and remaining production requirements.

## Opt-in local ledger test

With the official local Midnight node, indexer, and proof server reachable only
on localhost, run `npm run compile:full` followed by `npm run test:ledger`.
The test uses the local development genesis wallet, deploys a fresh contract,
submits vector A/MATCHED, waits for finalization, and compares the public class,
tolerance, and context digest against the indexer state. A wrong class or digest
must fail the comparison. It is a state check for the latest call on that test
contract, not a reusable receipt for a production shift. No private amount is
printed. The wallet seed is public and has no value outside a disposable local
`undeployed` network. See [VERIFICATION.md](VERIFICATION.md).

## Official references

- [Compact reference](https://docs.midnight.network/compact/reference/compact-reference)
- [Explicit disclosure](https://docs.midnight.network/compact/reference/explicit-disclosure)
- [JavaScript contract logic testing](https://docs.midnight.network/guides/compact-javascript-runtime)
- [Toolchain installation](https://docs.midnight.network/getting-started/installation)
- [Compatibility matrix](https://docs.midnight.network/relnotes/support-matrix.md)

Current documentation may describe newer APIs. This PoC's syntax and runtime
calls were checked against the pinned, installed compiler and generated types.
