import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { Baseline } from '../src/contracts/model.mjs';
import type { ExecutionRequest, WorkerPacket } from '../src/contracts/execution-model.mjs';
import { init, start, check, executeRequest, readExecutionView, readExecutionQuery, main, sealPacket, report, verifyReport, recordResult } from '../src/scripts/ego.mjs';
import { withRunLock } from '../src/core/common.mjs';
import vm from 'node:vm';
import { parseCatalog, parseResults } from '../src/core/validation.mjs';
import { requiredTargets } from '../src/execution/packets.mjs';
import { cliParallelLimit } from '../src/execution/config.mjs';
import { parsePacket } from '../src/execution/parse.mjs';
import { at, readJson, FakeElement } from './support.mjs';

const write = (file: string, value: unknown) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
function renderOffline(html: string) {
  const names = ['report-data', 'project-line', 'integrity', 'summary', 'report-context', 'execution-summary', 'evidence-coverage', 'search', 'status-filter', 'shown', 'empty-results', 'case-list', 'lightbox-image', 'lightbox-error', 'lightbox-caption', 'lightbox', 'lightbox-close'] as const;
  const nodes = Object.fromEntries(names.map(name => [name, new FakeElement()])) as Record<typeof names[number], FakeElement>;
  const payload = html.match(/<script type="application\/json" id="report-data">([\s\S]*?)<\/script>/); assert.ok(payload); nodes['report-data'].textContent = at(payload, 1); nodes['status-filter'].value = 'all';
  const script = at(at([...html.matchAll(/<script(?![^>]*application\/json)[^>]*>([\s\S]*?)<\/script>/g)]), 1);
  new vm.Script(script).runInNewContext({ document: { getElementById: (name: typeof names[number]) => nodes[name], querySelector: (selector: string) => nodes[selector.slice(1) as typeof names[number]], createElement: (tag: string) => new FakeElement(tag) } });
  const text = (node: FakeElement): string => [node.textContent, ...node.children.map(text)].join(' ');
  return { nodes, text };
}
async function fixture(t: TestContext, options: { limit?: number; count?: number; projectConfig?: unknown; fileConfig?: unknown; explicitFile?: string; firstCaseConditions?: string[]; firstCaseQuestions?: string[] } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ego-execution-'));
  t.after(async () => { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('ego-execution-')); await fs.rm(root, { recursive: true, force: true }); });
  const project = path.join(root, 'project'), run = path.join(root, 'run'); await init(project);
  const baseline: Baseline = { schemaVersion: 3, project: 'Synthetic transaction testing only', cases: Array.from({ length: options.count ?? 14 }, (_, i) => ({
    id: 'case-' + i, title: 'Synthetic case ' + i, basis: { kind: 'explicit', source: 'Synthetic fixture, not a business system', text: 'Synthetic values are kept with their case.' },
    criticalConditions: i === 0 ? options.firstCaseConditions ?? ['Use only the synthetic fixture.'] : ['Use only the synthetic fixture.'], expected: 'The synthetic value is associated with this case.', requiredPath: 'Synthetic entry', stepOrder: 'strict',
    ...(i === 0 && options.firstCaseQuestions ? { clarificationQuestions: options.firstCaseQuestions } : {}),
    steps: [{ id: 'open', action: 'Open the synthetic fixture.' }, { id: 'inspect', action: 'Inspect this case value.' }]
  })) };
  const casesFile = path.join(project, 'cases.json'); await write(casesFile, baseline);
  if (options.projectConfig !== undefined) await write(path.join(project, 'execution-config.json'), options.projectConfig);
  let configFile = options.explicitFile;
  if (options.fileConfig !== undefined) { configFile = path.join(root, 'explicit.json'); await write(configFile, options.fileConfig); }
  await start({ projectDir: project, casesFile, outputDir: run, maxParallelCases: options.limit, configFile });
  let sequence = 0;
  const request = async (kind: ExecutionRequest['kind'], values: Record<string, unknown> = {}, operationId = 'op-' + ++sequence) => {
    const state = await readExecutionView(run);
    return executeRequest({ runDir: run, request: { schemaVersion: 1, operationId, expectedRevision: state.revision, reason: 'Synthetic ' + kind, kind, ...values } });
  };
  const inventory = () => request('inventory', { spaceIds: [900, 901] });
  const reserve = async (caseId: string, resources: string[] = []) => {
    const state = await readExecutionView(run), receipt = await request('reserve', { caseId, baselineSha256: state.baselineSha256, resources }); assert.ok(receipt.assignmentId);
    const a = (await readExecutionView(run)).assignments.find(a => a.id === receipt.assignmentId); assert.ok(a); return a;
  };
  const attach = async (assignmentId: string, spaceId: number) => {
    const state = await readExecutionView(run), a = state.assignments.find(a => a.id === assignmentId); assert.ok(a);
    const receiptFile = path.join(run, ...a.workerDirectory.split('/'), 'creation-' + spaceId + '.json'); await write(receiptFile, { syntheticOnly: true, spaceId });
    return request('attach-space', { assignmentId, spaceId, name: 'synthetic-' + spaceId, receiptFile, created: true });
  };
  const packet = async (assignmentId: string, { packetId = 'packet-' + ++sequence, status = 'pass', actualSpace = 71, window }: { packetId?: string; status?: 'pass' | 'fail' | 'inconclusive'; actualSpace?: number; window?: [string, string] } = {}) => {
    const a = (await readExecutionView(run)).assignments.find(a => a.id === assignmentId); assert.ok(a); const c = baseline.cases.find(c => c.id === a.caseId); assert.ok(c);
    const worker = path.join(run, ...a.workerDirectory.split('/')), evidence = 'captures/' + packetId + '.log'; await fs.writeFile(path.join(worker, evidence), 'Synthetic observation for ' + c.id + '\n', { flag: 'wx' });
    const draft = { packetId, mode: 'final', record: { status, observed: 'Synthetic observation.', rationale: 'Synthetic operator assessment only.', remainingQuestions: [], evidenceKeys: ['log'], cause: 'unknown' }, evidence: [{ key: 'log', path: evidence, kind: 'log', source: 'Synthetic fixture', description: 'Synthetic observation, not a screenshot.' }], goalAssessments: [{ targets: requiredTargets(c), status: status === 'pass' ? 'verified' : status === 'fail' ? 'violation' : 'inconclusive', observed: 'Synthetic observation.', rationale: 'Synthetic assessment.', evidenceKeys: ['log'] }], spaceUsage: [{ spaceId: actualSpace, reason: 'Synthetic-only routing observation.', evidenceKeys: ['log'] }], ...(window ? { executionWindow: { startedAt: window[0], endedAt: window[1], evidenceKeys: ['log'] } } : {}) };
    const draftFile = path.join(worker, 'draft-' + packetId + '.json'); await write(draftFile, draft);
    const sealed = await sealPacket({ runDir: run, assignment: assignmentId, draftFile }); return { sealed, draft, draftFile, worker };
  };
  const importRequest = async (packetFile: string, operationId = 'import-' + ++sequence, extra: Record<string, unknown> = {}) => ({ schemaVersion: 1, operationId, expectedRevision: (await readExecutionView(run)).revision, reason: 'Synthetic reviewed import.', kind: 'import', packetFile, review: { decision: 'accept', reviewer: 'Synthetic coordinator', rationale: 'Synthetic evidence reviewed against the frozen goals.' }, ...extra });
  return { root, project, run, baseline, casesFile, request, inventory, reserve, attach, packet, importRequest };
}

