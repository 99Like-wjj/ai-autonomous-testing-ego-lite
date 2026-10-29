import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ArtifactDraft, ArtifactCommitRequest, RuleDraft, RuleRef, SourceRef, TaskDraft } from '../src/regression/model.mjs';
import type { ActionEvent, RunContext } from '../src/contracts/model.mjs';
import { SOURCE_ROOT, canonicalHash, hash } from '../src/core/common.mjs';
import { requiredRefs } from '../src/contracts/targets.mjs';
import { commitArtifact, readArtifact, readLibrary, validateArtifactRequest } from '../src/regression/store.mjs';
import { inspectArtifactSources, readSourceRun, sourceContext, verifySourceRef } from '../src/regression/sources.mjs';
import { parseArtifactRequest, parseStoredArtifact, validateArtifact } from '../src/regression/validation.mjs';
import { fixture, caseOf, addEvidence, observed, record, untested, writeJSON } from './goals-fixture.mjs';
import type { Fixture } from './goals-fixture.mjs';

const request = (artifact: ArtifactDraft, operationId = 'commit-1', expectedRevision = 0): ArtifactCommitRequest => ({ regressionVersion: 1, operationId, expectedRevision, artifact });
async function ruleOf(f: Fixture, ruleId = 'saved-rule'): Promise<RuleDraft> {
  const content = 'Synthetic requirement: saved data is returned; unknown capacity must not be reported as idle.\n';
  const contentFile = path.join(f.projectDir, 'requirement.txt'); await fs.writeFile(contentFile, content);
  return { kind: 'rule', ruleId, statement: 'Saved data is independently returned and unknown capacity stays unknown.', scope: ['Synthetic grouped scene'],
    source: { kind: 'requirement', contentFile, locator: 'line 1', excerpt: 'saved data is returned; unknown capacity must not be reported as idle.', version: null, contentSha256: hash(content) },
    confirmation: { state: 'explicit', basis: ['Literal synthetic requirement; unknown document version is retained as null.'] }, supersedes: null, reason: 'Initial normative snapshot.' };
}
function candidate(taskId = 'candidate'): TaskDraft {
  return { kind: 'task', taskId, title: 'Synthetic unknown behavior to clarify', maturity: 'candidate', review: { author: 'Synthetic AI reviewer', basis: 'No normative criterion is available yet.', gaps: ['Obtain a trustworthy expected result.'] },
    applicability: { state: 'uncertain', conditions: ['Recheck current environment and authorization.'], reason: 'Current conditions have not been checked.', replacedBy: null },
    casePlan: null, ruleBindings: [], sourceRefs: [], goalMappings: [], pathKnowledge: [],
    dataConstraints: { requiredRelationships: [], allowedSubstitutions: [], equivalenceRequirements: [] },
    risks: { unresolvedSideEffects: [], idempotencyBasis: [], authorizationToRecheck: ['This artifact is not execution authorization.'] }, auxiliaryActions: [], supersedes: null, reason: 'Preserve a candidate without inventing expected behavior.' };
}
function defined(ref: RuleRef): TaskDraft {
  const plan = caseOf();
  return { ...candidate('defined-task'), title: 'Synthetic saved-value and capacity regression', maturity: 'defined', review: { author: 'Synthetic AI reviewer', basis: 'Original criteria and necessary semantics are known; historical path is not claimed complete.', gaps: [] },
    casePlan: plan, ruleBindings: plan.goals.map(g => ({ goalId: g.id, ruleRefs: [ref] })),
    pathKnowledge: requiredRefs(plan).map(planRef => ({ planRef, state: 'required_unreached', sourceRefIds: [], detail: 'Required by the normative plan but not verified by a live test.', gaps: ['No real browser verification has been performed.'] })) };
}
async function ruleRef(f: Fixture): Promise<RuleRef> {
  const rule = await ruleOf(f), committed = await commitArtifact({ projectDir: f.projectDir, request: request(rule, 'rule-1') });
  return { ruleId: rule.ruleId, revision: committed.revision, contentSha256: committed.contentSha256 };
}
async function sourceRef(f: Fixture, evidenceId: string): Promise<SourceRef> {
  const source = await readSourceRun(f.runDir);
  const evidence = source.checked.evidenceCatalog.items.find(e => e.id === evidenceId)!;
  return { id: 'first-observation', runDir: source.runDir, runId: source.manifest.runId, baselineSha256: source.baselineSha256, resultsRevision: source.results.revision,
    resultsSha256: source.resultsSha256, caseId: 'one', goalId: 'saved', observationIds: ['readback'], actionIds: [], evidence: [{ evidenceId, sha256: evidence.sha256 }] };
}

