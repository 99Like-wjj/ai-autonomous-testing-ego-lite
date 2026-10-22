import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  init, start, check, report, normalizeCases, safePath, validateCases, main,
  progress, registerEvidence, recordResult, SOURCE_ROOT
} from '../scripts/ego.mjs';

const exec = promisify(execFile);
const schemaVersion = 3;
const caseOf = (id = 'one', kind = 'explicit', additions = {}) => ({
  id, title: `Synthetic case ${id}`,
  basis: { kind, source: 'Synthetic fixture only', text: 'A synthetic requirement.' },
  criticalConditions: ['Use only synthetic values.'], expected: 'The synthetic value can be retrieved.',
  requiredPath: null, stepOrder: 'strict',
  steps: [
    { id: 'locate', action: 'Find the synthetic settings feature.' },
    { id: 'create', action: 'Create a record using the synthetic value.', expected: 'The record is retrievable.' }
  ],
  ...additions
});
const writeJson = (filename, data) => fs.writeFile(filename, JSON.stringify(data, null, 2) + '\n');
const readJson = async filename => JSON.parse(await fs.readFile(filename, 'utf8'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

async function fixture(t, cases = [caseOf(), caseOf('two', 'hypothesis')]) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ego-toolbox-synthetic-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const projectDir = path.join(root, 'project with spaces');
  await init(projectDir);
  const casesFile = path.join(projectDir, 'cases.json');
  const outputDir = path.join(root, 'run with spaces');
  await writeJson(casesFile, { schemaVersion, project: 'Synthetic only', cases });
  await start({ projectDir, casesFile, outputDir });
  return { root, projectDir, casesFile, outputDir };
}

async function addEvidence(f, {
  operationId = 'evidence-op-1', expectedRevision = 0, caseId = 'one',
  sourceFile = path.join(f.root, 'source.log'), kind = 'log',
  source = 'Synthetic tool receipt', description = 'Synthetic observation only', capturedAt
} = {}, hooks = {}) {
  try { await fs.access(sourceFile); } catch { await fs.writeFile(sourceFile, 'synthetic retained bytes\n'); }
  const request = {
    schemaVersion, operationId, expectedRevision, caseId, sourceFile, kind,
    source, description, ...(capturedAt === undefined ? {} : { capturedAt })
  };
  const receipt = await registerEvidence({ runDir: f.outputDir, request }, hooks);
  return { request, receipt };
}

function recordRequest({
  operationId, expectedRevision, caseId = 'one', mode = 'final', status,
  observed = '', rationale = '', evidenceIds = [], remainingQuestions = [], cause = 'unknown'
}) {
  return {
    schemaVersion, operationId, expectedRevision, caseId, mode,
    record: { status, observed, rationale, remainingQuestions, evidenceIds, cause }
  };
}

async function committedEvidence(f, options = {}) {
  return addEvidence(f, options);
}

async function recorded(f, status, options = {}) {
  const current = await readJson(path.join(f.outputDir, 'results.json'));
  const request = recordRequest({
    operationId: options.operationId ?? `result-${current.revision + 1}`,
    expectedRevision: options.expectedRevision ?? current.revision,
    caseId: options.caseId ?? 'one', mode: options.mode ?? 'final', status,
    observed: options.observed ?? (['pass', 'fail'].includes(status) ? `Synthetic ${status} observation.` : ''),
    rationale: options.rationale ?? (status === 'not_run' ? '' : `Synthetic ${status} rationale.`),
    evidenceIds: options.evidenceIds ?? [], remainingQuestions: options.remainingQuestions ?? [],
    cause: options.cause ?? 'unknown'
  });
  return { request, receipt: await recordResult({ runDir: f.outputDir, request }) };
}

test('new run uses closed schema v3 files and starts each frozen case as not_run', async t => {
  const f = await fixture(t);
  const result = await check(f.outputDir);
  assert.equal(result.schemaVersion, 3);
  assert.equal(result.structurallyValid, true);
  assert.equal(result.hasUnexecutedCases, true);
  assert.equal(result.counts.not_run, 2);
  assert.deepEqual(result.progress.uncompleted.statusCounts, { not_run: 2, blocked: 0, inconclusive: 0 });
  for (const name of ['baseline.json', 'manifest.json', 'results.json', 'evidence.json']) {
    assert.equal((await readJson(path.join(f.outputDir, name))).schemaVersion, 3);
  }
  assert.equal(result.evidenceCatalog.revision, 0);
  assert.deepEqual(result.evidenceCatalog.items, []);
});

test('init gives a synthetic v3 case preserving business intent and optional checkpoints', async t => {
  const f = await fixture(t);
  const sample = await readJson(path.join(f.projectDir, 'cases.example.json'));
  assert.deepEqual(normalizeCases(sample), sample);
  assert.equal(sample.schemaVersion, 3);
  assert.ok(sample.cases[0].steps.some(step => !Object.hasOwn(step, 'expected')));
  assert.ok(sample.cases[0].expected.trim());
});

test('evidence registration copies local bytes and hashes the retained file without inventing capture time', async t => {
  const f = await fixture(t);
  const source = path.join(f.root, 'actual-source.bin');
  const sourceBytes = Buffer.from([0, 1, 2, 255, 10]);
  await fs.writeFile(source, sourceBytes);
  const { receipt } = await addEvidence(f, { sourceFile: source });
  const catalog = await readJson(path.join(f.outputDir, 'evidence.json'));
  const item = catalog.items[0];
  assert.match(item.id, /^ev-[a-f0-9-]+$/);
  assert.equal(item.bytes, sourceBytes.length);
  assert.equal(item.sha256, hash(sourceBytes));
  assert.equal(item.collectedAt, receipt.collectedAt);
  assert.equal(Object.hasOwn(item, 'capturedAt'), false);
  assert.deepEqual(await fs.readFile(path.join(f.outputDir, ...item.path.split('/'))), sourceBytes);
  assert.deepEqual(await fs.readFile(source), sourceBytes);
  assert.equal(receipt.evidenceId, item.id);
  assert.equal(receipt.replayed, false);
  assert.equal((await check(f.outputDir)).evidenceIntegrity.hashVerifiedItems, 1);
});

test('capturedAt is recorded only when supplied and remains distinct from collectedAt', async t => {
  const f = await fixture(t);
  const capture = '2026-10-20T10:11:12Z';
  const { receipt } = await addEvidence(f, { capturedAt: capture });
  const item = (await readJson(path.join(f.outputDir, 'evidence.json'))).items[0];
  assert.equal(item.capturedAt, capture);
  assert.equal(item.collectedAt, receipt.collectedAt);
  assert.notEqual(item.collectedAt, capture);
});

test('evidence operation is idempotent across JSON key order and rejects changed payloads', async t => {
  const f = await fixture(t);
  const { request, receipt } = await addEvidence(f);
  const reordered = Object.fromEntries(Object.entries(request).reverse());
  const replay = await registerEvidence({ runDir: f.outputDir, request: reordered });
  assert.equal(replay.evidenceId, receipt.evidenceId);
  assert.equal(replay.replayed, true);
  assert.equal((await readJson(path.join(f.outputDir, 'evidence.json'))).items.length, 1);
  await assert.rejects(registerEvidence({ runDir: f.outputDir, request: { ...request, description: 'Changed payload' } }), /different payload/);
  await assert.rejects(addEvidence(f, { operationId: 'different-operation', expectedRevision: 0 }), /revision conflict/);
});

test('evidence association, timestamps, kinds, request shape, and unsafe IDs are validated', async t => {
  const f = await fixture(t);
  const base = {
    schemaVersion, operationId: 'op', expectedRevision: 0, caseId: 'missing',
    sourceFile: path.join(f.root, 'source.log'), kind: 'log', source: 'Synthetic source', description: 'Synthetic description'
  };
  await fs.writeFile(base.sourceFile, 'synthetic');
  await assert.rejects(registerEvidence({ runDir: f.outputDir, request: base }), /Unknown case/);
  for (const changes of [
    { caseId: '__proto__' }, { operationId: 'constructor' },
    { capturedAt: '2026-02-30T10:11:12Z' }, { capturedAt: '2026-01-01T00:00:00+08:00' },
    { kind: 'proof' }, { extra: true }, { expectedRevision: -1 }
  ]) {
    await assert.rejects(registerEvidence({ runDir: f.outputDir, request: { ...base, caseId: 'one', ...changes } }));
  }
});

test('evidence source must be a regular, nonsymlink local file within a checked path', async t => {
  const f = await fixture(t);
  const dir = path.join(f.root, 'source-directory');
  await fs.mkdir(dir);
  const directoryRequest = {
    schemaVersion, operationId: 'directory', expectedRevision: 0, caseId: 'one',
    sourceFile: dir, kind: 'other', source: 'Synthetic', description: 'Synthetic'
  };
  await assert.rejects(registerEvidence({ runDir: f.outputDir, request: directoryRequest }), /regular file/);
  const outside = path.join(f.root, 'outside.log'); await fs.writeFile(outside, 'synthetic');
  const link = path.join(f.root, 'source-link.log');
  try { await fs.symlink(outside, link); } catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('OS does not allow synthetic symlink creation'); return; } throw error; }
  await assert.rejects(addEvidence(f, { operationId: 'symlink', sourceFile: link }), /Symlink|ELOOP/);
});

