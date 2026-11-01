import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {syntheticCase,syntheticCases,startSyntheticRun} from './synthetic-cases.mjs';
import {check,registerEvidence,recordResult} from '../src/core/records.mjs';
import {parseConversation,parseConversationBytes,pointerValue,validateConversationSources,validateConversationActions} from '../src/core/conversations.mjs';
import {captureDomText,type CaptureTextPage} from '../src/ego-helpers/capture-text.mjs';
import {reviewPrompts} from '../src/report/reviewability.mjs';
import {validateReportContext,report as deliver,verifyReport} from '../src/report/delivery.mjs';
import {htmlReportPayload,htmlReport,markdown} from '../src/report/render.mjs';
import {executeRequest,readExecutionView} from '../src/execution/commands.mjs';
import {sealPacket} from '../src/execution/packets.mjs';
import {hash} from '../src/core/common.mjs';
import {TOOL_ROOT} from '../src/scripts/toolchain.mjs';
import {registeredConversationViews} from '../src/report/conversations.mjs';
import type {ConversationArtifact,HtmlPayload,RecordPayload} from '../src/contracts/model.mjs';
const write=(file:string,value:unknown)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n');
function conversation():ConversationArtifact{return{conversationVersion:1,id:'dialog',title:'合成对话，不是真实业务证据',limitations:['仅用于工程验证'],messages:[
  {id:'u1',role:'user',format:'text',content:'请列出两个检查项。',presentation:'verbatim',completeness:'complete',state:'final',completionBasis:'合成提交文本',sourceRefs:[{sourceId:'raw',jsonPointer:'/input'}],limitations:[]},
  {id:'a1',role:'assistant',format:'markdown',content:'## 检查\n\n1. 核对对象\n2. 核对结果\n\n|项目|状态|\n|---|---|\n|结果|待核对|',presentation:'normalized',completeness:'complete',state:'final',completionBasis:'合成采集结束记录；不代表业务完成',sourceRefs:[{sourceId:'raw',jsonPointer:'/answer',quote:'核对对象'}],limitations:['按合成正文整理Markdown']}
]};}
const raw=()=>({input:'请列出两个检查项。',answer:'检查\n核对对象\n核对结果\n项目 状态\n结果 待核对'});
const payload=(conversationId:string):RecordPayload=>({observations:[{id:'observed',summary:'合成观察',actual:'已看到两个检查项，未进行真实业务测试。',phase:{expected:'after',observed:'after',basis:'合成动作后的读回'},coveredRefs:['step:ask'],evidenceIds:[conversationId],actions:[{id:'asked',description:'输入一个合成问题并观察回复',input:raw().input,inputPresentation:'verbatim',inputSummary:'要求列出两个检查项。',replySummary:'给出对象和结果两个检查项。',result:'合成文字已保管',planRefs:['step:ask'],evidenceIds:[conversationId],conversations:[{evidenceId:conversationId,messageIds:['u1','a1']}]}]}],assessments:[{goalId:'answer',status:'verified',rationale:'合成输入提供两个检查项，仅验证工程链路。',observationIds:['observed'],gaps:[],display:{title:'合成回复列出了两个检查项',actual:'输入要求两个检查项，留存内容包含“核对对象”和“核对结果”。',impact:'本条合成目标的内容可复核。',dimension:'content'}}]});
async function fixture(t:TestContext){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ego-conversation-synthetic-'));
  t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('ego-conversation-synthetic-'));await fs.rm(root,{recursive:true,force:true});});
  const project=path.join(root,'project'),run=path.join(root,'run'),casesFile=path.join(project,'cases','v001.json');await fs.mkdir(path.dirname(casesFile),{recursive:true});
  await write(casesFile,syntheticCases([syntheticCase({id:'c',title:'合成对话场景',criticalConditions:[],requiredPath:null,stepOrder:'strict',steps:[{id:'ask',action:'输入合成问题并查看实际回复'}],goals:['answer','other'].map(id=>({id,title:id,basis:{kind:'explicit' as const,source:'合成需求',text:'仅验证工程链路'},expected:'合成期望',requiredRefs:['step:ask']}))})]));
  await startSyntheticRun({projectDir:project,casesFile,outputDir:run});
  const sourceFile=path.join(root,'raw.json'),normalizedFile=path.join(root,'conversation.json');await write(sourceFile,raw());await write(normalizedFile,conversation());
  return{root,run,sourceFile,normalizedFile};
}
async function registered(f:Awaited<ReturnType<typeof fixture>>){
  const source=await registerEvidence({runDir:f.run,request:{schemaVersion:9,operationId:'raw',expectedRevision:0,caseId:'c',sourceFile:f.sourceFile,kind:'dom',source:'合成采集',description:'合成原始文本'}});
  const doc=await registerEvidence({runDir:f.run,request:{schemaVersion:9,operationId:'conversation',expectedRevision:1,caseId:'c',sourceFile:f.normalizedFile,kind:'conversation',source:'AI按合成原件整理',description:'合成完整对话',metadata:{conversationSources:[{sourceId:'raw',evidenceId:source.evidenceId}],contentState:'full'}}});
  return{sourceId:source.evidenceId,conversationId:doc.evidenceId};
}

