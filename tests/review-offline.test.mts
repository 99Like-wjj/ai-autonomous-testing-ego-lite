import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { makeReviewFeedback, feedbackFromText, parseReviewFeedback } from '../src/contracts/review-feedback.mjs';
import { reviewDocuments, reviewFileLimit } from '../src/report/review-feedback-document.mjs';
import { saveReviewFile, type SaveHost, type ReviewFile } from '../src/review-ui/save-file.mjs';
import { TOOL_ROOT } from '../src/scripts/toolchain.mjs';

const identity = { cases: { projectId: 'synthetic-offline-review', caseVersion: 1, sha256: 'a'.repeat(64) }, pointIds: ['SYN-TP-1', 'SYN-TP-2'] };
const titles = new Map([['SYN-TP-1', '合成目标一'], ['SYN-TP-2', '合成目标二']]);
const feedback = () => makeReviewFeedback(identity, 0, 'changes_requested', [...identity.pointIds], [{ pointId: 'SYN-TP-1', text: '仅为合成意见：<img src=x onerror=bad()> </script>\nUnicode：🙂 & "文本"' }, { pointId: null, text: '合成总体意见，不是人工确认。' }]);
const file: ReviewFile = Object.freeze({ name: 'synthetic-review.html', content: '合成内容\n🙂', mime: 'text/html;charset=utf-8', extension: '.html', description: 'Synthetic review HTML' });

test('one static offline HTML retains every scoped opinion, decision, source and restoration data', () => {
  const original = feedback(), before = JSON.stringify(original), docs = reviewDocuments(original, identity, '合成项目', titles);
  assert.deepEqual(feedbackFromText(docs.html), original); assert.deepEqual(JSON.parse(docs.json), original);
  assert.equal(JSON.stringify(original), before); assert.match(docs.html, /未填写逐条意见：1/);
  assert.match(docs.html, /SYN-TP-2 · 合成目标二/); assert.match(docs.html, /&lt;img/);
  assert.ok(!docs.html.includes('<img')); assert.equal((docs.html.match(/<script\b/g) ?? []).length, 1);
  assert.match(docs.html, /<script type="application\/json" id="review-feedback-data">/);
  assert.ok(!docs.html.includes('http://')); assert.ok(!docs.html.includes('https://'));
  assert.throws(() => reviewDocuments({ ...original, pointIds: [identity.pointIds[1]] }, identity, '合成项目', titles), /不能静默丢弃/);
  assert.throws(() => reviewDocuments({ ...original, cases: { ...original.cases, sha256: 'b'.repeat(64) } }, identity, '合成项目', titles), /不属于当前用例版本/);
});

test('export size limit also applies to readable HTML so exported files remain importable', () => {
  const original = feedback(); original.comments[0]!.text = 'x'.repeat(reviewFileLimit);
  assert.throws(() => reviewDocuments(original, identity, '合成项目', titles), /8MiB/);
  assert.deepEqual(parseReviewFeedback(feedbackFromText(reviewDocuments(feedback(), identity, '合成项目', titles).html), identity), feedback());
});

test('picker save calls the picker during the click, closes before reading and compares exact UTF-8 bytes', async () => {
  const calls: string[] = []; let contents = '';
  const host: SaveHost = { pick: async options => {
    calls.push('pick'); assert.equal(options.suggestedName, file.name); assert.deepEqual(options.types[0]!.accept, { 'text/html': ['.html'] });
    return { createWritable: async () => ({ write: async text => { calls.push('write'); contents = text; }, close: async () => { calls.push('close'); } }), getFile: async () => { calls.push('read'); return { arrayBuffer: async () => new TextEncoder().encode(contents).buffer }; } };
  }, download: () => { throw Error('Unexpected download'); } };
  const outcome = saveReviewFile(file, host); assert.deepEqual(calls, ['pick']);
  assert.deepEqual(await outcome, { status: 'saved' }); assert.deepEqual(calls, ['pick', 'write', 'close', 'read']);
});

test('cancelling a picker does not download or write, and a denied picker never silently downloads', async () => {
  let downloads = 0;
  for (const name of ['AbortError', 'SecurityError', 'NotAllowedError']) {
    const result = await saveReviewFile(file, { pick: async () => { throw Object.assign(new Error(name), { name }); }, download: () => { downloads++; } });
    assert.equal(result.status, name === 'AbortError' ? 'cancelled' : 'error');
  }
  assert.equal(downloads, 0);
});

test('unsupported or explicitly selected download emits the original snapshot without claiming a disk readback', async () => {
  const downloaded: ReviewFile[] = []; let picks = 0;
  const host: SaveHost = { pick: async () => { picks++; throw Error('Must not pick'); }, download: value => downloaded.push(value) };
  assert.deepEqual(await saveReviewFile(file, host, true), { status: 'download_requested' });
  assert.deepEqual(await saveReviewFile(file, { download: host.download }), { status: 'download_requested' });
  assert.equal(picks, 0); assert.deepEqual(downloaded, [file, file]);
});

test('write, close and readback failures retain their failure and abort errors after selection are not user cancellation', async () => {
  for (const stage of ['write', 'close', 'read', 'mismatch']) {
    let aborted = false;
    const result = await saveReviewFile(file, { pick: async () => ({ createWritable: async () => ({
      write: async () => { if (stage === 'write') throw Object.assign(new Error('write aborted'), { name: 'AbortError' }); },
      close: async () => { if (stage === 'close') throw Error('close failed'); },
      abort: async () => { aborted = true; throw Error('secondary abort failure'); }
    }), getFile: async () => { if (stage === 'read') throw Error('read failed'); return { arrayBuffer: async () => new TextEncoder().encode('different bytes').buffer }; } }), download: () => { throw Error('Unexpected download'); } });
    assert.equal(result.status, 'error'); assert.equal(aborted, stage === 'write' || stage === 'close');
    if (result.status === 'error') assert.ok(!result.message.includes('secondary'));
  }
});

test('shipped review UI has no HTTP writer or loopback dependency', async () => {
  const ui = await fs.readFile(path.join(TOOL_ROOT, 'review-ui/main.js'), 'utf8');
  assert.doesNotMatch(ui, /\bfetch\s*\(|XMLHttpRequest|WebSocket|127\.0\.0\.1|nativeBase/);
  assert.match(ui, /showSaveFilePicker/); assert.match(ui, /review-feedback-data/);
  await assert.rejects(fs.stat(path.join(TOOL_ROOT, 'report/review-session.mjs')), { code: 'ENOENT' });
});
