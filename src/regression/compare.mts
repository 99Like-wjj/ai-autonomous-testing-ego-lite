/** Cross-run comparison reports facts and explicit mappings. Attribution belongs to the reviewing AI. */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { CheckedCase, Status } from '../contracts/model.mjs';
import type { SourceRun } from './model.mjs';
import type { GoalRef } from './selection.mjs';
import type { RegressionBinding } from './binding.mjs';
import { validateBinding } from './binding.mjs';
import { readSourceRun } from './sources.mjs';
import { assertClosed, canonical, canonicalHash, fail, hash, inside, json, safeIdentifier, safePath, writeNew } from '../core/common.mjs';
import { arrayValue, integer, oneOf, sha256Value, textValue } from '../core/validation.mjs';
import { recordEvidenceIds } from '../core/action-events.mjs';

export interface ComparisonRunRef { runDir: string; runId: string; baselineSha256: string; resultsRevision: number; resultsSha256: string }
export interface GoalMapping { id: string; left: GoalRef | null; right: GoalRef | null; reason: string }
export interface ComparabilitySource { side: 'left' | 'right'; kind: 'result' | 'evidence' | 'binding'; ref: string }
export interface Comparability { mappingId: string; state: 'comparable' | 'limited' | 'not_directly_comparable'; rationale: string; sources: ComparabilitySource[] }
export interface ComparisonRequest { regressionVersion: 1; left: ComparisonRunRef; right: ComparisonRunRef; mappings: GoalMapping[]; comparability: Comparability[] }
export interface ComparedGoal {
  caseId: string; goalId: string; status: Status | null; rationale: string | null; resultRevision: number | null; gaps: string[];
  evidence: { runId: string; evidenceId: string; sha256: string; kind: string; source: string; collectedAt: string }[];
  evidenceLimitations: string[];
}
export interface ComparisonDifference { aspect: 'rule' | 'task' | 'identity' | 'environment' | 'data' | 'authorization' | 'scope' | 'path'; changed: boolean; left: string | null; right: string | null }
export interface RegressionComparison {
  regressionVersion: 1; left: ComparisonRunRef & { baselineSha256: string }; right: ComparisonRunRef & { baselineSha256: string };
  rows: { mapping: GoalMapping; left: ComparedGoal | null; right: ComparedGoal | null; differences: ComparisonDifference[]; comparability: Comparability | null }[];
  unmapped: { left: GoalRef[]; right: GoalRef[] }; caveat: string; contentSha256: string;
}
const key = (ref: GoalRef) => ref.caseId + '/' + ref.goalId;
function parseRunRef(value: unknown): ComparisonRunRef {
  assertClosed(value, ['runDir', 'runId', 'baselineSha256', 'resultsRevision', 'resultsSha256'], 'comparison run reference');
  return { runDir: textValue(value.runDir, 'comparison run directory'), runId: textValue(value.runId, 'comparison run ID'), baselineSha256: sha256Value(value.baselineSha256), resultsRevision: integer(value.resultsRevision, 'comparison results revision'), resultsSha256: sha256Value(value.resultsSha256) };
}
function parseGoalRef(value: unknown): GoalRef | null {
  if (value === null) return null;
  assertClosed(value, ['caseId', 'goalId'], 'comparison goal reference');
  return { caseId: safeIdentifier(value.caseId), goalId: safeIdentifier(value.goalId) };
}
export function parseComparisonRequest(value: unknown): ComparisonRequest {
  assertClosed(value, ['regressionVersion', 'left', 'right', 'mappings', 'comparability'], 'comparison request');
  if (value.regressionVersion !== 1) fail('Comparison requires regressionVersion 1.');
  const left = parseRunRef(value.left), right = parseRunRef(value.right);
  if (left.runId === right.runId) fail('Regression comparison requires two independent runs.');
  const mappings = arrayValue(value.mappings, 'explicit comparison mappings').map(item => {
    assertClosed(item, ['id', 'left', 'right', 'reason'], 'comparison mapping');
    const result = { id: safeIdentifier(item.id), left: parseGoalRef(item.left), right: parseGoalRef(item.right), reason: textValue(item.reason, 'mapping reason') };
    if (!result.left && !result.right) fail('A comparison mapping must name at least one actual goal.');
    return result;
  });
  if (!mappings.length || new Set(mappings.map(m => m.id)).size !== mappings.length || new Set(mappings.map(m => canonical([m.left, m.right]))).size !== mappings.length) fail('Provide nonempty, unique explicit comparison mappings.');
  const comparability = arrayValue(value.comparability, 'AI comparability declarations').map(item => {
    assertClosed(item, ['mappingId', 'state', 'rationale', 'sources'], 'comparability declaration');
    const mappingId = safeIdentifier(item.mappingId);
    if (!mappings.some(m => m.id === mappingId)) fail('Comparability declaration names an unknown mapping.');
    const sources = arrayValue(item.sources, 'comparability sources').map(source => {
      assertClosed(source, ['side', 'kind', 'ref'], 'comparability source');
      return { side: oneOf(source.side, ['left', 'right'], 'comparison source side'), kind: oneOf(source.kind, ['result', 'evidence', 'binding'], 'comparison source kind'), ref: textValue(source.ref, 'comparison source reference') };
    });
    if (!sources.length) fail('AI comparability declarations require explicit source references.');
    return { mappingId, state: oneOf(item.state, ['comparable', 'limited', 'not_directly_comparable'], 'AI comparability state'), rationale: textValue(item.rationale, 'AI comparability rationale'), sources };
  });
  if (new Set(comparability.map(c => c.mappingId)).size !== comparability.length) fail('Duplicate AI comparability declaration.');
  return { regressionVersion: 1, left, right, mappings, comparability };
}
async function readBinding(source: SourceRun): Promise<RegressionBinding | null> {
  const manifest = source.manifest;
  if (!manifest.regressionBindingFile) return null;
  const file = await safePath(path.join(source.runDir, manifest.regressionBindingFile), { existing: true });
  const bytes = await fs.readFile(file);
  if (hash(bytes) !== manifest.regressionBindingSha256) fail('Comparison binding hash mismatch.');
  return validateBinding(JSON.parse(bytes.toString('utf8')), source.baseline, manifest.runId);
}
/** One goal-scoped closure shared by dimensions, evidence display and comparability reference checks. */
function goalFacts(c: CheckedCase, goalId: string) {
  const assessment = c.assessments.find(a => a.goalId === goalId) ?? null;
  const observedIds = new Set(assessment?.observationIds ?? []), contextIds = new Set<string>(), actionEventIds = new Set<string>();
  const observations = c.observations.filter(observation => observedIds.has(observation.id));
  for (const observation of observations) {
    if (observation.contextId) contextIds.add(observation.contextId);
    for (const id of observation.actionEventIds ?? []) actionEventIds.add(id);
  }
  const actions = c.actionEvents.filter(event => actionEventIds.has(event.id));
  for (const event of actions) contextIds.add(event.contextId);
  const contexts = c.contexts.filter(context => contextIds.has(context.id));
  return { assessment, observations, actions, contexts };
}
function goalDetails(source: SourceRun, ref: GoalRef | null): ComparedGoal | null {
  if (!ref) return null;
  const c = source.checked.cases.find(c => c.id === ref.caseId);
  if (!c?.goals.some(g => g.id === ref.goalId)) fail('Explicit comparison mapping names an unknown goal: ' + key(ref));
  const { assessment: a, observations, actions, contexts } = goalFacts(c, ref.goalId);
  const evidenceIds = new Set(recordEvidenceIds({ observations, assessments: a ? [a] : [], actionEvents: actions, contexts }));
  const evidence = source.checked.evidenceCatalog.items.filter(e => evidenceIds.has(e.id)).map(e => ({ runId: source.manifest.runId, evidenceId: e.id, sha256: e.sha256, kind: e.kind, source: e.source, collectedAt: e.collectedAt }));
  return { ...ref, status: a?.status ?? null, rationale: a?.rationale ?? null, resultRevision: a?.revision ?? null, gaps: a?.gaps ?? [], evidence,
    evidenceLimitations: [...(!a ? ['No formal assessment exists at the specified results revision; no business state is inferred.'] : []), ...(!evidence.some(e => e.kind === 'screenshot') ? ['No retained screenshot is linked to this goal assessment; assess whether visual evidence is required.'] : [])] };
}
function dimensions(source: SourceRun, binding: RegressionBinding | null, ref: GoalRef | null): Record<ComparisonDifference['aspect'], string | null> {
  const aspects: ComparisonDifference['aspect'][] = ['rule', 'task', 'identity', 'environment', 'data', 'authorization', 'scope', 'path'];
  if (!ref) return Object.fromEntries(aspects.map(a => [a, null])) as Record<ComparisonDifference['aspect'], null>;
  const c = source.checked.cases.find(c => c.id === ref.caseId)!, goal = c.goals.find(g => g.id === ref.goalId)!;
  const scopeId = binding?.caseMappings.find(m => m.runCaseId === ref.caseId)?.scopeCaseId;
  const taskRef = binding?.selection.request.scope.taskBindings.find(b => b.caseId === scopeId)?.taskRef;
  const task = taskRef ? binding?.tasks.find(t => t.taskId === taskRef.taskId && t.revision === taskRef.revision && t.contentSha256 === taskRef.contentSha256) : undefined;
  const declarations = binding?.conditions.items.filter(item => item.caseIds.includes(scopeId ?? '')) ?? [];
  const { actions, contexts } = goalFacts(c, ref.goalId);
  const fact = (aspect: 'identity' | 'environment' | 'data' | 'authorization') => ({
    recordedContexts: contexts.length ? contexts.map(context => aspect === 'data' ? { objects: context.objects, initialState: context.initialState } : context[aspect]) : null,
    currentDeclarations: declarations.filter(d => d.aspect === aspect), availability: contexts.length || declarations.some(d => d.aspect === aspect) ? 'recorded' : 'unknown'
  });
  return {
    rule: canonical({ basis: goal.basis, expected: goal.expected, ruleRefs: task?.ruleBindings.find(b => b.goalId === goal.id)?.ruleRefs ?? [], clarificationQuestions: goal.clarificationQuestions ?? [] }),
    task: canonical(taskRef ?? { state: 'unknown', reason: 'No frozen regression task binding is present.' }),
    identity: canonical(fact('identity')), environment: canonical({ ...fact('environment'), deploymentVersion: 'Not inferred; consult explicitly recorded environment facts.' }),
    data: canonical({ ...fact('data'), equivalenceConstraints: task?.dataConstraints ?? null }), authorization: canonical(fact('authorization')),
    scope: canonical(binding ? { scopeId: binding.selection.request.scope.scopeId, version: binding.selection.request.scope.version, mode: binding.selection.request.mode, requestedGoals: binding.coverage.requestedGoals, selectedGoals: binding.coverage.selectedGoals, compiledGoals: binding.coverage.compiledGoals, notSelected: binding.selection.notSelected, gaps: binding.coverage.gaps } : { baselineSha256: source.baselineSha256, goals: source.baseline.cases.flatMap(c => c.goals.map(g => ({ caseId: c.id, goalId: g.id }))) }),
    path: canonical({ requiredPath: c.requiredPath, stepOrder: c.stepOrder, steps: c.steps, requiredRefs: goal.requiredRefs, criticalConditions: c.criticalConditions, observedActionEvents: actions, taskPathKnowledge: task?.pathKnowledge ?? [] })
  };
}
function validateComparabilitySources(declaration: Comparability, mapping: GoalMapping, left: SourceRun, right: SourceRun, bindings: { left: RegressionBinding | null; right: RegressionBinding | null }) {
  for (const ref of declaration.sources) {
    const source = ref.side === 'left' ? left : right, goal = mapping[ref.side];
    if (ref.kind === 'result') {
      if (!goal || ref.ref !== key(goal)) fail('Comparability result source must identify the explicitly mapped goal.');
      continue;
    }
    if (ref.kind === 'binding') {
      if (!bindings[ref.side] || ref.ref !== bindings[ref.side]!.contentSha256) fail('Comparability binding source must identify the exact frozen binding hash.');
      continue;
    }
    if (!goal || !goalDetails(source, goal)?.evidence.some(e => e.evidenceId === ref.ref)) fail('Comparability evidence must be linked to the mapped goal at the exact results revision.');
  }
}