test('provider-neutral conversation sources reject fabricated originals, invalid pointers and complete summaries',()=>{
  const value=conversation(),sources=new Map([['raw',{text:JSON.stringify(raw())}]]);
  validateConversationSources(parseConversation(value),sources);assert.equal(pointerValue('{"a/b":{"~key":"原文"}}','/a~1b/~0key'),'原文');
  for(const pointer of ['bad','/~3','/__proto__/polluted'])assert.throws(()=>pointerValue('{}',pointer));
  const fabricated=structuredClone(value);fabricated.messages[0]!.content='伪造的输入';assert.throws(()=>validateConversationSources(fabricated,sources),/verbatim/);
  const summary=structuredClone(value);summary.messages[1]!.presentation='summary';assert.throws(()=>parseConversation(summary),/summary/);
  const quote=structuredClone(value);quote.messages[1]!.sourceRefs[0]!.quote='不存在的原文';assert.throws(()=>validateConversationSources(quote,sources),/quote/);
  assert.throws(()=>validateConversationSources(value,new Map([['raw',{text:'x',excluded:true}]])),/excluded/);
  assert.throws(()=>parseConversation({...value,providerRoute:'company-chat-stream'}),/Unexpected conversation artifact key/);
  assert.throws(()=>parseConversationBytes(new Uint8Array([0xff,0xfe])),/UTF-8/);
});

test('registration preserves normalized bytes and original sources; action bindings and display survive serial delivery',async t=>{
  const f=await fixture(t),ids=await registered(f),record=payload(ids.conversationId);await recordResult({runDir:f.run,request:{schemaVersion:9,operationId:'result',expectedRevision:0,caseId:'c',mode:'final',record}});
  const checked=await check(f.run),before=JSON.stringify(checked),p=await htmlReportPayload(f.run,checked);
  assert.equal(checked.counts.verified,1);assert.equal(checked.counts.unassessed,1);assert.equal(checked.conversationEvidence?.[ids.conversationId]?.messages.length,2);
  assert.equal(p.conversations?.[ids.conversationId]?.sources[0]?.evidenceId,ids.sourceId);assert.deepEqual(checked.evidenceCatalog.items[1]?.metadata?.contextEvidenceIds,[ids.sourceId]);
  assert.ok(htmlReport(p).includes('conversation-dialog'));assert.ok(markdown(checked,p).includes('要求列出两个检查项'));
  const folder=path.join(f.root,'delivery');await fs.mkdir(folder);await deliver(f.run,{outputDir:folder,deliveryMode:'bundle'});assert.equal((await verifyReport(f.run,folder)).filesVerified,true);assert.equal(JSON.stringify(await check(f.run)),before);
  const entry=checked.evidenceCatalog.items.find(e=>e.id===ids.conversationId)!;assert.equal(hash(await fs.readFile(path.join(f.run,entry.path))),hash(await fs.readFile(f.normalizedFile)));
  const bad=payload(ids.conversationId);bad.observations[0]!.id='new-observation';bad.assessments[0]!.observationIds=['new-observation'];bad.observations[0]!.actions![0]!.conversations![0]!.messageIds=['not-retained'];await assert.rejects(recordResult({runDir:f.run,request:{schemaVersion:9,operationId:'bad',expectedRevision:1,caseId:'c',mode:'final',record:bad}}),/unknown conversation message/);
  assert.equal((await check(f.run)).revision,1);
});

