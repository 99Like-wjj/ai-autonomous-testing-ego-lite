import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeCases } from '../src/core/baseline.mjs';
import { check, recordResult, validatePayloadAgainstCase } from '../src/core/records.mjs';
import { parseResults } from '../src/core/validation.mjs';
import { fixture, caseOf, addEvidence, observed, untested, record, request, readJSON, writeJSON } from './goals-fixture.mjs';

test('missing assessments remain recording gaps and plan steps do not inflate goal counts', async t => {
  const f = await fixture(t), report = await check(f.runDir);
  assert.equal(report.caseCount, 2); assert.equal(report.goalCount, 4);
  assert.deepEqual(report.counts, { verified: 0, violation: 0, inconclusive: 0, not_tested: 0, unassessed: 4 });
  assert.equal(report.assessmentComplete, false); assert.deepEqual(report.cases[0]?.missingGoalIds, ['saved', 'capacity']);
  assert.ok(!('status' in report.cases[0]!));
});
test('incremental final records preserve other goals and expose mixed four-state results', async t => {
  const f = await fixture(t), ev = await addEvidence(f);
  await record(f, observed(ev.evidenceId));
  const first = await check(f.runDir); assert.equal(first.counts.verified, 1); assert.equal(first.counts.unassessed, 3);
  await record(f, untested(), { operationId: 'capacity-deferred', expectedRevision: 1 });
  const next = await check(f.runDir);
  assert.deepEqual(next.cases[0]?.assessments.map(a => a.status), ['verified', 'not_tested']);
  assert.equal(next.counts.inconclusive, 0); assert.equal(next.counts.not_tested, 1); assert.equal(next.counts.unassessed, 2);
  assert.deepEqual(next.cases[0]?.missingGoalIds, []);
});
test('attempts retain observations and judgments without replacing current final assessments', async t => {
  const f = await fixture(t), ev = await addEvidence(f);
  await record(f, observed(ev.evidenceId, 'violation'), { mode: 'attempt' });
  let report = await check(f.runDir); assert.equal(report.counts.unassessed, 4); assert.equal(report.counts.violation, 0);
  assert.equal(report.cases[0]?.entries[0]?.record.assessments[0]?.status, 'violation');
  await record(f, { observations: [], assessments: [{ goalId: 'saved', status: 'verified', rationale: 'Review of retained synthetic observation.', observationIds: ['readback'], gaps: [] }] }, { operationId: 'review-final', expectedRevision: 1 });
  report = await check(f.runDir); assert.equal(report.counts.verified, 1);
  assert.equal(report.cases[0]?.entries.length, 2); assert.equal(report.cases[0]?.observations.length, 1);
});
test('new final assessment leaves first violation and its evidence in append-only history', async t => {
  const f = await fixture(t), ev = await addEvidence(f);
  await record(f, observed(ev.evidenceId, 'violation'));
  await record(f, { observations: [{ id: 'later', summary: 'Later synthetic readback differs.', coveredRefs: ['condition:0', 'step:create'], evidenceIds: [ev.evidenceId] }], assessments: [{ goalId: 'saved', status: 'verified', rationale: 'Later explicit assessment; original observation retained.', observationIds: ['later'], gaps: [] }] }, { operationId: 'later-result', expectedRevision: 1 });
  const report = await check(f.runDir); assert.equal(report.counts.verified, 1);
  assert.equal(report.cases[0]?.entries[0]?.record.assessments[0]?.status, 'violation');
  assert.equal(report.cases[0]?.observations.length, 2);
});
test('result transactions replay after a lost response, reject payload changes, and reject stale revisions', async t => {
  const f = await fixture(t), input = request(untested());
  await assert.rejects(recordResult({ runDir: f.runDir, request: input }, { afterCommit: async () => { throw new Error('Synthetic response lost'); } }), /response lost/);
  const replay = await recordResult({ runDir: f.runDir, request: { ...input, record: { assessments: input.record.assessments, observations: input.record.observations } } });
  assert.equal(replay.replayed, true); assert.equal((await check(f.runDir)).revision, 1);
  await assert.rejects(recordResult({ runDir: f.runDir, request: { ...input, record: untested('saved') } }), /different payload/);
  await assert.rejects(record(f, untested('saved'), { operationId: 'stale', expectedRevision: 0 }), /Revision conflict/);
});
test('observation IDs are reusable only with identical facts and cannot cross cases', async t => {
  const f = await fixture(t), ev = await addEvidence(f);
  await record(f, observed(ev.evidenceId));
  const changed = observed(ev.evidenceId); changed.observations[0]!.summary = 'Changed facts under an old ID.';
  await assert.rejects(record(f, changed, { operationId: 'changed', expectedRevision: 1 }), /different content/);
  await record(f, observed(ev.evidenceId), { operationId: 'same-observation', expectedRevision: 1 });
  assert.equal((await check(f.runDir)).cases[0]?.observations.length, 1);
  await assert.rejects(record(f, { observations: [], assessments: [{ goalId: 'saved', status: 'violation', rationale: 'Invalid cross-case lookup.', observationIds: ['readback'], gaps: [] }] }, { operationId: 'cross-case', expectedRevision: 2, caseId: 'two' }), /Unknown observation/);
});
test('verified requires evidence-backed coverage of necessary refs, while valid violations need no confirmed root cause', async t => {
  const f = await fixture(t), ev = await addEvidence(f), missing = observed(ev.evidenceId);
  missing.observations[0]!.coveredRefs = ['step:create'];
  await assert.rejects(record(f, missing), /necessary plan references/);
  const noEvidence = observed(ev.evidenceId); noEvidence.observations[0]!.evidenceIds = [];
  await assert.rejects(record(f, noEvidence), /observations and associated evidence/);
  const violation = observed(ev.evidenceId, 'violation'); violation.observations[0]!.coveredRefs = ['step:create'];
  violation.assessments[0]!.diagnosis = { state: 'unknown', category: 'unknown', summary: 'Backend root cause has not been investigated.', evidenceIds: [] };
  await record(f, violation);
  assert.equal((await check(f.runDir)).counts.violation, 1);
});
test('unresolved acceptance rules block only the affected goal in finals and attempts', async t => {
  const c = caseOf(); c.goals[1]!.clarificationQuestions = ['Which capacity policy is authoritative?'];
  const f = await fixture(t, [c]), ev = await addEvidence(f);
  await record(f, observed(ev.evidenceId));
  for (const mode of ['final', 'attempt'] as const) await assert.rejects(record(f, {
    observations: [{ id: 'capacity-read', summary: 'Synthetic capacity read.', coveredRefs: ['step:capacity', 'condition:0'], evidenceIds: [ev.evidenceId] }],
    assessments: [{ goalId: 'capacity', status: 'violation', rationale: 'A verdict cannot bypass this unresolved rule.', observationIds: ['capacity-read'], gaps: [] }]
  }, { operationId: 'clarification-' + mode, expectedRevision: 1, mode }), /Pending clarification/);
  assert.equal((await check(f.runDir)).counts.verified, 1);
});
test('schema preserves explicit goal provenance and rejects unmapped necessary plan semantics', () => {
  const c = caseOf(); c.goals[0]!.followUpOf = { runId: 'prior-run', caseId: 'prior-case', goalId: 'prior-goal', reason: 'User clarified the requirement.' };
  const baseline = normalizeCases({ schemaVersion: 8, project: 'Synthetic', cases: [c] });
  assert.equal(baseline.cases[0]?.goals[0]?.followUpOf?.runId, 'prior-run');
  c.goals[1]!.requiredRefs = [];
  assert.throws(() => normalizeCases({ schemaVersion: 8, project: 'Synthetic', cases: [c] }), /not linked to any goal/);
  c.goals[1]!.requiredRefs = ['step:missing'];
  assert.throws(() => normalizeCases({ schemaVersion: 8, project: 'Synthetic', cases: [c] }), /Unknown plan reference/);
});
test('readback detects altered assessment content, missing events, and baseline edits', async t => {
  const f = await fixture(t); await record(f, untested());
  const resultFile = path.join(f.runDir, 'results.json'), original = parseResults(await readJSON(resultFile));
  const changed = structuredClone(original); changed.entries[0]!.record.assessments[0]!.rationale = 'Edited after commit';
  await writeJSON(resultFile, changed); await assert.rejects(check(f.runDir), /payload hash mismatch/);
  await writeJSON(resultFile, { ...original, entries: [] }); await assert.rejects(check(f.runDir), /revision/);
  await writeJSON(resultFile, original);
  await fs.appendFile(path.join(f.runDir, 'baseline.json'), ' '); await assert.rejects(check(f.runDir), /Baseline hash mismatch/);
});
test('pure packet validation shares goal references and evidence ownership rules', () => {
  const c = caseOf(), good = observed('local-key');
  assert.doesNotThrow(() => validatePayloadAgainstCase(c, good, [], new Map([['local-key', { caseId: 'one' }]])));
  assert.throws(() => validatePayloadAgainstCase(c, good, [], new Map()), /not registered/);
  assert.throws(() => validatePayloadAgainstCase(c, good, [], new Map([['local-key', { caseId: 'two' }]])), /different case/);
  const changed = observed('local-key'); changed.assessments[0]!.goalId = 'missing';
  assert.throws(() => validatePayloadAgainstCase(c, changed), /Unknown goal/);
});
test('an observation-only attempt does not invent a goal verdict', async t => {
  const f = await fixture(t), ev = await addEvidence(f), payload = observed(ev.evidenceId); payload.assessments = [];
  await record(f, payload, { mode: 'attempt' });
  const report = await check(f.runDir); assert.equal(report.counts.unassessed, 4); assert.equal(report.cases[0]?.observations.length, 1);
});