test('immutable revisions preserve prior bytes, recover lost receipts, and reject stale or reused operations', async t => {
  const f = await fixture(t), draft = await ruleOf(f), firstRequest = request(draft, 'rule-first');
  await assert.rejects(commitArtifact({ projectDir: f.projectDir, request: firstRequest }, { afterCommit: async () => { throw new Error('Synthetic lost receipt'); } }), /lost receipt/);
  const firstFile = path.join(f.projectDir, 'regression/rules/saved-rule/1.json'), firstBytes = await fs.readFile(firstFile, 'utf8');
  const recovered = await commitArtifact({ projectDir: f.projectDir, request: firstRequest }); assert.equal(recovered.replayed, true);
  await assert.rejects(commitArtifact({ projectDir: f.projectDir, request: request({ ...draft, reason: 'Different request' }, 'rule-first') }), /different content/);
  await assert.rejects(commitArtifact({ projectDir: f.projectDir, request: request(draft, 'stale') }), /revision conflict/);
  const next = { ...draft, reason: 'Correct wording without changing the retained source.', statement: 'Synthetic corrected interpretation of the same normative rule.', supersedes: { ruleId: draft.ruleId, revision: recovered.revision, contentSha256: recovered.contentSha256 } };
  const second = await commitArtifact({ projectDir: f.projectDir, request: request(next, 'rule-second', 1) }); assert.equal(second.revision, 2);
  assert.equal(await fs.readFile(firstFile, 'utf8'), firstBytes);
  const library = await readLibrary(f.projectDir); assert.deepEqual(library.rules.map(r => r.revision), [1, 2]);
  assert.equal((await readArtifact({ projectDir: f.projectDir, kind: 'rule', artifactId: draft.ruleId, revision: 1, contentSha256: recovered.contentSha256 }))?.revision, 1);
  await assert.rejects(readArtifact({ projectDir: f.projectDir, kind: 'rule', artifactId: draft.ruleId, revision: 1, contentSha256: 'a'.repeat(64) }), /reference mismatch/);
  assert.equal(await readArtifact({ projectDir: f.projectDir, kind: 'task', artifactId: 'missing', revision: 1 }), null);
});

test('normative sources verify actual content and reject historical observation source types', async t => {
  const f = await fixture(t), draft = await ruleOf(f);
  assert.throws(() => validateArtifact({ ...draft, source: { ...draft.source, kind: 'observation' } }), /normative source kind/);
  await assert.rejects(commitArtifact({ projectDir: f.projectDir, request: request({ ...draft, source: { ...draft.source, contentSha256: 'a'.repeat(64) } }) }), /source content hash mismatch/);
  await assert.rejects(commitArtifact({ projectDir: f.projectDir, request: request({ ...draft, source: { ...draft.source, excerpt: 'Invented absent requirement.' } }) }), /excerpt is not present/);
  await assert.rejects(commitArtifact({ projectDir: f.projectDir, request: request({ ...draft, source: { ...draft.source, contentFile: path.join(f.projectDir, 'missing.txt') } }) }), /ENOENT/);
  assert.equal((await readLibrary(f.projectDir)).rules.length, 0);
});

