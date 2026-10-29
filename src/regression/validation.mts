import path from 'node:path';
import { assertClosed, canonicalHash, fail, safeIdentifier } from '../core/common.mjs';
import { arrayValue, integer, oneOf, sha256Value, strings, textValue, timeValue, uniqueStrings } from '../core/validation.mjs';
import { normalizeCases } from '../core/baseline.mjs';
import { requiredRefs } from '../contracts/targets.mjs';
import type { ArtifactCommitRequest, ArtifactDraft, RuleDraft, RuleRef, SourceRef, StoredArtifact, StoredRule, StoredTask, TaskDraft, TaskRef } from './model.mjs';

function absolute(value: unknown, label: string): string {
  const result = textValue(value, label);
  if (!path.isAbsolute(result) || result.includes('\0')) fail(label + ' must be an absolute path.');
  return result;
}
export function parseRuleRef(value: unknown): RuleRef {
  assertClosed(value, ['ruleId', 'revision', 'contentSha256'], 'rule reference');
  return { ruleId: safeIdentifier(value.ruleId), revision: integer(value.revision, 'rule revision', 1), contentSha256: sha256Value(value.contentSha256) };
}
export function parseTaskRef(value: unknown): TaskRef {
  assertClosed(value, ['taskId', 'revision', 'contentSha256'], 'task reference');
  return { taskId: safeIdentifier(value.taskId), revision: integer(value.revision, 'task revision', 1), contentSha256: sha256Value(value.contentSha256) };
}
export function parseSourceRef(value: unknown): SourceRef {
  assertClosed(value, ['id', 'runDir', 'runId', 'baselineSha256', 'resultsRevision', 'resultsSha256', 'caseId', 'goalId', 'observationIds', 'actionIds', 'evidence'], 'historical source reference');
  const evidence = arrayValue(value.evidence, 'source evidence').map(item => {
    assertClosed(item, ['evidenceId', 'sha256'], 'source evidence');
    return { evidenceId: safeIdentifier(item.evidenceId), sha256: sha256Value(item.sha256) };
  });
  if (new Set(evidence.map(e => e.evidenceId)).size !== evidence.length) fail('Duplicate source evidence ID.');
  return { id: safeIdentifier(value.id), runDir: absolute(value.runDir, 'source runDir'), runId: textValue(value.runId, 'source runId'),
    baselineSha256: sha256Value(value.baselineSha256), resultsRevision: integer(value.resultsRevision, 'source resultsRevision'), resultsSha256: sha256Value(value.resultsSha256),
    caseId: safeIdentifier(value.caseId), goalId: safeIdentifier(value.goalId), observationIds: uniqueStrings(value.observationIds, 'source observations', true), actionIds: uniqueStrings(value.actionIds, 'source actions', true), evidence };
}
const ruleKeys = ['kind', 'ruleId', 'statement', 'scope', 'source', 'confirmation', 'supersedes', 'reason'] as const;
const taskKeys = ['kind', 'taskId', 'title', 'maturity', 'review', 'applicability', 'casePlan', 'ruleBindings', 'sourceRefs', 'goalMappings', 'pathKnowledge', 'dataConstraints', 'risks', 'auxiliaryActions', 'supersedes', 'reason'] as const;
const metadataKeys = ['regressionVersion', 'revision', 'operationId', 'expectedRevision', 'payloadSha256', 'contentSha256', 'recordedAt', 'timeSource'] as const;