test('evidence copy or catalog failure cleans only the operation-owned staged files', async t => {
  const f = await fixture(t);
  await assert.rejects(addEvidence(f, { operationId: 'copy-fail' }, { afterCopy: async () => { throw new Error('synthetic injected copy failure'); } }), /injected copy failure/);
  await assert.rejects(addEvidence(f, { operationId: 'catalog-fail' }, { beforeCatalogCommit: async () => { throw new Error('synthetic injected catalog failure'); } }), /injected catalog failure/);
  assert.deepEqual((await readJson(path.join(f.outputDir, 'evidence.json'))).items, []);
  assert.deepEqual((await fs.readdir(path.join(f.outputDir, 'evidence'))), []);
  assert.deepEqual((await fs.readdir(f.outputDir)).filter(name => name.startsWith('.ego-') || name === '.evidence.pending.json'), []);
});

test('evidence commit followed by lost response recovers and retries without duplication', async t => {
  const f = await fixture(t);
  const request = {
    schemaVersion, operationId: 'response-lost', expectedRevision: 0, caseId: 'one',
    sourceFile: path.join(f.root, 'source.log'), kind: 'log', source: 'Synthetic source', description: 'Synthetic bytes'
  };
  await fs.writeFile(request.sourceFile, 'synthetic retained bytes\n');
  await assert.rejects(registerEvidence({ runDir: f.outputDir, request }, { afterCommit: async () => { throw new Error('synthetic response loss'); } }), /response loss/);
  assert.ok(await fs.stat(path.join(f.outputDir, '.evidence.pending.json')));
  const replay = await registerEvidence({ runDir: f.outputDir, request });
  assert.equal(replay.replayed, true);
  assert.equal((await readJson(path.join(f.outputDir, 'evidence.json'))).items.length, 1);
  assert.deepEqual((await fs.readdir(path.join(f.outputDir, 'evidence'))).filter(name => name.startsWith('.')), []);
});

