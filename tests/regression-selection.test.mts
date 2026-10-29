import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Status } from '../src/contracts/model.mjs';
import { canonicalHash, hash, json } from '../src/core/common.mjs';
import { start } from '../src/core/cases.mjs';
import { check } from '../src/core/records.mjs';
import { prepareBinding, validateBinding } from '../src/regression/binding.mjs';
import { parseSelection, parseSelectionRequest, selectRegression } from '../src/regression/selection.mjs';
import { readSourceRun } from '../src/regression/sources.mjs';
import { commitArtifact } from '../src/regression/store.mjs';
import { addEvidence, caseOf, observed, record, untested, writeJSON } from './goals-fixture.mjs';
import { at } from './support.mjs';
import { bindingRequest, fullSelectionRequest, regressionFixture, taskDraft } from './regression-fixture.mjs';

test('each business status selects whole matching cases; multiple statuses deduplicate; final excludes old attempts', async t => {
  const f = await regressionFixture(t, [caseOf(), caseOf('two'), caseOf('three')]);
  const ev = await addEvidence(f), ev2 = await addEvidence(f, { operationId: 'ev-two', expectedRevision: 1, caseId: 'two' });
  await record(f, observed(ev.evidenceId, 'violation'), { mode: 'attempt' });
  await record(f, observed(ev.evidenceId), { operationId: 'r2', expectedRevision: 1 });
  await record(f, untested(), { operationId: 'r3', expectedRevision: 2 });
  await record(f, observed(ev2.evidenceId, 'violation'), { operationId: 'r4', expectedRevision: 3, caseId: 'two' });
  await record(f, { observations: [], assessments: [{ goalId: 'capacity', status: 'inconclusive', rationale: 'Insufficient evidence.', observationIds: [], gaps: ['Unknown fixture resource.'] }] }, { operationId: 'r5', expectedRevision: 4, caseId: 'two' });
  const source = await readSourceRun(f.runDir), request = { ...f.selectionRequest, mode: 'status' as const,
    source: { runDir: f.runDir, runId: source.manifest.runId, baselineSha256: source.baselineSha256, resultsRevision: source.results.revision, resultsSha256: source.resultsSha256,
      goalMappings: f.baseline.cases.flatMap(c => c.goals.map(g => ({ caseId: c.id, goalId: g.id, sourceCaseId: c.id, sourceGoalId: g.id }))) }, statuses: ['violation'] as Status[] };
  for (const [status, cases] of [['verified', ['one']], ['violation', ['two']], ['inconclusive', ['two']], ['not_tested', ['one']]] as const) {
    const selection = await selectRegression({ projectDir: f.projectDir, request: { ...request, statuses: [status] } });
    assert.deepEqual(selection.selectedCaseIds, cases); assert.equal(selection.matchedGoalRefs.length, 1); assert.equal(selection.plannedGoalRefs.length, 2);
    assert.equal(selection.notSelected.length, 2); assert.deepEqual(parseSelection(selection), selection);
  }
  const multi = await selectRegression({ projectDir: f.projectDir, request: { ...request, statuses: ['not_tested', 'verified'] } });
  assert.deepEqual(multi.selectedCaseIds, ['one']); assert.equal(multi.matchedGoalRefs.length, 2); assert.equal(multi.plannedGoalRefs.length, 2);
  const allFour = await selectRegression({ projectDir: f.projectDir, request: { ...request, statuses: ['verified', 'violation', 'inconclusive', 'not_tested'] } });
  assert.deepEqual(allFour.selectedCaseIds, ['one', 'two']);
  const include = await selectRegression({ projectDir: f.projectDir, request: { ...request, includeUnassessedCases: true } });
  assert.deepEqual(include.selectedCaseIds, ['two', 'three']); assert.equal(include.gaps.filter(g => g.code === 'unassessed').length, 2);
  const frozen = JSON.stringify(multi);
  await record(f, observed(ev.evidenceId, 'violation'), { operationId: 'r6', expectedRevision: 5 });
  assert.equal(JSON.stringify(await selectRegression({ projectDir: f.projectDir, request: multi.request })), frozen);
  await assert.rejects(selectRegression({ projectDir: f.projectDir, request: { ...request, source: { ...request.source, resultsSha256: '0'.repeat(64) } } }), /hash mismatch/);
  await assert.rejects(selectRegression({ projectDir: f.projectDir, request: { ...request, source: { ...request.source, baselineSha256: '0'.repeat(64) } } }), /baseline.*hash mismatch/);
});

