/** Current-format case definitions. No legacy reader and no business-route inference. */
import fs from 'node:fs/promises';
import { parseAiContext } from './ai-context.mjs';
import path from 'node:path';
import type { Baseline, Case, Goal, Manifest } from '../contracts/model.mjs';
import { assertClosed, fail, hash, object, safeIdentifier } from './common.mjs';
import { arrayValue, integer, oneOf, parseBasis, parseSourceRef, sha256Value, strings, textValue, timeValue, uniqueStrings } from './validation.mjs';
import { regularFilePath } from './file-integrity.mjs';
import { requiredRefs, goalRequiredRefs } from '../contracts/targets.mjs';

export function newSafeCases(baseline: Baseline) { for (const c of baseline.cases) { safeIdentifier(c.id); for (const s of c.steps) safeIdentifier(s.id); for (const g of c.goals) { safeIdentifier(g.id); safeIdentifier(g.pointId); } } }
export function normalizeCase(input: unknown): Case {
  assertClosed(input, ['id','title','criticalConditions','requiredPath','stepOrder','steps','parameters','goals'], 'case');
  const id=safeIdentifier(input.id,'case ID'),title=textValue(input.title,'case title');
  const conditions=arrayValue(input.criticalConditions,'critical conditions').map(v=>{assertClosed(v,['id','text'],'condition');return {id:safeIdentifier(v.id,'condition ID'),text:textValue(v.text,'condition text')};});
  if(new Set(conditions.map(c=>c.id)).size!==conditions.length)fail('Duplicate condition ID: '+id);
  const steps=arrayValue(input.steps,'steps').map(v=>{assertClosed(v,['id','action','dependsOn'],'step');return {id:safeIdentifier(v.id,'step ID'),action:textValue(v.action,'step action'),dependsOn:uniqueStrings(v.dependsOn,'step dependencies',true)};});
  if(new Set(steps.map(s=>s.id)).size!==steps.length)fail('Duplicate step ID: '+id);
  const order=oneOf(input.stepOrder,['strict','adaptive'],'step order');
  const visited=new Set<string>(),active=new Set<string>();
  const visit=(stepId:string)=>{if(active.has(stepId))fail('Cyclic step dependency: '+stepId);if(visited.has(stepId))return;const step=steps.find(s=>s.id===stepId);if(!step)fail('Unknown step dependency: '+stepId);active.add(stepId);for(const dep of step.dependsOn){if(order==='strict'&&steps.findIndex(s=>s.id===dep)>=steps.indexOf(step))fail('Strict step depends on a later step: '+stepId);visit(dep);}active.delete(stepId);visited.add(stepId);};
  for(const s of steps)visit(s.id);
  const parameters=arrayValue(input.parameters,'parameters').map(v=>{assertClosed(v,['id','type','purpose','constraints'],'parameter');return{id:safeIdentifier(v.id,'parameter ID'),type:oneOf(v.type,['string','integer','decimal','date','object_ref','account_ref'],'parameter type'),purpose:textValue(v.purpose,'parameter purpose'),constraints:strings(v.constraints,'parameter constraints')};});
  if(new Set(parameters.map(p=>p.id)).size!==parameters.length)fail('Duplicate parameter ID.');
  const plan={id,title,criticalConditions:conditions,requiredPath:input.requiredPath===null?null:textValue(input.requiredPath,'required path'),stepOrder:order,steps,parameters};
  const refs=requiredRefs(plan),ids=new Set<string>();
  const goals:Goal[]=arrayValue(input.goals,'goals').map(v=>{
    assertClosed(v,['id','pointId','title','basis','expected','requiredRefs','clarificationQuestions','followUpOf','planState','preparationGaps','sourceAlias'],'goal');
    const goalId=safeIdentifier(v.id,'goal ID');if(ids.has(goalId))fail('Duplicate goal ID: '+goalId);ids.add(goalId);
    const required=uniqueStrings(v.requiredRefs,'goal plan references');for(const ref of required)if(!refs.includes(ref))fail('Unknown plan reference: '+ref);
    const state=oneOf(v.planState,['prepared','unprepared'],'goal plan state'),gaps=strings(v.preparationGaps,'preparation gaps');
    if(state==='prepared'&&(!required.length||!steps.length||gaps.length))fail('Prepared goals require a complete plan, references, and no definition gaps.');
    if(state==='prepared'&&plan.requiredPath!==null&&!required.includes('requiredPath'))fail('Prepared goal omits the required path.');
    if(state==='unprepared'&&!gaps.length)fail('Unprepared goal must explain its definition gaps.');
    let followUpOf:Goal['followUpOf'];if(v.followUpOf!==undefined){assertClosed(v.followUpOf,['runId','caseId','goalId','reason'],'follow-up source');followUpOf={runId:textValue(v.followUpOf.runId,'source run'),caseId:safeIdentifier(v.followUpOf.caseId),goalId:safeIdentifier(v.followUpOf.goalId),reason:textValue(v.followUpOf.reason,'follow-up reason')};}
    return{id:goalId,pointId:safeIdentifier(v.pointId,'point ID'),title:textValue(v.title,'goal title'),basis:parseBasis(v.basis),expected:textValue(v.expected,'expected'),requiredRefs:required,clarificationQuestions:strings(v.clarificationQuestions,'clarification questions'),planState:state,preparationGaps:gaps,sourceAlias:v.sourceAlias===null?null:textValue(v.sourceAlias,'source alias'),...(followUpOf?{followUpOf}:{})};
  });
  if(!goals.length)fail('A case requires goals: '+id);
  const result:Case={...plan,goals};const used=new Set(goals.flatMap(g=>goalRequiredRefs(result,g)));
  if(goals.every(g=>g.planState==='prepared')&&refs.some(r=>!used.has(r)))fail('Necessary plan reference is not linked to any goal: '+refs.filter(r=>!used.has(r)).join(', '));
  return result;
}
export function normalizeCases(input: unknown): Baseline {
  const keys=['schemaVersion','projectId','project','pointPrefix','caseVersion','previous','nextPointNumber','retiredPoints','sources','coverage','cases','changes','writeRequestSha256','savedAt','aiContext'];
  assertClosed(input,keys,'cases file');if(input.schemaVersion!==9)fail('Cases require schemaVersion 9; older files are not migrated.');for(const key of keys.filter(k=>k!=='aiContext'))if(!Object.hasOwn(input,key))fail('Missing cases file field: '+key);
  const projectId=safeIdentifier(input.projectId,'project ID'),project=textValue(input.project,'project'),prefix=textValue(input.pointPrefix,'point prefix');if(!/^[A-Z][A-Z0-9-]{0,39}$/.test(prefix))fail('Invalid point prefix.');
  const version=integer(input.caseVersion,'case version',1);let previous:Baseline['previous']=null;
  if(input.previous!==null){assertClosed(input.previous,['caseVersion','sha256'],'previous cases');previous={caseVersion:integer(input.previous.caseVersion,'previous case version',1),sha256:sha256Value(input.previous.sha256)};}
  if(version===1?previous!==null:previous?.caseVersion!==version-1)fail('Case version chain is not consecutive.');
  const cases=arrayValue(input.cases,'cases').map(normalizeCase);if(new Set(cases.map(c=>c.id)).size!==cases.length)fail('Duplicate case ID.');
  const pointIds=cases.flatMap(c=>c.goals.map(g=>g.pointId));if(new Set(pointIds).size!==pointIds.length)fail('Duplicate point ID.');
  const retired=arrayValue(input.retiredPoints,'retired points').map(v=>{assertClosed(v,['pointId','reason','replacements'],'retired point');return{pointId:safeIdentifier(v.pointId),reason:textValue(v.reason,'retirement reason'),replacements:uniqueStrings(v.replacements,'replacement point IDs',true)};});
  if(new Set(retired.map(r=>r.pointId)).size!==retired.length||retired.some(r=>pointIds.includes(r.pointId)))fail('Retired point is duplicated or active.');
  const allPoints=new Set([...pointIds,...retired.map(r=>r.pointId)]);let maximum=0;for(const point of allPoints){const suffix=point.slice(prefix.length+4);if(!point.startsWith(prefix+'-TP-')||!/^\d{6,}$/.test(suffix)||!Number.isSafeInteger(Number(suffix))||Number(suffix)<1)fail('Point ID does not belong to this namespace: '+point);maximum=Math.max(maximum,Number(suffix));}
  const next=integer(input.nextPointNumber,'next point number',1);if(next<=maximum)fail('Point counter would reuse an assigned number.');
  for(const r of retired)for(const p of r.replacements)if(p===r.pointId||!allPoints.has(p))fail('Invalid replacement point reference.');
  const retirementMap=new Map(retired.map(r=>[r.pointId,r.replacements])),seenRetirements=new Set<string>();
  const visitRetirement=(id:string,stack:Set<string>):void=>{if(stack.has(id))fail('Cyclic point retirement/replacement relation.');if(seenRetirements.has(id))return;const nextStack=new Set(stack).add(id);for(const target of retirementMap.get(id)??[])visitRetirement(target,nextStack);seenRetirements.add(id);};
  for(const id of retirementMap.keys())visitRetirement(id,new Set());
  const sources=arrayValue(input.sources,'case sources').map(parseSourceRef);if(new Set(sources.map(s=>s.id)).size!==sources.length)fail('Duplicate source ID.');const sourceIds=new Set(sources.map(s=>s.id));
  for(const c of cases)for(const g of c.goals){for(const ref of g.basis.sourceRefIds)if(!sourceIds.has(ref))fail('Unknown goal source reference: '+ref);if(g.followUpOf?.runId==='self'){if(g.followUpOf.caseId===c.id&&g.followUpOf.goalId===g.id)fail('A follow-up goal cannot reference itself.');if(!cases.some(x=>x.id===g.followUpOf?.caseId&&x.goals.some(y=>y.id===g.followUpOf?.goalId)))fail('Unknown same-run follow-up goal.');}}
  const coverage=arrayValue(input.coverage,'coverage').map(v=>{assertClosed(v,['id','sourceRefId','statement','state','pointIds','reason'],'coverage entry');const refs=uniqueStrings(v.pointIds,'coverage points',true),sourceRefId=safeIdentifier(v.sourceRefId);if(!sourceIds.has(sourceRefId)||refs.some(p=>!allPoints.has(p)))fail('Unknown coverage source or point.');return{id:safeIdentifier(v.id),sourceRefId,statement:textValue(v.statement,'source statement'),state:oneOf(v.state,['mapped','pending','out_of_scope','retired'],'coverage state'),pointIds:refs,reason:textValue(v.reason,'coverage reason')};});
  if(new Set(coverage.map(c=>c.id)).size!==coverage.length)fail('Duplicate coverage ID.');
  const changes=arrayValue(input.changes,'changes').map(v=>{assertClosed(v,['pointId','kind','relatedPointIds','reason'],'point change');const pointId=safeIdentifier(v.pointId),related=uniqueStrings(v.relatedPointIds,'related points',true);if(!allPoints.has(pointId)||related.some(p=>!allPoints.has(p)))fail('Unknown point change reference.');return{pointId,kind:oneOf(v.kind,['added','modified','moved','split','merged','retired'],'point change kind'),relatedPointIds:related,reason:textValue(v.reason,'point change reason')};});
  return{...(input.aiContext===undefined?{}:{aiContext:parseAiContext(input.aiContext)}),schemaVersion:9,projectId,project,pointPrefix:prefix,caseVersion:version,previous,nextPointNumber:next,retiredPoints:retired,sources,coverage,cases,changes,writeRequestSha256:sha256Value(input.writeRequestSha256),savedAt:timeValue(input.savedAt,'cases savedAt')};
}
export async function readAndValidateBaseline(root: string, manifest: Manifest) {
  const bytes=await fs.readFile(await regularFilePath(path.join(root,'baseline.json')));if(hash(bytes)!==manifest.baselineSha256)fail('Baseline hash mismatch. This is integrity checking, not authentication.');return{baseline:normalizeCases(JSON.parse(bytes.toString('utf8'))),bytes};
}