test('result recording preserves fail once across fail to pass and duplicate pass replay', async t => {
  const f = await fixture(t);
  const { receipt: ev } = await committedEvidence(f);
  const evidenceIds = [ev.evidenceId];
  const first = await recorded(f, 'fail', { operationId: 'fail-once', evidenceIds, rationale: 'Synthetic first failure.' });
  assert.equal(first.receipt.revision, 1);
  const passRequest = recordRequest({ operationId: 'pass-final', expectedRevision: 1, status: 'pass', observed: 'Synthetic value shown.', rationale: 'Synthetic pass observation.', evidenceIds });
  const pass = await recordResult({ runDir: f.outputDir, request: passRequest });
  assert.equal(pass.revision, 2);
  const replay = await recordResult({ runDir: f.outputDir, request: { ...passRequest, record: Object.fromEntries(Object.entries(passRequest.record).reverse()) } });
  assert.equal(replay.replayed, true);
  const checked = await check(f.outputDir);
  assert.equal(checked.cases[0].status, 'pass');
  assert.deepEqual(checked.cases[0].attempts.map(attempt => attempt.status), ['fail']);
  assert.equal(checked.progress.attemptedCases.totalAttempts, 1);
  assert.equal(checked.counts.fail, 0);
  assert.equal(checked.counts.pass, 1);
});

