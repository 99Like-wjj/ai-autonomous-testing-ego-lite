/** Actual review records beside case files. Feedback is data, not automatic approval. */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Baseline, CaseReview, CasesRef } from '../contracts/model.mjs';
import { acquireLock, assertClosed, canonical, canonicalHash, fail, hash, now, safeIdentifier, safePath } from './common.mjs';
import { arrayValue, integer, oneOf, parseSourceRef, sha256Value, textValue, timeValue, uniqueStrings } from './validation.mjs';
import { regularFilePath, hashFile } from './file-integrity.mjs';
import { caseFilename, goalDefinitionHash, pointLocation, publishCaseFile, readCasesFile, verifySources } from './case-versions.mjs';

export function parseCasesRef(value:unknown):CasesRef {assertClosed(value,['projectId','caseVersion','sha256'],'cases reference');return{projectId:safeIdentifier(value.projectId),caseVersion:integer(value.caseVersion,'case version',1),sha256:sha256Value(value.sha256)};}
export function parseCaseReview(value:unknown):CaseReview {
  assertClosed(value,['schemaVersion','cases','reviewNumber','decision','pointIds','comments','source','sourceKind','delegationSource','reviewedTargets','recordedAt','writeRequestSha256'],'case review');if(value.schemaVersion!==9)fail('Case review requires schemaVersion 9.');
  const decision=oneOf(value.decision,['comment_only','changes_requested','approved'],'review decision'),sourceKind=oneOf(value.sourceKind,['user_statement','delegated_review','feedback_file'],'review source kind'),source=parseSourceRef(value.source),delegationSource=value.delegationSource===null?null:parseSourceRef(value.delegationSource),pointIds=uniqueStrings(value.pointIds,'review point IDs',true);
  if(decision!=='comment_only'&&!pointIds.length)fail('A review decision needs an explicit point scope.');
  if(decision==='approved'&&(sourceKind==='feedback_file'||!source.excerpt.trim()||sourceKind==='delegated_review'&&delegationSource===null))fail('Approval requires an actual human statement or explicit delegation, not a feedback flag.');
  const comments=arrayValue(value.comments,'review comments').map(v=>{assertClosed(v,['pointId','text'],'review comment');const pointId=v.pointId===null?null:safeIdentifier(v.pointId);if(pointId!==null&&!pointIds.includes(pointId))fail('Review comment is outside its scope.');return{pointId,text:textValue(v.text,'review comment')};});
  const reviewedTargets=arrayValue(value.reviewedTargets,'review targets').map(v=>{assertClosed(v,['pointId','definitionSha256'],'reviewed target');return{pointId:safeIdentifier(v.pointId),definitionSha256:v.definitionSha256===null?null:sha256Value(v.definitionSha256)};});
  if(canonical(reviewedTargets.map(t=>t.pointId))!==canonical(pointIds))fail('Review target hashes do not match the declared scope.');
  return{schemaVersion:9,cases:parseCasesRef(value.cases),reviewNumber:integer(value.reviewNumber,'review number',1),decision,pointIds,comments,source,sourceKind,delegationSource,reviewedTargets,recordedAt:timeValue(value.recordedAt,'review time'),writeRequestSha256:sha256Value(value.writeRequestSha256)};
}
export interface RetainedReview { file:string;sha256:string;record:CaseReview }
export async function readReview(file:unknown):Promise<RetainedReview>{const filename=await regularFilePath(await safePath(file,{existing:true})),bytes=await fs.readFile(filename);return{file:filename,sha256:hash(bytes),record:parseCaseReview(JSON.parse(bytes.toString('utf8')))};}
export async function listReviews(folder:string):Promise<RetainedReview[]>{
  const names=(await fs.readdir(folder)).filter(n=>/^v[0-9]+-review-[0-9]+\.json$/.test(n)),records:RetainedReview[]=[];
  for(const name of names){const r=await readReview(path.join(folder,name));if(name!==reviewFilename(r.record.cases.caseVersion,r.record.reviewNumber))fail('Review filename does not match its canonical version and sequence.');records.push(r);}
  for(const version of new Set(records.map(r=>r.record.cases.caseVersion))){const sequence=records.filter(r=>r.record.cases.caseVersion===version).sort((a,b)=>a.record.reviewNumber-b.record.reviewNumber);if(sequence.some((r,i)=>r.record.reviewNumber!==i+1))fail('Review record sequence contains a gap or duplicate.');}
  return records.sort((a,b)=>a.record.recordedAt.localeCompare(b.record.recordedAt)||a.record.cases.caseVersion-b.record.cases.caseVersion||a.record.reviewNumber-b.record.reviewNumber);
}
const reviewFilename=(version:number,number:number)=>caseFilename(version).slice(0,-5)+'-review-'+String(number).padStart(2,'0')+'.json';
export async function reviewCases({casesFile,request:input}:{casesFile:unknown;request:unknown}) {
  assertClosed(input,['schemaVersion','cases','expectedReviewNumber','decision','pointIds','comments','source','sourceKind','delegationSource'],'case review request');if(input.schemaVersion!==9)fail('Review requests require schemaVersion 9.');
  const initial=await readCasesFile(casesFile),folder=path.dirname(initial.file);if(path.basename(initial.file)!==caseFilename(initial.baseline.caseVersion))fail('Review the published version file, not a renamed copy.');
  const release=await acquireLock(folder);try{
    const saved=await readCasesFile(initial.file),requested=parseCasesRef(input.cases);if(canonical(requested)!==canonical(saved.ref))fail('Review refers to a different case version or file fingerprint.');
    const expected=integer(input.expectedReviewNumber,'expected review number'),requestSha256=canonicalHash(input),target=path.join(folder,reviewFilename(saved.ref.caseVersion,expected+1));
    try{const old=await readReview(target);if(old.record.writeRequestSha256===requestSha256)return{...old,replayed:true};fail('Review number conflict.');}catch(error){if(!(error instanceof Error&&'code'in error&&error.code==='ENOENT'))throw error;}
    const prior=await listReviews(folder),sameVersion=prior.filter(r=>r.record.cases.caseVersion===saved.ref.caseVersion);if(sameVersion.length!==expected||sameVersion.some((r,i)=>r.record.reviewNumber!==i+1))fail('Review sequence conflict.');
    const pointIds=uniqueStrings(input.pointIds,'review point IDs',true),reviewedTargets=pointIds.map(pointId=>{const p=pointLocation(saved.baseline,pointId);if(!p)fail('Review names an unknown point: '+pointId);return{pointId,definitionSha256:goalDefinitionHash(saved.baseline,p.case,p.goal)};});
    const record=parseCaseReview({schemaVersion:9,cases:saved.ref,reviewNumber:expected+1,decision:input.decision,pointIds,comments:input.comments,source:input.source,sourceKind:input.sourceKind,delegationSource:input.delegationSource,reviewedTargets,recordedAt:now(),writeRequestSha256:requestSha256});
    const sourceKey=(r:CaseReview)=>canonical({source:r.source,sourceKind:r.sourceKind});
    for(const old of prior)if(sourceKey(old.record)===sourceKey(record)&&record.decision!=='comment_only'){
      if(canonical({...old.record,reviewNumber:0,recordedAt:'',writeRequestSha256:''})===canonical({...record,reviewNumber:0,recordedAt:'',writeRequestSha256:''}))return{...old,replayed:true};
      fail('An existing human source cannot be reused as a newer or expanded confirmation.');
    }
    await verifySources([record.source,...(record.delegationSource?[record.delegationSource]:[])]);if((await hashFile(saved.file)).sha256!==saved.ref.sha256)fail('Case file changed before review publication.');
    await publishCaseFile(folder,path.basename(target),record);return{...await readReview(target),replayed:false};
  }finally{await release();}
}
export interface ReviewBinding { pointId:string;reviewSha256:string;sourceCases:CasesRef;definitionSha256:string }
/** Validate adjacent records too, so an omitted later change request cannot be bypassed. */
export async function verifyCaseApprovals(casesFile:string,baseline:Baseline,pointIds:readonly string[],reviewFiles:readonly string[]):Promise<{reviews:RetainedReview[];bindings:ReviewBinding[]}> {
  const folder=path.dirname(casesFile),all=await listReviews(folder),provided:RetainedReview[]=[];
  for(const file of reviewFiles){const r=await readReview(file);if(path.dirname(r.file)!==folder||!all.some(a=>a.sha256===r.sha256))fail('Review must be an actual adjacent record for this case workspace.');if(!provided.some(x=>x.sha256===r.sha256))provided.push(r);}
  const checked:RetainedReview[]=[];
  for(const r of all){if(!r.record.pointIds.some(id=>pointIds.includes(id)))continue;if(r.record.cases.projectId!==baseline.projectId)fail('Review belongs to another project.');const source=await readCasesFile(path.join(folder,caseFilename(r.record.cases.caseVersion)));if(canonical(source.ref)!==canonical(r.record.cases))fail('Review source case file fingerprint changed.');for(const t of r.record.reviewedTargets){const p=pointLocation(source.baseline,t.pointId);if(!p||goalDefinitionHash(source.baseline,p.case,p.goal)!==t.definitionSha256)fail('Review definition fingerprint is not derived from its source.');}checked.push(r);}
  const bindings:ReviewBinding[]=[];
  for(const pointId of pointIds){const p=pointLocation(baseline,pointId);if(!p)fail('Unknown reviewed point: '+pointId);const definitionSha256=goalDefinitionHash(baseline,p.case,p.goal);if(definitionSha256===null)fail('Unprepared goal cannot be compiled: '+pointId);
    const relevant=checked.filter(r=>r.record.decision!=='comment_only'&&r.record.reviewedTargets.some(t=>t.pointId===pointId));const latest=relevant.at(-1);
    if(!latest||latest.record.decision!=='approved'||!latest.record.reviewedTargets.some(t=>t.pointId===pointId&&t.definitionSha256===definitionSha256)||!provided.some(x=>x.sha256===latest.sha256))fail('Review required or newer change request is unresolved for point: '+pointId);
    const conflicting=relevant.some(r=>r!==latest&&r.record.cases.caseVersion!==latest.record.cases.caseVersion&&r.record.recordedAt===latest.record.recordedAt&&r.record.decision!==latest.record.decision);if(conflicting)fail('Conflicting review order requires human clarification.');
    bindings.push({pointId,reviewSha256:latest.sha256,sourceCases:latest.record.cases,definitionSha256});
  }
  return{reviews:provided.filter(r=>bindings.some(b=>b.reviewSha256===r.sha256)),bindings};
}
