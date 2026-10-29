/** Explicit, deterministic whole-case selection. No business decisions or execution occur here. */
import type { Baseline, Status } from '../contracts/model.mjs';
import type { StoredRule, StoredTask, TaskRef } from './model.mjs';
import { normalizeCases } from '../core/baseline.mjs';
import { assertClosed, canonical, canonicalHash, fail, safeIdentifier } from '../core/common.mjs';
import { arrayValue, integer, oneOf, sha256Value, statusValues, textValue, uniqueStrings } from '../core/validation.mjs';
import { parseTaskRef } from './validation.mjs';
import { readArtifact } from './store.mjs';
import { inspectArtifactSources, readSourceRun } from './sources.mjs';

export interface GoalRef { caseId: string; goalId: string }
export interface CoverageGap { caseId: string; goalId: string | null; code: string; reason: string }
export interface RegressionScope {
  scopeId: string; version: string; baseline: Baseline;
  taskBindings: { caseId: string; taskRef: TaskRef | null }[];
  gaps: { caseId: string; goalId: string | null; reason: string }[];
}
export interface SelectionSource {
  runDir: string; runId: string; baselineSha256: string; resultsRevision: number; resultsSha256: string;
  goalMappings: (GoalRef & { sourceCaseId: string; sourceGoalId: string })[];
}
export interface SelectionRequest {
  regressionVersion: 1; mode: 'status' | 'full'; scope: RegressionScope;
  source: SelectionSource | null; statuses: Status[]; includeUnassessedCases: boolean;
}
export interface SourceGoalState extends GoalRef { status: Status | null; sourceMapped: boolean }
export interface RegressionSelection {
  regressionVersion: 1; request: SelectionRequest; scopeSha256: string; matchPolicy: 'any_goal';
  sourceStates: SourceGoalState[]; assetGaps: CoverageGap[];
  selectedCaseIds: string[]; matchedGoalRefs: GoalRef[]; plannedGoalRefs: GoalRef[];
  caseMatches: { caseId: string; matchedGoalRefs: GoalRef[]; unassessedGoalRefs: GoalRef[]; reason: 'full_scope' | 'status_match' | 'explicit_unassessed' }[];
  notSelected: { caseId: string; goalRefs: GoalRef[]; reason: string }[];
  gaps: CoverageGap[]; selectionSha256: string;
}
export const goalKey = (ref: GoalRef): string => ref.caseId + '/' + ref.goalId;
export const taskKey = (ref: TaskRef): string => ref.taskId + '@' + ref.revision + ':' + ref.contentSha256;
function bool(value: unknown, label: string): boolean { if (typeof value !== 'boolean') fail('Invalid ' + label + '.'); return value; }
function parseGoalRef(value: unknown): GoalRef {
  assertClosed(value, ['caseId', 'goalId'], 'goal reference');
  return { caseId: safeIdentifier(value.caseId), goalId: safeIdentifier(value.goalId) };
}
export function parseSelectionRequest(value: unknown): SelectionRequest {
  assertClosed(value, ['regressionVersion', 'mode', 'scope', 'source', 'statuses', 'includeUnassessedCases'], 'selection request');
  if (value.regressionVersion !== 1) fail('Regression selection requires regressionVersion 1; old formats are not migrated.');
  assertClosed(value.scope, ['scopeId', 'version', 'baseline', 'taskBindings', 'gaps'], 'regression scope');
  const baseline = normalizeCases(value.scope.baseline), caseIds = new Set(baseline.cases.map(c => c.id));
  const goalIds = new Set(baseline.cases.flatMap(c => c.goals.map(g => goalKey({ caseId: c.id, goalId: g.id }))));
  const bindings = arrayValue(value.scope.taskBindings, 'scope task bindings').map(item => {
    assertClosed(item, ['caseId', 'taskRef'], 'scope task binding');
    const caseId = safeIdentifier(item.caseId);
    if (!caseIds.has(caseId)) fail('Scope task binding names an unknown case: ' + caseId);
    return { caseId, taskRef: item.taskRef === null ? null : parseTaskRef(item.taskRef) };
  });
  if (new Set(bindings.map(item => item.caseId)).size !== bindings.length || bindings.length !== caseIds.size) fail('Scope must explicitly bind every case exactly once; use null for a missing task.');
  const scope: RegressionScope = { scopeId: safeIdentifier(value.scope.scopeId), version: textValue(value.scope.version, 'scope version'), baseline,
    taskBindings: baseline.cases.map(c => bindings.find(item => item.caseId === c.id)!),
    gaps: arrayValue(value.scope.gaps, 'scope gaps').map(item => {
      assertClosed(item, ['caseId', 'goalId', 'reason'], 'scope gap');
      const caseId = safeIdentifier(item.caseId), goalId = item.goalId === null ? null : safeIdentifier(item.goalId);
      if (!caseIds.has(caseId) || (goalId !== null && !goalIds.has(goalKey({ caseId, goalId })))) fail('Scope gap names an unknown case or goal.');
      return { caseId, goalId, reason: textValue(item.reason, 'scope gap reason') };
    }) };
  let source: SelectionSource | null = null;
  if (value.source !== null) {
    assertClosed(value.source, ['runDir', 'runId', 'baselineSha256', 'resultsRevision', 'resultsSha256', 'goalMappings'], 'selection source');
    const mappings = arrayValue(value.source.goalMappings, 'source goal mappings').map(item => {
      assertClosed(item, ['caseId', 'goalId', 'sourceCaseId', 'sourceGoalId'], 'source goal mapping');
      const ref = { caseId: safeIdentifier(item.caseId), goalId: safeIdentifier(item.goalId) };
      if (!goalIds.has(goalKey(ref))) fail('Source mapping names an unknown scope goal.');
      return { ...ref, sourceCaseId: safeIdentifier(item.sourceCaseId), sourceGoalId: safeIdentifier(item.sourceGoalId) };
    });
    if (new Set(mappings.map(goalKey)).size !== mappings.length) fail('Duplicate scope goal mapping.');
    if (new Set(mappings.map(item => item.sourceCaseId + '/' + item.sourceGoalId)).size !== mappings.length) fail('A source goal may not silently stand in for multiple scope goals.');
    source = { runDir: textValue(value.source.runDir, 'source run directory'), runId: textValue(value.source.runId, 'source run ID'), baselineSha256: sha256Value(value.source.baselineSha256),
      resultsRevision: integer(value.source.resultsRevision, 'source results revision'), resultsSha256: sha256Value(value.source.resultsSha256),
      goalMappings: baseline.cases.flatMap(c => c.goals.flatMap(g => mappings.filter(m => m.caseId === c.id && m.goalId === g.id))) };
  }
  const mode = oneOf(value.mode, ['status', 'full'], 'selection mode');
  const statuses = uniqueStrings(value.statuses, 'selected statuses').map(status => oneOf(status, statusValues, 'selected status'));
  const includeUnassessedCases = bool(value.includeUnassessedCases, 'includeUnassessedCases');
  if (mode === 'status' && (!source || !statuses.length)) fail('Status selection requires an exact source snapshot and at least one explicit business status.');
  if (mode === 'status' && source!.goalMappings.length !== goalIds.size) fail('Status selection requires a complete explicit source mapping for every scope goal.');
  if (mode === 'full' && (statuses.length || includeUnassessedCases)) fail('Full selection does not filter by statuses or an unassessed option.');
  return { regressionVersion: 1, mode, scope, source, statuses: statusValues.filter(status => statuses.includes(status)), includeUnassessedCases };
}

