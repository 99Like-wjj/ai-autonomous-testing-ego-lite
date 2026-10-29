import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fixture, addEvidence, observed, record } from './goals-fixture.mjs';
import { check, checkUnlocked } from '../src/core/records.mjs';
import { htmlReportPayload, rasterDimensions, TEXT_PREVIEW_LIMIT } from '../src/report/assets.mjs';
import { markdown, safeJsonForHtml } from '../src/report/render.mjs';
import { report, verifyReport } from '../src/report/delivery.mjs';
import { exportNetworkEvidence, parseEvidenceExport } from '../src/observation/evidence-export.mjs';
import { CaptureStore, networkRoot } from '../src/observation/store.mjs';
import { parseConfig, limitations, type Session } from '../src/observation/model.mjs';
import { canonicalHash, hash, now } from '../src/core/common.mjs';
import { TOOL_VERSION, TOOL_REVISION } from '../src/contracts/layout.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL10AAAAASUVORK5CYII=', 'base64');

test('v7 report retains independent IDs but deduplicates bodies and measures raster bytes', async t => {
  const f = await fixture(t), text = 'Synthetic </script><img src=x onerror=alert(1)> fact'; await fs.writeFile(f.sourceFile, text);
  const first = await addEvidence(f, { metadata: { contentState: 'summary', encoding: 'utf8', purpose: 'A synthetic retained summary' } });
  const second = await addEvidence(f, { operationId: 'evidence-2', expectedRevision: 1 });
  const image = path.join(f.root, 'image.png'); await fs.writeFile(image, png);
  const screenshot = await addEvidence(f, { operationId: 'image', expectedRevision: 2, sourceFile: image, kind: 'screenshot', metadata: { width: 500, height: 300, scope: 'element' } });
  await record(f, observed(first.evidenceId));
  const data = await check(f.runDir), payload = await htmlReportPayload(f.runDir, data);
  assert.equal(Object.keys(payload.previews).length, 3); assert.equal(Object.keys(payload.assets).length, 2);
  assert.equal(payload.previews[first.evidenceId]?.assetId, payload.previews[second.evidenceId]?.assetId);
  const p = payload.previews[screenshot.evidenceId]!; assert.deepEqual([p.width, p.height], [1, 1]); assert.match(p.previewNote, /尺寸不一致/);
  assert.deepEqual(rasterDimensions(png), { width: 1, height: 1 });
  const encoded = safeJsonForHtml(payload); assert.ok(!encoded.includes('</script>')); assert.ok(!encoded.includes('<img'));
  assert.equal(JSON.parse(encoded).assets[hash(text)].text, text);
  assert.match(markdown(data, payload), /留存正文与交付状态/);
});

test('UTF-8 truncation is explicit; excluded content is neither embedded nor attached', async t => {
  const f = await fixture(t); await fs.writeFile(f.sourceFile, '界'.repeat(200));
  const ev = await addEvidence(f);
  const excluded = await addEvidence(f, { operationId: 'excluded', expectedRevision: 1, metadata: { contentState: 'excluded', omissionReason: 'Synthetic privacy policy.' } });
  const data = await check(f.runDir), inline = await htmlReportPayload(f.runDir, data, { textPreviewLimitBytes: 256 });
  const asset = inline.assets[inline.previews[ev.evidenceId]!.assetId!]!;
  assert.equal(asset.truncated, true); assert.equal(asset.retainedBytes, 255); assert.ok(!asset.text?.includes('\ufffd')); assert.equal(inline.delivery.complete, false);
  assert.equal(inline.previews[excluded.evidenceId]?.assetId, undefined);
  const bundle = await htmlReportPayload(f.runDir, data, { mode: 'bundle', textPreviewLimitBytes: 256 });
  assert.match(bundle.previews[ev.evidenceId]!.attachmentPath!, /^attachments\/[a-f0-9]{64}\.txt$/);
  assert.equal(bundle.previews[excluded.evidenceId]?.attachmentPath, undefined);
  assert.equal(TEXT_PREVIEW_LIMIT, 262144);
});

