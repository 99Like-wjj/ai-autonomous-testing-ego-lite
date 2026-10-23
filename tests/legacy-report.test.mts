import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { init, start, report, check, verifyReport, registerEvidence, recordResult, SOURCE_ROOT } from '../src/scripts/ego.mjs';
import { htmlReportPayload, safeJsonForHtml, markdown } from '../src/report/render.mjs';
import { legacySentinel, legacyFrameSha256 } from '../src/report/legacy.mjs';
import { hash, json } from '../src/core/common.mjs';

test('v0.1.3 report frame and original data ordering verify without rewriting any historical file', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ego-legacy-report-'));
  t.after(async () => { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('ego-legacy-report-')); await fs.rm(root, { recursive: true, force: true }); });
  const project = path.join(root, 'project'), run = path.join(root, 'run'); await init(project);
  await start({ projectDir: project, casesFile: path.join(project, 'cases.example.json'), outputDir: run, runSchemaVersion: 3 });
  const source = path.join(root, 'synthetic.log'); await fs.writeFile(source, 'Synthetic old report only.');
  const ev = await registerEvidence({ runDir: run, request: { schemaVersion: 3, operationId: 'legacy-ev', expectedRevision: 0, caseId: 'example-1', sourceFile: source, kind: 'log', capturedAt: '2026-01-01T00:00:00.000Z', source: 'Synthetic fixture', description: 'Synthetic historical evidence.' } });
  await recordResult({ runDir: run, request: { schemaVersion: 3, operationId: 'legacy-record', expectedRevision: 0, caseId: 'example-1', mode: 'final', record: { status: 'inconclusive', observed: 'Synthetic observation.', rationale: 'Synthetic remaining question.', remainingQuestions: [], evidenceIds: [ev.evidenceId] } } });
  const data = await check(run); assert.equal(data.schemaVersion, 3);
  // v0.1.3 wrote capturedAt before collectedAt. Deliberately retain that historical JSON key order.
  data.evidenceCatalog.items = data.evidenceCatalog.items.map(item => ({ id: item.id, path: item.path, caseId: item.caseId, kind: item.kind, ...(item.capturedAt === undefined ? {} : { capturedAt: item.capturedAt }), collectedAt: item.collectedAt, source: item.source, description: item.description, sha256: item.sha256, bytes: item.bytes, operationId: item.operationId }));
  const frame = await fs.readFile(path.join(SOURCE_ROOT, 'tests/fixtures/legacy-report-frame.html'), 'utf8'); assert.equal(hash(frame), legacyFrameSha256);
  const html = frame.replace(legacySentinel, safeJsonForHtml(await htmlReportPayload(run, data)));
  await fs.writeFile(path.join(run, 'report.json'), json(data)); await fs.writeFile(path.join(run, 'report.md'), markdown(data)); await fs.writeFile(path.join(run, 'report.html'), html);
  const names = ['report.json', 'report.md', 'report.html']; const before = await Promise.all(names.map(name => fs.readFile(path.join(run, name))));
  const verified = await verifyReport(run); assert.equal(verified.filesVerified, true); assert.equal(verified.renderer, 'v0.1.3-compatible');
  for (const [i, name] of names.entries()) assert.deepEqual(await fs.readFile(path.join(run, name)), before[i]);
  await fs.appendFile(path.join(run, 'report.html'), '<script>malicious()</script>'); await assert.rejects(verifyReport(run), /does not match/);
});
