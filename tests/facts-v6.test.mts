import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Baseline, RecordPayload, ExecutionContext } from '../src/contracts/model.mjs';
import { init, start, normalizeCases } from '../src/core/cases.mjs';
import { check, checkUnlocked, registerEvidence, recordResult, validatePayloadAgainstCase } from '../src/core/records.mjs';
import { withRunLock } from '../src/core/common.mjs';
import { parsePayload, parseEvidenceMetadata, parseContextFact } from '../src/core/validation.mjs';
import { executeRequest, readExecutionView } from '../src/execution/commands.mjs';
import { sealPacket } from '../src/execution/packets.mjs';
import { orderedEvidence } from '../src/execution/parse.mjs';

const baseline: Baseline = { schemaVersion: 6, project: 'Synthetic v6 transaction proof', cases: [{ id: 'scene', title: 'Synthetic scene', criticalConditions: [], requiredPath: null, stepOrder: 'adaptive', steps: [{ id: 'save', action: 'Save and independently read a synthetic value.' }], goals: [{ id: 'saved', title: 'Saved value persists', basis: { kind: 'explicit', source: 'Synthetic requirement', text: 'Saved values persist.' }, expected: 'The stored value matches the input.', requiredRefs: ['step:save'] }] }] };
async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ego-facts-v6-'));
  t.after(async () => { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('ego-facts-v6-')); await fs.rm(root, { recursive: true, force: true }); });
  const projectDir = path.join(root, 'project'), runDir = path.join(root, 'run'); await init(projectDir);
  const casesFile = path.join(projectDir, 'cases.json'); await fs.writeFile(casesFile, JSON.stringify(baseline));
  await start({ projectDir, casesFile, outputDir: runDir });
  const sourceFile = path.join(root, 'evidence.json'); await fs.writeFile(sourceFile, '{"synthetic":true,"value":"saved"}');
  let operation = 0;
  const exec = async (kind: string, extra: Record<string, unknown> = {}) => executeRequest({ runDir, request: { schemaVersion: 6, operationId: 'exec-' + ++operation, expectedRevision: (await readExecutionView(runDir)).revision, reason: 'Synthetic data transaction', kind, ...extra } });
  return { root, projectDir, runDir, sourceFile, exec };
}
function rich(evidenceId: string): RecordPayload {
  const known = { state: 'known' as const, value: 'Synthetic isolated value', sourceEvidenceIds: [evidenceId] };
  const context: ExecutionContext = { id: 'ctx', environment: known, actor: known, object: known, initialState: known, authorization: { state: 'not_applicable', reason: 'No business operation in a transaction fixture.', sourceEvidenceIds: [] } };
  return { contexts: [context], observations: [{ id: 'obs', contextId: context.id, summary: 'Read synthetic saved value', actual: 'Value equals saved.', occurredAt: '2026-10-29T04:00:00.000Z', coveredRefs: ['step:save'], evidenceIds: [evidenceId], actions: [{ id: 'read', description: 'Read the retained fixture.', input: 'synthetic id', result: 'saved', planRefs: ['step:save'], evidenceIds: [evidenceId] }], evidenceLinks: [{ evidenceId, actionId: 'read', purpose: 'Independent readback', fact: 'The stored value equals saved.', limitations: ['Synthetic evidence only.'] }] }],
    assessments: [{ goalId: 'saved', status: 'verified', summary: 'Synthetic persisted value matches.', rationale: 'Expected and actual are equal in the synthetic fixture.', observationIds: ['obs'], gaps: [], phenomena: [{ id: 'match', title: 'Saved value', actual: 'saved', observationIds: ['obs'], evidenceIds: [evidenceId], limitations: ['Not a business test.'] }], reproduction: { preparation: ['Create the synthetic fixture.'], limitations: ['No live system.'], objectState: 'Retained until fixture cleanup.', repeatability: 'One synthetic read.' } }],
    findings: [{ id: 'finding', title: 'Synthetic related observation', goalIds: ['saved'], observationIds: ['obs'], evidenceIds: [evidenceId], relationReason: 'Explicit same synthetic object.', reviewState: 'proposed', scope: 'original' }] };
}
test('v6 rich serial facts persist, reuse contexts and preserve immutable history', async t => {
  const f = await fixture(t);
  const ev = await registerEvidence({ runDir: f.runDir, request: { schemaVersion: 6, operationId: 'evidence', expectedRevision: 0, caseId: 'scene', sourceFile: f.sourceFile, kind: 'log', source: 'Synthetic local source', description: 'Readback evidence', metadata: { mediaType: 'application/json', contentState: 'summary', purpose: 'Verify synthetic value' } } });
  const record = rich(ev.evidenceId), request = { schemaVersion: 6, operationId: 'record', expectedRevision: 0, caseId: 'scene', mode: 'final', record };
  await recordResult({ runDir: f.runDir, request }); assert.equal((await recordResult({ runDir: f.runDir, request })).replayed, true);
  const c = (await check(f.runDir)).cases[0]!; assert.equal(c.contexts[0]!.actor.value, 'Synthetic isolated value'); assert.equal(c.findings.length, 1); assert.equal(c.observations[0]!.actions![0]!.result, 'saved'); assert.equal(c.assessments[0]!.phenomena![0]!.evidenceIds[0], ev.evidenceId);
  const changed = structuredClone(record.contexts![0]!); changed.actor.value = 'Changed actor';
  await assert.rejects(recordResult({ runDir: f.runDir, request: { ...request, operationId: 'changed', expectedRevision: 1, record: { contexts: [changed], observations: [], assessments: [] } } }), /Context ID.*different content/);
  await recordResult({ runDir: f.runDir, request: { ...request, operationId: 'revision', expectedRevision: 1, record: { observations: [], assessments: [{ ...record.assessments[0]!, previousOperationId: 'record', revisionReason: 'Additional presentation explanation without new execution.' }] } } });
  const result = await check(f.runDir); assert.equal(result.cases[0]!.entries.length, 2); assert.equal(result.counts.verified, 1); assert.equal(result.cases[0]!.assessments[0]!.previousOperationId, 'record');
});