test('bundle verifies full attachments, refuses overwrite and detects tampering', async t => {
  const f = await fixture(t); await fs.writeFile(f.sourceFile, 'complete attachment '.repeat(100));
  await addEvidence(f); const target = path.join(f.root, 'delivery'); await fs.mkdir(target);
  const result = await report(f.runDir, { outputDir: target, deliveryMode: 'bundle', textPreviewLimitBytes: 256 });
  assert.equal(result.filesVerified, true); assert.equal(result.deliveryMode, 'bundle'); assert.equal(result.deliveryComplete, true);
  assert.equal(result.artifacts.length, 5); assert.equal((await verifyReport(f.runDir, target)).filesVerified, true);
  const files = await fs.readdir(path.join(target, 'attachments')); assert.equal(files.length, 1);
  const attachment = path.join(target, 'attachments', files[0]!); assert.deepEqual(await fs.readFile(attachment), await fs.readFile(f.sourceFile));
  await assert.rejects(report(f.runDir, { outputDir: target, deliveryMode: 'bundle' }), /Refusing to overwrite/);
  await fs.appendFile(attachment, 'tampered'); await assert.rejects(verifyReport(f.runDir, target), /attachment hash/);
});

test('delivery rollback removes only files created by this transaction', async t => {
  const f = await fixture(t); await addEvidence(f);
  const target = path.join(f.root, 'rollback'); await fs.mkdir(target); await fs.writeFile(path.join(target, 'user-notes.txt'), 'preserve');
  const originalOpen = fs.open;
  fs.open = (async (...args: Parameters<typeof fs.open>) => {
    if (String(args[0]) === path.join(target, 'report.md')) throw Object.assign(new Error('Synthetic report write failure'), { code: 'EIO' });
    return originalOpen(...args);
  }) as typeof fs.open;
  try { await assert.rejects(report(f.runDir, { outputDir: target, deliveryMode: 'bundle' }), /Synthetic report write failure/); }
  finally { fs.open = originalOpen; }
  assert.deepEqual(await fs.readdir(target), ['user-notes.txt']);
  assert.equal(await fs.readFile(path.join(target, 'user-notes.txt'), 'utf8'), 'preserve');
  assert.equal((await check(f.runDir)).evidenceIntegrity.hashVerifiedItems, 1);
});

test('attachment stat and close failures recover identity and close handles before rollback', async t => {
  const f = await fixture(t); await addEvidence(f);
  for (const failure of ['stat', 'close'] as const) {
    const target = path.join(f.root, 'attachment-' + failure); await fs.mkdir(target); await fs.writeFile(path.join(target, 'user-notes.txt'), 'preserve');
    const originalOpen = fs.open; let captured: Awaited<ReturnType<typeof fs.open>> | undefined, injected = false;
    fs.open = (async (...args: Parameters<typeof fs.open>) => {
      const handle = await originalOpen(...args);
      if (!String(args[0]).startsWith(path.join(target, 'attachments') + path.sep)) return handle;
      captured = handle;
      return new Proxy(handle, { get(object, key) {
        const value: unknown = Reflect.get(object, key, object);
        if (key === failure) return async (...methodArgs: unknown[]) => {
          if (!injected) { injected = true; throw Object.assign(new Error('Synthetic attachment ' + failure + ' failure'), { code: 'EIO' }); }
          return Reflect.apply(value as (...args: unknown[]) => unknown, object, methodArgs);
        };
        return typeof value === 'function' ? value.bind(object) : value;
      } });
    }) as typeof fs.open;
    try { await assert.rejects(report(f.runDir, { outputDir: target, deliveryMode: 'bundle' }), new RegExp('Synthetic attachment ' + failure + ' failure')); }
    finally { fs.open = originalOpen; }
    assert.equal(injected, true); assert.equal(captured?.fd, -1); assert.deepEqual(await fs.readdir(target), ['user-notes.txt']);
  }
});

