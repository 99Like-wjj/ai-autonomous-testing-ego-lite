import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { saveCases, readCasesFile } from '../src/core/case-versions.mjs';
import { caseOf } from './goals-fixture.mjs';
import { goalPlan } from '../src/contracts/case-view.mjs';
import { feedbackFromText, makeReviewFeedback, parseReviewFeedback } from '../src/contracts/review-feedback.mjs';
import { renderCases, verifyCaseDocuments } from '../src/report/case-documents.mjs';
import { exportReviewFeedback, readFeedbackInput } from '../src/report/review-export.mjs';
import { startReviewSession } from '../src/report/review-session.mjs';

async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ego-review-save-'));
  t.after(async () => { assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('ego-review-save-')); await fs.rm(root, { recursive: true, force: true }); });
  const c = caseOf();
  const publication = await saveCases({ workDir: root, request: { schemaVersion: 9, expectedVersion: 0, previousSha256: null, project: 'Synthetic review fixture', pointPrefix: 'REVIEW', reason: 'Synthetic review engineering only', cases: [{ ...c, goals: c.goals.map(g => ({ ...g, pointId: null })) }], sources: [], coverage: [], retiredPoints: [], changes: [] } });
  const saved = await readCasesFile(publication.file), pointIds = saved.baseline.cases.flatMap(c => c.goals.map(g => g.pointId));
  const identity = { cases: saved.ref, pointIds };
  const feedback = makeReviewFeedback(identity, 0, 'comment_only', pointIds, [{ pointId: pointIds[0]!, text: 'Synthetic opinion with <text>, </script> and \n preserved lines.' }, { pointId: null, text: 'Synthetic overall opinion; not human acceptance.' }]);
  return { root, saved, identity, feedback };
}
function post(url: string, body: unknown, origin?: string) { return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) }); }
async function wrongHost(url: string): Promise<number> {
  return new Promise((resolve, reject) => { const req = http.get(url, { headers: { Host: 'untrusted.invalid' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode ?? 0)); }); req.on('error', reject); });
}
test('feedback keeps every scoped opinion, rejects empty/outside/foreign records, and extracts inert HTML data', async t => {
  const f = await fixture(t), roundtrip = parseReviewFeedback(f.feedback, f.identity);
  assert.deepEqual(roundtrip, f.feedback);
  assert.throws(() => parseReviewFeedback({ ...f.feedback, pointIds: [] }, f.identity), /范围/);
  assert.throws(() => parseReviewFeedback({ ...f.feedback, comments: [] }, f.identity), /填写意见/);
  assert.equal(parseReviewFeedback({ ...f.feedback, pointIds: [], comments: [] }, f.identity, { allowEmpty: true }).comments.length, 0);
  assert.throws(() => parseReviewFeedback({ ...f.feedback, pointIds: [f.identity.pointIds[1]] }, f.identity), /不能静默丢弃/);
  assert.throws(() => parseReviewFeedback({ ...f.feedback, cases: { ...f.feedback.cases, sha256: '0'.repeat(64) } }, f.identity), /不属于当前用例版本/);
  assert.throws(() => parseReviewFeedback({ ...f.feedback, sourceKind: 'user_statement' }, f.identity), /正式确认/);
  const data = JSON.stringify(f.feedback).replaceAll('<', '\\u003c');
  assert.deepEqual(feedbackFromText(`<img src="https://example.invalid/not-loaded"><script id="review-feedback-data" type="application/json">${data}</script>`), f.feedback);
  assert.throws(() => feedbackFromText(`<script id="review-feedback-data" type="application/json">${data}</script><script id="review-feedback-data" type="application/json">${data}</script>`), /唯一/);
});
test('human-readable plan resolves authored dependencies and paths without changing target data', () => {
  const c = caseOf(); c.steps[1]!.dependsOn = [c.steps[0]!.id]; c.requiredPath = 'Synthetic mandatory route';
  const before = structuredClone(c), plan = goalPlan(c, c.goals[1]!);
  assert.deepEqual(plan.steps.map(s => s.number), [1, 2]); assert.equal(plan.steps[0]!.required, false); assert.equal(plan.steps[1]!.required, true);
  assert.deepEqual(plan.steps[1]!.dependsOn, [1]); assert.equal(plan.path, c.requiredPath); assert.equal(plan.conditions[0]!.text, c.criticalConditions[0]!.text); assert.deepEqual(c, before);
});
test('case documents retain the overview, three-column review, themes and received comments without a review ledger', async t => {
  const f = await fixture(t), request = path.join(f.root, 'feedback.json'); await fs.writeFile(request, JSON.stringify(f.feedback));
  const output = await renderCases({ casesFile: f.saved.file, outputDir: path.join(f.root, 'documents'), feedbackFile: request });
  const html = await fs.readFile(output.html, 'utf8'), markdown = await fs.readFile(output.markdown, 'utf8');
  assert.match(html, /id="overview-view"/); assert.match(html, /id="workbench-view"/); assert.match(html, /id="review-pane"/); assert.match(html, /id="save-native"/);
  assert.equal((html.match(/data-theme-id="[A-H]"/g) ?? []).length, 8); assert.match(markdown, /已载入意见副本/); assert.match(markdown, /步骤 1/);
  assert.equal((await verifyCaseDocuments({ casesFile: f.saved.file, outputDir: path.dirname(output.html) })).goalCount, 2);
  assert.deepEqual((await fs.readdir(path.dirname(f.saved.file))).filter(x => x.includes('-review-')), []); await assert.rejects(fs.stat(path.join(f.root, 'runs')), { code: 'ENOENT' });
});
test('native exports are idempotent, readable, complete and never remove source Windows zone metadata', async t => {
  const f = await fixture(t), input = path.join(f.root, 'marked-feedback.json'); await fs.writeFile(input, JSON.stringify(f.feedback));
  if (process.platform === 'win32') await fs.writeFile(input + ':Zone.Identifier', '[ZoneTransfer]\r\nZoneId=4\r\n');
  const out = path.join(f.root, 'saved');
  const first = await exportReviewFeedback({ casesFile: f.saved.file, request: await readFeedbackInput(input), outputDir: out });
  const second = await exportReviewFeedback({ casesFile: f.saved.file, request: f.feedback, outputDir: out });
  assert.equal(first.nativeWrite, true); assert.equal(first.reviewRegistered, false); assert.equal(first.businessExecuted, false); assert.equal(first.replayed, false); assert.equal(second.replayed, true); assert.equal(first.json, second.json);
  assert.deepEqual(feedbackFromText(await fs.readFile(first.json, 'utf8')), f.feedback); assert.deepEqual(feedbackFromText(await fs.readFile(first.html, 'utf8')), f.feedback);
  assert.equal((await fs.readdir(out)).length, 3); assert.deepEqual((await fs.readdir(path.dirname(f.saved.file))).filter(x => x.includes('-review-')), []);
  if (process.platform === 'win32') { assert.match(await fs.readFile(input + ':Zone.Identifier', 'utf8'), /ZoneId=4/); await assert.rejects(fs.readFile(first.json + ':Zone.Identifier'), { code: 'ENOENT' }); await assert.rejects(fs.readFile(first.html + ':Zone.Identifier'), { code: 'ENOENT' }); }
  await fs.appendFile(first.json, 'tampered'); await assert.rejects(exportReviewFeedback({ casesFile: f.saved.file, request: f.feedback, outputDir: out }), /changed/); assert.match(await fs.readFile(first.json, 'utf8'), /tampered$/);
});
test('invalid native feedback creates no output directory and does not alter the case version', async t => {
  const f = await fixture(t), outputDir = path.join(f.root, 'must-not-exist'), bytes = await fs.readFile(f.saved.file);
  await assert.rejects(exportReviewFeedback({ casesFile: f.saved.file, request: { ...f.feedback, comments: [] }, outputDir }), /填写意见/);
  await assert.rejects(fs.stat(outputDir), { code: 'ENOENT' }); assert.deepEqual(await fs.readFile(f.saved.file), bytes);
});
test('loopback native save rejects foreign origins/hosts/routes and serializes duplicate saves without arbitrary file access', async t => {
  const f = await fixture(t), outputDir = path.join(f.root, 'session-exports'), session = await startReviewSession({ casesFile: f.saved.file, outputDir });
  try {
    const root = session.info.url, origin = new URL(root).origin;
    const page = await fetch(root); assert.equal(page.status, 200); assert.match(await page.text(), /Synthetic review fixture/); assert.equal(page.headers.get('access-control-allow-origin'), null);
    assert.equal(await wrongHost(root), 403);
    const foreign = root.replace(/\/review\/[a-f0-9]{48}\//, '/review/' + '0'.repeat(48) + '/'); assert.equal((await fetch(foreign)).status, 404);
    assert.equal((await post(root + 'save', f.feedback)).status, 403); assert.equal((await post(root + 'save', f.feedback, 'https://untrusted.invalid')).status, 403);
    assert.equal((await post(root + 'save', { ...f.feedback, outputDir: f.root }, origin)).status, 400);
    assert.deepEqual(await fs.readdir(outputDir), []);
    const responses = await Promise.all([post(root + 'save', f.feedback, origin), post(root + 'save', f.feedback, origin)]);
    assert.deepEqual(responses.map(r => r.status), [200, 200]);
    const records = await Promise.all(responses.map(r => r.json() as Promise<{ replayed: boolean; files: { name: string }[] }>)); assert.equal(records.filter(r => r.replayed).length, 1);
    assert.equal((await fs.readdir(outputDir)).length, 3);
    for (const item of records[0]!.files) { const response = await fetch(root + 'files/' + item.name); assert.equal(response.status, 200); assert.deepEqual(feedbackFromText(await response.text()), f.feedback); }
    assert.equal((await fetch(root + 'files/not-owned.json')).status, 404); assert.equal((await fetch(root + 'files/%2e%2e%2foutside.json')).status, 404); assert.equal((await fetch(root + '?path=' + encodeURIComponent(f.saved.file))).status, 404);
    assert.deepEqual((await fs.readdir(path.dirname(f.saved.file))).filter(x => x.includes('-review-')), []);
  } finally { await session.close(); }
});