test('zero matches stays empty; source mappings, explicit statuses and closed input are mandatory', async t => {
  const f = await regressionFixture(t), evidence = await addEvidence(f);
  await record(f, observed(evidence.evidenceId, 'violation'), { mode: 'attempt' });
  const source = await readSourceRun(f.runDir);
  const request = { ...f.selectionRequest, mode: 'status', statuses: ['violation'], source: { runDir: f.runDir, runId: source.manifest.runId, baselineSha256: source.baselineSha256, resultsRevision: source.results.revision, resultsSha256: source.resultsSha256,
    goalMappings: f.baseline.cases.flatMap(c => c.goals.map(g => ({ caseId: c.id, goalId: g.id, sourceCaseId: c.id, sourceGoalId: g.id }))) } };
  const result = await selectRegression({ projectDir: f.projectDir, request });
  assert.deepEqual(result.selectedCaseIds, []); assert.deepEqual(result.plannedGoalRefs, []); assert.equal(result.notSelected.length, 2);
  assert.throws(() => parseSelectionRequest({ ...request, statuses: [] }), /at least one/);
  assert.throws(() => parseSelectionRequest({ ...request, statuses: ['unassessed'] }), /selected status/);
  assert.throws(() => parseSelectionRequest({ ...request, silentlyChooseLatest: true }), /Unexpected/);
  assert.throws(() => parseSelectionRequest({ ...request, source: { ...request.source, goalMappings: [] } }), /complete explicit/);
  assert.throws(() => parseSelection({ ...result, selectedCaseIds: ['one'] }), /mismatch/);
});

test('full scope includes missing and incomplete tasks with gaps and reads only the named revisions', async t => {
  const f = await regressionFixture(t, [caseOf(), caseOf('two'), caseOf('three')]);
  const draft = taskDraft(at(f.baseline.cases, 1), f.ruleRef); draft.maturity = 'incomplete'; draft.review.gaps = ['Navigation has not been explored.']; draft.risks.unresolvedSideEffects = ['An earlier request might have been issued.']; draft.supersedes = at(f.taskRefs, 1);
  const newer = await commitArtifact({ projectDir: f.projectDir, request: { regressionVersion: 1, operationId: 'task-two-r2', expectedRevision: 1, artifact: draft } });
  const selection = await selectRegression({ projectDir: f.projectDir, request: fullSelectionRequest(f.baseline, [at(f.taskRefs), { taskId: draft.taskId, revision: newer.revision, contentSha256: newer.contentSha256 }, null]) });
  assert.deepEqual(selection.selectedCaseIds, ['one', 'two', 'three']); assert.equal(selection.plannedGoalRefs.length, 6);
  assert.ok(selection.gaps.some(g => g.code === 'missing_task')); assert.ok(selection.gaps.some(g => g.code === 'task_incomplete')); assert.ok(selection.gaps.some(g => g.code === 'unresolved_side_effect'));
  // Unselected historical revisions are not a hidden dependency of full scope selection.
  await fs.writeFile(path.join(f.projectDir, 'regression', 'tasks', 'task-two', '1.json'), '{broken older revision');
  assert.deepEqual(await selectRegression({ projectDir: f.projectDir, request: selection.request }), selection);
  await fs.writeFile(f.rule.source.contentFile, 'Changed source content; old immutable rule remains retained.');
  const missingSource = await selectRegression({ projectDir: f.projectDir, request: selection.request });
  assert.deepEqual(missingSource.selectedCaseIds, selection.selectedCaseIds); assert.ok(missingSource.gaps.some(g => g.code === 'rule_source_unavailable'));
});

