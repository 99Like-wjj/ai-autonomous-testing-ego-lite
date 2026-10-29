import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { TOOL_ROOT } from '../src/scripts/toolchain.mjs';
import type { Assessment, CheckedCase, ContextFact, EvidenceItem, ExecutionContext, Observation, ResultEntry } from '../src/contracts/model.mjs';

/** Executes the exact shipped pure model; the DOM reader exits when document is absent. */
const context = vm.createContext({});
vm.runInContext(await fs.readFile(path.join(TOOL_ROOT, 'report-ui/main.js'), 'utf8'), context);
const reader = vm.runInContext('reportViewModel', context) as {
  closure(ids: string[], evidence: EvidenceItem[]): string[];
  current(c: CheckedCase, evidence: EvidenceItem[]): string[];
  historical(c: CheckedCase, evidence: EvidenceItem[]): string[];
  findingRefs(c: CheckedCase, evidence: EvidenceItem[]): string[];
  history(c: CheckedCase, e: ResultEntry, goalId: string): { assessment: Assessment; observations: Observation[]; contexts: ExecutionContext[]; evidenceIds: string[] };
  sceneFindings(c: CheckedCase): { items: CheckedCase['findings']; additional: CheckedCase['findings']; unbound: CheckedCase['findings'] };
};
const own = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const fact = (value: string, evidence: string[] = []): ContextFact => ({ state: 'known', summary: value, sources: [{kind:'other',reference:'Synthetic fixture source',evidenceIds:evidence}] });
const ctx: ExecutionContext = { id: 'before', environment: fact('Synthetic old environment'), identity: fact('Synthetic old actor'), objects: fact('Synthetic old object'), initialState: fact('old initial state', ['context-note']), authorization: fact('Synthetic read-only scope') };
const old: Observation = { id: 'old-observation', summary: 'First observation', actual: 'First anomalous actual', contextId: 'before', coveredRefs: [], evidenceIds: ['old-shot'], actions: [{ id: 'first-action', description: 'Original action', input: 'Original input', result: 'Original result', planRefs: [], evidenceIds: ['action-proof'] }], evidenceLinks: [{ evidenceId: 'link-proof', purpose: 'Original purpose', fact: 'Original fact', limitations: ['Original limit'] }] };
const assessment: Assessment = { goalId: 'g', status: 'violation', rationale: 'First violation', observationIds: ['old-observation'], gaps: ['First gap'], summary: 'First summary', phenomena: [{ id: 'p', title: 'First phenomenon', actual: 'First phenomenon actual', observationIds: ['old-observation'], evidenceIds: ['phenomenon-proof'], limitations: ['Phenomenon limit'] }], gapDetails: [{ kind: 'evidence', missing: 'Missing original proof', impact: 'Original impact', nextStep: 'Original preparation' }], diagnosis: { state: 'hypothesis', category: 'product', summary: 'Original diagnosis hypothesis', evidenceIds: ['diagnosis-proof'] }, reproduction: { preparation: ['Original preparation'], limitations: ['Original reproduction limit'], objectState: 'Original object state', repeatability: 'Not repeated' } };
const entry: ResultEntry = { operationId: 'earlier', payloadSha256: 'a'.repeat(64), expectedRevision: 0, revision: 1, recordedAt: '2026-01-01T00:00:00Z', caseId: 'c', mode: 'attempt', record: { observations: [], assessments: [assessment] } };
function fixture(): CheckedCase {
  return { id: 'c', title: 'Synthetic case', criticalConditions: [], requiredPath: null, stepOrder: 'adaptive', steps: [], goals: [{ id: 'g', title: 'Synthetic goal', basis: { kind: 'explicit', source: 'Synthetic source', text: 'Synthetic rule' }, expected: 'Synthetic expected', requiredRefs: [] }], observations: [old, { id: 'later', summary: 'Later observation', coveredRefs: [], evidenceIds: ['new-shot'] }], contexts: [ctx], findings: [], actionEvents: [], entries: [entry], missingGoalIds: [], assessments: [{ goalId: 'g', status: 'verified', rationale: 'Later result', observationIds: ['later'], gaps: [], operationId: 'later', revision: 2, recordedAt: '2026-01-02T00:00:00Z' }] };
}
function evidence(id: string, refs: string[] = []): EvidenceItem {
  return { id, caseId: 'c', kind: 'screenshot', path: 'evidence/' + id + '.png', source: 'Synthetic evidence', description: id, sha256: 'b'.repeat(64), bytes: 1, collectedAt: '2026-01-01T00:00:00Z', operationId: 'register-' + id, metadata: { contextEvidenceIds: refs } };
}
test('context evidence closure includes nested relationships and terminates on cycles', () => {
  const evidenceItems = [evidence('shot', ['context']), evidence('context', ['note']), evidence('note', ['shot']), evidence('unrelated')];
  assert.deepEqual(own(reader.closure(['shot', 'shot'], evidenceItems)), ['shot', 'context', 'note']);
  assert.deepEqual(own(reader.closure([], evidenceItems)), []);
});
test('current and historical classifications carry their own context-image closures', () => {
  const c = fixture(), items = [evidence('old-shot', ['old-context-image']), evidence('old-context-image'), evidence('new-shot', ['new-context-image']), evidence('new-context-image')];
  assert.deepEqual(own(reader.current(c, items)), ['new-shot', 'new-context-image']);
  const oldRefs = own(reader.historical(c, items));
  for (const id of ['old-shot', 'old-context-image', 'context-note', 'action-proof', 'link-proof', 'phenomenon-proof', 'diagnosis-proof']) assert.ok(oldRefs.includes(id), id);
  assert.ok(!oldRefs.includes('new-context-image'));
});
test('history resolves reused immutable observations and preserves every original judgment field', () => {
  const c = fixture(), before = JSON.stringify(c), view = own(reader.history(c, entry, 'g'));
  assert.deepEqual(view.assessment, assessment);
  assert.deepEqual(view.observations, [old]);
  assert.deepEqual(view.contexts, [ctx]);
  assert.equal(view.observations[0]?.actions?.[0]?.input, 'Original input');
  assert.equal(view.assessment.diagnosis?.summary, 'Original diagnosis hypothesis');
  assert.equal(view.assessment.reproduction?.objectState, 'Original object state');
  assert.equal(JSON.stringify(c), before);
});
test('an additional finding without goal IDs remains visible without becoming a goal or verdict', () => {
  const c = fixture();
  c.findings.push({ id: 'extra', title: 'Additional synthetic finding', goalIds: [], observationIds: ['old-observation'], evidenceIds: ['extra-proof'], relationReason: 'Observed outside the original goal', reviewState: 'proposed', scope: 'additional' });
  const before = JSON.stringify(c), view = own(reader.sceneFindings(c));
  assert.equal(view.items.length, 1); assert.equal(view.additional[0]?.id, 'extra'); assert.equal(view.unbound[0]?.id, 'extra');
  assert.equal(c.goals.length, 1); assert.equal(c.assessments[0]?.status, 'verified'); assert.equal(JSON.stringify(c), before);
  assert.ok(reader.findingRefs(c, []).includes('extra-proof'));
  assert.ok(!reader.current(c, []).includes('extra-proof'));
});
