import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { TOOL_ROOT } from '../src/scripts/toolchain.mjs';
import type { Assessment, CheckedCase, ContextFact, EvidenceItem, ExecutionContext, Observation, ResultEntry, ReaderNote } from '../src/contracts/model.mjs';

/** Executes the exact shipped pure model; the DOM reader exits when document is absent. */
const context = vm.createContext({});
vm.runInContext(await fs.readFile(path.join(TOOL_ROOT, 'report-ui/main.js'), 'utf8'), context);
const reader = vm.runInContext('reportViewModel', context) as {
  closure(ids: string[], evidence: EvidenceItem[]): string[];
  goal(c: CheckedCase, goalId: string, evidence: EvidenceItem[]): { observations: Observation[]; contexts: ExecutionContext[]; evidenceIds: string[]; actionEvents: CheckedCase['actionEvents'] };
  current(c: CheckedCase, evidence: EvidenceItem[]): string[];
  historical(c: CheckedCase, evidence: EvidenceItem[]): string[];
  findingRefs(c: CheckedCase, evidence: EvidenceItem[]): string[];
  history(c: CheckedCase, e: ResultEntry, goalId: string): { assessment: Assessment; observations: Observation[]; contexts: ExecutionContext[]; evidenceIds: string[] };
  sceneFindings(c: CheckedCase): { items: CheckedCase['findings']; additional: CheckedCase['findings']; unbound: CheckedCase['findings'] };
  steps(c: CheckedCase, goalId: string, evidence: EvidenceItem[], note?:ReaderNote): {items:{key:string;actionId:string;description:string;title:string;input?:string;result?:string;evidenceIds:string[];sharedEvidenceIds:string[];focus:boolean;arranged:boolean}[];unassignedEvidenceIds:string[]};
  summaryDisclosure(items:string[]):{visible:string[];remaining:string[]};
  requestPreview(input:unknown):{kind:string;records:{method:string;path:string;status:number;body?:string;windowed:boolean}[]}|null;
};
const own = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const fact = (value: string, evidence: string[] = []): ContextFact => ({ state: 'known', summary: value, sources: [{kind:'other',reference:'Synthetic fixture source',evidenceIds:evidence}] });
const ctx: ExecutionContext = { id: 'before', environment: fact('Synthetic old environment'), identity: fact('Synthetic old actor'), objects: fact('Synthetic old object'), initialState: fact('old initial state', ['context-note']), authorization: fact('Synthetic read-only scope') };
const old: Observation = { id: 'old-observation', summary: 'First observation', actual: 'First anomalous actual', contextId: 'before', coveredRefs: [], evidenceIds: ['old-shot'], actions: [{ id: 'first-action', description: 'Original action', input: 'Original input', result: 'Original result', planRefs: [], evidenceIds: ['action-proof'] }], evidenceLinks: [{ evidenceId: 'link-proof', purpose: 'Original purpose', fact: 'Original fact', limitations: ['Original limit'] }] };
const assessment: Assessment = { goalId: 'g', status: 'violation', rationale: 'First violation', observationIds: ['old-observation'], gaps: ['First gap'], summary: 'First summary', phenomena: [{ id: 'p', title: 'First phenomenon', actual: 'First phenomenon actual', observationIds: ['old-observation'], evidenceIds: ['phenomenon-proof'], limitations: ['Phenomenon limit'] }], gapDetails: [{ kind: 'evidence', missing: 'Missing original proof', impact: 'Original impact', nextStep: 'Original preparation' }], diagnosis: { state: 'hypothesis', category: 'product', summary: 'Original diagnosis hypothesis', evidenceIds: ['diagnosis-proof'] }, reproduction: { preparation: ['Original preparation'], limitations: ['Original reproduction limit'], objectState: 'Original object state', repeatability: 'Not repeated' } };
const entry: ResultEntry = { operationId: 'earlier', payloadSha256: 'a'.repeat(64), expectedRevision: 0, revision: 1, recordedAt: '2026-01-01T00:00:00Z', caseId: 'c', mode: 'attempt', record: { observations: [], assessments: [assessment] } };
function fixture(): CheckedCase {
  return { id: 'c', title: 'Synthetic case', criticalConditions: [], requiredPath: null, stepOrder: 'adaptive', steps: [], goals: [{ id: 'g', title: 'Synthetic goal', basis: { kind: 'explicit', source: 'Synthetic source', text: 'Synthetic rule' }, expected: 'Synthetic expected', requiredRefs: [] }], observations: [own(old), { id: 'later', summary: 'Later observation', coveredRefs: [], evidenceIds: ['new-shot'] }], contexts: [own(ctx)], findings: [], actionEvents: [], entries: [entry], missingGoalIds: [], assessments: [{ goalId: 'g', status: 'verified', rationale: 'Later result', observationIds: ['later'], gaps: [], operationId: 'later', revision: 2, recordedAt: '2026-01-02T00:00:00Z' }] };
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

test('a goal follows only explicitly linked action/context evidence and does not borrow other goal facts', () => {
  const c=fixture();
  c.observations[1]!.actionEventIds=['linked-result'];
  c.actionEvents=[{id:'linked-result',actionId:'linked-operation',kind:'result',purpose:'test',contextId:'before',actor:'Synthetic actor',summary:'Independent linked readback',sideEffectRisk:'possible',evidenceIds:['event-proof'],resultState:'known'},{id:'unrelated-result',actionId:'other-operation',kind:'result',purpose:'test',contextId:'before',actor:'Synthetic actor',summary:'Unrelated result in same case',sideEffectRisk:'possible',evidenceIds:['do-not-borrow'],resultState:'known'}];
  const before=JSON.stringify(c),view=own(reader.goal(c,'g',[evidence('event-proof',['event-context']),evidence('event-context')]));
  assert.deepEqual(view.observations.map(o=>o.id),['later']);
  assert.deepEqual(view.actionEvents.map(e=>e.id),['linked-result']);
  assert.deepEqual(view.contexts.map(c=>c.id),['before']);
  for(const id of ['new-shot','event-proof','event-context','context-note'])assert.ok(view.evidenceIds.includes(id),id);
  assert.ok(!view.evidenceIds.includes('do-not-borrow'));
  assert.ok(!view.evidenceIds.includes('old-shot'));
  assert.equal(JSON.stringify(c),before);
});

test('step view never fills actual steps from the plan or historical observations',()=>{
  const c=fixture();c.steps=[{id:'planned-only',action:'Never executed plan'}];const before=JSON.stringify(c),view=own(reader.steps(c,'g',[]));
  assert.deepEqual(view.items,[]);assert.deepEqual(view.unassignedEvidenceIds,['new-shot']);assert.equal(JSON.stringify(c),before);
});

test('step view preserves recorded actions and identifies shared evidence without duplicating or inferring a problem step',()=>{
  const c=fixture();c.assessments[0]!.observationIds=['old-observation'];
  c.observations[0]!.actions!.push({id:'second-action',description:'Recorded independent readback',planRefs:[],evidenceIds:['action-proof','action-proof']});
  const before=JSON.stringify(c),view=own(reader.steps(c,'g',[evidence('action-proof',['context-shot']),evidence('context-shot')]));
  assert.equal(view.items.length,2);assert.deepEqual(view.items.map(s=>s.actionId),['first-action','second-action']);
  assert.equal(view.items[0]!.input,'Original input');assert.equal(view.items[0]!.result,'Original result');
  assert.deepEqual(view.items[1]!.evidenceIds,['action-proof','context-shot']);assert.ok(view.items.every(s=>!s.focus));
  assert.deepEqual(view.items[0]!.sharedEvidenceIds,['action-proof','context-shot']);assert.ok(view.unassignedEvidenceIds.includes('old-shot'));assert.equal(JSON.stringify(c),before);
});

test('sourced display notes choose an existing action and evidence position while empty mappings remain explicitly empty',()=>{
  const c=fixture();c.assessments[0]!.observationIds=['old-observation'];
  const note:ReaderNote={caseId:'c',goalId:'g',title:'Reading title',description:'Reading description',sourceLabels:['Synthetic source'],limitations:['No new execution.'],focusAction:{observationId:'old-observation',actionId:'first-action'},actions:[{observationId:'old-observation',actionId:'first-action',title:'Readable action title',evidenceIds:[]}]};
  const before=JSON.stringify(c),view=own(reader.steps(c,'g',[],note));
  assert.equal(view.items[0]!.title,'Readable action title');assert.equal(view.items[0]!.description,'Original action');assert.equal(view.items[0]!.focus,true);assert.equal(view.items[0]!.arranged,true);assert.deepEqual(view.items[0]!.evidenceIds,[]);
  assert.ok(view.unassignedEvidenceIds.includes('action-proof'));assert.equal(JSON.stringify(c),before);
});

test('scope disclosure always retains all notes and shows at most three before expansion',()=>{
  for(const n of [0,1,3,4,67]){const input=Array.from({length:n},(_,i)=>'Retained note '+i),before=[...input],view=own(reader.summaryDisclosure(input));assert.equal(view.visible.length,Math.min(n,3));assert.deepEqual([...view.visible,...view.remaining],before);assert.deepEqual(input,before);}
});

test('request display uses retained fields and body-window limits without inferring business status',()=>{
  const value={kind:'network-evidence-export',events:[{method:'PATCH',path:'/synthetic/dialog',status:405,bodyPreview:{data:'{"detail":"Synthetic refusal"}',hasMore:true}}]},before=JSON.stringify(value),view=own(reader.requestPreview(value));
  assert.equal(view?.records[0]?.status,405);assert.equal(view?.records[0]?.body,'{"detail":"Synthetic refusal"}');assert.equal(view?.records[0]?.windowed,true);assert.equal(JSON.stringify(value),before);
  const allowed=own(reader.requestPreview({requests:[{path:'/allowed',status:200,body:{data:true}},{path:'/protected',status:403,body:{data:null}}]}));assert.deepEqual(allowed?.records.map(r=>r.status),[200,403]);assert.ok(!Object.hasOwn(allowed??{},'verdict'));
  assert.equal(reader.requestPreview({events:[{status:200}]}),null);assert.equal(reader.requestPreview({requests:[{path:'/x',status:'claimed',body:{}}]}),null);
});