export async function compareRuns({ request: input }: { request: unknown }): Promise<RegressionComparison> {
  const request = parseComparisonRequest(input);
  const [left, right] = await Promise.all([readSourceRun(request.left.runDir, { resultsRevision: request.left.resultsRevision }), readSourceRun(request.right.runDir, { resultsRevision: request.right.resultsRevision })]);
  for (const [actual, expected] of [[left, request.left], [right, request.right]] as const) if (actual.manifest.runId !== expected.runId || actual.baselineSha256 !== expected.baselineSha256 || actual.resultsSha256 !== expected.resultsSha256) fail('Comparison run identity, baseline or results prefix hash mismatch.');
  const [leftBinding, rightBinding] = await Promise.all([readBinding(left), readBinding(right)]);
  const rows = request.mappings.map(mapping => {
    const leftGoal = goalDetails(left, mapping.left), rightGoal = goalDetails(right, mapping.right);
    const ld = dimensions(left, leftBinding, mapping.left), rd = dimensions(right, rightBinding, mapping.right);
    const comparability = request.comparability.find(c => c.mappingId === mapping.id) ?? null;
    if (comparability) validateComparabilitySources(comparability, mapping, left, right, { left: leftBinding, right: rightBinding });
    return { mapping, left: leftGoal, right: rightGoal, differences: (Object.keys(ld) as ComparisonDifference['aspect'][]).map(aspect => ({ aspect, changed: ld[aspect] !== rd[aspect], left: ld[aspect], right: rd[aspect] })), comparability };
  });
  const unmapped = (source: SourceRun, side: 'left' | 'right') => source.baseline.cases.flatMap(c => c.goals.map(g => ({ caseId: c.id, goalId: g.id }))).filter(ref => !request.mappings.some(m => m[side] && key(m[side]) === key(ref)));
  const body = { regressionVersion: 1 as const, left: { ...request.left, runDir: left.runDir, baselineSha256: left.baselineSha256 }, right: { ...request.right, runDir: right.runDir, baselineSha256: right.baselineSha256 }, rows, unmapped: { left: unmapped(left, 'left'), right: unmapped(right, 'right') },
    caveat: 'Differences are deterministic observations, not automatic regression attribution. AI comparability declarations are separate. Different rule versions can remain comparable; equal versions do not prove equivalent conditions. Null assessment means missing assessment, not a fifth business status. Every evidence reference retains its source run; matching image hashes do not imply reused acquisition.' };
  return { ...body, contentSha256: canonicalHash(body) };
}
const statusLabel = (goal: ComparedGoal | null) => !goal ? '未映射' : goal.status === null ? '缺少评估记录' : ({ verified: '已验证', violation: '发现违反', inconclusive: '无法判断', not_tested: '未测试' })[goal.status];
const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const escapeMd = (value: string) => value.replace(/[\\`*_{}[\]()#+\-.!|>]/g, '\\$&').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', ' ');
function comparabilitySourceRows(comparison: RegressionComparison, declaration: Comparability | null) {
  return (declaration?.sources ?? []).map(source => ({
    run: (source.side === 'left' ? '基准运行：' : '本次运行：') + comparison[source.side].runId,
    kind: ({ result: '目标结果 (result)', evidence: '证据 (evidence)', binding: '冻结绑定 (binding)' })[source.kind],
    reference: source.ref
  }));
}
function comparabilitySourcesMarkdown(comparison: RegressionComparison, declaration: Comparability | null): string[] {
  const rows = comparabilitySourceRows(comparison, declaration);
  return ['### AI 可比性依据', '', ...(rows.length ? [
    '证据引用对应本行来源证据的 evidenceId；目标结果引用为 caseId/goalId；冻结绑定引用为绑定内容哈希。', '',
    '| 来源运行 | 类型 | 精确引用 |', '| --- | --- | --- |',
    ...rows.map(row => '| ' + escapeMd(row.run) + ' | ' + escapeMd(row.kind) + ' | ' + escapeMd(row.reference) + ' |')
  ] : ['尚未提供']), ''];
}
function comparabilitySourcesHtml(comparison: RegressionComparison, declaration: Comparability | null): string {
  const rows = comparabilitySourceRows(comparison, declaration);
  return '<h3>AI 可比性依据</h3>' + (rows.length ? '<p>证据引用对应本行来源证据的 evidenceId；目标结果引用为 caseId/goalId；冻结绑定引用为绑定内容哈希。</p><table class="comparability-sources"><thead><tr><th>来源运行</th><th>类型</th><th>精确引用</th></tr></thead><tbody>' + rows.map(row => '<tr><td>' + escapeHtml(row.run) + '</td><td>' + escapeHtml(row.kind) + '</td><td><code>' + escapeHtml(row.reference) + '</code></td></tr>').join('') + '</tbody></table>' : '<p>尚未提供</p>');
}

/** Creates a new artifact directory only; both source runs remain read-only. No external scripts or URLs. */
export async function writeComparison({ outputDir, comparison }: { outputDir: unknown; comparison: RegressionComparison }): Promise<{ directory: string; json: string; markdown: string; html: string; contentSha256: string }> {
  const { contentSha256, ...body } = comparison;
  if (canonicalHash(body) !== contentSha256) fail('Comparison content hash mismatch.');
  const target = await safePath(outputDir, { external: true });
  if ([comparison.left.runDir, comparison.right.runDir].some(root => inside(root, target))) fail('Comparison output must be outside both source run directories.');
  await fs.mkdir(target, { mode: 0o700 });
  const summary = `基准运行 ${comparison.left.runId}（结果修订 ${comparison.left.resultsRevision}） → 本次运行 ${comparison.right.runId}（结果修订 ${comparison.right.resultsRevision}）`;
  const md = ['# 回归比较', '', escapeMd(summary), '', '比较仅对应显式映射。未选中或未映射目标不生成本次结论；业务变化和根因由 AI 根据证据判断。', '',
    ...comparison.rows.flatMap(row => ['## ' + escapeMd(row.mapping.id), '', `${statusLabel(row.left)} → ${statusLabel(row.right)}`, '', '映射依据：' + escapeMd(row.mapping.reason), '', 'AI 可比性：' + (row.comparability ? escapeMd(row.comparability.state + ' — ' + row.comparability.rationale) : '尚未提供'), '',
      ...comparabilitySourcesMarkdown(comparison, row.comparability),
      ...row.differences.flatMap(d => ['### ' + d.aspect + (d.changed ? '（有差异）' : '（记录相同）'), '', '基准：' + escapeMd(d.left ?? '无映射'), '', '本次：' + escapeMd(d.right ?? '无映射'), '']),
      '历史与本次证据：' + escapeMd(canonical({ left: row.left?.evidence ?? [], right: row.right?.evidence ?? [] })), '', '证据限制：' + escapeMd(canonical({ left: row.left?.evidenceLimitations ?? [], right: row.right?.evidenceLimitations ?? [] })), '']),
    '未映射目标：' + escapeMd(canonical(comparison.unmapped)), '', escapeMd(comparison.caveat), ''].join('\n');
  const html = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>回归比较</title><style>body{max-width:1100px;margin:2rem auto;font:16px/1.65 system-ui;padding:1rem;color:#17202a}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f6f7;padding:1rem}section{border-top:1px solid #bcc;margin-top:2rem}td,th{text-align:left;vertical-align:top;padding:.5rem;border:1px solid #ddd}table{border-collapse:collapse;width:100%}</style><h1>回归比较</h1><p>' + escapeHtml(summary) + '</p><p>明确映射、逐目标差异与 AI 可比性说明分别展示。以下证据保留各自来源运行，不代表本次新采集。</p>' + comparison.rows.map(row => '<section><h2>' + escapeHtml(row.mapping.id) + '</h2><p>' + statusLabel(row.left) + ' → ' + statusLabel(row.right) + '</p><p>映射依据：' + escapeHtml(row.mapping.reason) + '</p><p>AI 可比性：' + escapeHtml(row.comparability ? row.comparability.state + ' — ' + row.comparability.rationale : '尚未提供') + '</p>' + comparabilitySourcesHtml(comparison, row.comparability) + '<table><thead><tr><th>维度</th><th>基准</th><th>本次</th></tr></thead><tbody>' + row.differences.map(d => '<tr><th>' + escapeHtml(d.aspect) + (d.changed ? '：有差异' : '：记录相同') + '</th><td><pre>' + escapeHtml(d.left ?? '无映射') + '</pre></td><td><pre>' + escapeHtml(d.right ?? '无映射') + '</pre></td></tr>').join('') + '</tbody></table><h3>来源证据与限制</h3><pre>' + escapeHtml(json({ left: row.left, right: row.right })) + '</pre></section>').join('') + '<h2>未映射目标</h2><pre>' + escapeHtml(json(comparison.unmapped)) + '</pre><p>' + escapeHtml(comparison.caveat) + '</p></html>\n';
  const files = { json: path.join(target, 'comparison.json'), markdown: path.join(target, 'comparison.md'), html: path.join(target, 'comparison.html') };
  await writeNew(files.markdown, md); await writeNew(files.html, html); await writeNew(files.json, json(comparison));
  return { directory: target, ...files, contentSha256 };
}
