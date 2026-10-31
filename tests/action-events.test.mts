import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ActionEvent, ContextFact, RecordPayload, RunContext } from '../src/contracts/model.mjs';
import { parseActionEvent, parseContextFact, mapRecordEvidence, projectActionAttempts, recordEvidenceIds } from '../src/core/action-events.mjs';
import { parsePayload } from '../src/core/validation.mjs';
import { check, progress, recordResult, validatePayloadAgainstCase } from '../src/core/records.mjs';
import { executeRequest, readExecutionView } from '../src/execution/commands.mjs';
import { matchRegisteredEvidence, sealPacket, validateAssessment } from '../src/execution/packets.mjs';
import { parsePacket } from '../src/execution/parse.mjs';
import { fixture, caseOf, addEvidence, observed, record, request, readJSON, writeJSON } from './goals-fixture.mjs';

const fact = (key = 'ev'): ContextFact => ({ state: 'known', summary: 'Synthetic fact with a retained source.', sources: [{ kind: 'evidence', reference: 'Synthetic source locator', evidenceIds: [key] }] });
const context = (key = 'ev', id = 'ctx'): RunContext => ({ id, environment: fact(key), identity: fact(key), objects: fact(key), initialState: fact(key), authorization: { state: 'known', summary: 'Only synthetic transactions authorized.', sources: [{ kind: 'user_confirmation', reference: 'Synthetic test authorization', evidenceIds: [key] }] } });
const event = (id: string, kind: ActionEvent['kind'] = 'intent', key = 'ev', extra: Partial<ActionEvent> = {}): ActionEvent => ({ id, actionId: 'create-1', kind, purpose: 'test', contextId: 'ctx', actor: 'synthetic-worker', summary: 'Synthetic action fact.', sideEffectRisk: 'possible', evidenceIds: kind === 'intent' ? [] : [key], ...(kind === 'intent' ? { target: 'synthetic-object', inputs: ['value=synthetic'], sideEffects: ['Creates one synthetic row'] } : {}), ...(kind === 'dispatch' ? { dispatchState: 'issued', acceptanceState: 'accepted' } : {}), ...(['result', 'reconciliation'].includes(kind) ? { resultState: 'unknown' } : {}), ...(kind === 'reconciliation' ? { readOnly: true } : {}), ...extra });
const payload = (key = 'ev', actionEvents = [event('intent')]): RecordPayload => ({ observations: [], assessments: [], contexts: [context(key)], actionEvents });
const disposition = (id: string, resolvesEventIds: string[], key = 'ev', state: NonNullable<ActionEvent['disposition']>['state'] = 'confirmed_occurred'): ActionEvent => event(id, 'disposition', key, { disposition: { state, rationale: 'AI checked the retained synthetic readback.', scope: 'The exact synthetic object and action attempt.', limitations: ['Synthetic evidence validates the recording mechanism only.'], resolvesEventIds } });
const evidence = new Map([['ev', { caseId: 'one' }]]);

test('pending action summaries expose source-authored business wording without settling the unknown result', () => {
  const intent=event('intent','intent','ev',{summary:'保存合成日报'}),unknown=disposition('uncertain',['intent'],'ev','unknown');
  unknown.disposition!.rationale='没有取得最终保存响应，当前仅能确认请求已发出。';
  const before=JSON.stringify([intent,unknown]),view=projectActionAttempts([intent,unknown])[0]!;
  assert.equal(view.label,'保存合成日报');
  assert.equal(view.detail,unknown.disposition!.rationale);
  assert.equal(view.unresolved,true);
  assert.ok(view.reasons.every(s=>!s.includes('Unknown, deferred')&&!s.includes('Intent exists')));
  assert.equal(JSON.stringify([intent,unknown]),before);
});