test('read-only artifact validation checks references without creating a library or claiming semantic readiness', async t => {
  const f = await fixture(t), draft = await ruleOf(f), input = request(draft);
  const checked = await validateArtifactRequest({ projectDir: f.projectDir, request: input });
  assert.equal(checked.structurallyValid, true); assert.equal(checked.referencesChecked, true); assert.equal(checked.alreadyCommitted, false);
  assert.equal('semanticReady' in checked, false); await assert.rejects(fs.lstat(path.join(f.projectDir, 'regression')), /ENOENT/);
  await assert.rejects(validateArtifactRequest({ projectDir: f.projectDir, request: request({ ...draft, source: { ...draft.source, contentSha256: 'f'.repeat(64) } }) }), /source content hash mismatch/);
  const committed = await commitArtifact({ projectDir: f.projectDir, request: input });
  await assert.rejects(validateArtifactRequest({ projectDir: f.projectDir, request: request(draft, 'stale-validation') }), /revision conflict/);
  await fs.unlink(draft.source.contentFile);
  const snapshot = await readArtifact({ projectDir: f.projectDir, kind: 'rule', artifactId: draft.ruleId, revision: 1 }); assert.ok(snapshot);
  const availability = await inspectArtifactSources(snapshot); assert.equal(availability[0]!.referenceStatus, 'unavailable'); assert.match(availability[0]!.issue!, /ENOENT/);
  await assert.rejects(validateArtifactRequest({ projectDir: f.projectDir, request: input }), /ENOENT/);
  const replay = await commitArtifact({ projectDir: f.projectDir, request: input }); assert.equal(replay.replayed, true); assert.equal(replay.contentSha256, committed.contentSha256);
});

test('candidate tasks retain unknown expected behavior while defined tasks require complete rule bindings', async t => {
  const f = await fixture(t), draft = candidate();
  const receipt = await commitArtifact({ projectDir: f.projectDir, request: request(draft) }); assert.equal(receipt.revision, 1);
  const stored = await readArtifact({ projectDir: f.projectDir, kind: 'task', artifactId: draft.taskId, revision: 1 });
  assert.ok(stored?.kind === 'task'); assert.equal(stored.casePlan, null); assert.equal(stored.maturity, 'candidate');
  assert.throws(() => validateArtifact({ ...draft, maturity: 'defined', review: { ...draft.review, gaps: [] } }), /Defined tasks require/);
  const complete = defined(await ruleRef(f));
  assert.throws(() => validateArtifact({ ...complete, ruleBindings: complete.ruleBindings.slice(1) }), /Every defined task goal/);
  assert.throws(() => validateArtifact({ ...complete, pathKnowledge: [] }), /every necessary plan reference/);
  assert.throws(() => validateArtifact({ ...complete, review: { ...complete.review, gaps: ['Rule is ambiguous.'] } }), /no unresolved definition gaps/);
  complete.casePlan!.goals[0]!.clarificationQuestions = ['What is the expected value?'];
  assert.throws(() => validateArtifact(complete), /unresolved goal clarification/);
});

test('a historically failed task can be defined while applicability, source verdict, and execution remain separate', async t => {
  const f = await fixture(t), ref = await ruleRef(f), evidence = await addEvidence(f);
  await record(f, observed(evidence.evidenceId, 'violation'));
  const source = await sourceRef(f, evidence.evidenceId), draft = defined(ref);
  draft.sourceRefs = [source]; draft.goalMappings = [{ sourceRefId: source.id, taskGoalId: 'saved', reason: 'Same original goal; its previous violation remains historical.' }];
  draft.pathKnowledge[0] = { ...draft.pathKnowledge[0]!, state: 'observed', sourceRefIds: [source.id], detail: 'Recorded synthetic independent readback; the value violated the requirement.' };
  draft.risks.unresolvedSideEffects = ['A separate synthetic pending request remains unknown.'];
  const result = await commitArtifact({ projectDir: f.projectDir, request: request(draft, 'failed-task') });
  const stored = await readArtifact({ projectDir: f.projectDir, kind: 'task', artifactId: draft.taskId, revision: result.revision });
  assert.ok(stored?.kind === 'task'); assert.equal(stored.maturity, 'defined'); assert.equal(stored.applicability.state, 'uncertain');
  assert.equal((await readSourceRun(f.runDir)).checked.cases[0]!.assessments[0]!.status, 'violation');
  const context = sourceContext(await readSourceRun(f.runDir), await readLibrary(f.projectDir));
  assert.equal(context.facts.length, 4); assert.equal(context.facts[0]!.taskRefs.length, 1); assert.equal(context.facts[0]!.gap, null);
  assert.equal(context.facts.filter(g => g.gap).length, 3); assert.equal(context.facts.filter(g => g.assessment === null).length, 3);
});

