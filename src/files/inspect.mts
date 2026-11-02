import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assertClosed,fail,hash,json,safePath,writeNew} from '../core/common.mjs';
import {integer,oneOf,textValue,strings} from '../core/validation.mjs';
import type {InspectionRequest} from './inspect-worker.mjs';
export function parseInspectionRequest(value:unknown):InspectionRequest {
 assertClosed(value,['schemaVersion','file','format','maxBytes','maxOutputBytes','maxCells','timeoutMs','offset','rowStart','rowLimit','sheet','jsonPath','delimiter','compareFile'],'inspection request');if(value.schemaVersion!==9)fail('Inspection requires schemaVersion 9.');
 const positive=(v:unknown,fallback:number,label:string)=>v===undefined?fallback:integer(v,label,1),nonnegative=(v:unknown,fallback:number,label:string)=>v===undefined?fallback:integer(v,label);
 const file=textValue(value.file,'inspection file');if(!path.isAbsolute(file))fail('Inspection file must be absolute.');const delimiter=value.delimiter===undefined?',':textValue(value.delimiter,'CSV delimiter');if([...delimiter].length!==1)fail('CSV delimiter must be one character.');
 const jsonPath=value.jsonPath===undefined?[]:strings(value.jsonPath,'JSON path');
 if(value.jsonPath!==undefined&&!Array.isArray(value.jsonPath))fail('JSON path must be an array of literal property names.');
 const compareFile=value.compareFile===undefined||value.compareFile===null?null:textValue(value.compareFile,'comparison file');if(compareFile&&!path.isAbsolute(compareFile))fail('Comparison path must be absolute.');
 return{schemaVersion:9,file,format:value.format===undefined?'auto':oneOf(value.format,['auto','bytes','text','json','csv','xlsx'],'inspection format'),maxBytes:positive(value.maxBytes,32*1024*1024,'input byte budget'),maxOutputBytes:positive(value.maxOutputBytes,4*1024*1024,'output byte budget'),maxCells:positive(value.maxCells,100000,'cell budget'),timeoutMs:positive(value.timeoutMs,60000,'parser wait budget'),offset:nonnegative(value.offset,0,'text offset'),rowStart:nonnegative(value.rowStart,0,'row start'),rowLimit:positive(value.rowLimit,100000,'row limit'),sheet:value.sheet===undefined||value.sheet===null?null:textValue(value.sheet,'sheet'),jsonPath,delimiter,compareFile};
}
export async function inspectFile({request:input,outputFile}:{request:unknown;outputFile:unknown}) {
 const request=parseInspectionRequest(input),file=await safePath(request.file,{existing:true}),target=await safePath(outputFile,{external:true});if(path.resolve(file)===target)fail('Inspection cannot overwrite its source.');
 if(path.basename(process.execPath).toLowerCase()==='ego.exe')fail('Run files inspect with a standalone Node.js 22+ CLI after saving the download; this Ego script reports ego.exe as its executable and cannot be used as the bounded parser child.');
 let stdout='',stderr='',timedOut=false,overBudget=false;const child=spawn(process.execPath,['--max-old-space-size=256',fileURLToPath(new URL('./inspect-worker.mjs',import.meta.url))],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
 child.stdout.on('data',(part:string)=>{if(Buffer.byteLength(stdout)+Buffer.byteLength(part)>request.maxOutputBytes+65536){overBudget=true;child.kill();}else stdout+=part;});child.stderr.on('data',(part:string)=>{if(stderr.length<16384)stderr+=part.slice(0,16384-stderr.length);});
 const timer=setTimeout(()=>{timedOut=true;child.kill();},request.timeoutMs);child.stdin.end(JSON.stringify({...request,file}));let code:number|null;try{code=await new Promise<number|null>((resolve,reject)=>{child.once('close',resolve);child.once('error',reject);});}finally{clearTimeout(timer);}
 const result:Record<string,unknown>=timedOut||overBudget?{schemaVersion:9,kind:'file_inspection',state:'partial',file:{path:file},error:timedOut?'INSPECTION_TIMEOUT':'INSPECTION_OUTPUT_LIMIT',limitations:['The parser was stopped; this does not stop any browser download or prove a business failure.']}:code!==0?{schemaVersion:9,kind:'file_inspection',state:'failed',error:'INSPECTION_PROCESS_FAILED',detail:stderr,limitations:['No complete parsed result was obtained.']}:JSON.parse(stdout) as Record<string,unknown>;
 await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});const bytes=json(result);await writeNew(target,bytes);return{outputFile:target,sha256:hash(bytes),state:result.state,format:result.format??request.format,businessAssessment:'not_provided'};
}
