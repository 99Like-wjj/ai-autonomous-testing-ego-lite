/** Native feedback files: no browser download, no formal review, no business execution. */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FileIdentity } from '../contracts/model.mjs';
import { feedbackFromText, parseReviewFeedback, type ReviewFeedback } from '../contracts/review-feedback.mjs';
import { readCasesFile, caseFilename } from '../core/case-versions.mjs';
import { acquireLock, canonical, canonicalHash, fail, hash, json, safePath, writeNew, removeOwnedFileIfPresent } from '../core/common.mjs';
import { regularFilePath } from '../core/file-integrity.mjs';
import { reportThemeCss } from './themes.mjs';

const esc = (value: unknown) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export const reviewBodyLimit = 8 * 1024 * 1024;
export async function readFeedbackInput(file: unknown): Promise<unknown> {
  const filename = await regularFilePath(await safePath(file, { existing: true }));
  if ((await fs.stat(filename)).size > reviewBodyLimit) fail('Review feedback exceeds the 8 MiB input limit.');
  const bytes = await fs.readFile(filename);
  if (bytes.length > reviewBodyLimit) fail('Review feedback grew beyond the input limit.');
  return feedbackFromText(bytes.toString('utf8'));
}
export function feedbackHtml(feedback: ReviewFeedback, project: string, titles: ReadonlyMap<string, string>): string {
  const data = JSON.stringify(feedback).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
  const decision = { comment_only: '仅记录意见', changes_requested: '需要修改', approved: '拟确认所选范围' }[feedback.decision];
  return `<!doctype html><html lang="zh-CN" data-theme="A"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${esc(project)} · 评审意见</title><style>${reportThemeCss()}
*{box-sizing:border-box}body{margin:0;background:var(--background);color:var(--ink);font:15px/1.9 system-ui,"Microsoft YaHei",sans-serif}main{max-width:980px;margin:35px auto;padding:28px 36px;background:var(--panel);border:1px solid var(--line);border-radius:12px}h1{font-size:26px;margin:4px 0 15px}h2{font-size:18px;margin:6px 0}.meta{font-size:12px;color:var(--muted);overflow-wrap:anywhere}.summary{background:var(--surface);padding:13px 17px;border-radius:8px}.comment{border-top:1px solid var(--line);padding:19px 0;margin-top:15px}.text{white-space:pre-wrap;overflow-wrap:anywhere}details{font-size:12px;color:var(--muted);margin-top:18px}footer{font-size:11px;color:var(--muted);border-top:1px solid var(--line);padding-top:16px;margin-top:15px}@media(max-width:700px){main{margin:12px;padding:22px}}</style><main><p class="meta">用例 v${feedback.cases.caseVersion} · 可恢复的评审意见副本</p><h1>${esc(project)}</h1><p class="summary">范围 ${feedback.pointIds.length} 条用例 · ${feedback.comments.length} 条意见<br>拟提交结论：${decision}。本文件不登记正式确认，也不启动测试。</p>${feedback.comments.map(c => `<section class="comment"><p class="meta">${esc(c.pointId ?? '总体意见')}</p><h2>${esc(c.pointId === null ? '总体意见' : titles.get(c.pointId) ?? c.pointId)}</h2><div class="text">${esc(c.text)}</div></section>`).join('')}<details><summary>意见来源与局限</summary><p>${esc(feedback.source.locator)}</p><p>${esc(feedback.source.excerpt)}</p>${feedback.source.limitations.map(t => `<p>${esc(t)}</p>`).join('')}</details><footer>可在同版本用例审阅页中选择“恢复评审记录”读取本文件。<br>用例指纹：${feedback.cases.sha256}</footer></main><script type="application/json" id="review-feedback-data">${data}</script></html>\n`;
}
interface ExportFile { name: string; sha256: string; bytes: number }
interface ExportManifest { kind: 'case-review-export'; exportVersion: 1; requestSha256: string; files: ExportFile[] }
export interface ReviewExportReceipt {
  outputDir: string; json: string; html: string; manifest: string; requestSha256: string;
  files: ExportFile[]; replayed: boolean; nativeWrite: true; reviewRegistered: false; businessExecuted: false;
}
export async function exportReviewFeedback({ casesFile, request, outputDir }: { casesFile: unknown; request: unknown; outputDir: unknown }): Promise<ReviewExportReceipt> {
  const saved = await readCasesFile(casesFile), identity = { cases: saved.ref, pointIds: saved.baseline.cases.flatMap(c => c.goals.map(g => g.pointId)) };
  const feedback = parseReviewFeedback(request, identity);
  const root = await safePath(outputDir, { external: true }); await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const digest = canonicalHash(feedback), prefix = caseFilename(saved.ref.caseVersion).slice(0, -5) + '-review-' + digest.slice(0, 20);
  const names = [prefix + '.json', prefix + '.html'], manifestFile = path.join(root, prefix + '-delivery.json');
  const receipt = (files: ExportFile[], replayed: boolean): ReviewExportReceipt => ({ outputDir: root, json: path.join(root, names[0]!), html: path.join(root, names[1]!), manifest: manifestFile, requestSha256: digest, files, replayed, nativeWrite: true, reviewRegistered: false, businessExecuted: false });
  const release = await acquireLock(root);
  try {
    let existingManifest: string | undefined;
    try { existingManifest = await fs.readFile(await regularFilePath(manifestFile), 'utf8'); }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
    if (existingManifest !== undefined) {
      const raw = JSON.parse(existingManifest) as ExportManifest;
      if (raw.kind !== 'case-review-export' || raw.exportVersion !== 1 || raw.requestSha256 !== digest || !Array.isArray(raw.files) || raw.files.length !== 2) fail('Existing review export identity mismatch.');
      for (let i = 0; i < names.length; i++) {
        const f = raw.files[i]; if (!f || f.name !== names[i]) fail('Unexpected review export filename.');
        const bytes = await fs.readFile(await regularFilePath(path.join(root, f.name)));
        if (hash(bytes) !== f.sha256 || bytes.length !== f.bytes) fail('Existing review export changed.');
        const value = parseReviewFeedback(feedbackFromText(bytes.toString('utf8')), identity);
        if (canonical(value) !== canonical(feedback)) fail('Existing review export content mismatch.');
      }
      return receipt(raw.files, true);
    }
    const titles = new Map(saved.baseline.cases.flatMap(c => c.goals.map(g => [g.pointId, g.title] as const)));
    const contents = [Buffer.from(json(feedback)), Buffer.from(feedbackHtml(feedback, saved.baseline.project, titles))];
    const files = contents.map((bytes, i) => ({ name: names[i]!, sha256: hash(bytes), bytes: bytes.length }));
    const owned: { file: string; identity: FileIdentity }[] = [];
    try {
      for (let i = 0; i < names.length; i++) { const file = path.join(root, names[i]!); owned.push({ file, identity: await writeNew(file, contents[i]!) }); }
      if ((await readCasesFile(saved.file)).ref.sha256 !== saved.ref.sha256) fail('Case source changed before review export publication.');
      for (let i = 0; i < names.length; i++) {
        const bytes = await fs.readFile(await regularFilePath(path.join(root, names[i]!)));
        if (hash(bytes) !== files[i]!.sha256 || canonical(parseReviewFeedback(feedbackFromText(bytes.toString('utf8')), identity)) !== canonical(feedback)) fail('Native review export readback failed.');
      }
      const metadata: ExportManifest = { kind: 'case-review-export', exportVersion: 1, requestSha256: digest, files };
      owned.push({ file: manifestFile, identity: await writeNew(manifestFile, json(metadata)) });
      return receipt(files, false);
    } catch (error) { for (const item of owned.reverse()) await removeOwnedFileIfPresent(item.file, item.identity); throw error; }
  } finally { await release(); }
}
