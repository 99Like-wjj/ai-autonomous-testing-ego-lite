import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { testFilesFixture } from './test-files-fixture.mjs';
import { htmlReportPayload, TEST_FILE_DOWNLOAD_LIMIT, TEST_FILE_DOWNLOAD_TOTAL_LIMIT } from '../src/report/assets.mjs';
import { report, verifyReport } from '../src/report/delivery.mjs';
import { check, recordResult, validatePayloadAgainstCase } from '../src/core/records.mjs';
import { parseActionFact, parseEvidenceMetadata } from '../src/core/validation.mjs';
import { mapRecordEvidence, recordEvidenceIds } from '../src/core/action-events.mjs';
import { crc32, storedZip } from '../src/report/file-archive.mjs';
import { safeAttachmentPath } from '../src/contracts/attachment-path.mjs';
import { validateAssessment } from '../src/execution/packets.mjs';
import { startSyntheticRun } from './synthetic-cases.mjs';
import { mapConversationMetadata } from '../src/core/conversations.mjs';
import { hash } from '../src/core/common.mjs';
import type { RecordPayload } from '../src/contracts/model.mjs';
import { filteredTestFiles, testFileDownloadControl } from '../src/report-ui/test-files.js';

async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ego-test-files-'));
  t.after(async () => { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('ego-test-files-')); await fs.rm(root, { recursive: true, force: true }); });
  return testFilesFixture(root);
}

test('explicit files retain original names, four roles, message mapping and independent verdicts', async t => {
  const f = await fixture(t), before = JSON.stringify(f.checked), payload = await htmlReportPayload(f.run, f.checked, { mode: 'bundle' });
  const files = payload.testFiles!;
  assert.equal(files.complete, true); assert.equal(files.items.length, 4); assert.equal(files.archive!.fileCount, 4);
  assert.equal(Object.keys(payload.testFileDownloads!).length, 3); // identical bytes, separate logical names
  const input = files.items.find(v => v.evidenceId === f.input.evidenceId)!;
  assert.equal(input.name, '输入数据.csv'); assert.ok(input.attachmentPath!.endsWith('.csv')); assert.ok(safeAttachmentPath(input.attachmentPath));
  assert.deepEqual(new Set(files.items.flatMap(f => f.uses.flatMap(u => u.role ? [u.role] : []))), new Set(['upload_input', 'download_output', 'ai_input', 'ai_output']));
  assert.ok(input.uses.some(u => u.messageId === 'user-1' && u.actionId === 'chat'));
  assert.notEqual(input.attachmentPath, files.items.find(v => v.evidenceId === f.renamed.evidenceId)!.attachmentPath);
  assert.equal(JSON.stringify(f.checked), before); assert.equal(payload.report.counts.verified, 0);
  assert.equal(filteredTestFiles(payload, '', 'files-1', '', 'all').length, 0);
  assert.equal(filteredTestFiles(payload, '输入数据.csv', 'files-0', f.checked.cases[0]!.goals[0]!.pointId, 'input').length, 1);
  assert.equal(filteredTestFiles(payload, '', 'files-0', '', 'output').length, 2);
  const inline = await htmlReportPayload(f.run, f.checked, { mode: 'inline' });
  assert.equal(inline.testFiles!.complete, false); assert.equal(inline.delivery.complete, false); assert.equal(inline.testFiles!.archive, undefined);
});

