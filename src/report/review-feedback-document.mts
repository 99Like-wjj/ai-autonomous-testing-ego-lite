/** Portable, inert review documents shared by the offline page and optional CLI. */
import { uiText as u, uiHtml, presentationLanguage } from './ui-text.mjs';
import { feedbackFromText, parseReviewFeedback, type FeedbackIdentity, type ReviewFeedback } from '../contracts/review-feedback.mjs';
import { reportThemeCss } from './themes.mjs';

export const reviewFileLimit = 8 * 1024 * 1024;
const esc = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function reviewDocuments(input: unknown, identity: FeedbackIdentity, project: string, titles: ReadonlyMap<string, string>): { feedback: ReviewFeedback; json: string; html: string } {
  const feedback = parseReviewFeedback(input, identity), json = JSON.stringify(feedback, null, 2) + '\n';
  const data = JSON.stringify(feedback).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
  const decision = { comment_only: u('仅记录意见'), changes_requested: u('需要修改'), approved: u('拟确认所选范围') }[feedback.decision];
  const commented = new Set(feedback.comments.flatMap(c => c.pointId === null ? [] : [c.pointId]));
  const html = uiHtml`<!doctype html><html lang="${presentationLanguage()}" data-theme="A"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${esc(project)} · 评审意见</title><style>${reportThemeCss()}
*{box-sizing:border-box}body{margin:0;background:var(--background);color:var(--ink);font:15px/1.9 system-ui,"Microsoft YaHei",sans-serif}main{max-width:980px;margin:35px auto;padding:28px 36px;background:var(--panel);border:1px solid var(--line);border-radius:12px}h1{font-size:26px;margin:4px 0 15px}h2{font-size:18px;margin:6px 0}.meta{font-size:12px;color:var(--muted);overflow-wrap:anywhere}.summary{background:var(--surface);padding:13px 17px;border-radius:8px}.comment{border-top:1px solid var(--line);padding:19px 0;margin-top:15px}.text{white-space:pre-wrap;overflow-wrap:anywhere}details{font-size:12px;color:var(--muted);margin-top:18px}footer{font-size:11px;color:var(--muted);border-top:1px solid var(--line);padding-top:16px;margin-top:15px}@media(max-width:700px){main{margin:12px;padding:22px}}</style></head><body><main><p class="meta">用例 v${feedback.cases.caseVersion} · 可恢复的评审意见副本</p><h1>${esc(project)}</h1><p class="summary">范围 ${feedback.pointIds.length} 条用例 · ${feedback.comments.length} 条意见<br>未填写逐条意见：${feedback.pointIds.length - commented.size}<br>拟提交结论：${decision}。本文件不登记正式确认，也不启动测试。</p>${feedback.comments.map(c => `<section class="comment"><p class="meta">${esc(c.pointId ?? u('总体意见'))}</p><h2>${esc(c.pointId === null ? u('总体意见') : titles.get(c.pointId) ?? c.pointId)}</h2><div class="text">${esc(c.text)}</div></section>`).join('')}<details><summary>导出范围</summary>${feedback.pointIds.map(id => `<p class="meta">${esc(id)} · ${esc(titles.get(id) ?? id)}</p>`).join('')}</details><details><summary>意见来源与局限</summary><p>${esc(feedback.source.locator)}</p><p>${esc(feedback.source.excerpt)}</p>${feedback.source.limitations.map(t => `<p>${esc(t)}</p>`).join('')}</details><footer>可在同版本用例审阅页中选择“恢复评审记录”读取本文件。<br>项目标识：${esc(feedback.cases.projectId)}<br>用例指纹：${feedback.cases.sha256}</footer></main><script type="application/json" id="review-feedback-data">${data}</script></body></html>\n`;
  for (const text of [json, html]) {
    if (new TextEncoder().encode(text).byteLength > reviewFileLimit) throw Error(u('评审文件超过8MiB导出限制。'));
    if (JSON.stringify(parseReviewFeedback(feedbackFromText(text), identity)) !== JSON.stringify(feedback)) throw Error(u('生成的评审文件内容核对失败。'));
  }
  return { feedback, json, html };
}
