import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {saveCases,readCasesFile,listCaseVersions} from '../src/core/case-versions.mjs';
import {reviewCases,verifyCaseApprovals} from '../src/core/case-review.mjs';
import {renderCases,verifyCaseDocuments} from '../src/report/case-documents.mjs';
import {caseOf} from './goals-fixture.mjs';
async function workspace(t:TestContext){const root=await fs.mkdtemp(path.join(os.tmpdir(),'ego-case-version-'));t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('ego-case-version-'));await fs.rm(root,{recursive:true,force:true});});return root;}
function firstRequest(){const c=caseOf();return{schemaVersion:9,expectedVersion:0,previousSha256:null,project:'Synthetic version tests',pointPrefix:'SAMPLE',reason:'Synthetic initial definition',cases:[{...c,goals:c.goals.map(g=>({...g,pointId:null}))}],sources:[],coverage:[],retiredPoints:[],changes:[]};}
function nextRequest(saved:Awaited<ReturnType<typeof readCasesFile>>){const b=saved.baseline;return{schemaVersion:9,expectedVersion:b.caseVersion,previousSha256:saved.ref.sha256,project:b.project,pointPrefix:b.pointPrefix,reason:'Synthetic changed definition',cases:structuredClone(b.cases),sources:b.sources,coverage:b.coverage,retiredPoints:b.retiredPoints,changes:[]};}
async function approve(file:string,pointIds:string[],number=0,decision='approved',source='Synthetic human source 1'){const b=await readCasesFile(file);return reviewCases({casesFile:file,request:{schemaVersion:9,cases:b.ref,expectedReviewNumber:number,pointIds,decision,comments:[],source:{id:'source-'+number,locator:source,file:null,sha256:null,excerpt:'Synthetic protocol input, not a human or business acceptance.',limitations:['Synthetic engineering fixture.']},sourceKind:'user_statement',delegationSource:null}});}
test('whole-file publication allocates IDs once, recovers lost receipt and rejects competing requests',async t=>{
 const workDir=await workspace(t),request=firstRequest();await assert.rejects(saveCases({workDir,request,hooks:{afterPublish:async()=>{throw Error('Synthetic lost receipt');}}}),/lost receipt/);
 const replay=await saveCases({workDir,request});assert.equal(replay.replayed,true);const saved=await readCasesFile(replay.file);assert.deepEqual(saved.baseline.cases[0]!.goals.map(g=>g.pointId),['SAMPLE-TP-000001','SAMPLE-TP-000002']);
 await assert.rejects(saveCases({workDir,request:{...request,reason:'Competing change'}}),/conflict/);assert.equal((await listCaseVersions(path.join(workDir,'cases'))).length,1);
});
test('unchanged definitions create no version; retirement and new allocation never reuse a published number',async t=>{
 const workDir=await workspace(t),one=await readCasesFile((await saveCases({workDir,request:firstRequest()})).file);
 const noChange=await saveCases({workDir,request:nextRequest(one)});assert.equal(noChange.unchanged,true);
 const request=nextRequest(one),removed=request.cases[0]!.goals.pop()!;request.cases[0]!.steps=request.cases[0]!.steps.filter(s=>s.id!=='capacity');request.retiredPoints=[{pointId:removed.pointId,reason:'Explicit synthetic retirement',replacements:[]}];
 const two=await readCasesFile((await saveCases({workDir,request})).file),third=nextRequest(two);
 third.cases[0]!.steps.push(one.baseline.cases[0]!.steps[1]!);third.cases[0]!.goals.push({...removed,id:'new',pointId:removed.pointId});await assert.rejects(saveCases({workDir,request:third}),/reuse|retired|allocate|retirement/i);
 third.cases[0]!.goals.at(-1)!.pointId=null as unknown as string;const three=await readCasesFile((await saveCases({workDir,request:third})).file);assert.equal(three.baseline.cases[0]!.goals.at(-1)!.pointId,'SAMPLE-TP-000003');assert.equal(three.baseline.retiredPoints[0]!.pointId,'SAMPLE-TP-000002');
});
test('source or predecessor changes before publication do not create a new case version',async t=>{
 const workDir=await workspace(t),one=await readCasesFile((await saveCases({workDir,request:firstRequest()})).file),request=nextRequest(one);request.cases[0]!.goals[0]!.expected+=' changed';
 await assert.rejects(saveCases({workDir,request,hooks:{beforePublish:async()=>{await fs.appendFile(one.file,' ');}}}),/changed/);await assert.rejects(fs.stat(path.join(workDir,'cases','v002.json')),{code:'ENOENT'});
});
test('unchanged point approval carries to a new version; changed necessary semantics require a new actual confirmation',async t=>{
 const workDir=await workspace(t),one=await readCasesFile((await saveCases({workDir,request:firstRequest()})).file),ids=one.baseline.cases[0]!.goals.map(g=>g.pointId),review=await approve(one.file,ids);
 const request=nextRequest(one);request.cases[0]!.goals[0]!.expected+=' changed';const two=await readCasesFile((await saveCases({workDir,request})).file);
 await verifyCaseApprovals(two.file,two.baseline,[ids[1]!],[review.file]);await assert.rejects(verifyCaseApprovals(two.file,two.baseline,[ids[0]!],[review.file]),/Review required/);
 const approval=await approve(two.file,[ids[0]!],0,'approved','Synthetic new actual confirmation');await verifyCaseApprovals(two.file,two.baseline,ids,[review.file,approval.file]);
 const shared=nextRequest(two);shared.cases[0]!.criticalConditions[0]!.text+=' changed';const three=await readCasesFile((await saveCases({workDir,request:shared})).file);await assert.rejects(verifyCaseApprovals(three.file,three.baseline,ids,[review.file,approval.file]),/Review required/);
});
test('a later change request cannot be bypassed with an old approval; feedback flags do not approve',async t=>{
 const workDir=await workspace(t),one=await readCasesFile((await saveCases({workDir,request:firstRequest()})).file),ids=one.baseline.cases[0]!.goals.map(g=>g.pointId),first=await approve(one.file,ids);
 await approve(one.file,[ids[0]!],1,'changes_requested','Synthetic actual change request');await assert.rejects(verifyCaseApprovals(one.file,one.baseline,[ids[0]!],[first.file]),/newer change request/);
 await verifyCaseApprovals(one.file,one.baseline,[ids[1]!],[first.file]);
 await assert.rejects(reviewCases({casesFile:one.file,request:{schemaVersion:9,cases:one.ref,expectedReviewNumber:2,decision:'approved',pointIds:ids,comments:[],sourceKind:'feedback_file',source:{id:'feedback',locator:'Synthetic offline export',file:null,sha256:null,excerpt:'approved',limitations:[]},delegationSource:null}}),/actual human/);
});
test('same-source HTML and Markdown preserve point definitions and create no run; altered artifacts fail verification',async t=>{
 const workDir=await workspace(t),saved=await readCasesFile((await saveCases({workDir,request:firstRequest()})).file),out=path.join(workDir,'documents');
 const docs=await renderCases({casesFile:saved.file,outputDir:out});assert.equal(docs.businessExecuted,false);assert.match(await fs.readFile(docs.html,'utf8'),/SAMPLE-TP-000001/);await assert.rejects(fs.stat(path.join(workDir,'runs')),{code:'ENOENT'});
 await verifyCaseDocuments({casesFile:saved.file,outputDir:out});await fs.appendFile(docs.markdown,'\nchanged');await assert.rejects(verifyCaseDocuments({casesFile:saved.file,outputDir:out}),/changed/);
});
test('explicit changes requested in received feedback cannot be bypassed with an earlier approval',async t=>{
 const workDir=await workspace(t),one=await readCasesFile((await saveCases({workDir,request:firstRequest()})).file),ids=one.baseline.cases[0]!.goals.map(g=>g.pointId),initial=await approve(one.file,ids);
 await reviewCases({casesFile:one.file,request:{schemaVersion:9,cases:one.ref,expectedReviewNumber:1,decision:'changes_requested',pointIds:[ids[0]],comments:[{pointId:ids[0],text:'Explicit synthetic requested change.'}],sourceKind:'feedback_file',source:{id:'received-feedback',locator:'Actual synthetic feedback file receipt',file:null,sha256:null,excerpt:'Requested change, not approval.',limitations:['Engineering fixture.']},delegationSource:null}});
 await assert.rejects(verifyCaseApprovals(one.file,one.baseline,[ids[0]!],[initial.file]),/newer change request/);await verifyCaseApprovals(one.file,one.baseline,[ids[1]!],[initial.file]);
});
export {firstRequest,nextRequest,approve};