test('deduplicated bytes do not merge evidence-specific content states or preview kinds', async t => {
  const f = await fixture(t); await fs.writeFile(f.sourceFile, '{"value":42}');
  const summary = await addEvidence(f, { metadata: { contentState: 'summary', mediaType: 'application/json' } });
  const selected = await addEvidence(f, { expectedRevision: 1, operationId: 'selected', metadata: { contentState: 'selected_fields', mediaType: 'text/plain', limitations: ['Selected source fields only.'] } });
  const unsupported = await addEvidence(f, { expectedRevision: 2, operationId: 'not-a-raster', kind: 'screenshot' });
  const excluded = await addEvidence(f, { expectedRevision: 3, operationId: 'excluded-duplicate', metadata: { contentState: 'excluded', omissionReason: 'Excluded in this evidence context.' } });
  const payload = await htmlReportPayload(f.runDir, await check(f.runDir));
  assert.equal(Object.keys(payload.assets).length, 1);
  assert.equal(payload.previews[summary.evidenceId]?.assetId, payload.previews[selected.evidenceId]?.assetId);
  assert.equal(payload.previews[summary.evidenceId]?.contentState, 'summary');
  assert.equal(payload.previews[selected.evidenceId]?.contentState, 'selected_fields');
  assert.equal(payload.previews[selected.evidenceId]?.mediaType, 'text/plain');
  assert.equal(payload.previews[unsupported.evidenceId]?.contentState, 'unsupported'); assert.equal(payload.previews[unsupported.evidenceId]?.assetId, undefined);
  assert.equal(payload.previews[excluded.evidenceId]?.contentState, 'excluded'); assert.equal(payload.previews[excluded.evidenceId]?.assetId, undefined);
});

test('unsupported screenshot content stays inert and becomes an explicit delivery gap', async t => {
  const f = await fixture(t), image = path.join(f.root, 'not-raster.svg'); await fs.writeFile(image, '<svg xmlns="http://www.w3.org/2000/svg"><script>throw 1</script></svg>');
  const ev = await addEvidence(f, { sourceFile: image, kind: 'screenshot' }), data = await check(f.runDir);
  const payload = await htmlReportPayload(f.runDir, data);
  assert.equal(payload.previews[ev.evidenceId]?.contentState, 'unsupported'); assert.equal(Object.keys(payload.assets).length, 0); assert.equal(payload.delivery.complete, false);
  const bundle = await htmlReportPayload(f.runDir, data, { mode: 'bundle' });
  assert.ok(bundle.previews[ev.evidenceId]?.attachmentPath?.endsWith('.bin')); assert.equal(bundle.delivery.complete, true);
});

test('explicit missing-screenshot draft preserves state while all other integrity checks stay strict', async t => {
  const f = await fixture(t), image = path.join(f.root, 'image.png'); await fs.writeFile(image, png);
  const ev = await addEvidence(f, { sourceFile: image, kind: 'screenshot' }); await record(f, observed(ev.evidenceId, 'violation'));
  const before = await check(f.runDir), retained = before.evidenceCatalog.items[0]!; await fs.unlink(path.join(f.runDir, retained.path));
  await assert.rejects(check(f.runDir), /ENOENT/);
  const draft = await checkUnlocked(f.runDir, { allowMissingScreenshots: true }), payload = await htmlReportPayload(f.runDir, draft, { allowMissingScreenshots: true });
  assert.equal(draft.counts.violation, 1); assert.deepEqual(draft.evidenceIntegrity.missingScreenshotIds, [ev.evidenceId]);
  assert.equal(payload.previews[ev.evidenceId]?.contentState, 'missing'); assert.equal(payload.delivery.complete, false);
  const target = path.join(f.root, 'draft'); await fs.mkdir(target);
  await report(f.runDir, { outputDir: target, allowMissingScreenshots: true }); assert.equal((await verifyReport(f.runDir, target)).deliveryComplete, false);
  await fs.writeFile(path.join(f.runDir, retained.path), 'changed bytes');
  await assert.rejects(checkUnlocked(f.runDir, { allowMissingScreenshots: true }), /mismatch/);
});

