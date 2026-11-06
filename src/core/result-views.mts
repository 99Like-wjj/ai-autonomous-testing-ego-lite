/** Bounded result projections. No routing, verdict inference or business execution. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertClosed, canonicalHash, fail, hash, inside, json, readJSON, safeIdentifier, safePath, withRunLock, writeNew } from './common.mjs';
import { checkUnlocked, countsFor, recoverEvidence } from './records.mjs';
import { projectActionAttempts,recordEvidenceIds } from './action-events.mjs';
import { goalRequiredRefs } from '../contracts/targets.mjs';
import { parseResults, parseManifest } from './validation.mjs';
import { readSourceRun, sourceContext } from '../regression/sources.mjs';
import type { Report } from '../contracts/model.mjs';
export interface ContextOptions {view?:string|undefined;caseId?:string|undefined;pointId?:string|undefined;offset?:number|undefined;limit?:number|undefined;maxBytes?:number|undefined;expectedResultsRevision?:number|undefined;outputFile?:string|undefined}
function number(value:unknown,fallback:number,min:number,max:number){if(value===undefined)return fallback;if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)fail('INVALID_CONTEXT_LIMIT');return value;}
export function contextOptions(input:ContextOptions,history=false){
  const raw:unknown=input;assertClosed(raw,['view','caseId','pointId','offset','limit','maxBytes','expectedResultsRevision','outputFile'],'context options');
  const view=input.view??'summary';if(!(history?['summary','goals','point','full']:['summary','goals','point']).includes(view))fail('INVALID_CONTEXT_VIEW');
  if((view==='point')!==(input.pointId!==undefined)||input.caseId!==undefined&&view!=='goals')fail('INVALID_CONTEXT_FILTER');
  if(input.pointId!==undefined)safeIdentifier(input.pointId);if(input.caseId!==undefined)safeIdentifier(input.caseId);
  if(view!=='goals'&&view!=='summary'&&(input.offset!==undefined||input.limit!==undefined))fail('INVALID_CONTEXT_PAGINATION');
  if(view==='full'&&!input.outputFile)fail('FULL_CONTEXT_REQUIRES_OUTPUT_FILE');
  return{...input,view,offset:number(input.offset,0,0,Number.MAX_SAFE_INTEGER),limit:number(input.limit,20,1,100),maxBytes:number(input.maxBytes,24000,2048,200000),expectedResultsRevision:input.expectedResultsRevision===undefined?undefined:number(input.expectedResultsRevision,0,0,Number.MAX_SAFE_INTEGER)};
}
const preview=(text:string)=>({text:[...text].slice(0,256).join(''),truncated:[...text].length>256});
export function projectContext(report:Report,identity:{baselineSha256:string;resultsSha256:string;kind:'current'|'historical';evidenceScope:string},input:ContextOptions){
  const options=contextOptions(input,identity.kind==='historical');
  if(options.view==='full')fail('Full context is exported by the historical reader.');
  if(options.expectedResultsRevision!==undefined&&options.expectedResultsRevision!==report.revision)fail('SNAPSHOT_CHANGED');
  if(options.caseId&&!report.cases.some(c=>c.id===options.caseId))fail('CASE_NOT_SELECTED');
  const candidates=report.cases.filter(c=>!options.caseId||c.id===options.caseId).flatMap(c=>c.goals.map(g=>({c,g})));
  const selected=options.pointId?candidates.find(x=>x.g.pointId===options.pointId):undefined;
  if(options.pointId&&!selected)fail('POINT_NOT_SELECTED_OR_NOT_FOUND');
  const attempts=report.cases.flatMap(c=>projectActionAttempts(c.actionEvents).filter(a=>a.unresolved).map(a=>({caseId:c.id,actionId:a.actionId,eventIds:a.eventIds,reasons:a.reasons.map(preview)})));
  const result={
    contextReadVersion:1 as const,
    scope:{...identity,runId:report.runId,resultsRevision:report.revision,evidenceRevision:report.evidenceRevision,view:options.view,caseId:options.caseId??null,pointId:options.pointId??null},
    integrity:{results:'checked',evidence:'hash_verified',evidenceScope:identity.evidenceScope,execution:identity.kind==='current'?'checked':'not_checked_as_current'},
    counts:report.counts,filteredCounts:countsFor(report.cases.filter(c=>!options.caseId||c.id===options.caseId)),
    items:[] as {pointId:string;caseId:string;goalId:string;title:ReturnType<typeof preview>;assessed:boolean;status:string|null;observationIds:string[];gapCount:number}[],
    point:null as null|unknown,
    unresolved:[] as typeof attempts,
    pagination:{offset:options.offset,limit:options.limit,total:options.view==='goals'?candidates.length:0,returned:0,nextOffset:null as number|null,truncated:false},
    unresolvedPagination:{offset:options.offset,limit:options.limit,total:attempts.length,returned:0,nextOffset:null as number|null,truncated:false},
    omissions:[] as string[],
    limitations:['Recorded assessments and source hashes do not authenticate business facts. Unassessed is a recording gap, not a business status. Historical facts are not current authorization. Expand omitted unresolved actions before dependent writes.'],
    readEffects:identity.kind==='current'?'Existing local pending-evidence recovery may occur before projection; no business action.':'Historical source is not repaired.'
  };
  if(selected){
    const {c,g}=selected,refs=new Set(goalRequiredRefs(c,g)),assessment=c.assessments.find(a=>a.goalId===g.id)??null;
    result.filteredCounts=countsFor([{...c,goals:[g],assessments:assessment?[assessment]:[],missingGoalIds:assessment?[]:[g.id]}]);
    const findings=c.findings.filter(f=>f.goalIds.includes(g.id));
    const observations=c.observations.filter(o=>assessment?.observationIds.includes(o.id)||findings.some(f=>f.observationIds.includes(o.id)));
    const eventIds=new Set(observations.flatMap(o=>o.actionEventIds??[]));
    const actionIds=new Set(c.actionEvents.filter(e=>eventIds.has(e.id)).map(e=>e.actionId));
    const actions=c.actionEvents.filter(e=>actionIds.has(e.actionId));
    const contextIds=new Set([...observations.map(o=>o.contextId),...actions.map(a=>a.contextId)]);
    const contexts=c.contexts.filter(v=>contextIds.has(v.id));
    const evidenceIds=new Set(recordEvidenceIds({observations,assessments:assessment?[assessment]:[],contexts,actionEvents:actions,findings}));
    const queue=[...evidenceIds];for(let i=0;i<queue.length;i++)for(const id of report.evidenceCatalog.items.find(e=>e.id===queue[i])?.metadata?.contextEvidenceIds??[])if(!evidenceIds.has(id)){evidenceIds.add(id);queue.push(id);}
    result.point={definition:g,requiredRefs:[...refs],plan:{conditions:c.criticalConditions.filter(x=>refs.has('condition:'+x.id)),steps:c.steps.filter(s=>refs.has('step:'+s.id)),order:c.stepOrder,path:c.requiredPath,parameters:c.parameters},assessment,observations,actions,contexts,findings,evidence:report.evidenceCatalog.items.filter(e=>evidenceIds.has(e.id))};
    if(!input.outputFile&&Buffer.byteLength(json(result))>options.maxBytes)fail('POINT_EXCEEDS_OUTPUT_BUDGET: export this point with --output-file.');
  }
  const fits=()=>Boolean(input.outputFile)||Buffer.byteLength(json(result))<=options.maxBytes;
  // Explicitly paginate unknown actions as well as goals. Never silently drop the run-wide total.
  for(const a of attempts.slice(options.offset,options.offset+options.limit)){result.unresolved.push(a);if(!fits()){result.unresolved.pop();break;}}
  if(options.view==='goals')for(const {c,g} of candidates.slice(options.offset,options.offset+options.limit)){
    const a=c.assessments.find(a=>a.goalId===g.id);
    result.items.push({pointId:g.pointId,caseId:c.id,goalId:g.id,title:preview(g.title),assessed:Boolean(a),status:a?.status??null,observationIds:a?.observationIds??[],gapCount:a?.gaps.length??0});
    if(!fits()){result.items.pop();break;}
  }
  const finish=(page:typeof result.pagination,returned:number)=>{page.returned=returned;page.truncated=page.offset+returned<page.total;page.nextOffset=page.truncated?page.offset+returned:null;};
  finish(result.pagination,result.items.length);finish(result.unresolvedPagination,result.unresolved.length);
  if(result.pagination.truncated)result.omissions.push('More goal indices remain; use nextOffset or export.');
  if(result.unresolvedPagination.truncated)result.omissions.push('More unresolved actions remain; use unresolvedPagination.nextOffset or export.');
  // Pagination metadata itself consumes bytes. Trim again, never return a no-progress cursor.
  while(!fits()&&result.items.length){result.items.pop();finish(result.pagination,result.items.length);}
  while(!fits()&&result.unresolved.length){result.unresolved.pop();finish(result.unresolvedPagination,result.unresolved.length);}
  if(result.pagination.truncated&&!result.omissions.some(s=>s.startsWith('More goal')))result.omissions.push('More goal indices remain; use nextOffset or export.');
  if(result.unresolvedPagination.truncated&&!result.omissions.some(s=>s.startsWith('More unresolved')))result.omissions.push('More unresolved actions remain; use unresolvedPagination.nextOffset or export.');
  if(!fits()||result.pagination.truncated&&result.pagination.returned===0||result.unresolvedPagination.truncated&&result.unresolvedPagination.returned===0)fail('CONTEXT_OUTPUT_BUDGET_TOO_SMALL: increase --max-bytes or export.');
  return result;
}
export async function retainContext(runDir:string,result:unknown,outputFile?:string){
  if(!outputFile)return result;
  const file=await safePath(outputFile,{external:true});if(inside(path.resolve(runDir),file))fail('Context exports must be outside the source run.');
  const data=json(result);await writeNew(file,data);
  const scope=typeof result==='object'&&result!==null&&'scope'in result?result.scope:null;
  return{contextReadVersion:1,outputFile:file,sha256:hash(data),bytes:Buffer.byteLength(data),scope,businessExecuted:false};
}
export async function readCurrentContext(runDir:unknown,input:ContextOptions={}){
  contextOptions(input);
  return withRunLock(runDir,async root=>{
    await recoverEvidence(root);const checked=await checkUnlocked(root);
    const manifest=parseManifest(await readJSON(path.join(root,'manifest.json'))),results=parseResults(await readJSON(path.join(root,'results.json')));
    if(input.pointId&&!checked.cases.some(c=>c.goals.some(g=>g.pointId===input.pointId))){
      const baseline=JSON.parse(await fs.readFile(path.join(root,'baseline.json'),'utf8')) as {cases:{goals:{pointId:string}[]}[]};
      fail(baseline.cases.some(c=>c.goals.some(g=>g.pointId===input.pointId))?'POINT_NOT_SELECTED':'POINT_NOT_FOUND');
    }
    const result=projectContext(checked,{kind:'current',baselineSha256:manifest.baselineSha256,resultsSha256:canonicalHash(results),evidenceScope:'complete_current_catalog'},input);
    return retainContext(root,result,input.outputFile);
  });
}
export async function readHistoricalContext(runDir:unknown,input:ContextOptions={},revision?:number){
  const options=contextOptions(input,true),source=await readSourceRun(runDir,revision===undefined?{}:{resultsRevision:revision});
  if(options.expectedResultsRevision!==undefined&&source.results.revision!==options.expectedResultsRevision)fail('SNAPSHOT_CHANGED');
  if(input.pointId&&!source.checked.cases.some(c=>c.goals.some(g=>g.pointId===input.pointId)))fail(source.baseline.cases.some(c=>c.goals.some(g=>g.pointId===input.pointId))?'POINT_NOT_SELECTED':'POINT_NOT_FOUND');
  const identity={kind:'historical' as const,baselineSha256:source.baselineSha256,resultsSha256:source.resultsSha256,evidenceScope:source.evidenceScope.kind};
  const result=options.view==='full'?{contextReadVersion:1,scope:{...identity,runId:source.manifest.runId,resultsRevision:source.results.revision,evidenceRevision:source.checked.evidenceRevision,view:'full'},...sourceContext(source)}:projectContext(source.checked,identity,input);
  return retainContext(source.runDir,result,input.outputFile);
}
