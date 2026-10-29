/** Frozen snapshots bind a new run. Current readiness and authorization remain explicit AI declarations. */
import fs from 'node:fs/promises';
import type { Baseline, Case } from '../contracts/model.mjs';
import type { StoredRule, StoredTask } from './model.mjs';
import { normalizeCases } from '../core/baseline.mjs';
import { assertClosed, canonical, canonicalHash, fail, hash, inside, json, safeIdentifier, safePath } from '../core/common.mjs';
import { arrayValue, oneOf, sha256Value, textValue, timeValue, uniqueStrings } from '../core/validation.mjs';
import { parseStoredRule, parseStoredTask } from './validation.mjs';
import { verifySourceRef } from './sources.mjs';
import { parseSelection, readScopeAssets, selectRegression, taskKey } from './selection.mjs';
import type { CoverageGap, RegressionSelection } from './selection.mjs';

export interface ConditionDeclaration {
  id: string; caseIds: string[]; aspect: 'identity' | 'environment' | 'data' | 'authorization' | 'path' | 'other';
  state: 'verified' | 'pending' | 'deferred'; statement: string;
  source: { kind: 'ai_declaration' | 'current_user_statement' | 'current_evidence'; locator: string; file: string | null; sha256: string | null };
}
export interface CurrentConditions { declaredBy: string; declaredAt: string; forCurrentRun: true; items: ConditionDeclaration[] }
export interface BindingRequest {
  regressionVersion: 1; selection: RegressionSelection;
  caseMappings: { scopeCaseId: string; runCaseId: string }[];
  deferredCases: { caseId: string; reason: string }[]; conditions: CurrentConditions;
}
export interface RegressionBinding extends BindingRequest {
  runId: string; baselineSha256: string; tasks: StoredTask[]; rules: StoredRule[];
  coverage: { requestedCases: number; requestedGoals: number; selectedCases: number; selectedGoals: number; compiledCases: number; compiledGoals: number; notSelectedCases: number; gaps: CoverageGap[] };
  caveat: string; contentSha256: string;
}