/** Reads only the exact task/rule revisions declared by the scope, never the library history. */
export async function readScopeAssets(projectDir: unknown, request: SelectionRequest): Promise<{ tasks: StoredTask[]; rules: StoredRule[]; gaps: CoverageGap[] }> {
  const tasks: StoredTask[] = [], rules: StoredRule[] = [], gaps: CoverageGap[] = [];
  const sourceChecks = new Map<string, Awaited<ReturnType<typeof inspectArtifactSources>>>();
  const unavailableSources = async (asset: StoredTask | StoredRule) => {
    const key = asset.kind + ':' + (asset.kind === 'task' ? asset.taskId : asset.ruleId) + '@' + asset.revision + ':' + asset.contentSha256;
    let checked = sourceChecks.get(key);
    if (!checked) { checked = await inspectArtifactSources(asset); sourceChecks.set(key, checked); }
    return checked.filter(check => check.referenceStatus === 'unavailable');
  };
  for (const item of request.scope.taskBindings) {
    const add = (code: string, reason: string, goalId: string | null = null) => gaps.push({ caseId: item.caseId, goalId, code, reason });
    if (!item.taskRef) { add('missing_task', 'The declared scope case has no task revision.'); continue; }
    const ref = item.taskRef;
    let task = tasks.find(t => taskKey({ taskId: t.taskId, revision: t.revision, contentSha256: t.contentSha256 }) === taskKey(ref));
    if (!task) {
      const artifact = await readArtifact({ projectDir, kind: 'task', artifactId: ref.taskId, revision: ref.revision, contentSha256: ref.contentSha256 });
      if (!artifact) { add('missing_task', 'The exact task revision is unavailable: ' + taskKey(ref)); continue; }
      if (artifact.kind !== 'task') fail('Expected a task revision.'); task = artifact; tasks.push(task);
    }
    if (task.maturity !== 'defined') add('task_incomplete', 'Task definition is ' + task.maturity + ': ' + task.review.gaps.join('; '));
    if (!task.casePlan) add('uncompiled_task', 'The task has no executable case plan; original scope remains selected.');
    if (task.applicability.state !== 'applicable') add('task_applicability', task.applicability.reason);
    for (const issue of task.risks.unresolvedSideEffects) add('unresolved_side_effect', issue);
    for (const source of await unavailableSources(task)) add('task_source_unavailable', source.sourceId + ': ' + source.issue);
    for (const goal of request.scope.baseline.cases.find(c => c.id === item.caseId)!.goals) {
      const bindings = task.ruleBindings.find(b => b.goalId === goal.id)?.ruleRefs ?? [];
      if (!bindings.length) add('missing_rule', 'No exact rule reference is bound to this goal.', goal.id);
      for (const ruleRef of bindings) {
        let rule = rules.find(r => r.ruleId === ruleRef.ruleId && r.revision === ruleRef.revision && r.contentSha256 === ruleRef.contentSha256);
        if (!rule) {
          const artifact = await readArtifact({ projectDir, kind: 'rule', artifactId: ruleRef.ruleId, revision: ruleRef.revision, contentSha256: ruleRef.contentSha256 });
          if (!artifact) { add('missing_rule', 'The exact rule revision is unavailable: ' + ruleRef.ruleId + '@' + ruleRef.revision, goal.id); continue; }
          if (artifact.kind !== 'rule') fail('Expected a rule revision.'); rule = artifact; rules.push(rule);
        }
        if (rule.confirmation.state === 'pending' || rule.confirmation.state === 'conflict') add('unconfirmed_rule', 'Rule confirmation is ' + rule.confirmation.state + '.', goal.id);
        for (const source of await unavailableSources(rule)) add('rule_source_unavailable', rule.ruleId + '@' + rule.revision + ': ' + source.issue, goal.id);
      }
    }
  }
  return { tasks, rules, gaps };
}