test('verbatim input may be supported by one of multiple explicitly linked artifacts, never by unlinked messages',()=>{
  const record=payload('dialog'),action=record.observations[0]!.actions![0]!;
  action.conversations!.push({evidenceId:'reply',messageIds:['a1']});action.evidenceIds.push('reply');
  validateConversationActions(record,{dialog:conversation(),reply:conversation()});action.input='different';assert.throws(()=>validateConversationActions(record,{dialog:conversation(),reply:conversation()}),/Verbatim action input/);
});

test('retrospective conversations bind existing current-goal actions, verify source hashes and cannot revise verdicts',async t=>{
  const f=await fixture(t),ids=await registered(f);await recordResult({runDir:f.run,request:{schemaVersion:9,operationId:'result',expectedRevision:0,caseId:'c',mode:'final',record:payload(ids.conversationId)}});
  const checked=await check(f.run),before=JSON.stringify(checked),context={schemaVersion:9,kind:'retrospective',summary:'只读整理',supplementalCaseIds:[],limitations:['未重跑业务'],sources:[{label:'normalized',file:f.normalizedFile,sha256:hash(await fs.readFile(f.normalizedFile))}],conversations:[{caseId:'c',goalId:'answer',sourceLabel:'normalized',sourceBindings:[{sourceId:'raw',evidenceId:ids.sourceId}],actions:[{observationId:'observed',actionId:'asked',messageIds:['u1','a1']}],limitations:['基于原件事后整理，无新执行']} ]};
  checked.context=await validateReportContext(context,checked,f.run);const p=await htmlReportPayload(f.run,checked),view=Object.values(p.conversations??{}).find(v=>v.retrospective)!;
  assert.equal(view.artifact.messages.length,2);assert.equal(view.actions[0]?.actionId,'asked');assert.equal(checked.counts.verified,1);
  const contextFile=path.join(f.root,'context.json'),deliveryDir=path.join(f.root,'context-delivery');await write(contextFile,context);await fs.mkdir(deliveryDir);
  const delivered=await deliver(f.run,{outputDir:deliveryDir,contextFile});assert.equal(delivered.deliveryMode,'bundle');assert.equal((await verifyReport(f.run,deliveryDir)).filesVerified,true);
  const html=await fs.readFile(path.join(deliveryDir,'report.html'),'utf8'),match=html.match(/<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/)!;const deliveredPayload=JSON.parse(match[1]!) as HtmlPayload;
  const deliveredFile=deliveredPayload.conversationFiles?.normalized;assert.ok(deliveredFile);assert.equal(hash(await fs.readFile(path.join(deliveryDir,deliveredFile.attachmentPath))),hash(await fs.readFile(f.normalizedFile)));
  delete checked.context;assert.equal(JSON.stringify(checked),before);
  for(const change of [{goalId:'other'},{actions:[{observationId:'observed',actionId:'planned-only',messageIds:['u1']}]},{actions:[{observationId:'observed',actionId:'asked',messageIds:['missing']}]},{status:'violation'}])await assert.rejects(validateReportContext({...context,conversations:[{...context.conversations[0],...change}]},checked,f.run));
  await fs.appendFile(f.normalizedFile,' ');await assert.rejects(validateReportContext(context,checked,f.run),/source hash/);assert.equal(JSON.stringify(await check(f.run)),before);
});

test('historical conversation views do not borrow current files when a historical source is unavailable',async t=>{
  const f=await fixture(t),ids=await registered(f),checked=await check(f.run),original=checked.evidenceCatalog.items.find(e=>e.id===ids.sourceId)!,doc=checked.evidenceCatalog.items.find(e=>e.id===ids.conversationId)!;
  const files=[{key:original.id,item:original,runDir:null},{key:doc.id,item:doc,runDir:null},{key:'historical-source',item:original,runDir:null},{key:'historical-conversation',item:doc,runDir:null}];
  const views=await registeredConversationViews(f.run,checked,files);assert.ok(views[doc.id]);assert.equal(views['historical-conversation'],undefined);
  const history=path.join(f.root,'history');for(const item of [original,doc]){await fs.mkdir(path.dirname(path.join(history,item.path)),{recursive:true});await fs.copyFile(path.join(f.run,item.path),path.join(history,item.path));}
  const historicalFiles=[...files.slice(0,2),{key:'old-source',item:original,runDir:history},{key:'old-conversation',item:doc,runDir:history}];
  assert.ok((await registeredConversationViews(f.run,checked,historicalFiles))['old-conversation']);
  await fs.appendFile(path.join(history,original.path),'changed');const after=await registeredConversationViews(f.run,checked,historicalFiles);assert.ok(after[doc.id]);assert.equal(after['old-conversation'],undefined);
});

