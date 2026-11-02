import { uiText as u, uiMarkup, uiHtml, uiTemplate, presentationLanguage, formatUi } from '../report/ui-text.mjs';
import { modelHeader } from '../report/model-display.mjs';
import { scopeLabel } from '../report/scope-label.mjs';
import { createConversationReader, stepConversations, renderStepConversationSummary } from './conversations.js';
import { reviewPrompts } from '../report/reviewability.mjs';

/** Pure reader projection is shared by the real browser and non-DOM model regression tests. */
const reportViewModel = (() => {
  type CaseData = import('../contracts/model.mjs').CheckedCase;
  type Evidence = import('../contracts/model.mjs').EvidenceItem;
  type Observation = import('../contracts/model.mjs').Observation;
  type Context = import('../contracts/model.mjs').ExecutionContext;
  type Entry = import('../contracts/model.mjs').ResultEntry;
  const observationIds=(o:Observation)=>[...o.evidenceIds,...(o.actions??[]).flatMap(a=>a.evidenceIds),...(o.evidenceLinks??[]).map(l=>l.evidenceId)];
  const contextIds=(c:Context)=>[c.environment,c.identity,c.objects,c.initialState,c.authorization].flatMap(f=>f.sources.flatMap(s=>s.evidenceIds));
  function closure(ids:readonly string[],evidence:readonly Evidence[]):string[]{
    const map=new Map(evidence.map(e=>[e.id,e])),seen=new Set<string>(),queue=[...ids];
    for(let i=0;i<queue.length;i++){const id=queue[i];if(!id||seen.has(id))continue;seen.add(id);queue.push(...(map.get(id)?.metadata?.contextEvidenceIds??[]));}
    return [...seen];
  }
  function history(c:CaseData,entry:Entry,goalId:string){
    const assessment=entry.record.assessments.find(a=>a.goalId===goalId);
    const observations=(assessment?.observationIds??[]).map(id=>entry.record.observations.find(o=>o.id===id)??c.observations.find(o=>o.id===id)).filter((o):o is Observation=>!!o);
    const actionEvents=(c.actionEvents??[]).filter(e=>observations.some(o=>o.actionEventIds?.includes(e.id)));
    const contexts=[...new Set([...actionEvents.map(e=>e.contextId),...observations.map(o=>o.contextId).filter((id):id is string=>!!id)])].map(id=>entry.record.contexts?.find(c=>c.id===id)??c.contexts.find(c=>c.id===id)).filter((c):c is Context=>!!c);
    const evidenceIds=[...actionEvents.flatMap(e=>e.evidenceIds),...observations.flatMap(observationIds),...contexts.flatMap(contextIds),...(assessment?.diagnosis?.evidenceIds??[]),...(assessment?.phenomena??[]).flatMap(p=>p.evidenceIds)];
    return {assessment,observations,contexts,actionEvents,evidenceIds};
  }
  function current(c:CaseData,evidence:readonly Evidence[]):string[]{
    const observedIds=new Set(c.assessments.flatMap(a=>a.observationIds));
    const observations=c.observations.filter(o=>observedIds.has(o.id)),events=(c.actionEvents??[]).filter(e=>observations.some(o=>o.actionEventIds?.includes(e.id))),contexts=c.contexts.filter(ctx=>observations.some(o=>o.contextId===ctx.id)||events.some(e=>e.contextId===ctx.id));
    return closure([...events.flatMap(e=>e.evidenceIds),...observations.flatMap(observationIds),...contexts.flatMap(contextIds),...c.assessments.flatMap(a=>[...(a.diagnosis?.evidenceIds??[]),...(a.phenomena??[]).flatMap(p=>p.evidenceIds)])],evidence);
  }
  function goal(c:CaseData,goalId:string,evidence:readonly Evidence[]){
    const assessment=c.assessments.find(a=>a.goalId===goalId),observations=c.observations.filter(o=>assessment?.observationIds.includes(o.id));
    const actionEvents=c.actionEvents.filter(e=>observations.some(o=>o.actionEventIds?.includes(e.id)));
    const contexts=c.contexts.filter(ctx=>observations.some(o=>o.contextId===ctx.id)||actionEvents.some(e=>e.contextId===ctx.id));
    const evidenceIds=closure([...observations.flatMap(observationIds),...actionEvents.flatMap(e=>e.evidenceIds),...contexts.flatMap(contextIds),...(assessment?.diagnosis?.evidenceIds??[]),...(assessment?.phenomena??[]).flatMap(p=>p.evidenceIds)],evidence);
    return {assessment,observations,actionEvents,contexts,evidenceIds};
  }
  function findingRefs(c:CaseData,evidence:readonly Evidence[]):string[]{
    const ids=new Set(c.findings.flatMap(f=>f.observationIds)),observations=c.observations.filter(o=>ids.has(o.id)),contexts=c.contexts.filter(ctx=>observations.some(o=>o.contextId===ctx.id));
    return closure([...c.findings.flatMap(f=>f.evidenceIds),...observations.flatMap(observationIds),...contexts.flatMap(contextIds)],evidence);
  }
  function historical(c:CaseData,evidence:readonly Evidence[]):string[]{
    return closure(c.entries.flatMap(entry=>[...(entry.record.actionEvents??[]).flatMap(e=>e.evidenceIds),...entry.record.observations.flatMap(observationIds),...(entry.record.contexts??[]).flatMap(contextIds),...entry.record.assessments.flatMap(a=>history(c,entry,a.goalId).evidenceIds),...(entry.record.findings??[]).flatMap(f=>f.evidenceIds)]),evidence);
  }
  function sceneFindings(c:CaseData){return {items:[...c.findings],additional:c.findings.filter(f=>f.scope==='additional'),unbound:c.findings.filter(f=>f.goalIds.length===0)};}
  function steps(c:CaseData, goalId:string, evidence:readonly Evidence[], note?:import('../contracts/model.mjs').ReaderNote){
    const view=goal(c,goalId,evidence);
    const items=view.observations.flatMap(o=>(o.actions??[]).map(a=>{
      const reading=note?.actions.find(n=>n.observationId===o.id&&n.actionId===a.id);
      const ids=reading?reading.evidenceIds:[...a.evidenceIds,...(o.evidenceLinks??[]).filter(l=>l.actionId===a.id).map(l=>l.evidenceId)];
      return {key:o.id+'/'+a.id,observationId:o.id,actionId:a.id,title:reading?.title??a.description,description:a.description,input:a.input,inputSummary:reading?.inputSummary??a.inputSummary,replySummary:reading?.replySummary??a.replySummary,inputPresentation:a.inputPresentation,conversations:a.conversations,result:reading?.result??a.result,occurredAt:a.occurredAt,evidenceIds:closure(ids,evidence),note:reading?.note,arranged:!!reading,focus:note?.focusAction?.observationId===o.id&&note.focusAction.actionId===a.id};
    }));
    const used=new Set(items.flatMap(s=>s.evidenceIds));
    return {items:items.map(s=>({...s,sharedEvidenceIds:s.evidenceIds.filter(id=>items.some(other=>other.key!==s.key&&other.evidenceIds.includes(id)))})),unassignedEvidenceIds:view.evidenceIds.filter(id=>!used.has(id))};
  }
  function summaryDisclosure(items:readonly string[]){return {visible:items.slice(0,3),remaining:items.slice(3)};}
  function requestPreview(value:unknown){
    const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
    if(!obj(value))return null;
    if(value.kind==='network-evidence-export'&&Array.isArray(value.events)){
      const records=value.events.filter(obj).filter(e=>typeof e.method==='string'&&typeof e.status==='number'&&typeof e.path==='string').map(e=>({method:String(e.method),path:String(e.path),status:Number(e.status),body:obj(e.bodyPreview)&&typeof e.bodyPreview.data==='string'?e.bodyPreview.data:undefined,windowed:obj(e.bodyPreview)&&e.bodyPreview.hasMore===true}));
      return records.length?{kind:'network-export',records}:null;
    }
    if(Array.isArray(value.requests)&&value.requests.length&&value.requests.every(r=>obj(r)&&typeof r.path==='string'&&typeof r.status==='number'&&Object.hasOwn(r,'body'))){
      return {kind:'retained-request-records',records:value.requests.filter(obj).map(r=>({method:typeof r.method==='string'?r.method:'',path:String(r.path),status:Number(r.status),body:JSON.stringify(r.body,null,2),windowed:false}))};
    }
    return null;
  }
  function filePreview(value:unknown) {
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    const v=value as Record<string,unknown>,file=v.file&&typeof v.file==='object'?v.file as Record<string,unknown>:null,limitations=Array.isArray(v.limitations)?v.limitations.filter((s):s is string=>typeof s==='string'):[];
    if(v.kind==='download_capture'||v.kind==='download_reconciliation')return{kind:'download',title:u('下载事实'),lines:[u('启动观察：')+(v.startObservation==='observed'?u('已观察到'):v.startObservation==='not_observed'?u('未观察到事件'):u('未知')),u('完成观察：')+(v.completionObservation==='completed'?u('已观察到完成'):v.completionObservation==='failed'?u('已观察到失败'):u('尚未确认完成')),u('原件保管：')+(file&&typeof file.bytes==='number'?u('已取得 ')+file.bytes+u(' 字节'):u('未取得可核验原件')),...(v.lateEffectsPossible===true?[u('传输或保存可能仍在继续，须先对账。')]:[])],limitations:[...limitations,u('下载事实不等于导出业务数据正确。')]};
    if(v.kind==='file_inspection'){
      const states:Record<string,string>={complete:u('完整'),partial:u('部分读取'),failed:u('读取失败'),unsupported:u('格式不支持')},scope=v.scope&&typeof v.scope==='object'?v.scope as Record<string,unknown>:{};
      const ranges=Array.isArray(v.data)?v.data.filter((s):s is Record<string,unknown>=>!!s&&typeof s==='object').filter(s=>Array.isArray(s.rows)&&typeof s.rowStart==='number'&&typeof s.totalRows==='number').map(s=>String(s.sheet)+u('：从第 ')+(Number(s.rowStart)+1)+u(' 行起，返回 ')+(s.rows as unknown[]).length+u(' 行 / 原表 ')+Number(s.totalRows)+u(' 行。')):[];
      if(typeof scope.offset==='number'&&typeof scope.bytes==='number')ranges.push(u('原文窗口：字节 ')+scope.offset+u(' 起，读取 ')+scope.bytes+' / '+String(scope.totalBytes??u('未知'))+u(' 字节。'));
      if(Array.isArray(scope.jsonPath)&&scope.jsonPath.length)ranges.push(u('指定字段路径：')+JSON.stringify(scope.jsonPath));
      return{kind:'inspection',title:u('文件内容读取'),lines:[u('读取方式：')+String(v.format??u('未知')),u('读取状态：')+(states[String(v.state)]??u('未知')),...ranges,...(typeof v.error==='string'?[u('读取问题：')+v.error]:[])],limitations:[...limitations,u('此处是读取事实；是否符合业务预期由目标判断说明。')]};
    }
    return null;
  }
  return {closure,history,goal,current,historical,findingRefs,sceneFindings,steps,summaryDisclosure,requestPreview,filePreview};
})();

Object.assign(globalThis,{reportViewModel,conversationViewModel:{stepConversations}});

