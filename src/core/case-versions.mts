/** Whole-file case versions. No asset registry, per-point files, or mutable latest index. */
import fs from 'node:fs/promises';
import { verifyAiContext } from './ai-context.mjs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Baseline, Case, Goal, CasesRef, SourceRef } from '../contracts/model.mjs';
import { acquireLock, assertClosed, canonical, canonicalHash, fail, hash, json, now, object, readJSON, removeOwnedFileIfPresent, safeIdentifier, safePath, syncDirectory, writeNew } from './common.mjs';
import { normalizeCases, normalizeCase } from './baseline.mjs';
import { arrayValue, integer, sha256Value, strings, textValue } from './validation.mjs';
import { regularFilePath, hashFile } from './file-integrity.mjs';
import { goalRequiredRefs } from '../contracts/targets.mjs';

export const caseFilename=(version:number)=>'v'+String(version).padStart(3,'0')+'.json';
export async function readCasesFile(filename:unknown):Promise<{file:string;baseline:Baseline;bytes:Buffer;ref:CasesRef}> {
  const file=await regularFilePath(await safePath(filename,{existing:true})),bytes=await fs.readFile(file);
  const baseline=normalizeCases(JSON.parse(bytes.toString('utf8')));
  return{file,baseline,bytes,ref:{projectId:baseline.projectId,caseVersion:baseline.caseVersion,sha256:hash(bytes)}};
}
export async function verifySources(sources:readonly SourceRef[]) { for(const source of sources)if(source.file!==null){const actual=await hashFile(await regularFilePath(await safePath(source.file,{existing:true})));if(actual.sha256!==source.sha256)fail('Source file hash mismatch: '+source.id);} }
export async function publishCaseFile(folder:string,name:string,value:unknown,hooks:{beforePublish?:()=>Promise<void>;afterPublish?:()=>Promise<void>}={}) {
  const final=await safePath(path.join(folder,name)),stage=await safePath(path.join(folder,'.pending-'+crypto.randomUUID()+'.json'));
  const bytes=json(value),identity=await writeNew(stage,bytes);
  try {if(hooks.beforePublish)await hooks.beforePublish();const stat=await fs.lstat(stage);if(!stat.isFile()||stat.isSymbolicLink()||stat.dev!==identity.dev||stat.ino!==identity.ino||(await hashFile(stage)).sha256!==hash(bytes))fail('Case transaction staging file changed.');await fs.link(stage,final);await syncDirectory(folder);if(hooks.afterPublish)await hooks.afterPublish();}
  finally {await removeOwnedFileIfPresent(stage,identity);}
  return final;
}
export async function listCaseVersions(folder:string) {
  const files=(await fs.readdir(folder)).flatMap(name=>{const m=/^v([0-9]+)\.json$/.exec(name);return m?[{name,version:Number(m[1])}]:[];}).sort((a,b)=>a.version-b.version);
  const output:Awaited<ReturnType<typeof readCasesFile>>[]=[];
  for(const entry of files){if(entry.version!==output.length+1||entry.name!==caseFilename(entry.version))fail('Case version sequence is ambiguous or contains a gap.');const current=await readCasesFile(path.join(folder,entry.name));const previous=output.at(-1);if(current.baseline.caseVersion!==entry.version)fail('Case filename/version mismatch.');if(previous){if(current.baseline.projectId!==previous.baseline.projectId||current.baseline.pointPrefix!==previous.baseline.pointPrefix||current.baseline.previous?.sha256!==previous.ref.sha256)fail('Case version ancestry or namespace mismatch.');if(current.baseline.nextPointNumber<previous.baseline.nextPointNumber)fail('Point counter moved backwards.');for(const retired of previous.baseline.retiredPoints)if(!current.baseline.retiredPoints.some(r=>r.pointId===retired.pointId))fail('Retired point history was removed.');}output.push(current);}
  return output;
}
/** A hash is a deterministic equality check, never a semantic equivalence judgment. */
export function goalDefinition(baseline:Baseline,c:Case,g:Goal) {
  const required=goalRequiredRefs(c,g),set=new Set(required);
  return{goal:g,conditions:c.criticalConditions.filter(x=>set.has('condition:'+x.id)),requiredPath:c.requiredPath,stepOrder:c.stepOrder,steps:c.steps.filter(s=>set.has('step:'+s.id)),parameters:c.parameters,sources:baseline.sources.filter(s=>g.basis.sourceRefIds.includes(s.id)).map(({file:_file,...source})=>source)};
}
export function goalDefinitionHash(baseline:Baseline,c:Case,g:Goal):string|null { return g.planState==='prepared'?canonicalHash(goalDefinition(baseline,c,g)):null; }
export function pointLocation(baseline:Baseline,pointId:string) { for(const c of baseline.cases){const goal=c.goals.find(g=>g.pointId===pointId);if(goal)return{case:c,goal};}return null; }
export interface SaveCasesReceipt { schemaVersion:9;file:string;cases:CasesRef;pointIds:{caseId:string;goalId:string;pointId:string}[];replayed:boolean;unchanged:boolean }
function receipt(saved:Awaited<ReturnType<typeof readCasesFile>>,replayed:boolean,unchanged=false):SaveCasesReceipt{return{schemaVersion:9,file:saved.file,cases:saved.ref,pointIds:saved.baseline.cases.flatMap(c=>c.goals.map(g=>({caseId:c.id,goalId:g.id,pointId:g.pointId}))),replayed,unchanged};}
function draftCase(value:unknown,allocate:()=>string):Case {
  assertClosed(value,['id','title','criticalConditions','requiredPath','stepOrder','steps','parameters','goals'],'case draft');
  const steps=arrayValue(value.steps,'draft steps').map(s=>{assertClosed(s,['id','action','dependsOn'],'step draft');return{...s,dependsOn:s.dependsOn??[]};});
  const goals=arrayValue(value.goals,'draft goals').map(g=>{assertClosed(g,['id','pointId','title','basis','expected','requiredRefs','clarificationQuestions','followUpOf','planState','preparationGaps','sourceAlias'],'goal draft');if(!object(g.basis))fail('Invalid goal basis.');return{...g,title:g.title??g.expected,pointId:g.pointId===null||g.pointId===undefined?allocate():g.pointId,basis:{...g.basis,sourceRefIds:g.basis.sourceRefIds??[]},clarificationQuestions:g.clarificationQuestions??[],planState:g.planState??'prepared',preparationGaps:g.preparationGaps??[],sourceAlias:g.sourceAlias??null};});
  return normalizeCase({...value,steps,goals,parameters:value.parameters??[]});
}
export async function saveCases({workDir,request:input,hooks={}}:{workDir:unknown;request:unknown;hooks?:{beforePublish?:()=>Promise<void>;afterPublish?:()=>Promise<void>}}):Promise<SaveCasesReceipt> {
  assertClosed(input,['schemaVersion','expectedVersion','previousSha256','project','pointPrefix','cases','sources','coverage','retiredPoints','changes','reason','aiContext'],'cases save request');
  if(input.schemaVersion!==9)fail('Case save requests require schemaVersion 9.');
  const expected=integer(input.expectedVersion,'expected case version'),requestSha256=canonicalHash(input),work=await safePath(workDir,{external:true});await fs.mkdir(work,{recursive:true,mode:0o700});const folder=await safePath(path.join(work,'cases'));await fs.mkdir(folder,{recursive:true,mode:0o700});
  const release=await acquireLock(folder);try{
    const target=path.join(folder,caseFilename(expected+1));
    try{const existing=await readCasesFile(target);if(existing.baseline.writeRequestSha256===requestSha256)return receipt(existing,true);fail('Case version conflict: the requested next version already exists with different content.');}catch(error){if(!(error instanceof Error&&'code'in error&&error.code==='ENOENT'))throw error;}
    const versions=await listCaseVersions(folder),previous=versions.at(-1);if((previous?.baseline.caseVersion??0)!==expected)fail('Case version conflict: read the current version before changing it.');
    if(previous?input.previousSha256!==previous.ref.sha256:input.previousSha256!==null)fail('Previous cases fingerprint mismatch.');
    const prefix=textValue(input.pointPrefix,'point prefix');if(!/^[A-Z][A-Z0-9-]{0,39}$/.test(prefix))fail('Invalid point prefix.');if(previous&&prefix!==previous.baseline.pointPrefix)fail('Point namespace cannot change.');
    let next=previous?.baseline.nextPointNumber??1;const allocated=new Set<string>();
    const cases=arrayValue(input.cases,'draft cases').map(c=>draftCase(c,()=>{const id=prefix+'-TP-'+String(next++).padStart(6,'0');allocated.add(id);return id;}));
    const locations=new Map(cases.flatMap(c=>c.goals.map(g=>[c.id+'/'+g.id,g.pointId] as const)));
    const resolve=(v:unknown):string=>{if(typeof v==='string')return safeIdentifier(v,'point reference');assertClosed(v,['caseId','goalId'],'new goal locator');const found=locations.get(safeIdentifier(v.caseId)+'/'+safeIdentifier(v.goalId));if(!found)fail('Unknown new goal locator.');return found;};
    const retired=arrayValue(input.retiredPoints??previous?.baseline.retiredPoints??[],'retired points').map(r=>{assertClosed(r,['pointId','reason','replacements'],'retirement');return{pointId:resolve(r.pointId),reason:textValue(r.reason,'retirement reason'),replacements:arrayValue(r.replacements,'replacements').map(resolve)};});
    const activeIds=new Set(cases.flatMap(c=>c.goals.map(g=>g.pointId))),previousIds=new Set(previous?.baseline.cases.flatMap(c=>c.goals.map(g=>g.pointId))??[]);
    if(previous){for(const c of cases)for(const g of c.goals)if(!previousIds.has(g.pointId)&&!g.pointId.startsWith(prefix+'-TP-'))fail('Foreign point namespace.');for(const id of previousIds)if(!activeIds.has(id)&&!retired.some(r=>r.pointId===id))fail('Removing a point requires an explicit retirement reason: '+id);for(const r of previous.baseline.retiredPoints)if(!retired.some(x=>x.pointId===r.pointId))fail('Previously retired point IDs must remain in the version history.');}
    const changes=arrayValue(input.changes??[],'point changes').map(v=>{assertClosed(v,['pointId','kind','relatedPointIds','reason'],'point change');return{pointId:resolve(v.pointId),kind:v.kind,relatedPointIds:arrayValue(v.relatedPointIds,'related points').map(resolve),reason:textValue(v.reason,'change reason')};});
    const reason=textValue(input.reason,'case version reason');for(const c of cases)for(const g of c.goals){const old=previous?pointLocation(previous.baseline,g.pointId):null;if(!old&&!changes.some(x=>x.pointId===g.pointId))changes.push({pointId:g.pointId,kind:'added',relatedPointIds:[],reason});else if(old&&canonical({caseId:old.case.id,goal:old.goal,plan:old.case.steps,conditions:old.case.criticalConditions,parameters:old.case.parameters,path:old.case.requiredPath,order:old.case.stepOrder})!==canonical({caseId:c.id,goal:g,plan:c.steps,conditions:c.criticalConditions,parameters:c.parameters,path:c.requiredPath,order:c.stepOrder})&&!changes.some(x=>x.pointId===g.pointId))changes.push({pointId:g.pointId,kind:old.case.id===c.id?'modified':'moved',relatedPointIds:[],reason});}
    for(const r of retired)if(!previous?.baseline.retiredPoints.some(p=>canonical(p)===canonical(r))&&!changes.some(x=>x.pointId===r.pointId))changes.push({pointId:r.pointId,kind:'retired',relatedPointIds:r.replacements,reason:r.reason});
    const sources=input.sources??[],coverage=arrayValue(input.coverage??[],'coverage').map(v=>{assertClosed(v,['id','sourceRefId','statement','state','pointIds','reason'],'coverage');return{...v,pointIds:arrayValue(v.pointIds,'coverage points').map(resolve)};});
    const baseline=normalizeCases({...(input.aiContext===undefined?{}:{aiContext:input.aiContext}),schemaVersion:9,projectId:previous?.baseline.projectId??crypto.randomUUID(),project:textValue(input.project,'project'),pointPrefix:prefix,caseVersion:expected+1,previous:previous?{caseVersion:expected,sha256:previous.ref.sha256}:null,nextPointNumber:next,retiredPoints:retired,sources,coverage,cases,changes,writeRequestSha256:requestSha256,savedAt:now()});
    // Preassigned IDs are accepted only if they already belong to the predecessor.
    for(const id of activeIds)if(!previousIds.has(id)&&!allocated.has(id))fail('New point IDs must be allocated by this save transaction; existing or retired numbers cannot be reassigned.');
    const material=(b:Baseline)=>({project:b.project,pointPrefix:b.pointPrefix,retiredPoints:b.retiredPoints,sources:b.sources,coverage:b.coverage,cases:b.cases});
    if(previous&&canonical(material(previous.baseline))===canonical(material(baseline)))return receipt(previous,false,true);
    await verifyAiContext(baseline.aiContext);await verifySources(baseline.sources);if(previous&&(await hashFile(previous.file)).sha256!==previous.ref.sha256)fail('Previous case file changed during save.');
    await publishCaseFile(folder,caseFilename(expected+1),baseline,{...hooks,beforePublish:async()=>{await hooks.beforePublish?.();await verifyAiContext(baseline.aiContext);await verifySources(baseline.sources);if(previous&&(await hashFile(previous.file)).sha256!==previous.ref.sha256)fail('Previous case file changed before publication.');}});return receipt(await readCasesFile(target),false);
  }finally{await release();}
}
