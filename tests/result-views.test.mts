import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fixture,caseOf,addEvidence,observed,request,record,untested,writeJSON } from './goals-fixture.mjs';
import { check } from '../src/core/records.mjs';
import { readCurrentContext,readHistoricalContext,projectContext,contextOptions } from '../src/core/result-views.mjs';
import { recordWithFeedback } from '../src/core/record-feedback.mjs';
import { reviewHints } from '../src/core/review-hints.mjs';
import { reviewPrompts } from '../src/report/reviewability.mjs';
import { objectValue } from './support.mjs';
import { conforms,loadSchemaDocuments,schema } from './schema-support.mjs';
import { SOURCE_ROOT } from '../src/scripts/toolchain.mjs';
import { readSourceRun,sourceContext } from '../src/regression/sources.mjs';
const read=async(run:string,options:Parameters<typeof readCurrentContext>[1]={})=>await readCurrentContext(run,options) as ReturnType<typeof projectContext>;
async function conformsTo(value:unknown,name:string){const docs=await loadSchemaDocuments(path.join(SOURCE_ROOT,'schemas')),d=docs.get(name)!;assert.ok(conforms(JSON.parse(JSON.stringify(value)),schema(d),d,docs));}

test('bounded goal indices distinguish missing assessments and globally stable point IDs',async t=>{
  const f=await fixture(t),ev=await addEvidence(f);await record(f,observed(ev.evidenceId));
  const v=await read(f.runDir,{view:'goals',limit:1});assert.equal(v.pagination.total,4);assert.equal(v.pagination.nextOffset,1);assert.equal(v.items[0]!.status,'verified');
  const next=await read(f.runDir,{view:'goals',offset:1,limit:1});assert.equal(next.items[0]!.status,null);assert.equal(next.items[0]!.assessed,false);
  const b=await read(f.runDir,{view:'goals',caseId:'two'});assert.equal(b.items[0]!.goalId,'saved');assert.notEqual(b.items[0]!.pointId,v.items[0]!.pointId);
  assert.equal(b.filteredCounts.unassessed,2);await conformsTo(v,'context-read.schema.json');
});
test('single-point views preserve full expectations, transitive dependencies and required path',async t=>{
  const c=caseOf();c.steps[1]!.dependsOn=['create'];c.requiredPath='Use the synthetic list before details.';c.steps.push({id:'third',action:'Inspect final synthetic state.',dependsOn:['capacity']});c.goals[0]!.requiredRefs=['condition:0','step:third'];for(const g of c.goals)g.requiredRefs.push('requiredPath');
  const f=await fixture(t,[c]),v=await read(f.runDir,{view:'goals'}),point=await read(f.runDir,{view:'point',pointId:v.items[0]!.pointId});
  const p=objectValue(point.point),plan=objectValue(p.plan);assert.deepEqual((plan.steps as {id:string}[]).map(s=>s.id),['create','capacity','third']);assert.equal(plan.path,c.requiredPath);assert.equal(objectValue(p.definition).expected,c.goals[0]!.expected);
  assert.deepEqual(p.requiredRefs,['step:create','step:capacity','step:third','condition:0','requiredPath']);await conformsTo(point,'context-read.schema.json');
});
test('oversized points require explicit export; exports preserve content and refuse overwrite/run writes',async t=>{
  const c=caseOf();c.goals[0]!.expected='Exact synthetic expectation: '+'x'.repeat(10000);const f=await fixture(t,[c]);
  const index=await read(f.runDir,{view:'goals'}),pointId=index.items[0]!.pointId;
  await assert.rejects(read(f.runDir,{view:'point',pointId,maxBytes:2048}),/POINT_EXCEEDS_OUTPUT_BUDGET/);
  const outputFile=path.join(f.root,'point.json'),receipt=objectValue(await readCurrentContext(f.runDir,{view:'point',pointId,maxBytes:2048,outputFile}));assert.equal(receipt.businessExecuted,false);
  await conformsTo(receipt,'context-read.schema.json');
  const saved=JSON.parse(await fs.readFile(outputFile,'utf8'));assert.equal(saved.point.definition.expected,c.goals[0]!.expected);
  await assert.rejects(readCurrentContext(f.runDir,{view:'point',pointId,outputFile}),/exist/i);
  await assert.rejects(readCurrentContext(f.runDir,{outputFile:path.join(f.runDir,'new-context.json')}),/outside the source run/);
  await assert.rejects(read(f.runDir,{expectedResultsRevision:1}),/SNAPSHOT_CHANGED/);await assert.rejects(read(f.runDir,{view:'point',pointId:'missing'}),/POINT_NOT_FOUND/);
});
test('large goal pages obey actual UTF-8 budget without modifying the source run',async t=>{
  const f=await fixture(t,Array.from({length:30},(_,i)=>caseOf('c'+i)));const names=['baseline.json','results.json','evidence.json','execution.json','run-binding.json'];const before=await Promise.all(names.map(n=>fs.readFile(path.join(f.runDir,n))));
  const v=await read(f.runDir,{view:'goals',limit:100,maxBytes:5000});assert.ok(Buffer.byteLength(JSON.stringify(v,null,2)+'\n')<=5000);assert.ok(v.items.length>0&&v.items.length<60);assert.ok(v.pagination.nextOffset!>0);
  const summary=await read(f.runDir),full=sourceContext(await readSourceRun(f.runDir));const bytes=(v:unknown)=>Buffer.byteLength(JSON.stringify(v,null,2)+'\n');
  assert.ok(bytes(summary)<bytes(full));assert.deepEqual(summary.counts,v.counts);
  t.diagnostic(JSON.stringify({syntheticGoals:60,fullContextBytes:bytes(full),summaryBytes:bytes(summary),goalPageBytes:bytes(v),goalPageItems:v.items.length,note:'Output bytes only; no model token or business-efficiency claim.'}));
  assert.deepEqual(await Promise.all(names.map(n=>fs.readFile(path.join(f.runDir,n)))),before);
});
test('history is pinned to a prefix and full export is explicit',async t=>{
  const f=await fixture(t),ev=await addEvidence(f);await record(f,observed(ev.evidenceId));await record(f,untested(),{operationId:'second',expectedRevision:1});
  const old=objectValue(await readHistoricalContext(f.runDir,{view:'goals'},1));assert.equal(objectValue(old.scope).resultsRevision,1);assert.equal(objectValue(old.counts).not_tested,0);
  await assert.rejects(readHistoricalContext(f.runDir,{view:'full'}),/REQUIRES_OUTPUT_FILE/);
  const file=path.join(f.root,'history.json');await readHistoricalContext(f.runDir,{view:'full',outputFile:file},1);const saved=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(saved.normative.schemaVersion,9);assert.equal(saved.scope.kind,'historical');
  await fs.writeFile(path.join(f.runDir,'.evidence.pending.json'),'{}');await assert.rejects(readHistoricalContext(f.runDir),/unfinished/);assert.equal(await fs.readFile(path.join(f.runDir,'.evidence.pending.json'),'utf8'),'{}');
});
test('view options reject ignored combinations and invalid numeric budgets',()=>{
  for(const options of [{view:'point'},{view:'goals',pointId:'p'},{view:'summary',caseId:'c'},{view:'full'},{limit:0},{maxBytes:2047},{offset:NaN}])assert.throws(()=>contextOptions(options));
});
test('point export retains evidence referenced only by identity/context facts',async t=>{
  const f=await fixture(t),contextEv=await addEvidence(f),observedEv=await addEvidence(f,{operationId:'second-evidence',expectedRevision:1});
  const fact={state:'known' as const,summary:'Synthetic identity checked independently',sources:[{kind:'evidence' as const,reference:'Synthetic source',evidenceIds:[contextEv.evidenceId]}]};
  const payload=observed(observedEv.evidenceId);payload.contexts=[{id:'ctx',environment:fact,identity:fact,objects:fact,initialState:fact,authorization:fact}];payload.observations[0]!.contextId='ctx';await record(f,payload);
  const index=await read(f.runDir,{view:'goals'}),v=await read(f.runDir,{view:'point',pointId:index.items[0]!.pointId}),point=objectValue(v.point);
  assert.deepEqual(new Set((point.evidence as {id:string}[]).map(e=>e.id)),new Set([contextEv.evidenceId,observedEv.evidenceId]));
});
test('unresolved writes retain run-wide counts and independent pagination',async t=>{
  const f=await fixture(t),ev=await addEvidence(f);
  const fact={state:'known' as const,summary:'Synthetic retained context',sources:[{kind:'evidence' as const,reference:'Synthetic context evidence',evidenceIds:[ev.evidenceId]}]};
  await record(f,{observations:[],assessments:[],contexts:[{id:'ctx',environment:fact,identity:fact,objects:fact,initialState:fact,authorization:fact}],actionEvents:Array.from({length:30},(_,i)=>({id:'intent-'+i,actionId:'action-'+i,kind:'intent' as const,purpose:'test' as const,contextId:'ctx',actor:'fixture',summary:'Synthetic unknown write '+i,sideEffectRisk:'possible' as const,evidenceIds:[],target:'object-'+i,inputs:['synthetic'],sideEffects:['Synthetic possible write']}))},{mode:'attempt'});
  const v=await read(f.runDir,{limit:2});assert.equal(v.unresolvedPagination.total,30);assert.equal(v.unresolved.length,2);assert.equal(v.unresolvedPagination.nextOffset,2);assert.equal(v.counts.unassessed,4);
  const second=await read(f.runDir,{offset:2,limit:2});assert.notEqual(v.unresolved[0]!.actionId,second.unresolved[0]!.actionId);
});
test('record feedback shares report hints, pins replays and preserves the original result receipt',async t=>{
  const f=await fixture(t),ev=await addEvidence(f),req=request(observed(ev.evidenceId));
  const r=await recordWithFeedback({runDir:f.runDir,request:req});assert.equal(r.committed,true);assert.equal(r.feedback.status,'available');assert.equal(r.feedback.caseUnassessedCount,1);assert.equal(r.feedback.hints[0]!.code,'missing_reading');
  const report=await check(f.runDir);assert.deepEqual(r.feedback.hints,reviewHints({cases:[report.cases[0]!]}));assert.equal(reviewPrompts(report)[0]!.code,r.feedback.hints[0]!.code);assert.equal(report.counts.verified,1);
  await record(f,untested(),{operationId:'second',expectedRevision:1});const replay=await recordWithFeedback({runDir:f.runDir,request:req});assert.equal(replay.receipt.replayed,true);assert.equal(replay.feedback.asOfResultsRevision,1);assert.equal(replay.feedback.caseUnassessedCount,1);assert.equal((await check(f.runDir)).revision,2);
  await conformsTo(r,'record-response.schema.json');
});
test('feedback failure or disabling does not turn a successful commit into a failure',async t=>{
  const f=await fixture(t);const r=await recordWithFeedback({runDir:f.runDir,request:request(untested())},{},()=>{throw Error('Synthetic hint failure');});assert.equal(r.committed,true);assert.equal(r.feedback.status,'unavailable');assert.equal((await check(f.runDir)).revision,1);
  const disabled=await recordWithFeedback({runDir:f.runDir,request:request(untested()),feedback:'none'});assert.equal(disabled.receipt.replayed,true);assert.equal(disabled.feedback.status,'disabled');
  const changed=untested();changed.assessments[0]!.rationale='Different synthetic declaration for the same operation.';
  await assert.rejects(recordWithFeedback({runDir:f.runDir,request:request(changed)}),/different payload/);
});
test('a post-commit interruption is reconciled by the original local operation, never a new write',async t=>{
  const f=await fixture(t),req=request(untested());await assert.rejects(recordWithFeedback({runDir:f.runDir,request:req},{afterCommit:async()=>{throw Error('Synthetic interrupted response');}}),/interrupted/);
  const r=await recordWithFeedback({runDir:f.runDir,request:req});assert.equal(r.receipt.replayed,true);assert.equal(r.receipt.revision,1);assert.equal((await check(f.runDir)).revision,1);
});