test('network evidence export selects committed events and keeps bounded-window limitations', async t => {
  const f = await fixture(t), network = await networkRoot(f.runDir, true), captureId = 'cap-report-export';
  const config = parseConfig({ networkVersion: 1, spaceId: 1, pages: [{ label: 'p1', targetId: 'synthetic-target', origins: ['http://localhost:51709'] }], interfaces: [{ origin: 'http://localhost:51709', pathPrefixes: ['/api'] }] });
  const session: Session = { networkVersion: 1, captureId, runId: network.runId, createdAt: now(), priorCaptureBytes: 0, config, toolVersion: TOOL_VERSION, toolRevision: TOOL_REVISION, limitations };
  const store = await CaptureStore.create(path.join(network.root, 'captures', captureId), session), bodyText = JSON.stringify({ data: { code: 200, message: 'Synthetic only', detail: 'not selected' } });
  const body = await store.body({ data: bodyText, encoding: 'utf8', sourceBytes: Buffer.byteLength(bodyText), transformed: false });
  const event = { kind: 'response-body', source: { page: 'p1', targetId: 'synthetic-target', generation: 1, sessionId: 'synthetic-session' }, receivedAt: now(), path: '/api/save', method: 'POST', status: 200, requestKey: 'synthetic-key', body };
  await store.event(event); await store.event({ ...event, requestKey: 'synthetic-next' });
  const request = { networkVersion: 1, query: { networkVersion: 1, captureIds: [captureId], includeBodies: true, limit: 1 }, selection: [{ captureId, seq: 1 }], purpose: 'Inspect selected synthetic business code', bodyFields: ['data.code'] };
  const outputFile = path.join(f.root, 'selected.json'), receipt = await exportNetworkEvidence({ runDir: f.runDir, request, outputFile });
  const saved = JSON.parse(await fs.readFile(outputFile, 'utf8'));
  assert.equal(receipt.hasMore, true); assert.equal(saved.source.hasMore, true); assert.equal(saved.events[0].requestKey, 'synthetic-key');
  assert.equal(saved.events[0].bodyPreview.data, '{"data.code":200}'); assert.ok(!JSON.stringify(saved.events).includes('not selected'));
  assert.equal(receipt.registration.metadata.contentState, 'selected_fields');
  assert.equal(saved.source.querySha256, canonicalHash(saved.source.query)); assert.match(saved.source.resultSha256, /^[a-f0-9]{64}$/); assert.notEqual(saved.source.querySha256, saved.source.resultSha256);
  await assert.rejects(exportNetworkEvidence({ runDir: f.runDir, request, outputFile }), /EEXIST/);
  await assert.rejects(exportNetworkEvidence({ runDir: f.runDir, request: { ...request, selection: [{ captureId, seq: 2 }] }, outputFile: path.join(f.root, 'wrong.json') }), /selected_event_not_in_query_page/);
  assert.throws(() => parseEvidenceExport({ ...request, bodyFields: ['constructor.value'] }), /unsafe_export_body_field/);
  await assert.rejects(exportNetworkEvidence({ runDir: f.runDir, request: { ...request, bodyFields: ['data'] }, outputFile: path.join(f.root, 'parent.json') }), /export_body_field_must_be_scalar/);
  assert.throws(() => parseEvidenceExport({ ...request, bodyFields: ['data.' + 'access' + '_' + 'token'] }), /unsafe_export_body_field/);
  const innerOffset = bodyText.indexOf('{', 1), innerJSON = bodyText.slice(innerOffset, -1), partialFile = path.join(f.root, 'partial-root.json');
  assert.equal(JSON.parse(innerJSON).code, 200);
  const partialReceipt = await exportNetworkEvidence({ runDir: f.runDir, request: { ...request, query: { ...request.query, bodyOffset: innerOffset, bodyLimit: innerJSON.length }, bodyFields: ['code'] }, outputFile: partialFile });
  const partial = JSON.parse(await fs.readFile(partialFile, 'utf8'));
  assert.equal(partial.events[0].bodySelection.state, 'partial_window'); assert.equal(partial.events[0].bodyPreview, undefined); assert.equal(partial.events[0].bodyWindow.offset, innerOffset);
  assert.equal(partialReceipt.registration.metadata.contentState, 'summary');
});