test('unresolved normative rules cannot support a defined task and altered rule hashes are rejected', async t => {
  const f = await fixture(t), draft = await ruleOf(f); draft.confirmation = { state: 'pending', basis: ['Real ambiguity awaiting clarification.'] };
  const committed = await commitArtifact({ projectDir: f.projectDir, request: request(draft, 'pending-rule') });
  const ref = { ruleId: draft.ruleId, revision: committed.revision, contentSha256: committed.contentSha256 };
  await assert.rejects(commitArtifact({ projectDir: f.projectDir, request: request(defined(ref), 'defined-unresolved') }), /unresolved normative rule/);
  await assert.rejects(commitArtifact({ projectDir: f.projectDir, request: request(defined({ ...ref, contentSha256: 'a'.repeat(64) }), 'wrong-rule') }), /Missing or changed exact normative rule/);
});

test('historical results prefixes retain exact final assessments after later results append', async t => {
  const f = await fixture(t), evidence = await addEvidence(f); await record(f, observed(evidence.evidenceId, 'violation'));
  const ref = await sourceRef(f, evidence.evidenceId);
  await record(f, observed(evidence.evidenceId, 'verified'), { operationId: 'later-result', expectedRevision: 1 });
  const historical = await verifySourceRef(ref), current = await readSourceRun(f.runDir);
  assert.equal(historical.results.revision, 1); assert.equal(historical.checked.cases[0]!.assessments[0]!.status, 'violation');
  assert.equal(current.checked.cases[0]!.assessments[0]!.status, 'verified'); assert.notEqual(historical.resultsSha256, current.resultsSha256);
  await assert.rejects(verifySourceRef({ ...ref, resultsSha256: current.resultsSha256 }), /content hash mismatch/);
  await assert.rejects(readSourceRun(f.runDir, { resultsRevision: 3 }), /does not exist/);
});

test('source verification rejects wrong run, goal, observation, action, and evidence references', async t => {
  const f = await fixture(t), evidence = await addEvidence(f); await record(f, observed(evidence.evidenceId)); const ref = await sourceRef(f, evidence.evidenceId);
  for (const patch of [{ runId: 'wrong-run' }, { baselineSha256: 'a'.repeat(64) }, { caseId: 'missing-case' }, { goalId: 'missing-goal' }, { observationIds: ['missing-observation'] }, { actionIds: ['missing-action'] }, { evidence: [{ evidenceId: evidence.evidenceId, sha256: 'a'.repeat(64) }] }]) {
    await assert.rejects(verifySourceRef({ ...ref, ...patch }), /mismatch|missing/);
  }
  await fs.writeFile(path.join(f.runDir, evidence.path), 'Changed historical evidence');
  await assert.rejects(verifySourceRef(ref), /Evidence.*(?:hash|integrity)|mismatch/i);
});

test('source context preserves violation, inconclusive, not tested and missing assessments without success filtering', async t => {
  const f = await fixture(t), evidence = await addEvidence(f);
  await record(f, observed(evidence.evidenceId, 'inconclusive'));
  await record(f, untested(), { operationId: 'not-tested', expectedRevision: 1 });
  const context = sourceContext(await readSourceRun(f.runDir), await readLibrary(f.projectDir));
  assert.equal(context.facts.length, 4); assert.deepEqual(context.facts.map(g => g.assessment?.status ?? null), ['inconclusive', 'not_tested', null, null]);
  assert.ok(context.facts.every(g => g.gap !== null)); assert.equal(context.rules.length, 0);
});

