import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { init, start, validateCases } from '../src/core/cases.mjs';
import { check, registerEvidence, progress } from '../src/core/records.mjs';
import { safePath, SOURCE_ROOT, errorInfo } from '../src/core/common.mjs';
import { parseCatalog, parseResults, parseManifest } from '../src/core/validation.mjs';
import { fixture, addEvidence, evidenceRequest, untested, record, readJSON, writeJSON, observed } from './goals-fixture.mjs';

test('evidence copies and hashes retained bytes, preserving only source-supplied capture times', async t => {
  const f = await fixture(t), receipt = await addEvidence(f);
  const catalog = parseCatalog(await readJSON(path.join(f.runDir, 'evidence.json'))), item = catalog.items[0]!;
  assert.equal(item.sha256, receipt.sha256); assert.ok(item.bytes > 0); assert.equal('capturedAt' in item, false);
  assert.equal(await fs.readFile(path.join(f.runDir, item.path), 'utf8'), await fs.readFile(f.sourceFile, 'utf8'));
  assert.equal((await check(f.runDir)).evidenceIntegrity.hashVerifiedItems, 1);
  const stamp = '2026-01-01T00:00:00Z';
  await addEvidence(f, { operationId: 'capture-known', expectedRevision: 1, capturedAt: stamp });
  const later = parseCatalog(await readJSON(path.join(f.runDir, 'evidence.json'))).items[1]!;
  assert.equal(later.capturedAt, stamp); assert.notEqual(later.collectedAt, stamp);
});
test('evidence operations are idempotent and reject changed payloads or result-operation ID reuse', async t => {
  const f = await fixture(t), input = evidenceRequest(f), first = await registerEvidence({ runDir: f.runDir, request: input });
  const replay = await registerEvidence({ runDir: f.runDir, request: Object.fromEntries(Object.entries(input).reverse()) });
  assert.equal(replay.replayed, true); assert.equal(replay.evidenceId, first.evidenceId);
  await assert.rejects(registerEvidence({ runDir: f.runDir, request: { ...input, description: 'Different description.' } }), /different payload/);
  await assert.rejects(record(f, untested(), { operationId: input.operationId }), /evidence operation/);
  await record(f, untested(), { operationId: 'result-op' });
  await assert.rejects(addEvidence(f, { operationId: 'result-op', expectedRevision: 1 }), /result operation/);
});
test('evidence failures clean only operation-owned staged files and preserve source bytes', async t => {
  const f = await fixture(t), original = await fs.readFile(f.sourceFile, 'utf8');
  await assert.rejects(addEvidence(f, { operationId: 'copy-fail' }, { afterCopy: async () => { throw new Error('Injected copy failure'); } }), /copy failure/);
  await assert.rejects(addEvidence(f, { operationId: 'catalog-fail' }, { beforeCatalogCommit: async () => { throw new Error('Injected catalog failure'); } }), /catalog failure/);
  assert.deepEqual(parseCatalog(await readJSON(path.join(f.runDir, 'evidence.json'))).items, []);
  assert.deepEqual(await fs.readdir(path.join(f.runDir, 'evidence')), []);
  assert.deepEqual((await fs.readdir(f.runDir)).filter(name => name.startsWith('.ego-') || name === '.evidence.pending.json'), []);
  assert.equal(await fs.readFile(f.sourceFile, 'utf8'), original);
});
test('evidence commit followed by response loss recovers without duplicate files', async t => {
  const f = await fixture(t);
  await assert.rejects(addEvidence(f, {}, { afterCommit: async () => { throw new Error('Synthetic response lost'); } }), /response lost/);
  assert.ok(await fs.stat(path.join(f.runDir, '.evidence.pending.json')));
  const receipt = await addEvidence(f); assert.equal(receipt.replayed, true);
  assert.equal(parseCatalog(await readJSON(path.join(f.runDir, 'evidence.json'))).items.length, 1);
  assert.deepEqual((await fs.readdir(path.join(f.runDir, 'evidence'))).filter(name => name.startsWith('.')), []);
});
test('evidence metadata and case ownership cannot be invented', async t => {
  const f = await fixture(t);
  for (const edit of [{ caseId: 'missing' }, { capturedAt: 'yesterday' }, { kind: 'network_magic' }, { operationId: '__proto__' }, { extra: true }]) await assert.rejects(addEvidence(f, edit));
  const receipt = await addEvidence(f);
  await assert.rejects(record(f, observed(receipt.evidenceId), { caseId: 'two' }), /different case/);
});
test('retained-byte corruption and dangling or duplicate catalog identities are rejected', async t => {
  const f = await fixture(t), receipt = await addEvidence(f), file = path.join(f.runDir, 'evidence.json');
  const original = parseCatalog(await readJSON(file)), bytes = await fs.readFile(path.join(f.runDir, receipt.path));
  await fs.writeFile(path.join(f.runDir, receipt.path), 'altered'); await assert.rejects(check(f.runDir), /hash or byte count mismatch/);
  await fs.writeFile(path.join(f.runDir, receipt.path), bytes);
  const duplicate = structuredClone(original); duplicate.items.push({ ...duplicate.items[0]! });
  await writeJSON(file, duplicate); await assert.rejects(check(f.runDir), /Duplicate/);
  const dangling = structuredClone(original); dangling.operations = [];
  await writeJSON(file, dangling); await assert.rejects(check(f.runDir), /revision/);
  await writeJSON(file, original); assert.equal((await check(f.runDir)).evidenceIntegrity.hashVerifiedItems, 1);
});
test('unsafe evidence paths never escape the run evidence directory', async t => {
  const f = await fixture(t); await addEvidence(f);
  const file = path.join(f.runDir, 'evidence.json'), original = parseCatalog(await readJSON(file));
  for (const unsafe of ['../outside', 'evidence/../outside', '/tmp/outside', 'C:/outside', 'evidence\\outside', 'evidence//x', 'evidence:x', 'evidence/x:stream']) {
    const changed = structuredClone(original); changed.items[0]!.path = unsafe;
    await writeJSON(file, changed); await assert.rejects(check(f.runDir), /relative slash-separated paths/);
  }
  await writeJSON(file, original);
});
test('regular-file and symlink checks apply to source files and every parent directory', async t => {
  const f = await fixture(t), folder = path.join(f.root, 'source-dir'); await fs.mkdir(folder);
  await assert.rejects(addEvidence(f, { sourceFile: folder }), /regular file/);
  const target = path.join(folder, 'file.log'); await fs.writeFile(target, 'Synthetic linked bytes');
  const link = path.join(f.root, 'source-junction'); await fs.symlink(folder, link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(addEvidence(f, { sourceFile: path.join(link, 'file.log') }), /Symlink/);
  await assert.rejects(safePath('relative', { external: true }), /absolute/);
  await assert.rejects(safePath(path.parse(f.root).root, { external: true }), /filesystem root/);
  await assert.rejects(safePath(path.join(SOURCE_ROOT, 'runs'), { external: true }), /source repository/);
});
test('concurrent writers cannot overwrite the same result revision', async t => {
  const f = await fixture(t);
  const outcomes = await Promise.allSettled([record(f, untested(), { operationId: 'writer-a' }), record(f, untested('saved'), { operationId: 'writer-b' })]);
  assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
  const rejected = outcomes.find(item => item.status === 'rejected'); assert.ok(rejected); assert.match(errorInfo(rejected.reason).message, /locked|Revision conflict/);
  assert.equal((await check(f.runDir)).revision, 1);
});
test('existing locks are not broken and normal operations release their own lock', async t => {
  const f = await fixture(t), lock = path.join(f.runDir, '.run.lock'), existing = { token: 'another-owner', pid: 0, startedAt: '2026-01-01T00:00:00Z' };
  await writeJSON(lock, existing); await assert.rejects(progress(f.runDir), /locked/);
  assert.deepEqual(await readJSON(lock), existing); await fs.unlink(lock);
  await progress(f.runDir); await assert.rejects(fs.stat(lock), /ENOENT/);
});
test('partial lock write failure removes only the lock created by the operation', async t => {
  const f = await fixture(t), lock = path.join(f.runDir, '.run.lock'), open = fs.open.bind(fs); let injected = false;
  fs.open = async (...args) => {
    const handle = await open(...args);
    if (path.resolve(String(args[0])) !== lock || injected) return handle;
    injected = true;
    return new Proxy(handle, { get(target, property) {
      if (property === 'writeFile') return async () => { await target.writeFile('partial lock'); const error = errorInfo(new Error('Synthetic ENOSPC')); error.code = 'ENOSPC'; throw error; };
      const value = Reflect.get(target, property, target); return typeof value === 'function' ? value.bind(target) : value;
    } });
  };
  try { await assert.rejects(progress(f.runDir), error => errorInfo(error).code === 'ENOSPC'); } finally { fs.open = open; }
  assert.equal(injected, true); await assert.rejects(fs.stat(lock), /ENOENT/);
});
test('new-run validation is read-only and rejects old versions without rewriting them', async t => {
  const f = await fixture(t), before = await fs.readFile(f.casesFile, 'utf8');
  assert.equal((await validateCases(f.casesFile)).goalCount, 4); assert.equal(await fs.readFile(f.casesFile, 'utf8'), before);
  const older = path.join(f.root, 'old-cases.json'); await writeJSON(older, { schemaVersion: 3, project: 'Old', cases: [] });
  const oldBytes = await fs.readFile(older, 'utf8'), target = path.join(f.root, 'not-created');
  await assert.rejects(start({ projectDir: f.projectDir, casesFile: older, outputDir: target }), /schemaVersion 7/);
  await assert.rejects(fs.stat(target), /ENOENT/); assert.equal(await fs.readFile(older, 'utf8'), oldBytes);
  assert.throws(() => parseManifest({ schemaVersion: 3 }), /Only schemaVersion 7/);
  assert.throws(() => parseResults({ schemaVersion: 3, revision: 0, cases: [], operations: [] }));
});
test('init and start refuse to overwrite existing project or run records', async t => {
  const f = await fixture(t), baseline = await fs.readFile(path.join(f.runDir, 'baseline.json'));
  await assert.rejects(init(f.projectDir), /EEXIST/);
  await assert.rejects(start({ projectDir: f.projectDir, casesFile: f.casesFile, outputDir: f.runDir }), /EEXIST/);
  assert.deepEqual(await fs.readFile(path.join(f.runDir, 'baseline.json')), baseline);
});
test('closed ledgers reject unknown fields and invalid version metadata', async t => {
  const f = await fixture(t), file = path.join(f.runDir, 'results.json'), original = await readJSON(file);
  await writeJSON(file, { schemaVersion: 7, revision: 0, entries: [], inferredStatus: 'pass' }); await assert.rejects(check(f.runDir), /Unexpected/);
  await writeJSON(file, original);
  const manifestFile = path.join(f.runDir, 'manifest.json'), manifest = parseManifest(await readJSON(manifestFile));
  await writeJSON(manifestFile, { ...manifest, baselineSchemaVersion: 3 }); await assert.rejects(check(f.runDir), /Only schemaVersion 7/);
});
