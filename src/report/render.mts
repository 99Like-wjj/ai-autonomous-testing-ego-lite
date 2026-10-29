import type { RegressionBinding } from '../regression/binding.mjs';
import type { Report, HtmlPayload } from '../contracts/model.mjs';
import { caseGoals, goalDistribution, labels } from './execution-view.mjs';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { TOOL_ROOT } from '../scripts/toolchain.mjs';
import { fail } from '../core/common.mjs';
import { reportShell } from './shell.mjs';
export const escape = (value: unknown): string => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\*_{}\[\]()#+.!|~-]/g, '\\$&').split(String.fromCharCode(96)).join('\\' + String.fromCharCode(96)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0')).replace(/\r?\n/g, '  \n');
export function markdown(report: Report, payload?: HtmlPayload): string {
  if (report.schemaVersion !== 8) fail('Unsupported report format; v8 is required.');
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
      lines.push('### ' + escape(g.title) + '（' + escape(g.id) + '）：' + labels[item.status], '', '预期：' + escape(g.expected), '',
        '需求依据：' + g.basis.kind + '；' + escape(g.basis.source) + '；' + escape(g.basis.text), '',
        '必要语义引用：' + escape(g.requiredRefs.join(', ') || '(none)'), '');
      if (g.followUpOf) lines.push('本目标复核的来源：' + escape(g.followUpOf.runId + '/' + g.followUpOf.caseId + '/' + g.followUpOf.goalId + '：' + g.followUpOf.reason), '');
      for (const laterCase of report.cases) for (const later of laterCase.goals) {
        const f = later.followUpOf;
        if ((f?.runId === report.runId || f?.runId === 'self') && f.caseId === c.id && f.goalId === g.id) lines.push('后续复核：' + escape(laterCase.id + '/' + later.id) + '；' + labels[laterCase.assessments.find(a => a.goalId === later.id)?.status ?? 'unassessed'] + '；' + escape(f.reason) + '。原评估保留，不自动替换。', '');
      }
      if (g.clarificationQuestions?.length) lines.push('冻结待澄清：' + g.clarificationQuestions.map(escape).join('；'), '');
      if (!a) { lines.push('完整性缺口：未登记目标评估，不能据此推断未测试、无法判断或其他业务结论。', ''); continue; }
      lines.push('判断理由：' + escape(a.rationale), '', '剩余缺口：' + (a.gaps.map(escape).join('；') || '(none recorded)'), '',
        '评估来源：' + escape(a.operationId) + '；revision ' + a.revision + '；' + escape(a.recordedAt), '');
      if (a.diagnosis) lines.push('归因：' + a.diagnosis.state + ' / ' + a.diagnosis.category + '；' + escape(a.diagnosis.summary) + '。根因状态与业务四态独立。', '');
      if (a.summary) lines.push('阅读摘要：' + escape(a.summary), '');
      for (const context of item.contexts) {
        lines.push('#### 实际上下文 ' + escape(context.id), '');
        for (const [key, label] of [['environment', '环境'], ['identity', '实际身份'], ['objects', '对象'], ['initialState', '初态'], ['authorization', '授权条件']] as const) {
          const fact = context[key];
          lines.push('- ' + label + '：' + fact.state + '；' + escape(fact.summary) + '；来源证据：' + escape(fact.sources.flatMap(s=>s.evidenceIds).join(', ') || '未记录'));
        }
        if (context.notes) lines.push(escape(context.notes));
        lines.push('');
      }
      for (const phenomenon of a.phenomena ?? []) lines.push('#### 现象：' + escape(phenomenon.title), '', escape(phenomenon.actual), '', '观察：' + escape(phenomenon.observationIds.join(', ')), '', '证据：' + escape(phenomenon.evidenceIds.join(', ')), '', '局限：' + escape(phenomenon.limitations.join('；') || '未列出'), '');
      for (const gap of a.gapDetails ?? []) lines.push('- 缺口（' + gap.kind + '）：' + escape(gap.missing) + '；影响：' + escape(gap.impact) + (gap.nextStep ? '；后续所需：' + escape(gap.nextStep) : ''));
      if (a.reproduction) lines.push('#### 根据记录整理的复现准备', '', ...a.reproduction.preparation.map(value => '- ' + escape(value)), '', '对象现状：' + escape(a.reproduction.objectState), '', '重复观察：' + escape(a.reproduction.repeatability), '', '局限：' + escape(a.reproduction.limitations.join('；') || '未列出'), '');
      if (a.revisionReason || a.previousOperationId) lines.push('修订关系：' + escape(a.previousOperationId ?? '未引用前序登记') + '；' + escape(a.revisionReason ?? '未说明原因'), '');
      for (const o of item.observations) lines.push('- 观察 ' + escape(o.id) + '：' + escape(o.summary), '  必要语义覆盖：' + escape(o.coveredRefs.join(', ') || '(none)'), '  证据：' + escape(o.evidenceIds.join(', ') || '(none)'), '');
      for (const o of item.observations) {
        if (o.actual) lines.push('实际结果：' + escape(o.actual), '');
        lines.push('观察发生时间：' + escape(o.occurredAt ?? '未记录（不使用登记时间替代）'), '');
        for (const action of o.actions ?? []) lines.push('- 实际操作 ' + escape(action.id) + '：' + escape(action.description), '  输入：' + escape(action.input ?? '未记录/不适用'), '  读回结果：' + escape(action.result ?? '未记录'), '  操作发生时间：' + escape(action.occurredAt ?? '未记录'), '  证据：' + escape(action.evidenceIds.join(', ') || '未关联'), '');
        for (const link of o.evidenceLinks ?? []) lines.push('- 证据用途 ' + escape(link.evidenceId) + '：' + escape(link.purpose) + '；支持事实：' + escape(link.fact) + '；局限：' + escape(link.limitations.join('；') || '未列出'), '');
      }
      lines.push('关联证据：' + escape(item.evidenceIds.join(', ') || '(none)'), '');
    }
    lines.push('### 冻结前提与必要业务步骤', '', '关键前提：' + escape(c.criticalConditions.join('；') || '(none supplied)'), '',
      '必经路径：' + escape(c.requiredPath ?? '(none supplied)'), '', '步骤顺序：' + c.stepOrder, '',
      '计划不是执行证明；添加事后整理说明不会改变该计划的来源。', '');
    for (const [i, step] of c.steps.entries()) lines.push((i + 1) + '. ' + escape(step.id) + '：' + escape(step.action));
    for (const finding of c.findings) lines.push('', '#### 相关现象主题：' + escape(finding.title), '', '范围：' + finding.scope + '；整理状态：' + finding.reviewState + '；不自动计为独立缺陷。', '', '关联目标：' + escape(finding.goalIds.join(', ')) + '；关联理由：' + escape(finding.relationReason), '', '观察：' + escape(finding.observationIds.join(', ')) + '；证据：' + escape(finding.evidenceIds.join(', ')), '');
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
      lines.push('', '完整当时记录（含实际动作、上下文和修订）：', '', '```json', JSON.stringify(entry.record, null, 2).replace(/```/g, '\\u0060\\u0060\\u0060'), '```');
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
  if (payload) {
    lines.push('## 留存正文与交付状态', '', '交付模式：' + payload.delivery.mode + '；材料交付完整：' + payload.delivery.complete + '。完整性不代表业务充分性。', '');
    const shown = new Set<string>();
    for (const item of report.evidenceCatalog.items) {
      const preview = payload.previews[item.id]; if (!preview) continue;
      lines.push('### ' + escape(item.id) + '：' + escape(item.description), '', '源内容状态：' + preview.contentState + '。' + escape(preview.previewNote), '');
      if (item.metadata) lines.push('证据上下文与局限：' + escape(JSON.stringify(item.metadata)), '');
      if (preview.attachmentPath) lines.push('附件：[' + escape(item.id) + '](' + preview.attachmentPath + ')', '');
      const asset = preview.assetId ? payload.assets[preview.assetId] : undefined;
      if (asset?.kind === 'text' && preview.assetId) {
        if (shown.has(preview.assetId)) lines.push('同内容已在前面的证据正文中展示；证据ID和归属保留。', '');
        else { shown.add(preview.assetId); lines.push('```text', (asset.text ?? '').replace(/```/g, '\\u0060\\u0060\\u0060'), '```', ''); }
      }
    }
  }
  return lines.join('\n') + '\n';
}

export { rasterMime, rasterDimensions, htmlReportPayload } from './assets.mjs';
export function safeJsonForHtml(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => ({ '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029' } as Record<string, string>)[character] ?? character);
}
export function htmlReport(payload: HtmlPayload): string {
  return reportShell(safeJsonForHtml(payload), readFileSync(path.join(TOOL_ROOT, 'report-ui/main.js'), 'utf8'));
}