test('attempt observations append independently and do not replace the current final result', async t => {
  const f = await fixture(t);
  const { receipt: ev } = await committedEvidence(f);
  const result = await recordResult({ runDir: f.outputDir, request: recordRequest({
    operationId: 'observation-attempt', expectedRevision: 0, mode: 'attempt', status: 'fail',
    observed: 'Synthetic failure.', rationale: 'Synthetic evidence supports this attempt.', evidenceIds: [ev.evidenceId]
  }) });
  assert.equal(result.attemptId.length > 0, true);
  const checked = await check(f.outputDir);
  assert.equal(checked.cases[0].status, 'not_run');
  assert.deepEqual(checked.cases[0].attempts.map(item => item.status), ['fail']);
  assert.equal(checked.progress.uncompleted.statusCounts.not_run, 2);
});

test('result operations use idempotency, reject altered payload and stale revisions, and recover a lost response', async t => {
  const f = await fixture(t);
  const request = recordRequest({ operationId: 'lost-result-response', expectedRevision: 0, status: 'blocked', rationale: 'Synthetic environment block.' });
  await assert.rejects(recordResult({ runDir: f.outputDir, request }, { afterCommit: async () => { throw new Error('synthetic response loss'); } }), /response loss/);
  const replay = await recordResult({ runDir: f.outputDir, request });
  assert.equal(replay.replayed, true);
  assert.equal((await readJson(path.join(f.outputDir, 'results.json'))).revision, 1);
  await assert.rejects(recordResult({ runDir: f.outputDir, request: { ...request, record: { ...request.record, rationale: 'Altered.' } } }), /different payload/);
  await assert.rejects(recordResult({ runDir: f.outputDir, request: recordRequest({ operationId: 'stale', expectedRevision: 0, status: 'blocked', rationale: 'Synthetic blocker.' }) }), /Revision conflict/);
});

test('concurrent writers do not overwrite a shared revision', async t => {
  const f = await fixture(t);
  const make = id => recordResult({ runDir: f.outputDir, request: recordRequest({ operationId: id, expectedRevision: 0, status: 'blocked', rationale: 'Synthetic blocker.' }) });
  const outcomes = await Promise.allSettled([make('writer-a'), make('writer-b')]);
  assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(item => item.status === 'rejected').length, 1);
  assert.match(outcomes.find(item => item.status === 'rejected').reason.message, /locked|revision conflict/);
  assert.equal((await check(f.outputDir)).revision, 1);
});

test('stale or symlink run locks refuse writers; lock is removed after a normal operation', async t => {
  const f = await fixture(t);
  const lock = path.join(f.outputDir, '.run.lock');
  await fs.writeFile(lock, JSON.stringify({ token: 'synthetic-stale', pid: 0, startedAt: '2026-01-01T00:00:00Z' }));
  await assert.rejects(progress(f.outputDir), /locked/);
  await fs.unlink(lock);
  await progress(f.outputDir);
  await assert.rejects(fs.stat(lock), /ENOENT/);
  const target = path.join(f.root, 'lock-target'); await fs.writeFile(target, '{}');
  try { await fs.symlink(target, lock); } catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('OS does not allow synthetic symlink creation'); return; } throw error; }
  await assert.rejects(progress(f.outputDir), /Symlink|locked/);
});

test('pending baseline clarification prohibits pass or fail in final records and attempts', async t => {
  const f = await fixture(t, [caseOf('one', 'explicit', { clarificationQuestions: ['Which synthetic scope is requested?'] })]);
  const { receipt: ev } = await committedEvidence(f);
  for (const mode of ['final', 'attempt']) for (const status of ['pass', 'fail']) {
    const request = recordRequest({ operationId: `clarify-${mode}-${status}`, expectedRevision: 0, mode, status,
      observed: 'Synthetic observed behavior.', rationale: 'Synthetic rationale.', evidenceIds: [ev.evidenceId] });
    await assert.rejects(recordResult({ runDir: f.outputDir, request }), /Pending clarification prohibits pass\/fail/);
  }
  assert.equal((await readJson(path.join(f.outputDir, 'results.json'))).revision, 0);
});