test('ordinary upload alone chooses a portable bundle; moved files and ZIP have verified bytes', async t => {
  const f = await fixture(t), justInput = structuredClone(f.checked);
  justInput.evidenceCatalog.items = justInput.evidenceCatalog.items.filter(e => e.id === f.input.evidenceId);
  justInput.cases = justInput.cases.map(c => ({ ...c, observations: [], assessments: [] }));
  const payload = await htmlReportPayload(f.run, justInput, { mode: 'bundle' });
  assert.equal(payload.testFiles!.items.length, 1); assert.equal(payload.testFiles!.complete, false); // retained but unassociated
  const ordinaryProject = path.join(f.root, 'ordinary', 'project'), ordinaryRun = path.join(f.root, 'ordinary', 'run');
  await fs.mkdir(path.join(ordinaryProject, 'cases'), { recursive: true });
  const ordinaryCases = path.join(ordinaryProject, 'cases', 'v001.json'); await fs.copyFile(f.casesFile, ordinaryCases);
  await startSyntheticRun({ projectDir: ordinaryProject, casesFile: ordinaryCases, outputDir: ordinaryRun });
  const onlyFile = await import('../src/core/records.mjs');
  await onlyFile.registerEvidence({ runDir: ordinaryRun, request: { schemaVersion: 9, operationId: 'only-upload', expectedRevision: 0, caseId: 'files-0', sourceFile: f.input.sourceFile, kind: 'other', source: 'Synthetic input', description: 'Only upload input', metadata: { contentState: 'full', testFile: { name: '只有输入.csv', origin: 'generated' } } } });
  const ordinaryOut = path.join(f.root, 'ordinary', 'report'); await fs.mkdir(ordinaryOut);
  await report(ordinaryRun, { outputDir: ordinaryOut });
  const ordinaryManifest = JSON.parse(await fs.readFile(path.join(ordinaryOut, 'report-delivery.json'), 'utf8'));
  assert.equal(ordinaryManifest.options.mode, 'bundle'); assert.equal(ordinaryManifest.testFiles.items.length, 1);
  const out = path.join(f.root, 'report'); await fs.mkdir(out);
  await report(f.run, { outputDir: out });
  assert.equal((await verifyReport(f.run, out)).filesVerified, true);
  const moved = path.join(f.root, 'moved report'); await fs.rename(out, moved);
  const manifest = JSON.parse(await fs.readFile(path.join(moved, 'report-delivery.json'), 'utf8'));
  assert.equal(manifest.deliveryVersion, 2); assert.equal(manifest.options.mode, 'bundle'); assert.equal(manifest.testFiles.complete, true);
  for (const file of manifest.testFiles.items) assert.equal(hash(await fs.readFile(path.join(moved, file.attachmentPath))), file.sha256);
  const archive = await fs.readFile(path.join(moved, 'test-attachments.zip'));
  assert.equal(hash(archive), manifest.testFiles.archive.sha256); assert.equal((await verifyReport(f.run, moved)).filesVerified, true);
  await fs.writeFile(path.join(moved, 'test-attachments.zip'), archive.subarray(0, -1));
  await assert.rejects(verifyReport(f.run, moved), /ZIP hash/);
});

test('same names with different bytes, long Unicode names and ordinary image previews keep file identity', async t => {
  const f = await fixture(t);
  const duplicate = await f.register('同名不同内容', 'different bytes', { contentState: 'full', testFile: { name: '输入数据.csv', origin: 'generated' } });
  const longName = '中文长文件名'.repeat(35) + '.csv';
  const long = await f.register('长文件名', 'long name test', { contentState: 'full', testFile: { name: longName, origin: 'generated' } });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nZwAAAAASUVORK5CYII=', 'base64');
  const image = await f.register('普通上传图片', png, { contentState: 'full', testFile: { name: '测试图片.png', origin: 'generated' } });
  const payload = await htmlReportPayload(f.run, await check(f.run), { mode: 'bundle' }), items = payload.testFiles!.items;
  assert.notEqual(items.find(f => f.evidenceId === duplicate.evidenceId)!.attachmentPath, items.find(v => v.evidenceId === f.input.evidenceId)!.attachmentPath);
  assert.equal(items.find(f => f.evidenceId === long.evidenceId)!.name, longName);
  const preview = payload.previews[image.evidenceId]!;
  assert.equal(payload.assets[preview.assetId!]!.kind, 'image'); assert.equal(payload.report.evidenceCoverage.registeredScreenshots, 0);
  const out = path.join(f.root, 'unicode-report'); await fs.mkdir(out); await report(f.run, { outputDir: out });
  const first = await fs.readFile(path.join(out, 'test-attachments.zip'));
  const another = path.join(f.root, 'unicode-report-copy'); await fs.mkdir(another); await report(f.run, { outputDir: another });
  assert.deepEqual(first, await fs.readFile(path.join(another, 'test-attachments.zip')));
});