function parseRule(value: unknown): RuleDraft {
  assertClosed(value, ruleKeys, 'rule');
  if (value.kind !== 'rule') fail('Expected a rule artifact.');
  assertClosed(value.source, ['kind', 'contentFile', 'locator', 'excerpt', 'version', 'contentSha256'], 'normative source');
  assertClosed(value.confirmation, ['state', 'basis'], 'rule confirmation');
  const confirmation = { state: oneOf(value.confirmation.state, ['explicit', 'confirmed', 'pending', 'conflict'], 'confirmation state'), basis: strings(value.confirmation.basis, 'confirmation basis') };
  if (!confirmation.basis.length) fail('Rule confirmation requires an explicit basis, including unresolved rules.');
  return { kind: 'rule', ruleId: safeIdentifier(value.ruleId), statement: textValue(value.statement, 'rule statement'), scope: strings(value.scope, 'rule scope'),
    source: { kind: oneOf(value.source.kind, ['requirement', 'user_confirmation', 'approved_specification'], 'normative source kind'), contentFile: absolute(value.source.contentFile, 'source contentFile'),
      locator: textValue(value.source.locator, 'source locator'), excerpt: textValue(value.source.excerpt, 'source excerpt'), version: value.source.version === null ? null : textValue(value.source.version, 'source version'), contentSha256: sha256Value(value.source.contentSha256) },
    confirmation, supersedes: value.supersedes === null ? null : parseRuleRef(value.supersedes), reason: textValue(value.reason, 'revision reason') };
}
function parseTask(value: unknown): TaskDraft {
  assertClosed(value, taskKeys, 'task');
  if (value.kind !== 'task') fail('Expected a task artifact.');
  assertClosed(value.review, ['author', 'basis', 'gaps'], 'task review');
  assertClosed(value.applicability, ['state', 'conditions', 'reason', 'replacedBy'], 'task applicability');
  assertClosed(value.dataConstraints, ['requiredRelationships', 'allowedSubstitutions', 'equivalenceRequirements'], 'task data constraints');
  assertClosed(value.risks, ['unresolvedSideEffects', 'idempotencyBasis', 'authorizationToRecheck'], 'task risks');
  const casePlan = value.casePlan === null ? null : normalizeCases({ schemaVersion: 7, project: 'Regression task projection', cases: [value.casePlan] }).cases[0]!;
  const sourceRefs = arrayValue(value.sourceRefs, 'source references').map(parseSourceRef);
  const sourceIds = new Set(sourceRefs.map(s => s.id));
  if (sourceIds.size !== sourceRefs.length) fail('Duplicate source reference ID.');
  const ruleBindings = arrayValue(value.ruleBindings, 'rule bindings').map(item => {
    assertClosed(item, ['goalId', 'ruleRefs'], 'rule binding');
    const ruleRefs = arrayValue(item.ruleRefs, 'rule references').map(parseRuleRef);
    if (new Set(ruleRefs.map(r => r.ruleId + '/' + r.revision)).size !== ruleRefs.length) fail('Duplicate exact rule reference.');
    return { goalId: safeIdentifier(item.goalId), ruleRefs };
  });
  const goalMappings = arrayValue(value.goalMappings, 'goal mappings').map(item => {
    assertClosed(item, ['sourceRefId', 'taskGoalId', 'reason'], 'goal mapping');
    return { sourceRefId: safeIdentifier(item.sourceRefId), taskGoalId: item.taskGoalId === null ? null : safeIdentifier(item.taskGoalId), reason: textValue(item.reason, 'goal mapping reason') };
  });
  const pathKnowledge = arrayValue(value.pathKnowledge, 'path knowledge').map(item => {
    assertClosed(item, ['planRef', 'state', 'sourceRefIds', 'detail', 'gaps'], 'path knowledge');
    return { planRef: textValue(item.planRef, 'plan reference'), state: oneOf(item.state, ['observed', 'required_unreached', 'unknown'], 'path knowledge state'), sourceRefIds: uniqueStrings(item.sourceRefIds, 'path source IDs', true), detail: textValue(item.detail, 'path knowledge detail'), gaps: strings(item.gaps, 'path evidence gaps') };
  });
  const auxiliaryActions = arrayValue(value.auxiliaryActions, 'auxiliary actions').map(item => {
    assertClosed(item, ['purpose', 'intent', 'conditions', 'limits'], 'auxiliary action');
    return { purpose: oneOf(item.purpose, ['preparation', 'exploration', 'recovery', 'cleanup'], 'auxiliary action purpose'), intent: textValue(item.intent, 'auxiliary intent'), conditions: strings(item.conditions, 'auxiliary conditions'), limits: strings(item.limits, 'auxiliary limits') };
  });
  const result: TaskDraft = { kind: 'task', taskId: safeIdentifier(value.taskId), title: textValue(value.title, 'task title'), maturity: oneOf(value.maturity, ['candidate', 'incomplete', 'defined'], 'task maturity'),
    review: { author: textValue(value.review.author, 'review author'), basis: textValue(value.review.basis, 'review basis'), gaps: strings(value.review.gaps, 'definition gaps') },
    applicability: { state: oneOf(value.applicability.state, ['applicable', 'uncertain', 'inapplicable'], 'applicability state'), conditions: strings(value.applicability.conditions, 'applicability conditions'), reason: textValue(value.applicability.reason, 'applicability reason'), replacedBy: value.applicability.replacedBy === null ? null : parseTaskRef(value.applicability.replacedBy) },
    casePlan, ruleBindings, sourceRefs, goalMappings, pathKnowledge,
    dataConstraints: { requiredRelationships: strings(value.dataConstraints.requiredRelationships, 'required relationships'), allowedSubstitutions: strings(value.dataConstraints.allowedSubstitutions, 'allowed substitutions'), equivalenceRequirements: strings(value.dataConstraints.equivalenceRequirements, 'equivalence requirements') },
    risks: { unresolvedSideEffects: strings(value.risks.unresolvedSideEffects, 'unresolved side effects'), idempotencyBasis: strings(value.risks.idempotencyBasis, 'idempotency basis'), authorizationToRecheck: strings(value.risks.authorizationToRecheck, 'authorization to recheck') },
    auxiliaryActions, supersedes: value.supersedes === null ? null : parseTaskRef(value.supersedes), reason: textValue(value.reason, 'revision reason') };
  const goals = new Set(casePlan?.goals.map(g => g.id) ?? []), refs = new Set(casePlan ? requiredRefs(casePlan) : []);
  if (new Set(ruleBindings.map(b => b.goalId)).size !== ruleBindings.length) fail('Duplicate goal rule binding.');
  for (const binding of ruleBindings) if (!goals.has(binding.goalId)) fail('Rule binding refers to an unknown task goal.');
  for (const mapping of goalMappings) {
    if (!sourceIds.has(mapping.sourceRefId)) fail('Goal mapping refers to an unknown source.');
    if (mapping.taskGoalId !== null && !goals.has(mapping.taskGoalId)) fail('Goal mapping refers to an unknown task goal.');
  }
  if (new Set(goalMappings.map(m => m.sourceRefId)).size !== goalMappings.length) fail('Duplicate source goal mapping.');
  if (sourceRefs.some(s => !goalMappings.some(m => m.sourceRefId === s.id))) fail('Each historical source goal needs a mapping or an explicit unmapped reason.');
  if (new Set(pathKnowledge.map(p => p.planRef)).size !== pathKnowledge.length) fail('Duplicate path knowledge plan reference.');
  for (const p of pathKnowledge) {
    if (!refs.has(p.planRef)) fail('Path knowledge refers to an unknown necessary plan reference.');
    if (p.sourceRefIds.some(id => !sourceIds.has(id))) fail('Path knowledge refers to an unknown source.');
    if (p.state === 'observed' && !p.sourceRefIds.length) fail('Observed path knowledge needs a historical source.');
  }
  if (result.maturity === 'defined') {
    if (!casePlan || result.review.gaps.length) fail('Defined tasks require a case plan and no unresolved definition gaps.');
    if (casePlan.goals.some(g => g.clarificationQuestions?.length)) fail('Defined tasks cannot contain unresolved goal clarification questions.');
    if (casePlan.goals.some(g => !ruleBindings.some(b => b.goalId === g.id && b.ruleRefs.length))) fail('Every defined task goal requires exact normative rule bindings.');
    if ([...refs].some(ref => !pathKnowledge.some(p => p.planRef === ref))) fail('Defined tasks must describe the knowledge boundary for every necessary plan reference.');
  } else if (!result.review.gaps.length) fail('Candidate and incomplete tasks must explain their definition gaps.');
  return result;
}
export function parseArtifactDraft(value: unknown): ArtifactDraft {
  assertClosed(value, [...ruleKeys, ...taskKeys], 'regression artifact');
  return value.kind === 'rule' ? parseRule(value) : parseTask(value);
}
export function parseArtifactRequest(value: unknown): ArtifactCommitRequest {
  assertClosed(value, ['regressionVersion', 'operationId', 'expectedRevision', 'artifact'], 'artifact request');
  if (value.regressionVersion !== 1) fail('Unsupported regressionVersion. Existing assets are not migrated.');
  return { regressionVersion: 1, operationId: safeIdentifier(value.operationId), expectedRevision: integer(value.expectedRevision, 'expected artifact revision'), artifact: parseArtifactDraft(value.artifact) };
}
export function parseStoredArtifact(value: unknown): StoredArtifact {
  assertClosed(value, [...ruleKeys, ...taskKeys, ...metadataKeys], 'stored regression artifact');
  const draft = parseArtifactDraft(Object.fromEntries(Object.entries(value).filter(([key]) => !metadataKeys.includes(key as typeof metadataKeys[number]))));
  if (value.regressionVersion !== 1 || value.timeSource !== 'local_transaction_clock') fail('Invalid stored regression version or time source.');
  const result: StoredArtifact = { ...draft, regressionVersion: 1, revision: integer(value.revision, 'artifact revision', 1), operationId: safeIdentifier(value.operationId), expectedRevision: integer(value.expectedRevision, 'expected artifact revision'),
    payloadSha256: sha256Value(value.payloadSha256), contentSha256: sha256Value(value.contentSha256), recordedAt: timeValue(value.recordedAt, 'recordedAt'), timeSource: 'local_transaction_clock' };
  if (result.revision !== result.expectedRevision + 1 || canonicalHash(draft) !== result.contentSha256) fail('Stored artifact content hash or revision mismatch.');
  if (canonicalHash({ regressionVersion: 1, operationId: result.operationId, expectedRevision: result.expectedRevision, artifact: draft }) !== result.payloadSha256) fail('Stored artifact request hash mismatch.');
  return result;
}
export function parseStoredRule(value: unknown): StoredRule { const result = parseStoredArtifact(value); if (result.kind !== 'rule') fail('Expected stored rule.'); return result; }
export function parseStoredTask(value: unknown): StoredTask { const result = parseStoredArtifact(value); if (result.kind !== 'task') fail('Expected stored task.'); return result; }
export function validateArtifact(value: unknown): { structurallyValid: true; artifact: ArtifactDraft } { return { structurallyValid: true, artifact: parseArtifactDraft(value) }; }