function parseConditions(value: unknown, selected: ReadonlySet<string>): CurrentConditions {
  assertClosed(value, ['declaredBy', 'declaredAt', 'forCurrentRun', 'items'], 'current conditions');
  if (value.forCurrentRun !== true) fail('Conditions must be explicitly declared for this new run; historical readiness is not inherited.');
  const items = arrayValue(value.items, 'condition declarations').map(item => {
    assertClosed(item, ['id', 'caseIds', 'aspect', 'state', 'statement', 'source'], 'condition declaration');
    assertClosed(item.source, ['kind', 'locator', 'file', 'sha256'], 'condition provenance');
    const caseIds = uniqueStrings(item.caseIds, 'condition case IDs', true);
    if (!caseIds.length || caseIds.some(id => !selected.has(id))) fail('Current conditions must refer only to selected cases.');
    const source: ConditionDeclaration['source'] = {
      kind: oneOf(item.source.kind, ['ai_declaration', 'current_user_statement', 'current_evidence'], 'condition source kind'),
      locator: textValue(item.source.locator, 'condition source locator'),
      file: item.source.file === null ? null : textValue(item.source.file, 'current evidence file'),
      sha256: item.source.sha256 === null ? null : sha256Value(item.source.sha256)
    };
    if (source.kind === 'current_evidence' ? (!source.file || !source.sha256) : (source.file !== null || source.sha256 !== null)) fail('Current evidence requires an exact retained file/hash; statements may not disguise historical evidence.');
    return { id: safeIdentifier(item.id), caseIds,
      aspect: oneOf(item.aspect, ['identity', 'environment', 'data', 'authorization', 'path', 'other'], 'condition aspect'),
      state: oneOf(item.state, ['verified', 'pending', 'deferred'], 'condition declaration state'), statement: textValue(item.statement, 'condition statement'), source };
  });
  if (new Set(items.map(item => item.id)).size !== items.length) fail('Duplicate condition declaration ID.');
  return { declaredBy: textValue(value.declaredBy, 'condition author'), declaredAt: timeValue(value.declaredAt, 'condition declaration time'), forCurrentRun: true, items };
}
function parseRequest(value: unknown): BindingRequest {
  assertClosed(value, ['regressionVersion', 'selection', 'caseMappings', 'deferredCases', 'conditions'], 'binding request');
  if (value.regressionVersion !== 1) fail('Regression binding requires regressionVersion 1.');
  const selection = parseSelection(value.selection), selected = new Set(selection.selectedCaseIds);
  const caseMappings = arrayValue(value.caseMappings, 'binding case mappings').map(item => {
    assertClosed(item, ['scopeCaseId', 'runCaseId'], 'binding case mapping');
    return { scopeCaseId: safeIdentifier(item.scopeCaseId), runCaseId: safeIdentifier(item.runCaseId) };
  });
  const deferredCases = arrayValue(value.deferredCases, 'deferred cases').map(item => {
    assertClosed(item, ['caseId', 'reason'], 'deferred case');
    return { caseId: safeIdentifier(item.caseId), reason: textValue(item.reason, 'deferred case reason') };
  });
  const accounted = [...caseMappings.map(m => m.scopeCaseId), ...deferredCases.map(item => item.caseId)];
  if (new Set(accounted).size !== accounted.length || accounted.length !== selected.size || accounted.some(id => !selected.has(id))) fail('Every selected case must be compiled or explicitly deferred exactly once; unselected cases cannot be added.');
  if (new Set(caseMappings.map(m => m.runCaseId)).size !== caseMappings.length) fail('Two scope cases cannot be merged into one run case.');
  const conditions = parseConditions(value.conditions, selected);
  for (const mapping of caseMappings) {
    if (!conditions.items.some(item => item.caseIds.includes(mapping.scopeCaseId))) fail('Compiled case lacks a current-run condition declaration: ' + mapping.scopeCaseId);
    if (!conditions.items.some(item => item.caseIds.includes(mapping.scopeCaseId) && item.aspect === 'authorization')) fail('Compiled case must explicitly declare current authorization, including any unresolved limitation.');
  }
  return { regressionVersion: 1, selection,
    caseMappings: selection.selectedCaseIds.flatMap(id => caseMappings.filter(m => m.scopeCaseId === id)),
    deferredCases: selection.selectedCaseIds.flatMap(id => deferredCases.filter(c => c.caseId === id)), conditions };
}
const caseWithId = (c: Case, id: string): Case => ({ ...c, id });
function validateSnapshots(request: BindingRequest, baseline: Baseline, tasks: StoredTask[], rules: StoredRule[]) {
  if (baseline.project !== request.selection.request.scope.baseline.project) fail('Regression baseline project differs from its declared scope.');
  if (baseline.cases.length !== request.caseMappings.length) fail('Run baseline contains extra or omitted cases outside the explicit compilation mapping.');
  if (new Set(tasks.map(t => taskKey(t))).size !== tasks.length || new Set(rules.map(r => r.ruleId + '@' + r.revision)).size !== rules.length) fail('Duplicate frozen task or rule snapshot.');
  const selectedRefs = request.selection.request.scope.taskBindings.filter(b => request.selection.selectedCaseIds.includes(b.caseId)).flatMap(b => b.taskRef ? [taskKey(b.taskRef)] : []);
  if (tasks.some(t => !selectedRefs.includes(taskKey(t)))) fail('Binding includes a task outside its selected exact revisions.');
  const referencedRules = new Set(tasks.flatMap(t => t.ruleBindings.flatMap(b => b.ruleRefs.map(r => r.ruleId + '@' + r.revision + ':' + r.contentSha256))));
  if (rules.some(r => !referencedRules.has(r.ruleId + '@' + r.revision + ':' + r.contentSha256))) fail('Binding includes an unreferenced rule snapshot.');
  for (const mapping of request.caseMappings) {
    const scoped = request.selection.request.scope.baseline.cases.find(c => c.id === mapping.scopeCaseId)!;
    const actual = baseline.cases.find(c => c.id === mapping.runCaseId);
    if (!actual || canonical(actual) !== canonical(caseWithId(scoped, mapping.runCaseId))) fail('Frozen baseline must retain the entire selected case, all goals, necessary steps, conditions, order and path.');
    const ref = request.selection.request.scope.taskBindings.find(b => b.caseId === mapping.scopeCaseId)!.taskRef;
    const task = ref ? tasks.find(t => taskKey(t) === taskKey(ref)) : null;
    if (!task?.casePlan) fail('A compiled case requires its exact task snapshot and a complete case plan; otherwise retain a deferred coverage gap.');
    if (canonical(caseWithId(task.casePlan, scoped.id)) !== canonical(scoped)) fail('Task case plan differs from the frozen scope. Create an explicit new task/scope revision; do not silently remove or rewrite obligations.');
    for (const goal of scoped.goals) {
      const refs = task.ruleBindings.find(b => b.goalId === goal.id)?.ruleRefs ?? [];
      if (!refs.length) fail('Compiled goal has no exact normative rule: ' + scoped.id + '/' + goal.id);
      for (const ruleRef of refs) {
        const rule = rules.find(r => r.ruleId === ruleRef.ruleId && r.revision === ruleRef.revision && r.contentSha256 === ruleRef.contentSha256);
        if (!rule) fail('Compiled goal is missing its exact frozen rule snapshot.');
        if (['pending', 'conflict'].includes(rule.confirmation.state) && !goal.clarificationQuestions?.length) fail('Unconfirmed rules require unresolved goal clarification; they cannot silently become a pass criterion.');
      }
    }
  }
}
function makeBinding(request: BindingRequest, baseline: Baseline, runId: string, tasks: StoredTask[], rules: StoredRule[]): RegressionBinding {
  validateSnapshots(request, baseline, tasks, rules);
  const scope = request.selection.request.scope;
  const coverage = { requestedCases: scope.baseline.cases.length, requestedGoals: scope.baseline.cases.reduce((n, c) => n + c.goals.length, 0),
    selectedCases: request.selection.selectedCaseIds.length, selectedGoals: request.selection.plannedGoalRefs.length,
    compiledCases: baseline.cases.length, compiledGoals: baseline.cases.reduce((n, c) => n + c.goals.length, 0),
    notSelectedCases: request.selection.notSelected.length,
    gaps: [...request.selection.gaps, ...request.deferredCases.map(item => ({ ...item, goalId: null, code: 'selected_not_compiled' }))] };
  const body = { ...request, runId, baselineSha256: hash(json(baseline)), tasks, rules, coverage,
    caveat: 'Conditions are current-run AI declarations with stated provenance, not tool-certified readiness or authorization. Historical task facts are background only. A complete compiled subset does not establish completion of the requested scope.' };
  return { ...body, contentSha256: canonicalHash(body) };
}