async function resourceGap(f: Awaited<ReturnType<typeof fixture>>, assignmentId: string, packetId: string) {
  const state = await readExecutionView(f.run), a = state.assignments.find(a => a.id === assignmentId); assert.ok(a);
  const c = f.baseline.cases.find(c => c.id === a.caseId); assert.ok(c);
  const draftFile = path.join(f.run, ...a.workerDirectory.split('/'), packetId + '-draft.json');
  await write(draftFile, {
    packetId, mode: 'final',
    record: { status: 'blocked', observed: 'Synthetic reader session has not been supplied. No UI action was attempted.', rationale: 'A required synthetic session is missing; the product outcome is untested.', remainingQuestions: ['Provide the synthetic reader session.'], evidenceKeys: [], cause: 'environment' },
    evidence: [],
    goalAssessments: [{ targets: requiredTargets(c), status: 'not_tested', observed: '', rationale: 'No goal check was performed while the synthetic resource was missing.', evidenceKeys: [] }],
    spaceUsage: [{ spaceId: null, reason: 'No browser was used or Space created; the existing ID field has no not-used variant.', evidenceKeys: [] }]
  });
  return sealPacket({ runDir: f.run, assignment: assignmentId, draftFile });
}

test('resource gaps reuse blocked records and explicit untested goals while an independent case completes', async t => {
  const f = await fixture(t, { count: 2, limit: 2, firstCaseConditions: ['An authorized synthetic reader session is available.'] });
  const baselineBefore = await fs.readFile(path.join(f.run, 'baseline.json'));
  await f.inventory(); const affected = await f.reserve('case-0'), independent = await f.reserve('case-1');
  const gap = await resourceGap(f, affected.id, 'missing-reader');
  await executeRequest({ runDir: f.run, request: await f.importRequest(gap.packetFile) });
  await f.request('reconcile', { assignmentId: affected.id, state: 'paused', inFlight: false });
  const other = await f.packet(independent.id);
  await executeRequest({ runDir: f.run, request: await f.importRequest(other.sealed.packetFile) });
  await f.request('reconcile', { assignmentId: independent.id, state: 'completed', inFlight: false });
  const checked = await check(f.run), blocked = checked.cases.find(c => c.id === 'case-0'); assert.ok(blocked);
  assert.deepEqual(checked.counts, { pass: 1, fail: 0, inconclusive: 0, blocked: 1, not_run: 0 });
  assert.deepEqual(blocked.clarificationQuestions ?? [], []);
  assert.deepEqual(blocked.remainingQuestions, ['Provide the synthetic reader session.']);
  assert.equal(checked.progress.pendingClarification.count, 0);
  assert.ok((await readExecutionView(f.run)).assignments.find(a => a.id === affected.id)?.goalAssessments.every(goal => goal.status === 'not_tested'));
  assert.deepEqual(await fs.readFile(path.join(f.run, 'baseline.json')), baselineBefore);
  const out = await report(f.run), rendered = renderOffline(await fs.readFile(out.reportHtml, 'utf8'));
  const displayed = rendered.text(rendered.nodes['case-list']);
  assert.match(displayed, /未测试/); assert.match(displayed, /Provide the synthetic reader session/);
  assert.equal((await verifyReport(f.run)).filesVerified, true);
});

test('supplied resources can be recorded under the same baseline without losing blocked history or prior reports', async t => {
  const f = await fixture(t, { count: 1, firstCaseConditions: ['An authorized synthetic reader session is available.'] });
  const baselineBefore = await fs.readFile(path.join(f.run, 'baseline.json'));
  await f.inventory(); const first = await f.reserve('case-0'), gap = await resourceGap(f, first.id, 'initial-gap');
  await executeRequest({ runDir: f.run, request: await f.importRequest(gap.packetFile) });
  await f.request('reconcile', { assignmentId: first.id, state: 'paused', inFlight: false });
  const priorDir = path.join(f.root, 'before-resources'); await fs.mkdir(priorDir);
  const prior = await report(f.run, { outputDir: priorDir }), reportBefore = await fs.readFile(prior.reportHtml), packetBefore = await fs.readFile(gap.packetFile);
  const resumed = await f.reserve('case-0'), supplied = await f.packet(resumed.id, { packetId: 'verified-after-supply' });
  await executeRequest({ runDir: f.run, request: await f.importRequest(supplied.sealed.packetFile) });
  await f.request('reconcile', { assignmentId: resumed.id, state: 'completed', inFlight: false });
  const checked = await check(f.run), current = at(checked.cases);
  assert.equal(current.status, 'pass'); assert.equal(current.attempts.length, 1);
  assert.equal(at(current.attempts).status, 'blocked');
  assert.deepEqual(at(current.attempts).remainingQuestions, ['Provide the synthetic reader session.']);
  assert.deepEqual(current.remainingQuestions, []);
  assert.deepEqual(await fs.readFile(path.join(f.run, 'baseline.json')), baselineBefore);
  assert.deepEqual(await fs.readFile(gap.packetFile), packetBefore);
  assert.deepEqual(await fs.readFile(prior.reportHtml), reportBefore);
  assert.equal((await readExecutionView(f.run)).imports.filter(i => i.phase === 'complete').length, 2);
  const out = await report(f.run), rendered = renderOffline(await fs.readFile(out.reportHtml, 'utf8'));
  assert.match(rendered.text(rendered.nodes['case-list']), /Provide the synthetic reader session/);
  assert.equal((await verifyReport(f.run)).filesVerified, true);
});

