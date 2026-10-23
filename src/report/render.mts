import type { Report, HtmlPayload, Preview } from '../contracts/model.mjs';
import { caseGoals, goalViews } from './execution-view.mjs';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { TOOL_ROOT } from '../scripts/toolchain.mjs';
import { SOURCE_ROOT, statuses, causes, evidenceKinds, reservedIds, idPattern, fail, hash, json, inside, object, nonempty, timestampPattern, now, randomId, assertClosed, safeIdentifier, validTimestamp, assertTimestamp, canonical, canonicalHash, canonicalRecord, sameRecord, safePath, directory, readJSON, syncDirectory, writeNew, removeOwnedFileIfPresent, removeRegularIfPresent, atomicReplace, acquireLock, withRunLock } from '../core/common.mjs';
import { evidenceFile } from '../core/records.mjs';
export const escape = (value: unknown): string => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\*_{}\[\]()#+.!|~-]/g, '\\$&').split(String.fromCharCode(96)).join('\\' + String.fromCharCode(96)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0')).replace(/\r?\n/g, '  \n');
export function markdown(report: Report): string {
  let output = '# Local evidence report\n\n' + escape(report.project) + '\n\n' + report.caveat + '\n\n';
  if (report.execution && report.executionSummary) {
    const s = report.executionSummary, e = report.execution;
    output += '## 并发与执行记录\n\n用户并发上限：' + s.configuredMaxParallelCases + '；初始上限：' + e.configuration.initialMaxParallelCases + '；配置来源：' + e.configuration.kind + '。\n\n已知宿主可用容量：' + (s.knownAvailableWorkers ?? '未知') + '；依据：' + escape(e.capacityReason || '宿主未明确提供；本工具不主动探测。') + '\n\n当前占用：' + s.activeReservations + '；名额峰值：' + s.peakReservations + '；已入账执行区间的报告峰值：' + (s.reportedExecutionPeak ?? '未知') + '。名额不等于实测重叠；区间由 worker 提供，引用证据文件，不认证其真实性。\n\n等待收敛：' + s.draining + '；未完成分派：' + escape(s.unfinishedAssignmentIds.join(', ') || '(none)') + '；待导入：' + escape(s.pendingImportIds.join(', ') || '(none)') + '；缺少逐目标评估的用例：' + escape(s.unassessedCaseIds.join(', ') || '(none)') + '\n\n';
    for (const a of e.assignments) output += '- ' + escape(a.caseId) + ' / ' + escape(a.id) + '：' + a.state + '；worker ' + escape(a.workerId ?? '未绑定') + '；model ' + escape(a.model ?? '未记录') + ' / ' + escape(a.reasoning ?? '未记录') + '；默认 Space ' + (a.defaultSpaceId ?? '未知') + '；实际偏差／恢复：' + escape(a.spaceHistory.filter(s => s.kind !== 'default').map(s => s.kind + ':' + (s.spaceId ?? '未知') + ' ' + s.reason).join('; ') || '(none recorded)') + '\n';
    output += '\n'; for (const event of e.events.filter(event => event.kind.startsWith('note:'))) output += '- ' + escape(event.kind) + '：' + escape(event.reason) + (event.assignmentId ? ' / ' + escape(event.assignmentId) : '') + '\n'; output += '\n';
  }
  if (report.evidenceCoverage) output += 'Screenshot evidence: ' + report.evidenceCoverage.registeredScreenshots + ' registered; distinct retained contents: ' + report.evidenceCoverage.distinctRetainedContents + '.\n\nFinal records without screenshot evidence: ' + (report.evidenceCoverage.finalCasesWithoutScreenshots.join(', ') || '(none)') + '. Key UI conclusions require real screenshots; missing evidence needs AI review, not an automatic product failure.\n\n';
  if (report.context) {
    output += '## 事后整理与本次复核（未重新执行）\n\n' + escape(report.context.summary) + '\n\n';
    output += report.context.limitations.map(text => '- ' + escape(text)).join('\n') + '\n\n';
    output += 'Supplemental cases: ' + (report.context.supplementalCaseIds.map(escape).join(', ') || '(none)') + '\n\n';
    output += report.context.sources.map(source => '- Source: ' + escape(source.label) + '; file: ' + escape(source.file) + '; SHA-256: ' + source.sha256).join('\n') + '\n\n';
  }
  if (report.schemaVersion === 3 || report.schemaVersion === 4) {
    output += 'Run revision: ' + report.revision + '; evidence revision: ' + report.evidenceRevision + '\n\n';
    output += 'Evidence entries with matching SHA-256 at check: ' + report.evidenceIntegrity.hashVerifiedItems + '\n\n';
    output += 'Progress: ' + report.progress.completed.count + ' completed; ' + report.progress.uncompleted.count + ' uncompleted; ' + report.progress.pendingClarification.count + ' pending clarification; ' + report.progress.attemptedCases.totalAttempts + ' historical attempts.\n\n';
  }
  output += 'Cases with no recorded attempt: ' + report.hasUnexecutedCases + '\n\n';
  output += 'Recorded explicit outcomes (operator supplied): ' + report.recordedExplicitOutcomes.pass + ' pass, ' + report.recordedExplicitOutcomes.fail + ' fail.\n\n';
  output += report.cases.map(c => {
    const attempts = c.attempts ?? [], evidenceIds = c.evidenceIds ?? [];
    const review = report.context?.reviews.find(item => item.caseId === c.id);
    return '## ' + escape(c.id) + ': ' + escape(c.title) + '\n\n' +
      (review ? 'Current retrospective review: ' + review.status + '; ' + escape(review.rationale) + '\n\n' : '') +
      'Basis: ' + c.basis.kind + (c.basis.kind === 'explicit' ? '' : ' (NOT confirmed acceptance)') + '\n\n' +
      'Source: ' + escape(c.basis.source) + '\n\nRequirement: ' + escape(c.basis.text) + '\n\n' +
      'Expected: ' + escape(c.expected) + '\n\n' +
      'Baseline clarification questions: ' + ((c.clarificationQuestions ?? []).map(escape).join('; ') || '(none supplied)') + '\n\n' +
      'Critical conditions: ' + escape(c.criticalConditions.join('; ') || '(none supplied)') + '\n\n' +
      'Required path: ' + escape(c.requiredPath ?? '(none supplied)') + '\n\n' +
      'Step order: ' + c.stepOrder + ' (' + (c.stepOrder === 'strict' ? 'preserve the business-step sequence' : 'UI route/order may adapt only within intent and preconditions; do not skip steps') + ')\n\n' +
      (report.context ? 'Source planned steps (retrospective assembly, not proof of a pre-execution freeze):\n\n' : 'Planned steps (frozen baseline, not execution proof):\n\n') +
      c.steps.map((step, index) => (index + 1) + '. ' + escape(step.id) + ': ' + escape(step.action) + '\n   Expected checkpoint: ' + (Object.hasOwn(step, 'expected') ? escape(step.expected) : '(not specified; no checkpoint verdict)') + '\n').join('') +
      (report.schemaVersion === 4 ? '逐目标评估：\n\n' + caseGoals(report, c).map(goal => '- ' + escape(goal.target) + ' / ' + ({ verified: '已验证', violation: '发现违反', inconclusive: '无法判断', not_tested: '未测试' }[goal.status]) + '：' + escape(goal.text) + '\n  观察：' + escape(goal.observed || '(none)') + '\n  依据：' + escape(goal.rationale) + '\n  证据：' + escape(goal.evidenceIds.join(', ') || '(none)') + '\n').join('') + '\n' : '') +
      'Recorded status: ' + c.status + '\n\nObserved: ' + escape(c.observed) + '\n\nRationale: ' + escape(c.rationale) + '\n\n' +
      'Remaining questions: ' + ((c.remainingQuestions ?? []).map(escape).join('; ') || '(none supplied)') + '\n\n' +
      'Cause: ' + (c.cause ?? 'unknown') + '\n\n' +
      'Evidence IDs: ' + (evidenceIds.map(escape).join(', ') || '(none)') + '\n\n' +
      'Recorded attempts: ' + attempts.length + '\n\n' +
      attempts.map((a, i) => 'Attempt ' + (i + 1) + (a.attemptId ? ' (' + escape(a.attemptId) + '; ' + escape(a.kind) + ')' : '') + ': ' + a.status + '; cause: ' + (a.cause ?? 'unknown') + '\n\nObserved: ' + escape(a.observed) + '\n\nRationale: ' + escape(a.rationale) + '\n\nRemaining questions: ' + ((a.remainingQuestions ?? []).map(escape).join('; ') || '(none supplied)') + '\n\nEvidence IDs: ' + (a.evidenceIds.map(escape).join(', ') || '(none)') + '\n\n').join('');
  }).join('');
  output += '## Evidence catalog\n\n' + report.evidenceCatalog.items.map(item => {
    const hasHash = typeof item.sha256 === 'string';
    return '- ' + escape(item.id) + ': ' + escape(item.path) + '\n' +
      '  Case: ' + escape(item.caseId) + '\n' +
      '  Kind: ' + item.kind + '; bytes: ' + item.bytes + '; SHA-256: ' + item.sha256 + '\n' +
      '  Collected at: ' + escape(item.collectedAt) + '; source captured at: ' + escape(item.capturedAt ?? '(not supplied)') + '\n' +
      '  Source: ' + escape(item.source) + '\n  Description: ' + escape(item.description) + '\n\n';
  }).join('');
  return output;
}