for (const change of ['another-goal', 'same-goal'] as const) test('incremental task links remain visible after a later result changes ' + change, async t => {
  const f = await fixture(t), rule = await ruleRef(f), evidence = await addEvidence(f);
  await record(f, observed(evidence.evidenceId, 'violation'));
  const originalSource = await readSourceRun(f.runDir), originalRef = await sourceRef(f, evidence.evidenceId), draft = defined(rule);
  draft.sourceRefs = [originalRef]; draft.goalMappings = [{ sourceRefId: originalRef.id, taskGoalId: 'saved', reason: 'Organized during the first scenario result, before later results arrive.' }];
  await commitArtifact({ projectDir: f.projectDir, request: request(draft, 'incremental-task') });
  const taskFile = path.join(f.projectDir, 'regression/tasks', draft.taskId, '1.json'), originalBytes = await fs.readFile(taskFile, 'utf8');
  const exact = sourceContext(originalSource, await readLibrary(f.projectDir)).facts.find(f => f.caseId === 'one' && f.goalId === 'saved')!;
  assert.equal(exact.taskRefs[0]!.relation, 'exact'); assert.equal(exact.gap, null);
  if (change === 'another-goal') await record(f, untested(), { operationId: 'later-other-goal', expectedRevision: 1 });
  else await record(f, observed(evidence.evidenceId, 'verified'), { operationId: 'later-same-goal', expectedRevision: 1 });
  const current = await readSourceRun(f.runDir), context = sourceContext(current, await readLibrary(f.projectDir)), linked = context.facts.find(f => f.caseId === 'one' && f.goalId === 'saved')!;
  assert.equal(linked.taskRefs.length, 1); assert.equal(linked.taskRefs[0]!.relation, 'earlier');
  assert.equal(linked.taskRefs[0]!.sourceRefId, originalRef.id); assert.equal(linked.taskRefs[0]!.sourceResultsRevision, 1); assert.equal(linked.taskRefs[0]!.sourceResultsSha256, originalSource.resultsSha256);
  assert.match(linked.gap!, /already has task associations from earlier/); assert.doesNotMatch(linked.gap!, /has not been organized/);
  assert.equal(linked.assessment!.status, change === 'same-goal' ? 'verified' : 'violation');
  assert.equal((await readSourceRun(f.runDir, { resultsRevision: 1 })).checked.cases[0]!.assessments[0]!.status, 'violation');
  assert.equal(await fs.readFile(taskFile, 'utf8'), originalBytes);
});

test('source context preserves every exact and earlier link while excluding future source revisions', async t => {
  const f = await fixture(t), rule = await ruleRef(f), evidence = await addEvidence(f);
  await record(f, observed(evidence.evidenceId, 'violation')); const first = await readSourceRun(f.runDir), firstRef = await sourceRef(f, evidence.evidenceId);
  await record(f, untested(), { operationId: 'other-goal-result', expectedRevision: 1 }); const second = await readSourceRun(f.runDir), secondRef = { ...await sourceRef(f, evidence.evidenceId), id: 'second-observation' };
  const task = defined(rule); task.sourceRefs = [firstRef, secondRef]; task.goalMappings = task.sourceRefs.map(ref => ({ sourceRefId: ref.id, taskGoalId: 'saved', reason: 'Explicitly retain each source snapshot association.' }));
  await commitArtifact({ projectDir: f.projectDir, request: request(task, 'multi-link-task') });
  const library = await readLibrary(f.projectDir), latest = sourceContext(second, library).facts.find(f => f.caseId === 'one' && f.goalId === 'saved')!;
  assert.deepEqual(latest.taskRefs.map(ref => [ref.sourceRefId, ref.sourceResultsRevision, ref.relation]), [[firstRef.id, 1, 'earlier'], [secondRef.id, 2, 'exact']]);
  assert.equal(latest.gap, null);
  const historical = sourceContext(first, library).facts.find(f => f.caseId === 'one' && f.goalId === 'saved')!;
  assert.deepEqual(historical.taskRefs.map(ref => ref.sourceRefId), [firstRef.id]); assert.equal(historical.taskRefs[0]!.relation, 'exact');
  const futureOnly = structuredClone(library); futureOnly.tasks[0]!.sourceRefs = [secondRef];
  const notYetLinked = sourceContext(first, futureOnly).facts.find(f => f.caseId === 'one' && f.goalId === 'saved')!;
  assert.equal(notYetLinked.taskRefs.length, 0); assert.match(notYetLinked.gap!, /at or before the selected results revision/);
  const mismatched = structuredClone(library); mismatched.tasks[0]!.sourceRefs = [{ ...firstRef, resultsSha256: 'f'.repeat(64) }];
  const invalid = sourceContext(second, mismatched).facts.find(f => f.caseId === 'one' && f.goalId === 'saved')!;
  assert.equal(invalid.taskRefs.length, 0); assert.match(invalid.gap!, /Tasks are linked.*fingerprints do not match/); assert.doesNotMatch(invalid.gap!, /has not been organized/);
});