test('context facts distinguish known, unknown and not applicable and require known sources', () => {
  assert.equal(parseContextFact({ state: 'unknown', summary: 'Identity not independently verified.', sources: [] }).state, 'unknown');
  assert.equal(parseContextFact({ state: 'not_applicable', summary: 'No tenant in this synthetic fixture.', sources: [] }).state, 'not_applicable');
  assert.throws(() => parseContextFact({ ...fact(), sources: [] }), /require source/);
  assert.throws(() => parseContextFact({ ...fact(), sources: [{ kind: 'evidence', reference: 'Absent', evidenceIds: [] }] }), /require evidence/);
});
test('action-only and context-only records remain valid without manufacturing goal assessments', async t => {
  const f = await fixture(t), ev = await addEvidence(f);
  await record(f, { observations: [], assessments: [], contexts: [context(ev.evidenceId)] }, { mode: 'attempt' });
  await record(f, { observations: [], assessments: [], actionEvents: [event('intent')] }, { operationId: 'intent-only', expectedRevision: 1, mode: 'final' });
  const report = await check(f.runDir); assert.equal(report.counts.unassessed, 4); assert.equal(report.cases[0]?.contexts.length, 1); assert.equal(report.cases[0]?.actionEvents.length, 1);
  assert.equal((await progress(f.runDir)).unresolvedActions[0]?.actionId, 'create-1');
});
test('intent cannot cover necessary plan refs or serve as verified or violation evidence', () => {
  const record = payload(); record.observations = [{ id: 'intent-observation', summary: 'Only planning is recorded.', evidenceIds: ['ev'], coveredRefs: ['step:create'], actionEventIds: ['intent'], contextId: 'ctx' }];
  assert.throws(() => validatePayloadAgainstCase(caseOf(), record, [], evidence), /Intent-only/);
  record.observations[0]!.coveredRefs = [];
  for (const status of ['verified', 'violation'] as const) {
    record.assessments = [{ goalId: 'saved', status, rationale: 'Invalid claim based on intent.', observationIds: ['intent-observation'], gaps: [] }];
    assert.throws(() => validatePayloadAgainstCase(caseOf(), record, [], evidence), /observations and associated evidence/);
  }
  record.actionEvents!.push(event('no-result-evidence', 'result', 'ev', { evidenceIds: [] }));
  record.observations[0]!.actionEventIds!.push('no-result-evidence');
  record.observations[0]!.coveredRefs = ['step:create'];
  assert.throws(() => validatePayloadAgainstCase(caseOf(), record, [], evidence), /unsupported action observations/);
});
test('accepted dispatch and each asynchronous observation remain distinct, without implicit SLA or verdict', () => {
  for (const resultState of ['known', 'processing', 'window_incomplete', 'failed', 'unknown'] as const) {
    const result = event('result-' + resultState, 'result', 'ev', { resultState, ...(resultState === 'window_incomplete' ? { observationWindow: { startedAt: '2026-10-30T00:00:00Z', endedAt: '2026-10-30T00:10:00Z', source: 'Synthetic clock', limitation: 'This observation window is not a product SLA.' } } : {}) });
    const record = payload('ev', [event('intent'), event('issued', 'dispatch'), result]);
    validatePayloadAgainstCase(caseOf(), record, [], evidence); assert.equal(projectActionAttempts(record.actionEvents!)[0]?.unresolved, true); assert.equal(record.assessments.length, 0);
  }
  assert.throws(() => parseActionEvent(event('window', 'result', 'ev', { resultState: 'window_incomplete' })), /actual bounds/);
  assert.throws(() => parseActionEvent({ ...event('time'), occurredAt: '2026-10-30T00:00:00Z' }), /source must be supplied together/);
});
test('immutable event and context IDs reject revisions while receipt replay does not duplicate an attempt', async t => {
  const f = await fixture(t), ev = await addEvidence(f), input = request(payload(ev.evidenceId));
  await assert.rejects(recordResult({ runDir: f.runDir, request: input }, { afterCommit: async () => { throw Error('Synthetic receipt lost'); } }), /receipt lost/);
  assert.equal((await recordResult({ runDir: f.runDir, request: input })).replayed, true);
  const changed = payload(ev.evidenceId); changed.actionEvents![0]!.summary = 'Changed after commit';
  await assert.rejects(record(f, changed, { operationId: 'changed', expectedRevision: 1 }), /different content/);
  const changedContext = payload(ev.evidenceId); changedContext.contexts![0]!.identity.summary = 'Different identity';
  await assert.rejects(record(f, changedContext, { operationId: 'changed-context', expectedRevision: 1 }), /different content/);
  assert.equal((await check(f.runDir)).cases[0]?.actionEvents.length, 1);
});
test('context, event, plan, retry and evidence references enforce ownership and uniqueness', () => {
  const good = payload();
  assert.throws(() => validatePayloadAgainstCase(caseOf(), { ...good, contexts: [] }, [], evidence), /Unknown action context/);
  assert.throws(() => validatePayloadAgainstCase(caseOf(), { ...good, actionEvents: [event('intent', 'intent', 'ev', { planRef: 'step:missing' })] }, [], evidence), /Unknown action plan/);
  assert.throws(() => validatePayloadAgainstCase(caseOf(), good, [], new Map([['ev', { caseId: 'two' }]])), /different case/);
  assert.throws(() => validatePayloadAgainstCase(caseOf(), { ...good, actionEvents: [event('intent'), disposition('resolution', ['missing'])] }, [], evidence), /event reference/);
  assert.throws(() => parsePayload({ ...good, actionEvents: [event('same'), event('same')] }), /Duplicate action event/);
  assert.throws(() => validatePayloadAgainstCase(caseOf(), { ...good, actionEvents: [event('issued', 'dispatch'), event('issued-again', 'dispatch')] }, [], evidence), /new actionId/);
  assert.throws(() => validatePayloadAgainstCase(caseOf(), { ...good, actionEvents: [event('intent'), event('changed-purpose', 'result', 'ev', { purpose: 'cleanup' })] }, [], evidence), /change its purpose/);
});
test('a new actual retry uses a new action ID and keeps the earlier attempt unresolved', () => {
  const next = event('retry-intent', 'intent', 'ev', { actionId: 'create-2', retry: { actionId: 'create-1', rationale: 'AI chose a new authorized attempt after reviewing the uncertainty.', authorizationSources: [{ kind: 'user_confirmation', reference: 'Explicit synthetic retry authorization', evidenceIds: ['ev'] }], idempotencyBasis: { state: 'unknown', summary: 'No product idempotency claim is available.', sources: [] } } });
  const record = payload('ev', [event('intent'), next]); validatePayloadAgainstCase(caseOf(), record, [], evidence);
  assert.equal(projectActionAttempts(record.actionEvents!).filter(a => a.unresolved).length, 2);
  assert.throws(() => parseActionEvent({ ...next, retry: { ...next.retry, authorizationSources: [] } }), /authorization/);
  assert.throws(() => validatePayloadAgainstCase(caseOf(), payload('ev', [next]), [], evidence), /earlier, different/);
});
test('unknown and deferred dispositions cannot disappear and a new conflict reopens settled facts', () => {
  const intent = event('intent'), issued = event('issued', 'dispatch'), result = event('result', 'result', 'ev', { resultState: 'known' });
  const confirmed = disposition('confirmed', ['intent', 'issued', 'result']);
  const first = [intent, issued, result, confirmed]; validatePayloadAgainstCase(caseOf(), payload('ev', first), [], evidence); assert.equal(projectActionAttempts(first)[0]?.unresolved, false);
  for (const state of ['unknown', 'deferred', 'conflicting'] as const) {
    const later = disposition('later-' + state, first.map(e => e.id), 'ev', state); assert.equal(projectActionAttempts([...first, later])[0]?.unresolved, true);
  }
  const conflict = event('conflict', 'reconciliation', 'ev', { resultState: 'known', conflictsWithEventIds: ['result'] });
  assert.equal(projectActionAttempts([...first, conflict])[0]?.unresolved, true);
  assert.equal(projectActionAttempts([...first, conflict])[0]?.detail, conflict.summary);
  const incompleteResolution = disposition('partial', ['conflict']); assert.equal(projectActionAttempts([...first, conflict, incompleteResolution])[0]?.unresolved, true);
  const explicitResolution = disposition('reconciled', [...first, conflict].map(e => e.id));
  assert.equal(projectActionAttempts([...first, conflict, explicitResolution])[0]?.unresolved, false);
  assert.equal(projectActionAttempts([...first, conflict, { ...explicitResolution, conflictsWithEventIds: ['result'] }])[0]?.unresolved, true);
  assert.throws(() => parseActionEvent({ ...explicitResolution, evidenceIds: [] }), /require evidence/);
});
test('wrong operations can be retained as facts without becoming the required route or a product verdict', () => {
  const wrong = event('wrong-object', 'dispatch', 'ev', { target: 'Unexpected synthetic object', summary: 'AI clicked the wrong synthetic object.' });
  const record = payload('ev', [wrong]); validatePayloadAgainstCase(caseOf(), record, [], evidence); assert.equal(record.assessments.length, 0);
  const actual = observed('ev', 'violation'); actual.contexts = record.contexts!; actual.actionEvents = record.actionEvents!;
  actual.assessments[0]!.diagnosis = { state: 'unknown', category: 'unknown', summary: 'Independent business readback and root cause remain distinct.', evidenceIds: [] };
  validatePayloadAgainstCase(caseOf(), actual, [], evidence); assert.equal(actual.assessments[0]!.diagnosis!.state, 'unknown');
});
test('unknown or unissued actions cannot prove coverage and dispatch receipts alone cannot prove a business verdict', () => {
  for (const action of [event('unissued', 'dispatch', 'ev', { dispatchState: 'not_issued' }), event('dispatch-unknown', 'dispatch', 'ev', { dispatchState: 'unknown' }), event('unknown-result', 'result')]) {
    const record = observed('ev'); record.contexts = [context()]; record.actionEvents = [action]; record.observations[0]!.actionEventIds = [action.id];
    assert.throws(() => validatePayloadAgainstCase(caseOf(), record, [], evidence), /unsupported action observations/);
    record.observations[0]!.coveredRefs = []; record.assessments = [{ ...record.assessments[0]!, status: 'inconclusive', gaps: ['No known business result.'] }];
    assert.doesNotThrow(() => validatePayloadAgainstCase(caseOf(), record, [], evidence));
  }
  const dispatched = observed('ev'); dispatched.contexts = [context()]; dispatched.actionEvents = [event('issued', 'dispatch')]; dispatched.observations[0]!.actionEventIds = ['issued'];
  for (const status of ['verified', 'violation'] as const) {
    dispatched.assessments[0]!.status = status;
    assert.throws(() => validatePayloadAgainstCase(caseOf(), dispatched, [], evidence), /dispatch receipts alone/);
  }
  dispatched.observations.push({ id: 'independent-readback', summary: 'Independently read the actual business result.', evidenceIds: ['ev'], coveredRefs: [] });
  dispatched.assessments[0]!.observationIds.push('independent-readback'); dispatched.assessments[0]!.status = 'verified';
  assert.doesNotThrow(() => validatePayloadAgainstCase(caseOf(), dispatched, [], evidence));
  for (const resultState of ['known', 'processing', 'failed', 'window_incomplete'] as const) {
    const result = event('observed-result', 'result', 'ev', { resultState, ...(resultState === 'window_incomplete' ? { observationWindow: { startedAt: '2026-10-30T00:00:00Z', endedAt: '2026-10-30T00:01:00Z', source: 'Synthetic clock', limitation: 'Observation bound, not a new SLA.' } } : {}) });
    const record = observed('ev', 'violation'); record.contexts = [context()]; record.actionEvents = [result]; record.observations[0]!.actionEventIds = [result.id];
    assert.doesNotThrow(() => validatePayloadAgainstCase(caseOf(), record, [], evidence));
  }
});
test('every nested local evidence reference maps and missing worker keys are rejected', () => {
  const retry = event('retry-intent', 'intent', 'ev', { actionId: 'create-2', retry: { actionId: 'create-1', rationale: 'Synthetic retry', authorizationSources: fact().sources, idempotencyBasis: fact() } });
  const record = { ...observed('ev'), ...payload('ev', [event('intent'), retry]) }; record.observations = observed('ev').observations; record.assessments = observed('ev').assessments;
  record.assessments[0]!.diagnosis = { state: 'confirmed', category: 'agent', summary: 'Synthetic diagnosis', evidenceIds: ['ev'] };
  const mapped = mapRecordEvidence(record, key => 'registered-' + key); assert.ok(recordEvidenceIds(mapped).every(key => key === 'registered-ev')); assert.equal(recordEvidenceIds(mapped).length, recordEvidenceIds(record).length);
  const packet = { schemaVersion: 8, runId: 'run', baselineSha256: 'a'.repeat(64), caseId: 'one', assignmentId: 'asg-test', attemptId: 'attempt', packetId: 'packet', mode: 'attempt', record, evidence: [], spaceUsage: [{ spaceId: null, reason: 'Synthetic only', evidenceKeys: [] }] };
  assert.throws(() => parsePacket(packet), /Unknown packet evidence key/);
});
test('parallel sealing/import preserves the same action facts and cannot review them away', async t => {
  const f = await fixture(t); let n = 0;
  const exec = async (kind: string, rest: Record<string, unknown> = {}) => executeRequest({ runDir: f.runDir, request: { schemaVersion: 8, operationId: 'exec-' + ++n, expectedRevision: (await readExecutionView(f.runDir)).revision, kind, reason: 'Synthetic execution facts', ...rest } });
  await exec('inventory', { spaceIds: [] }); const assignment = await exec('reserve', { caseId: 'one', baselineSha256: (await readExecutionView(f.runDir)).baselineSha256 }); assert.ok(assignment.assignmentId);
  const dir = path.join(f.runDir, 'workers', assignment.assignmentId), draftFile = path.join(dir, 'draft.json'); await fs.writeFile(path.join(dir, 'facts.log'), 'synthetic facts');
  const workerRecord = payload('local', [event('intent'), event('issued', 'dispatch', 'local'), event('unknown', 'result', 'local')]);
  await writeJSON(draftFile, { schemaVersion: 8, packetId: 'facts-packet', mode: 'attempt', record: workerRecord, evidence: [{ key: 'local', path: 'facts.log', kind: 'log', source: 'Synthetic fixture', description: 'Retained action facts' }], spaceUsage: [{ spaceId: null, reason: 'No browser was used', evidenceKeys: ['local'] }] });
  const sealed = await sealPacket({ runDir: f.runDir, assignment: assignment.assignmentId, draftFile }); const packet = parsePacket(await readJSON(sealed.packetFile));
  assert.throws(() => validateAssessment(packet, caseOf(), { decision: 'revise', reviewer: 'AI', rationale: 'Invalid omission', record: { observations: [], assessments: [], contexts: workerRecord.contexts! } }), /retain immutable worker actionEvents/);
  await exec('import', { packetFile: sealed.packetFile, review: { decision: 'accept', reviewer: 'Synthetic AI', rationale: 'Preserve supplied facts' } });
  const report = await check(f.runDir), current = report.cases[0]!; assert.equal(current.actionEvents.length, 3); assert.equal(current.contexts.length, 1); assert.equal(report.counts.unassessed, 4);
  const committed = current.entries[0]!.record; assert.ok(recordEvidenceIds(committed).every(id => id === report.evidenceCatalog.items[0]!.id)); assert.equal((await progress(f.runDir)).unresolvedActions.length, 1);
  await record(f, { observations: [], assessments: [], actionEvents: [disposition('read-back', ['intent', 'issued', 'unknown'], report.evidenceCatalog.items[0]!.id, 'confirmed_not_occurred')] }, { operationId: 'serial-reconcile', expectedRevision: report.revision });
  assert.equal((await progress(f.runDir)).unresolvedActions.length, 0);
});
test('run-global action and context IDs cannot be reused across cases', async t => {
  const f = await fixture(t), ev = await addEvidence(f); await record(f, payload(ev.evidenceId));
  await assert.rejects(record(f, { observations: [], assessments: [], contexts: [{ ...context(ev.evidenceId), environment: { state: 'unknown', summary: 'Unknown', sources: [] } }] }, { operationId: 'cross-case', caseId: 'two', expectedRevision: 1 }), /different case/);
});
test('successive worker packets explicitly reuse evidence and append to one action, including delta and lost receipt recovery', async t => {
  const f = await fixture(t); let n = 0;
  const exec = async (kind: string, rest: Record<string, unknown> = {}) => executeRequest({ runDir: f.runDir, request: { schemaVersion: 8, operationId: 'continuation-' + ++n, expectedRevision: (await readExecutionView(f.runDir)).revision, kind, reason: 'Synthetic continuation', ...rest } });
  await exec('inventory', { spaceIds: [] }); const assignment = await exec('reserve', { caseId: 'one', baselineSha256: (await readExecutionView(f.runDir)).baselineSha256 }); assert.ok(assignment.assignmentId);
  const dir = path.join(f.runDir, 'workers', assignment.assignmentId), draftFile = path.join(dir, 'draft.json');
  await fs.writeFile(path.join(dir, 'initial.log'), 'Synthetic initial identity and dispatch facts'); await fs.writeFile(path.join(dir, 'readback.log'), 'Synthetic later business readback');
  const initialEvidence = { key: 'initial', path: 'initial.log', kind: 'log', source: 'Synthetic initial acquisition', description: 'Initial facts' };
  const initialRecord = payload('initial', [event('intent'), event('issued', 'dispatch', 'initial'), event('pending', 'result', 'initial')]);
  const draft = (packetId: string, record: RecordPayload, evidence: unknown[]) => ({ schemaVersion: 8, packetId, mode: 'attempt', record, evidence, spaceUsage: [{ spaceId: null, reason: 'Synthetic only', evidenceKeys: [] }] });
  await writeJSON(draftFile, draft('continuation-1', initialRecord, [initialEvidence]));
  const first = await sealPacket({ runDir: f.runDir, assignment: assignment.assignmentId, draftFile });
  await exec('import', { packetFile: first.packetFile, review: { decision: 'accept', reviewer: 'AI', rationale: 'Initial immutable facts' } });
  assert.equal((await sealPacket({ runDir: f.runDir, assignment: assignment.assignmentId, draftFile })).replayed, true);
  const firstReport = await check(f.runDir), initialId = firstReport.evidenceCatalog.items[0]!.id;
  const reusedInitial = { ...initialEvidence, reuseEvidenceId: initialId };
  const readbackEvidence = { key: 'readback', path: 'readback.log', kind: 'log', source: 'Synthetic later acquisition', description: 'Business readback' };
  const cumulative = payload('initial', [...initialRecord.actionEvents!, event('readback-event', 'reconciliation', 'readback', { resultState: 'known' })]);
  await writeJSON(draftFile, draft('continuation-2', cumulative, [reusedInitial, readbackEvidence]));
  const second = await sealPacket({ runDir: f.runDir, assignment: assignment.assignmentId, draftFile });
  const importRequest = { schemaVersion: 8, operationId: 'continuation-second-import', expectedRevision: (await readExecutionView(f.runDir)).revision, kind: 'import', reason: 'Synthetic second delivery', packetFile: second.packetFile, review: { decision: 'accept', reviewer: 'AI', rationale: 'Append readback without a second dispatch' } };
  await assert.rejects(executeRequest({ runDir: f.runDir, request: importRequest }, { afterResultCommit: async () => { throw Error('Synthetic continuation receipt lost'); } }), /receipt lost/);
  await executeRequest({ runDir: f.runDir, request: importRequest });
  const secondReport = await check(f.runDir), c = secondReport.cases[0]!;
  assert.equal(secondReport.evidenceRevision, 2); assert.equal(c.contexts.length, 1); assert.equal(c.actionEvents.length, 4);
  assert.deepEqual(c.actionEvents.slice(0, 3), firstReport.cases[0]!.actionEvents); assert.equal(c.actionEvents.filter(e => e.kind === 'dispatch').length, 1);
  const readbackId = secondReport.evidenceCatalog.items.find(e => e.id !== initialId)!.id;
  const delta: RecordPayload = { observations: [], assessments: [], actionEvents: [disposition('disposition', c.actionEvents.map(e => e.id), 'readback')] };
  await writeJSON(draftFile, draft('continuation-3', delta, [{ ...readbackEvidence, reuseEvidenceId: readbackId }]));
  const third = await sealPacket({ runDir: f.runDir, assignment: assignment.assignmentId, draftFile });
  await exec('import', { packetFile: third.packetFile, review: { decision: 'accept', reviewer: 'AI', rationale: 'Explicit disposition of the original attempt' } });
  const final = await check(f.runDir); assert.equal(final.evidenceRevision, 2); assert.equal(final.cases[0]!.actionEvents.length, 5); assert.equal((await progress(f.runDir)).unresolvedActions.length, 0);
  assert.equal(final.counts.unassessed, 4);
  const workerState = await readExecutionView(f.runDir), reusedJob = workerState.imports.find(i => i.packetId === 'continuation-2')!.evidenceJobs.find(j => j.key === 'initial')!;
  assert.equal(reusedJob.request, undefined); assert.equal(reusedJob.receipt!.evidenceId, initialId); assert.equal(reusedJob.receipt!.collectedAt, firstReport.evidenceCatalog.items[0]!.collectedAt);
});
test('worker reuse rejects missing or cross-case IDs, metadata changes, and references not yet imported', async t => {
  const f = await fixture(t); let n = 0;
  const exec = async (kind: string, rest: Record<string, unknown> = {}) => executeRequest({ runDir: f.runDir, request: { schemaVersion: 8, operationId: 'reuse-guard-' + ++n, expectedRevision: (await readExecutionView(f.runDir)).revision, kind, reason: 'Synthetic reuse guard', ...rest } });
  const registered = await addEvidence(f), crossCase = await addEvidence(f, { operationId: 'cross-case-evidence', expectedRevision: 1, caseId: 'two' });
  await exec('inventory', { spaceIds: [] }); const assignment = await exec('reserve', { caseId: 'one', baselineSha256: (await readExecutionView(f.runDir)).baselineSha256 }); assert.ok(assignment.assignmentId);
  const dir = path.join(f.runDir, 'workers', assignment.assignmentId), draftFile = path.join(dir, 'draft.json'); await fs.copyFile(f.sourceFile, path.join(dir, 'facts.log'));
  const original = (await check(f.runDir)).evidenceCatalog.items.find(e => e.id === registered.evidenceId)!;
  const evidenceItem = { key: 'local', path: 'facts.log', kind: original.kind, source: original.source, description: original.description, reuseEvidenceId: original.id, sha256: original.sha256, bytes: original.bytes };
  const catalog = (await check(f.runDir)).evidenceCatalog;
  for (const changed of [{ ...evidenceItem, kind: 'other' as const }, { ...evidenceItem, source: 'Changed source' }, { ...evidenceItem, description: 'Changed description' }, { ...evidenceItem, sha256: '0'.repeat(64) }, { ...evidenceItem, bytes: evidenceItem.bytes + 1 }, { ...evidenceItem, capturedAt: '2026-10-30T00:00:00Z' }]) assert.throws(() => matchRegisteredEvidence(changed, original.id, 'one', catalog), /metadata or content/);
  const makeDraft = (reuseEvidenceId: string, record: RecordPayload = payload('local')) => ({ schemaVersion: 8, packetId: 'guard-packet', mode: 'attempt', record, evidence: [{ key: evidenceItem.key, path: evidenceItem.path, kind: evidenceItem.kind, source: evidenceItem.source, description: evidenceItem.description, reuseEvidenceId }], spaceUsage: [{ spaceId: null, reason: 'Synthetic', evidenceKeys: [] }] });
  for (const id of ['evidence-from-another-run', crossCase.evidenceId]) {
    await writeJSON(draftFile, makeDraft(id)); await assert.rejects(sealPacket({ runDir: f.runDir, assignment: assignment.assignmentId, draftFile }), /already exist in this run and case/);
  }
  await writeJSON(draftFile, makeDraft(original.id, { observations: [], assessments: [], actionEvents: [event('delta-before-import', 'result', 'local', { resultState: 'known' })] }));
  await assert.rejects(sealPacket({ runDir: f.runDir, assignment: assignment.assignmentId, draftFile }), /Unknown action context/);
  await writeJSON(draftFile, makeDraft(original.id)); const sealed = await sealPacket({ runDir: f.runDir, assignment: assignment.assignmentId, draftFile });
  const packet = parsePacket(await readJSON(sealed.packetFile)); packet.evidence[0]!.reuseEvidenceId = 'not-registered-in-this-run';
  const invalidFile = path.join(dir, 'unsealed-invalid-packet.json'); await writeJSON(invalidFile, packet);
  await assert.rejects(exec('import', { packetFile: invalidFile, review: { decision: 'accept', reviewer: 'AI', rationale: 'Synthetic invalid import' } }), /already exist in this run and case/);
  assert.equal((await check(f.runDir)).revision, 0); assert.equal((await check(f.runDir)).evidenceRevision, 2);
  const fresh = makeDraft(original.id); fresh.packetId = 'fresh-acquisition';
  const { reuseEvidenceId: _reuse, ...freshEvidence } = fresh.evidence[0]!;
  await writeJSON(draftFile, { ...fresh, evidence: [freshEvidence] });
  const freshPacket = await sealPacket({ runDir: f.runDir, assignment: assignment.assignmentId, draftFile });
  await exec('import', { packetFile: freshPacket.packetFile, review: { decision: 'accept', reviewer: 'AI', rationale: 'Explicit new acquisition, even with equal bytes' } });
  const afterFresh = await check(f.runDir); assert.equal(afterFresh.evidenceRevision, 3);
  const newEvidence = afterFresh.evidenceCatalog.items.find(e => ![registered.evidenceId, crossCase.evidenceId].includes(e.id))!;
  assert.ok(newEvidence); assert.equal(newEvidence.sha256, original.sha256); assert.notEqual(newEvidence.id, original.id);
});