test('resource recovery does not resolve frozen acceptance questions or permit pass/fail', async t => {
  const f = await fixture(t, { count: 1, firstCaseQuestions: ['What synthetic behavior is accepted?'] });
  const baselineBefore = await fs.readFile(path.join(f.run, 'baseline.json'));
  await f.inventory(); const first = await f.reserve('case-0'), gap = await resourceGap(f, first.id, 'resource-and-spec-gap');
  await executeRequest({ runDir: f.run, request: await f.importRequest(gap.packetFile) });
  await f.request('reconcile', { assignmentId: first.id, state: 'paused', inFlight: false });
  const resumed = await f.reserve('case-0');
  await assert.rejects(f.packet(resumed.id, { packetId: 'resource-supplied-but-acceptance-pending' }), /Pending clarification/);
  const checked = await check(f.run);
  assert.equal(checked.counts.pass, 0); assert.equal(checked.counts.fail, 0);
  assert.equal(checked.progress.pendingClarification.count, 1);
  assert.deepEqual(await fs.readFile(path.join(f.run, 'baseline.json')), baselineBefore);
});

test('v4 run snapshots configuration; precedence and later project edits are explicit', async t => {
  const f = await fixture(t, { limit: 8, projectConfig: { schemaVersion: 1, maxParallelCases: 4 }, fileConfig: { schemaVersion: 1, maxParallelCases: 6 } });
  const state = await readExecutionView(f.run);
  assert.equal(state.configuration.kind, 'override'); assert.equal(state.configuration.requestedMaxParallelCases, 8); assert.equal(state.configuration.configuration.maxParallelCases, 6); assert.ok(state.configuration.configSha256);
  assert.equal(state.knownAvailableWorkers, null); assert.equal(state.summary.reportedExecutionPeak, null);
  assert.equal((await check(f.run)).schemaVersion, 4);
  await fs.writeFile(path.join(f.project, 'execution-config.json'), JSON.stringify({ schemaVersion: 1, maxParallelCases: 12 }));
  assert.equal((await readExecutionView(f.run)).configuration.requestedMaxParallelCases, 8);
  assert.equal((await fixture(t)).baseline.schemaVersion, 3);
});