export function rasterMime(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
export function safeJsonForHtml(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => ({ '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029' } as Record<string, string>)[character] ?? character);
}
export async function htmlReportPayload(root: string, reportData: Report): Promise<HtmlPayload> {
  const previews: Record<string, Preview> = {};
  for (const item of reportData.evidenceCatalog.items) {
    let preview: string | null = null, previewNote = '';
    if (item.kind === 'screenshot') {
      const filename = await evidenceFile(root, item.path);
      const bytes = await fs.readFile(filename);
      const sha256 = hash(bytes), mime = rasterMime(bytes);
      if (sha256 !== item.sha256 || bytes.length !== item.bytes) fail('Evidence content hash or byte count mismatch while building HTML: ' + item.id);
      if (mime) preview = 'data:' + mime + ';base64,' + bytes.toString('base64');
      else previewNote = '截图已登记且哈希匹配，但不是支持预览的 PNG、JPEG 或 WebP；未在 HTML 中作为图片打开。';
    }
    previews[item.id] = { preview, previewNote };
  }
  return { htmlPayloadVersion: 1, report: reportData, previews, ...(reportData.schemaVersion === 4 ? { goalViews: goalViews(reportData) } : {}) };
}
export function htmlReport(reportData: HtmlPayload): string {
  const embedded = safeJsonForHtml(reportData);
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>本地测试报告</title>
<style>
:root{color-scheme:light;--navy:#12314c;--cyan:#087e91;--ink:#243747;--muted:#5f7180;--line:#dbe4e9;--paper:#f2f6f8;--white:#fff;--shadow:0 8px 24px #12314c0d}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}header{background:linear-gradient(120deg,#12314c,#087e91);color:white;padding:30px max(20px,calc((100% - 1180px)/2)) 26px}header h1{margin:0 0 6px;font-size:clamp(24px,4vw,34px)}header p{margin:0;color:#e1f2f4}.wrap{max-width:1180px;margin:auto;padding:22px 20px 56px}.notice{padding:12px 16px;background:#e6f4f5;border-left:4px solid var(--cyan);border-radius:8px;margin-bottom:18px}.summary{display:grid;grid-template-columns:repeat(9,minmax(90px,1fr));gap:12px;margin:18px 0}.metric,.panel,.case-card{background:var(--white);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow)}.metric{padding:14px}.metric b{display:block;font-size:24px;color:var(--navy)}.metric span{color:var(--muted);font-size:13px}.toolbar{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.toolbar input,.toolbar select{font:inherit;border:1px solid #bccbd3;background:#fff;border-radius:8px;padding:10px 12px;color:var(--ink)}.toolbar input{flex:1;min-width:210px}.case-list{display:grid;gap:13px}.case-card{overflow:hidden}.case-card[hidden]{display:none}.case-card summary{cursor:pointer;list-style:none;padding:17px 18px;display:flex;align-items:center;gap:12px}.case-card summary::-webkit-details-marker{display:none}.case-card summary:after{content:"展开 +";margin-left:auto;color:var(--cyan);font-weight:650}.case-card[open] summary:after{content:"收起 −"}.case-title{font-weight:700;color:var(--navy);min-width:0;overflow-wrap:anywhere}.case-id{font:12px ui-monospace,monospace;color:var(--muted)}.badge{border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700;white-space:nowrap;background:#edf1f4;color:#485763}.status-pass{background:#e1f4e9;color:#17633b}.status-fail{background:#fde8e7;color:#9b2721}.status-blocked{background:#fff1d7;color:#815609}.status-inconclusive{background:#e8eaff;color:#424d9a}.status-not_run{background:#edf1f4;color:#485763}.case-body{padding:0 18px 20px}.facts{display:grid;grid-template-columns:1fr 1fr;gap:12px}.panel{padding:14px 16px;box-shadow:none}.panel h3{font-size:14px;text-transform:none;color:var(--cyan);margin:0 0 8px}.panel p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.meta{color:var(--muted);font-size:13px}.section{margin-top:16px}.section h3{margin:0 0 8px;color:var(--navy);font-size:16px}.steps{margin:0;padding-left:22px}.steps li{padding:4px 0}.checkpoint{display:block;color:#6b4e12;font-size:13px}.list{margin:0;padding-left:21px}.history{display:grid;gap:10px}.history-item{border-left:3px solid #8ebac0;padding:3px 0 3px 12px}.history-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:7px}.evidence-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.evidence{border:1px solid var(--line);border-radius:9px;padding:8px;min-width:0}.thumb{width:100%;height:118px;object-fit:contain;background:#f2f5f7;border-radius:6px;cursor:zoom-in}.thumb:focus-visible,button:focus-visible,summary:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #24a4b5;outline-offset:2px}.image-error{display:block;padding:14px;background:#fff0ed;border:1px solid #c94735;border-radius:8px;color:#8e2019;font-weight:700;overflow-wrap:anywhere}.evidence-meta{margin-top:8px;border-top:1px solid var(--line);padding-top:6px}.evidence-meta summary{cursor:pointer;color:var(--cyan);font-size:12px;font-weight:700}.evidence-meta p{overflow-wrap:anywhere;word-break:break-word}.evidence p{font-size:12px;margin:6px 0 0;overflow-wrap:anywhere}.compare{display:grid;grid-template-columns:1fr 1fr;gap:12px}.compare figure{margin:0}.compare img{width:100%;max-height:310px;object-fit:contain;background:#f2f5f7;border:1px solid var(--line);border-radius:8px;cursor:zoom-in}.compare figcaption{font-size:12px;color:var(--muted);margin-top:4px}.empty{padding:12px;background:#f4f6f7;border-radius:8px;color:var(--muted)}.integrity{font-size:13px;color:#426173}.muted{color:var(--muted)}dialog{width:min(96vw,1200px);max-width:none;max-height:94vh;padding:12px;border:0;border-radius:12px;background:#102536;color:white;box-shadow:0 20px 80px #0008}dialog::backdrop{background:#081522d9}.dialog-top{display:flex;justify-content:space-between;align-items:center;padding:2px 4px 10px}dialog button{border:1px solid #b9d1dc;border-radius:7px;background:#fff;color:#18364d;padding:7px 12px;font:inherit;cursor:pointer}dialog img{display:block;max-width:100%;max-height:80vh;margin:auto;object-fit:contain}@media(max-width:850px){.summary{grid-template-columns:repeat(4,1fr)}}@media(max-width:560px){header{padding:22px 18px}.wrap{padding:15px 12px 40px}.summary{grid-template-columns:repeat(2,1fr);gap:8px}.metric{padding:11px}.facts,.compare{grid-template-columns:1fr}.case-card summary{padding:14px 12px;gap:8px;flex-wrap:wrap}.case-body{padding:0 12px 15px}.toolbar>*{width:100%}.toolbar input{min-width:0}}
</style></head><body>
<header><h1>测试结果与证据</h1><p id="project-line"></p></header><main class="wrap">
<div class="notice"><strong>解读：</strong>状态是记录的业务判断；下方文件完整性只表示报告生成时证据字节与 catalog 中的 SHA-256 / 大小匹配。匹配不证明来源真实或业务结论正确。此文件可离线打开，截图以安全识别的 PNG/JPEG/WebP 数据内嵌。</div>
<div class="summary" id="summary" aria-label="结果概览"></div>
<section id="execution-summary" class="notice" hidden aria-label="并发与执行记录"></section>
<section id="report-context" class="notice" hidden aria-label="事后整理与复核"></section>
<p id="evidence-coverage" class="notice" role="status"></p>
<p class="integrity" id="integrity"></p>
<div class="toolbar"><input id="search" type="search" placeholder="搜索用例、预期、观察或证据说明" aria-label="搜索报告"><select id="status-filter" aria-label="按状态筛选"><option value="all">所有状态</option><option value="pass">通过</option><option value="fail">失败</option><option value="inconclusive">待判断</option><option value="blocked">受阻</option><option value="not_run">未记录最终结论</option></select><span id="shown" class="meta" aria-live="polite"></span></div>
<div class="case-list" id="case-list"></div><p id="empty-results" class="empty" hidden>没有符合筛选条件的用例。</p></main>
<dialog id="lightbox" aria-label="截图预览"><div class="dialog-top"><span id="lightbox-caption"></span><button id="lightbox-close" type="button">关闭</button></div><p id="lightbox-error" class="image-error" hidden></p><img id="lightbox-image" alt="证据截图放大预览"></dialog>
<script type="application/json" id="report-data">${embedded}</script>
<script>${readFileSync(path.join(TOOL_ROOT, 'report-ui/main.js'), 'utf8')}</script></body></html>`;
}