test('v6 refuses fabricated references and unresolved structured gaps for verified', () => {
  const c = baseline.cases[0]!, payload = rich('proof'), evidence = new Map([['proof', { caseId: 'scene' }]]);
  assert.doesNotThrow(() => validatePayloadAgainstCase(c, payload, [], evidence));
  const action = structuredClone(payload); action.observations[0]!.actions![0]!.planRefs = ['step:never']; assert.throws(() => validatePayloadAgainstCase(c, action, [], evidence), /unknown plan reference/);
  const context = structuredClone(payload); context.observations[0]!.contextId = 'missing'; assert.throws(() => validatePayloadAgainstCase(c, context, [], evidence), /Unknown context/);
  const link = structuredClone(payload); link.observations[0]!.evidenceLinks![0]!.actionId = 'missing'; assert.throws(() => validatePayloadAgainstCase(c, link, [], evidence), /Unknown linked action/);
  const gap = structuredClone(payload); gap.assessments[0]!.gapDetails = [{ kind: 'evidence', missing: 'Actual proof', impact: 'Cannot support result.' }]; assert.throws(() => validatePayloadAgainstCase(c, gap, [], evidence), /unresolved gaps/);
  const phenotype = structuredClone(payload); phenotype.assessments[0]!.phenomena![0]!.observationIds = ['other']; assert.throws(() => validatePayloadAgainstCase(c, phenotype, [], evidence), /Phenomenon/);
  assert.throws(() => validatePayloadAgainstCase(c, payload, [], new Map([['proof', { caseId: 'another' }]])), /different case/);
  assert.throws(() => parseContextFact({ state: 'unknown', value: 'assertion', reason: 'missing', sourceEvidenceIds: [] }), /must not assert/);
  assert.throws(() => parseContextFact({ state: 'unknown', sourceEvidenceIds: [] }), /require a reason/);
  assert.throws(() => parseEvidenceMetadata({ contentState: 'truncated' }), /omission reason/);
  assert.throws(() => parseEvidenceMetadata({ width: 12 }), /both width and height/);
  assert.throws(() => parsePayload({ observations: [], assessments: [], contexts: [] }), /must contain/);
});