/** Offline reader: presentation never changes verdicts, source evidence or business behavior. */
(() => {
  'use strict';
  if(typeof document==='undefined')return;
  type Payload = import('../contracts/model.mjs').HtmlPayload;
  type CaseData = import('../contracts/model.mjs').CheckedCase;
  type Goal = import('../contracts/model.mjs').Goal;
  type Assessment = import('../contracts/model.mjs').CommittedAssessment;
  type Observation = import('../contracts/model.mjs').Observation;
  type Evidence = import('../contracts/model.mjs').EvidenceItem;
  type Context = import('../contracts/model.mjs').ExecutionContext;
  type ContextFact = import('../contracts/model.mjs').ContextFact;
  type Status = import('../contracts/model.mjs').Status | 'unassessed';
  const labels: Record<Status,string> = { verified:u('已验证'), violation:u('发现违反'), inconclusive:u('无法判断'), not_tested:u('未测试'), unassessed:u('未登记目标评估') };
  const order: Status[] = ['violation','inconclusive','not_tested','verified','unassessed'];
  const bodyLabels: Record<string,string> = {full:u('来源声明完整留存'),selected_fields:u('按字段筛选的正文'),summary:u('检查摘要'),truncated:u('来源正文截断'),excluded:u('采集策略排除'),failed:u('采集失败'),unknown:u('来源完整程度未知'),missing:u('文件缺失'),unsupported:u('格式不支持预览')};
  const kindLabels: Record<string,string> = {screenshot:u('截图'),tool_receipt:u('接口 / 工具回执'),log:u('日志'),dom:u('DOM文本'),conversation:u('对话记录'),other:u('资料')};
  const $ = <T extends HTMLElement = HTMLElement>(s:string):T => { const e=document.querySelector(s);if(!e)throw new Error('Missing report element: '+s);return e as T; };
  const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c));
  const unique=(v:string[])=>[...new Set(v)];
  const badge=(s:Status)=>Object.hasOwn(labels,s)?`<span class="badge status-${s}">${labels[s]}</span>`:uiMarkup('<span class="error">无效状态</span>');
  const list=(items:string[])=>`<ul>${items.map(x=>`<li class="text">${esc(x)}</li>`).join('')}</ul>`;
  function time(value?:string):string {if(!value)return u('未记录');const d=new Date(value);return Number.isNaN(d.valueOf())?esc(value):esc(d.toLocaleString(presentationLanguage(),{timeZone:'Asia/Shanghai',hour12:false}))+' UTC+08:00';}
  function object(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}
  function assertPayload(v:unknown):asserts v is Payload {
    if(!object(v)||v.htmlPayloadVersion!==9||!object(v.report)||v.report.schemaVersion!==9||!Array.isArray(v.report.cases)||!object(v.report.evidenceCatalog)||!Array.isArray(v.report.evidenceCatalog.items)||!object(v.previews)||!object(v.assets)||!object(v.delivery))throw new Error(u('报告格式不受支持；需要 v9。历史文件不会被修改。'));
    const number=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0,r=v.report;
    if(typeof r.project!=='string'||typeof r.runId!=='string'||!object(r.counts)||!['caseCount','goalCount','revision','evidenceRevision'].every(k=>number(r[k]))||!Object.values(r.counts).every(number))throw new Error(u('报告统计结构无效。'));
    for(const c of v.report.cases){
      if(!object(c)||typeof c.id!=='string'||typeof c.title!=='string'||!Array.isArray(c.goals)||!Array.isArray(c.assessments)||!Array.isArray(c.observations)||!Array.isArray(c.contexts)||!Array.isArray(c.findings)||!Array.isArray(c.entries))throw new Error(u('报告场景结构无效。'));
      for(const g of c.goals)if(!object(g)||typeof g.id!=='string'||typeof g.title!=='string'||typeof g.expected!=='string')throw new Error(u('报告目标结构无效。'));
      for(const a of c.assessments)if(!object(a)||typeof a.status!=='string'||!Object.hasOwn(labels,a.status)||a.status==='unassessed')throw new Error(u('报告目标状态无效。'));
      for(const e of c.entries)if(!object(e)||!number(e.revision))throw new Error(u('报告历史结构无效。'));
    }
    for(const e of v.report.evidenceCatalog.items)if(!object(e)||!number(e.bytes)||typeof e.id!=='string'||typeof e.description!=='string')throw new Error(u('报告证据结构无效。'));
    for(const p of Object.values(v.previews))if(!object(p)||(p.width!==undefined&&!number(p.width))||(p.height!==undefined&&!number(p.height)))throw new Error(u('报告预览结构无效。'));
    for(const a of Object.values(v.assets))if(!object(a)||!number(a.bytes)||!number(a.retainedBytes)||(a.kind==='text'&&typeof a.text!=='string'))throw new Error(u('报告内容结构无效。'));
  }
  let payload:Payload;
  try {const v:unknown=JSON.parse($('#report-data').textContent??'');assertPayload(v);payload=v;}
  catch(e){$('#detail').innerHTML=`<section class="panel error">${esc(e instanceof Error?e.message:u('无法读取报告。'))}</section>`;return;}
  const report=payload.report;
  const evidenceMap=new Map(report.evidenceCatalog.items.map(e=>[e.id,e]));
  for(const e of report.history?.evidence??[])evidenceMap.set(e.key,{...e.item,id:e.key,description:u('历史 ')+e.sourceRun.runId+' · '+e.item.description,metadata:{...e.item.metadata,...(e.item.metadata?.contextEvidenceIds?{contextEvidenceIds:e.item.metadata.contextEvidenceIds.map(id=>report.history?.evidence.find(x=>x.sourceRun.runId===e.sourceRun.runId&&x.sourceRun.resultsSha256===e.sourceRun.resultsSha256&&x.sourceRun.baselineSha256===e.sourceRun.baselineSha256&&x.item.id===id)?.key??'history-missing:'+e.sourceRun.runId+':'+id)}:{}),limitations:[...(e.item.metadata?.limitations??[]),u('原证据ID：')+e.item.id+u('；来源结果版本：')+e.sourceRun.resultsRevision+u('。仅支持原运行观察。')]}});
  function evidenceText(id:string):string {const e=evidenceMap.get(id),p=payload.previews[id],a=p?.assetId?payload.assets[p.assetId]:undefined;return e?[e.description,e.source,e.metadata?.purpose,e.metadata?.page,e.metadata?.object,a?.kind==='text'?a.text:''].filter(Boolean).join('\n'):'';}
  type GoalNote=NonNullable<NonNullable<Payload['report']['context']>['goalNotes']>[number];
  const goalNote=(caseId:string,goalId:string)=>report.context?.goalNotes?.find(n=>n.caseId===caseId&&n.goalId===goalId);
  const readerNote=(caseId:string,goalId:string)=>report.context?.readerNotes?.find(n=>n.caseId===caseId&&n.goalId===goalId);
  interface Row {c:CaseData;g:Goal;a:Assessment|undefined;observations:Observation[];contexts:Context[];actionEvents:CaseData['actionEvents'];evidenceIds:string[];status:Status;search:[string,string][]}
  const rows:Row[]=report.cases.flatMap(c=>c.goals.map(g=>{
    const view=reportViewModel.goal(c,g.id,report.evidenceCatalog.items),{assessment:a,observations,contexts,actionEvents,evidenceIds}=view;
    const history=c.entries.filter(e=>e.record.assessments.some(a=>a.goalId===g.id)).map(e=>{const view=reportViewModel.history(c,e,g.id);return JSON.stringify(view)+'\n'+reportViewModel.closure(view.evidenceIds,report.evidenceCatalog.items).map(evidenceText).join('\n');}).join('\n');
    return {c,g,a,observations,contexts,actionEvents,evidenceIds,status:a?.status??'unassessed',search:[[u('目标'),[g.pointId,c.id,c.title,g.id,g.title,g.expected].join('\n')],[u('当前观察'),[a?.summary,a?.rationale,JSON.stringify(a?.phenomena??[]),...observations.map(o=>[o.actual,o.summary,JSON.stringify(o.actions??[])].join('\n'))].join('\n')],[u('缺口与复核准备'),JSON.stringify({gaps:a?.gaps,gapDetails:a?.gapDetails,reproduction:a?.reproduction})],[u('事后复核说明'),JSON.stringify({review:goalNote(c.id,g.id)??{},reader:readerNote(c.id,g.id)??{}})],[u('关联现象'),JSON.stringify(c.findings.filter(f=>f.goalIds.includes(g.id)))],[u('上下文'),JSON.stringify(contexts)],[u('证据正文'),evidenceIds.map(evidenceText).join('\n')],[u('历史记录'),history],[u('共享规则'),[g.basis.source,g.basis.text].join('\n')]] as [string,string][]};
  }));
  interface State {view:'overview'|'scene'|'evidence';selectedCase:string;goalId:string;stepKey:string;proofId:string;status:Status|'all';query:string;evidenceKind:string;evidenceUse:string}
  const initial:State={view:'overview',selectedCase:'',goalId:'',stepKey:'',proofId:'',status:'all',query:'',evidenceKind:'all',evidenceUse:'all'};
  let state:State={...initial};let linkedNotice='';
  const prompts=reviewPrompts(report);
  const conversationReader=createConversationReader(payload,{
    beforeOpen:()=>saveHash(),
    allowed:(id,ids)=>{
      const view=payload.conversations?.[id];if(!view)return false;
      if(!ids.length)return view.evidenceId?evidenceMap.has(view.evidenceId):state.view==='scene'&&state.selectedCase===view.caseId&&state.goalId===view.goalId;
      const row=rows.find(r=>r.c.id===state.selectedCase&&r.g.id===state.goalId);if(!row||state.view!=='scene')return false;
      const step=reportViewModel.steps(row.c,row.g.id,report.evidenceCatalog.items,readerNote(row.c.id,row.g.id)).items.find(s=>s.key===state.stepKey);
      if(!step)return false;const refs=stepConversations(payload,row.c.id,row.g.id,step.observationId,step.actionId,step.conversations);
      return refs.some(r=>r.viewId===id&&ids.every(message=>r.messageIds.includes(message)));
    },
    openEvidence:id=>openEvidence(id,u('对话原始来源'),document.activeElement instanceof HTMLElement?document.activeElement:$('#detail'))
  });
  const sceneOpen=new Set<string>(),goalOpen=new Set<string>(),readingOpen=new Set<string>();
  const readerScope=location.pathname+'|'+report.runId+'|'+report.revision+'|'+report.evidenceRevision;
  let entryKey=String(Date.now())+'-'+Math.random().toString(36).slice(2),locationFingerprint='';
  function hi(v:unknown):string{const text=String(v??''),q=state.query;if(!q)return esc(text);const i=text.toLocaleLowerCase().indexOf(q.toLocaleLowerCase());return i<0?esc(text):esc(text.slice(0,i))+'<mark>'+esc(text.slice(i,i+q.length))+'</mark>'+esc(text.slice(i+q.length));}
  function match(r:Row):string[]{const q=state.query.toLocaleLowerCase();return q?r.search.filter(([,text])=>text.toLocaleLowerCase().includes(q)).map(([label])=>label):[];}
  function filtered():Row[]{return rows.filter(r=>(state.status==='all'||r.status===state.status)&&(!state.query||match(r).length>0));}
  function counts(rs:Row[]):Record<Status,number>{const c={verified:0,violation:0,inconclusive:0,not_tested:0,unassessed:0};for(const r of rs)c[r.status]++;return c;}
  function chips(rs:Row[],compact=false):string{const c=counts(rs);return order.filter(s=>compact?c[s]>0:s!=='unassessed'||c[s]).map(s=>`<span class="badge status-${s}">${labels[s]} ${c[s]}</span>`).join('');}
  function snapshotPosition(route:string){return {reader:true,scope:readerScope,route,entryKey,pageY:scrollY,listY:$('#case-list').scrollTop,stepY:document.querySelector('.actual-step-list')?.scrollTop??0,proofY:document.querySelector('.step-proof-panel')?.scrollTop??0,scenes:[...sceneOpen],goals:[...goalOpen],reading:[...readingOpen]};}
  function saveHash(evidenceId?:string,push=false):void{const p=new URLSearchParams({view:state.view});if(state.selectedCase)p.set('case',state.selectedCase);if(state.goalId)p.set('goal',state.goalId);if(state.stepKey)p.set('step',state.stepKey);if(state.proofId)p.set('proof',state.proofId);if(state.status!=='all')p.set('status',state.status);if(state.query)p.set('q',state.query);if(evidenceId&&evidenceMap.has(evidenceId))p.set('evidence',evidenceId);const conversation=applyingLocation?undefined:conversationReader.current();if(conversation){p.set('conversation',conversation.id);if(conversation.messageIds.length)p.set('messages',conversation.messageIds.join(','));}if(push)entryKey=String(Date.now())+'-'+Math.random().toString(36).slice(2);const route='#'+p.toString();try{const prior:unknown=history.state,modalEntry=!!evidenceId&&(push||object(prior)&&prior.scope===readerScope&&prior.modalEntry===true);history[push?'pushState':'replaceState']({...snapshotPosition(route),modalEntry,...(conversation?{conversationOpen:true}:{})},'',route);locationFingerprint=location.hash+'|'+entryKey;}catch{/* file policy */}}
  function navigate(next:Partial<State>,disclosures?:()=>void):void{saveHash();disclosures?.();state={...state,...next};render();saveHash(undefined,true);$('.reader-main').scrollIntoView({block:'start'});}
  function revealCurrentNavigation():void{const target=document.querySelector<HTMLElement>('.goal-row[aria-current=true]'),fallback=document.querySelector<HTMLElement>('.scene-title-button[aria-current=true]'),el=target?.checkVisibility()?target:fallback;if(!el)return;const list=$('#case-list'),a=el.getBoundingClientRect(),b=list.getBoundingClientRect();if(a.top<b.top)list.scrollTop+=a.top-b.top;else if(a.bottom>b.bottom)list.scrollTop+=a.bottom-b.bottom;}
  function openScene(caseId:string):void{if(!report.cases.some(c=>c.id===caseId))return;linkedNotice='';navigate({view:'scene',selectedCase:caseId,goalId:'',stepKey:'',proofId:''});revealCurrentNavigation();}
  function openGoal(caseId:string,goalId:string,related=false):void{const r=rows.find(r=>r.c.id===caseId&&r.g.id===goalId);if(!r)return;linkedNotice=related&&!filtered().includes(r)?u('此关联目标未命中目录筛选；当前场景仍保留全部目标，筛选保持不变。'):'';navigate({view:'scene',selectedCase:caseId,goalId,stepKey:'',proofId:''},()=>sceneOpen.add(caseId));document.getElementById('goal-'+caseId+'-'+goalId)?.scrollIntoView({block:'start'});revealCurrentNavigation();}
  function renderNavigation():void{
    const scroll=$('#case-list').scrollTop;
    const hits=filtered(),groups=new Map<string,Row[]>();for(const r of hits){const group=groups.get(r.c.id)??[];group.push(r);groups.set(r.c.id,group);}
    $<HTMLInputElement>('#search').value=state.query;$<HTMLSelectElement>('#status-filter').value=state.status;
    $('#shown').textContent=uiTemplate`筛选目录：${groups.size} 个场景 / ${hits.length} 个目标命中`;
    $('#case-list').innerHTML=[...groups].map(([id,rs])=>{const c=rs[0]?.c;if(!c)return '';const all=rows.filter(r=>r.c.id===id),open=sceneOpen.has(id);return uiHtml`<details class="scene ${state.selectedCase===id?'selected-scene':''}" data-case="${esc(id)}" ${open?'open':''}><summary><button class="scene-toggle" data-toggle-scene="${esc(id)}" aria-label="${esc(open?u('收起'):u('展开'))}${esc(id)}" aria-expanded="${open}">${open?'▾':'▸'}</button><button class="scene-title-button" data-scene="${esc(id)}" aria-current="${state.selectedCase===id}">${hi(c.title)} <span class="inline-id">${esc(id)}</span></button><div class="meta">${all.length} 个目标${rs.length<all.length?' · '+rs.length+u(' 项命中'):''}</div><div class="scene-counts">${chips(all,true)}</div></summary><div class="scene-goals" role="group" aria-label="${esc(id)}的目标">${all.map(r=>`<button class="goal-row ${rs.includes(r)?'':'not-matched'}" data-case-id="${esc(id)}" data-goal-id="${esc(r.g.id)}" aria-current="${state.selectedCase===id&&state.goalId===r.g.id}"><span class="goal-line">${badge(r.status)} <span class="inline-id">${esc(r.g.pointId)}</span></span><strong>${hi(readerNote(r.c.id,r.g.id)?.title??r.g.title)}</strong>${!rs.includes(r)?uiMarkup('<span class="meta">未命中当前筛选，保留完整场景</span>'):''}</button>`).join('')}</div></details>`;}).join('');
    $('#empty-results').hidden=hits.length>0;$('#case-list').scrollTop=scroll;
  }
  function sceneOverview():string{
    const statuses=order.filter(s=>s!=='unassessed'||report.counts.unassessed>0);
    const hitCases=new Set(filtered().map(r=>r.c.id));
    return uiHtml`<section class="panel"><h2>业务场景总览</h2><p class="hint">当前目录命中 ${hitCases.size} / ${report.caseCount} 个场景。下表始终保留每个场景的完整目标分布。</p><div class="tablewrap"><table><thead><tr><th>业务场景</th><th>目标</th>${statuses.map(s=>`<th>${labels[s]}</th>`).join('')}</tr></thead><tbody>${report.cases.filter(c=>hitCases.has(c.id)).map(c=>{const rs=rows.filter(r=>r.c.id===c.id),ct=counts(rs);return `<tr><td><button class="title-button" data-scene="${esc(c.id)}">${esc(c.title)}</button><div class="inline-id">${esc(c.id)}</div>${report.context?.supplementalCaseIds.includes(c.id)?uiMarkup('<span class="meta">补充范围</span>'):''}</td><td class="num">${rs.length}</td>${statuses.map(s=>`<td class="num"><span class="badge status-${s}">${ct[s]}</span></td>`).join('')}</tr>`;}).join('')}</tbody></table></div>${!hitCases.size?uiMarkup('<p class="empty">没有匹配场景，请调整目录条件；这不表示全部目标通过。</p>'):''}</section>`;
  }
  function plan(c:CaseData):string{return uiHtml`<details><summary>冻结前提与必要业务路径（计划，不等于执行证明）</summary><h4>关键前提</h4>${c.criticalConditions.length?list(c.criticalConditions.map(x=>x.text)):uiMarkup('<p class="hint">未列出显式前提。</p>')}<h4>必要路径</h4><p class="text">${esc(c.requiredPath??u('未指定'))}</p><p class="hint">步骤顺序：${c.stepOrder==='strict'?u('必须按冻结顺序'):u('方法可调整，必要语义保持不变')}</p><ol>${c.steps.map(s=>`<li><span class="inline-id">${esc(s.id)}</span> ${esc(s.action)}</li>`).join('')}</ol></details>`;}
  function sceneFindingSection(c:CaseData):string{
    const findings=reportViewModel.sceneFindings(c);if(!findings.items.length)return '';
    return uiHtml`<section class="panel" id="scene-findings"><h3>场景关联现象与额外发现</h3><p class="hint">${findings.items.length} 条关联记录，其中 ${findings.additional.length} 条额外发现、${findings.unbound.length} 条未绑定目标。这些记录不计入原目标四态统计，也不自动作为独立缺陷数量。</p>${findings.items.map(f=>uiHtml`<article class="fact"><h4>${hi(f.title)}</h4><p>${f.scope==='additional'?u('额外发现，与原目标分开'):u('原范围内关联')} · ${f.reviewState==='reviewed'?u('关系已审核'):u('关系待审核')}</p><p class="text">${hi(f.relationReason)}</p>${f.goalIds.length?f.goalIds.map(id=>`<button class="link-button" data-related-case="${esc(c.id)}" data-related-goal="${esc(id)}">${esc(c.goals.find(g=>g.id===id)?.title??id)}</button>`).join(''):uiMarkup('<p class="note">没有绑定原业务目标；不能因此隐藏这条发现或改写原目标状态。</p>')}${evidenceButtons(reportViewModel.closure(f.evidenceIds,report.evidenceCatalog.items),f.scope==='additional'?u('额外发现引用'):u('关联现象引用'))}<details><summary>该现象的实际观察与来源</summary>${c.observations.filter(o=>f.observationIds.includes(o.id)).map(o=>renderObservation(o,c,f.scope==='additional'?u('额外发现引用'):u('关联现象引用'))).join('')||uiMarkup('<p class="hint">没有单独引用观察。</p>')}<pre class="body-text">${esc(JSON.stringify(f,null,2))}</pre></details></article>`).join('')}</section>`;
  }
  function sceneDetail():string{
    const c=report.cases.find(c=>c.id===state.selectedCase);if(!c)return sceneOverview();const rs=rows.filter(r=>r.c.id===c.id);
    const hits=new Set(filtered()),matched=rs.filter(r=>hits.has(r)).length;
    const selected=rs.find(r=>r.g.id===state.goalId)??rs.find(r=>r.status==='violation')??rs[0];if(!selected)return sceneOverview();state.goalId=selected.g.id;
    return uiHtml`<section class="panel scene-heading"><div class="scene-heading-line"><h2>${esc(c.id)} ${esc(c.title)}</h2><div><span class="meta">全部 ${rs.length} 个目标${state.query||state.status!=='all'?' · '+matched+u(' 项命中筛选'):''}</span><span class="chips">${chips(rs)}</span></div></div><div class="goal-switcher" aria-label="本场景全部目标">${rs.map(r=>`<button data-case-id="${esc(c.id)}" data-goal-id="${esc(r.g.id)}" aria-current="${r===selected}">${badge(r.status)}${esc(r.g.title)}</button>`).join('')}</div></section>${goalWorkbench(selected)}${historySection(selected)}${sceneFindingSection(c)}<section class="panel">${plan(c)}</section>`;
  }
  function historySection(row:Row):string {
    const h=report.history;if(!h)return '';
    const checks=row.a?.problemChecks??[];
    const definition=(report.regressionBinding as {reviewBindings?:{pointId:string;definitionSha256:string}[]})?.reviewBindings?.find(r=>r.pointId===row.g.pointId)?.definitionSha256;
    const previous=h.nodes.flatMap(n=>n.points.filter(p=>p.forPointIds.includes(row.g.pointId)).map(p=>({n,p})));
    const checkLabels={reproduced:u('原问题再次出现'),not_observed:u('本次未观察到原问题'),unclear:u('原问题尚无法判断'),not_checked:u('本次未检查原问题')};
    return '<section class="panel run-history" data-owner-case="'+esc(row.c.id)+'" data-owner-goal="'+esc(row.g.id)+uiMarkup('"><h3>历次运行对照 · ')+esc(row.g.pointId)+uiMarkup('</h3><p class="hint">历史事实保留原运行来源；状态变化不自动证明代码修复。未选中点没有本轮结论。</p>')+
      uiMarkup('<article class="fact"><h4>本次 ')+esc(report.runId)+'</h4><p>'+badge(row.status)+'</p><p class="text">'+esc(row.a?.rationale??u('缺少正式评估'))+uiMarkup('</p><p class="meta">用例版本 v')+esc(report.caseVersion??u('未知'))+'</p></article>'+
      previous.map(({n,p})=>'<article class="fact"><h4>'+esc(n.ref.runId)+(h.primaryBaseline?.runId===n.ref.runId&&h.primaryBaseline.resultsSha256===n.ref.resultsSha256?u(' · 主要比较基准'):'')+'</h4><p>'+(p.selected?p.status?badge(p.status):u('缺少评估'):u('该运行未选中此点'))+'</p><p class="text">'+esc(p.rationale??u('无正式判断'))+uiMarkup('</p><p><strong>当时预期：</strong>')+esc(p.expected)+uiMarkup('</p><p class="meta">用例 v')+n.caseVersion+u(' · 原编号 ')+esc(p.pointId)+u(' · 结果 revision ')+n.ref.resultsRevision+'</p>'+
        '<p class="hint">'+(definition&&p.definitionSha256?(definition===p.definitionSha256?u('目标与必要计划指纹一致；环境、对象及数据仍须分别核对。'):u('目标或必要计划发生变化，不能直接把状态变化认定为代码修复。')):u('定义可比性尚需核对。'))+'</p>'+
        (p.gaps.length?'<p class="note">'+esc(p.gaps.join('；'))+'</p>':'')+
        uiMarkup('<details><summary>查看原始现场与证据 · ')+p.evidenceKeys.length+uiMarkup(' 项</summary>')+evidenceGrid(p.evidenceKeys,u('历史运行 ')+n.ref.runId)+'<pre class="body-text">'+esc(JSON.stringify({assessment:p.assessment,observations:p.observations,actions:p.actions,contexts:p.contexts,findings:p.findings,definition:p.definition,plan:p.plan,sourceDefinitions:p.sourceDefinitions,declaredConditions:p.declaredConditions,parameterBindings:p.parameterBindings,source:n.ref,definitionSha256:p.definitionSha256},null,2))+'</pre></details></article>').join('')+
      (checks.length?uiMarkup('<h4>原问题检查（独立于目标四态）</h4>')+checks.map(c=>'<article class="fact"><strong>'+esc(checkLabels[c.state])+'</strong><p class="text">'+esc(c.rationale)+uiMarkup('</p><p class="meta">来源 ')+esc(c.source.run.runId+' / '+c.source.caseId+' / '+(c.source.findingId??c.source.goalId??''))+'</p>'+(c.gaps.length?'<p class="note">'+esc(c.gaps.join('；'))+'</p>':'')+'</article>').join(''):uiMarkup('<p class="hint">尚未登记原问题检查，不能仅凭本轮通过认定每条原问题已修复。</p>'))+
      (h.gaps.length?uiMarkup('<details open><summary>历史资料不完整 · ')+h.gaps.length+uiMarkup(' 项</summary>')+h.gaps.map(g=>'<p class="note">'+esc(g.run.runId+'：'+g.reason)+'</p>').join('')+'</details>':'')+'</section>';
  }
  function goalWorkbench(row:Row):string{
    const {c,g,a}=row,note=readerNote(c.id,g.id),view=reportViewModel.steps(c,g.id,report.evidenceCatalog.items,note),items=view.items;
    const selected=items.find(s=>s.key===state.stepKey)??items.find(s=>s.focus)??items[0];state.stepKey=selected?.key??'';
    const index=selected?items.indexOf(selected):-1,focusIndex=items.findIndex(s=>s.focus),ids=selected?.evidenceIds??view.unassignedEvidenceIds;
    if(!ids.includes(state.proofId))state.proofId=ids[0]??'';
    const displayActual=note?.description??a?.display?.actual;
    const actual=displayActual??(row.status==='not_tested'?a?.rationale:undefined)??(row.observations.map(o=>o.actual??o.summary).join('；')||u('尚未登记实际现象；不能从计划或判断补造。'));
    const descriptionLabel=!displayActual&&row.status!=='not_tested'?u('原始观察（未独立整理）'):row.status==='violation'?u('问题描述'):row.status==='verified'?u('验证结果'):row.status==='not_tested'?u('未测试说明'):row.status==='inconclusive'?u('无法判断说明'):u('记录说明');
    const title=note?.title??a?.display?.title??a?.summary??g.title;
    const impact=note?.impact??a?.display?.impact,dimension=note?.dimension??a?.display?.dimension;
    const dimensionLabel=dimension?({business:u('业务结果'),interaction:u('交互行为'),wording:u('文案'),content:u('回复内容'),presentation:u('展示')}[dimension]):undefined;
    const warnings=prompts.filter(p=>p.caseId===c.id&&p.goalId===g.id);
    const stepTitle=row.status==='not_tested'?u('已记录的准备与观察'):u('实际操作步骤');
    const readback=selected?.result;
    const conversationRefs=selected?stepConversations(payload,c.id,g.id,selected.observationId,selected.actionId,selected.conversations):[];
    return uiHtml`<section class="panel goal-workbench" id="goal-${esc(c.id)}-${esc(g.id)}" data-owner-case="${esc(c.id)}" data-owner-goal="${esc(g.id)}"><header class="goal-overview"><div class="goal-heading"><span class="inline-id">${esc(g.pointId+' · '+c.id+'/'+g.id)}</span><span class="original-title">${esc(g.title)}</span>${badge(row.status)}</div><h2>${hi(title)}</h2><p class="goal-description"><strong>${descriptionLabel}：</strong>${hi(actual)}</p>${impact?`<p class="goal-description"><strong>${dimensionLabel??u('影响')}：</strong>${hi(impact)}</p>`:''}${warnings.length?uiHtml`<details class="reading-quality"><summary>记录可读性与取证提示 · ${warnings.length}项</summary>${warnings.map(p=>`<p class="hint">${esc(p.detail)}</p>`).join('')}<p class="meta">仅提示记录缺口，不改变目标状态。</p></details>`:''}<div class="goal-expected"><strong>预期结果</strong><p class="text">${hi(g.expected)}</p></div>${a?.gaps.length?`<div class="note">${row.status==='not_tested'?u('未测试原因与剩余条件'):u('尚存事实缺口')}：${hi(a.gaps.join('；'))}</div>`:''}${linkedNotice?`<p class="step-warning">${esc(linkedNotice)}</p>`:''}<div class="goal-focus"><span class="${row.status==='violation'&&focusIndex>=0?'problem-location':''}">${focusIndex>=0?(row.status==='violation'?u('问题位于'):u('核验位置'))+u('第 ')+(focusIndex+1)+u(' 步'):row.status==='violation'?u('原记录未明确定位问题步骤'):items.length+u(' 个已记录操作片段')}</span><button data-section="original-records-${esc(c.id)}-${esc(g.id)}">前提、原始判断与来源 ↓</button></div></header><div class="workbench-body"><nav class="actual-step-list" aria-label="实际操作步骤"><h3>${stepTitle}<span>${items.length} 步</span></h3>${items.map((s,i)=>`<button class="actual-step ${s.focus&&row.status==='violation'?'problem':''}" data-step-key="${esc(s.key)}" aria-current="${s===selected?'step':'false'}"><span class="number">${i+1}</span><span><strong>${hi(s.title)}</strong><span class="step-label">${s.focus?(row.status==='violation'?u('● 问题步骤'):u('核验位置')):s.evidenceIds.length?u('已记录 · ')+s.evidenceIds.length+u(' 份引用'):u('未关联独立证据')}${s.sharedEvidenceIds.length?u(' · 含共享引用'):''}</span></span></button>`).join('')||uiMarkup('<p class="step-list-note">没有留存逐步动作；不会把冻结计划补成已执行步骤。</p>')}<p class="step-list-note">步骤不是新增测试目标。切换一步，右侧只展示该步引用的证据。</p></nav><section class="step-proof-panel"><div class="step-proof-header"><h3>${selected?u('第 ')+(index+1)+u(' 步 · ')+hi(selected.title):u('目标级证据与观察')}</h3><span>${selected?(index+1)+' / '+items.length:u('无逐步动作记录')}</span></div>${selected?`${selected.description!==selected.title?`<p class="actual-description text">${hi(selected.description)}</p>`:''}${renderStepConversationSummary(payload,selected,conversationRefs)}${readback?`<div class="step-readback ${selected.focus&&row.status==='violation'?'problem':''}"><strong>${selected.focus&&row.status==='violation'?u('问题现场记录'):u('实际结果记录')}</strong><span>${hi(readback)}</span></div>`:''}${selected.note?`<p class="step-warning">${hi(selected.note)}</p>`:''}${selected.sharedEvidenceIds.length?uiMarkup('<p class="step-warning">原记录将部分材料共同关联到多个步骤；共享引用不等于逐步独立截图。</p>'):''}${selected.arranged?uiMarkup('<p class="reader-note-origin">步骤标题与证据位置依据既有记录整理；原操作文本及业务结论未改。</p>'):''}`:`<div class="reader-empty"><strong>${row.status==='not_tested'?u('本目标未完成实际检查'):u('未留存逐步动作')}</strong>${row.status==='not_tested'?u('以下材料仅对应已登记准备或缺口，不表示该目标已验证。'):u('只展示目标关联材料，不将其分配给虚构步骤。')}</div>`}${ids.length?uiHtml`<div class="proof-tabs" role="tablist" aria-label="本步证据">${ids.map((id,i)=>`<button data-proof-id="${esc(id)}" role="tab" aria-selected="${state.proofId===id}">${esc(kindLabels[evidenceMap.get(id)?.kind??'other'])} ${i+1}</button>`).join('')}</div><div class="proof-stage" data-proof-step="${esc(selected?.key??'')}">${evidenceCard(state.proofId)}</div>`:uiMarkup('<div class="reader-empty"><strong>此步没有独立关联的截图或响应文件</strong>保留原记录的资料缺口，不使用其他时刻的图片冒充这一步现场。</div>')}${selected?uiHtml`<p class="step-meta">操作发生时间：${time(selected.occurredAt)} · ${esc(selected.actionId)}</p>`:''}${view.unassignedEvidenceIds.length&&selected?uiHtml`<details class="step-unassigned"><summary>目标级其他证据 · ${view.unassignedEvidenceIds.length} 项（未分配到当前步骤）</summary><p class="hint">材料仍保留，不自动当作该步证据。</p>${evidenceButtons(view.unassignedEvidenceIds,u('目标级引用'))}</details>`:''}${!selected&&row.observations.length?uiHtml`<details class="step-goal-observations"><summary>查看已登记的目标观察</summary>${row.observations.map(o=>`<p class="text">${hi(o.actual??o.summary)}</p>`).join('')}</details>`:''}</section></div></section><details class="panel goal-records" id="original-records-${esc(c.id)}-${esc(g.id)}" data-owner-case="${esc(c.id)}" data-owner-goal="${esc(g.id)}"><summary>执行前提、原始判断与完整记录</summary>${note?uiHtml`<section class="fact"><h3>阅读整理来源</h3><p class="text">${hi(note.limitations.join('；'))}</p><p class="meta">来源：${esc(note.sourceLabels.join('、'))}</p><pre class="body-text">${esc(JSON.stringify(note,null,2))}</pre></section>`:''}${goalContent(row)}</details>`;
  }
  function goalCard(row:Row):string{
    const key=row.c.id+'/'+row.g.id,active=state.goalId===row.g.id&&state.selectedCase===row.c.id,matched=filtered().includes(row);
    return `<details class="panel goal-card ${active?'active-goal':''} ${matched?'':'not-matched-goal'}" id="goal-${esc(row.c.id)}-${esc(row.g.id)}" data-goal-card="${esc(key)}" data-owner-case="${esc(row.c.id)}" data-owner-goal="${esc(row.g.id)}" ${goalOpen.has(key)?'open':''}><summary><span class="goal-card-heading"><span class="inline-id">${esc(key)}</span><strong>${hi(row.g.title)}</strong>${badge(row.status)}</span>${row.a?`<span class="goal-preview">${hi(row.a.summary??row.a.rationale)}</span>`:uiMarkup('<span class="goal-preview">未登记评估，不能推断业务状态。</span>')}${!matched?uiMarkup('<span class="meta">未命中目录筛选，仍保留在场景正文。</span>'):''}</summary><div class="goal-content">${goalContent(row)}</div></details>`;
  }
  function metadata(e:Evidence):string{const p=payload.previews[e.id],m=e.metadata;return uiHtml`<details><summary>来源与文件完整性</summary><div class="meta text">证据 ${esc(e.id)}\n来源：${esc(e.source)}\n登记时间：${time(e.collectedAt)}\n来源采集时间：${time(e.capturedAt)}\nSHA-256：${esc(e.sha256)}\n留存字节：${e.bytes}${p?.width?uiTemplate`\n实际图片尺寸：${p.width} × ${p.height}`:''}${m?.page?u('\n页面：')+esc(m.page):''}${m?.object?u('\n对象：')+esc(m.object):''}${m?.scope?u('\n采集范围：')+esc({page:u('页面'),viewport:u('视口'),element:u('局部元素'),document:u('文档'),unknown:u('未知')}[m.scope]):''}${m?.redaction?u('\n脱敏：')+esc(m.redaction):''}${m?.omissionReason?u('\n省略：')+esc(m.omissionReason):''}</div><p class="hint">hash一致只证明留存字节一致，不证明事实真实或业务正确。</p></details>`;}
  function imageSource(e:Evidence):string|undefined{const p=payload.previews[e.id],a=p?.assetId?payload.assets[p.assetId]:undefined;return a?.kind==='image'&&a.data&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(a.data)?a.data:undefined;}
  function evidenceButtons(ids:string[],context=u('关联证据')):string{return unique(ids).map(id=>`<button class="link-button" data-evidence="${esc(id)}" data-evidence-context="${esc(context)}">${esc(evidenceMap.get(id)?.description??id)}</button>`).join('');}
  function textEvidence(e:Evidence,text:string,expanded:boolean,p:Payload['previews'][string]|undefined):string{
    let preview:ReturnType<typeof reportViewModel.requestPreview>=null;
    if(e.kind==='log'||e.kind==='tool_receipt'){try{preview=reportViewModel.requestPreview(JSON.parse(text));}catch{/* ordinary text remains readable */}}
    let fileFacts:ReturnType<typeof reportViewModel.filePreview>=null;
    try{fileFacts=reportViewModel.filePreview(JSON.parse(text));}catch{/* Ordinary retained text. */}
    if(fileFacts)return '<section class="file-facts"><h4>'+esc(fileFacts.title)+'</h4>'+fileFacts.lines.map(line=>'<p>'+esc(line)+'</p>').join('')+list(fileFacts.limitations)+uiMarkup('<details><summary>完整留存读取与来源</summary><pre class="body-text">')+esc(text)+'</pre></details></section>';
    if(!preview)return uiHtml`<details ${expanded?'open':''}><summary>${hi(e.description)} · ${kindLabels[e.kind]} · 查看正文</summary><p class="hint">以下是实际留存内容。${esc(bodyLabels[p?.contentState??'unknown'])}；摘要或筛选字段不等于完整HTTP响应。</p><pre class="body-text">${hi(text)}</pre></details>`;
    return uiHtml`<section class="request-summary"><p class="hint">留存文件中的请求与响应字段；HTTP状态不代替业务结论。</p>${preview.records.map(r=>{let body=r.body;if(body){try{body=JSON.stringify(JSON.parse(body),null,2);}catch{/* keep retained text */}}return `<div class="request-record"><div class="request-record-header"><strong>${esc(r.method||u('留存请求'))}</strong><span class="mono text">${esc(r.path)}</span><b>HTTP ${r.status}</b></div>${body===undefined?uiMarkup('<p class="note">没有留存响应正文。</p>'):`<pre class="body-text">${esc(body)}</pre>`}${r.windowed?uiMarkup('<p class="note">此处是留存正文窗口，仍有未包含内容。</p>'):''}</div>`;}).join('')}<details><summary>完整留存文件（不等于完整HTTP正文）</summary><p class="hint">${esc(bodyLabels[p?.contentState??'unknown'])}；文件来源及局限保持原记录。</p><pre class="body-text">${hi(text)}</pre></details></section>`;
  }
  function evidenceCard(id:string,context=u('当前引用'),expanded=false):string{
    const e=evidenceMap.get(id);if(!e)return uiHtml`<div class="error">引用的证据不存在：${esc(id)}</div>`;const p=payload.previews[id],asset=p?.assetId?payload.assets[p.assetId]:undefined,src=imageSource(e);
    const attachment=p?.attachmentPath&&/^(?:attachments|evidence)\/[a-zA-Z0-9_./-]+$/.test(p.attachmentPath)&&!p.attachmentPath.split('/').includes('..')?p.attachmentPath:undefined;
    let content='';if(src)content=uiHtml`<figure><button class="image-button" data-image="${esc(id)}" data-evidence-context="${esc(context)}"><img class="thumb" src="${src}" alt="${esc(e.description)}" loading="lazy"><span class="meta">${p?.width?`${p.width} × ${p.height} · `:''}查看原图</span></button><figcaption>${hi(e.description)}</figcaption></figure>`;
    else if(asset?.kind==='text'&&asset.text!==undefined)content=textEvidence(e,asset.text,expanded,p)+(asset.truncated?uiHtml`<p class="note">展示已截断：预览 ${asset.retainedBytes} / 原文件 ${asset.bytes} 字节。${attachment?u('完整交付内容见附件。'):u('此HTML未包含完整正文，不能据此宣称交付完整。')}</p>`:'');
    else content=`<h4>${hi(e.description)}</h4><p class="empty">${esc(p?.previewNote||u('此证据没有可预览正文；元数据不能替代实际内容。'))}</p>`;
    if(e.kind==='conversation'){
      const conversation=payload.conversations?.[id];
      content=conversation?'<h4>'+hi(e.description)+uiMarkup('</h4><p class="hint">按留存来源整理的对话；每条消息分别标明原文、完整性与结束依据。</p><button class="conversation-entry" data-conversation="')+esc(id)+u('">打开对话记录 · ')+conversation.artifact.messages.length+uiMarkup('条消息</button><details><summary>规范化文件与元数据</summary>')+content+'</details>':uiMarkup('<p class="note">此对话未能生成可信阅读视图；请核对原件、来源映射和留存缺口。</p>')+content;
    }
    return `<article class="evidence-card" data-evidence-card="${esc(id)}">${context!==u('当前引用')?uiHtml`<p class="note">${esc(context)}；材料存在不等于支持当前结论。</p>`:''}${content}${p?.previewNote&&(src||asset?.kind==='text')?`<p class="hint">${esc(p.previewNote)}</p>`:''}${e.metadata?.purpose?uiHtml`<p><strong>用途：</strong>${esc(e.metadata.purpose)}</p>`:''}${e.metadata?.limitations?.length?uiHtml`<p class="hint">局限：${esc(e.metadata.limitations.join('；'))}</p>`:''}${e.metadata?.contextEvidenceIds?.length?uiHtml`<p class="hint">关联上下文：</p>${evidenceButtons(e.metadata.contextEvidenceIds,u('上下文关联'))}`:''}${attachment?uiHtml`<a class="attachment" href="${esc(attachment)}" download>打开留存附件</a>`:''}${metadata(e)}</article>`;
  }
  function evidenceGrid(ids:string[],context=u('当前引用')):string{const all=unique(ids),images=all.filter(id=>evidenceMap.get(id)?.kind==='screenshot'),documents=all.filter(id=>!images.includes(id));return all.length?`${images.length?`<div class="evidence-images">${images.map(id=>evidenceCard(id,context)).join('')}</div>`:''}${documents.length?`<div class="evidence-documents">${documents.map(id=>evidenceCard(id,context)).join('')}</div>`:''}`:uiMarkup('<p class="empty">没有关联证据；这不是通过结论。</p>');}
  function evidenceForGoal(row:Row,note:GoalNote|undefined):string{
    const primary=note?.primaryEvidenceIds.length?note.primaryEvidenceIds:row.evidenceIds.filter(id=>evidenceMap.get(id)?.kind==='screenshot').slice(0,1),remaining=row.evidenceIds.filter(id=>!primary.includes(id));
    return uiHtml`<section class="goal-evidence"><h3>留存证据 <span class="meta">原目标引用 ${row.evidenceIds.length} 项</span></h3>${primary.length?`<p class="hint">${note?.primaryEvidenceIds.length?u('以下查看重点由AI依据既有材料事后整理，未补拍或更改原图。'):u('先展示首张引用截图；原登记未指定关键截图，引用顺序不代表证据充分性。')}</p>${primary.map(id=>{const use=note?.evidenceUses.find(u=>u.evidenceId===id);return `${evidenceCard(id,row.evidenceIds.includes(id)?u('当前引用'):u('事后复核引用'))}${use?uiHtml`<div class="evidence-purpose"><strong>事后证据说明：${hi(use.purpose)}</strong><p class="text">支持事实：${hi(use.fact)}</p>${use.limitations.length?uiHtml`<p class="hint">局限：${hi(use.limitations.join('；'))}</p>`:''}</div>`:''}`;}).join('')}`:''}${remaining.length?uiHtml`<details class="other-evidence"><summary>其他引用证据 · ${remaining.length} 项（截图、DOM、接口或资料）</summary>${evidenceGrid(remaining)}</details>`:row.evidenceIds.length?'':uiMarkup('<p class="empty">当前目标没有关联证据；不据此自动推断业务状态。</p>')}</section>`;
  }
  function readingNote(note:GoalNote):string{return uiHtml`<section class="retrospective-note"><h3>事后复核说明 <span class="meta">未重新执行</span></h3><p class="text">${hi(note.summary)}</p>${note.preparation.length?uiHtml`<h4>建议复核前提</h4>${list(note.preparation)}`:''}${note.reviewSteps.length?uiHtml`<h4>建议复核路线（不是原实际操作记录）</h4><ol>${note.reviewSteps.map(s=>`<li class="text">${hi(s)}</li>`).join('')}</ol>`:''}<p class="note">${hi(note.limitations.join('；'))}</p><details><summary>复核说明来源与其他证据用途</summary><p class="meta">${esc(note.sourceLabels.join('、'))}</p>${note.evidenceUses.map(use=>`<p><strong>${hi(use.purpose)}</strong>：${hi(use.fact)}${use.limitations.length?u('；局限：')+hi(use.limitations.join('；')):''}${evidenceButtons([use.evidenceId],u('事后复核引用'))}</p>`).join('')}</details></section>`;}
  function contextFact(title:string,f:ContextFact):string{const value=f.state==='known'?f.summary:(f.state==='unknown'?u('未知：'):u('不适用：'))+(f.summary);return `<div class="contextfact"><div class="kicker">${title}</div><p class="text">${hi(value)}</p>${f.sources.flatMap(s=>s.evidenceIds).length?evidenceButtons(f.sources.flatMap(s=>s.evidenceIds),u('上下文来源')):uiMarkup('<p class="meta">未关联独立来源证据。</p>')}</div>`;}
  function renderContext(c:Context):string{return uiHtml`<section class="fact"><h4>执行上下文 <span class="inline-id">${esc(c.id)}</span></h4><div class="contexts">${contextFact(u('环境 / 版本'),c.environment)}${contextFact(u('身份 / 角色 / 租户'),c.identity)}${contextFact(u('操作对象'),c.objects)}${contextFact(u('初始状态'),c.initialState)}${contextFact(u('授权条件'),c.authorization)}</div>${c.notes?`<p class="hint text">${esc(c.notes)}</p>`:''}</section>`;}
  function renderObservation(o:Observation,c:CaseData,context=u('当前引用')):string{
    const ctx=c.contexts.find(ctx=>ctx.id===o.contextId);
    return uiHtml`<section class="fact"><h4>实际观察 <span class="inline-id">${esc(o.id)}</span></h4><p class="text">${hi(o.actual??o.summary)}</p><p class="meta">事实发生时间：${time(o.occurredAt)}${o.contextId?u(' · 上下文 ')+esc(o.contextId):u(' · 未绑定独立上下文')}</p>${ctx?uiHtml`<details><summary>身份、对象与初态</summary>${renderContext(ctx)}</details>`:''}${o.actions?.length?o.actions.map((a,i)=>uiHtml`<div class="action"><div class="action-header"><span class="action-number">${i+1}</span><div><h4>${hi(a.description)}</h4>${a.input?uiHtml`<p class="text"><strong>实际输入：</strong>${hi(a.input)}</p>`:''}${a.result?uiHtml`<p class="text"><strong>观察结果：</strong>${hi(a.result)}</p>`:''}<p class="meta">操作时间：${time(a.occurredAt)} · ${esc(a.id)}</p></div></div>${evidenceGrid(a.evidenceIds,context)}${(o.evidenceLinks??[]).filter(l=>l.actionId===a.id).map(l=>uiHtml`<p><strong>证据用途：</strong>${esc(l.purpose)}；支持事实：${esc(l.fact)}${l.limitations.length?u('；局限：')+esc(l.limitations.join('；')):''}${evidenceButtons([l.evidenceId],context)}</p>`).join('')}</div>`).join(''):uiMarkup('<p class="note">原记录未提供独立的实际动作序列。下方计划不能当作已执行步骤。</p>')}${(o.evidenceLinks??[]).filter(l=>!l.actionId).map(l=>`<p><strong>${esc(l.purpose)}</strong>：${esc(l.fact)}${l.limitations.length?u('；局限：')+esc(l.limitations.join('；')):''}${evidenceButtons([l.evidenceId],context)}</p>`).join('')}<details><summary>原始观察与必要语义引用</summary><p class="text">${esc(o.summary)}</p><p class="meta">覆盖：${esc(o.coveredRefs.join('、')||u('未声明'))}</p>${evidenceButtons(o.evidenceIds,context)}</details></section>`;
  }
  function sameRun(id:string):boolean{return id==='self'||id===report.runId;}
  function relations(row:Row):string{
    const f=row.g.followUpOf;let html='';if(f)html+=uiHtml`<div class="note"><strong>本目标复核的来源</strong><p class="text">${esc(f.reason)}</p><p class="meta">${esc(f.runId)} / ${esc(f.caseId)} / ${esc(f.goalId)}</p>${sameRun(f.runId)&&rows.some(r=>r.c.id===f.caseId&&r.g.id===f.goalId)?uiHtml`<button data-related-case="${esc(f.caseId)}" data-related-goal="${esc(f.goalId)}">查看原目标</button>`:uiMarkup('<p class="hint">源运行未包含在本报告，只保留追踪引用；不据此宣布已解决。</p>')}</div>`;
    for(const r of rows.filter(r=>r.g.followUpOf&&sameRun(r.g.followUpOf.runId)&&r.g.followUpOf.caseId===row.c.id&&r.g.followUpOf.goalId===row.g.id))html+=uiHtml`<p><button data-related-case="${esc(r.c.id)}" data-related-goal="${esc(r.g.id)}">后续复核：${esc(r.g.title)}</button> ${badge(r.status)} <span class="hint">原评估保留，不自动替换。</span></p>`;
    return html;
  }
  const referenceCache=new Map(report.cases.map(c=>[c.id,{current:new Set(reportViewModel.current(c,report.evidenceCatalog.items)),history:new Set(reportViewModel.historical(c,report.evidenceCatalog.items)),findings:new Set(reportViewModel.findingRefs(c,report.evidenceCatalog.items))}]));
  function referenceLabel(e:Evidence):string{const refs=referenceCache.get(e.caseId);return !refs?u('未关联场景'):refs.current.has(e.id)?u('当前引用'):refs.findings.has(e.id)?u('关联现象引用'):refs.history.has(e.id)?u('仅历史引用'):u('已登记未引用');}
  function historyFacts(view:ReturnType<typeof reportViewModel.history>,c:CaseData):string{
    const a=view.assessment;if(!a)return uiMarkup('<p class="empty">未找到当时的目标评估。</p>');
    return uiHtml`<details><summary>当时完整事实、上下文与判断字段</summary><p class="hint">以下来自该次评估及其引用的不可变观察；复用早先观察不会被改写为新采集。</p>${view.contexts.map(renderContext).join('')}${view.observations.map(o=>renderObservation(o,c,u('历史引用'))).join('')}${(a.phenomena??[]).map(p=>`<section class="fact"><h4>${hi(p.title)}</h4><p class="text">${hi(p.actual)}</p>${p.limitations.length?list(p.limitations):''}${evidenceButtons(p.evidenceIds,u('历史现象引用'))}</section>`).join('')}${(a.gapDetails??[]).map(g=>uiHtml`<p class="note">${hi(g.missing)}；影响：${hi(g.impact)}${g.nextStep?u('；需要准备：')+hi(g.nextStep):''}</p>`).join('')}${a.diagnosis?uiHtml`<section class="fact"><h4>当时根因判断</h4><p>${esc(a.diagnosis.state)} / ${esc(a.diagnosis.category)}：${hi(a.diagnosis.summary)}</p>${evidenceButtons(a.diagnosis.evidenceIds,u('历史诊断引用'))}</section>`:''}${a.reproduction?uiHtml`<section class="fact"><h4>当时复核准备</h4>${list(a.reproduction.preparation)}<p>对象现状：${hi(a.reproduction.objectState)}</p><p>重复观察：${hi(a.reproduction.repeatability)}</p>${list(a.reproduction.limitations)}</section>`:''}<details><summary>完整历史原始字段（目标范围）</summary><pre class="body-text">${esc(JSON.stringify(view,null,2))}</pre></details></details>`;
  }
  function goalContent(row:Row):string{
    const {c,g,a,observations,contexts,actionEvents}=row,note=goalNote(c.id,g.id);
    const actuals=unique(observations.map(o=>o.actual??o.summary));
    let html=uiHtml`${a?.summary?`<p class="lead text">${hi(a.summary)}</p>`:''}${linkedNotice&&state.goalId===g.id?`<p class="note">${esc(linkedNotice)}</p>`:''}<section class="goal-judgment"><div class="compare"><div><div class="kicker">业务预期 · 冻结原文</div><p class="text">${hi(g.expected)}</p></div><div><div class="kicker">实际留存观察</div>${actuals.length?actuals.map(s=>`<p class="text">${hi(s)}</p>`).join(''):uiMarkup('<p class="hint">没有关联的实际观察；不能根据原计划补写已经执行。</p>')}</div></div>${a?uiHtml`<p class="judgment-reason"><strong>判断理由：</strong>${hi(a.rationale)}</p>`:uiMarkup('<p class="note">未登记评估是记录缺口，不是第五种业务状态。</p>')}${g.clarificationQuestions?.length?uiHtml`<div class="note"><strong>冻结待澄清</strong>${list(g.clarificationQuestions)}</div>`:''}`;
    if(a){
      html+=(a.phenomena??[]).map(p=>uiHtml`<section class="fact"><h4>${hi(p.title)}</h4><p class="text">${hi(p.actual)}</p>${p.limitations.length?`<p class="note">${esc(p.limitations.join('；'))}</p>`:''}${evidenceGrid(p.evidenceIds)}<p class="meta">现象 ${esc(p.id)}；拆分现象不增加目标数。</p></section>`).join('');
      if(a.gaps.length)html+=`<div class="note"><strong>${row.status==='not_tested'?u('未测试原因与剩余条件'):u('尚存事实缺口')}</strong>${list(unique(a.gaps))}</div>`;
      html+=(a.gapDetails??[]).map(gap=>uiHtml`<div class="note"><strong>${esc(gap.missing)}</strong><p>影响：${esc(gap.impact)}</p>${gap.nextStep?uiHtml`<p>需要准备：${esc(gap.nextStep)}</p>`:''}</div>`).join('');
      if(a.diagnosis)html+=uiHtml`<p class="hint">根因${{unknown:u('未确认'),hypothesis:u('仅为假设'),confirmed:u('已确认')}[a.diagnosis.state]}：${esc(a.diagnosis.summary)}。根因与业务状态分别保留。</p>${evidenceButtons(a.diagnosis.evidenceIds,u('诊断引用'))}`;
    }
    html+=uiHtml`</section>${evidenceForGoal(row,note)}<section class="goal-process"><h3>实际经过与复核准备</h3>`;
    if(row.status!=='not_tested'){
      const gaps=[!contexts.length?u('原观察未关联独立身份、对象及初态。'):'',!observations.some(o=>o.actions?.length)&&!actionEvents.length?u('原观察没有关联结构化实际操作序列或动作事件。'):'',!a?.reproduction?u('原评估未填写独立复核准备和重复观察说明。'):''].filter(Boolean);
      if(gaps.length)html+=uiHtml`<div class="recording-gap"><strong>复核资料有缺口</strong>${list(gaps)}<p class="hint">这描述资料完整性，不更改原业务状态；原计划和事后建议不作为已经执行的证明。</p></div>`;
    }
    html+=contexts.map(renderContext).join('');
    for(const o of observations.filter(o=>o.actions?.length||o.evidenceLinks?.length))html+=renderObservation(o,c);
    if(actionEvents.length)html+=uiHtml`<details><summary>目标实际关联的动作事件 · ${actionEvents.length} 条</summary><p class="hint">按登记顺序列示，不把登记时间当成发生时间；意图、派发和业务结果分别保留。</p>${actionEvents.map(e=>uiHtml`<section class="fact"><h4>${hi(e.summary)}</h4><p class="meta">${esc(e.actionId)} · ${esc(e.kind)} · 发生时间 ${time(e.occurredAt)}</p>${evidenceButtons(e.evidenceIds,u('目标动作事件'))}</section>`).join('')}</details>`;
    if(a?.reproduction)html+=uiHtml`<section class="fact"><h4>原评估中的复核准备</h4>${list(a.reproduction.preparation)}<p>对象现状：${hi(a.reproduction.objectState)}</p><p>重复观察：${hi(a.reproduction.repeatability)}</p>${list(a.reproduction.limitations)}</section>`;
    if(note)html+=readingNote(note);
    html+=uiHtml`</section><details class="goal-source"><summary>规则、原始观察与历史登记</summary><h3>规则来源</h3><p class="meta text">${hi(g.basis.source)}</p><p class="text">${hi(g.basis.text)}</p><p class="meta">必要语义：${esc(g.requiredRefs.join('、'))}</p>${relations(row)}<h3>原始观察</h3>${observations.map(o=>uiHtml`<article class="fact"><p class="text">${hi(o.summary)}</p><p class="meta">${esc(o.id)} · 事实发生时间 ${time(o.occurredAt)} · 覆盖 ${esc(o.coveredRefs.join('、'))}</p>${evidenceButtons(o.evidenceIds)}</article>`).join('')}<h3>登记历史与来源</h3><p class="hint">final是增量登记或修订，不能按条数计算复测次数；attempt不替换当前结果。</p>`;
    for(const e of c.entries.filter(e=>e.record.assessments.some(a=>a.goalId===g.id))){const view=reportViewModel.history(c,e,g.id),old=view.assessment;if(!old)continue;html+=uiHtml`<details class="history-entry" data-history-operation="${esc(e.operationId)}"><summary>${badge(old.status)}${e.operationId===a?.operationId?u('当前采用'):u('历史记录')} · ${e.mode==='attempt'?u('尝试'):u('评估登记')} · revision ${e.revision}</summary><p class="meta">登记时间 ${time(e.recordedAt)} · ${esc(e.operationId)}</p>${old.revisionReason?uiHtml`<p>修订原因：${hi(old.revisionReason)}</p>`:''}<p class="text">${hi(old.rationale)}</p>${old.gaps.length?list(old.gaps):''}${evidenceButtons(reportViewModel.closure(view.evidenceIds,report.evidenceCatalog.items),u('历史引用'))}${historyFacts(view,c)}</details>`;}
    const unused=report.evidenceCatalog.items.filter(e=>e.caseId===c.id&&referenceLabel(e)===u('已登记未引用'));
    if(unused.length)html+=uiHtml`<details><summary>同场景已登记未引用证据 · ${unused.length} 项</summary><p class="note">文件存在不意味着支持当前结论。</p>${evidenceButtons(unused.map(e=>e.id),u('已登记未引用'))}</details>`;
    html+=uiHtml`<details><summary>当前评估原始字段与技术溯源</summary><p class="meta">Run ${esc(report.runId)} · 结果版本 ${report.revision} · 证据版本 ${report.evidenceRevision}</p><pre class="body-text">${esc(JSON.stringify(a??{recordingGap:u('未登记评估')},null,2))}</pre></details></details>`;
    return html;
  }

  function library():string{
    const q=state.query.toLocaleLowerCase(),items=report.evidenceCatalog.items.filter(e=>(state.evidenceKind==='all'||e.kind===state.evidenceKind)&&(state.evidenceUse==='all'||referenceLabel(e)===state.evidenceUse)&&(!q||(e.id+'\n'+evidenceText(e.id)).toLocaleLowerCase().includes(q)));
    return uiHtml`<section class="panel"><h2>证据库</h2><p class="hint">${items.length} / ${report.evidenceCatalog.items.length} 项登记；内容去重不删除ID、来源和引用关系。</p><div class="library-controls"><label>种类<select id="evidence-kind">${['all','screenshot','tool_receipt','log','dom','conversation','other'].map(k=>`<option value="${k}" ${k===state.evidenceKind?'selected':''}>${k==='all'?u('全部种类'):kindLabels[k]}</option>`).join('')}</select></label><label>引用范围<select id="evidence-use">${['all',u('当前引用'),u('关联现象引用'),u('仅历史引用'),u('已登记未引用')].map(k=>`<option value="${k}" ${k===state.evidenceUse?'selected':''}>${k==='all'?u('全部引用状态'):k}</option>`).join('')}</select></label></div>${items.length?uiHtml`<div class="tablewrap"><table><thead><tr><th>证据</th><th>场景 / 种类</th><th>引用与内容</th></tr></thead><tbody>${items.map(e=>`<tr><td><button class="title-button" data-evidence="${esc(e.id)}" data-evidence-context="${esc(referenceLabel(e))}">${hi(e.description)}</button><div class="inline-id">${esc(e.id)}</div></td><td><button class="link-button" data-scene="${esc(e.caseId)}">${esc(report.cases.find(c=>c.id===e.caseId)?.title??e.caseId)}</button><div class="meta">${kindLabels[e.kind]}</div></td><td>${referenceLabel(e)}<div class="meta">${esc(bodyLabels[payload.previews[e.id]?.contentState??'unknown'])}</div></td></tr>`).join('')}</tbody></table></div>`:uiMarkup('<p class="empty">证据库当前筛选没有结果；可重置条件继续查看。</p>')}</section>`;
  }
  function findingMatches():string{
    const q=state.query.toLocaleLowerCase(),cases=report.cases.filter(c=>c.findings.some(f=>!q||JSON.stringify(f).toLocaleLowerCase().includes(q)));
    if(!cases.length)return '';
    return uiHtml`<section class="panel"><h3>${q?u('另有场景现象关键词命中'):u('场景关联现象入口')}</h3><p class="hint">这里独立列示关联现象及额外发现，不受目标状态推断，不计入目标命中数。</p>${cases.map(c=>uiHtml`<article class="fact"><button class="title-button" data-scene="${esc(c.id)}">${esc(c.title)} · 查看关联现象与额外发现</button>${c.findings.filter(f=>!q||JSON.stringify(f).toLocaleLowerCase().includes(q)).map(f=>`<p>${hi(f.title)} <span class="meta">${f.scope==='additional'?u('额外发现'):u('原范围关联')}${f.goalIds.length?'':u(' · 未绑定目标')}</span></p>`).join('')}</article>`).join('')}</section>`;
  }
  function lifecycle():string{return state.view!=='scene'?'':report.cases.filter(c=>c.actionEvents.length&&c.id===state.selectedCase).map(c=>uiHtml`<details class="panel"><summary>${esc(c.title)}：原始动作尝试与核对记录</summary><p>意图、派发回执不代表业务通过；首次异常与处置均保留。</p>${c.actionEvents.map(e=>`<section class="fact"><h4>${esc(e.summary)}</h4><p class="meta">${esc(e.actionId+' / '+e.kind+' / '+e.purpose)}</p><p>${esc(e.dispatchState??e.resultState??e.disposition?.state??u('未声明'))}</p>${evidenceButtons(e.evidenceIds,u('动作事件证据'))}</section>`).join('')}</details>`).join('');}
  function render():void{
    const oldStep=state.stepKey,oldGoal=document.querySelector<HTMLElement>('.goal-workbench')?.id,proofY=document.querySelector('.step-proof-panel')?.scrollTop??0,stepY=document.querySelector('.actual-step-list')?.scrollTop??0;
    if(state.view==='scene'&&!rows.some(r=>r.c.id===state.selectedCase&&r.g.id===state.goalId)){const rs=rows.filter(r=>r.c.id===state.selectedCase);state.goalId=(rs.find(r=>r.status==='violation')??rs[0])?.g.id??'';}
    renderNavigation();const c=report.cases.find(c=>c.id===state.selectedCase);$('#breadcrumbs').innerHTML=state.view==='overview'?uiMarkup('<strong>总览</strong>'):uiHtml`<button data-overview>总览</button><span aria-hidden="true">›</span><strong>${state.view==='evidence'?u('证据库'):esc((c?.id??'')+' '+(c?.title??''))}</strong>`;
    $('#detail').innerHTML=state.view==='overview'?sceneOverview()+findingMatches():state.view==='scene'?sceneDetail():library();$('#detail').insertAdjacentHTML('beforeend',lifecycle());
    const indexes=new Map<string,number>();document.querySelectorAll<HTMLDetailsElement>('#detail details:not(.goal-card)').forEach(d=>{const el=d.closest<HTMLElement>('[data-owner-case][data-owner-goal]'),owner=el?el.dataset.ownerCase+'/'+el.dataset.ownerGoal+(d.closest('.proof-stage')?'/'+state.stepKey+'/'+state.proofId:'/records'):state.view+'/'+state.selectedCase,index=indexes.get(owner)??0;indexes.set(owner,index+1);const key=owner+'/reading/'+index;d.dataset.readingKey=key;d.open=readingOpen.has(key);});
    if(oldGoal===document.querySelector('.goal-workbench')?.id&&oldStep===state.stepKey){document.querySelector('.step-proof-panel')?.scrollTo(0,proofY);document.querySelector('.actual-step-list')?.scrollTo(0,stepY);}
  }
  $('#project-line').textContent=report.project;$('#run-line').textContent=uiTemplate`运行 ${report.runId} · 时间显示 UTC+08:00 · 离线报告 v9`;
  $('#execution-model-info').innerHTML=modelHeader(report.aiContext,'test_execution');
  $('#scope-summary').textContent=formatUi('{scenes} 个场景 · {goals} 个业务目标',{scenes:report.caseCount,goals:report.goalCount});
  $('#retrospective-label').hidden=!report.context;
  $('#summary').innerHTML=order.filter(s=>s!=='unassessed'||report.counts.unassessed>0).map(s=>`<button class="stat status-${s}" data-stat="${s}"><strong>${report.counts[s]}</strong><span>${labels[s]}</span></button>`).join('');
  if(!report.assessmentComplete||!payload.delivery.complete){$('#recording-warning').hidden=false;$('#recording-warning').textContent=[!report.assessmentComplete?uiTemplate`${report.counts.unassessed} 个目标未登记评估；这是记录缺口，不能算作通过或未测试。`:'',!payload.delivery.complete?u('证据交付不完整；请查看各证据的缺失、截断或附件说明。'):''].filter(Boolean).join(' ');}
  $('#integrity').innerHTML=uiHtml`<p class="hint">${report.evidenceIntegrity.hashVerifiedItems} 项文件hash匹配；${report.evidenceCoverage.registeredScreenshots} 项截图登记，全部证据按内容去重 ${report.evidenceCoverage.distinctRetainedContents} 份。记录${report.assessmentComplete?u('完整'):u('不完整')}不等于业务验收通过。</p><p class="meta">结果 revision ${report.revision} · 证据 revision ${report.evidenceRevision} · ${payload.delivery.mode==='bundle'?u('附件包交付，移动时须保留附件目录'):u('独立HTML交付')}。</p>`;
  const extras:string[]=[];
  if(report.regressionBinding){const b=report.regressionBinding as {selection:{request:{mode:string;cases:{caseVersion:number}};notSelectedPointIds:string[]};coverage:{requestedCases:number;requestedGoals:number;selectedCases:number;selectedGoals:number;compiledCases:number;compiledGoals:number;gaps:{pointId:string|null;reason:string}[]}};const c=b.coverage;
    const notes=reportViewModel.summaryDisclosure(c.gaps.map(g=>(g.pointId??u('来源覆盖'))+'：'+g.reason)),note=(s:string)=>`<p class="note">${esc(s)}</p>`;
    const exact=uiHtml`<details class="scope-exact"><summary>用例版本、审阅依据与本次条件</summary><pre class="body-text">${esc(JSON.stringify(report.regressionBinding,null,2))}</pre></details>`;
    extras.push(uiHtml`<section class="panel scope-header"><h3>本轮范围与用例版本</h3><p>${scopeLabel(b)}</p><p>原范围 ${c.requestedCases}/${c.requestedGoals}；选中 ${c.selectedCases}/${c.selectedGoals}；本次冻结 ${c.compiledCases}/${c.compiledGoals}（场景/目标）。</p><p class="hint">未选中没有本次结果，不继承历史通过；全量选择不等于全量完成。</p><p>未选中：${esc(String(b.selection.notSelectedPointIds.length)+u(' 个测试点（编号见下方明细）'))}</p><div class="scope-preview">${notes.visible.map(note).join('')}</div>${notes.remaining.length?uiHtml`<details class="scope-more"><summary><span class="scope-open">展开其余 ${notes.remaining.length} 条说明及版本明细</span><span class="scope-close">收起，保留前3条说明</span></summary>${notes.remaining.map(note).join('')}${exact}</details>`:exact}</section>`);
  }
  const unresolved=(report.actionAttempts??[]).filter(a=>a.unresolved);if(unresolved.length)extras.push(uiHtml`<section class="panel pending-actions"><h3>尚待核对的动作 · ${unresolved.length} 项</h3>${unresolved.map(a=>uiHtml`<article class="pending-action"><p class="meta">${esc(report.cases.find(c=>c.id===a.caseId)?.title??a.caseId)} · ${esc(a.caseId)}</p><h4>${esc(a.label)}</h4><p class="text">${esc(a.detail)}</p><details><summary>核对原因与原始标识</summary><p>${esc(a.reasons.join('；'))}</p><p class="meta">${esc(a.caseId+'/'+a.actionId)}</p></details></article>`).join('')}<p class="hint">这些结果仍未确认；报告不会自动重发或重试业务操作。</p></section>`);
  if(extras.length){const section=document.createElement('section');section.id='regression-summary';section.innerHTML=extras.join('');$('#summary').after(section);}
  if(report.execution&&report.executionSummary){const e=report.execution,s=report.executionSummary;$('#execution-summary').innerHTML=uiHtml`<h4>执行记录</h4><p class="hint">并发上限 ${s.configuredMaxParallelCases}；名额峰值 ${s.peakReservations}；执行峰值 ${s.reportedExecutionPeak??u('未知')}。名额不是浏览器实测重叠。</p><p class="hint">未完成分派 ${s.unfinishedAssignmentIds.length}；待导入 ${s.pendingImportIds.length}。</p>${e.assignments.length?uiHtml`<details><summary>分派与事件明细</summary>${e.assignments.map(a=>`<p class="meta">${esc(a.caseId)} / ${esc(a.id)} / ${esc(a.state)} / worker ${esc(a.workerId??u('未绑定'))} / Space ${esc(a.defaultSpaceId??u('未知'))}</p>`).join('')}${e.events.filter(e=>e.kind.startsWith('note:')).map(e=>`<p class="meta">${esc(e.kind)}：${esc(e.reason)}</p>`).join('')}</details>`:''}`;}
  if(report.context)$('#report-context').innerHTML=uiHtml`<h4>事后整理来源</h4><p class="text">${esc(report.context.summary)}</p>${list(report.context.limitations)}${report.context.sources.map(s=>`<p class="meta">${esc(s.label)} · ${esc(s.file)} · SHA-256 ${esc(s.sha256)}</p>`).join('')}`;
  const modals=new Map<string,{focus:HTMLElement|null;x:number;y:number;body:string;root:string}>();
  let applyingLocation=false;
  function openDialog(id:string,trigger?:HTMLElement):void{
    const d=$<HTMLDialogElement>('#'+id);if(d.open)return;
    modals.set(id,{focus:trigger??document.activeElement as HTMLElement,x:scrollX,y:scrollY,body:document.body.style.overflow,root:document.documentElement.style.overflow});
    document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden';d.showModal();
  }
  document.querySelectorAll<HTMLDialogElement>('dialog').forEach(d=>d.addEventListener('close',()=>{
    const m=modals.get(d.id);if(!m)return;modals.delete(d.id);document.body.style.overflow=m.body;document.documentElement.style.overflow=m.root;window.scrollTo(m.x,m.y);m.focus?.focus({preventScroll:true});if(!applyingLocation&&d.id!=='theme-dialog'){const saved:unknown=history.state;if(object(saved)&&saved.scope===readerScope&&saved.modalEntry===true){history.back();return;}if($<HTMLDialogElement>('#lightbox').open)saveHash(gallery[imageIndex]);else if($<HTMLDialogElement>('#evidence-dialog').open)saveHash($('#evidence-dialog').dataset.evidenceId);else saveHash();}
  }));
  let gallery:string[]=[],imageIndex=0,imageContext='',zoom=1;
  function setImageMode(mode:'fit'|'original'|'zoom'):void{
    const image=$<HTMLImageElement>('#lightbox-image');$('#image-body').className='viewerbody '+mode;
    if(mode!=='zoom'){image.style.width='';image.style.height='';zoom=1;}else{image.style.width=Math.round(image.naturalWidth*zoom)+'px';image.style.height='auto';}
    $('#image-zoom').textContent=mode==='fit'?u('适应'):Math.round(zoom*100)+'%';
  }
  function showImage():void{
    const id=gallery[imageIndex],e=id?evidenceMap.get(id):undefined;if(!e)return;const image=$<HTMLImageElement>('#lightbox-image'),p=payload.previews[e.id];
    $('#lightbox-error').hidden=true;image.hidden=false;image.alt=e.description;image.src=imageSource(e)??'';
    $('#lightbox-caption').textContent=`${imageIndex+1} / ${gallery.length} · ${e.description}`;
    $('#image-meta').textContent=uiTemplate`${imageContext}；${p?.width?uiTemplate`${p.width} × ${p.height} 像素；`:''}来源采集时间 ${time(e.capturedAt)}；登记时间 ${time(e.collectedAt)}。${e.metadata?.limitations?.join('；')??''}`;
    if($<HTMLDialogElement>('#lightbox').open)saveHash(e.id);
    $<HTMLButtonElement>('#image-prev').disabled=gallery.length<2;$<HTMLButtonElement>('#image-next').disabled=gallery.length<2;setImageMode('fit');$('#image-body').scrollTop=0;$('#image-body').scrollLeft=0;
  }
  function evidenceOwner(trigger:HTMLElement):Row|undefined{
    const owner=trigger.closest<HTMLElement>('[data-owner-case][data-owner-goal]'),row=owner?rows.find(r=>r.c.id===owner.dataset.ownerCase&&r.g.id===owner.dataset.ownerGoal):undefined;
    if(row){state.selectedCase=row.c.id;state.goalId=row.g.id;}
    return row;
  }
  function openImage(id:string,context:string,trigger:HTMLElement):void{
    const row=evidenceOwner(trigger);
    const step=row&&trigger.closest('.proof-stage')?reportViewModel.steps(row.c,row.g.id,report.evidenceCatalog.items,readerNote(row.c.id,row.g.id)).items.find(s=>s.key===state.stepKey):undefined;
    gallery=(step?step.evidenceIds:context===u('当前引用')&&row?row.evidenceIds:[id]).filter(id=>{const e=evidenceMap.get(id);return !!e&&!!imageSource(e);});
    if(!applyingLocation)saveHash();if(!gallery.includes(id))gallery=[id];imageIndex=gallery.indexOf(id);imageContext=context;showImage();openDialog('lightbox',trigger);saveHash(id,!applyingLocation);
  }
  function openEvidence(id:string,context:string,trigger:HTMLElement):void{
    const e=evidenceMap.get(id);if(!e)return;if(imageSource(e)){openImage(id,context,trigger);return;}
    evidenceOwner(trigger);
    if(!applyingLocation)saveHash();$('#evidence-title').textContent=e.description;$('#evidence-content').innerHTML=evidenceCard(id,context,true);$('#evidence-dialog').dataset.evidenceId=id;openDialog('evidence-dialog',trigger);saveHash(id,!applyingLocation);
  }
  $<HTMLImageElement>('#lightbox-image').addEventListener('error',()=>{$<HTMLImageElement>('#lightbox-image').hidden=true;$('#lightbox-error').hidden=false;$('#lightbox-error').textContent=u('图片无法解码；这里没有显示真实图像。文件hash匹配不能替代图片可读性。');});
  document.addEventListener('error',event=>{const image=event.target;if(image instanceof HTMLImageElement&&image.classList.contains('thumb')){image.hidden=true;const p=document.createElement('p');p.className='error';p.textContent=u('图片无法解码；请核对留存文件。');image.after(p);}},true);
  function nextImage(delta:number):void{if(gallery.length){imageIndex=(imageIndex+delta+gallery.length)%gallery.length;showImage();}}
  $('#image-prev').onclick=()=>nextImage(-1);$('#image-next').onclick=()=>nextImage(1);$('#image-fit').onclick=()=>setImageMode('fit');$('#image-original').onclick=()=>setImageMode('original');
  $('#image-minus').onclick=()=>{zoom=Math.max(.25,zoom/1.25);setImageMode('zoom');};$('#image-plus').onclick=()=>{zoom=Math.min(5,zoom*1.25);setImageMode('zoom');};
  $('#lightbox').addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();nextImage(e.key==='ArrowLeft'?-1:1);}});
  const themeNames=new Map([...document.querySelectorAll<HTMLElement>('[data-theme-id]')].map(button=>[button.dataset.themeId??'',(button.textContent??'').trim().replace(/^[A-H]\s*·\s*/,'')]));
  const themeStorageKey='ego-report-theme-v1';
  function applyTheme(id:string,persist:boolean):void{
    if(!themeNames.has(id))return;document.documentElement.dataset.theme=id;$('#theme-button').textContent=u('主题 · ')+themeNames.get(id);$('#theme-status').textContent=u('已切换为')+themeNames.get(id);
    document.querySelectorAll<HTMLElement>('[data-theme-id]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeId===id)));
    if(persist){try{localStorage.setItem(themeStorageKey,id);$('#theme-storage').textContent=u('已在当前浏览器记住此主题。');}catch{$('#theme-storage').textContent=u('当前浏览器不允许保存偏好；本次切换仍然有效。');}}
  }
  try{const saved=localStorage.getItem(themeStorageKey);if(saved)applyTheme(saved,false);}catch{/* file:// storage can be unavailable; A remains usable. */}
  $('#theme-button').onclick=()=>openDialog('theme-dialog',$('#theme-button'));
  function reset():void{window.clearTimeout(searchTimer);saveHash();linkedNotice='';sceneOpen.clear();goalOpen.clear();readingOpen.clear();document.querySelectorAll<HTMLDetailsElement>('#regression-summary details').forEach(d=>d.open=false);state={...initial};render();$('#case-list').scrollTop=0;saveHash(undefined,true);$('.reader-main').scrollIntoView({block:'start'});}
  $('#reset').onclick=reset;
  $('#library-button').onclick=()=>navigate({view:'evidence',selectedCase:'',goalId:''});
  let searchTimer=0;
  $('#search').addEventListener('input',()=>{window.clearTimeout(searchTimer);searchTimer=window.setTimeout(()=>{state.query=$<HTMLInputElement>('#search').value.trim();linkedNotice='';render();saveHash();},120);});
  $<HTMLSelectElement>('#status-filter').onchange=()=>{window.clearTimeout(searchTimer);state.query=$<HTMLInputElement>('#search').value.trim();state.status=$<HTMLSelectElement>('#status-filter').value as State['status'];linkedNotice='';render();saveHash();};
  document.addEventListener('change',event=>{const t=event.target;if(!(t instanceof HTMLSelectElement))return;if(t.id==='evidence-kind'){state.evidenceKind=t.value;$('#detail').innerHTML=library();}if(t.id==='evidence-use'){state.evidenceUse=t.value;$('#detail').innerHTML=library();}});
  document.addEventListener('toggle',event=>{const d=event.target;if(!(d instanceof HTMLDetailsElement)||!d.isConnected)return;if(d.classList.contains('scene')&&d.dataset.case){if(d.open)sceneOpen.add(d.dataset.case);else sceneOpen.delete(d.dataset.case);const b=d.querySelector<HTMLButtonElement>('.scene-toggle');if(b){b.textContent=d.open?'▾':'▸';b.setAttribute('aria-expanded',String(d.open));b.setAttribute('aria-label',(d.open?u('收起'):u('展开'))+d.dataset.case);}}if(d.classList.contains('goal-card')&&d.dataset.goalCard){if(d.open)goalOpen.add(d.dataset.goalCard);else goalOpen.delete(d.dataset.goalCard);}if(d.dataset.readingKey){if(d.open)readingOpen.add(d.dataset.readingKey);else readingOpen.delete(d.dataset.readingKey);}},true);
  document.addEventListener('click',event=>{
    const t=event.target;if(!(t instanceof Element))return;
    const disclosure=t.closest('summary')?.parentElement;
    if(disclosure instanceof HTMLDetailsElement&&disclosure.classList.contains('goal-card')&&disclosure.dataset.goalCard){if(disclosure.open)goalOpen.delete(disclosure.dataset.goalCard);else goalOpen.add(disclosure.dataset.goalCard);}
    if(disclosure instanceof HTMLDetailsElement&&disclosure.dataset.readingKey){if(disclosure.open)readingOpen.delete(disclosure.dataset.readingKey);else readingOpen.add(disclosure.dataset.readingKey);}
    const target=t.closest<HTMLElement>('button,a');if(!target)return;
    if(target.dataset.conversation){event.preventDefault();conversationReader.open(target.dataset.conversation,(target.dataset.conversationMessages??'').split(',').filter(Boolean));return;}
    if(target.dataset.close){$<HTMLDialogElement>('#'+target.dataset.close).close();return;}
    if(target.dataset.themeId){applyTheme(target.dataset.themeId,true);$<HTMLDialogElement>('#theme-dialog').close();return;}
    if(target.dataset.stepKey){saveHash();state.stepKey=target.dataset.stepKey;state.proofId='';render();document.querySelector('.step-proof-panel')?.scrollTo(0,0);saveHash(undefined,true);return;}
    if(target.dataset.proofId){state.proofId=target.dataset.proofId;const y=document.querySelector('.actual-step-list')?.scrollTop??0;render();document.querySelector('.actual-step-list')?.scrollTo(0,y);saveHash();return;}
    if(target.dataset.section){event.preventDefault();document.getElementById(target.dataset.section)?.scrollIntoView({block:'start'});return;}
    if(target.dataset.toggleScene){event.preventDefault();const d=target.closest<HTMLDetailsElement>('details.scene');if(d){d.open=!d.open;if(d.open)sceneOpen.add(target.dataset.toggleScene);else sceneOpen.delete(target.dataset.toggleScene);}return;}
    if(target.hasAttribute('data-overview')){navigate({view:'overview',selectedCase:'',goalId:''});return;}
    if(target.dataset.scene){event.preventDefault();openScene(target.dataset.scene);return;}
    if(target.dataset.relatedCase&&target.dataset.relatedGoal){openGoal(target.dataset.relatedCase,target.dataset.relatedGoal,true);return;}
    if(target.dataset.caseId&&target.dataset.goalId){openGoal(target.dataset.caseId,target.dataset.goalId);return;}
    if(target.dataset.stat){state.status=target.dataset.stat as Status;render();saveHash();$('#search').scrollIntoView({block:'center'});return;}
    if(target.dataset.image){openImage(target.dataset.image,target.dataset.evidenceContext??u('当前引用'),target);return;}
    if(target.dataset.evidence)openEvidence(target.dataset.evidence,target.dataset.evidenceContext??u('当前引用'),target);
  });
  async function applyLocation(hashText:string,saved:unknown):Promise<void>{
    applyingLocation=true;window.clearTimeout(searchTimer);
    try{
      // Close in stack order and await close events before reusing a dialog ID.
      // Otherwise a delayed old close could unlock or erase a newly opened modal.
      for(const id of [...modals.keys()].reverse()){
        const dialog=$<HTMLDialogElement>('#'+id);
        if(dialog.open)await new Promise<void>(resolve=>{dialog.addEventListener('close',()=>resolve(),{once:true});dialog.close();});
      }
      state={...initial};linkedNotice='';sceneOpen.clear();goalOpen.clear();readingOpen.clear();let evidenceId:string|undefined;
      const restore=object(saved)&&saved.reader===true&&saved.scope===readerScope&&saved.route===hashText&&typeof saved.entryKey==='string'?saved:undefined;
      if(restore){entryKey=String(restore.entryKey);if(Array.isArray(restore.scenes))for(const id of restore.scenes)if(typeof id==='string'&&report.cases.some(c=>c.id===id))sceneOpen.add(id);if(Array.isArray(restore.goals))for(const id of restore.goals)if(typeof id==='string'&&rows.some(r=>r.c.id+'/'+r.g.id===id))goalOpen.add(id);if(Array.isArray(restore.reading))for(const id of restore.reading)if(typeof id==='string')readingOpen.add(id);}
      try{
        const hash=new URLSearchParams(hashText.replace(/^#/,'')),caseId=hash.get('case'),goalId=hash.get('goal'),requestedEvidence=hash.get('evidence');
        if(caseId&&report.cases.some(c=>c.id===caseId)){
          state.selectedCase=caseId;
          state.view='scene';
          if(goalId&&rows.some(r=>r.c.id===caseId&&r.g.id===goalId)){state.goalId=goalId;if(!restore){sceneOpen.add(caseId);goalOpen.add(caseId+'/'+goalId);}}
          else if(!restore)for(const r of rows.filter(r=>r.c.id===caseId&&r.status==='violation'))goalOpen.add(r.c.id+'/'+r.g.id);
        }else if(hash.get('view')==='evidence')state.view='evidence';
        const status=hash.get('status');if(status==='all'||status&&Object.hasOwn(labels,status))state.status=status as State['status'];
        state.query=hash.get('q')??'';state.stepKey=hash.get('step')??'';state.proofId=hash.get('proof')??'';
        if(requestedEvidence&&evidenceMap.has(requestedEvidence))evidenceId=requestedEvidence;
      }catch{/* Invalid or incomplete references show the safe reading overview. */}
      render();
      if(restore){window.scrollTo({top:typeof restore.pageY==='number'&&Number.isFinite(restore.pageY)?Math.max(0,restore.pageY):0,behavior:'instant'});$('#case-list').scrollTop=typeof restore.listY==='number'&&Number.isFinite(restore.listY)?Math.max(0,restore.listY):0;document.querySelector('.actual-step-list')?.scrollTo(0,typeof restore.stepY==='number'?restore.stepY:0);document.querySelector('.step-proof-panel')?.scrollTo(0,typeof restore.proofY==='number'?restore.proofY:0);}
      else if(state.goalId){document.getElementById('goal-'+state.selectedCase+'-'+state.goalId)?.scrollIntoView({block:'start'});revealCurrentNavigation();}
      if(evidenceId){const evidence=evidenceMap.get(evidenceId);if(evidence)openEvidence(evidence.id,referenceLabel(evidence),$('#library-button'));}
      else if(!new URLSearchParams(hashText.replace(/^#/,'' )).get('conversation'))saveHash();
      conversationReader.restore();
    }finally{applyingLocation=false;}
  }
  let locationQueue=Promise.resolve(),locationTicket=0;
  function queueLocation():void{
    const hashText=location.hash,saved:unknown=history.state,fingerprint=hashText+'|'+(object(saved)&&typeof saved.entryKey==='string'?saved.entryKey:'');if(fingerprint===locationFingerprint)return;locationFingerprint=fingerprint;const ticket=++locationTicket;
    locationQueue=locationQueue.then(()=>ticket===locationTicket?applyLocation(hashText,saved):undefined).catch(error=>{applyingLocation=false;$('#detail').innerHTML=uiHtml`<section class="panel error">无法打开报告链接：${esc(error instanceof Error?error.message:u('未知错误'))}</section>`;});
  }
  window.addEventListener('hashchange',queueLocation);
  window.addEventListener('popstate',queueLocation);
  queueLocation();
})();
