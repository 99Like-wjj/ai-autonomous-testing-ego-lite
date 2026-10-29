import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SOURCE_ROOT } from '../src/core/common.mjs';
import { parseActionEvent, parseContextFact, parseFactSource, projectActionAttempts, recordEvidenceIds } from '../src/core/action-events.mjs';
import { parseRecordRequest } from '../src/core/validation.mjs';
import { validatePayloadAgainstCase } from '../src/core/records.mjs';

import { asObject, conforms, schema } from './schema-support.mjs';

async function fixture() {
  const document = asObject(JSON.parse(await fs.readFile(path.join(SOURCE_ROOT, 'schemas/common.schema.json'), 'utf8')));
  const request = asObject(JSON.parse(await fs.readFile(path.join(SOURCE_ROOT, 'examples/action-lifecycle-record.example.json'), 'utf8')));
  const record = asObject(request.record); assert.ok(Array.isArray(record.actionEvents));
  return { document, request, record, defs: asObject(document.$defs), events: record.actionEvents.map(asObject) };
}

test('the lifecycle example satisfies the source schema and the frozen parser without manufacturing a verdict', async () => {
  const f = await fixture(); assert.ok(conforms(f.record, schema(f.defs.recordPayload), f.document));
  const request = parseRecordRequest(f.request), evidence = new Map(recordEvidenceIds(request.record).map(id => [id, { caseId: request.caseId }]));
  validatePayloadAgainstCase({ id: request.caseId, title: 'Synthetic lifecycle only', criticalConditions: [], requiredPath: null, stepOrder: 'adaptive', steps: [{ id: 'read', action: 'Read the synthetic fixture.' }], goals: [{ id: 'synthetic-goal', basis: { kind: 'hypothesis', source: 'Synthetic contract fixture', text: 'No real acceptance criterion is asserted.' }, expected: 'Replace this synthetic expectation before real execution.', requiredRefs: ['step:read'] }] }, request.record, [], evidence);
  assert.deepEqual(new Set(request.record.actionEvents!.map(e => e.kind)), new Set(['intent', 'dispatch', 'result', 'reconciliation', 'disposition']));
  assert.equal(request.record.assessments.length, 0); assert.equal(projectActionAttempts(request.record.actionEvents!)[0]!.unresolved, false);
});

test('schema kind requirements and forbidden state fields agree with runtime parsing', async () => {
  const f = await fixture(), eventSchema = schema(f.defs.actionEvent);
  const byKind = (kind: string) => structuredClone(f.events.find(e => e.kind === kind)!);
  const rejects = (value: unknown) => { assert.equal(conforms(value, eventSchema, f.document), false); assert.throws(() => parseActionEvent(value)); };
  const required: Record<string, string[]> = { intent: ['target', 'inputs', 'sideEffects'], dispatch: ['dispatchState', 'acceptanceState'], result: ['resultState'], reconciliation: ['resultState', 'readOnly'], disposition: ['disposition'] };
  for (const [kind, keys] of Object.entries(required)) for (const key of keys) { const value = byKind(kind); delete value[key]; rejects(value); }
  const fields: Record<string, unknown> = { dispatchState: 'issued', acceptanceState: 'accepted', resultState: 'known', readOnly: true, observationWindow: f.events.find(e => e.resultState === 'window_incomplete')!.observationWindow, disposition: byKind('disposition').disposition };
  const forbidden: Record<string, string[]> = { intent: ['dispatchState', 'acceptanceState', 'resultState', 'readOnly', 'observationWindow', 'disposition'], dispatch: ['resultState', 'readOnly', 'observationWindow', 'disposition'], result: ['dispatchState', 'acceptanceState', 'readOnly', 'disposition'], reconciliation: ['dispatchState', 'acceptanceState', 'disposition'], disposition: ['dispatchState', 'acceptanceState', 'resultState', 'readOnly', 'observationWindow'] };
  for (const [kind, keys] of Object.entries(forbidden)) for (const key of keys) rejects({ ...byKind(kind), [key]: fields[key] });
});

test('time pairing, bounded observations, conflict evidence and unresolved facts match parser boundaries', async () => {
  const f = await fixture(), eventSchema = schema(f.defs.actionEvent), dispatch = f.events.find(e => e.kind === 'dispatch')!, result = f.events.find(e => e.kind === 'result')!, intent = f.events.find(e => e.kind === 'intent')!;
  const accepts = (value: unknown) => { assert.equal(conforms(value, eventSchema, f.document), true); assert.doesNotThrow(() => parseActionEvent(value)); };
  const rejects = (value: unknown) => { assert.equal(conforms(value, eventSchema, f.document), false); assert.throws(() => parseActionEvent(value)); };
  const noSource = { ...dispatch }; delete noSource.timeSource; rejects(noSource);
  const noTime = { ...dispatch }; delete noTime.occurredAt; rejects(noTime);
  rejects({ ...result, resultState: 'window_incomplete' });
  for (const event of f.events.filter(e => e.kind === 'reconciliation' || e.kind === 'disposition' || e.kind === 'dispatch' || e.resultState === 'processing' || e.resultState === 'window_incomplete')) rejects({ ...event, evidenceIds: [] });
  rejects({ ...dispatch, dispatchState: 'not_issued', evidenceIds: [] });
  accepts({ ...dispatch, dispatchState: 'unknown', acceptanceState: 'unknown', evidenceIds: [] });
  accepts({ ...result, resultState: 'unknown', evidenceIds: [] }); accepts(intent);
  rejects({ ...result, resultState: 'unknown', evidenceIds: [], conflictsWithEventIds: ['synthetic-intent'] });
  accepts({ ...result, resultState: 'unknown', evidenceIds: [], conflictsWithEventIds: [] });
  const disposition = f.events.find(e => e.kind === 'disposition')!;
  rejects({ ...disposition, disposition: { ...asObject(disposition.disposition), resolvesEventIds: [] } });
  const window = f.events.find(e => e.resultState === 'window_incomplete')!;
  const backwards = { ...window, observationWindow: { ...asObject(window.observationWindow), endedAt: '2026-10-29T23:59:00Z' } };
  assert.equal(conforms(backwards, eventSchema, f.document), true); assert.throws(() => parseActionEvent(backwards), /ends before/);
});

test('known context facts and evidence-source references have the same minimum provenance in schema and parser', async () => {
  const f = await fixture();
  const known = { state: 'known', summary: 'Synthetic known fact without provenance', sources: [] };
  assert.equal(conforms(known, schema(f.defs.contextFact), f.document), false); assert.throws(() => parseContextFact(known));
  const unknown = { ...known, state: 'unknown' };
  assert.equal(conforms(unknown, schema(f.defs.contextFact), f.document), true); assert.doesNotThrow(() => parseContextFact(unknown));
  const missingEvidence = { kind: 'evidence', reference: 'Synthetic missing evidence', evidenceIds: [] };
  assert.equal(conforms(missingEvidence, schema(f.defs.factSource), f.document), false); assert.throws(() => parseFactSource(missingEvidence));
  assert.throws(() => conforms({}, { unsupportedKeyword: true }, {}), /Unsupported fixture-schema keyword/);
});