test('check catches a cleared frozen clarification and any pass or fail attempt in saved history', async t => {
  const f = await fixture(t, [caseOf('one', 'explicit', { clarificationQuestions: ['Unresolved synthetic question?'] })]);
  const resultPath = path.join(f.outputDir, 'results.json');
  const results = await readJson(resultPath);
  results.cases[0].clarificationQuestions = [];
  await writeJson(resultPath, results);
  await assert.rejects(check(f.outputDir), /Unexpected result key|clarificationQuestions/);

  const f2 = await fixture(t, [caseOf('one', 'explicit', { clarificationQuestions: ['Unresolved synthetic question?'] })]);
  const ev = await committedEvidence(f2);
  const attemptRequest = recordRequest({ operationId: 'forged-history', expectedRevision: 0, mode: 'attempt', status: 'blocked', rationale: 'Synthetic blocker.' });
  const attemptReceipt = await recordResult({ runDir: f2.outputDir, request: attemptRequest });
  const resultPath2 = path.join(f2.outputDir, 'results.json');
  const saved = await readJson(resultPath2);
  saved.cases[0].attempts[0].status = 'pass';
  saved.cases[0].attempts[0].observed = 'Synthetic observed.';
  saved.cases[0].attempts[0].rationale = 'Synthetic rationale.';
  saved.cases[0].attempts[0].evidenceIds = [ev.receipt.evidenceId];
  saved.operations.find(op => op.attemptId === attemptReceipt.attemptId).status = 'pass';
  await writeJson(resultPath2, saved);
  await assert.rejects(check(f2.outputDir), /Pending clarification prohibits pass\/fail/);
});

test('progress reports current outcome once, pending questions, and distinct blocked/inconclusive/not_run', async t => {
  const f = await fixture(t, [
    caseOf('pass-case'), caseOf('blocked-case'), caseOf('uncertain-case'),
    caseOf('pending-case', 'interpretation', { clarificationQuestions: ['Synthetic question?'] })
  ]);
  const { receipt: ev } = await committedEvidence(f, { caseId: 'pass-case' });
  await recorded(f, 'fail', { caseId: 'pass-case', operationId: 'first-fail', evidenceIds: [ev.evidenceId] });
  await recordResult({ runDir: f.outputDir, request: recordRequest({ operationId: 'replacement-pass', expectedRevision: 1, caseId: 'pass-case', status: 'pass', observed: 'Synthetic value is visible.', rationale: 'Synthetic final comparison.', evidenceIds: [ev.evidenceId] }) });
  await recorded(f, 'blocked', { caseId: 'blocked-case', operationId: 'blocked', rationale: 'Synthetic setup block.' });
  await recorded(f, 'inconclusive', { caseId: 'uncertain-case', operationId: 'uncertain', rationale: 'Synthetic outcome is unclear.' });
  const current = await progress(f.outputDir);
  assert.deepEqual(current.progress.completed.statusCounts, { pass: 1, fail: 0 });
  assert.deepEqual(current.progress.uncompleted.statusCounts, { not_run: 1, blocked: 1, inconclusive: 1 });
  assert.deepEqual(current.progress.pendingClarification.caseIds, ['pending-case']);
  assert.equal(current.progress.attemptedCases.totalAttempts, 1);
  assert.equal(current.currentStatusCounts.fail, 0);
});

test('not_run is the only status reported by hasUnexecutedCases', async t => {
  const f = await fixture(t, [caseOf('blocked-case'), caseOf('uncertain-case')]);
  await recorded(f, 'blocked', { caseId: 'blocked-case', operationId: 'blocked', rationale: 'Synthetic block.' });
  await recorded(f, 'inconclusive', { caseId: 'uncertain-case', operationId: 'uncertain', rationale: 'Synthetic uncertainty.' });
  const result = await check(f.outputDir);
  assert.equal(result.hasUnexecutedCases, false);
  assert.equal(result.counts.not_run, 0);
  assert.equal(result.counts.blocked, 1);
  assert.equal(result.counts.inconclusive, 1);
});

test('evidence hash check detects altered retained bytes', async t => {
  const f = await fixture(t);
  const { receipt } = await committedEvidence(f);
  await fs.appendFile(path.join(f.outputDir, ...receipt.path.split('/')), 'tamper');
  await assert.rejects(check(f.outputDir), /hash or byte count mismatch/);
});