test('attachment-only messages need an actual mapped source and never manufacture text',async t=>{
  const f=await fixture(t),attachmentFile=path.join(f.root,'attachment.bin');await fs.writeFile(attachmentFile,Buffer.from([255,0,254,1]));
  const source=await registerEvidence({runDir:f.run,request:{schemaVersion:9,operationId:'attachment',expectedRevision:0,caseId:'c',sourceFile:attachmentFile,kind:'other',source:'Synthetic binary attachment',description:'Synthetic retained binary'}});
  const doc={conversationVersion:1,id:'attachment',title:'合成附件',messages:[{id:'file',role:'tool',format:'text',content:'',presentation:'verbatim',completeness:'unknown',state:'unknown',completionBasis:'只保管实际附件，未采集结束信号。',sourceRefs:[{sourceId:'file'}],attachmentSourceIds:['file'],limitations:['正文不可推断。']}],limitations:['合成附件，不代表业务结果。']};await write(f.normalizedFile,doc);
  const ev=await registerEvidence({runDir:f.run,request:{schemaVersion:9,operationId:'file-conversation',expectedRevision:1,caseId:'c',sourceFile:f.normalizedFile,kind:'conversation',source:'Synthetic attachment message',description:'Synthetic attachment',metadata:{conversationSources:[{sourceId:'file',evidenceId:source.evidenceId}]}}});
  const p=await htmlReportPayload(f.run,await check(f.run));assert.equal(p.conversations?.[ev.evidenceId]?.artifact.messages[0]?.content,'');assert.equal(p.conversations?.[ev.evidenceId]?.sources[0]?.evidenceId,source.evidenceId);
  assert.throws(()=>validateConversationSources(parseConversation(doc),new Map([['file',{binary:true,excluded:true}]])),/excluded/);
});

test('parallel import remaps only external IDs, preserves artifact bytes and links the same actual messages',async t=>{
  const f=await fixture(t);let seq=0;const req=async(kind:string,extra:Record<string,unknown>={})=>executeRequest({runDir:f.run,request:{schemaVersion:9,operationId:'exec-'+(++seq),expectedRevision:(await readExecutionView(f.run)).revision,kind,reason:'Synthetic engineering check',...extra}});
  await req('inventory',{spaceIds:[]});const assignment=(await req('reserve',{caseId:'c',baselineSha256:(await readExecutionView(f.run)).baselineSha256})).assignmentId!;
  const dir=path.join(f.run,'workers',assignment);await fs.copyFile(f.sourceFile,path.join(dir,'raw.json'));await fs.copyFile(f.normalizedFile,path.join(dir,'conversation.json'));
  const draft=path.join(dir,'draft.json');await write(draft,{schemaVersion:9,packetId:'conversations',mode:'final',record:payload('chat'),evidence:[{key:'chat',path:'conversation.json',kind:'conversation',source:'Synthetic AI normalization',description:'Synthetic conversation',metadata:{conversationSources:[{sourceId:'raw',evidenceId:'raw'}]}},{key:'raw',path:'raw.json',kind:'dom',source:'Synthetic text capture',description:'Synthetic original'}],spaceUsage:[{spaceId:null,reason:'Offline transaction test',evidenceKeys:['raw','chat']}]});
  const sealed=await sealPacket({runDir:f.run,assignment,draftFile:draft});await req('import',{packetFile:sealed.packetFile,review:{decision:'accept',reviewer:'Synthetic AI',rationale:'Explicit engineering review'}});
  const checked=await check(f.run),chat=checked.evidenceCatalog.items.find(e=>e.kind==='conversation')!,source=checked.evidenceCatalog.items.find(e=>e.kind==='dom')!;
  assert.notEqual(chat.id,'chat');assert.notEqual(source.id,'raw');assert.deepEqual(chat.metadata?.conversationSources,[{sourceId:'raw',evidenceId:source.id}]);
  assert.equal(hash(await fs.readFile(path.join(f.run,chat.path))),hash(await fs.readFile(f.normalizedFile)));assert.equal(checked.cases[0]?.observations[0]?.actions?.[0]?.conversations?.[0]?.evidenceId,chat.id);assert.equal(checked.counts.verified,1);
});