function buildSelection(request: SelectionRequest, sourceStates: SourceGoalState[], assetGaps: CoverageGap[]): RegressionSelection {
  const selectedCaseIds: string[] = [], matchedGoalRefs: GoalRef[] = [], plannedGoalRefs: GoalRef[] = [], caseMatches: RegressionSelection['caseMatches'] = [], notSelected: RegressionSelection['notSelected'] = [];
  const gaps: CoverageGap[] = [...request.scope.gaps.map(g => ({ ...g, code: 'declared_scope_gap' })), ...assetGaps];
  for (const c of request.scope.baseline.cases) {
    const refs = c.goals.map(g => ({ caseId: c.id, goalId: g.id }));
    const states = sourceStates.filter(s => s.caseId === c.id);
    const matched = states.filter(s => s.status !== null && request.statuses.includes(s.status)).map(({ caseId, goalId }) => ({ caseId, goalId }));
    const unassessed = states.filter(s => s.sourceMapped && s.status === null).map(({ caseId, goalId }) => ({ caseId, goalId }));
    if (request.source) for (const state of states) {
      if (!state.sourceMapped) gaps.push({ caseId: state.caseId, goalId: state.goalId, code: 'missing_source_mapping', reason: 'No explicit mapping to a source goal; no status is inferred.' });
      else if (state.status === null) gaps.push({ caseId: state.caseId, goalId: state.goalId, code: 'unassessed', reason: 'The fixed source snapshot has no formal assessment for this goal; this is not a fifth business status.' });
    }
    const selected = request.mode === 'full' || matched.length > 0 || (request.includeUnassessedCases && unassessed.length > 0);
    if (selected) {
      selectedCaseIds.push(c.id); matchedGoalRefs.push(...matched); plannedGoalRefs.push(...refs);
      caseMatches.push({ caseId: c.id, matchedGoalRefs: matched, unassessedGoalRefs: unassessed,
        reason: request.mode === 'full' ? 'full_scope' : matched.length ? 'status_match' : 'explicit_unassessed' });
    } else notSelected.push({ caseId: c.id, goalRefs: refs, reason: 'No selected formal status matched and the explicit unassessed option did not select this case. No current result is created.' });
  }
  const body = { regressionVersion: 1 as const, request, scopeSha256: canonicalHash(request.scope), matchPolicy: 'any_goal' as const,
    sourceStates, assetGaps, selectedCaseIds, matchedGoalRefs, plannedGoalRefs, caseMatches, notSelected, gaps };
  return { ...body, selectionSha256: canonicalHash(body) };
}