test('evidence IDs must belong to the case and pass/fail requires observation, rationale, and evidence', async t => {
  const f = await fixture(t);
  const ev = await committedEvidence(f);
  await assert.rejects(recordResult({ runDir: f.outputDir, request: recordRequest({ operationId: 'missing', expectedRevision: 0, status: 'pass', observed: 'Synthetic.', rationale: 'Synthetic.', evidenceIds: ['unknown'] }) }), /not registered/);
  await assert.rejects(recordResult({ runDir: f.outputDir, request: recordRequest({ operationId: 'empty-observation', expectedRevision: 0, status: 'pass', rationale: 'Synthetic.', evidenceIds: [ev.receipt.evidenceId] }) }), /requires rationale and evidence/);
  await assert.rejects(recordResult({ runDir: f.outputDir, request: recordRequest({ operationId: 'duplicate-evidence', expectedRevision: 0, status: 'pass', observed: 'Synthetic.', rationale: 'Synthetic.', evidenceIds: [ev.receipt.evidenceId, ev.receipt.evidenceId] }) }), /Duplicate evidence/);
  const evOther = await committedEvidence(f, { operationId: 'other-evidence', expectedRevision: 1, caseId: 'two' });
  await assert.rejects(recordResult({ runDir: f.outputDir, request: recordRequest({ operationId: 'cross-case', expectedRevision: 0, status: 'pass', observed: 'Synthetic.', rationale: 'Synthetic.', evidenceIds: [evOther.receipt.evidenceId] }) }), /different case/);
});

test('report includes hash, byte count, timestamps, frozen expectations, and escaped user strings', async t => {
  const f = await fixture(t, [caseOf('one', 'explicit', { expected: 'Synthetic \u0000 expectation.', clarificationQuestions: ['What is <scope> & [source](https://invalid.example)?'] })]);
  const ev = await committedEvidence(f, { capturedAt: '2026-10-20T10:11:12Z', description: 'Synthetic <img> & evidence' });
  const out = await report(f.outputDir);
  const payload = await readJson(out.reportJson);
  const md = await fs.readFile(out.reportMarkdown, 'utf8');
  assert.equal(payload.evidenceIntegrity.hashVerifiedItems, 1);
  assert.equal(payload.evidenceCatalog.items[0].sha256, ev.receipt.sha256);
  assert.equal(payload.evidenceCatalog.items[0].bytes, ev.receipt.bytes);
  assert.match(md, /SHA-256/);
  assert.match(md, /source captured at/);
  assert.match(md, /&lt;scope&gt; &amp;/);
  assert.match(md, /&lt;img&gt;/);
  assert.match(md, /Synthetic \\u0000 expectation/);
  assert.doesNotMatch(md, /<scope>|<img>|\[source\]\(/);
  assert.match(md, /not specified; no checkpoint verdict/);
  assert.deepEqual(await check(f.outputDir), payload);
  await assert.rejects(report(f.outputDir), /overwrite/);
});

test('baseline hash protects case intent, clarification questions, and optional checkpoint omission', async t => {
  const f = await fixture(t, [caseOf('one', 'explicit', { steps: [{ id: 'intent', action: 'Complete the synthetic business task.' }], clarificationQuestions: ['Unresolved synthetic question?'] })]);
  const baselineFile = path.join(f.outputDir, 'baseline.json');
  const baseline = await readJson(baselineFile);
  assert.equal(Object.hasOwn(baseline.cases[0].steps[0], 'expected'), false);
  baseline.cases[0].clarificationQuestions = [];
  await writeJson(baselineFile, baseline);
  await assert.rejects(check(f.outputDir), /hash mismatch/);
});

test('closed input format validates safe unique case and step IDs, source basis, and optional step expectations', () => {
  const base = { schemaVersion, project: 'Synthetic', cases: [caseOf()] };
  assert.deepEqual(normalizeCases(base), base);
  for (const change of [
    x => { x.schemaVersion = 2; }, x => { x.cases[0].id = '__proto__'; },
    x => { x.cases[0].steps[0].id = 'constructor'; }, x => { x.cases.push(caseOf()); },
    x => { x.cases[0].steps.push({ ...x.cases[0].steps[0] }); },
    x => { x.cases[0].unexpected = true; }, x => { x.cases[0].steps[0].expected = ' '; },
    x => { x.cases[0].basis = { kind: 'explicit', text: 'Missing source' }; }
  ]) {
    const input = structuredClone(base); change(input); assert.throws(() => normalizeCases(input));
  }
});

test('validator is read-only and rejects bad cases before creating a run', async t => {
  const f = await fixture(t);
  const before = await fs.readFile(f.casesFile);
  const listing = await fs.readdir(f.projectDir);
  const summary = await main(['validate-cases', '--cases', f.casesFile]);
  assert.deepEqual(summary, { schemaVersion: 3, structurallyValid: true, project: 'Synthetic only', caseCount: 2, stepCount: 4, stepOrderCounts: { strict: 2, adaptive: 0 } });
  assert.deepEqual(await validateCases(f.casesFile), summary);
  assert.deepEqual(await fs.readFile(f.casesFile), before);
  assert.deepEqual(await fs.readdir(f.projectDir), listing);
  const bad = await readJson(f.casesFile); bad.cases[0].steps = [];
  await writeJson(f.casesFile, bad);
  const missing = path.join(f.root, 'bad-run');
  await assert.rejects(start({ projectDir: f.projectDir, casesFile: f.casesFile, outputDir: missing }), /nonempty steps/);
  await assert.rejects(fs.stat(missing), /ENOENT/);
});

test('v0.1.2 schemaVersion 2 case and run assets fail with an explicit breaking-version message', async t => {
  assert.throws(() => normalizeCases({ schemaVersion: 2, project: 'Old', cases: [caseOf()] }));
  const f = await fixture(t);
  const manifest = await readJson(path.join(f.outputDir, 'manifest.json'));
  manifest.schemaVersion = 2; await writeJson(path.join(f.outputDir, 'manifest.json'), manifest);
  await assert.rejects(check(f.outputDir), /Unsupported run schema version/);
});

test('malformed and tampered catalogs, ledgers, and case records are rejected', async t => {
  for (const edit of [
    async f => { await fs.writeFile(path.join(f.outputDir, 'results.json'), '{'); },
    async f => { const p = path.join(f.outputDir, 'evidence.json'); const c = await readJson(p); c.extra = true; await writeJson(p, c); },
    async f => { const p = path.join(f.outputDir, 'results.json'); const r = await readJson(p); r.cases[0].basis.text = 'Changed basis'; await writeJson(p, r); },
    async f => { const p = path.join(f.outputDir, 'results.json'); const r = await readJson(p); r.cases.pop(); await writeJson(p, r); },
    async f => { const p = path.join(f.outputDir, 'manifest.json'); const r = await readJson(p); r.extra = 'no'; await writeJson(p, r); }
  ]) {
    const f = await fixture(t); await edit(f); await assert.rejects(check(f.outputDir));
  }
});

test('symlink evidence paths and run directories are refused', async t => {
  const f = await fixture(t);
  const target = path.join(f.root, 'outside.txt'); await fs.writeFile(target, 'synthetic');
  try { await fs.symlink(target, path.join(f.outputDir, 'evidence', 'link.txt')); }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('OS does not allow synthetic symlink creation'); return; } throw error; }
  const catalog = await readJson(path.join(f.outputDir, 'evidence.json'));
  catalog.items.push({ id: 'synthetic', path: 'evidence/link.txt', caseId: 'one', kind: 'log', collectedAt: '2026-01-01T00:00:00Z', source: 'Synthetic', description: 'Synthetic', sha256: hash('synthetic'), bytes: 9, operationId: 'synthetic' });
  await writeJson(path.join(f.outputDir, 'evidence.json'), catalog);
  await assert.rejects(check(f.outputDir), /Symlink/);
  await assert.rejects(safePath('relative', { external: true }), /absolute/);
  await assert.rejects(safePath(path.parse(f.root).root, { external: true }), /filesystem root/);
  await assert.rejects(safePath(path.join(SOURCE_ROOT, 'runs'), { external: true }), /source repository/);
});