test('v6 worker import maps all nested evidence and context relations with recoverable commits', async t => {
  const f = await fixture(t); await f.exec('inventory', { spaceIds: [] });
  const reserved = await f.exec('reserve', { caseId: 'scene', baselineSha256: (await readExecutionView(f.runDir)).baselineSha256 }); assert.ok(reserved.assignmentId);
  const worker = path.join(f.runDir, 'workers', reserved.assignmentId); await fs.writeFile(path.join(worker, 'detail.json'), '{"value":"saved"}'); await fs.writeFile(path.join(worker, 'context.json'), '{"context":"synthetic"}');
  const draftFile = path.join(worker, 'draft.json');
  await fs.writeFile(draftFile, JSON.stringify({ schemaVersion: 6, packetId: 'packet', mode: 'final', record: rich('detail'), evidence: [{ key: 'detail', path: 'detail.json', kind: 'log', source: 'Synthetic worker', description: 'Detail', metadata: { contentState: 'summary', contextEvidenceIds: ['context'] } }, { key: 'context', path: 'context.json', kind: 'other', source: 'Synthetic worker', description: 'Context' }], spaceUsage: [{ spaceId: null, reason: 'Transaction fixture; no browser', evidenceKeys: [] }] }));
  const sealed = await sealPacket({ runDir: f.runDir, assignment: reserved.assignmentId, draftFile });
  const request = { schemaVersion: 6, operationId: 'import-once', expectedRevision: (await readExecutionView(f.runDir)).revision, kind: 'import', reason: 'Synthetic explicit review', packetFile: sealed.packetFile, review: { decision: 'accept', reviewer: 'Synthetic AI', rationale: 'Review synthetic facts.' } };
  await assert.rejects(executeRequest({ runDir: f.runDir, request }, { afterResultCommit: async () => { throw Error('Injected receipt interruption'); } }), /receipt interruption/);
  await executeRequest({ runDir: f.runDir, request });
  const result = await check(f.runDir), c = result.cases[0]!, detail = result.evidenceCatalog.items.find(e => e.description === 'Detail')!, context = result.evidenceCatalog.items.find(e => e.description === 'Context')!;
  assert.equal(result.evidenceCatalog.items.length, 2); assert.equal(result.revision, 1); assert.deepEqual(detail.metadata?.contextEvidenceIds, [context.id]);
  assert.equal(c.contexts[0]!.actor.sourceEvidenceIds[0], detail.id); assert.equal(c.observations[0]!.actions![0]!.evidenceIds[0], detail.id); assert.equal(c.observations[0]!.evidenceLinks![0]!.evidenceId, detail.id); assert.equal(c.assessments[0]!.phenomena![0]!.evidenceIds[0], detail.id); assert.equal(c.findings[0]!.evidenceIds[0], detail.id);
  assert.equal(JSON.parse(await fs.readFile(sealed.packetFile, 'utf8')).record.observations[0].evidenceIds[0], 'detail');
});

test('v6 rejects legacy baseline and cyclic context-image dependency without rewriting inputs', () => {
  const old = { ...baseline, schemaVersion: 5 }, original = JSON.stringify(old);
  assert.throws(() => normalizeCases(old), /schemaVersion 6/); assert.equal(JSON.stringify(old), original);
  const missingTitle = structuredClone(baseline) as unknown as { cases: { goals: { title?: string }[] }[] }; delete missingTitle.cases[0]!.goals[0]!.title;
  assert.throws(() => normalizeCases(missingTitle), /goal title/);
  const missingFollowUp = structuredClone(baseline); missingFollowUp.cases[0]!.goals[0]!.followUpOf = { runId: 'self', caseId: 'absent', goalId: 'absent', reason: 'Synthetic reference check.' };
  assert.throws(() => normalizeCases(missingFollowUp), /Unknown same-run follow-up/);
  assert.throws(() => orderedEvidence([{ key: 'a', metadata: { contextEvidenceIds: ['b'] } }, { key: 'b', metadata: { contextEvidenceIds: ['a'] } }]), /Cyclic/);
});

test('explicit draft inspection tolerates only absent screenshots and keeps strict transactions', async t => {
  const f = await fixture(t);
  const e = await registerEvidence({ runDir: f.runDir, request: { schemaVersion: 6, operationId: 'shot', expectedRevision: 0, caseId: 'scene', sourceFile: f.sourceFile, kind: 'screenshot', source: 'Synthetic fixture', description: 'Missing screenshot fixture' } });
  const file = path.join(f.runDir, ...e.path.split('/')); await fs.unlink(file);
  await assert.rejects(check(f.runDir), /ENOENT/);
  const draft = await withRunLock(f.runDir, root => checkUnlocked(root, { allowMissingScreenshots: true }));
  assert.deepEqual(draft.evidenceIntegrity, { hashVerifiedItems: 0, missingScreenshotIds: [e.evidenceId] });
  await assert.rejects(recordResult({ runDir: f.runDir, request: { schemaVersion: 6, operationId: 'record', expectedRevision: 0, caseId: 'scene', mode: 'final', record: rich(e.evidenceId) } }), /ENOENT/);
  await fs.writeFile(file, 'changed pixels');
  await assert.rejects(withRunLock(f.runDir, root => checkUnlocked(root, { allowMissingScreenshots: true })), /hash or byte count mismatch/);
  await fs.writeFile(file, await fs.readFile(f.sourceFile));
  const log = await registerEvidence({ runDir: f.runDir, request: { schemaVersion: 6, operationId: 'text', expectedRevision: 1, caseId: 'scene', sourceFile: f.sourceFile, kind: 'log', source: 'Synthetic fixture', description: 'Missing text must fail' } });
  await fs.unlink(path.join(f.runDir, ...log.path.split('/')));
  await assert.rejects(withRunLock(f.runDir, root => checkUnlocked(root, { allowMissingScreenshots: true })), /ENOENT/);
});
