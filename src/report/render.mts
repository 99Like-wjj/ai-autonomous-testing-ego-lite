import { uiText as u } from './ui-text.mjs';
import { withPresentation } from './presentation.mjs';
import { modelDisplay, modelHeader } from './model-display.mjs';
import { scopeLabel } from './scope-label.mjs';
import type { RegressionBinding } from '../regression/binding.mjs';
import type { Report, HtmlPayload } from '../contracts/model.mjs';
import { caseGoals, goalDistribution, labels } from './execution-view.mjs';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { TOOL_ROOT } from '../scripts/toolchain.mjs';
import { fail } from '../core/common.mjs';
import { reportShell } from './shell.mjs';
import { reviewPrompts } from './reviewability.mjs';
export const escape = (value: unknown): string => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\*_{}\[\]()#+.!|~-]/g, '\\$&').split(String.fromCharCode(96)).join('\\' + String.fromCharCode(96)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0')).replace(/\r?\n/g, '  \n');
export function markdown(report: Report, payload?: HtmlPayload): string {return withPresentation(report.presentation,()=>markdownBody(report,payload));}
function markdownBody(report: Report, payload?: HtmlPayload): string {
  if (report.schemaVersion !== 9) fail('Unsupported report format; v9 is required.');
  const producer=modelDisplay(report.aiContext,'test_execution');
  const lines: string[] = [u('# 本地测试报告'), '', escape(report.project), '', escape(report.caveat), '',
    u('业务目标总数：') + report.goalCount + u('；用例／场景数：') + report.caseCount + '。', '',
    Object.entries(report.counts).map(([state, count]) => u(labels[state as keyof typeof labels]) + '：' + count).join('；') + '。', '',
    u('记录完整：') + report.assessmentComplete + u('。未登记评估表示记录缺口，不是业务四态；记录完整不等于已完成验收。'), '',
    u('结果版本：') + report.revision + u('；证据版本：') + report.evidenceRevision + u('；校验匹配证据：') + report.evidenceIntegrity.hashVerifiedItems + '。', '',
    u('截图证据：已登记 ') + report.evidenceCoverage.registeredScreenshots + u('；全部证据去重后内容 ') + report.evidenceCoverage.distinctRetainedContents + '。', '',
    u('评估未关联截图的目标：') + (report.evidenceCoverage.goalsWithoutScreenshots.map(item => escape(item.caseId + '/' + item.goalId)).join(', ') || '(none)') + u('。关键 UI 结论需要真实页面截图，文件哈希不证明业务结论。'), ''];
  if (report.regressionBinding) {
    const b = report.regressionBinding as RegressionBinding, c = b.coverage;
    lines.push(u('## 本轮范围与用例版本'), '', u('模式：') + scopeLabel(b), '',
      u('原范围 ') + c.requestedCases + u(' 场景 / ') + c.requestedGoals + u(' 目标；选中 ') + c.selectedCases + u(' 场景 / ') + c.selectedGoals + u(' 目标；本次冻结 ') + c.compiledCases + u(' 场景 / ') + c.compiledGoals + u(' 目标；未选中 ') + c.notSelectedCases + u(' 场景。'), '',
      u('本报告四态仅对应本次冻结范围；未选中不是未测试，不继承历史通过。全量选择不等于全量执行完成。'), '',
      u('用例版本：v') + b.selection.request.cases.caseVersion + u('；指纹：') + b.selection.request.cases.sha256 + u('；筛选状态：') + escape(b.selection.request.statuses.join(', ') || u('(不按状态筛选)')), '',
      u('来源运行：') + escape(b.selection.request.sourceRun?.runId ?? u('(未指定历史状态基准)')) + u('；源结果版本：') + (b.selection.request.sourceRun?.resultsRevision ?? u('无')) + '。', '');
    for (const g of c.gaps) lines.push(u('- 范围缺口 ') + escape((g.pointId ?? u('来源覆盖')) + '：' + g.reason));
    if (b.selection.notSelectedPointIds.length) lines.push(u('- 本轮未选中：') + b.selection.notSelectedPointIds.map(escape).join(', ') + u('；无本次结果，历史仅供参考。'));
    lines.push('', u('当次条件是有来源的 AI 核验说明，工具不认证真实就绪或授权；待核验项仍需处理。'), '');
    for (const i of b.currentConditions.items) lines.push('- ' + escape(i.caseIds.join(', ') + ' / ' + i.aspect + ' / ' + i.state + '：' + i.statement) + u('；来源 ') + escape(i.source.locator));
    for (const p of b.parameterBindings) lines.push(u('- 参数 ') + escape(p.caseId + '/' + p.parameterId) + '：' + escape(JSON.stringify(p.value)) + u('；来源 ') + escape(p.source.locator));
    lines.push('');
  }
  const unresolved = (report.actionAttempts ?? []).filter(a => a.unresolved);
  if (unresolved.length) lines.push(u('## 尚待核对的动作'), '', ...unresolved.flatMap(a => ['### ' + escape(report.cases.find(c => c.id === a.caseId)?.title ?? a.caseId) + ' · ' + escape(a.label) + '（' + escape(a.caseId) + '）', '', escape(a.detail), '', u('核对原因：') + escape(a.reasons.join('；')), '', u('原始标识：') + escape(a.caseId + '/' + a.actionId), '']), u('不自动重放业务动作；是否重试由 AI 结合事实、幂等依据和授权决定。'), '');
  lines.push(producer.title+': '+producer.summary,...producer.detail.map(v=>v.model+' · '+v.reasoningEffort+' · '+v.sourceKind+' · '+v.source.locator),'');
  if (report.context) {
    lines.push(u('## 事后整理来源（未重新执行）'), '', escape(report.context.summary), '', ...report.context.limitations.map(item => '- ' + escape(item)), '',
      u('补充范围用例：') + (report.context.supplementalCaseIds.map(escape).join(', ') || '(none)'), '',
      ...report.context.sources.map(item => '- ' + escape(item.label) + '；' + escape(item.file) + '；SHA-256 ' + item.sha256), '',
      u('整理说明不另行提供业务结论，也不改变冻结基线或已有评估的来源。'), '');
  }
  for (const c of report.cases) {
    lines.push('## ' + escape(c.id) + '：' + escape(c.title), '', u('子目标分布：') + goalDistribution(report, c), '');
    for (const item of caseGoals(report, c)) {
      const g = item.goal, a = item.assessment;
      lines.push('### ' + escape(g.title) + '（' + escape(g.id) + '）：' + labels[item.status], '', u('预期：') + escape(g.expected), '',
        u('需求依据：') + g.basis.kind + '；' + escape(g.basis.source) + '；' + escape(g.basis.text), '',
        u('必要语义引用：') + escape(g.requiredRefs.join(', ') || '(none)'), '');
      if (g.followUpOf) lines.push(u('本目标复核的来源：') + escape(g.followUpOf.runId + '/' + g.followUpOf.caseId + '/' + g.followUpOf.goalId + '：' + g.followUpOf.reason), '');
      for (const laterCase of report.cases) for (const later of laterCase.goals) {
        const f = later.followUpOf;
        if ((f?.runId === report.runId || f?.runId === 'self') && f.caseId === c.id && f.goalId === g.id) lines.push(u('后续复核：') + escape(laterCase.id + '/' + later.id) + '；' + labels[laterCase.assessments.find(a => a.goalId === later.id)?.status ?? 'unassessed'] + '；' + escape(f.reason) + u('。原评估保留，不自动替换。'), '');
      }
      if (g.clarificationQuestions?.length) lines.push(u('冻结待澄清：') + g.clarificationQuestions.map(escape).join('；'), '');
      if (!a) { lines.push(u('完整性缺口：未登记目标评估，不能据此推断未测试、无法判断或其他业务结论。'), ''); continue; }
      lines.push(u('判断理由：') + escape(a.rationale), '', u('剩余缺口：') + (a.gaps.map(escape).join('；') || '(none recorded)'), '',
        u('评估来源：') + escape(a.operationId) + '；revision ' + a.revision + '；' + escape(a.recordedAt), '');
      for(const p of a.problemChecks??[])lines.push(u('原问题检查：')+escape(p.state+'；'+p.rationale)+u('；原来源 ')+escape(p.source.run.runId+'/'+p.source.caseId+'/'+(p.source.findingId??p.source.goalId??''))+u('；本轮观察 ')+escape(p.observationIds.join(', '))+u('；缺口 ')+escape(p.gaps.join('；')),'');
      if (a.diagnosis) lines.push(u('归因：') + a.diagnosis.state + ' / ' + a.diagnosis.category + '；' + escape(a.diagnosis.summary) + u('。根因状态与业务四态独立。'), '');
      if (a.summary) lines.push(u('阅读摘要：') + escape(a.summary), '');
      if(a.display)lines.push(u('可读标题：')+escape(a.display.title),'',u('实际现象：')+escape(a.display.actual),'',u('影响范围：')+escape(a.display.impact),'');
      for (const context of item.contexts) {
        lines.push(u('#### 实际上下文 ') + escape(context.id), '');
        for (const [key, label] of [['environment', u('环境')], ['identity', u('实际身份')], ['objects', u('对象')], ['initialState', u('初态')], ['authorization', u('授权条件')]] as const) {
          const fact = context[key];
          lines.push('- ' + label + '：' + fact.state + '；' + escape(fact.summary) + u('；来源证据：') + escape(fact.sources.flatMap(s=>s.evidenceIds).join(', ') || u('未记录')));
        }
        if (context.notes) lines.push(escape(context.notes));
        lines.push('');
      }
      for (const phenomenon of a.phenomena ?? []) lines.push(u('#### 现象：') + escape(phenomenon.title), '', escape(phenomenon.actual), '', u('观察：') + escape(phenomenon.observationIds.join(', ')), '', u('证据：') + escape(phenomenon.evidenceIds.join(', ')), '', u('局限：') + escape(phenomenon.limitations.join('；') || u('未列出')), '');
      for (const gap of a.gapDetails ?? []) lines.push(u('- 缺口（') + gap.kind + '）：' + escape(gap.missing) + u('；影响：') + escape(gap.impact) + (gap.nextStep ? u('；后续所需：') + escape(gap.nextStep) : ''));
      if (a.reproduction) lines.push(u('#### 根据记录整理的复现准备'), '', ...a.reproduction.preparation.map(value => '- ' + escape(value)), '', u('对象现状：') + escape(a.reproduction.objectState), '', u('重复观察：') + escape(a.reproduction.repeatability), '', u('局限：') + escape(a.reproduction.limitations.join('；') || u('未列出')), '');
      const note = report.context?.goalNotes?.find(n => n.caseId === c.id && n.goalId === g.id);
      if (note) {
        lines.push(u('#### 事后复核说明（未重新执行）'), '', escape(note.summary), '', u('建议复核前提：'), '', ...note.preparation.map(s => '- ' + escape(s)), '', u('建议复核路线（不是原实际操作记录）：'), '', ...note.reviewSteps.map((s, i) => (i + 1) + '. ' + escape(s)), '', u('说明局限：') + escape(note.limitations.join('；')), '', u('复核说明来源：') + escape(note.sourceLabels.join('；')), '', u('优先查看的既有证据：') + escape(note.primaryEvidenceIds.join('；') || u('未指定')), '');
        for (const use of note.evidenceUses) lines.push(u('- 事后证据说明 ') + escape(use.evidenceId) + '：' + escape(use.purpose) + u('；支持事实：') + escape(use.fact) + u('；局限：') + escape(use.limitations.join('；') || u('未列出')));
        lines.push('');
      }
      const readerNote = report.context?.readerNotes?.find(n => n.caseId === c.id && n.goalId === g.id);
      if (readerNote) {
        lines.push(u('#### 步骤与证据阅读整理（未新增业务执行）'), '', escape(readerNote.title), '', escape(readerNote.description), '',
          u('标记位置：') + escape(readerNote.focusAction ? readerNote.focusAction.observationId + '/' + readerNote.focusAction.actionId : u('未指定，不自动推断问题步骤')), '',
          u('来源：') + escape(readerNote.sourceLabels.join('；')) + u('；限制：') + escape(readerNote.limitations.join('；')), '');
        for (const action of readerNote.actions) lines.push('- ' + escape(action.observationId + '/' + action.actionId + '：' + action.title),
          u('  留存事实说明：') + escape(action.result ?? u('未另行整理')), u('  本步证据：') + escape(action.evidenceIds.join(', ') || u('未关联独立证据')), ...(action.note ? [u('  局限：') + escape(action.note)] : []));
        lines.push(u('原实际动作和原评估保持，下列原始记录不是本次重新执行。'), '');
      }
      if (a.status !== 'not_tested' && (!item.contexts.length || !item.observations.some(o => o.actions?.length || o.actionEventIds?.length) || !a.reproduction)) lines.push(u('复核资料提示：原记录中的上下文、结构化实际操作或独立复核准备尚有缺项；事后建议不补造执行事实，也不改变原业务状态。'), '');
      if (a.revisionReason || a.previousOperationId) lines.push(u('修订关系：') + escape(a.previousOperationId ?? u('未引用前序登记')) + '；' + escape(a.revisionReason ?? u('未说明原因')), '');
      for (const o of item.observations) lines.push(u('- 观察 ') + escape(o.id) + '：' + escape(o.summary), u('  必要语义覆盖：') + escape(o.coveredRefs.join(', ') || '(none)'), u('  证据：') + escape(o.evidenceIds.join(', ') || '(none)'), '');
      for (const o of item.observations) {
        if (o.actual) lines.push(u('实际结果：') + escape(o.actual), '');
        if(o.phase)lines.push(u('检查阶段声明：预期 ')+escape(o.phase.expected)+u('；实际 ')+escape(o.phase.observed)+u('；依据 ')+escape(o.phase.basis),'');
        lines.push(u('观察发生时间：') + escape(o.occurredAt ?? u('未记录（不使用登记时间替代）')), '');
        for (const action of o.actions ?? []) {
          const reading=readerNote?.actions.find(s=>s.observationId===o.id&&s.actionId===action.id),input=reading?.inputSummary??action.inputSummary,reply=reading?.replySummary??action.replySummary;
          lines.push(u('- 实际操作 ') + escape(action.id) + '：' + escape(action.description), u('  输入记录：') + escape(action.input ?? u('未记录/不适用')), ...(input?[u('  输入摘要：')+escape(input)]:[]),...(reply?[u('  AI回复摘要：')+escape(reply)]:[]),u('  实际结果记录：') + escape(action.result ?? u('未记录')), u('  操作发生时间：') + escape(action.occurredAt ?? u('未记录')), u('  证据：') + escape(action.evidenceIds.join(', ') || u('未关联')), '');
        }
        for (const link of o.evidenceLinks ?? []) lines.push(u('- 证据用途 ') + escape(link.evidenceId) + '：' + escape(link.purpose) + u('；支持事实：') + escape(link.fact) + u('；局限：') + escape(link.limitations.join('；') || u('未列出')), '');
      }
      lines.push(u('关联证据：') + escape(item.evidenceIds.join(', ') || '(none)'), '');
    }
    lines.push(u('### 冻结前提与必要业务步骤'), '', u('关键前提：') + escape(c.criticalConditions.join('；') || '(none supplied)'), '',
      u('必经路径：') + escape(c.requiredPath ?? '(none supplied)'), '', u('步骤顺序：') + c.stepOrder, '',
      u('计划不是执行证明；添加事后整理说明不会改变该计划的来源。'), '');
    for (const [i, step] of c.steps.entries()) lines.push((i + 1) + '. ' + escape(step.id) + '：' + escape(step.action));
    for (const finding of c.findings) lines.push('', u('#### 相关现象主题：') + escape(finding.title), '', u('范围：') + finding.scope + u('；整理状态：') + finding.reviewState + u('；不自动计为独立缺陷。'), '', u('关联目标：') + escape(finding.goalIds.join(', ')) + u('；关联理由：') + escape(finding.relationReason), '', u('观察：') + escape(finding.observationIds.join(', ')) + u('；证据：') + escape(finding.evidenceIds.join(', ')), '');
    if (c.contexts.length || c.actionEvents.length) lines.push('', u('### 当次上下文与动作事实'), '');
    for (const ctx of c.contexts) {
      lines.push(u('#### 上下文 ') + escape(ctx.id), '');
      for (const key of ['environment', 'identity', 'objects', 'initialState', 'authorization'] as const) lines.push('- ' + key + ' / ' + ctx[key].state + '：' + escape(ctx[key].summary) + u('；来源 ') + escape(ctx[key].sources.map(s => s.reference).join('；')));
    }
    for (const e of c.actionEvents) lines.push(u('- 动作 ') + escape(e.actionId) + u(' / 事件 ') + escape(e.id) + ' / ' + e.purpose + ' / ' + e.kind + '：' + escape(e.summary), u('  发出：') + (e.dispatchState ?? u('未声明')) + u('；业务结果知识：') + (e.resultState ?? u('未声明')) + u('；处置：') + (e.disposition?.state ?? u('未声明')) + u('；证据 ') + escape(e.evidenceIds.join(', ') || '(none)'), ...(e.inputs?.length ? [u('  关键输入：') + escape(e.inputs.join('；'))] : []), ...(e.disposition ? [u('  处置依据：') + escape(e.disposition.rationale + u('；范围 ') + e.disposition.scope + u('；限制 ') + e.disposition.limitations.join('；'))] : []));
    lines.push('', u('### 原始观察与评估历史'), '', u('attempt 仅是历史，不自动替换当前评估；final 只更新本次明确提及的目标。'), '');
    for (const entry of c.entries) {
      lines.push('#### ' + entry.mode + ' / ' + escape(entry.operationId) + ' / revision ' + entry.revision, '', escape(entry.recordedAt), '');
      for (const o of entry.record.observations) lines.push(u('- 观察 ') + escape(o.id) + '：' + escape(o.summary) + u('；覆盖 ') + escape(o.coveredRefs.join(', ') || '(none)') + u('；证据 ') + escape(o.evidenceIds.join(', ') || '(none)'));
      for (const a of entry.record.assessments) lines.push(u('- 评估 ') + escape(a.goalId) + '：' + u(labels[a.status]) + '；' + escape(a.rationale) + u('；观察 ') + escape(a.observationIds.join(', ') || '(none)') + u('；缺口 ') + escape(a.gaps.join('；') || '(none)') + (a.diagnosis ? u('；归因 ') + a.diagnosis.state + '/' + a.diagnosis.category + '：' + escape(a.diagnosis.summary) : ''));
      lines.push('', u('完整当时记录（含实际动作、上下文和修订）：'), '', '```json', JSON.stringify(entry.record, null, 2).replace(/```/g, '\\u0060\\u0060\\u0060'), '```');
      lines.push('');
    }
  }
  if (report.execution && report.executionSummary) {
    const e = report.execution, s = report.executionSummary;
    lines.push(u('## 并发与交付记录'), '', u('并发上限：') + s.configuredMaxParallelCases + u('；名额峰值：') + s.peakReservations + u('；报告执行峰值：') + (s.reportedExecutionPeak ?? u('未知')) + u('。名额不等于浏览器实测重叠。'), '',
      u('未完成分派：') + escape(s.unfinishedAssignmentIds.join(', ') || '(none)') + u('；待导入：') + escape(s.pendingImportIds.join(', ') || '(none)'), '',
      u('该台账不作为另一条业务结果来源。'), '');
    for (const a of e.assignments) lines.push('- ' + escape(a.caseId) + ' / ' + escape(a.id) + '：' + a.state + '；worker ' + escape(a.workerId ?? u('未绑定')) + u('；默认 Space ') + (a.defaultSpaceId ?? u('未知')));
    for (const event of e.events.filter(item => item.kind.startsWith('note:'))) lines.push('- ' + escape(event.kind) + '：' + escape(event.reason));
    lines.push('');
  }
  lines.push(u('## 证据目录'), '');
  for (const item of report.evidenceCatalog.items) lines.push('- ' + escape(item.id) + '：' + escape(item.path),
    '  Case ' + escape(item.caseId) + '；' + item.kind + '；bytes ' + item.bytes + '；SHA-256 ' + item.sha256,
    u('  登记时间 ') + escape(item.collectedAt) + u('；来源采集时间 ') + escape(item.capturedAt ?? '(not supplied)'),
    u('  来源 ') + escape(item.source) + u('；说明 ') + escape(item.description), '');
  if (payload) {
    lines.push(u('## 留存正文与交付状态'), '', u('交付模式：') + payload.delivery.mode + u('；材料交付完整：') + payload.delivery.complete + u('。完整性不代表业务充分性。'), '');
    const shown = new Set<string>();
    for (const item of report.evidenceCatalog.items) {
      const preview = payload.previews[item.id]; if (!preview) continue;
      lines.push('### ' + escape(item.id) + '：' + escape(item.description), '', u('源内容状态：') + preview.contentState + '。' + escape(preview.previewNote), '');
      if (item.metadata) lines.push(u('证据上下文与局限：') + escape(JSON.stringify(item.metadata)), '');
      if (preview.attachmentPath) lines.push(u('附件：[') + escape(item.id) + '](' + preview.attachmentPath + ')', '');
      const asset = preview.assetId ? payload.assets[preview.assetId] : undefined;
      if (asset?.kind === 'text' && preview.assetId) {
        if (shown.has(preview.assetId)) lines.push(u('同内容已在前面的证据正文中展示；证据ID和归属保留。'), '');
        else { shown.add(preview.assetId); lines.push('```text', (asset.text ?? '').replace(/```/g, '\\u0060\\u0060\\u0060'), '```', ''); }
      }
    }
  }
  if(report.history){const h=report.history;lines.push(u('## 历次运行对照'),'',u('历史仅说明原运行，不计入本轮四态；状态变化不自动证明代码修复。'),'');
    for(const n of h.nodes){lines.push('### '+escape(n.ref.runId)+(h.primaryBaseline?.runId===n.ref.runId&&h.primaryBaseline.resultsSha256===n.ref.resultsSha256?u('（主要比较基准）'):''),'',u('用例版本 v')+n.caseVersion+u('；结果 revision ')+n.ref.resultsRevision+u('；原结果指纹 ')+n.ref.resultsSha256,'');
      for(const p of n.points){lines.push('#### '+escape(p.pointId+'：'+p.title),'',u('原运行：')+(p.selected?p.status?u(labels[p.status]):u('缺少评估'):u('未选中'))+u('；对应本次 ')+p.forPointIds.map(escape).join(', '),'',u('原预期：')+escape(p.expected),'',u('原依据：')+escape(p.definition.basis.source+'；'+p.definition.basis.text),'',u('原必要计划：')+escape(JSON.stringify(p.plan)),'',u('该运行条件与参数：')+escape(JSON.stringify({conditions:p.declaredConditions,parameters:p.parameterBindings})),'',u('原判断：')+escape(p.rationale??u('无')),'',u('缺口：')+escape(p.gaps.join('；')),'');
        for(const key of p.evidenceKeys){const e=h.evidence.find(e=>e.key===key),preview=payload?.previews[key];if(!e)continue;lines.push(u('- 历史证据 ')+escape(e.item.id)+'：'+escape(e.item.description)+(preview?.attachmentPath?u('；[原件](')+preview.attachmentPath+')':''));}lines.push('');}
    }
    for(const g of h.gaps)lines.push(u('- 历史资料缺口 ')+escape(g.run.runId+'：'+g.reason));
    lines.push('',escape(h.caveat),'');
  }
  const prompts=reviewPrompts(report);if(prompts.length)lines.push(u('## 记录可读性与取证提示'),'',u('仅为结构提示，不改变业务四态。'),'',...prompts.map(p=>'- '+escape(p.caseId+'/'+p.goalId+'：'+p.detail)),'');
  const conversations=Object.values(payload?.conversations??{});
  if(conversations.length)lines.push(u('## 已留存的完整对话阅读'),'',u('以下逐条保留来源整理内容；完整性、结束状态和业务成功分别核验。HTML提供消息定位与来源查看。'),'');
  for(const view of conversations){
    lines.push('### '+escape(view.artifact.title),'',u('关联：')+escape(view.caseId+(view.goalId?'/'+view.goalId:''))+'；'+(view.retrospective?u('事后来源整理'):u('本轮登记对话')),'');
    for(const m of view.artifact.messages){
      const presentation={verbatim:u('逐字原文'),normalized:u('来源整理'),summary:u('仅摘要')}[m.presentation],complete={complete:u('原文覆盖完整'),partial:u('原文部分留存'),unknown:u('原文覆盖未确定')}[m.completeness];
      lines.push('#### '+escape(({user:u('测试输入'),assistant:u('被测AI'),tool:u('工具可见消息'),notice:u('通知')}[m.role])+' · '+m.id),'',escape(presentation+'；'+complete+u('；结束状态 ')+m.state),'',escape(m.content),'',u('结束依据：')+escape(m.completionBasis),'',u('来源：')+escape(m.sourceRefs.map(r=>r.sourceId).join('、')),'',...(m.limitations.length?[u('局限：')+escape(m.limitations.join('；')),'']:[]));
    }
    for(const source of view.sources)lines.push(u('- 来源 ')+escape(source.sourceId+'：'+source.label+'；SHA256 '+source.sha256+(source.evidenceId?u('；证据 ')+source.evidenceId:'')));
    lines.push('',escape(view.limitations.join('；')),'');
  }
  return lines.join('\n') + '\n';
}

export { rasterMime, rasterDimensions, htmlReportPayload } from './assets.mjs';
export function safeJsonForHtml(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => ({ '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029' } as Record<string, string>)[character] ?? character);
}
export function htmlReport(payload: HtmlPayload): string {
  return withPresentation(payload.report.presentation,()=>reportShell(safeJsonForHtml(payload), readFileSync(path.join(TOOL_ROOT, 'report-ui/main.js'), 'utf8'),modelHeader(payload.report.aiContext,'test_execution')));
}