test('command parser rejects unknown or duplicate flags and handles paths with spaces', async t => {
  for (const args of [['wat'], ['check'], ['check', '--run-dir'], ['check', '--wrong', '/tmp'], ['progress', '--run-dir', '/tmp', '--run-dir', '/tmp']]) await assert.rejects(main(args));
  const f = await fixture(t);
  const result = await exec(process.execPath, [path.join(SOURCE_ROOT, 'scripts', 'ego.mjs'), 'check', '--run-dir', f.outputDir]);
  assert.equal(JSON.parse(result.stdout).structurallyValid, true);
});

test('CLI evidence-add and record requests use documented local files', async t => {
  const f = await fixture(t);
  const ev = path.join(f.root, 'cli.log'); await fs.writeFile(ev, 'synthetic cli bytes');
  const evidenceRequest = {
    schemaVersion, operationId: 'cli-evidence', expectedRevision: 0, caseId: 'one', sourceFile: ev,
    kind: 'log', source: 'Synthetic command-line example', description: 'Synthetic CLI bytes'
  };
  const evidenceFile = path.join(f.root, 'evidence-request.json'); await writeJson(evidenceFile, evidenceRequest);
  const evidenceOutput = await main(['evidence-add', '--run-dir', f.outputDir, '--request', evidenceFile]);
  const resultRequest = recordRequest({ operationId: 'cli-result', expectedRevision: 0, status: 'blocked', rationale: 'Synthetic CLI run is intentionally blocked.' });
  const resultFile = path.join(f.root, 'record-request.json'); await writeJson(resultFile, resultRequest);
  const resultOutput = await main(['record', '--run-dir', f.outputDir, '--request', resultFile]);
  assert.equal(evidenceOutput.evidenceId.length > 0, true);
  assert.equal(resultOutput.revision, 1);
  assert.equal((await main(['progress', '--run-dir', f.outputDir])).progress.uncompleted.statusCounts.blocked, 1);
});