test('unknown, excluded and partial originals remain gaps, never fake original-download links', async t => {
  const f = await fixture(t), excluded = await f.register('已排除.txt', 'excluded note', { testFile: { name: '已排除.txt', origin: 'other' }, contentState: 'excluded', omissionReason: 'Synthetic exclusion.' });
  const partial = await f.register('不完整.txt', 'partial', { testFile: { name: '不完整.txt', origin: 'other' }, contentState: 'truncated', omissionReason: 'Only a fragment.' });
  const record: RecordPayload = structuredClone(f.record);
  record.observations[0]!.id = 'actual-unknown'; record.assessments.forEach(a => a.observationIds = ['actual-unknown']);
  record.observations[0]!.actions!.push({ id: 'unknown', description: '导出传输未知', planRefs: [], evidenceIds: [], fileUses: [{ role: 'download_output', name: '未取得.csv', unavailableReason: '没有取得完成回执或原件。' }] });
  await recordResult({ runDir: f.run, request: { schemaVersion: 9, operationId: 'unknown', expectedRevision: 1, caseId: 'files-0', mode: 'final', record } });
  const payload = await htmlReportPayload(f.run, await check(f.run), { mode: 'bundle' });
  assert.equal(payload.testFiles!.complete, false);
  for (const id of [excluded.evidenceId, partial.evidenceId]) assert.equal(payload.testFiles!.items.find(f => f.evidenceId === id)!.attachmentPath, undefined);
  assert.equal(payload.testFiles!.items.find(f => f.name === '未取得.csv')!.status, 'unavailable');
  const bad = structuredClone(f.record); bad.observations[0]!.actions![0]!.fileUses = [{ role: 'upload_input', evidenceId: f.rawEvidence.evidenceId }];
  bad.observations[0]!.id = 'actual-bad'; bad.assessments.forEach(a => a.observationIds = ['actual-bad']);
  bad.observations[0]!.actions![0]!.evidenceIds.push(f.rawEvidence.evidenceId); bad.observations[0]!.evidenceIds.push(f.rawEvidence.evidenceId);
  await assert.rejects(recordResult({ runDir: f.run, request: { schemaVersion: 9, operationId: 'bad', expectedRevision: 2, caseId: 'files-0', mode: 'attempt', record: bad } }), /filename and provenance/);
});

test('file relations survive packet remapping and reject another case or an unreferenced action file', async t => {
  const f = await fixture(t), payload = structuredClone(f.record), map = new Map<string, string>();
  for (const e of f.checked.evidenceCatalog.items) map.set(e.id, 'local-' + map.size);
  const mapped = mapRecordEvidence(payload, id => map.get(id)!);
  assert.equal(mapped.observations[0]!.actions![0]!.fileUses![0]!.evidenceId, map.get(f.input.evidenceId));
  const evidence = f.checked.evidenceCatalog.items.map(e => ({ key: map.get(e.id)!, path: e.path, kind: e.kind, source: e.source, description: e.description, bytes: e.bytes, sha256: e.sha256, ...(e.capturedAt ? { capturedAt: e.capturedAt } : {}), ...(e.metadata ? { metadata: mapConversationMetadata(e.metadata, id => map.get(id)!)! } : {}) }));
  const localRecord = mapRecordEvidence(payload, id => map.get(id)!);
  const packet = { schemaVersion: 9 as const, packetId: 'files-packet', runId: f.checked.runId, baselineSha256: 'a'.repeat(64), assignmentId: 'a', attemptId: 'b', caseId: 'files-0', mode: 'final' as const, record: localRecord, evidence, spaceUsage: [] };
  assert.doesNotThrow(() => validateAssessment(packet, f.checked.cases[0]!));
  const bad = structuredClone(payload); bad.observations[0]!.actions![0]!.evidenceIds = [];
  assert.throws(() => validatePayloadAgainstCase(f.checked.cases[0]!, bad, [], new Map(f.checked.evidenceCatalog.items.map(e => [e.id, e]))), /must belong/);
  const wrongOwner = new Map(f.checked.evidenceCatalog.items.map(e => [e.id, { ...e, caseId: 'files-1' }]));
  assert.throws(() => validatePayloadAgainstCase(f.checked.cases[0]!, payload, [], wrongOwner), /different case/);
});