export async function selectRegression({ projectDir, request: input }: { projectDir: unknown; request: unknown }): Promise<RegressionSelection> {
  const request = parseSelectionRequest(input), assets = await readScopeAssets(projectDir, request);
  const source = request.source ? await readSourceRun(request.source.runDir, { resultsRevision: request.source.resultsRevision }) : null;
  if (source && request.source && (source.manifest.runId !== request.source.runId || source.baselineSha256 !== request.source.baselineSha256 || source.resultsSha256 !== request.source.resultsSha256)) fail('Source run identity, baseline or fixed results prefix hash mismatch.');
  if (source && source.baseline.project !== request.scope.baseline.project) fail('Source run and scope belong to different projects.');
  const states = request.scope.baseline.cases.flatMap(c => c.goals.map(g => {
    const mapping = request.source?.goalMappings.find(m => m.caseId === c.id && m.goalId === g.id);
    if (!mapping || !source) return { caseId: c.id, goalId: g.id, status: null, sourceMapped: false };
    const sourceCase = source.checked.cases.find(sc => sc.id === mapping.sourceCaseId);
    if (!sourceCase?.goals.some(sg => sg.id === mapping.sourceGoalId)) fail('Source mapping names an unknown source goal.');
    return { caseId: c.id, goalId: g.id, status: sourceCase.assessments.find(a => a.goalId === mapping.sourceGoalId)?.status ?? null, sourceMapped: true };
  }));
  return buildSelection(request, states, assets.gaps);
}

/** Validates a frozen selection without consulting mutable sources. Creation re-reads actual sources. */
export function parseSelection(value: unknown): RegressionSelection {
  assertClosed(value, ['regressionVersion', 'request', 'scopeSha256', 'matchPolicy', 'sourceStates', 'assetGaps', 'selectedCaseIds', 'matchedGoalRefs', 'plannedGoalRefs', 'caseMatches', 'notSelected', 'gaps', 'selectionSha256'], 'regression selection');
  const request = parseSelectionRequest(value.request);
  const states: SourceGoalState[] = arrayValue(value.sourceStates, 'source goal states').map(item => {
    assertClosed(item, ['caseId', 'goalId', 'status', 'sourceMapped'], 'source goal state');
    return { ...parseGoalRef({ caseId: item.caseId, goalId: item.goalId }), status: item.status === null ? null : oneOf(item.status, statusValues, 'source formal status'), sourceMapped: bool(item.sourceMapped, 'sourceMapped') };
  });
  const expectedKeys = request.scope.baseline.cases.flatMap(c => c.goals.map(g => goalKey({ caseId: c.id, goalId: g.id })));
  if (canonical(states.map(goalKey)) !== canonical(expectedKeys)) fail('Source states must cover the entire declared scope in stable order.');
  for (const state of states) {
    const mapped = request.source?.goalMappings.some(m => goalKey(m) === goalKey(state)) ?? false;
    if (state.sourceMapped !== mapped || (!state.sourceMapped && state.status !== null)) fail('Invalid source state mapping.');
  }
  const assetGaps = arrayValue(value.assetGaps, 'asset gaps').map(item => {
    assertClosed(item, ['caseId', 'goalId', 'code', 'reason'], 'asset gap');
    const caseId = safeIdentifier(item.caseId), goalId = item.goalId === null ? null : safeIdentifier(item.goalId);
    if (!request.scope.baseline.cases.some(c => c.id === caseId && (goalId === null || c.goals.some(g => g.id === goalId)))) fail('Asset gap names an unknown scope goal.');
    return { caseId, goalId, code: textValue(item.code, 'gap code'), reason: textValue(item.reason, 'gap reason') };
  });
  const expected = buildSelection(request, states, assetGaps);
  if (canonical(expected) !== canonical(value)) fail('Frozen selection content/hash or derived selection set mismatch.');
  return expected;
}
