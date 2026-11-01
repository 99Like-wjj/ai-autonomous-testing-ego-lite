/** Read-only history projection. Original evidence identities never enter the current catalog. */
import path from 'node:path';
import type { Report, ReportHistory, HistoryRunRef, Baseline } from '../contracts/model.mjs';
import type { RegressionBinding } from '../regression/binding.mjs';
import { assertClosed, canonical, canonicalHash, errorInfo, fail, readJSON, safeIdentifier } from '../core/common.mjs';
import {arrayValue,textValue} from '../core/validation.mjs';
import { normalizeCases } from '../core/baseline.mjs';
import { verifyRunRef } from '../regression/sources.mjs';
import { pointDetails } from '../regression/compare.mjs';
import { goalDefinitionHash, pointLocation } from '../core/case-versions.mjs';
const refIdentity = (r:HistoryRunRef) => ({runId:r.runId,baselineSha256:r.baselineSha256,resultsRevision:r.resultsRevision,resultsSha256:r.resultsSha256});
export const historyKey = (r:HistoryRunRef,id:string) => 'history:' + canonicalHash(refIdentity(r)) + ':' + id;
const refKey = (r:HistoryRunRef) => canonical(refIdentity(r));
export function parseHistoryLocations(value:unknown):ReadonlyMap<string,string> {
  assertClosed(value,['schemaVersion','locations'],'history locations');if(value.schemaVersion!==9)fail('History location mappings require schemaVersion 9.');
  const result=new Map<string,string>();for(const raw of arrayValue(value.locations,'history locations')){assertClosed(raw,['runId','runDir'],'history location');const id=safeIdentifier(raw.runId),dir=textValue(raw.runDir,'explicit historical directory');if(!path.isAbsolute(dir)||result.has(id))fail('History locations need unique run IDs and absolute directories.');result.set(id,path.resolve(dir));}return result;
}
export function historyRoots(report:Report):HistoryRunRef[] {
  const binding=report.regressionBinding as RegressionBinding|undefined;
  const refs=[...(binding?.history.parents??[]),...report.cases.flatMap(c=>c.assessments.flatMap(a=>(a.problemChecks??[]).map(p=>p.source.run)))];
  return [...new Map(refs.map(r=>[refKey(r),r])).values()];
}
export function validateHistory(history:ReportHistory,report:Report):ReportHistory {
  const {contentSha256,...body}=history;
  if(history.historyVersion!==1||canonicalHash(body)!==contentSha256)fail('Historical report projection fingerprint mismatch.');
  if(canonical(history.roots)!==canonical(historyRoots(report))||canonical(history.primaryBaseline)!==canonical((report.regressionBinding as RegressionBinding).history.primaryBaseline))fail('Report history does not match the frozen run references.');
  if(history.complete!==(history.gaps.length===0))fail('Historical completeness does not match its recorded gaps.');
  const keys=new Set<string>();for(const e of history.evidence){if(e.key!==historyKey(e.sourceRun,e.item.id)||keys.has(e.key)||!path.isAbsolute(e.resolvedRunDir))fail('Historical evidence identity mismatch.');keys.add(e.key);}
  const selected=new Set(report.cases.flatMap(c=>c.goals.map(g=>g.pointId))),refs=new Map(history.nodes.map(n=>[refKey(n.ref),n]));
  if(refs.size!==history.nodes.length)fail('Duplicate historical snapshot.');
  const reachable=new Set<string>(),usedEvidence=new Set<string>();
  function visit(ref:HistoryRunRef,stack:Set<string>) {
    const key=refKey(ref);if(stack.has(ref.runId)){if(!history.gaps.some(g=>refKey(g.run)===key))fail('Unexplained historical cycle.');return;}
    if(reachable.has(key))return;reachable.add(key);const node=refs.get(key);
    if(!node){if(!history.gaps.some(g=>refKey(g.run)===key))fail('Missing history node without a recorded gap.');return;}
    if(!path.isAbsolute(node.resolvedRunDir))fail('Historical source location is not absolute.');
    const next=new Set(stack).add(ref.runId);for(const parent of node.parents)visit(parent,next);
    for(const p of node.points){
      if(!p.forPointIds.length||p.forPointIds.some(id=>!selected.has(id))||!p.selected&&p.status!==null||p.evidenceKeys.some(k=>!keys.has(k)))fail('Invalid historical point projection.');
      const definitionHash=p.definition.planState==='prepared'?canonicalHash({goal:p.definition,conditions:p.plan.conditions,requiredPath:p.plan.path,stepOrder:p.plan.order,steps:p.plan.steps,parameters:p.plan.parameters,sources:p.sourceDefinitions.map(({file:_file,...source})=>source)}):null;
      if(p.definition.pointId!==p.pointId||p.definition.id!==p.goalId||p.expected!==p.definition.expected||definitionHash!==p.definitionSha256||p.assessment&&(p.assessment.goalId!==p.goalId||p.assessment.status!==p.status||p.assessment.revision>ref.resultsRevision))fail('Historical definition or assessment capsule is inconsistent.');
      for(const k of p.evidenceKeys){const e=history.evidence.find(e=>e.key===k)!;if(refKey(e.sourceRun)!==key||e.resolvedRunDir!==node.resolvedRunDir)fail('Historical point borrowed evidence from another source snapshot.');usedEvidence.add(k);}
    }
  }
  for(const r of history.roots)visit(r,new Set([report.runId]));
  if([...refs.keys()].some(k=>!reachable.has(k))||history.evidence.some(e=>!refs.has(refKey(e.sourceRun))||!usedEvidence.has(e.key)))fail('Unreferenced history was inserted into the report.');
  return history;
}
export async function collectHistory(root:string,report:Report,locations:ReadonlyMap<string,string>=new Map()):Promise<ReportHistory|undefined> {
  const roots=historyRoots(report);if(!roots.length)return undefined;
  const baseline:Baseline=normalizeCases(await readJSON(path.join(root,'baseline.json')));
  const currentIds=report.cases.flatMap(c=>c.goals.map(g=>g.pointId));
  const associations=new Map<string,Set<string>>(currentIds.map(id=>[id,new Set([id])]));
  let changed=true;while(changed){changed=false;for(const r of baseline.retiredPoints){const mapped=r.replacements.flatMap(id=>[...(associations.get(id)??[])]);if(!mapped.length)continue;const set=associations.get(r.pointId)??new Set<string>();for(const id of mapped)if(!set.has(id)){set.add(id);changed=true;}associations.set(r.pointId,set);}}
  const nodes:ReportHistory['nodes']=[], evidence=new Map<string,ReportHistory['evidence'][number]>(),gaps:ReportHistory['gaps']=[],visited=new Set<string>();
  async function visit(ref:HistoryRunRef,stack:Set<string>):Promise<void> {
    const resolvedRunDir=locations.get(ref.runId)??path.resolve(ref.runDir);
    const key=refKey(ref);if(stack.has(ref.runId)||resolvedRunDir===root){gaps.push({run:ref,reason:'Historical cycle or self-reference; no recursive read was performed.'});return;}
    if(visited.has(key))return;visited.add(key);
    try {
      const source=await verifyRunRef({...ref,runDir:resolvedRunDir});if(source.baseline.projectId!==baseline.projectId)fail('Historical source belongs to a different project.');
      const binding=source.checked.regressionBinding as RegressionBinding,points:ReportHistory['nodes'][number]['points']=[];
      for(const [pointId,forPoints] of associations){const detail=pointDetails(source,pointId),location=pointLocation(source.baseline,pointId);if(!detail||!location)continue;
        const evidenceKeys=detail.evidence.map(e=>{const item=source.checked.evidenceCatalog.items.find(item=>item.id===e.id)!;const k=historyKey(ref,item.id);evidence.set(k,{key:k,sourceRun:ref,resolvedRunDir,item});return k;});
        points.push({pointId,forPointIds:[...forPoints],caseId:detail.caseId,goalId:detail.goalId,title:detail.title,expected:detail.expected,definition:detail.definition,plan:detail.plan,sourceDefinitions:source.baseline.sources.filter(s=>detail.basis.sourceRefIds.includes(s.id)),declaredConditions:{...binding.currentConditions,items:binding.currentConditions.items.filter(i=>i.caseIds.includes(detail.caseId))},parameterBindings:binding.parameterBindings.filter(p=>p.caseId===detail.caseId),selected:detail.selected,status:detail.status,rationale:detail.rationale,gaps:detail.gaps,definitionSha256:goalDefinitionHash(source.baseline,location.case,location.goal),assessment:detail.assessment,observations:detail.observations,contexts:detail.contexts,actions:detail.actions,findings:detail.findings,evidenceKeys});
      }
      nodes.push({ref,resolvedRunDir,caseVersion:source.baseline.caseVersion,parents:binding.history.parents,points});
      const next=new Set(stack).add(ref.runId);for(const parent of binding.history.parents)await visit(parent,next);
    } catch(error){gaps.push({run:ref,reason:errorInfo(error).message});}
  }
  for(const r of roots)await visit(r,new Set([report.runId]));
  const body={historyVersion:1 as const,roots,primaryBaseline:(report.regressionBinding as RegressionBinding).history.primaryBaseline,nodes,evidence:[...evidence.values()],gaps,complete:gaps.length===0,caveat:'Historical observations retain their source run and exact result revision. They are not current evidence or current authorization. Status changes alone do not establish a code repair; missing or changed sources remain explicit gaps.'};
  return validateHistory({...body,contentSha256:canonicalHash(body)},report);
}