test('ZIP CRC, portable paths and file metadata validation reject active path escapes', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  const entries = [{ name: 'files/中文.csv', bytes: Buffer.from('原文') }], zip = storedZip(entries);
  assert.deepEqual(zip, storedZip(entries)); assert.equal(zip.readUInt16LE(6), 0x800);
  for (const name of ['../escape', '/absolute', 'files/../escape', 'files\\escape']) assert.throws(() => storedZip([{ name, bytes: Buffer.from('x') }]), /Unsafe/);
  for (const name of ['../a.csv', 'a\\b.csv', '\0.csv']) assert.throws(() => parseEvidenceMetadata({ testFile: { name, origin: 'generated' } }));
  for (const path of ['attachments/../x', 'file:///secret', 'attachments/%2e%2e/x', 'test-attachments.zip']) assert.equal(safeAttachmentPath(path), undefined);
  assert.throws(() => parseActionFact({ id: 'a', description: 'Synthetic', planRefs: [], evidenceIds: [], fileUses: [{ role: 'ai_output' }] }));
});

test('exact bounded bytes drive inert original downloads; large files use the static ZIP instead of file navigation', async t => {
  const f = await fixture(t), html = Buffer.from('<html><script>globalThis.syntheticProbe=true</script></html>');
  const active = await f.register('主动内容原件.html', html, { contentState: 'full', testFile: { name: '主动内容原件.html', origin: 'generated' } });
  const large = await f.register('超预算文本.txt', Buffer.alloc(TEST_FILE_DOWNLOAD_LIMIT + 1, 120), { contentState: 'full', testFile: { name: '超预算文本.txt', origin: 'generated' } });
  const empty = await f.register('空文件.txt', Buffer.alloc(0), { contentState: 'full', testFile: { name: '空文件.txt', origin: 'generated' } });
  const payload = await htmlReportPayload(f.run, await check(f.run), { mode: 'bundle' });
  assert.deepEqual(Buffer.from(payload.testFileDownloads![active.sha256]!, 'base64'), html);
  assert.equal(payload.testFileDownloads![empty.sha256], ''); assert.equal(payload.testFileDownloads![large.sha256], undefined);
  const activeFile = payload.testFiles!.items.find(f => f.evidenceId === active.evidenceId)!, largeFile = payload.testFiles!.items.find(f => f.evidenceId === large.evidenceId)!;
  assert.match(testFileDownloadControl(payload, activeFile), /data-file-download/);
  assert.doesNotMatch(testFileDownloadControl(payload, activeFile), /href=/);
  assert.match(testFileDownloadControl(payload, largeFile), /href="test-attachments.zip"/);
  assert.equal(path.basename(activeFile.attachmentPath!), '主动内容原件.html');
});

test('the aggregate original-download copy remains bounded while all retained originals stay in the ZIP', async t => {
  const f = await fixture(t), heavy = [];
  for (let i = 0; i < 5; i++) heavy.push(await f.register('批量原件' + i + '.txt', Buffer.alloc(TEST_FILE_DOWNLOAD_LIMIT, 65 + i), { contentState: 'full', testFile: { name: '批量原件' + i + '.txt', origin: 'generated' } }));
  const payload = await htmlReportPayload(f.run, await check(f.run), { mode: 'bundle' });
  const bytes = Object.values(payload.testFileDownloads!).reduce((n, data) => n + Buffer.from(data, 'base64').length, 0);
  assert.ok(bytes <= TEST_FILE_DOWNLOAD_TOTAL_LIMIT);
  assert.ok(heavy.some(file => payload.testFileDownloads![file.sha256] === undefined));
  assert.equal(payload.testFiles!.archive!.fileCount, 9);
});