test('source action-only evidence remains usable while unrelated same-case evidence is rejected', async t => {
  const f = await fixture(t), observationEvidence = await addEvidence(f), actionEvidence = await addEvidence(f, { operationId: 'action-evidence', expectedRevision: 1 });
  const unknown = { state: 'unknown' as const, summary: 'Synthetic context is not current authorization.', sources: [] };
  const context: RunContext = { id: 'historical-context', environment: unknown, identity: unknown, objects: unknown, initialState: unknown, authorization: unknown };
  const intent: ActionEvent = { id: 'pending-intent', actionId: 'pending-submit', kind: 'intent', purpose: 'test', contextId: context.id, actor: 'Synthetic recorder', summary: 'Intent retained before a simulated interrupted dispatch.', sideEffectRisk: 'possible', evidenceIds: [actionEvidence.evidenceId], planRef: 'step:create', target: 'Synthetic object', inputs: ['Synthetic value'], sideEffects: ['Possible synthetic creation.'] };
  await record(f, { ...observed(observationEvidence.evidenceId, 'inconclusive'), contexts: [context], actionEvents: [intent] });
  const source = await readSourceRun(f.runDir), ref: SourceRef = { id: 'pending-source', runDir: f.runDir, runId: source.manifest.runId, baselineSha256: source.baselineSha256, resultsRevision: source.results.revision, resultsSha256: source.resultsSha256,
    caseId: 'one', goalId: 'saved', observationIds: [], actionIds: [intent.actionId], evidence: [{ evidenceId: actionEvidence.evidenceId, sha256: actionEvidence.sha256 }] };
  await verifySourceRef(ref);
  await assert.rejects(verifySourceRef({ ...ref, evidence: [{ evidenceId: observationEvidence.evidenceId, sha256: observationEvidence.sha256 }] }), /not referenced by the selected/);
  const draft = candidate('pending-action-task'); draft.sourceRefs = [ref]; draft.goalMappings = [{ sourceRefId: ref.id, taskGoalId: null, reason: 'Unknown action remains a candidate; no expected result is fabricated.' }];
  await commitArtifact({ projectDir: f.projectDir, request: request(draft, 'pending-task') });
  const falseObserved = defined(await ruleRef(f)); falseObserved.sourceRefs = [ref]; falseObserved.goalMappings = [{ sourceRefId: ref.id, taskGoalId: 'saved', reason: 'Intent does not verify actual path.' }];
  falseObserved.pathKnowledge.find(p => p.planRef === 'step:create')!.state = 'observed'; falseObserved.pathKnowledge.find(p => p.planRef === 'step:create')!.sourceRefIds = [ref.id];
  await assert.rejects(commitArtifact({ projectDir: f.projectDir, request: request(falseObserved, 'intent-path') }), /lacks an evidenced source/);
  const disposition: ActionEvent = { ...intent, id: 'pending-disposition', kind: 'disposition', summary: 'Synthetic evidenced reconciliation confirms no action occurred.', disposition: { state: 'confirmed_not_occurred', rationale: 'Synthetic retained evidence.', scope: 'Only the synthetic interrupted attempt.', limitations: [], resolvesEventIds: [intent.id] } };
  await record(f, { observations: [], assessments: [], actionEvents: [disposition] }, { operationId: 'disposition-record', expectedRevision: 1 });
  assert.equal((await readSourceRun(f.runDir)).checked.actionAttempts![0]!.unresolved, false);
  assert.equal((await readSourceRun(f.runDir, { resultsRevision: 1 })).checked.actionAttempts![0]!.unresolved, true);
});

