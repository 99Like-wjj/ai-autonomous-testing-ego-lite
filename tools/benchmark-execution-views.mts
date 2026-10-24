/** Reproducible synthetic CLI benchmark. Refuses existing output or real-run inputs. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { init, start, registerEvidence, readExecutionView, readExecutionQuery, executeRequest } from '../src/scripts/ego.mjs';
import { canonicalHash, json, readJSON, writeNew, directory, withRunLock } from '../src/core/common.mjs';
import { parseLedger } from '../src/execution/ledger.mjs';
import type { Baseline } from '../src/contracts/model.mjs';
import type { ExecutionRequest } from '../src/contracts/execution-model.mjs';

async function prepare(root: string, history = 1000, evidenceCount = 50, evidenceBytes = 70200): Promise<void> {
  if (![history, evidenceCount, evidenceBytes].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('Synthetic sizes must be nonnegative safe integers.');
  await directory(path.dirname(root)); await fs.mkdir(root);
  const proofId = crypto.randomUUID();
  await writeNew(path.join(root, 'synthetic-marker.json'), json({ kind: 'ego014-ad-query-benchmark', syntheticOnly: true, proofId }));
  const project = path.join(root, 'project'), run = path.join(root, 'run'); await init(project);
  const baseline: Baseline = { schemaVersion: 3, project: 'Offline synthetic query benchmark', cases: Array.from({ length: 100 }, (_, i) => ({ id: 'case-' + i, title: 'Synthetic query case ' + i, basis: { kind: 'hypothesis', source: 'Offline benchmark fixture only', text: 'No business acceptance or real browser execution.' }, criticalConditions: [], expected: 'Synthetic records remain associated.', requiredPath: null, stepOrder: 'strict', steps: [{ id: 'inspect', action: 'Inspect synthetic records only.' }] })) };
  const casesFile = path.join(project, 'cases.json'); await writeNew(casesFile, json(baseline));
  await start({ projectDir: project, casesFile, outputDir: run, maxParallelCases: 3 });
  const unit = 'SYNTHETIC OFFLINE EVIDENCE\n', source = path.join(root, 'synthetic.log'); await writeNew(source, unit.repeat(Math.ceil(evidenceBytes / unit.length)).slice(0, evidenceBytes));
  for (let i = 0; i < evidenceCount; i++) await registerEvidence({ runDir: run, request: { schemaVersion: 3, operationId: 'benchmark-evidence-' + i, expectedRevision: i, caseId: 'case-' + (i % 100), sourceFile: source, kind: 'log', source: 'Synthetic benchmark generator', description: 'Synthetic text, not a real screenshot or business observation.' } });
  const ledger = parseLedger(await readJSON(path.join(run, 'execution.json'))), at = new Date().toISOString();
  // Bulk-build valid synthetic history so fixture-generation time is not a scheduler benchmark.
  for (let i = 0; i < history; i++) {
    const operationId = 'benchmark-note-' + i;
    const request: ExecutionRequest = { schemaVersion: 1, kind: 'note', operationId, expectedRevision: i, reason: 'Synthetic historical observation ' + i + ': ' + 'file-query-data '.repeat(15), category: 'observation' };
    ledger.operations.push({ operationId, payloadSha256: canonicalHash(request), request, startedAt: at, receipt: { operationId, kind: 'note', revision: i + 1 } });
    ledger.events.push({ operationId, revision: i + 1, at, kind: 'note:observation', reason: request.reason });
  }
  ledger.revision = history; parseLedger(ledger); await fs.writeFile(path.join(run, 'execution.json'), json(ledger));
  let sequence = 0;
  const request = async (kind: ExecutionRequest['kind'], values: Record<string, unknown>) => {
    const state = await readExecutionView(run);
    return executeRequest({ runDir: run, request: { schemaVersion: 1, operationId: 'benchmark-setup-' + ++sequence, expectedRevision: state.revision, reason: 'Synthetic setup only', kind, ...values } });
  };
  await request('inventory', { spaceIds: [900] }); await request('capacity', { availableWorkers: 8 });
  for (let i = 0; i < 3; i++) {
    const state = await readExecutionView(run), receipt = await request('reserve', { caseId: 'case-' + i, baselineSha256: state.baselineSha256 });
    if (!receipt.assignmentId || !receipt.workerDirectory) throw new Error('Missing synthetic reservation.');
    const receiptFile = path.join(run, receipt.workerDirectory, 'synthetic-space.json');
    await writeNew(receiptFile, json({ syntheticOnly: true, spaceId: 10000 + i, noBrowserWasOpened: true }));
    await request('attach-space', { assignmentId: receipt.assignmentId, spaceId: 10000 + i, name: 'synthetic-' + i, receiptFile, created: true });
    await request('reconcile', { assignmentId: receipt.assignmentId, state: i === 2 ? 'lost' : 'running', inFlight: true });
  }
  const checked = await readExecutionView(run);
  await writeNew(path.join(root, 'fixture.json'), json({ syntheticOnly: true, proofId, run, runId: checked.runId, baselineSha256: checked.baselineSha256, revision: checked.revision, assignmentId: checked.assignments[0]?.id, cases: 100, historicalNotes: history, retainedEvidenceFiles: evidenceCount, evidenceBytesPerFile: evidenceBytes, actualBrowserCalls: 0 }));
  process.stdout.write('Prepared synthetic fixture: ' + root + '\n');
}
async function measure(root: string, label: string, view: string, cli: string, integrity?: string): Promise<void> {
  if (!/^[a-z0-9-]+$/.test(label) || !['legacy', 'summary', 'assignment', 'full'].includes(view)) throw new Error('Invalid measurement label/view.');
  if (integrity !== undefined && !['metadata', 'full'].includes(integrity)) throw new Error('Unknown benchmark integrity scope.');
  const marker: unknown = await readJSON(path.join(root, 'synthetic-marker.json'));
  if (!marker || typeof marker !== 'object' || !('kind' in marker) || marker.kind !== 'ego014-ad-query-benchmark' || !('syntheticOnly' in marker) || marker.syntheticOnly !== true) throw new Error('Refusing a non-synthetic fixture.');
  const run = path.join(root, 'run'), state = await readExecutionView(run), assignmentId = state.assignments[0]?.id;
  if (!assignmentId) throw new Error('Missing synthetic assignment.');
  const output = path.join(root, label); await fs.mkdir(output);
  const preload = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), 'benchmark-read-preload.mjs')).href;
  const cliBytes = await fs.readFile(cli), runtime = path.dirname(path.dirname(cli));
  const samples = [];
  for (let i = -3; i < 10; i++) {
    const metricsFile = path.join(output, 'io-' + (i < 0 ? 'warmup-' + -i : i) + '.json');
    const args = ['--import', preload, cli, 'execution', 'read', '--run-dir', run, ...(view === 'legacy' ? [] : ['--view', view]), ...(view === 'assignment' ? ['--assignment-id', assignmentId] : []), ...(integrity === undefined ? [] : ['--integrity', integrity])];
    const began = performance.now();
    const child = spawnSync(process.execPath, args, { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024, windowsHide: true, env: { ...process.env, EGO_BENCH_METRICS: metricsFile, EGO_BENCH_RUN: run, EGO_BENCH_RUNTIME: runtime } });
    const elapsedMs = performance.now() - began;
    if (child.error || child.status !== 0) throw new Error('Benchmark query failed: ' + child.stderr?.toString('utf8') + ' ' + (child.error?.message ?? ''));
    const parsed: unknown = JSON.parse(child.stdout.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || !('runId' in parsed) || parsed.runId !== state.runId || !('revision' in parsed) || parsed.revision !== state.revision) throw new Error('Query identity/revision drift.');
    const io: unknown = await readJSON(metricsFile);
    if (i >= 0) samples.push({ elapsedMs, outputBytes: child.stdout.length, io });
    if (i === 0) await writeNew(path.join(output, 'query-output.json'), child.stdout.toString('utf8'));
  }
  const elapsed = samples.map(sample => sample.elapsedMs).sort((a, b) => a - b);
  const result = { syntheticOnly: true, node: process.version, label, view, integrity: integrity ?? 'command-default', runId: state.runId, revision: state.revision, cliSha256: crypto.createHash('sha256').update(cliBytes).digest('hex'), warmup: 3, sampleCount: samples.length, medianMs: ((elapsed[4] ?? 0) + (elapsed[5] ?? 0)) / 2, outputBytes: samples[0]?.outputBytes, samples, limitations: ['Instrumented CLI wall time includes startup, tool-file checks, validation, projection and JSON output.', 'File reads are observed at promises.readFile and FileHandle async-stream consumption; no OS cache misses, CPU attribution or business speedups are measured.', 'The valid history was bulk-generated offline, not observed browser execution.'] };
  await writeNew(path.join(output, 'measurement.json'), json(result));
  process.stdout.write(JSON.stringify({ label, view, medianMs: result.medianMs, outputBytes: result.outputBytes, sampleCount: result.sampleCount }) + '\n');
}
async function contention(root: string): Promise<void> {
  const marker = await readJSON(path.join(root, 'synthetic-marker.json'));
  if (!marker || typeof marker !== 'object' || !('syntheticOnly' in marker) || marker.syntheticOnly !== true) throw new Error('Refusing a non-synthetic fixture.');
  const run = path.join(root, 'run'), initial = await readExecutionView(run);
  const request = { schemaVersion: 1, kind: 'note', category: 'observation', operationId: 'explicit-contention-write', expectedRevision: initial.revision, reason: 'Synthetic controlled interleaving.' };
  let lockConflicts = 0;
  await withRunLock(run, async () => {
    const outcomes = await Promise.allSettled([readExecutionQuery(run), executeRequest({ runDir: run, request })]);
    lockConflicts = outcomes.filter(result => result.status === 'rejected' && /locked/.test(String(result.reason))).length;
  });
  if (lockConflicts !== 2) throw new Error('Unexpected lock behavior.');
  const committed = await executeRequest({ runDir: run, request }), observed = await readExecutionQuery(run);
  if (observed.revision !== committed.revision) throw new Error('Mixed query revision.');
  let revisionConflicts = 0;
  try { await executeRequest({ runDir: run, request: { ...request, operationId: 'explicit-stale-write' } }); }
  catch (caught) { if (/revision conflict/i.test(String(caught))) revisionConflicts++; else throw caught; }
  if (revisionConflicts !== 1) throw new Error('A stale write was not rejected.');
  await writeNew(path.join(root, 'contention.json'), json({ syntheticOnly: true, lockConflicts, revisionConflicts, successfulWrites: 1, successfulQueries: 1, initialRevision: initial.revision, finalRevision: observed.revision, actualBrowserCalls: 0 }));
  process.stdout.write('Controlled interleaving verified.\n');
}
const [action, root, label, view, cli, integrity] = process.argv.slice(2);
if (!root || !path.isAbsolute(root)) throw new Error('Use prepare ABS_NEW_OUTPUT or measure ABS_OUTPUT LABEL VIEW ABS_CLI.');
if (action === 'prepare') await prepare(root, label === undefined ? 1000 : Number(label), view === undefined ? 50 : Number(view), cli === undefined ? 70200 : Number(cli));
else if (action === 'measure' && label && view && cli && path.isAbsolute(cli)) await measure(root, label, view, cli, integrity);
else if (action === 'contention') await contention(root);
else throw new Error('Unknown benchmark command.');
