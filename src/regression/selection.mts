/** Scope and dependency projection only; no business execution or verdict selection. */
import type { Baseline, Case, CasesRef, Status } from '../contracts/model.mjs';
import type { RunRef } from './model.mjs';
import { assertClosed, canonical, canonicalHash, fail, safeIdentifier, safePath } from '../core/common.mjs';
import { arrayValue, integer, oneOf, sha256Value, textValue, uniqueStrings } from '../core/validation.mjs';
import { readCasesFile, pointLocation } from '../core/case-versions.mjs';
import { parseCasesRef } from '../core/case-review.mjs';
import { goalRequiredRefs } from '../contracts/targets.mjs';
import { readSourceRun } from './sources.mjs';
export interface ExecutionPlanRef {caseId:string;pointIds:string[];conditionIds:string[];stepIds:string[];includeRequiredPath:boolean}
export interface SelectionRequest {regressionVersion:2;casesFile:string;cases:CasesRef;mode:'points'|'status'|'full';pointIds:string[];sourceRun:RunRef|null;statuses:Status[];includeUnassessedCases:boolean}
export interface ScopeGap {pointId:string|null;sourceInventoryId:string|null;code:string;reason:string}
export interface RegressionSelection {regressionVersion:2;request:SelectionRequest;selectedPointIds:string[];matchedPointIds:string[];notSelectedPointIds:string[];sourceStates:{pointId:string;inSourceScope:boolean;status:Status|null}[];candidatePlans:ExecutionPlanRef[];gaps:ScopeGap[];selectionSha256:string}
export function parseRunRef(value:unknown):RunRef {assertClosed(value,['runDir','runId','baselineSha256','resultsRevision','resultsSha256'],'run reference');return{runDir:textValue(value.runDir,'source run directory'),runId:textValue(value.runId,'source run ID'),baselineSha256:sha256Value(value.baselineSha256),resultsRevision:integer(value.resultsRevision,'source results revision'),resultsSha256:sha256Value(value.resultsSha256)};}
export function parseSelectionRequest(value:unknown):SelectionRequest {
  assertClosed(value,['regressionVersion','casesFile','cases','mode','pointIds','sourceRun','statuses','includeUnassessedCases'],'selection request');if(value.regressionVersion!==2)fail('Selection requires regressionVersion 2.');
  const mode=oneOf(value.mode,['points','status','full'],'selection mode'),pointIds=uniqueStrings(value.pointIds,'selected point IDs',true),sourceRun=value.sourceRun===null?null:parseRunRef(value.sourceRun),statuses=uniqueStrings(value.statuses,'selection statuses').map(s=>oneOf(s,['verified','violation','inconclusive','not_tested'],'status'));
  if(typeof value.includeUnassessedCases!=='boolean')fail('Invalid includeUnassessedCases.');
  if(mode==='points'?!pointIds.length:pointIds.length>0)fail('Only points mode accepts a nonempty point ID list.');
  if(mode==='status'?(!sourceRun||!statuses.length):(statuses.length>0||value.includeUnassessedCases))fail('Status filters and unassessed-case selection require status mode.');
  if(mode!=='status'&&sourceRun!==null)fail('History belongs in the run binding; selection sources are only for status mode.');
  return{regressionVersion:2,casesFile:textValue(value.casesFile,'cases file'),cases:parseCasesRef(value.cases),mode,pointIds,sourceRun,statuses:statuses as Status[],includeUnassessedCases:value.includeUnassessedCases};
}
export function projectExecutionPlan(c:Case,pointIds:readonly string[]):ExecutionPlanRef {
  const goals=c.goals.filter(g=>pointIds.includes(g.pointId));if(!goals.length||goals.some(g=>g.planState!=='prepared'))fail('Execution projection requires prepared points in this case.');
  const refs=new Set(goals.flatMap(g=>goalRequiredRefs(c,g)));
  return{caseId:c.id,pointIds:goals.map(g=>g.pointId),conditionIds:c.criticalConditions.filter(x=>refs.has('condition:'+x.id)).map(x=>x.id),stepIds:c.steps.filter(s=>refs.has('step:'+s.id)).map(s=>s.id),includeRequiredPath:c.requiredPath!==null};
}
function derive(request:SelectionRequest,baseline:Baseline,states:RegressionSelection['sourceStates']):RegressionSelection {
  const all=baseline.cases.flatMap(c=>c.goals.map(g=>g.pointId)),selected=new Set<string>(),matched=new Set<string>(),gaps:ScopeGap[]=[];
  for(const id of request.pointIds)if(!all.includes(id))fail((baseline.retiredPoints.some(r=>r.pointId===id)?'Retired':'Unknown')+' point ID: '+id);
  if(request.mode==='points')for(const id of request.pointIds)selected.add(id);
  if(request.mode==='full')for(const id of all)selected.add(id);
  if(request.mode==='status')for(const c of baseline.cases){const matches=c.goals.filter(g=>{const s=states.find(x=>x.pointId===g.pointId);return s?.status!==null&&s?.status!==undefined&&request.statuses.includes(s.status);});const unassessed=c.goals.filter(g=>states.some(s=>s.pointId===g.pointId&&s.inSourceScope&&s.status===null));if(matches.length||request.includeUnassessedCases&&unassessed.length){for(const g of c.goals)selected.add(g.pointId);for(const g of matches)matched.add(g.pointId);}}
  for(const c of baseline.cases)for(const g of c.goals)if(selected.has(g.pointId)&&g.planState==='unprepared')gaps.push({pointId:g.pointId,sourceInventoryId:null,code:'unprepared',reason:g.preparationGaps.join('; ')});
  for(const entry of baseline.coverage)if(entry.state==='pending'||entry.state==='mapped'&&!entry.pointIds.length)gaps.push({pointId:null,sourceInventoryId:entry.id,code:'coverage_gap',reason:entry.reason});
  if(request.mode==='status')for(const s of states)if(s.status===null)gaps.push({pointId:s.pointId,sourceInventoryId:null,code:'unassessed_or_unmapped',reason:'No selected historical formal assessment is available; no state is inferred.'});
  const selectedPointIds=all.filter(id=>selected.has(id)),candidatePlans=baseline.cases.flatMap(c=>{const ids=c.goals.filter(g=>selected.has(g.pointId)&&g.planState==='prepared').map(g=>g.pointId);return ids.length?[projectExecutionPlan(c,ids)]:[];});
  const body={regressionVersion:2 as const,request,selectedPointIds,matchedPointIds:all.filter(id=>matched.has(id)),notSelectedPointIds:all.filter(id=>!selected.has(id)),sourceStates:states,candidatePlans,gaps};return{...body,selectionSha256:canonicalHash(body)};
}
export async function selectRegression({request:input}:{request:unknown;projectDir?:unknown}):Promise<RegressionSelection> {
  const request=parseSelectionRequest(input),saved=await readCasesFile(request.casesFile);if(canonical(saved.ref)!==canonical(request.cases))fail('Selection cases identity/version/hash mismatch.');
  let states:RegressionSelection['sourceStates']=[];
  if(request.sourceRun){const ref=request.sourceRun,source=await readSourceRun(ref.runDir,{resultsRevision:ref.resultsRevision});if(source.manifest.runId!==ref.runId||source.baselineSha256!==ref.baselineSha256||source.resultsSha256!==ref.resultsSha256||source.baseline.projectId!==saved.baseline.projectId)fail('Selection source run identity, project or fingerprint mismatch.');states=saved.baseline.cases.flatMap(c=>c.goals.map(g=>{const old=source.checked.cases.flatMap(c=>c.goals.map(goal=>({c,goal}))).find(x=>x.goal.pointId===g.pointId);return{pointId:g.pointId,inSourceScope:Boolean(old),status:old?.c.assessments.find(a=>a.goalId===old.goal.id)?.status??null};}));}
  return derive({...request,casesFile:await safePath(request.casesFile,{existing:true})},saved.baseline,states);
}
export function parseSelection(value:unknown,baseline:Baseline):RegressionSelection {
  assertClosed(value,['regressionVersion','request','selectedPointIds','matchedPointIds','notSelectedPointIds','sourceStates','candidatePlans','gaps','selectionSha256'],'selection snapshot');
  const request=parseSelectionRequest(value.request);if(value.regressionVersion!==2||request.cases.projectId!==baseline.projectId||request.cases.caseVersion!==baseline.caseVersion)fail('Selection snapshot project/version mismatch.');
  const states=arrayValue(value.sourceStates,'source states').map(v=>{assertClosed(v,['pointId','inSourceScope','status'],'source state');if(typeof v.inSourceScope!=='boolean'||!v.inSourceScope&&v.status!==null)fail('Invalid historical source scope.');return{pointId:safeIdentifier(v.pointId),inSourceScope:v.inSourceScope,status:v.status===null?null:oneOf(v.status,['verified','violation','inconclusive','not_tested'],'source status')};});
  if(request.mode==='status'&&canonical(states.map(s=>s.pointId))!==canonical(baseline.cases.flatMap(c=>c.goals.map(g=>g.pointId))))fail('Historical source states must cover the defined scope exactly.');if(request.mode!=='status'&&states.length)fail('Non-status selection cannot include source states.');
  const expected=derive(request,baseline,states);if(canonical(expected)!==canonical(value))fail('Frozen selection set or fingerprint mismatch.');return expected;
}