test('exact historical prefix checks referenced evidence independently from later corrupted results and unrelated evidence', async t => {
  const f = await fixture(t), evidence = await addEvidence(f); await record(f, observed(evidence.evidenceId, 'violation'));
  const ref = await sourceRef(f, evidence.evidenceId);
  await record(f, untested(), { operationId: 'later-untested', expectedRevision: 1 });
  const laterEvidence = await addEvidence(f, { operationId: 'later-evidence', expectedRevision: 1 });
  await fs.writeFile(path.join(f.runDir, laterEvidence.path), 'Corrupted later, unrelated evidence.');
  const results = JSON.parse(await fs.readFile(path.join(f.runDir, 'results.json'), 'utf8')); results.entries[1].record.assessments[0].status = 'malformed-later-entry';
  await writeJSON(path.join(f.runDir, 'results.json'), results);
  const source = await verifySourceRef(ref);
  assert.equal(source.checked.cases[0]!.assessments[0]!.status, 'violation'); assert.equal(source.checked.evidenceCatalog.items.length, 1);
  assert.equal(source.checked.evidenceIntegrity.hashVerifiedItems, 1); assert.equal(source.evidenceScope.kind, 'results_prefix_references');
  await assert.rejects(readSourceRun(f.runDir), /hash|status/i);
  const changed = structuredClone(results); changed.entries[0].record.assessments[0].rationale = 'Changed history'; await writeJSON(path.join(f.runDir, 'results.json'), changed);
  await assert.rejects(verifySourceRef(ref), /payload hash mismatch/);
});

test('observed path claims need actual referenced facts and intent alone cannot verify a path', async t => {
  const f = await fixture(t), ref = await ruleRef(f), source = await readSourceRun(f.runDir);
  const task = defined(ref);
  task.sourceRefs = [{ id: 'unobserved-source', runDir: f.runDir, runId: source.manifest.runId, baselineSha256: source.baselineSha256, resultsRevision: 0, resultsSha256: source.resultsSha256, caseId: 'one', goalId: 'saved', observationIds: [], actionIds: [], evidence: [] }];
  task.goalMappings = [{ sourceRefId: 'unobserved-source', taskGoalId: 'saved', reason: 'Original target exists without any observations.' }];
  task.pathKnowledge[0] = { ...task.pathKnowledge[0]!, state: 'observed', sourceRefIds: ['unobserved-source'] };
  await assert.rejects(commitArtifact({ projectDir: f.projectDir, request: request(task, 'false-observed') }), /lacks an evidenced source/);
});

test('path knowledge rejects not-issued and unknown action receipts while retaining reached failed paths', async t => {
  const f = await fixture(t), rule = await ruleRef(f), evidence = await addEvidence(f);
  const unknown = { state: 'unknown' as const, summary: 'Synthetic current conditions are unresolved.', sources: [] };
  const context: RunContext = { id: 'path-context', environment: unknown, identity: unknown, objects: unknown, initialState: unknown, authorization: unknown };
  const declarations: { id: string; fields: Partial<ActionEvent>; supported: boolean }[] = [
    { id: 'not-issued', fields: { kind: 'dispatch', dispatchState: 'not_issued', acceptanceState: 'not_applicable' }, supported: false },
    { id: 'unknown-dispatch', fields: { kind: 'dispatch', dispatchState: 'unknown', acceptanceState: 'unknown' }, supported: false },
    { id: 'unknown-result', fields: { kind: 'result', resultState: 'unknown' }, supported: false },
    { id: 'issued', fields: { kind: 'dispatch', dispatchState: 'issued', acceptanceState: 'rejected' }, supported: true },
    { id: 'failed', fields: { kind: 'result', resultState: 'failed' }, supported: true }
  ];
  for (const [index, item] of declarations.entries()) {
    const event: ActionEvent = { id: item.id, actionId: 'attempt-' + item.id, kind: 'result', purpose: 'test', contextId: context.id, actor: 'Synthetic recorder', summary: 'Synthetic path receipt', sideEffectRisk: 'possible', evidenceIds: [evidence.evidenceId], planRef: 'step:create', ...item.fields };
    await record(f, { observations: [], assessments: [], contexts: [context], actionEvents: [event] }, { operationId: 'path-result-' + item.id, expectedRevision: index });
    const source = await readSourceRun(f.runDir), task = defined(rule); task.taskId = 'path-task-' + item.id;
    task.sourceRefs = [{ id: 'path-source', runDir: f.runDir, runId: source.manifest.runId, baselineSha256: source.baselineSha256, resultsRevision: source.results.revision, resultsSha256: source.resultsSha256, caseId: 'one', goalId: 'saved', observationIds: [], actionIds: [event.actionId], evidence: [{ evidenceId: evidence.evidenceId, sha256: evidence.sha256 }] }];
    task.goalMappings = [{ sourceRefId: 'path-source', taskGoalId: 'saved', reason: 'Same target; path knowledge never supplies a product verdict.' }];
    const knowledge = task.pathKnowledge.find(p => p.planRef === 'step:create')!; knowledge.state = 'observed'; knowledge.sourceRefIds = ['path-source'];
    const commit = commitArtifact({ projectDir: f.projectDir, request: request(task, 'path-commit-' + item.id) });
    if (item.supported) assert.equal((await commit).revision, 1); else await assert.rejects(commit, /lacks an evidenced source/);
  }
});