test('binding freezes exact complete cases and sources, preserves deferred gaps, and starts with no historical assessments', async t => {
  const f = await regressionFixture(t), selection = await selectRegression({ projectDir: f.projectDir, request: fullSelectionRequest(f.baseline, [at(f.taskRefs), null]) });
  const request = bindingRequest(selection); request.caseMappings = [{ scopeCaseId: 'one', runCaseId: 'one' }]; request.deferredCases = [{ caseId: 'two', reason: 'Task not yet organized; the requested scope remains visible.' }];
  const baseline = { ...f.baseline, cases: [at(f.baseline.cases)] }, prepared = await prepareBinding({ projectDir: f.projectDir, request, baseline, runId: 'new-synthetic-run' });
  assert.equal(prepared.sha256, hash(prepared.bytes)); assert.equal(prepared.binding.coverage.selectedGoals, 4); assert.equal(prepared.binding.coverage.compiledGoals, 2);
  assert.ok(prepared.binding.coverage.gaps.some(g => g.code === 'selected_not_compiled'));
  assert.deepEqual(validateBinding(prepared.binding, baseline, 'new-synthetic-run'), prepared.binding);
  assert.throws(() => validateBinding({ ...prepared.binding, contentSha256: '0'.repeat(64) }, baseline, 'new-synthetic-run'), /mismatch/);
  const partial = structuredClone(baseline); at(partial.cases).goals.splice(1); at(partial.cases).steps.splice(1);
  await assert.rejects(prepareBinding({ projectDir: f.projectDir, request, baseline: partial, runId: 'new-synthetic-run' }), /entire selected case/);
  await assert.rejects(prepareBinding({ projectDir: f.projectDir, request: { ...request, deferredCases: [] }, baseline, runId: 'new-synthetic-run' }), /Every selected case/);
  const casesFile = path.join(f.projectDir, 'regression-cases.json'), bindingFile = path.join(f.projectDir, 'binding-request.json'), outputDir = path.join(f.root, 'regression-run');
  await writeJSON(casesFile, baseline); await writeJSON(bindingFile, request); await start({ projectDir: f.projectDir, casesFile, bindingFile, outputDir });
  const report = await check(outputDir); assert.equal(report.counts.verified, 0); assert.equal(report.counts.unassessed, 2); assert.equal(report.assessmentComplete, false);
  const frozen = await fs.readFile(path.join(outputDir, 'regression-binding.json'), 'utf8');
  await fs.rename(path.join(f.projectDir, 'regression'), path.join(f.projectDir, 'moved-regression'));
  assert.equal((await check(outputDir)).counts.unassessed, 2); assert.equal(await fs.readFile(path.join(outputDir, 'regression-binding.json'), 'utf8'), frozen);
});

