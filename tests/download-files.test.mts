import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import vm from 'node:vm';import {pathToFileURL} from 'node:url';
import {fixture} from './goals-fixture.mjs';import {readCasesFile} from '../src/core/case-versions.mjs';
import {executeRequest,readExecutionView} from '../src/execution/commands.mjs';
import {armNativeDownload,retainStagedDownload,listDownloadCandidates,retainDownloadCandidate} from '../src/ego-helpers/download.mjs';
import {inspectFile} from '../src/files/inspect.mjs';import {syntheticXlsx} from './xlsx-fixture.mjs';
async function marker(f:Awaited<ReturnType<typeof fixture>>,captureId='capture-1',state='active',evidenceFiles:string[]=[]){const s=await readExecutionView(f.runDir),saved=await readCasesFile(f.casesFile),pointIds=[saved.baseline.cases[0]!.goals[0]!.pointId],download={captureId,caseId:'one',pointIds,actionId:'action-1',state};await executeRequest({runDir:f.runDir,request:{schemaVersion:9,operationId:captureId+'-'+state+'-'+s.revision,expectedRevision:s.revision,kind:'note',category:'download',download,reason:'Synthetic download coordination fact',evidenceFiles}});return{runDir:f.runDir,runId:s.runId,caseId:'one',pointIds,actionId:'action-1',captureId,captureRoot:path.join(f.runDir,'captures')};}
test('native listener is requested before caller action, retains actual bytes and refuses capture replay/overwrites',async t=>{
 const f=await fixture(t),options=await marker(f),order:string[]=[];
 const page={label:'p1',spaceId:99,targetId:'synthetic-target',url:async()=> 'http://localhost/synthetic?signature=private',
 waitForEvent:(_event:'download',_options:{timeout:number})=>{order.push('listener');return Promise.resolve({url:()=> 'http://localhost/file?signature=private',suggestedFilename:()=> '../../same.csv',saveAs:async(file:string)=>{await fs.writeFile(file,'id,value\n001,2\n');}});}};
 const capture=await armNativeDownload({...options,page});order.push('caller-action');const facts=await capture.collect({actionReceipt:{dispatched:true,url:'http://localhost/file?signature=private'}});
 assert.deepEqual(order,['listener','caller-action']);assert.equal(facts.completionObservation,'completed');assert.equal((facts.file as {bytes:number}).bytes,15);assert.ok(!(await fs.readFile(facts.receiptFile,'utf8')).includes('signature=private'));
 await assert.rejects(armNativeDownload({...options,page}),/EEXIST/);await assert.rejects(capture.collect(),/already been collected/);
 await assert.rejects(marker(f,'another'),/remains active|unknown/);await marker(f,'capture-1','resolved',[facts.receiptFile]);assert.equal((await readExecutionView(f.runDir)).activeDownload,null);
 await assert.rejects(marker(f,'capture-1'),/already used/);
});
test('native completion timeout leaves late effects unknown and only explicit readback publishes the late original',async t=>{
 const f=await fixture(t),options=await marker(f);let finish:((value:unknown)=>void)|undefined;
 const page={label:'p1',spaceId:99,url:async()=> 'http://localhost/synthetic',waitForEvent:async(_event:'download',_options:{timeout:number})=>({url:()=> 'http://localhost/slow',suggestedFilename:()=> 'slow.bin',saveAs:async(file:string)=>{await new Promise(resolve=>{finish=resolve;});await fs.writeFile(file,'late bytes');}})};
 const capture=await armNativeDownload({...options,page,completionWaitMs:10}),facts=await capture.collect();assert.equal(facts.completionObservation,'unknown');assert.equal(facts.lateEffectsPossible,true);await marker(f,'capture-1','unknown',[facts.receiptFile]);await assert.rejects(marker(f,'another'),/remains active|unknown/);await assert.rejects(fs.stat(path.join(capture.captureDirectory,'original.bin')),{code:'ENOENT'});
 await assert.rejects(armNativeDownload({...options,page,captureRoot:options.captureRoot+'/another'}),/unknown capture|owner/);
 finish!(null);for(let i=0;i<50;i++){try{await fs.stat(path.join(capture.captureDirectory,'.staging','save-completion.json'));break;}catch{await new Promise(resolve=>setTimeout(resolve,5));}}
 const retained=await retainStagedDownload({captureDirectory:capture.captureDirectory,reason:'Explicit synthetic late save reconciliation'});assert.equal(retained.file.bytes,10);assert.equal((await readExecutionView(f.runDir)).activeDownload?.state,'unknown');
});
test('native start errors retain unknown completion and do not request a second action or fallback',async t=>{
 const f=await fixture(t),options=await marker(f);let calls=0;const page={label:'p1',spaceId:99,url:async()=> 'http://localhost/synthetic',waitForEvent:async(_event:'download',_options:{timeout:number})=>{calls++;throw Error('Synthetic timeout');}};
 const capture=await armNativeDownload({...options,page}),facts=await capture.collect({actionError:Error('Synthetic dispatch unknown')});assert.equal(calls,1);assert.equal(facts.startObservation,'not_observed');assert.equal(facts.completionObservation,'unknown');assert.equal(facts.file,null);
});
test('manager adapter filters task URLs before returning candidates and requires a unique new completed ID',async t=>{
 const f=await fixture(t),options=await marker(f),url='http://localhost/export?token=synthetic',local=path.join(f.root,'download.csv');await fs.writeFile(local,'id\n001\n');
 let items:unknown[]=[{id:'old',url:{url},fileUrl:{url:pathToFileURL(local).href},fileName:'same.csv',state:2},{id:'unrelated',url:{url:'http://other-project/private'},fileUrl:{url:'file:///other/private'},state:2}];
 const page={url:async()=> 'chrome://downloads/',evaluate:async(fn:(input:{urls:string[]})=>unknown,input:{urls:string[]})=>vm.runInNewContext('('+fn.toString()+')(input)',{input,document:{querySelector:()=>({items_:items})}}) as unknown};
 const before=await listDownloadCandidates({page,sourceUrls:[url],browserVersion:'0.6.2.5'});assert.equal(before.candidates.length,1);assert.ok(!JSON.stringify(before).includes('other-project'));
 items=[...items,{id:'new',url:{url},fileUrl:{url:pathToFileURL(local).href},fileName:'same.csv',state:2}];const after=await listDownloadCandidates({page,sourceUrls:[url],browserVersion:'0.6.2.5'});
 await assert.rejects(retainDownloadCandidate({options,before,after,downloadId:'old',reason:'Invalid old candidate'}),/unique new/);
 const retained=await retainDownloadCandidate({options,before,after,downloadId:'new',reason:'Explicitly selected synthetic new ID'});assert.equal(retained.file.bytes,7);
 const unsupported=await listDownloadCandidates({page,sourceUrls:[url],browserVersion:'unvalidated'});assert.equal(unsupported.supported,false);assert.equal(unsupported.candidates.length,0);
});
test('manager progress, interruption, removed files and unknown states never become completed originals',async t=>{
 const f=await fixture(t),options=await marker(f),base={schemaVersion:9 as const,kind:'download_manager_snapshot' as const,browserVersion:'0.6.2.5',observedAt:new Date().toISOString(),sourceUrlSha256s:['a'.repeat(64)],supported:true,reason:null,candidates:[]};
 for(const state of [0,1,5,999])await assert.rejects(retainDownloadCandidate({options,before:base,after:{...base,candidates:[{downloadId:'new',sourceUrlSha256:'a'.repeat(64),sourceUrl:'http://localhost/file',filename:'same',fileUrl:pathToFileURL(f.sourceFile).href,state,completed:false,interrupted:state===5,fileExternallyRemoved:false}]},downloadId:'new',reason:'Synthetic incomplete candidate'}),/readable completed/);
});
async function inspect(f:Awaited<ReturnType<typeof fixture>>,name:string,body:Buffer|string,extra:Record<string,unknown>={}){const file=path.join(f.root,name);await fs.writeFile(file,body);const outputFile=file+'.inspection.json',receipt=await inspectFile({request:{schemaVersion:9,file,...extra},outputFile});return{receipt,result:JSON.parse(await fs.readFile(outputFile,'utf8')),file};}
test('CSV preserves BOM, quotes, multiline fields, blank rows, duplicate headers and leading zeros',async t=>{
 const f=await fixture(t),{result}=await inspect(f,'sample.csv','\ufeffid,id,note\r\n001,002,"hello,\r\nworld"\r\n\r\n003,004," a "\r\n');
 assert.equal(result.state,'complete');assert.deepEqual(result.data[0].rows,[['id','id','note'],['001','002','hello,\r\nworld'],[''],['003','004',' a ']]);assert.equal(result.businessVerdict,undefined);
});
test('JSON preserves long numeric tokens, literal property paths and missing-value distinctions',async t=>{
 const f=await fixture(t),{result}=await inspect(f,'sample.json','{"id":9007199254740993,"amount":0.10000000000000001,"empty":"","null":null,"zero":0}',{format:'json'});assert.equal(result.data.id.raw,'9007199254740993');assert.equal(result.data.amount.raw,'0.10000000000000001');assert.equal(result.data.null,null);assert.equal(result.data.empty,'');assert.equal(result.data.zero.raw,'0');
 const missing=await inspect(f,'missing.json','{"present":null}',{format:'json',jsonPath:['absent']});assert.equal(missing.result.state,'failed');assert.match(missing.result.error,/JSON_PATH_MISSING/);
});
test('large Unicode CSV fields survive child-process chunk boundaries without an undocumented per-record limit',async t=>{
 const f=await fixture(t),value='汉😀a'.repeat(150000),{result}=await inspect(f,'unicode.csv','value\n"'+value+'"\n',{format:'csv',maxBytes:3*1024*1024});
 assert.equal(result.state,'complete');assert.equal(result.data[0].rows[1][0],value);assert.equal(result.data[0].rows[1][0].includes('\ufffd'),false);
});
test('XLSX preserves string and numeric source values and declares formula/empty/style limitations',async t=>{
 const f=await fixture(t),{result}=await inspect(f,'synthetic.xlsx',syntheticXlsx());assert.equal(result.state,'complete');assert.equal(result.data[0].rows[0][0],' ID ');assert.equal(result.data[0].rows[1][0],'00123');assert.equal(result.data[0].rows[1][1].raw,'9007199254740993');assert.equal(result.data[0].rows[2][1].raw,'0.10000000000000001');assert.match(result.limitations.join(' '),/not executed or recalculated/);
});
test('file inspection boundaries remain partial, empty files are real bytes and byte comparison is independent of filenames',async t=>{
 const f=await fixture(t),empty=await inspect(f,'empty.bin',Buffer.alloc(0),{format:'bytes'});assert.equal(empty.result.file.bytes,0);assert.equal(empty.result.state,'complete');
 const limited=await inspect(f,'limited.csv','a,b,c\n1,2,3\n',{maxCells:2});assert.equal(limited.result.state,'partial');assert.equal(limited.result.data[0].rows[0].length,2);
 const bytes=await inspect(f,'other.bin','abc',{format:'bytes',compareFile:empty.file});assert.equal(bytes.result.comparison.sameBytes,false);
 const oversized=await inspect(f,'large.txt','abcdef',{maxBytes:2});assert.equal(oversized.result.state,'partial');assert.equal(oversized.result.file.sha256,null);
 const invalid=await inspect(f,'invalid.txt',Buffer.from([255]),{format:'text'});assert.equal(invalid.result.state,'failed');
 await assert.rejects(inspectFile({request:{schemaVersion:9,file:empty.file},outputFile:empty.file}),/overwrite/);
});
