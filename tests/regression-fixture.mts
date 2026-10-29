import type { TestContext } from 'node:test';
import type { Baseline, Case } from '../src/contracts/model.mjs';
import type { RuleRef, TaskDraft, TaskRef } from '../src/regression/model.mjs';
import type { BindingRequest } from '../src/regression/binding.mjs';
import type { RegressionSelection, SelectionRequest } from '../src/regression/selection.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { canonicalHash, hash } from '../src/core/common.mjs';
import { requiredRefs } from '../src/contracts/targets.mjs';
import { commitArtifact } from '../src/regression/store.mjs';
import { normalizeCases } from '../src/core/baseline.mjs';
import { fixture, readJSON, caseOf } from './goals-fixture.mjs';

export function taskDraft(c: Case, ruleRef: RuleRef): TaskDraft {
  return { kind: 'task', taskId: 'task-' + c.id, title: c.title, maturity: 'defined', review: { author: 'Synthetic AI fixture', basis: 'Explicit synthetic requirement and complete obligations.', gaps: [] },
    applicability: { state: 'applicable', conditions: ['Synthetic isolated resource only'], reason: 'This fixture defines the intended conditions; it does not authorize real business execution.', replacedBy: null },
    casePlan: c, ruleBindings: c.goals.map(g => ({ goalId: g.id, ruleRefs: [ruleRef] })), sourceRefs: [], goalMappings: [],
    pathKnowledge: requiredRefs(c).map(planRef => ({ planRef, state: 'required_unreached', sourceRefIds: [], detail: 'Required by the synthetic case; no browser traversal is claimed.', gaps: [] })),
    dataConstraints: { requiredRelationships: ['Isolated fixture'], allowedSubstitutions: ['A newly created equivalent synthetic object'], equivalenceRequirements: ['The original relationship and initial state must hold.'] },
    risks: { unresolvedSideEffects: [], idempotencyBasis: [], authorizationToRecheck: ['Current execution authorization'] }, auxiliaryActions: [], supersedes: null, reason: 'Initial synthetic regression task.' };
}
export function fullSelectionRequest(baseline: Baseline, taskRefs: (TaskRef | null)[]): SelectionRequest {
  return { regressionVersion: 1, mode: 'full', scope: { scopeId: 'synthetic-scope', version: '2026-10-30.1', baseline,
    taskBindings: baseline.cases.map((c, i) => ({ caseId: c.id, taskRef: taskRefs[i] ?? null })), gaps: [] }, source: null, statuses: [], includeUnassessedCases: false };
}
export function bindingRequest(selection: RegressionSelection): BindingRequest {
  return { regressionVersion: 1, selection, caseMappings: selection.selectedCaseIds.map(id => ({ scopeCaseId: id, runCaseId: id })), deferredCases: [],
    conditions: { declaredBy: 'Synthetic reviewer', declaredAt: '2026-10-30T00:00:00Z', forCurrentRun: true, items: selection.selectedCaseIds.map(id => ({ id: 'authorization-' + id, caseIds: [id], aspect: 'authorization', state: 'verified', statement: 'Authorized only for local synthetic fixture validation in this run.', source: { kind: 'current_user_statement', locator: 'Synthetic test authorization', file: null, sha256: null } })) } };
}
export async function regressionFixture(t: TestContext, cases = [caseOf(), caseOf('two')]) {
  const f = await fixture(t, cases), baseline = normalizeCases(await readJSON(f.casesFile));
  const contentFile = path.join(f.projectDir, 'synthetic-requirement.txt'), content = 'Saved data can be independently read. Unknown capacity must not mean idle.';
  await fs.writeFile(contentFile, content);
  const rule = { kind: 'rule' as const, ruleId: 'synthetic-rule', statement: content, scope: ['Synthetic local fixture'],
    source: { kind: 'requirement' as const, contentFile, locator: 'Synthetic requirement paragraph 1', excerpt: content, version: '1', contentSha256: hash(content) },
    confirmation: { state: 'explicit' as const, basis: ['Synthetic fixture requirement.'] }, supersedes: null, reason: 'Initial synthetic rule.' };
  const receipt = await commitArtifact({ projectDir: f.projectDir, request: { regressionVersion: 1, operationId: 'rule-create', expectedRevision: 0, artifact: rule } });
  const ruleRef: RuleRef = { ruleId: rule.ruleId, revision: receipt.revision, contentSha256: receipt.contentSha256 };
  const taskRefs: TaskRef[] = [];
  for (const c of baseline.cases) {
    const draft = taskDraft(c, ruleRef), saved = await commitArtifact({ projectDir: f.projectDir, request: { regressionVersion: 1, operationId: 'task-create-' + c.id, expectedRevision: 0, artifact: draft } });
    taskRefs.push({ taskId: draft.taskId, revision: saved.revision, contentSha256: saved.contentSha256 });
  }
  return { ...f, baseline, rule, ruleRef, taskRefs, selectionRequest: fullSelectionRequest(baseline, taskRefs), emptyResultsSha256: canonicalHash({ schemaVersion: 7, revision: 0, entries: [] }) };
}