test('binding rejects historical evidence as new, inherited readiness, missing authorization and altered task snapshots', async t => {
  const f = await regressionFixture(t), source = await readSourceRun(f.runDir);
  const full = { ...f.selectionRequest, source: { runDir: f.runDir, runId: source.manifest.runId, baselineSha256: source.baselineSha256, resultsRevision: 0, resultsSha256: source.resultsSha256,
    goalMappings: f.baseline.cases.flatMap(c => c.goals.map(g => ({ caseId: c.id, goalId: g.id, sourceCaseId: c.id, sourceGoalId: g.id }))) } };
  const selection = await selectRegression({ projectDir: f.projectDir, request: full }), request = bindingRequest(selection);
  const currentFile = path.join(f.root, 'current-condition.log'); await fs.writeFile(currentFile, 'Independent current preparation evidence.');
  request.conditions.items.push({ id: 'current-data', caseIds: ['one'], aspect: 'data', state: 'verified', statement: 'Freshly retained synthetic preparation evidence.', source: { kind: 'current_evidence', locator: 'Current preparation observation', file: currentFile, sha256: hash(await fs.readFile(currentFile)) } });
  const prepared = await prepareBinding({ projectDir: f.projectDir, request, baseline: f.baseline, runId: 'new-run' });
  const corrupt = structuredClone(prepared.binding); at(corrupt.tasks).title = 'Changed after freeze';
  assert.throws(() => validateBinding(corrupt, f.baseline, 'new-run'), /hash/);
  const oldFile = path.join(f.runDir, 'baseline.json'), old = structuredClone(request); at(old.conditions.items, 2).source = { kind: 'current_evidence', locator: 'Claiming old run data is fresh', file: oldFile, sha256: hash(await fs.readFile(oldFile)) };
  await assert.rejects(prepareBinding({ projectDir: f.projectDir, request: old, baseline: f.baseline, runId: 'new-run' }), /Historical run evidence/);
  await assert.rejects(prepareBinding({ projectDir: f.projectDir, request: { ...request, conditions: { ...request.conditions, forCurrentRun: false } }, baseline: f.baseline, runId: 'new-run' }), /historical readiness/);
  await assert.rejects(prepareBinding({ projectDir: f.projectDir, request: { ...request, conditions: { ...request.conditions, items: [at(request.conditions.items, 2)] } }, baseline: f.baseline, runId: 'new-run' }), /current authorization/);
  const reordered = { ...full, scope: { ...full.scope, taskBindings: [...full.scope.taskBindings].reverse() } };
  assert.equal((await selectRegression({ projectDir: f.projectDir, request: reordered })).selectionSha256, selection.selectionSha256);
  assert.equal(canonicalHash(JSON.parse(json(prepared.binding))), canonicalHash(prepared.binding));
});

test('binding independently verifies historical task sources even when full selection has no status source', async t => {
  const f = await regressionFixture(t), source = await readSourceRun(f.runDir), task = taskDraft(at(f.baseline.cases), f.ruleRef);
  task.supersedes = at(f.taskRefs); task.reason = 'Add an explicit historical goal source.';
  task.sourceRefs = [{ id: 'source-goal', runDir: f.runDir, runId: source.manifest.runId, baselineSha256: source.baselineSha256, resultsRevision: 0, resultsSha256: source.resultsSha256, caseId: 'one', goalId: 'saved', observationIds: [], actionIds: [], evidence: [] }];
  task.goalMappings = [{ sourceRefId: 'source-goal', taskGoalId: 'saved', reason: 'Same original goal, explicitly mapped.' }];
  const receipt = await commitArtifact({ projectDir: f.projectDir, request: { regressionVersion: 1, operationId: 'task-source-ref', expectedRevision: 1, artifact: task } });
  const selection = await selectRegression({ projectDir: f.projectDir, request: fullSelectionRequest(f.baseline, [{ taskId: task.taskId, revision: receipt.revision, contentSha256: receipt.contentSha256 }, at(f.taskRefs, 1)]) });
  await prepareBinding({ projectDir: f.projectDir, request: bindingRequest(selection), baseline: f.baseline, runId: 'new-run' });
  await writeJSON(path.join(f.runDir, 'manifest.json'), { ...source.manifest, runId: 'unexpected-historical-run' });
  await assert.rejects(prepareBinding({ projectDir: f.projectDir, request: bindingRequest(selection), baseline: f.baseline, runId: 'another-run' }), /match/);
  const withGap = await selectRegression({ projectDir: f.projectDir, request: selection.request });
  assert.ok(withGap.gaps.some(g => g.code === 'task_source_unavailable'));
  await assert.rejects(prepareBinding({ projectDir: f.projectDir, request: bindingRequest(withGap), baseline: f.baseline, runId: 'third-run' }), /mismatch/);
});