test('prepublication failure commits nothing and concurrent writers cannot overwrite an immutable revision', async t => {
  const f = await fixture(t), draft = await ruleOf(f);
  await assert.rejects(commitArtifact({ projectDir: f.projectDir, request: request(draft) }, { beforePublish: async () => { throw new Error('Synthetic interrupted stage'); } }), /interrupted stage/);
  assert.equal((await readLibrary(f.projectDir)).rules.length, 0);
  let release: () => void = () => {}; let entered: () => void = () => {};
  const enteredStage = new Promise<void>(resolve => { entered = resolve; }), hold = new Promise<void>(resolve => { release = resolve; });
  const first = commitArtifact({ projectDir: f.projectDir, request: request(draft) }, { beforePublish: async () => { entered(); await hold; } });
  await enteredStage;
  try { await assert.rejects(commitArtifact({ projectDir: f.projectDir, request: request(draft, 'concurrent') }), /locked/); } finally { release(); }
  assert.equal((await first).revision, 1); assert.equal((await readLibrary(f.projectDir)).rules.length, 1);
});

test('storage rejects path traversal, source-tree projects, symlinks and version tampering without migration', async t => {
  const f = await fixture(t), draft = await ruleOf(f);
  assert.throws(() => parseArtifactRequest(request({ ...draft, ruleId: '../escape' })), /unsafe/);
  await assert.rejects(readLibrary(SOURCE_ROOT), /outside the source repository/);
  await assert.rejects(readArtifact({ projectDir: f.projectDir, kind: 'rule', artifactId: '../escape', revision: 1 }), /unsafe/);
  await commitArtifact({ projectDir: f.projectDir, request: request(draft) });
  const filename = path.join(f.projectDir, 'regression/rules/saved-rule/1.json'), bytes = await fs.readFile(filename, 'utf8');
  const altered = JSON.parse(bytes); altered.regressionVersion = 99; await writeJSON(filename, altered);
  await assert.rejects(readLibrary(f.projectDir), /regression version/); assert.equal(JSON.parse(await fs.readFile(filename, 'utf8')).regressionVersion, 99);
  await fs.writeFile(filename, bytes);
  const linkedProject = path.join(f.root, 'linked-project');
  try { await fs.symlink(f.projectDir, linkedProject, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (caught) { if ((caught as NodeJS.ErrnoException).code === 'EPERM') { t.diagnostic('Symlink creation is unavailable in this environment.'); return; } throw caught; }
  await assert.rejects(readLibrary(linkedProject), /Symlink path/);
});

test('stored artifacts verify their own hashes and source inspection never repairs unfinished evidence', async t => {
  const f = await fixture(t), draft = await ruleOf(f); await commitArtifact({ projectDir: f.projectDir, request: request(draft) });
  const stored = (await readLibrary(f.projectDir)).rules[0]!;
  assert.equal(stored.contentSha256, canonicalHash(draft)); assert.throws(() => parseStoredArtifact({ ...stored, statement: 'Silently changed requirement' }), /content hash/);
  await fs.writeFile(path.join(f.runDir, '.evidence.pending.json'), '{"synthetic":"preserve unfinished original transaction"}\n');
  await assert.rejects(readSourceRun(f.runDir), /unfinished evidence transaction/);
  assert.equal(await fs.readFile(path.join(f.runDir, '.evidence.pending.json'), 'utf8'), '{"synthetic":"preserve unfinished original transaction"}\n');
});