test('JSON schemas and synthetic examples use a consistent v3 contract and local references', async () => {
  const schemaDir = path.join(SOURCE_ROOT, 'schemas');
  const schemas = new Map();
  for (const name of await fs.readdir(schemaDir)) {
    if (name.endsWith('.schema.json')) schemas.set(name, await readJson(path.join(schemaDir, name)));
  }
  assert.deepEqual([...schemas.keys()].sort(), [
    'cases.schema.json', 'common.schema.json', 'evidence-request.schema.json', 'evidence.schema.json',
    'manifest.schema.json', 'record-request.schema.json', 'report.schema.json', 'results.schema.json'
  ]);
  for (const [filename, schema] of schemas) {
    if (filename === 'common.schema.json') continue;
    if (schema.properties?.schemaVersion) assert.equal(schema.properties.schemaVersion.const, 3, filename);
    const inspectRefs = value => {
      if (!value || typeof value !== 'object') return;
      if (typeof value.$ref === 'string') {
        assert.ok(!/^[a-z]+:/i.test(value.$ref), `${filename} has only local schema refs`);
        const target = value.$ref.split('#')[0];
        if (target) assert.ok(schemas.has(target), `${filename} reference ${value.$ref} exists`);
      }
      for (const child of Object.values(value)) inspectRefs(child);
    };
    inspectRefs(schema);
  }
  for (const name of ['cases.example.json', 'generated-cases.example.json', 'evidence-request.example.json', 'record-request.example.json']) {
    const sample = await readJson(path.join(SOURCE_ROOT, 'examples', name));
    assert.equal(sample.schemaVersion, 3, name);
  }
  const common = schemas.get('common.schema.json');
  assert.deepEqual(common.$defs.step.required, ['id', 'action']);
  assert.equal(common.$defs.step.additionalProperties, false);
  const clarificationVeto = common.$defs.reportCaseV3.allOf.find(rule => rule.if.required?.includes('clarificationQuestions'));
  assert.deepEqual(clarificationVeto.then.properties.status.enum, ['inconclusive', 'blocked', 'not_run']);
  assert.deepEqual(clarificationVeto.then.properties.attempts.items.properties.status.enum, ['inconclusive', 'blocked', 'not_run']);
});

test('reports do not overwrite existing output, init/start do not overwrite, and root destinations are refused', async t => {
  const f = await fixture(t);
  const manifestPath = path.join(f.outputDir, 'manifest.json'); const before = await fs.readFile(manifestPath);
  await assert.rejects(start({ projectDir: f.projectDir, casesFile: f.casesFile, outputDir: f.outputDir }), /EEXIST/);
  await assert.rejects(init(f.projectDir), /EEXIST/);
  assert.deepEqual(await fs.readFile(manifestPath), before);
  const out = await report(f.outputDir);
  const mdBefore = await fs.readFile(out.reportMarkdown);
  await assert.rejects(report(f.outputDir), /overwrite/);
  assert.deepEqual(await fs.readFile(out.reportMarkdown), mdBefore);
});

test('Node CLI contains no network or shell invocations and records no workflow selection', async () => {
  const source = await fs.readFile(path.join(SOURCE_ROOT, 'scripts/ego.mjs'), 'utf8');
  assert.doesNotMatch(source, /fetch\s*\(|https?:\/\/|child_process|execFile|spawn\s*\(/);
  assert.match(source, /No network, model, browser, or Ego actions/);
});
