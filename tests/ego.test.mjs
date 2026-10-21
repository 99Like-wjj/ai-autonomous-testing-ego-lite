import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { init, start, check, report, normalizeCases, safePath, main, SOURCE_ROOT } from '../scripts/ego.mjs';
const exec = promisify(execFile);
const caseOf = (id = 'one', kind = 'explicit') => ({ id, title: `Case ${id}`, basis: { kind, source: 'Synthetic test instruction', text: 'A synthetic requirement' }, criticalConditions: ['Synthetic condition'], expected: 'Synthetic outcome', requiredPath: null });
async function registerEvidence(runDir, name) {
  await fs.writeFile(path.join(runDir, 'evidence', name), 'Synthetic observation');
  const catalogPath = path.join(runDir, 'evidence.json');
  const catalog = JSON.parse(await fs.readFile(catalogPath));
  catalog.items.push({ id: name, path: `evidence/${name}`, kind: 'log', capturedAt: '2026-01-01T00:00:00Z', source: 'Synthetic test', description: 'Synthetic observation only' });
  await fs.writeFile(catalogPath, JSON.stringify(catalog));
}
const fixture = async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ego-synthetic-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const projectDir = path.join(root, 'project with spaces');
  await init(projectDir);
  const casesFile = path.join(projectDir, 'cases.json');
  const outputDir = path.join(root, 'run with spaces');
  await fs.writeFile(casesFile, JSON.stringify({ schemaVersion: 1, project: 'Synthetic only', cases: [caseOf(), caseOf('two', 'hypothesis')] }));
  await start({ projectDir, casesFile, outputDir });
  const edit = async fn => { const file = path.join(outputDir, 'results.json'); const value = JSON.parse(await fs.readFile(file)); fn(value); await fs.writeFile(file, JSON.stringify(value)); };
  return { root, projectDir, casesFile, outputDir, edit };
};
test('initial scaffold is structurally valid and honestly incomplete', async t => {
  const f = await fixture(t); const r = await check(f.outputDir);
  assert.equal(r.structurallyValid, true); assert.equal(r.hasUnexecutedCases, true); assert.equal(r.counts.not_run, 2);
});
test('explicit pass and ambiguous fail remain separate; report deterministic and HTML escaped', async t => {
  const f = await fixture(t);
  await registerEvidence(f.outputDir, 'synthetic.txt');
  await f.edit(r => r.cases.forEach((c, i) => { c.status = i ? 'fail' : 'pass'; c.observed = 'Synthetic observation'; c.rationale = '<script>alert(1)</script>'; c.evidence = ['evidence/synthetic.txt']; }));
  const r = await check(f.outputDir); assert.deepEqual(r.recordedExplicitOutcomes, { pass: 1, fail: 0 }); assert.equal(r.hasUnexecutedCases, false);
  const out = await report(f.outputDir); const md = await fs.readFile(out.reportMarkdown, 'utf8');
  assert.match(md, /NOT confirmed acceptance/); assert.doesNotMatch(md, /<script>/); assert.match(md, /&lt;script&gt;/);
  assert.deepEqual(JSON.parse(await fs.readFile(out.reportJson)), r);
  await assert.rejects(report(f.outputDir), /overwrite/);
});
test('inconclusive and blocked are valid, not forced failures', async t => {
  const f = await fixture(t); await f.edit(r => { r.cases[0].status = 'inconclusive'; r.cases[0].rationale = 'Synthetic uncertainty'; r.cases[1].status = 'blocked'; r.cases[1].rationale = 'Synthetic blocker'; });
  const r = await check(f.outputDir); assert.equal(r.counts.fail, 0); assert.equal(r.counts.inconclusive, 1); assert.equal(r.counts.blocked, 1);
});
test('partial completion is preserved', async t => {
  const f = await fixture(t); await f.edit(r => { r.cases[0].status = 'inconclusive'; r.cases[0].rationale = 'Synthetic uncertainty'; });
  const r = await check(f.outputDir); assert.equal(r.hasUnexecutedCases, true); assert.equal(r.counts.not_run, 1);
});
test('duplicate input cases rejected', () => assert.throws(() => normalizeCases({ schemaVersion: 1, project: 'test', cases: [caseOf(), caseOf()] }), /Duplicate/));
test('malformed cases rejected', () => {
  for (const input of [null, {}, { schemaVersion: 1, project: 'x', cases: [] }, { schemaVersion: 1, project: 'x', cases: [{ ...caseOf(), requiredPath: undefined }] }]) assert.throws(() => normalizeCases(input));
});
for (const [label, change, pattern] of [
  ['duplicate results', r => r.cases.push(r.cases[0]), /Duplicate/],
  ['unknown result', r => { r.cases[0].id = 'unknown'; }, /Unknown/],
  ['missing original result', r => r.cases.pop(), /Missing original/],
  ['basis rewrite', r => { r.cases[0].basis.text = 'Different requirement'; }, /Basis changed/],
  ['missing evidence', r => { r.cases[0].status = 'pass'; r.cases[0].rationale = 'Claim'; }, /requires rationale and evidence/],
  ['missing rationale', r => { r.cases[0].status = 'fail'; r.cases[0].evidence = ['evidence/x.txt']; }, /requires rationale and evidence/],
  ['unknown cause', r => { r.cases[0].cause = 'definitely_product'; }, /Invalid cause/],
  ['invalid attempt', r => { r.cases[0].attempts = [{ status: 'pass', observed: 'Synthetic observation', remainingQuestions: [], rationale: '', evidence: [] }]; }, /requires rationale and evidence/]
]) test(label, async t => { const f = await fixture(t); await f.edit(change); await assert.rejects(check(f.outputDir), pattern); });
test('baseline hash change detected even for whitespace', async t => {
  const f = await fixture(t); await fs.appendFile(path.join(f.outputDir, 'baseline.json'), ' '); await assert.rejects(check(f.outputDir), /hash mismatch/);
});
for (const ref of ['../outside.txt', '/etc/passwd', 'C:/outside.txt', 'evidence\\outside.txt', 'evidence/../results.json', './results.json', 'evidence//x', 'evidence/missing.txt', 'evidence']) {
  test(`reject unsafe or nonexistent evidence ${ref}`, async t => { const f = await fixture(t); await f.edit(r => { r.cases[0].evidence = [ref]; }); await assert.rejects(check(f.outputDir)); });
}
test('symlink evidence and parent paths rejected', async t => {
  const f = await fixture(t); const target = path.join(f.root, 'outside.txt'); await fs.writeFile(target, 'synthetic');
  try { await fs.symlink(target, path.join(f.outputDir, 'evidence', 'link.txt')); } catch (e) { if (e.code === 'EPERM') { t.skip('OS does not allow test symlink creation'); return; } throw e; }
  await f.edit(r => { r.cases[0].evidence = ['evidence/link.txt']; }); await assert.rejects(check(f.outputDir), /Symlink/);
  await fs.symlink(f.projectDir, path.join(f.root, 'linked'), 'dir'); await assert.rejects(safePath(path.join(f.root, 'linked', 'new'), { external: true }), /Symlink/);
});
test('refuse existing targets without modifying them', async t => {
  const f = await fixture(t); const before = await fs.readFile(path.join(f.outputDir, 'manifest.json'), 'utf8');
  await assert.rejects(start(f), /EEXIST/); await assert.rejects(init(f.projectDir), /EEXIST/);
  assert.equal(await fs.readFile(path.join(f.outputDir, 'manifest.json'), 'utf8'), before);
});
test('source repo, roots, and relative record directories rejected', async () => {
  for (const p of [SOURCE_ROOT, path.join(SOURCE_ROOT, 'private-run'), path.parse(SOURCE_ROOT).root, 'relative']) await assert.rejects(safePath(p, { external: true }));
});
test('CLI argument parser rejects missing, unknown, and duplicate flags', async () => {
  for (const args of [['wat'], ['init'], ['check', '--run-dir'], ['check', '--wrong', '/tmp'], ['check', '--run-dir', '/tmp', '--run-dir', '/tmp']]) await assert.rejects(main(args));
});
test('CLI handles quoted-equivalent paths with spaces, without shell dependencies', async t => {
  const f = await fixture(t); const result = await exec(process.execPath, [path.join(SOURCE_ROOT, 'scripts', 'ego.mjs'), 'check', '--run-dir', f.outputDir]);
  assert.equal(JSON.parse(result.stdout).structurallyValid, true);
});
test('original attempts retained rather than replacing a failed run with a later pass', async t => {
  const f = await fixture(t); await registerEvidence(f.outputDir, 'attempt.txt');
  await f.edit(r => { r.cases[0].attempts = [{ status: 'fail', observed: 'Synthetic observation', remainingQuestions: [], rationale: 'Initial synthetic failure', evidence: ['evidence/attempt.txt'], cause: 'unknown' }, { status: 'inconclusive', observed: '', remainingQuestions: [], rationale: 'Later synthetic ambiguity', evidence: [] }]; });
  const r = await check(f.outputDir); assert.equal(r.cases[0].attempts[0].status, 'fail'); assert.equal(r.cases[0].attempts.length, 2);
});
test('interpretation pass is never counted as confirmed acceptance', async t => {
  const f = await fixture(t); const next = path.join(f.root, 'interpretation-run');
  await fs.writeFile(f.casesFile, JSON.stringify({ schemaVersion: 1, project: 'Synthetic interpretation', cases: [caseOf('inferred', 'interpretation')] }));
  await start({ projectDir: f.projectDir, casesFile: f.casesFile, outputDir: next });
  await registerEvidence(next, 'synthetic.txt');
  const filename = path.join(next, 'results.json'); const results = JSON.parse(await fs.readFile(filename));
  Object.assign(results.cases[0], { status: 'pass', observed: 'Synthetic observation', remainingQuestions: [], rationale: 'Synthetic', evidence: ['evidence/synthetic.txt'] });
  await fs.writeFile(filename, JSON.stringify(results));
  const result = await check(next); assert.equal(result.counts.pass, 1); assert.equal(result.recordedExplicitOutcomes.pass, 0);
});
test('malformed JSON fails and no report is emitted', async t => {
  const f = await fixture(t); await fs.writeFile(path.join(f.outputDir, 'results.json'), '{');
  await assert.rejects(report(f.outputDir)); await assert.rejects(fs.stat(path.join(f.outputDir, 'report.md')), /ENOENT/);
});
test('evidence alternate stream syntax rejected', async t => {
  const f = await fixture(t); await f.edit(r => { r.cases[0].evidence = ['evidence/name:stream']; }); await assert.rejects(check(f.outputDir), /Evidence must/);
});
for (const key of ['expected', 'title', 'criticalConditions', 'requiredPath', 'unexpected']) {
  test(`result cannot override baseline field ${key}`, async t => {
    const f = await fixture(t); await f.edit(r => { r.cases[0][key] = 'Rewritten requirement'; });
    await assert.rejects(check(f.outputDir), /Unexpected result key/);
  });
}
test('unexpected attempt metadata rejected rather than propagated', async t => {
  const f = await fixture(t); await f.edit(r => { r.cases[0].attempts = [{ status: 'not_run', observed: '', remainingQuestions: [], rationale: '', evidence: [], unexpected: 'do not propagate' }]; });
  await assert.rejects(check(f.outputDir), /Unexpected attempt key/);
});
test('new scaffold includes empty catalog and explicit observation/question slots', async t => {
  const f = await fixture(t); const r = await check(f.outputDir);
  assert.deepEqual(r.evidenceCatalog, { schemaVersion: 1, items: [] });
  assert.equal(r.cases[0].observed, ''); assert.deepEqual(r.cases[0].remainingQuestions, []);
});
test('pass needs observed behavior, not only rationale and evidence', async t => {
  const f = await fixture(t); await registerEvidence(f.outputDir, 'synthetic.txt');
  await f.edit(r => Object.assign(r.cases[0], { status: 'pass', rationale: 'Claim', evidence: ['evidence/synthetic.txt'] }));
  await assert.rejects(check(f.outputDir), /observed behavior/);
});
test('every referenced evidence file needs catalog metadata', async t => {
  const f = await fixture(t); await fs.writeFile(path.join(f.outputDir, 'evidence', 'uncataloged.txt'), 'Synthetic');
  await f.edit(r => { r.cases[0].evidence = ['evidence/uncataloged.txt']; });
  await assert.rejects(check(f.outputDir), /missing from catalog/);
});
for (const [label, edit] of [
  ['duplicate ids', c => c.items.push({ ...c.items[0], path: 'evidence/other.txt' })],
  ['duplicate paths', c => c.items.push({ ...c.items[0], id: 'other' })],
  ['invalid date', c => { c.items[0].capturedAt = '2026-02-30T00:00:00Z'; }],
  ['offset date', c => { c.items[0].capturedAt = '2026-01-01T00:00:00+08:00'; }],
  ['unknown kind', c => { c.items[0].kind = 'proof'; }],
  ['missing source', c => { delete c.items[0].source; }],
  ['missing file', c => { c.items[0].path = 'evidence/missing.txt'; }],
  ['outside evidence directory', c => { c.items[0].path = 'results.json'; }],
  ['extra metadata', c => { c.items[0].unknown = 'Unexpected'; }]
]) test(`catalog rejects ${label}`, async t => {
  const f = await fixture(t); await registerEvidence(f.outputDir, 'synthetic.txt');
  const filename = path.join(f.outputDir, 'evidence.json'); const catalog = JSON.parse(await fs.readFile(filename)); edit(catalog); await fs.writeFile(filename, JSON.stringify(catalog));
  await assert.rejects(check(f.outputDir));
});
for (const status of ['inconclusive', 'blocked']) test(`${status} requires an explanation`, async t => {
  const f = await fixture(t); await f.edit(r => { r.cases[0].status = status; }); await assert.rejects(check(f.outputDir), /requires rationale/);
});
test('closed case input format rejects unexpected keys', () => {
  for (const update of [x => { x.extra = 1; }, x => { x.cases[0].extra = 1; }, x => { x.cases[0].basis.extra = 1; }]) {
    const input = { schemaVersion: 1, project: 'Synthetic', cases: [caseOf()] }; update(input); assert.throws(() => normalizeCases(input));
  }
});
test('closed manifest and result roots reject unexpected keys', async t => {
  const f = await fixture(t); await f.edit(r => { r.extra = true; }); await assert.rejects(check(f.outputDir), /Invalid results/);
  const filename = path.join(f.outputDir, 'manifest.json'); const manifest = JSON.parse(await fs.readFile(filename)); manifest.extra = true; await fs.writeFile(filename, JSON.stringify(manifest)); await assert.rejects(check(f.outputDir), /Invalid manifest/);
});
