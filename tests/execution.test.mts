import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { Baseline } from '../src/contracts/model.mjs';
import type { ExecutionRequest, WorkerPacket } from '../src/contracts/execution-model.mjs';
import { init, start, check, executeRequest, readExecutionView, sealPacket, report, verifyReport, recordResult } from '../src/scripts/ego.mjs';
import vm from 'node:vm';
import { parseCatalog, parseResults } from '../src/core/validation.mjs';
import { requiredTargets } from '../src/execution/packets.mjs';
import { cliParallelLimit } from '../src/execution/config.mjs';
import { parsePacket } from '../src/execution/parse.mjs';
import { at, readJson, FakeElement } from './support.mjs';

const write = (file: string, value: unknown) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
async function fixture(t: TestContext, options: { limit?: number; count?: number; projectConfig?: unknown; fileConfig?: unknown; explicitFile?: string } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ego-execution-'));
  t.after(async () => { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('ego-execution-')); await fs.rm(root, { recursive: true, force: true }); });
  const project = path.join(root, 'project'), run = path.join(root, 'run'); await init(project);
  const baseline: Baseline = { schemaVersion: 3, project: 'Synthetic transaction testing only', cases: Array.from({ length: options.count ?? 14 }, (_, i) => ({
    id: 'case-' + i, title: 'Synthetic case ' + i, basis: { kind: 'explicit', source: 'Synthetic fixture, not a business system', text: 'Synthetic values are kept with their case.' },
    criticalConditions: ['Use only the synthetic fixture.'], expected: 'The synthetic value is associated with this case.', requiredPath: 'Synthetic entry', stepOrder: 'strict',
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
  const defaultRun = await fixture(t); assert.equal((await readExecutionView(defaultRun.run)).configuration.requestedMaxParallelCases, 2);
  const projectRun = await fixture(t, { projectConfig: { schemaVersion: 1, maxParallelCases: 6 } }); assert.equal((await readExecutionView(projectRun.run)).configuration.kind, 'project');
  const fileRun = await fixture(t, { projectConfig: { schemaVersion: 1, maxParallelCases: 2 }, fileConfig: { schemaVersion: 1, maxParallelCases: 12 } }); assert.equal((await readExecutionView(fileRun.run)).configuration.requestedMaxParallelCases, 12);
  await assert.rejects(fixture(t, { limit: 3, explicitFile: path.join(os.tmpdir(), 'ego-nonexistent-config-' + process.pid) }), /ENOENT/);
  for (const value of [0, -1, 1.5, '3', Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(fixture(t, { projectConfig: { schemaVersion: 1, maxParallelCases: value } }), /maxParallelCases/);
  for (const value of ['0', '-1', '1.5', '3x', '9007199254740992']) assert.throws(() => cliParallelLimit(value));
  assert.equal(cliParallelLimit('12'), 12);
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
  const names = ['report-data', 'project-line', 'integrity', 'summary', 'report-context', 'execution-summary', 'evidence-coverage', 'search', 'status-filter', 'shown', 'empty-results', 'case-list', 'lightbox-image', 'lightbox-error', 'lightbox-caption', 'lightbox', 'lightbox-close'] as const;
  const nodes = Object.fromEntries(names.map(name => [name, new FakeElement()])) as Record<typeof names[number], FakeElement>;
  const payload = html.match(/<script type="application\/json" id="report-data">([\s\S]*?)<\/script>/); assert.ok(payload); nodes['report-data'].textContent = at(payload, 1); nodes['status-filter'].value = 'all';
  const script = at(at([...html.matchAll(/<script(?![^>]*application\/json)[^>]*>([\s\S]*?)<\/script>/g)]), 1);
  new vm.Script(script).runInNewContext({ document: { getElementById: (name: typeof names[number]) => nodes[name], querySelector: (selector: string) => nodes[selector.slice(1) as typeof names[number]], createElement: (tag: string) => new FakeElement(tag) } });
  const text = (node: FakeElement): string => [node.textContent, ...node.children.map(text)].join(' ');
  assert.equal(nodes['execution-summary'].hidden, false); assert.match(text(nodes['execution-summary']), /用户并发上限 3/); assert.match(text(nodes['execution-summary']), /报告峰值 1/); assert.match(text(nodes['execution-summary']), /Synthetic diagnostic note/);
  const goals = text(nodes['case-list']); assert.match(goals, /逐目标评估/); for (const target of requiredTargets(at(f.baseline.cases))) assert.ok(goals.includes('已验证 · ' + target), target);
  const md = await fs.readFile(out.reportMarkdown, 'utf8'); assert.match(md, /用户并发上限：3/); assert.match(md, /逐目标评估/); assert.equal((await verifyReport(f.run)).filesVerified, true);
});