export async function prepareBinding({ projectDir, request: input, baseline: baselineInput, runId }: { projectDir: unknown; request: unknown; baseline: unknown; runId: string }): Promise<{ binding: RegressionBinding; bytes: string; sha256: string }> {
  const request = parseRequest(input), baseline = normalizeCases(baselineInput);
  textValue(runId, 'new run ID');
  if (runId === request.selection.request.source?.runId) fail('Regression execution must use an independent new run ID.');
  const refreshed = await selectRegression({ projectDir, request: request.selection.request });
  if (canonical(refreshed) !== canonical(request.selection)) fail('Frozen selection does not match its exact source/assets. Reconcile changes explicitly before binding.');
  const assets = await readScopeAssets(projectDir, request.selection.request);
  const selected = new Set(request.selection.selectedCaseIds);
  const refs = request.selection.request.scope.taskBindings.filter(b => selected.has(b.caseId)).flatMap(b => b.taskRef ? [taskKey(b.taskRef)] : []);
  const tasks = assets.tasks.filter(t => refs.includes(taskKey(t)));
  const compiledRefs = new Set(request.caseMappings.flatMap(m => {
    const ref = request.selection.request.scope.taskBindings.find(b => b.caseId === m.scopeCaseId)?.taskRef;
    return ref ? [taskKey(ref)] : [];
  }));
  for (const task of tasks.filter(t => compiledRefs.has(taskKey(t)))) for (const ref of task.sourceRefs) await verifySourceRef(ref);
  const ruleRefs = new Set(tasks.flatMap(t => t.ruleBindings.flatMap(b => b.ruleRefs.map(r => r.ruleId + '@' + r.revision + ':' + r.contentSha256))));
  const rules = assets.rules.filter(r => ruleRefs.has(r.ruleId + '@' + r.revision + ':' + r.contentSha256));
  const historicalRoots = [...new Set([request.selection.request.source?.runDir, ...tasks.flatMap(t => t.sourceRefs.map(s => s.runDir))].filter((v): v is string => !!v))];
  for (const declaration of request.conditions.items) if (declaration.source.kind === 'current_evidence') {
    const file = await safePath(declaration.source.file, { existing: true });
    if (historicalRoots.some(root => inside(root, file))) fail('Historical run evidence cannot be represented as newly collected current-condition evidence.');
    if (!(await fs.lstat(file)).isFile() || hash(await fs.readFile(file)) !== declaration.source.sha256) fail('Current condition evidence file/hash mismatch.');
  }
  const binding = makeBinding(request, baseline, runId, tasks, rules), bytes = json(binding);
  return { binding, bytes, sha256: hash(bytes) };
}

/** Pure readback: embedded exact snapshots remain verifiable when the external library is moved. */
export function validateBinding(value: unknown, baselineInput: unknown, runId: string): RegressionBinding {
  assertClosed(value, ['regressionVersion', 'selection', 'caseMappings', 'deferredCases', 'conditions', 'runId', 'baselineSha256', 'tasks', 'rules', 'coverage', 'caveat', 'contentSha256'], 'regression binding');
  const request = parseRequest({ regressionVersion: value.regressionVersion, selection: value.selection, caseMappings: value.caseMappings, deferredCases: value.deferredCases, conditions: value.conditions });
  if (value.runId !== runId || runId === request.selection.request.source?.runId) fail('Regression binding run identity mismatch.');
  const tasks = arrayValue(value.tasks, 'frozen task snapshots').map(parseStoredTask), rules = arrayValue(value.rules, 'frozen rule snapshots').map(parseStoredRule);
  const expected = makeBinding(request, normalizeCases(baselineInput), runId, tasks, rules);
  if (canonical(expected) !== canonical(value)) fail('Regression binding content/hash or coverage mismatch.');
  return expected;
}
