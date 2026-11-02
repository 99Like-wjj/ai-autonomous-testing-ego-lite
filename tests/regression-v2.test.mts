import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';
import type {RecordPayload} from '../src/contracts/model.mjs';
import type {RunRef} from '../src/regression/model.mjs';
import {fixture,caseOf,addEvidence,record,observed,writeJSON} from './goals-fixture.mjs';
import {prepareSyntheticBinding} from './synthetic-cases.mjs';
import {readCasesFile} from '../src/core/case-versions.mjs';
import {start} from '../src/core/cases.mjs';
import {selectRegression,projectExecutionPlan} from '../src/regression/selection.mjs';
import {parseBindingRequest} from '../src/regression/binding.mjs';
import {readSourceRun} from '../src/regression/sources.mjs';
import {compareRuns} from '../src/regression/compare.mjs';
import {check,registerEvidence,recordResult} from '../src/core/records.mjs';
import {report,verifyReport} from '../src/report/delivery.mjs';
import {sealPacket} from '../src/execution/packets.mjs';
import {executeRequest,readExecutionView} from '../src/execution/commands.mjs';
import {SOURCE_ROOT} from '../src/core/common.mjs';
import {loadSchemaDocuments,conforms,schema} from './schema-support.mjs';
async function refOf(runDir:string):Promise<RunRef>{const s=await readSourceRun(runDir);return{runDir,runId:s.manifest.runId,baselineSha256:s.baselineSha256,resultsRevision:s.results.revision,resultsSha256:s.resultsSha256};}
async function selectedRun(f:Awaited<ReturnType<typeof fixture>>,name:string,pointIds:string[],parents:RunRef[]=[]){
 const saved=await readCasesFile(f.casesFile),selection=await selectRegression({request:{regressionVersion:2,casesFile:f.casesFile,cases:saved.ref,mode:'points',pointIds,sourceRun:null,statuses:[],includeUnassessedCases:false}});
 const outputDir=path.join(f.root,name),bindingFile=await prepareSyntheticBinding({projectDir:f.projectDir,casesFile:f.casesFile,outputDir});
 const binding=JSON.parse(await fs.readFile(bindingFile,'utf8')) as Record<string,unknown>;
 const selectedCases=new Set(selection.candidatePlans.map(p=>p.caseId));binding.selection=selection;binding.plans=selection.candidatePlans;binding.deferred=[];binding.history={parents,primaryBaseline:parents[0]??null,reason:'Explicit synthetic rerun baseline, never inferred from dates.'};
 const conditions=binding.currentConditions as {items:{caseIds:string[]}[]};conditions.items=conditions.items.filter(i=>i.caseIds.some(id=>selectedCases.has(id)));
 const input=path.join(f.projectDir,name+'-binding.json');await writeJSON(input,binding);await start({projectDir:f.projectDir,casesFile:f.casesFile,outputDir,bindingFile:input});return outputDir;
}
test('point projection retains declared dependencies, stable conditions, strict order and mandatory path',()=>{
 const c=caseOf();c.steps[1]!.dependsOn=['create'];c.requiredPath='Authorized application route';c.goals[0]!.requiredRefs.push('requiredPath');c.goals[1]!.requiredRefs.push('requiredPath');
 const plan=projectExecutionPlan(c,[c.goals[1]!.pointId]);assert.deepEqual(plan.stepIds,['create','capacity']);assert.deepEqual(plan.conditionIds,['0']);assert.equal(plan.includeRequiredPath,true);assert.deepEqual(plan.pointIds,[c.goals[1]!.pointId]);
});
test('selected target counts exclude other source goals and all write paths reject their assessments',async t=>{
 const f=await fixture(t),saved=await readCasesFile(f.casesFile),point=saved.baseline.cases[0]!.goals[0]!.pointId,run=await selectedRun(f,'selected',[point]),checked=await check(run);
 assert.equal(checked.goalCount,1);assert.equal(checked.sourceGoalCount,4);assert.equal(checked.counts.unassessed,1);
 const bad:RecordPayload={observations:[],assessments:[{goalId:'capacity',status:'not_tested',rationale:'Synthetic attempted scope expansion',observationIds:[],gaps:['Not selected']}]};
 await assert.rejects(recordResult({runDir:run,request:{schemaVersion:9,operationId:'bad',expectedRevision:0,caseId:'one',mode:'final',record:bad}}),/unselected|outside the frozen point selection/);
 await executeRequest({runDir:run,request:{schemaVersion:9,operationId:'inventory',expectedRevision:0,kind:'inventory',spaceIds:[],reason:'Synthetic empty protected Space inventory'}});
 const state=await readExecutionView(run),reserved=await executeRequest({runDir:run,request:{schemaVersion:9,operationId:'reserve',expectedRevision:1,kind:'reserve',caseId:'one',baselineSha256:state.baselineSha256,resources:[],reason:'Synthetic worker scope test'}});
 const worker=path.join(run,'workers',reserved.assignmentId!),draftFile=path.join(worker,'draft.json');await writeJSON(draftFile,{schemaVersion:9,packetId:'scope-test',mode:'final',record:bad,evidence:[],spaceUsage:[{spaceId:null,reason:'Synthetic no-browser fixture',evidenceKeys:[]}]});
 await assert.rejects(sealPacket({runDir:run,assignment:reserved.assignmentId!,draftFile}),/Unknown goal|unselected/);assert.equal((await check(run)).revision,0);
});
test('status mode reruns whole matching scenarios, with zero hits and unselected history kept distinct',async t=>{
 const f=await fixture(t),ev=await addEvidence(f);await record(f,observed(ev.evidenceId,'violation'));
 const saved=await readCasesFile(f.casesFile),ref=await refOf(f.runDir),request={regressionVersion:2,casesFile:f.casesFile,cases:saved.ref,mode:'status',pointIds:[],sourceRun:ref,statuses:['violation'],includeUnassessedCases:false};
 const selected=await selectRegression({request});assert.equal(selected.selectedPointIds.length,2);assert.equal(selected.matchedPointIds.length,1);
 assert.equal((await selectRegression({request:{...request,statuses:['verified']}})).selectedPointIds.length,0);
 const point=saved.baseline.cases[0]!.goals[0]!.pointId,partial=await selectedRun(f,'partial',[point]),pev=await registerEvidence({runDir:partial,request:{schemaVersion:9,operationId:'p-ev',expectedRevision:0,caseId:'one',sourceFile:f.sourceFile,kind:'log',source:'Synthetic',description:'Synthetic partial facts'}});
 await recordResult({runDir:partial,request:{schemaVersion:9,operationId:'p-result',expectedRevision:0,caseId:'one',mode:'final',record:observed(pev.evidenceId,'violation')}});
 const noExpansion=await selectRegression({request:{...request,sourceRun:await refOf(partial),statuses:['verified'],includeUnassessedCases:true}});assert.equal(noExpansion.selectedPointIds.length,0);assert.ok(noExpansion.sourceStates.some(s=>!s.inSourceScope&&s.status===null));
});
test('full selection retains unprepared definitions and coverage gaps without inventing statuses',async t=>{
 const c=caseOf();c.goals[1]!.planState='unprepared';c.goals[1]!.preparationGaps=['Synthetic missing design dependency'];c.goals[1]!.requiredRefs=[];
 const f=await fixture(t,[c]),saved=await readCasesFile(f.casesFile),selection=await selectRegression({request:{regressionVersion:2,casesFile:f.casesFile,cases:saved.ref,mode:'full',pointIds:[],sourceRun:null,statuses:[],includeUnassessedCases:false}});
 assert.equal(selection.selectedPointIds.length,2);assert.equal(selection.candidatePlans[0]!.pointIds.length,1);assert.ok(selection.gaps.some(g=>g.code==='unprepared'));assert.equal((await check(f.runDir)).counts.unassessed,2);
});
test('original problems bind exact historical records; current verdict, recurrence and new findings stay separate',async t=>{
 const f=await fixture(t),ev=await addEvidence(f);await record(f,observed(ev.evidenceId,'violation'));const old=await refOf(f.runDir),saved=await readCasesFile(f.casesFile),point=saved.baseline.cases[0]!.goals[0]!.pointId,run=await selectedRun(f,'retest',[point],[old]);
 const cur=await registerEvidence({runDir:run,request:{schemaVersion:9,operationId:'current-ev',expectedRevision:0,caseId:'one',sourceFile:f.sourceFile,kind:'log',source:'Synthetic current collection',description:'Fresh synthetic readback; separate collection ID'}});
 const payload=observed(cur.evidenceId);payload.assessments[0]!.problemChecks=[{source:{run:old,caseId:'one',goalId:'saved',operationId:'missing'},state:'not_observed',rationale:'Synthetic original symptom absent',observationIds:['readback'],gaps:[]}];
 await assert.rejects(recordResult({runDir:run,request:{schemaVersion:9,operationId:'result',expectedRevision:0,caseId:'one',mode:'final',record:payload}}),/not retained/);
 payload.assessments[0]!.problemChecks[0]!.source.operationId='result-1';await recordResult({runDir:run,request:{schemaVersion:9,operationId:'result',expectedRevision:0,caseId:'one',mode:'final',record:payload}});
 const current=await check(run);assert.equal(current.counts.verified,1);assert.equal(current.cases[0]!.assessments[0]!.problemChecks![0]!.state,'not_observed');assert.equal((await check(f.runDir)).counts.violation,1);
 const comparison=await compareRuns({request:{regressionVersion:2,left:old,right:await refOf(run)}});assert.equal(comparison.rows.find(r=>r.pointId===point)!.comparability,null);assert.equal(comparison.rows.find(r=>r.pointId===saved.baseline.cases[0]!.goals[1]!.pointId)!.right!.selected,false);
});
test('first report stays clean; rerun bundles exact historical evidence and verifies after original directory moves',async t=>{
 const f=await fixture(t),ev=await addEvidence(f);await record(f,observed(ev.evidenceId,'violation'));const firstDir=path.join(f.root,'first-report');await fs.mkdir(firstDir);await report(f.runDir,{outputDir:firstDir});assert.equal(JSON.parse(await fs.readFile(path.join(firstDir,'report.json'),'utf8')).history,undefined);
 const old=await refOf(f.runDir),saved=await readCasesFile(f.casesFile),point=saved.baseline.cases[0]!.goals[0]!.pointId,run=await selectedRun(f,'history-run',[point],[old]),out=path.join(f.root,'history-report');await fs.mkdir(out);
 const delivery=await report(run,{outputDir:out});assert.equal(delivery.deliveryMode,'bundle');const result=JSON.parse(await fs.readFile(path.join(out,'report.json'),'utf8'));assert.equal(result.goalCount,1);assert.equal(result.counts.unassessed,1);assert.equal(result.history.nodes[0].points.find((p:{pointId:string})=>p.pointId===point).status,'violation');assert.equal(result.evidenceCatalog.items.length,0);assert.equal(result.history.evidence[0].item.id,ev.evidenceId);
 const originalHash=await fs.readFile(path.join(f.runDir,'results.json'),'utf8');const moved=path.join(f.root,'moved-old-run');assert.equal(path.dirname(moved),f.root);assert.equal(path.dirname(f.runDir),f.root);await fs.rename(f.runDir,moved);
 assert.equal((await verifyReport(run,out)).filesVerified,true);assert.equal(await fs.readFile(path.join(moved,'results.json'),'utf8'),originalHash);
 const manifest=JSON.parse(await fs.readFile(path.join(out,'report-delivery.json'),'utf8'));await fs.appendFile(path.join(out,...manifest.attachments[0].path.split('/')),'corrupt');await assert.rejects(verifyReport(run,out),/match|changed/);
});
test('missing historical materials produce an explicit partial history without altering current four-state counts',async t=>{
 const f=await fixture(t),old=await refOf(f.runDir),saved=await readCasesFile(f.casesFile),run=await selectedRun(f,'missing-history',[saved.baseline.cases[0]!.goals[0]!.pointId],[old]),out=path.join(f.root,'partial-report');await fs.mkdir(out);const moved=path.join(f.root,'missing-original');assert.equal(path.dirname(moved),f.root);await fs.rename(f.runDir,moved);
 await report(run,{outputDir:out});const result=JSON.parse(await fs.readFile(path.join(out,'report.json'),'utf8'));assert.equal(result.history.complete,false);assert.equal(result.history.gaps.length,1);assert.equal(result.counts.unassessed,1);assert.equal(result.goalCount,1);
});
test('explicit location mappings restore exact moved history without rewriting frozen parent references or scanning',async t=>{
 const f=await fixture(t),ev=await addEvidence(f);await record(f,observed(ev.evidenceId,'violation'));
 const old=await refOf(f.runDir),saved=await readCasesFile(f.casesFile),run=await selectedRun(f,'mapped-history',[saved.baseline.cases[0]!.goals[0]!.pointId],[old]),moved=path.join(f.root,'explicit-old-location');
 assert.equal(path.dirname(moved),f.root);await fs.rename(f.runDir,moved);const map=path.join(f.root,'history-locations.json');await writeJSON(map,{schemaVersion:9,locations:[{runId:old.runId,runDir:moved}]});
 const out=path.join(f.root,'mapped-report');await fs.mkdir(out);await report(run,{outputDir:out,historyLocationsFile:map});const value=JSON.parse(await fs.readFile(path.join(out,'report.json'),'utf8'));
 assert.equal(value.history.complete,true);assert.equal(value.history.roots[0].runDir,old.runDir);assert.equal(value.history.nodes[0].resolvedRunDir,moved);assert.equal(value.history.nodes[0].points[0].definition.pointId,saved.baseline.cases[0]!.goals[0]!.pointId);assert.equal((await verifyReport(run,out)).filesVerified,true);
 const documents=await loadSchemaDocuments(path.join(SOURCE_ROOT,'schemas')),document=documents.get('report-history.schema.json')!;assert.ok(conforms(value.history,schema(document),document,documents),'Actual scoped history must conform to the published source schema.');
});
test('multiple parent branches retain their own source revisions and share ancestry without merging verdicts',async t=>{
 const f=await fixture(t),ev=await addEvidence(f);await record(f,observed(ev.evidenceId,'violation'));const old=await refOf(f.runDir),saved=await readCasesFile(f.casesFile),id=saved.baseline.cases[0]!.goals[0]!.pointId;
 const branch=await selectedRun(f,'branch',[id],[old]),branchRef=await refOf(branch),current=await selectedRun(f,'merge-view',[id],[branchRef,old]),out=path.join(f.root,'branch-report');await fs.mkdir(out);await report(current,{outputDir:out});
 const value=JSON.parse(await fs.readFile(path.join(out,'report.json'),'utf8'));assert.equal(value.history.nodes.length,2);assert.equal(value.history.primaryBaseline.runId,branchRef.runId);assert.equal(value.history.nodes.find((n:{ref:{runId:string}})=>n.ref.runId===branchRef.runId).points[0].status,null);assert.equal(value.history.nodes.find((n:{ref:{runId:string}})=>n.ref.runId===old.runId).points[0].status,'violation');assert.equal(value.counts.unassessed,1);
});
test('binding cannot drop selected targets, alter dependencies, or silently coerce precise parameter types',async t=>{
 const c=caseOf();c.parameters=[{id:'amount',type:'decimal',purpose:'Exact synthetic value',constraints:['Fixed criterion remains unchanged.']}];c.steps[1]!.dependsOn=['create'];const f=await fixture(t,[c]),saved=await readCasesFile(f.casesFile),file=await prepareSyntheticBinding({projectDir:f.projectDir,casesFile:f.casesFile,outputDir:path.join(f.root,'unused')});
 const binding=JSON.parse(await fs.readFile(file,'utf8'));assert.doesNotThrow(()=>parseBindingRequest(binding,saved.baseline));
 const missing=structuredClone(binding);missing.plans[0].pointIds.pop();await assert.rejects(Promise.resolve().then(()=>parseBindingRequest(missing,saved.baseline)),/projection|exactly once/);
 const plan=structuredClone(binding);plan.plans[0].stepIds=['capacity'];assert.throws(()=>parseBindingRequest(plan,saved.baseline),/projection/);
 const source={id:'input',locator:'Synthetic exact input',file:null,sha256:null,excerpt:'Exact decimal 0.10',limitations:[]};const precise=structuredClone(binding);precise.parameterBindings=[{caseId:'one',parameterId:'amount',value:0.1,source}];assert.throws(()=>parseBindingRequest(precise,saved.baseline),/type mismatch/);precise.parameterBindings[0].value='0.10';assert.equal(parseBindingRequest(precise,saved.baseline).parameterBindings[0]!.value,'0.10');
});