test('default, project, and explicit-file settings remain distinct; malformed explicit input never falls back', async t => {
  const defaultRun = await fixture(t); assert.equal((await readExecutionView(defaultRun.run)).configuration.requestedMaxParallelCases, 1);
  const projectRun = await fixture(t, { projectConfig: { schemaVersion: 1, maxParallelCases: 6 } }); assert.equal((await readExecutionView(projectRun.run)).configuration.kind, 'project');
  const fileRun = await fixture(t, { projectConfig: { schemaVersion: 1, maxParallelCases: 2 }, fileConfig: { schemaVersion: 1, maxParallelCases: 12 } }); assert.equal((await readExecutionView(fileRun.run)).configuration.requestedMaxParallelCases, 12);
  await assert.rejects(fixture(t, { limit: 3, explicitFile: path.join(os.tmpdir(), 'ego-nonexistent-config-' + process.pid) }), /ENOENT/);
  for (const value of [0, -1, 1.5, '3', Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(fixture(t, { projectConfig: { schemaVersion: 1, maxParallelCases: value } }), /maxParallelCases/);
  for (const value of ['0', '-1', '1.5', '3x', '9007199254740992']) assert.throws(() => cliParallelLimit(value));
  assert.equal(cliParallelLimit('12'), 12);
});

test('an unconfigured run stays serial even with spare host capacity and advances after explicit completion', async t => {
  const f = await fixture(t), initial = await readExecutionView(f.run);
  assert.equal(initial.configuration.kind, 'default');
  assert.equal(initial.configuration.initialMaxParallelCases, 1);
  assert.equal(initial.summary.activeReservations, 0);
  assert.deepEqual(await fs.readdir(path.join(f.run, 'workers')), []);
  await f.inventory(); await f.request('capacity', { availableWorkers: 8 });
  const first = await f.reserve('case-0');
  await assert.rejects(f.reserve('case-1'), /slot/);
  assert.equal((await readExecutionView(f.run)).assignments.length, 1);
  await f.request('reconcile', { assignmentId: first.id, state: 'completed', inFlight: false });
  const second = await f.reserve('case-1'), state = await readExecutionView(f.run);
  assert.equal(second.caseId, 'case-1');
  assert.equal(state.configuration.requestedMaxParallelCases, 1);
  assert.equal(state.summary.activeReservations, 1);
  assert.equal(state.peakReservations, 1);
  assert.equal((await check(f.run)).counts.pass, 0);
});

test('user limits 1, 6, and 12 are honored without a fixed two-case ceiling; huge values allocate lazily', async t => {
  for (const limit of [1, 6, 12]) {
    const f = await fixture(t, { limit }); await f.inventory();
    for (let i = 0; i < limit; i++) await f.reserve('case-' + i);
    const state = await readExecutionView(f.run); assert.equal(state.summary.activeReservations, limit); assert.equal(state.peakReservations, limit);
    await assert.rejects(f.reserve('case-' + limit), /slot/);
  }
  const huge = await fixture(t, { limit: Number.MAX_SAFE_INTEGER }); assert.deepEqual(await fs.readdir(path.join(huge.run, 'workers')), []);
});

test('known host capacity limits dispatch without rewriting the user setting; no host probing occurs', async t => {
  const f = await fixture(t, { limit: 8 }); await f.inventory(); await f.request('capacity', { availableWorkers: 3 });
  for (let i = 0; i < 3; i++) await f.reserve('case-' + i);
  await assert.rejects(f.reserve('case-3'), /slot/);
  const state = await readExecutionView(f.run); assert.equal(state.configuration.requestedMaxParallelCases, 8); assert.equal(state.knownAvailableWorkers, 3); assert.equal(state.summary.activeReservations, 3); assert.equal(state.summary.reportedExecutionPeak, null);
});

test('lowering a limit drains existing cases, never kills them; lost/stop-requested executions retain slots', async t => {
  const f = await fixture(t, { limit: 3 }); await f.inventory(); const a = await f.reserve('case-0'), b = await f.reserve('case-1'), c = await f.reserve('case-2');
  await f.request('set-limit', { maxParallelCases: 1 }); assert.equal((await readExecutionView(f.run)).summary.draining, true);
  await f.request('reconcile', { assignmentId: a.id, state: 'lost', inFlight: true }); await f.request('reconcile', { assignmentId: b.id, state: 'stop_requested', inFlight: true });
  await assert.rejects(f.reserve('case-3'), /slot/); assert.equal((await readExecutionView(f.run)).summary.activeReservations, 3);
  await assert.rejects(f.request('reconcile', { assignmentId: a.id, state: 'stopped', inFlight: true }), /in-flight/);
  for (const item of [a, b, c]) await f.request('reconcile', { assignmentId: item.id, state: 'stopped', inFlight: false });
  assert.equal((await readExecutionView(f.run)).summary.draining, false); await f.reserve('case-3');
});

test('declared conflicts and duplicate cases are rejected, while independent writes can share the pool', async t => {
  const f = await fixture(t, { limit: 6 }); await f.inventory(); await f.reserve('case-0', ['write:record-A']);
  await assert.rejects(f.reserve('case-0'), /active assignment/); await assert.rejects(f.reserve('case-1', ['write:record-A']), /resource/);
  await f.reserve('case-1', ['write:record-B']); assert.equal((await readExecutionView(f.run)).summary.activeReservations, 2);
});

test('execution mutations are idempotent and concurrent writers cannot overwrite one shared revision', async t => {
  const f = await fixture(t, { limit: 3 }); await f.inventory(); const state = await readExecutionView(f.run);
  const req = { schemaVersion: 1, kind: 'reserve', operationId: 'stable-reserve', expectedRevision: state.revision, reason: 'Synthetic reservation', caseId: 'case-0', baselineSha256: state.baselineSha256 };
  const receipt = await executeRequest({ runDir: f.run, request: req }); assert.equal((await executeRequest({ runDir: f.run, request: req })).replayed, true);
  await assert.rejects(executeRequest({ runDir: f.run, request: { ...req, reason: 'Changed' } }), /different payload/);
  assert.equal((await readExecutionView(f.run)).assignments.length, 1); assert.ok(receipt.assignmentId);
  const current = await readExecutionView(f.run);
  const outcomes = await Promise.allSettled([1, 2, 3].map(i => executeRequest({ runDir: f.run, request: { ...req, operationId: 'writer-' + i, expectedRevision: current.revision, caseId: 'case-' + i } })));
  assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1); assert.equal((await readExecutionView(f.run)).assignments.length, 2);
});

test('protected Spaces, cross-assignment claims, and inaccurate cleanup cannot acquire ownership', async t => {
  const f = await fixture(t, { limit: 3 }); await f.inventory(); const a = await f.reserve('case-0'), b = await f.reserve('case-1');
  await assert.rejects(f.attach(a.id, 900), /Protected/); await f.attach(a.id, 71); await assert.rejects(f.attach(b.id, 71), /different case/);
  await assert.rejects(f.request('inventory', { spaceIds: [] }), /immutable/);
  await f.request('reconcile', { assignmentId: a.id, state: 'completed', inFlight: false });
  const proof = path.join(f.run, 'cleanup.json'); await write(proof, { syntheticOnly: true, remaining: [900, 901, 71] });
  await assert.rejects(f.request('note', { category: 'cleanup', assignmentId: a.id, spaceIds: [71], remainingSpaceIds: [900, 901, 71], evidenceFiles: [proof] }), /still-present/);
  await assert.rejects(f.request('note', { category: 'cleanup', assignmentId: a.id, spaceIds: [900], remainingSpaceIds: [], evidenceFiles: [proof] }), /protected/);
  assert.equal((await readExecutionView(f.run)).assignments.find(item => item.id === a.id)?.ownedSpaces[0]?.closedAt, undefined);
});

test('sealing a worker packet is local, immutable, and does not commit a business result', async t => {
  const f = await fixture(t); await f.inventory(); const a = await f.reserve('case-0'); await f.attach(a.id, 71); const p = await f.packet(a.id);
  assert.equal(p.sealed.committed, false); assert.equal((await check(f.run)).counts.pass, 0);
  assert.equal((await sealPacket({ runDir: f.run, assignment: a.id, draftFile: p.draftFile })).replayed, true);
  await fs.writeFile(p.draftFile, JSON.stringify({ ...p.draft, record: { ...p.draft.record, rationale: 'Changed payload.' } }));
  await assert.rejects(sealPacket({ runDir: f.run, assignment: a.id, draftFile: p.draftFile }), /EEXIST/);
});

test('reviewed import links goal evidence, preserves Space deviations, and requires explicit slot release', async t => {
  const f = await fixture(t); await f.inventory(); const a = await f.reserve('case-0'); await f.attach(a.id, 71); const p = await f.packet(a.id, { actualSpace: 72 });
  const request = await f.importRequest(p.sealed.packetFile); await executeRequest({ runDir: f.run, request });
  const checked = await check(f.run); assert.equal(checked.counts.pass, 1); assert.equal(checked.executionSummary?.activeReservations, 1);
  const saved = checked.execution?.assignments.find(item => item.id === a.id); assert.ok(saved); assert.equal(at(saved.goalAssessments).status, 'verified'); assert.equal(at(saved.spaceHistory, 1).kind, 'deviation');
  assert.equal((await executeRequest({ runDir: f.run, request })).replayed, true);
  await f.request('reconcile', { assignmentId: a.id, state: 'completed', inFlight: false }); assert.equal((await readExecutionView(f.run)).summary.activeReservations, 0);
  const out = await report(f.run); assert.equal(out.schemaVersion, 4); assert.equal((await verifyReport(f.run)).filesVerified, true);
});

test('missing goals, worker path escapes, and altered/cross-case packets are refused without weak conclusions', async t => {
  const f = await fixture(t); await f.inventory(); const a = await f.reserve('case-0'); await f.attach(a.id, 71); const p = await f.packet(a.id);
  const incomplete = { ...p.draft, packetId: 'missing-goal', goalAssessments: [{ ...at(p.draft.goalAssessments), targets: ['expected'] }] };
  const bad = path.join(p.worker, 'bad.json'); await write(bad, incomplete); await assert.rejects(sealPacket({ runDir: f.run, assignment: a.id, draftFile: bad }), /omits frozen/);
  const escaped = path.join(p.worker, 'escaped.json'); await write(escaped, { ...p.draft, packetId: 'escaped', evidence: [{ ...at(p.draft.evidence), path: '../outside.log' }] }); await assert.rejects(sealPacket({ runDir: f.run, assignment: a.id, draftFile: escaped }), /worker-relative/);
  const packet = parsePacket(JSON.parse(await fs.readFile(p.sealed.packetFile, 'utf8')));
  const wrong = path.join(p.worker, 'wrong.json'); await write(wrong, { ...packet, caseId: 'case-1', packetId: 'wrong-case' }); await assert.rejects(executeRequest({ runDir: f.run, request: await f.importRequest(wrong) }), /does not match/);
  await fs.appendFile(path.join(p.worker, at(p.draft.evidence).path), 'Changed bytes'); await assert.rejects(executeRequest({ runDir: f.run, request: await f.importRequest(p.sealed.packetFile) }), /evidence changed/);
  assert.equal((await check(f.run)).counts.pass, 0);
});

for (const boundary of ['evidence', 'result'] as const) test('lost ' + boundary + ' response resumes exact requests without duplicate observations', async t => {
  const f = await fixture(t); await f.inventory(); const a = await f.reserve('case-0'); await f.attach(a.id, 71); const p = await f.packet(a.id);
  const request = await f.importRequest(p.sealed.packetFile);
  const hooks = boundary === 'evidence' ? { afterEvidenceCommit: async () => { throw new Error('Synthetic response loss'); } } : { afterResultCommit: async () => { throw new Error('Synthetic response loss'); } };
  await assert.rejects(executeRequest({ runDir: f.run, request }, hooks), /response loss/);
  const before = await readExecutionView(f.run); assert.equal(before.summary.pendingImportIds.length, 1);
  const compact = await readExecutionQuery(f.run); assert.ok('view' in compact); assert.equal(compact.counts.pendingImports, 1); assert.equal(at(compact.imports.items).operationId, request.operationId);
  await executeRequest({ runDir: f.run, request });
  assert.equal((await readJson(path.join(f.run, 'evidence.json'), parseCatalog)).items.length, 1);
  const results = await readJson(path.join(f.run, 'results.json'), parseResults); assert.equal(results.revision, 1); assert.equal(results.operations.length, 1); assert.deepEqual(at(results.cases).attempts, []);
  assert.equal((await readExecutionView(f.run)).summary.pendingImportIds.length, 0);
});

test('reported overlap is derived separately from reservations and counts distinct cases', async t => {
  const f = await fixture(t, { limit: 3 }); await f.inventory();
  for (let i = 0; i < 3; i++) {
    const a = await f.reserve('case-' + i); await f.attach(a.id, 71 + i);
    const p = await f.packet(a.id, { actualSpace: 71 + i, window: ['2026-10-23T00:00:00.000Z', '2026-10-23T00:01:00.000Z'] });
    await executeRequest({ runDir: f.run, request: await f.importRequest(p.sealed.packetFile) });
  }
  const state = await readExecutionView(f.run); assert.equal(state.summary.peakReservations, 3); assert.equal(state.summary.reportedExecutionPeak, 3);
});

test('an explicit coordinator revision preserves the worker proposal and does not invent a pass', async t => {
  const f = await fixture(t); await f.inventory(); const a = await f.reserve('case-0'); await f.attach(a.id, 71); const p = await f.packet(a.id);
  const review = { decision: 'revise', reviewer: 'Synthetic coordinator', rationale: 'Synthetic missing acceptance evidence.', record: { ...p.draft.record, status: 'inconclusive' }, goalAssessments: p.draft.goalAssessments.map(goal => ({ ...goal, status: 'inconclusive' })) };
  await executeRequest({ runDir: f.run, request: await f.importRequest(p.sealed.packetFile, undefined, { review }) });
  const state = await readExecutionView(f.run); assert.equal(at(state.imports).originalPacket.record.status, 'pass'); assert.equal(at(state.imports).review.record?.status, 'inconclusive'); assert.equal((await check(f.run)).counts.inconclusive, 1);
});

test('a later successful execution preserves the original failure and a stale final can become an explicit historical attempt', async t => {
  const f = await fixture(t); await f.inventory(); const first = await f.reserve('case-0'); await f.attach(first.id, 71); const failed = await f.packet(first.id, { status: 'fail' });
  await executeRequest({ runDir: f.run, request: await f.importRequest(failed.sealed.packetFile) });
  await f.request('reconcile', { assignmentId: first.id, state: 'completed', inFlight: false });
  const second = await f.reserve('case-0'); await f.attach(second.id, 72); const passed = await f.packet(second.id, { actualSpace: 72 });
  await executeRequest({ runDir: f.run, request: await f.importRequest(passed.sealed.packetFile) });
  let current = at((await check(f.run)).cases); assert.equal(current.status, 'pass'); assert.ok(current.attempts.some(a => a.status === 'fail'));
  const late = await f.packet(first.id, { packetId: 'late-original', status: 'fail' });
  await assert.rejects(executeRequest({ runDir: f.run, request: await f.importRequest(late.sealed.packetFile) }), /stale assignment/);
  await executeRequest({ runDir: f.run, request: await f.importRequest(late.sealed.packetFile, undefined, { review: { decision: 'revise', reviewer: 'Synthetic coordinator', rationale: 'Preserve the late observation without replacing the newer final.', mode: 'attempt' } }) });
  current = at((await check(f.run)).cases); assert.equal(current.status, 'pass'); assert.equal(current.attempts.filter(a => a.status === 'fail').length, 2);
});

test('an unapplied global revision conflict needs an explicit new transaction and reuses only committed evidence', async t => {
  const f = await fixture(t); await f.inventory(); const a = await f.reserve('case-0'); await f.attach(a.id, 71); const p = await f.packet(a.id); const request = await f.importRequest(p.sealed.packetFile, 'original-import');
  await assert.rejects(executeRequest({ runDir: f.run, request }, { beforeResultCommit: async () => { throw new Error('Synthetic interruption before result'); } }), /interruption/);
  await recordResult({ runDir: f.run, request: { schemaVersion: 3, operationId: 'external-result', expectedRevision: 0, caseId: 'case-1', mode: 'final', record: { status: 'blocked', observed: '', rationale: 'Synthetic external writer.', remainingQuestions: [], evidenceIds: [] } } });
  await assert.rejects(executeRequest({ runDir: f.run, request }), /Revision conflict/);
  const next = await f.importRequest(p.sealed.packetFile, 'explicit-rebase', { rebaseOf: 'original-import' }); await executeRequest({ runDir: f.run, request: next });
  const state = await readExecutionView(f.run); assert.equal(at(state.imports).phase, 'superseded'); assert.equal(at(state.imports, 1).phase, 'complete'); assert.equal(state.summary.pendingImportIds.length, 0);
  assert.equal((await readJson(path.join(f.run, 'evidence.json'), parseCatalog)).items.length, 1); assert.equal((await check(f.run)).counts.pass, 1); assert.equal((await check(f.run)).counts.blocked, 1);
});

test('v4 offline viewer presents capacity, actual intervals, notes, and every frozen goal independently', async t => {
  const f = await fixture(t, { limit: 3, count: 1 }); await f.inventory(); await f.request('capacity', { availableWorkers: 3 });
  const a = await f.reserve('case-0'); await f.attach(a.id, 71); const p = await f.packet(a.id, { window: ['2026-10-23T00:00:00.000Z', '2026-10-23T00:01:00.000Z'] });
  await executeRequest({ runDir: f.run, request: await f.importRequest(p.sealed.packetFile) }); await f.request('note', { category: 'skill-bug', assignmentId: a.id, reason: 'Synthetic diagnostic note, not a product failure.' });
  const out = await report(f.run), html = await fs.readFile(out.reportHtml, 'utf8');
  const { nodes, text } = renderOffline(html);
  assert.equal(nodes['execution-summary'].hidden, false); assert.match(text(nodes['execution-summary']), /用户并发上限 3/); assert.match(text(nodes['execution-summary']), /报告峰值 1/); assert.match(text(nodes['execution-summary']), /Synthetic diagnostic note/);
  const goals = text(nodes['case-list']); assert.match(goals, /逐目标评估/); for (const target of requiredTargets(at(f.baseline.cases))) assert.ok(goals.includes('已验证 · ' + target), target);
  const md = await fs.readFile(out.reportMarkdown, 'utf8'); assert.match(md, /用户并发上限：3/); assert.match(md, /逐目标评估/); assert.equal((await verifyReport(f.run)).filesVerified, true);
});

test('CLI defaults to a compact summary; assignment views isolate delivery references and full preserves the original API', async t => {
  const f = await fixture(t, { limit: 2, count: 3 }); await f.inventory();
  const a = await f.reserve('case-0'), b = await f.reserve('case-1'); await f.attach(a.id, 71); await f.attach(b.id, 72);
  await f.request('reconcile', { assignmentId: a.id, state: 'running', inFlight: true });
  const p = await f.packet(b.id, { actualSpace: 72 }); await executeRequest({ runDir: f.run, request: await f.importRequest(p.sealed.packetFile) });
  await f.request('reconcile', { assignmentId: b.id, state: 'completed', inFlight: false });
  await f.request('note', { category: 'observation', assignmentId: a.id, reason: 'Selected-case note.' });
  await f.request('note', { category: 'skill-bug', assignmentId: b.id, reason: 'Other-case note.' });
  const before = await fs.readFile(path.join(f.run, 'execution.json'), 'utf8');
  const summary = await main(['execution', 'read', '--run-dir', f.run]); assert.ok('view' in summary);
  assert.equal(summary.view, 'summary'); assert.equal(summary.viewVersion, 2); assert.equal(summary.integrity.scope, 'metadata'); assert.equal(summary.integrity.evidenceFiles, 'not_checked');
  assert.equal(summary.counts.activeReservations, 1); assert.equal(summary.counts.totalAssignments, 2); assert.equal(summary.counts.unassessedCases, 2);
  assert.deepEqual(summary.assignments.items.map(item => item.id), [a.id]); assert.equal(summary.assignment, null);
  assert.equal(summary.noteCounts['note:skill-bug'], 1); assert.equal(summary.imports.total, 0);
  assert.equal(Object.hasOwn(summary, 'operations'), false); assert.equal(Object.hasOwn(summary, 'events'), false); assert.equal(JSON.stringify(summary).includes('originalPacket'), false);
  const one = await main(['execution', 'read', '--run-dir', f.run, '--view', 'assignment', '--assignment-id', b.id]); assert.ok('view' in one);
  assert.equal(one.assignment?.id, b.id); assert.equal(one.assignment?.state, 'completed'); assert.equal(one.imports.total, 1);
  assert.equal(at(one.imports.items).packetFile.endsWith(path.basename(p.sealed.packetFile)), true);
  assert.ok(one.imports.items.every(item => item.assignmentId === b.id)); assert.ok(one.notes.items.every(item => item.assignmentId === b.id));
  assert.equal(JSON.stringify(one).includes('Selected-case note.'), false); assert.equal(JSON.stringify(one).includes('originalPacket'), false);
  const full = await main(['execution', 'read', '--run-dir', f.run, '--view', 'full']); assert.deepEqual(full, await readExecutionView(f.run));
  const strict = await main(['execution', 'read', '--run-dir', f.run, '--integrity', 'full']); assert.ok('view' in strict); assert.equal(strict.integrity.scope, 'full'); assert.equal(strict.integrity.evidenceFiles, 'verified'); assert.deepEqual(strict.counts, summary.counts);
  assert.equal(strict.recovery.evidenceMarker, 'absent');
  assert.equal(await fs.readFile(path.join(f.run, 'execution.json'), 'utf8'), before);
  for (const options of [['--view', 'unknown'], ['--view', 'assignment'], ['--view', 'summary', '--assignment-id', a.id], ['--view', 'full', '--assignment-id', a.id], ['--integrity', 'unknown'], ['--view', 'full', '--integrity', 'metadata']]) await assert.rejects(main(['execution', 'read', '--run-dir', f.run, ...options]), /view|assignment-id|integrity/);
  await assert.rejects(readExecutionQuery(f.run, 'assignment', 'missing-assignment'), /Unknown assignment/);
});

test('summary list and text limits are explicit, preserve the full history, and do not cap configured concurrency', async t => {
  const f = await fixture(t, { limit: 25, count: 25 }); await f.inventory();
  let revision = (await readExecutionView(f.run)).revision;
  for (let i = 0; i < 25; i++) {
    const receipt = await executeRequest({ runDir: f.run, request: { schemaVersion: 1, kind: 'reserve', operationId: 'reserve-many-' + i, expectedRevision: revision, reason: 'Synthetic display-limit check.', caseId: 'case-' + i, baselineSha256: (await readExecutionView(f.run)).baselineSha256 } }); revision = receipt.revision;
  }
  const long = '😀'.repeat(600);
  for (let i = 0; i < 7; i++) { const receipt = await executeRequest({ runDir: f.run, request: { schemaVersion: 1, kind: 'note', category: 'observation', operationId: 'long-note-' + i, expectedRevision: revision, reason: long } }); revision = receipt.revision; }
  const summary = await readExecutionQuery(f.run); assert.ok('view' in summary);
  assert.equal(summary.counts.activeReservations, 25); assert.equal(summary.configuration.requestedMaxParallelCases, 25);
  assert.equal(summary.assignments.total, 25); assert.equal(summary.assignments.items.length, 20); assert.equal(summary.assignments.truncated, true);
  assert.equal(summary.notes.total, 7); assert.equal(summary.notes.items.length, 5); assert.equal(summary.notes.truncated, true);
  assert.equal(at(summary.notes.items).operationId, 'long-note-6'); assert.equal(at(summary.notes.items).reason.truncated, true); assert.equal(Array.from(at(summary.notes.items).reason.text).length, 256);
  const full = await readExecutionView(f.run); assert.equal(full.assignments.length, 25); assert.equal(full.events.at(-1)?.reason, long);
});

test('metadata declares unchecked evidence while every strict query and shared writer refuses changed files', async t => {
  const f = await fixture(t); await f.inventory(); const a = await f.reserve('case-0'); await f.attach(a.id, 71); const p = await f.packet(a.id);
  const importRequest = await f.importRequest(p.sealed.packetFile); await executeRequest({ runDir: f.run, request: importRequest });
  const before = await readExecutionView(f.run);
  const catalog = await readJson(path.join(f.run, 'evidence.json'), parseCatalog), evidence = at(catalog.items);
  await fs.appendFile(path.join(f.run, evidence.path), 'Synthetic tampering.');
  const resultsBefore = await fs.readFile(path.join(f.run, 'results.json'), 'utf8');
  for (const view of ['summary', 'assignment']) {
    const metadata = await readExecutionQuery(f.run, view, view === 'assignment' ? a.id : undefined); assert.ok('view' in metadata); assert.equal(metadata.integrity.recordedResults, 'not_checked'); assert.equal(metadata.integrity.evidenceFiles, 'not_checked');
  }
  for (const view of ['summary', 'assignment', 'full']) await assert.rejects(readExecutionQuery(f.run, view, view === 'assignment' ? a.id : undefined, 'full'), /hash|size|changed|integrity/i);
  await assert.rejects(check(f.run), /hash|size|changed|integrity/i);
  await assert.rejects(executeRequest({ runDir: f.run, request: { schemaVersion: 1, kind: 'note', category: 'observation', operationId: 'corrupt-evidence-write', expectedRevision: before.revision, reason: 'Must not bypass full validation.' } }), /hash|size|changed|integrity/i);
  await assert.rejects(executeRequest({ runDir: f.run, request: importRequest }), /hash|size|changed|integrity/i);
  await assert.rejects(recordResult({ runDir: f.run, request: { schemaVersion: 3, operationId: 'corrupt-evidence-result', expectedRevision: parseResults(JSON.parse(resultsBefore)).revision, caseId: 'case-1', mode: 'final', record: { status: 'blocked', observed: '', rationale: 'Synthetic rejected write.', remainingQuestions: [], evidenceIds: [] } } }), /hash|size|changed|integrity/i);
  await assert.rejects(report(f.run), /hash|size|changed|integrity/i); assert.equal(await fs.readFile(path.join(f.run, 'results.json'), 'utf8'), resultsBefore);
});

test('metadata does not parse result/catalog files or a recovery marker and never performs recovery', async t => {
  const f = await fixture(t), marker = path.join(f.run, '.evidence.pending.json');
  const markerBytes = '{"syntheticOnly":true,"notAValidRecoveryRequest":true}\n'; await fs.writeFile(marker, markerBytes, { flag: 'wx' });
  await fs.writeFile(path.join(f.run, 'results.json'), 'not valid JSON\n'); await fs.writeFile(path.join(f.run, 'evidence.json'), 'not valid JSON\n');
  const files = ['manifest.json', 'baseline.json', 'execution.json', 'results.json', 'evidence.json', '.evidence.pending.json'];
  const before = await Promise.all(files.map(file => fs.readFile(path.join(f.run, file), 'utf8')));
  const metadata = await readExecutionQuery(f.run); assert.ok('view' in metadata);
  assert.equal(metadata.recovery.evidenceMarker, 'present'); assert.equal(metadata.recovery.pendingImports, 0); assert.equal(metadata.integrity.recordedResults, 'not_checked');
  assert.deepEqual(await Promise.all(files.map(file => fs.readFile(path.join(f.run, file), 'utf8'))), before);
  await assert.rejects(readExecutionQuery(f.run, 'summary', undefined, 'full'));
  assert.equal(await fs.readFile(marker, 'utf8'), markerBytes);
  await fs.unlink(marker); await assert.rejects(readExecutionQuery(f.run, 'summary', undefined, 'full'), SyntaxError);
});

test('metadata still rejects bad baseline, run identity, malformed ledger, and unsafe historical reference paths', async t => {
  const f = await fixture(t); await f.inventory(); const a = await f.reserve('case-0'); await f.attach(a.id, 71);
  const p = await f.packet(a.id); await executeRequest({ runDir: f.run, request: await f.importRequest(p.sealed.packetFile) });
  const ledgerFile = path.join(f.run, 'execution.json'), ledgerBytes = await fs.readFile(ledgerFile, 'utf8'), baselineFile = path.join(f.run, 'baseline.json'), baselineBytes = await fs.readFile(baselineFile, 'utf8');
  await fs.appendFile(baselineFile, ' '); await assert.rejects(readExecutionQuery(f.run), /Baseline hash/); await fs.writeFile(baselineFile, baselineBytes);
  for (const change of [
    (state: Awaited<ReturnType<typeof readExecutionView>>) => { state.runId = 'wrong-run'; },
    (state: Awaited<ReturnType<typeof readExecutionView>>) => { at(at(state.assignments).ownedSpaces).receipt.path = '../outside.json'; },
    (state: Awaited<ReturnType<typeof readExecutionView>>) => { at(at(state.assignments).ownedSpaces).receipt.path = 'coordinator/foreign.json'; },
    (state: Awaited<ReturnType<typeof readExecutionView>>) => { at(at(state.imports).originalPacket.evidence).path = 'captures/bad\0.log'; },
    (state: Awaited<ReturnType<typeof readExecutionView>>) => { at(state.imports).packetFile = 'coordinator/foreign.json'; },
    (state: Awaited<ReturnType<typeof readExecutionView>>) => { at(state.imports).originalPacket.runId = 'foreign-run'; }
  ]) {
    const state = await readExecutionView(f.run); change(state); const { project: _project, summary: _summary, ...ledger } = state; await fs.writeFile(ledgerFile, JSON.stringify(ledger));
    await assert.rejects(readExecutionQuery(f.run), /frozen run|escapes|different assignment|worker-relative/); await fs.writeFile(ledgerFile, ledgerBytes);
  }
  await fs.writeFile(ledgerFile, '{'); await assert.rejects(readExecutionQuery(f.run)); await fs.writeFile(ledgerFile, ledgerBytes);
  assert.equal((await readExecutionView(f.run)).runId, JSON.parse(ledgerBytes).runId);
});

test('a prepared import remains pending and byte-identical during metadata observation', async t => {
  const f = await fixture(t); await f.inventory(); const a = await f.reserve('case-0'); await f.attach(a.id, 71); const p = await f.packet(a.id), request = await f.importRequest(p.sealed.packetFile);
  await assert.rejects(executeRequest({ runDir: f.run, request }, { afterPreparation: async () => { throw new Error('Synthetic prepared interruption.'); } }), /interruption/);
  const before = await fs.readFile(path.join(f.run, 'execution.json'), 'utf8');
  const metadata = await readExecutionQuery(f.run, 'assignment', a.id); assert.ok('view' in metadata);
  assert.equal(metadata.recovery.pendingImports, 1); assert.equal(at(metadata.imports.items).phase, 'prepared'); assert.equal(await fs.readFile(path.join(f.run, 'execution.json'), 'utf8'), before);
  await executeRequest({ runDir: f.run, request }); assert.equal((await check(f.run)).counts.pass, 1);
});

test('metadata and data writers respect the same run lock and revision guard without automatic retries', async t => {
  const f = await fixture(t), initial = await readExecutionView(f.run);
  const request = { schemaVersion: 1, kind: 'note', category: 'observation', operationId: 'contended-write', expectedRevision: initial.revision, reason: 'Synthetic interleaving only.' };
  await withRunLock(f.run, async () => {
    const outcomes = await Promise.allSettled([readExecutionQuery(f.run), executeRequest({ runDir: f.run, request })]);
    assert.equal(outcomes.filter(outcome => outcome.status === 'rejected' && /locked/.test(String(outcome.reason))).length, 2);
  });
  const write = await executeRequest({ runDir: f.run, request }), metadata = await readExecutionQuery(f.run); assert.ok('view' in metadata); assert.equal(metadata.revision, write.revision);
  await assert.rejects(executeRequest({ runDir: f.run, request: { ...request, operationId: 'stale-contended-write' } }), /revision conflict/i);
  const strict = await readExecutionQuery(f.run, 'summary', undefined, 'full'); assert.ok('view' in strict); assert.equal(strict.revision, metadata.revision); assert.deepEqual(strict.counts, metadata.counts);
});

test('metadata rejects a junction in its own input path but does not inspect physical historical references', async t => {
  const f = await fixture(t); await f.inventory(); const a = await f.reserve('case-0'); await f.attach(a.id, 71);
  const alias = path.join(f.root, 'alias-run');
  try { await fs.symlink(f.run, alias, 'junction'); } catch (caught) { if (caught && typeof caught === 'object' && 'code' in caught && ['EPERM', 'EACCES', 'ENOTSUP'].includes(String(caught.code))) { t.skip('Junction/symlink privilege unavailable.'); return; } throw caught; }
  await assert.rejects(readExecutionQuery(alias), /Symlink/);
  const foreign = path.join(f.root, 'foreign'); await fs.mkdir(foreign); await fs.writeFile(path.join(foreign, 'receipt.json'), '{"syntheticOnly":true}\n');
  const worker = path.join(f.run, a.workerDirectory), link = path.join(worker, 'historical-link'); await fs.symlink(foreign, link, 'junction');
  const state = await readExecutionView(f.run), own = at(state.assignments).ownedSpaces[0]; assert.ok(own); own.receipt.path = a.workerDirectory + '/historical-link/receipt.json';
  const { project: _project, summary: _summary, ...ledger } = state; await fs.writeFile(path.join(f.run, 'execution.json'), JSON.stringify(ledger));
  const metadata = await readExecutionQuery(f.run); assert.ok('view' in metadata); assert.equal(metadata.integrity.evidenceFiles, 'not_checked');
  await assert.rejects(readExecutionQuery(f.run, 'summary', undefined, 'full'), /Symlink/);
});

test('coordinator can chain data requests using returned revisions without an intervening query', async t => {
  const f = await fixture(t), initial = await readExecutionQuery(f.run); assert.ok('view' in initial);
  const inventory = await executeRequest({ runDir: f.run, request: { schemaVersion: 1, kind: 'inventory', operationId: 'receipt-inventory', expectedRevision: initial.revision, reason: 'Synthetic initial inventory.', spaceIds: [] } });
  const reserve = await executeRequest({ runDir: f.run, request: { schemaVersion: 1, kind: 'reserve', operationId: 'receipt-reserve', expectedRevision: inventory.revision, reason: 'Synthetic explicit reservation.', caseId: 'case-0', baselineSha256: initial.baselineSha256 } });
  assert.equal(reserve.revision, inventory.revision + 1); assert.ok(reserve.assignmentId);
  await assert.rejects(executeRequest({ runDir: f.run, request: { schemaVersion: 1, kind: 'note', category: 'observation', operationId: 'stale-receipt', expectedRevision: inventory.revision, reason: 'Must reject a stale revision.' } }), /revision conflict/i);
});

test('report wording distinguishes missing observations from reserved, running, completed, attempted, and final states', async t => {
  const f = await fixture(t, { limit: 3, count: 5 }); await f.inventory();
  const reserved = await f.reserve('case-0'), running = await f.reserve('case-1'), completed = await f.reserve('case-2');
  await f.request('reconcile', { assignmentId: running.id, state: 'running', inFlight: true });
  await f.request('reconcile', { assignmentId: completed.id, state: 'completed', inFlight: false });
  await recordResult({ runDir: f.run, request: { schemaVersion: 3, operationId: 'observed-attempt', expectedRevision: 0, caseId: 'case-3', mode: 'attempt', record: { status: 'inconclusive', observed: 'Synthetic attempt only.', rationale: 'No final observation yet.', remainingQuestions: [], evidenceIds: [] } } });
  const final = await f.reserve('case-4'); await f.attach(final.id, 74); const p = await f.packet(final.id, { actualSpace: 74 }); await executeRequest({ runDir: f.run, request: await f.importRequest(p.sealed.packetFile) });
  await f.request('reconcile', { assignmentId: final.id, state: 'completed', inFlight: false });
  const before = await fs.readFile(path.join(f.run, 'results.json'), 'utf8'), out = await report(f.run), { nodes, text } = renderOffline(await fs.readFile(out.reportHtml, 'utf8'));
  const metrics = nodes.summary.children.map(node => ({ value: at(node.children).textContent, label: at(node.children, 1).textContent }));
  assert.equal(metrics.find(item => item.label === '尚无结果／尝试记录')?.value, '3'); assert.equal(metrics.find(item => item.label === '已有尝试记录，尚无最终结论')?.value, '1');
  assert.doesNotMatch(text(nodes.summary), /从未尝试/); assert.doesNotMatch(text(nodes['case-list']), /尚未开始尝试/);
  for (const item of [reserved, running, completed]) assert.ok(text(nodes['execution-summary']).includes(item.id));
  const checked = await check(f.run); assert.equal(checked.counts.pass, 1); assert.equal(checked.counts.not_run, 4);
  assert.equal(await fs.readFile(path.join(f.run, 'results.json'), 'utf8'), before); assert.equal((await verifyReport(f.run)).filesVerified, true);
});
