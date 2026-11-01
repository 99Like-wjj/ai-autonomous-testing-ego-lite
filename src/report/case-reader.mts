/** Same-source case documents. Presentation and feedback are separate from execution. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Baseline, CasesRef, FileIdentity } from '../contracts/model.mjs';
import { goalRequiredRefs, targetText } from '../contracts/targets.mjs';
import { referenceLabel } from '../contracts/case-view.mjs';
import { parseReviewFeedback, type ReviewFeedback } from '../contracts/review-feedback.mjs';
import { caseFilename, readCasesFile } from '../core/case-versions.mjs';
import { listReviews } from '../core/case-review.mjs';
import { assertClosed, fail, hash, json, safePath, writeNew, removeOwnedFileIfPresent } from '../core/common.mjs';
import { regularFilePath } from '../core/file-integrity.mjs';
import { TOOL_ROOT } from '../scripts/toolchain.mjs';
import { caseReaderCss } from './case-reader-layout.mjs';
import { caseReaderShell } from './case-reader-shell.mjs';
import { reportThemeCss, reportThemes } from './themes.mjs';
import { readFeedbackInput } from './review-export.mjs';

const esc = (value: unknown) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const md = (value: unknown) => String(value).replace(/[\\*_{}\[\]()#+.!|~-]/g, c => '\\' + c).split(String.fromCharCode(96)).join('\\' + String.fromCharCode(96)).replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '  \n');
export interface CaseDocumentModel { kind: 'case_review'; schemaVersion: 9; documentVersion: 2; cases: CasesRef; baseline: Baseline; expectedReviewNumber: number; initialFeedback: ReviewFeedback | null }
export async function loadCaseDocument({ casesFile, feedbackFile }: { casesFile: unknown; feedbackFile?: unknown }) {
  const saved = await readCasesFile(casesFile), reviews = await listReviews(path.dirname(saved.file));
  const initialFeedback = feedbackFile === undefined ? null : parseReviewFeedback(await readFeedbackInput(feedbackFile), { cases: saved.ref, pointIds: saved.baseline.cases.flatMap(c => c.goals.map(g => g.pointId)) }, { allowEmpty: true });
  const model: CaseDocumentModel = { kind: 'case_review', schemaVersion: 9, documentVersion: 2, cases: saved.ref, baseline: saved.baseline, expectedReviewNumber: reviews.filter(r => r.record.cases.caseVersion === saved.ref.caseVersion).length, initialFeedback };
  const script = await fs.readFile(await regularFilePath(path.join(TOOL_ROOT, 'review-ui/main.js')), 'utf8');
  return { saved, model, script };
}
export function caseMarkdown(model: CaseDocumentModel): string {
  const b = model.baseline, basis = { explicit: '需求明确规定', interpretation: '需求解释', hypothesis: '探索性假设' };
  const lines = ['# ' + md(b.project) + ' · 用例 v' + b.caseVersion, '', '本文件为设计/审阅资料，没有创建运行，也不代表业务通过。', '用例指纹：' + model.cases.sha256, ''];
  for (const c of b.cases) {
    lines.push('## ' + md(c.id) + ' · ' + md(c.title), '');
    for (const g of c.goals) {
      lines.push('### ' + md(g.pointId) + ' · ' + md(g.title), '', '业务预期：' + md(g.expected), '', '依据：' + basis[g.basis.kind] + ' · ' + md(g.basis.source), '', md(g.basis.text), '', '计划状态：' + (g.planState === 'prepared' ? '已准备' : '待补充'), '');
      for (const ref of goalRequiredRefs(c, g)) lines.push('- ' + md(referenceLabel(c, ref)) + '：' + md(targetText(c, ref)));
      if (g.clarificationQuestions.length) lines.push('', '待确认规则：', ...g.clarificationQuestions.map(q => '- ' + md(q)));
      if (g.preparationGaps.length) lines.push('', '计划缺口：', ...g.preparationGaps.map(q => '- ' + md(q)));
      lines.push('');
    }
    if (c.parameters.length) lines.push('参数要求：', ...c.parameters.map(p => '- ' + md(p.id) + '（类型：' + md(p.type) + '）：' + md(p.purpose) + '；' + md(p.constraints.join('；'))), '');
  }
  lines.push('## 来源覆盖', '', ...b.coverage.map(c => '- ' + md(c.id) + ' · ' + md(c.state) + ' · ' + md(c.statement) + '；' + md(c.reason)), '', '## 来源', '', ...b.sources.map(s => '- ' + md(s.id) + '：' + md(s.locator) + '；' + md(s.excerpt) + (s.limitations.length ? '；局限：' + md(s.limitations.join('；')) : '')), '');
  if (model.initialFeedback) lines.push('## 已载入意见副本（未登记正式确认）', '', ...model.initialFeedback.comments.map(c => '- ' + md(c.pointId ?? '总体意见') + '：' + md(c.text)), '', '来源：' + md(model.initialFeedback.source.locator), md(model.initialFeedback.source.excerpt), ...model.initialFeedback.source.limitations.map(t => '- ' + md(t)), '');
  return lines.join('\n');
}
export function caseDocumentHtml(model: CaseDocumentModel, rawScript: string): string {
  const data = JSON.stringify(model).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
  const script = rawScript.replaceAll('</script', '<\\/script'), scriptHash = crypto.createHash('sha256').update(script).digest('base64');
  const themes = reportThemes.map(t => `<button data-theme-id="${t.id}" aria-pressed="false"><span class="swatch" style="background:${t.background}"></span>${esc(t.name)}</button>`).join('');
  const body = caseReaderShell.replace('<div id="theme-options" class="theme-options"></div>', '<div id="theme-options" class="theme-options">' + themes + '</div>');
  return `<!doctype html><html lang="zh-CN" data-theme="A"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${scriptHash}'; connect-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${esc(model.baseline.project)} · 用例审阅</title><style>${reportThemeCss()}\n${caseReaderCss}</style></head><body class="variant-B">${body}<script type="application/json" id="case-data">${data}</script><script>${script}</script></body></html>\n`;
}
export async function renderCases({ casesFile, outputDir, feedbackFile }: { casesFile: unknown; outputDir: unknown; feedbackFile?: unknown }) {
  const { saved, model, script } = await loadCaseDocument({ casesFile, feedbackFile }), target = await safePath(outputDir, { external: true }); await fs.mkdir(target, { recursive: true, mode: 0o700 });
  const prefix = caseFilename(saved.baseline.caseVersion).slice(0, -5), names = { html: prefix + '.html', markdown: prefix + '.md', delivery: prefix + '-delivery.json' };
  const contents = [{ name: names.html, bytes: Buffer.from(caseDocumentHtml(model, script)) }, { name: names.markdown, bytes: Buffer.from(caseMarkdown(model)) }];
  const delivery = { schemaVersion: 9, documentVersion: 2, kind: 'case_documents', cases: saved.ref, files: contents.map(f => ({ name: f.name, sha256: hash(f.bytes), bytes: f.bytes.length })), caseCount: saved.baseline.cases.length, goalCount: saved.baseline.cases.reduce((n, c) => n + c.goals.length, 0), businessExecuted: false };
  contents.push({ name: names.delivery, bytes: Buffer.from(json(delivery)) });
  const owned: { file: string; identity: FileIdentity }[] = [];
  try { for (const content of contents) { const file = path.join(target, content.name); owned.push({ file, identity: await writeNew(file, content.bytes) }); } }
  catch (error) { for (const item of owned.reverse()) await removeOwnedFileIfPresent(item.file, item.identity); throw error; }
  const verified = await verifyCaseDocuments({ casesFile: saved.file, outputDir: target });
  return { ...verified, html: path.join(target, names.html), markdown: path.join(target, names.markdown), delivery: path.join(target, names.delivery), browserOpen: 'not_checked', nativeSave: { command: 'cases serve', casesFile: saved.file, feedbackFile: feedbackFile ?? null, purpose: 'Use the loopback review page for native HTML/JSON file saves.' } };
}
export async function verifyCaseDocuments({ casesFile, outputDir }: { casesFile: unknown; outputDir: unknown }) {
  const saved = await readCasesFile(casesFile), target = await safePath(outputDir, { existing: true }), prefix = caseFilename(saved.ref.caseVersion).slice(0, -5);
  const raw = JSON.parse(await fs.readFile(await regularFilePath(path.join(target, prefix + '-delivery.json')), 'utf8')) as { schemaVersion: number; documentVersion: number; kind: string; cases: CasesRef; files: { name: string; sha256: string; bytes: number }[] };
  if (raw.schemaVersion !== 9 || raw.documentVersion !== 2 || raw.kind !== 'case_documents' || JSON.stringify(raw.cases) !== JSON.stringify(saved.ref) || !Array.isArray(raw.files) || raw.files.length !== 2) fail('Case document manifest identity mismatch.');
  const names = [prefix + '.html', prefix + '.md'];
  for (let i = 0; i < names.length; i++) { const f = raw.files[i]; if (!f || f.name !== names[i]) fail('Unexpected case document filename.'); const bytes = await fs.readFile(await regularFilePath(path.join(target, f.name))); if (hash(bytes) !== f.sha256 || bytes.length !== f.bytes) fail('Case document file changed.'); }
  const html = await fs.readFile(path.join(target, names[0]!), 'utf8'), match = /<script type="application\/json" id="case-data">([\s\S]*?)<\/script>/.exec(html); if (!match) fail('Case document source data is missing.');
  const value: unknown = JSON.parse(match[1]!); assertClosed(value, ['kind', 'schemaVersion', 'documentVersion', 'cases', 'baseline', 'expectedReviewNumber', 'initialFeedback'], 'case document');
  const model = value as unknown as CaseDocumentModel;
  if (model.kind !== 'case_review' || model.schemaVersion !== 9 || model.documentVersion !== 2 || !Number.isSafeInteger(model.expectedReviewNumber) || model.expectedReviewNumber < 0 || JSON.stringify(model.baseline) !== JSON.stringify(saved.baseline) || JSON.stringify(model.cases) !== JSON.stringify(saved.ref)) fail('Case document source identity mismatch.');
  if (model.initialFeedback !== null) parseReviewFeedback(model.initialFeedback, { cases: saved.ref, pointIds: saved.baseline.cases.flatMap(c => c.goals.map(g => g.pointId)) }, { allowEmpty: true });
  const script = await fs.readFile(await regularFilePath(path.join(TOOL_ROOT, 'review-ui/main.js')), 'utf8');
  if (await fs.readFile(path.join(target, names[1]!), 'utf8') !== caseMarkdown(model) || html !== caseDocumentHtml(model, script)) fail('HTML/Markdown do not match the actual case version.');
  return { schemaVersion: 9, documentVersion: 2, cases: saved.ref, filesVerified: true, businessExecuted: false, caseCount: saved.baseline.cases.length, goalCount: saved.baseline.cases.reduce((n, c) => n + c.goals.length, 0) };
}
