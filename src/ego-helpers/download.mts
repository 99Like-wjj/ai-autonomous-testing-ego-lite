/** Ego SDK composition only. The caller chooses the Page, action and any reconciliation. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {canonical, directory, errorInfo, fail, hash, inside, json, now, readJSON, safeIdentifier, safePath, writeNew,withRunLock,removeOwnedFileIfPresent} from '../core/common.mjs';
import {copyAndHashSource} from '../core/records.mjs';
import {readExecutionMetadataUnlocked} from '../execution/read-context.mjs';
import {integer, textValue, uniqueStrings} from '../core/validation.mjs';
interface Download {url():string;suggestedFilename():string;saveAs(file:string):Promise<unknown>}
export interface EgoPage {
  label:string;spaceId:number;targetId?:string;url():Promise<string>;
  waitForEvent(event:'download',options:{timeout:number}):Promise<Download>;
}
export interface CaptureOptions {
  page:EgoPage;runDir:string;runId:string;caseId:string;pointIds:string[];actionId:string;captureId:string;captureRoot:string;
  startTimeoutMs?:number;completionWaitMs?:number;
}
type CaptureIdentity=Omit<CaptureOptions,'page'|'startTimeoutMs'|'completionWaitMs'>;
function publicUrl(value:string){try{const url=new URL(value);if(url.protocol==='blob:')return'blob:[opaque]';if(url.protocol==='data:')return'data:[omitted]';return url.origin+url.pathname;}catch{return'[unrecognized URL]';}}
function redact(value:unknown):unknown {
  if(typeof value==='string')return value.replace(/(?:https?|file|blob):\/\/[^\s"'<>]+/g,publicUrl);
  if(Array.isArray(value))return value.map(redact);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,redact(v)]));
  return value;
}
function describe(error:unknown){const e=errorInfo(error);return{message:redact(e.message),...(e.code?{code:e.code}:{})};}
async function assertMarker(options:CaptureIdentity,allowUnknown=false) {
  const root=await directory(options.runDir),manifest=await readJSON(path.join(root,'manifest.json'));
  if(!manifest||typeof manifest!=='object'||!('runId'in manifest)||manifest.runId!==options.runId)fail('Capture run identity mismatch.');
  const {ledger}=await withRunLock(root,readExecutionMetadataUnlocked),marker=ledger.activeDownload;
  const expected={captureId:safeIdentifier(options.captureId),caseId:safeIdentifier(options.caseId),pointIds:uniqueStrings(options.pointIds,'capture points',true),actionId:safeIdentifier(options.actionId),state:'active'};
  if(!marker||canonical({...marker,state:'active'})!==canonical(expected))fail('Capture must match the existing execution download note; unresolved captures cannot be bypassed.');
  if(!allowUnknown&&marker.state!=='active')fail('An unknown capture requires explicit reconciliation; it cannot arm another listener.');
  const owner=ledger.operations.find(op=>op.request.kind==='note'&&op.request.category==='download'&&op.request.download?.captureId===options.captureId&&op.request.download.state==='active')?.request;
  const assignment=owner?.kind==='note'&&owner.assignmentId?ledger.assignments.find(a=>a.id===owner.assignmentId):undefined;
  const expectedRoot=path.join(root,...(assignment?[...assignment.workerDirectory.split('/'),'captures']:['captures']));
  if(path.resolve(options.captureRoot)!==expectedRoot)fail('Capture root must be the download-note owner’s run/captures or workers/<assignment>/captures directory.');
  return root;
}
async function newCapture(options:CaptureIdentity,allowUnknown=false) {
  const root=await assertMarker(options,allowUnknown),captureRoot=await safePath(options.captureRoot,{external:true});
  if(!inside(root,captureRoot)||captureRoot===root||/^(?:evidence)(?:\/|$)/.test(path.relative(root,captureRoot).replaceAll('\\','/')))fail('Use a dedicated capture directory inside this run or assigned worker directory, outside the evidence catalog.');
  await fs.mkdir(captureRoot,{recursive:true,mode:0o700});
  const folder=await safePath(path.join(captureRoot,safeIdentifier(options.captureId)));await fs.mkdir(folder,{mode:0o700});
  await fs.mkdir(path.join(folder,'.staging'),{mode:0o700});
  const stat=await fs.lstat(folder);return{folder,identity:{dev:stat.dev,ino:stat.ino}};
}
async function checkFolder(folder:string,identity:{dev:number;ino:number}){await safePath(folder,{existing:true});const stat=await fs.lstat(folder);if(!stat.isDirectory()||stat.dev!==identity.dev||stat.ino!==identity.ino)fail('Capture directory identity changed.');}
async function preserve(source:string,folder:string,identity:{dev:number;ino:number}){
  await checkFolder(folder,identity);await safePath(source,{existing:true});
  const filename=await safePath(path.join(folder,'original.bin')),stage=await safePath(path.join(folder,'.staging','retained-'+randomUUID()+'.bin')),actual=await copyAndHashSource(source,stage);
  await checkFolder(folder,identity);const stat=await fs.lstat(stage);if(!stat.isFile()||stat.isSymbolicLink())fail('Retained download staging changed.');
  await fs.link(stage,filename);await removeOwnedFileIfPresent(stage,{dev:stat.dev,ino:stat.ino});
  return{path:filename,...actual};
}
function identityOf(o:CaptureIdentity){return{runId:o.runId,caseId:o.caseId,pointIds:o.pointIds,actionId:o.actionId,captureId:o.captureId};}
async function bounded<T>(promise:Promise<T>,milliseconds:number):Promise<{settled:true;value:T}|{settled:false}>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([promise.then(value=>({settled:true as const,value})),new Promise<{settled:false}>(resolve=>{timer=setTimeout(()=>resolve({settled:false}),milliseconds);})]);}
  finally{if(timer)clearTimeout(timer);}
}
export async function armNativeDownload(options:CaptureOptions) {
  const startTimeoutMs=integer(options.startTimeoutMs??30000,'download start wait',1),completionWaitMs=integer(options.completionWaitMs??60000,'download completion wait',1);
  const capture=await newCapture(options),source=await options.page.url(),listeningRequestedAt=now();
  // Request the official listener before returning control to the caller's chosen UI action.
  let waiting:Promise<{download:Download;observedAt:string}|{error:ReturnType<typeof describe>}>;
  try{waiting=options.page.waitForEvent('download',{timeout:startTimeoutMs}).then(download=>({download,observedAt:now()}),error=>({error:describe(error)}));}
  catch(error){waiting=Promise.resolve({error:describe(error)});}
  const armed={schemaVersion:9,kind:'download_capture',method:'ego_native',...identityOf(options),page:{label:options.page.label,spaceId:options.page.spaceId,targetId:options.page.targetId??null,url:publicUrl(source),urlSha256:hash(source)},listeningRequestedAt,startTimeoutMs,completionWaitMs,limitations:['Listener request time is not proof of low-level listener readiness. Ego download settings are shared; this run marker does not isolate other chats or user downloads.']};
  await writeNew(path.join(capture.folder,'armed.json'),json(armed));
  let collected=false;
  return{captureDirectory:capture.folder,async collect({actionReceipt=null,actionError=null}:{actionReceipt?:unknown;actionError?:unknown}={}) {
    if(collected)fail('This capture has already been collected; inspect its retained receipt instead of rerunning the action.');collected=true;
    const event=await waiting;
    const facts:Record<string,unknown>&{startObservation:'not_observed'|'observed'|'unknown';completionObservation:'completed'|'failed'|'unknown';lateEffectsPossible:boolean;file:{path:string;bytes:number;sha256:string}|null}={...armed,action:{receipt:redact(actionReceipt),error:actionError===null?null:describe(actionError)},startObservation:'not_observed',completionObservation:'unknown',lateEffectsPossible:true,file:null,observedAt:now()};
    if('error'in event)facts.error=event.error;
    else {
      facts.startObservation='observed';facts.downloadObservedAt=event.observedAt;
      facts.download={sourceUrl:publicUrl(event.download.url()),sourceUrlSha256:hash(event.download.url()),suggestedFilename:textValue(event.download.suggestedFilename()||'(unspecified)','suggested filename')};
      const staging=path.join(capture.folder,'.staging','download.bin');
      // A timeout never cancels the SDK call. A late completion writes only this capture's staging facts.
      const saving=Promise.resolve().then(()=>event.download.saveAs(staging)).then(async()=>{await checkFolder(capture.folder,capture.identity);const result={state:'save_resolved',at:now(),staging};await writeNew(path.join(capture.folder,'.staging','save-completion.json'),json(result));return{ok:true as const};},error=>({ok:false as const,error:describe(error)})).catch(error=>({ok:false as const,error:describe(error)}));
      const saved=await bounded(saving,completionWaitMs);
      if(!saved.settled){facts.error={message:'DOWNLOAD_COMPLETION_WAIT_EXPIRED'};}
      else if(!saved.value.ok)facts.error=saved.value.error;
      else try{facts.file=await preserve(staging,capture.folder,capture.identity);facts.completionObservation='completed';facts.lateEffectsPossible=false;}catch(error){facts.error=describe(error);}
    }
    facts.collectedAt=now();facts.limitations=[...armed.limitations,...(facts.completionObservation==='completed'?['Saved bytes do not establish business data correctness.']:['No completion is proven. Stopping the wait or script does not prove transfer cancellation; reconcile this same action before a new download.'])];
    const receiptFile=path.join(capture.folder,'capture.json');await writeNew(receiptFile,json(facts));
    return{...facts,receiptFile};
  }};
}
/** Explicit readback after a late native save. It performs no browser operation or retry. */
export async function retainStagedDownload({captureDirectory,reason}:{captureDirectory:string;reason:string}) {
  textValue(reason,'reconciliation reason');const folder=await directory(captureDirectory),armed=await readJSON(path.join(folder,'armed.json')),settled=await readJSON(path.join(folder,'.staging','save-completion.json'));
  if(!armed||typeof armed!=='object'||!('kind'in armed)||armed.kind!=='download_capture'||!settled||typeof settled!=='object'||!('state'in settled)||settled.state!=='save_resolved')fail('No actual SDK save completion was retained.');
  const stat=await fs.lstat(folder),file=await preserve(path.join(folder,'.staging','download.bin'),folder,stat);
  const receipt={schemaVersion:9,kind:'download_reconciliation',sourceCapture:armed,reason,observedAt:now(),completionObservation:'completed',file,limitations:['Explicit late save reconciliation; it does not authorize replay or establish business correctness.']};
  const receiptFile=path.join(folder,'reconciliation.json');await writeNew(receiptFile,json(receipt));return{...receipt,receiptFile};
}
export interface ManagerCandidate {downloadId:string;sourceUrlSha256:string;sourceUrl:string;filename:string;fileUrl:string;state:number;completed:boolean;interrupted:boolean;fileExternallyRemoved:boolean}
export interface ManagerSnapshot {schemaVersion:9;kind:'download_manager_snapshot';browserVersion:string;observedAt:string;sourceUrlSha256s:string[];supported:boolean;reason:string|null;candidates:ManagerCandidate[]}
/** Caller has explicitly selected a downloads page in its existing TaskSpace. Filter before returning history. */
export async function listDownloadCandidates({page,sourceUrls,browserVersion}:{page:{url():Promise<string>;evaluate(fn:(input:{urls:string[]})=>unknown,input:{urls:string[]}):Promise<unknown>};sourceUrls:string[];browserVersion:string}):Promise<ManagerSnapshot> {
  const urls=uniqueStrings(sourceUrls,'authorized exact download URLs');if(!urls.length)fail('An exact task URL scope is required.');
  const base={schemaVersion:9 as const,kind:'download_manager_snapshot' as const,browserVersion,observedAt:now(),sourceUrlSha256s:urls.map(hash)};
  if(browserVersion!=='0.6.2.5')return{...base,supported:false,reason:'Downloads manager adapter is validated only for Ego 0.6.2.5.',candidates:[]};
  if((await page.url()).replace(/\/$/,'')!=='chrome://downloads')fail('The caller must explicitly select chrome://downloads/ in the existing task Space.');
  const raw=await page.evaluate(({urls})=>{
    const doc=(globalThis as unknown as {document:{querySelector(selector:string):{items_?:unknown[]}|null}}).document;
    const manager=doc.querySelector('downloads-manager');
    if(!manager||!Array.isArray(manager.items_))return{supported:false,reason:'Downloads manager structure is not supported.',items:[]};
    const actual=(v:unknown)=>typeof v==='string'?v:v&&typeof v==='object'&&'url'in v?String(v.url):'';
    const items=manager.items_.filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object').filter(x=>urls.includes(actual(x.url))).map(x=>({downloadId:String(x.id??''),url:actual(x.url),fileUrl:actual(x.fileUrl),filename:String(x.fileName??''),state:x.state,fileExternallyRemoved:x.fileExternallyRemoved===true}));
    return{supported:items.every(x=>x.downloadId&&typeof x.state==='number'),reason:null,items};
  },{urls}) as {supported:boolean;reason:string|null;items:{downloadId:string;url:string;fileUrl:string;filename:string;state:number;fileExternallyRemoved:boolean}[]};
  if(!raw||!Array.isArray(raw.items))fail('Unexpected downloads manager response.');
  return{...base,supported:raw.supported,reason:raw.reason,candidates:raw.items.map(x=>({downloadId:x.downloadId,sourceUrlSha256:hash(x.url),sourceUrl:publicUrl(x.url),fileUrl:x.fileUrl,filename:x.filename,state:x.state,completed:x.state===2,interrupted:x.state===5,fileExternallyRemoved:x.fileExternallyRemoved}))};
}
/** Retain exactly the AI-selected new completed ID. No filename/latest-item inference or URL request. */
export async function retainDownloadCandidate({options,before,after,downloadId,reason}:{options:CaptureIdentity;before:ManagerSnapshot;after:ManagerSnapshot;downloadId:string;reason:string}) {
  textValue(reason,'candidate selection reason');
  if(!before.supported||!after.supported||before.kind!=='download_manager_snapshot'||after.kind!=='download_manager_snapshot'||before.browserVersion!==after.browserVersion||canonical(before.sourceUrlSha256s)!==canonical(after.sourceUrlSha256s)||Date.parse(after.observedAt)<Date.parse(before.observedAt))fail('Candidate reconciliation requires matching supported before/after task snapshots.');
  const matches=after.candidates.filter(c=>c.downloadId===downloadId),candidate=matches[0];
  if(matches.length!==1||!candidate||before.candidates.some(c=>c.downloadId===downloadId)||!after.sourceUrlSha256s.includes(candidate.sourceUrlSha256))fail('Selected download ID is not a unique new task-scoped candidate.');
  if(!candidate.completed||candidate.state!==2||candidate.fileExternallyRemoved||!candidate.fileUrl.startsWith('file:'))fail('Candidate has no readable completed local artifact; no completion is inferred.');
  let capture:Awaited<ReturnType<typeof newCapture>>;
  const existing=await safePath(path.join(options.captureRoot,safeIdentifier(options.captureId)));
  try {
    await fs.lstat(existing);await assertMarker(options,true);
    const armed=await readJSON(path.join(existing,'armed.json'));
    if(!armed||typeof armed!=='object'||!('runId'in armed)||!('captureId'in armed)||armed.runId!==options.runId||armed.captureId!==options.captureId||!('actionId'in armed)||armed.actionId!==options.actionId||!('caseId'in armed)||armed.caseId!==options.caseId||!('pointIds'in armed)||canonical(armed.pointIds)!==canonical(options.pointIds))fail('Existing capture is not the same native action.');
    const folder=await safePath(path.join(existing,'manager-reconciliation'));await fs.mkdir(folder,{mode:0o700});await fs.mkdir(path.join(folder,'.staging'),{mode:0o700});const stat=await fs.lstat(folder);capture={folder,identity:{dev:stat.dev,ino:stat.ino}};
  } catch(error){if(errorInfo(error).code!=='ENOENT')throw error;capture=await newCapture(options,true);}
  const file=await preserve(fileURLToPath(candidate.fileUrl),capture.folder,capture.identity);
  const receipt={schemaVersion:9,kind:'download_capture',method:'downloads_manager_explicit',...identityOf(options),selectedAt:now(),reason,before,after,downloadId,startObservation:'observed',completionObservation:'completed',lateEffectsPossible:false,file,limitations:['Internal downloads-manager adapter, not a stable official SDK. Matching the new exact-URL ID is task association evidence, not human action attribution or business correctness.']};
  const receiptFile=path.join(capture.folder,'capture.json');await writeNew(receiptFile,json(receipt));return{...receipt,receiptFile};
}
