import type { RegressionBinding } from '../regression/binding.mjs';
import type { Report, HtmlPayload, Preview } from '../contracts/model.mjs';
import { caseGoals, goalDistribution, labels } from './execution-view.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { TOOL_ROOT } from '../scripts/toolchain.mjs';
import { fail, hash } from '../core/common.mjs';
import { evidenceFile } from '../core/file-integrity.mjs';
export const escape = (value: unknown): string => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\*_{}\[\]()#+.!|~-]/g, '\\$&').split(String.fromCharCode(96)).join('\\' + String.fromCharCode(96)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0')).replace(/\r?\n/g, '  \n');
export function markdown(report: Report): string {
  if (report.schemaVersion !== 7) fail('Unsupported report format; v7 is required.');
  const lines: string[] = ['# 本地测试报告', '', escape(report.project), '', escape(report.caveat), '',
    '业务目标总数：' + report.goalCount + '；用例／场景数：' + report.caseCount + '。', '',
    Object.entries(report.counts).map(([state, count]) => labels[state as keyof typeof labels] + '：' + count).join('；') + '。', '',
    '记录完整：' + report.assessmentComplete + '。未登记评估表示记录缺口，不是业务四态；记录完整不等于已完成验收。', '',
    '结果版本：' + report.revision + '；证据版本：' + report.evidenceRevision + '；校验匹配证据：' + report.evidenceIntegrity.hashVerifiedItems + '。', '',
    '截图证据：已登记 ' + report.evidenceCoverage.registeredScreenshots + '；全部证据去重后内容 ' + report.evidenceCoverage.distinctRetainedContents + '。', '',
    '评估未关联截图的目标：' + (report.evidenceCoverage.goalsWithoutScreenshots.map(item => escape(item.caseId + '/' + item.goalId)).join(', ') || '(none)') + '。关键 UI 结论需要真实页面截图，文件哈希不证明业务结论。', ''];
  if (report.regressionBinding) {
    const b = report.regressionBinding as RegressionBinding, c = b.coverage;
    lines.push('## 回归范围与任务版本', '', '模式：' + (b.selection.request.mode === 'full' ? '全量回归' : '按历史目标状态选择，整条场景重跑'), '',
      '原范围 ' + c.requestedCases + ' 场景 / ' + c.requestedGoals + ' 目标；选中 ' + c.selectedCases + ' 场景 / ' + c.selectedGoals + ' 目标；本次冻结 ' + c.compiledCases + ' 场景 / ' + c.compiledGoals + ' 目标；未选中 ' + c.notSelectedCases + ' 场景。', '',
      '本报告四态仅对应本次冻结范围；未选中不是未测试，不继承历史通过。全量选择不等于全量执行完成。', '',
      '选择依据：' + escape(b.selection.request.scope.scopeId + ' @ ' + b.selection.request.scope.version) + '；固定筛选状态：' + escape(b.selection.request.statuses.join(', ') || '(全量不按状态筛选)'), '',
      '来源运行：' + escape(b.selection.request.source?.runId ?? '(未指定历史状态基准)') + '；源结果版本：' + (b.selection.request.source?.resultsRevision ?? '无') + '。', '');
    for (const t of b.tasks) lines.push('- 任务 ' + escape(t.taskId) + ' @ ' + t.revision + '：' + escape(t.title) + '；定义 ' + t.maturity + '；适用性 ' + t.applicability.state);
    for (const r of b.rules) lines.push('- 规则 ' + escape(r.ruleId) + ' @ ' + r.revision + '：' + escape(r.statement) + '；依据确认 ' + r.confirmation.state);
    for (const g of c.gaps) lines.push('- 范围/资产缺口 ' + escape(g.caseId + (g.goalId ? '/' + g.goalId : '') + '：' + g.reason));
    for (const n of b.selection.notSelected) lines.push('- 本轮未选中 ' + escape(n.caseId) + '；无本次结果，历史仅供参考。');
    lines.push('', '当次条件是有来源的 AI 核验说明，工具不认证真实就绪或授权；待核验项仍需处理。', '');
    for (const i of b.conditions.items) lines.push('- ' + escape(i.caseIds.join(', ') + ' / ' + i.aspect + ' / ' + i.state + '：' + i.statement) + '；来源 ' + escape(i.source.locator));
    lines.push('');
  }
  const unresolved = (report.actionAttempts ?? []).filter(a => a.unresolved);
  if (unresolved.length) lines.push('## 尚待核对的动作', '', ...unresolved.map(a => '- ' + escape(a.caseId + '/' + a.actionId + '：' + a.reasons.join('；'))), '', '不自动重放业务动作；是否重试由 AI 结合事实、幂等依据和授权决定。', '');
  if (report.context) {
    lines.push('## 事后整理来源（未重新执行）', '', escape(report.context.summary), '', ...report.context.limitations.map(item => '- ' + escape(item)), '',
      '补充范围用例：' + (report.context.supplementalCaseIds.map(escape).join(', ') || '(none)'), '',
      ...report.context.sources.map(item => '- ' + escape(item.label) + '；' + escape(item.file) + '；SHA-256 ' + item.sha256), '',
      '整理说明不另行提供业务结论，也不改变冻结基线或已有评估的来源。', '');
  }
  for (const c of report.cases) {
    lines.push('## ' + escape(c.id) + '：' + escape(c.title), '', '子目标分布：' + goalDistribution(report, c), '');
    for (const item of caseGoals(report, c)) {
      const g = item.goal, a = item.assessment;
      lines.push('### ' + escape(g.id) + '：' + labels[item.status], '', '预期：' + escape(g.expected), '',
        '需求依据：' + g.basis.kind + '；' + escape(g.basis.source) + '；' + escape(g.basis.text), '',
        '必要语义引用：' + escape(g.requiredRefs.join(', ') || '(none)'), '');
      if (g.followUpOf) lines.push('本目标复核的来源：' + escape(g.followUpOf.runId + '/' + g.followUpOf.caseId + '/' + g.followUpOf.goalId + '：' + g.followUpOf.reason), '');
      for (const laterCase of report.cases) for (const later of laterCase.goals) {
        const f = later.followUpOf;
        if (f?.runId === report.runId && f.caseId === c.id && f.goalId === g.id) lines.push('后续复核：' + escape(laterCase.id + '/' + later.id) + '；' + labels[laterCase.assessments.find(a => a.goalId === later.id)?.status ?? 'unassessed'] + '；' + escape(f.reason) + '。原评估保留，不自动替换。', '');
      }
      if (g.clarificationQuestions?.length) lines.push('冻结待澄清：' + g.clarificationQuestions.map(escape).join('；'), '');
      if (!a) { lines.push('完整性缺口：未登记目标评估，不能据此推断未测试、无法判断或其他业务结论。', ''); continue; }
      lines.push('判断理由：' + escape(a.rationale), '', '剩余缺口：' + (a.gaps.map(escape).join('；') || '(none recorded)'), '',
        '评估来源：' + escape(a.operationId) + '；revision ' + a.revision + '；' + escape(a.recordedAt), '');
      if (a.diagnosis) lines.push('归因：' + a.diagnosis.state + ' / ' + a.diagnosis.category + '；' + escape(a.diagnosis.summary) + '。根因状态与业务四态独立。', '');
      for (const o of item.observations) lines.push('- 观察 ' + escape(o.id) + '：' + escape(o.summary), '  必要语义覆盖：' + escape(o.coveredRefs.join(', ') || '(none)'), '  证据：' + escape(o.evidenceIds.join(', ') || '(none)'), '');
      lines.push('关联证据：' + escape(item.evidenceIds.join(', ') || '(none)'), '');
    }
    lines.push('### 冻结前提与必要业务步骤', '', '关键前提：' + escape(c.criticalConditions.join('；') || '(none supplied)'), '',
      '必经路径：' + escape(c.requiredPath ?? '(none supplied)'), '', '步骤顺序：' + c.stepOrder, '',
      '计划不是执行证明；添加事后整理说明不会改变该计划的来源。', '');
    for (const [i, step] of c.steps.entries()) lines.push((i + 1) + '. ' + escape(step.id) + '：' + escape(step.action));
    if (c.contexts.length || c.actionEvents.length) lines.push('', '### 当次上下文与动作事实', '');
    for (const ctx of c.contexts) {
      lines.push('#### 上下文 ' + escape(ctx.id), '');
      for (const key of ['environment', 'identity', 'objects', 'initialState', 'authorization'] as const) lines.push('- ' + key + ' / ' + ctx[key].state + '：' + escape(ctx[key].summary) + '；来源 ' + escape(ctx[key].sources.map(s => s.reference).join('；')));
    }
    for (const e of c.actionEvents) lines.push('- 动作 ' + escape(e.actionId) + ' / 事件 ' + escape(e.id) + ' / ' + e.purpose + ' / ' + e.kind + '：' + escape(e.summary), '  发出：' + (e.dispatchState ?? '未声明') + '；业务结果知识：' + (e.resultState ?? '未声明') + '；处置：' + (e.disposition?.state ?? '未声明') + '；证据 ' + escape(e.evidenceIds.join(', ') || '(none)'), ...(e.inputs?.length ? ['  关键输入：' + escape(e.inputs.join('；'))] : []), ...(e.disposition ? ['  处置依据：' + escape(e.disposition.rationale + '；范围 ' + e.disposition.scope + '；限制 ' + e.disposition.limitations.join('；'))] : []));
    lines.push('', '### 原始观察与评估历史', '', 'attempt 仅是历史，不自动替换当前评估；final 只更新本次明确提及的目标。', '');
    for (const entry of c.entries) {
      lines.push('#### ' + entry.mode + ' / ' + escape(entry.operationId) + ' / revision ' + entry.revision, '', escape(entry.recordedAt), '');
      for (const o of entry.record.observations) lines.push('- 观察 ' + escape(o.id) + '：' + escape(o.summary) + '；覆盖 ' + escape(o.coveredRefs.join(', ') || '(none)') + '；证据 ' + escape(o.evidenceIds.join(', ') || '(none)'));
      for (const a of entry.record.assessments) lines.push('- 评估 ' + escape(a.goalId) + '：' + labels[a.status] + '；' + escape(a.rationale) + '；观察 ' + escape(a.observationIds.join(', ') || '(none)') + '；缺口 ' + escape(a.gaps.join('；') || '(none)') + (a.diagnosis ? '；归因 ' + a.diagnosis.state + '/' + a.diagnosis.category + '：' + escape(a.diagnosis.summary) : ''));
      lines.push('');
    }
  }
  if (report.execution && report.executionSummary) {
    const e = report.execution, s = report.executionSummary;
    lines.push('## 并发与交付记录', '', '并发上限：' + s.configuredMaxParallelCases + '；名额峰值：' + s.peakReservations + '；报告执行峰值：' + (s.reportedExecutionPeak ?? '未知') + '。名额不等于浏览器实测重叠。', '',
      '未完成分派：' + escape(s.unfinishedAssignmentIds.join(', ') || '(none)') + '；待导入：' + escape(s.pendingImportIds.join(', ') || '(none)'), '',
      '该台账不作为另一条业务结果来源。', '');
    for (const a of e.assignments) lines.push('- ' + escape(a.caseId) + ' / ' + escape(a.id) + '：' + a.state + '；worker ' + escape(a.workerId ?? '未绑定') + '；默认 Space ' + (a.defaultSpaceId ?? '未知'));
    for (const event of e.events.filter(item => item.kind.startsWith('note:'))) lines.push('- ' + escape(event.kind) + '：' + escape(event.reason));
    lines.push('');
  }
  lines.push('## 证据目录', '');
  for (const item of report.evidenceCatalog.items) lines.push('- ' + escape(item.id) + '：' + escape(item.path),
    '  Case ' + escape(item.caseId) + '；' + item.kind + '；bytes ' + item.bytes + '；SHA-256 ' + item.sha256,
    '  登记时间 ' + escape(item.collectedAt) + '；来源采集时间 ' + escape(item.capturedAt ?? '(not supplied)'),
    '  来源 ' + escape(item.source) + '；说明 ' + escape(item.description), '');
  return lines.join('\n') + '\n';
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
  if (reportData.schemaVersion !== 7) fail('Unsupported report format; v7 is required. Historical files remain unchanged.');
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
  return { htmlPayloadVersion: 7, report: reportData, previews };
}
export function htmlReport(reportData: HtmlPayload): string {
  const embedded = safeJsonForHtml(reportData);
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>本地测试报告</title>
<style>
:root{color-scheme:light;--navy:#12314c;--cyan:#087e91;--ink:#243747;--muted:#5f7180;--line:#dbe4e9;--paper:#f2f6f8;--white:#fff;--shadow:0 8px 24px #12314c0d}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}header{background:linear-gradient(120deg,#12314c,#087e91);color:white;padding:30px max(20px,calc((100% - 1180px)/2)) 26px}header h1{margin:0 0 6px;font-size:clamp(24px,4vw,34px)}header p{margin:0;color:#e1f2f4}.wrap{max-width:1180px;margin:auto;padding:22px 20px 56px}.notice{padding:12px 16px;background:#e6f4f5;border-left:4px solid var(--cyan);border-radius:8px;margin-bottom:18px}.summary{display:grid;grid-template-columns:repeat(9,minmax(90px,1fr));gap:12px;margin:18px 0}.metric,.panel,.case-card{background:var(--white);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow)}.metric{padding:14px}.metric b{display:block;font-size:24px;color:var(--navy)}.metric span{color:var(--muted);font-size:13px}.toolbar{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.toolbar input,.toolbar select{font:inherit;border:1px solid #bccbd3;background:#fff;border-radius:8px;padding:10px 12px;color:var(--ink)}.toolbar input{flex:1;min-width:210px}.case-list{display:grid;gap:13px}.case-card{overflow:hidden}.case-card[hidden]{display:none}.case-card>summary{cursor:pointer;list-style:none;padding:17px 18px;display:flex;align-items:center;gap:12px}.case-card>summary::-webkit-details-marker{display:none}.case-card>summary:after{content:"展开 +";margin-left:auto;color:var(--cyan);font-weight:650}.case-card[open]>summary:after{content:"收起 −"}.case-title{font-weight:700;color:var(--navy);min-width:0;overflow-wrap:anywhere}.case-id{font:12px ui-monospace,monospace;color:var(--muted)}.badge{border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700;white-space:nowrap;background:#edf1f4;color:#485763}.status-verified{background:#e1f4e9;color:#17633b}.status-violation{background:#fde8e7;color:#9b2721}.status-not_tested{background:#fff1d7;color:#815609}.status-inconclusive{background:#e8eaff;color:#424d9a}.status-unassessed{background:#edf1f4;color:#485763}.case-body{padding:0 18px 20px}.facts{display:grid;grid-template-columns:1fr 1fr;gap:12px}.panel{padding:14px 16px;box-shadow:none}.panel h3{font-size:14px;text-transform:none;color:var(--cyan);margin:0 0 8px}.panel p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.meta{color:var(--muted);font-size:13px}.section{margin-top:16px}.section h3{margin:0 0 8px;color:var(--navy);font-size:16px}.steps{margin:0;padding-left:22px}.steps li{padding:4px 0}.checkpoint{display:block;color:#6b4e12;font-size:13px}.list{margin:0;padding-left:21px}.history{display:grid;gap:10px}.history-item{border-left:3px solid #8ebac0;padding:3px 0 3px 12px}.history-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:7px}.evidence-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.evidence{border:1px solid var(--line);border-radius:9px;padding:8px;min-width:0}.thumb{width:100%;height:118px;object-fit:contain;background:#f2f5f7;border-radius:6px;cursor:zoom-in}.thumb:focus-visible,button:focus-visible,summary:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #24a4b5;outline-offset:2px}.image-error{display:block;padding:14px;background:#fff0ed;border:1px solid #c94735;border-radius:8px;color:#8e2019;font-weight:700;overflow-wrap:anywhere}.evidence-meta{margin-top:8px;border-top:1px solid var(--line);padding-top:6px}.evidence-meta summary{cursor:pointer;color:var(--cyan);font-size:12px;font-weight:700}.evidence-meta p{overflow-wrap:anywhere;word-break:break-word}.evidence p{font-size:12px;margin:6px 0 0;overflow-wrap:anywhere}.compare{display:grid;grid-template-columns:1fr 1fr;gap:12px}.compare figure{margin:0}.compare img{width:100%;max-height:310px;object-fit:contain;background:#f2f5f7;border:1px solid var(--line);border-radius:8px;cursor:zoom-in}.compare figcaption{font-size:12px;color:var(--muted);margin-top:4px}.empty{padding:12px;background:#f4f6f7;border-radius:8px;color:var(--muted)}.integrity{font-size:13px;color:#426173}.muted{color:var(--muted)}dialog{width:min(96vw,1200px);max-width:none;max-height:94vh;padding:12px;border:0;border-radius:12px;background:#102536;color:white;box-shadow:0 20px 80px #0008}dialog::backdrop{background:#081522d9}.dialog-top{display:flex;justify-content:space-between;align-items:center;padding:2px 4px 10px}dialog button{border:1px solid #b9d1dc;border-radius:7px;background:#fff;color:#18364d;padding:7px 12px;font:inherit;cursor:pointer}dialog img{display:block;max-width:100%;max-height:80vh;margin:auto;object-fit:contain}@media(max-width:850px){.summary{grid-template-columns:repeat(4,1fr)}}@media(max-width:560px){header{padding:22px 18px}.wrap{padding:15px 12px 40px}.summary{grid-template-columns:repeat(2,1fr);gap:8px}.metric{padding:11px}.facts,.compare{grid-template-columns:1fr}.case-card>summary{padding:14px 12px;gap:8px;flex-wrap:wrap}.case-body{padding:0 12px 15px}.toolbar>*{width:100%}.toolbar input{min-width:0}}
</style></head><body>
<header><h1>测试结果与证据</h1><p id="project-line"></p></header><main class="wrap">
<div class="notice"><strong>解读：</strong>状态是记录的业务判断；未登记评估是记录完整性缺口，不属于业务四态。用例汇总子目标分布，不另作整体业务判断。下方文件完整性只表示报告生成时证据字节与 catalog 中的 SHA-256 / 大小匹配。匹配不证明来源真实或业务结论正确。此文件可离线打开，截图以安全识别的 PNG/JPEG/WebP 数据内嵌。</div>
<div class="summary" id="summary" aria-label="结果概览"></div>
<section id="regression-summary" class="notice" hidden aria-label="回归范围与任务版本"></section>
<section id="action-summary" class="notice" hidden aria-label="尚待核对的动作"></section>
<section id="execution-summary" class="notice" hidden aria-label="并发与执行记录"></section>
<section id="report-context" class="notice" hidden aria-label="事后整理与复核"></section>
<p id="evidence-coverage" class="notice" role="status"></p>
<p class="integrity" id="integrity"></p>
<div class="toolbar"><input id="search" type="search" placeholder="搜索用例、预期、观察或证据说明" aria-label="搜索报告"><select id="status-filter" aria-label="按状态筛选"><option value="all">所有状态</option><option value="verified">已验证</option><option value="violation">发现违反</option><option value="inconclusive">无法判断</option><option value="not_tested">未测试</option><option value="unassessed">未登记目标评估</option></select><span id="shown" class="meta" aria-live="polite"></span></div>
<div class="case-list" id="case-list"></div><p id="empty-results" class="empty" hidden>没有符合筛选条件的用例。</p></main>
<dialog id="lightbox" aria-label="截图预览"><div class="dialog-top"><span id="lightbox-caption"></span><button id="lightbox-close" type="button">关闭</button></div><p id="lightbox-error" class="image-error" hidden></p><img id="lightbox-image" alt="证据截图放大预览"></dialog>
<script type="application/json" id="report-data">${embedded}</script>
<script>${readFileSync(path.join(TOOL_ROOT, 'report-ui/main.js'), 'utf8')}</script></body></html>`;
}