test('structural review warns about phase mismatch and missing summaries without changing any result',async t=>{
  const f=await fixture(t),ids=await registered(f),r=payload(ids.conversationId),o=r.observations[0]!;o.phase!.observed='before';delete o.actions![0]!.inputSummary;delete o.actions![0]!.replySummary;
  r.assessments[0]!.display!.actual=r.assessments[0]!.display!.title;await recordResult({runDir:f.run,request:{schemaVersion:9,operationId:'result',expectedRevision:0,caseId:'c',mode:'final',record:r}});
  const checked=await check(f.run),before=JSON.stringify(checked),prompts=reviewPrompts(checked);for(const code of ['phase_mismatch','missing_input_summary','missing_reply_summary','repeated_reading'])assert.ok(prompts.some(p=>p.code===code));assert.equal(JSON.stringify(checked),before);assert.equal(checked.counts.verified,1);
});

test('the exact shipped UI model isolates step messages from other goals and preserves input/reply summaries',async t=>{
  const f=await fixture(t),ids=await registered(f);await recordResult({runDir:f.run,request:{schemaVersion:9,operationId:'result',expectedRevision:0,caseId:'c',mode:'final',record:payload(ids.conversationId)}});
  const checked=await check(f.run),p=await htmlReportPayload(f.run,checked),context=vm.createContext({});vm.runInContext(await fs.readFile(path.join(TOOL_ROOT,'report-ui/main.js'),'utf8'),context);
  const model=vm.runInContext('conversationViewModel',context) as{stepConversations:(p:HtmlPayload,c:string,g:string,o:string,a:string,refs:unknown[])=>unknown[]};
  const refs=checked.cases[0]!.observations[0]!.actions![0]!.conversations!;
  assert.deepEqual(JSON.parse(JSON.stringify(model.stepConversations(p,'other-case','answer','observed','asked',refs))),[]);
  const scoped=structuredClone(p);scoped.conversations![ids.conversationId]!.goalId='answer';assert.equal(model.stepConversations(scoped,'c','other','observed','asked',refs).length,0);assert.equal(model.stepConversations(scoped,'c','answer','observed','asked',refs).length,1);
  assert.equal(checked.cases[0]?.observations[0]?.actions?.[0]?.replySummary,'给出对象和结果两个检查项。');
});

test('explicit DOM text capture retains long text and reports ambiguous/hidden nodes without business decisions',async t=>{
  const f=await fixture(t),text='长回复原文'.repeat(10000),context=vm.createContext({document:{querySelectorAll:(selector:string)=>selector==='#answer'?[{innerText:text,tagName:'DIV',checkVisibility:()=>true}]:selector==='.many'?[{},{}]:[{innerText:'hidden',tagName:'DIV',checkVisibility:()=>false}]}});
  const page:CaptureTextPage={spaceId:999,label:'synthetic-page',url:async()=>'http://localhost/synthetic',evaluate:async<T,A>(fn:(arg:A)=>T,arg:A)=>vm.runInContext('('+fn.toString()+')',context)(arg) as T};
  const outputFile=path.join(f.root,'capture.json');const receipt=await captureDomText({page,outputFile,selectors:[{id:'reply',selector:'#answer'},{id:'ambiguous',selector:'.many'},{id:'hidden',selector:'#hidden'}],completion:{state:'unknown',basis:'未观察到结束信号'}});
  const stored=JSON.parse(await fs.readFile(outputFile,'utf8'));assert.equal(stored.elements[0].text,text);assert.equal(stored.elements[1].matches,2);assert.equal(stored.elements[1].text,null);assert.equal(stored.elements[2].text,null);assert.equal(receipt.retainedNodes,1);assert.equal(stored.completion.state,'unknown');assert.equal('status' in stored,false);
  await assert.rejects(captureDomText({page,outputFile,selectors:[{id:'reply',selector:'#answer'}],completion:{state:'unknown',basis:'Still unknown'}}),/EEXIST/);assert.equal(JSON.parse(await fs.readFile(outputFile,'utf8')).elements[0].text,text);
});
