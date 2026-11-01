/** Bounded child-process reader. It evaluates no file content, macro or business expectation. */
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export interface InspectionRequest {schemaVersion:9;file:string;format:'auto'|'bytes'|'text'|'json'|'csv'|'xlsx';maxBytes:number;maxOutputBytes:number;maxCells:number;timeoutMs:number;offset:number;rowStart:number;rowLimit:number;sheet:string|null;jsonPath:string[];delimiter:string;compareFile:string|null}
interface ReaderModule {readCsv(text:string,delimiter:string):unknown[][];readXlsx(bytes:Buffer):Promise<unknown>}
const digest=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
async function bytesOf(file:string,maxBytes:number){file=path.resolve(file);let cursor=path.parse(file).root;for(const part of file.slice(cursor.length).split(path.sep).filter(Boolean)){cursor=path.join(cursor,part);if((await fs.lstat(cursor)).isSymbolicLink())throw Error('Symlink input is not a regular file.');}const handle=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));try{const before=await handle.stat();if(!before.isFile())throw Error('Input is not a regular file.');if(before.size>maxBytes)return{bytes:null,stat:before};const bytes=await handle.readFile(),after=await handle.stat();if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||bytes.length!==before.size)throw Error('FILE_CHANGED: input changed while reading.');return{bytes,stat:after};}finally{await handle.close();}}
function safeText(b:Buffer){return new TextDecoder('utf-8',{fatal:true}).decode(b);}
function textWindow(bytes:Buffer,offset:number,budget:number){let start=Math.min(offset,bytes.length),end=Math.min(start+budget,bytes.length);while(start<bytes.length&&(bytes[start]!&0xc0)===0x80)start++;while(end>start&&end<bytes.length&&(bytes[end]!&0xc0)===0x80)end--;return{offset:start,bytes:end-start,totalBytes:bytes.length,text:safeText(bytes.subarray(start,end)),hasMore:end<bytes.length};}
function normalize(value:unknown):unknown {if(value instanceof Date)return{kind:'date',iso:value.toISOString()};if(Array.isArray(value))return value.map(normalize);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v)]));return value;}
export async function inspectInWorker(request:InspectionRequest):Promise<Record<string,unknown>> {
 const read=await bytesOf(request.file,request.maxBytes),limits={maxBytes:request.maxBytes,maxOutputBytes:request.maxOutputBytes,maxCells:request.maxCells,timeoutMs:request.timeoutMs};
 const result:Record<string,unknown>={schemaVersion:9,kind:'file_inspection',file:{path:request.file,bytes:read.stat.size,sha256:read.bytes?digest(read.bytes):null},format:request.format,state:'complete',limits,limitations:[],scope:{}};
 if(!read.bytes){result.state='partial';result.limitations=['Input exceeds the requested file-byte budget; no content or hash was inferred.'];return result;}
 const bytes=read.bytes,extension=path.extname(request.file).toLowerCase(),format=request.format==='auto'?extension==='.json'?'json':extension==='.csv'?'csv':extension==='.xlsx'?'xlsx':['.txt','.md'].includes(extension)?'text':'bytes':request.format;result.format=format;
 if(request.compareFile){const other=await bytesOf(request.compareFile,request.maxBytes);result.comparison=other.bytes?{otherBytes:other.bytes.length,otherSha256:digest(other.bytes),sameBytes:bytes.equals(other.bytes)}:{otherBytes:other.stat.size,otherSha256:null,sameBytes:null};if(!other.bytes){result.state='partial';(result.limitations as string[]).push('Comparison file exceeds budget; byte equality is unknown.');}}
 if(format==='bytes')return result;
 if(format==='text'){const window=textWindow(bytes,request.offset,Math.max(64,Math.floor(request.maxOutputBytes/2)));result.data=window.text;result.scope={offset:window.offset,bytes:window.bytes,totalBytes:window.totalBytes};if(window.offset>0||window.hasMore){result.state='partial';(result.limitations as string[]).push('Only the explicit UTF-8 text window is represented.');}return result;}
 if(format==='json'){
  const text=safeText(bytes);let approximate=false;
  const parseWithSource=JSON.parse as (text:string,reviver:(key:string,value:unknown,context?:{source?:string})=>unknown)=>unknown;
  let data=parseWithSource(text,(_key,value,context)=>{if(typeof value==='number'){if(!context?.source)approximate=true;return{kind:'number',raw:context?.source??String(value),precision:context?.source?'source':'approximate'};}return value;});
  for(const key of request.jsonPath){if(data===null||typeof data!=='object'||!Object.hasOwn(data,key))throw Error('JSON_PATH_MISSING: requested property was not present.');data=(data as Record<string,unknown>)[key];}
  result.data=data;result.scope={jsonPath:request.jsonPath,rawTextWindow:textWindow(bytes,0,Math.min(65536,Math.floor(request.maxOutputBytes/4)))};if(approximate)(result.limitations as string[]).push('Runtime did not expose original numeric tokens; numbers may be approximate and cannot prove exact monetary/long-integer requirements.');return result;
 }
 const readers=await import(new URL('../vendor/file-readers.mjs',import.meta.url).href) as ReaderModule;
 const sheets:{sheet:string;data:unknown[][]}[]=format==='csv'?[{sheet:'CSV',data:readers.readCsv(safeText(bytes),request.delimiter)}]:await readers.readXlsx(bytes) as {sheet:string;data:unknown[][]}[];
 if(request.sheet&&!sheets.some(s=>s.sheet===request.sheet))throw Error('SHEET_NOT_FOUND: the requested worksheet is absent.');let remaining=request.maxCells,partial=false;
 result.data=sheets.filter(s=>request.sheet===null||s.sheet===request.sheet).map(s=>{const selected=s.data.slice(request.rowStart,request.rowStart+request.rowLimit),rows:unknown[][]=[];for(const row of selected){if(!remaining){partial=true;break;}rows.push(row.slice(0,remaining).map(normalize));if(row.length>remaining)partial=true;remaining=Math.max(0,remaining-row.length);}if(request.rowStart>0||request.rowStart+rows.length<s.data.length)partial=true;return{sheet:s.sheet,rowStart:request.rowStart,rows,totalRows:s.data.length,totalColumns:s.data.reduce((n,r)=>Math.max(n,r.length),0)};});
 result.scope={rowStart:request.rowStart,rowLimit:request.rowLimit,maximumCells:request.maxCells};if(partial){result.state='partial';(result.limitations as string[]).push('Rows/cells outside the returned window were not included; this is not complete business coverage.');}
 if(format==='xlsx')(result.limitations as string[]).push('Values only: formulas/macros are not executed or recalculated. Empty values can include missing formula caches/errors; trailing empty areas/styles are not fully represented.');
 return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let raw='';for await(const b of process.stdin){raw+=String(b);if(Buffer.byteLength(raw)>1024*1024)throw Error('Inspection request too large.');}
 try{const request=JSON.parse(raw) as InspectionRequest,result=await inspectInWorker(request);let encoded=JSON.stringify(result);if(Buffer.byteLength(encoded)>request.maxOutputBytes){const reduced={...result,state:'partial',data:null,scope:{omitted:'Parsed output exceeds the requested output-byte budget.'},limitations:[...(result.limitations as string[]),'Choose an explicit narrower view or larger authorized budget; parsed data was not silently truncated into a complete result.']};encoded=JSON.stringify(reduced);}process.stdout.write(encoded+'\n');}
 catch(error){process.stdout.write(JSON.stringify({schemaVersion:9,kind:'file_inspection',state:'failed',error:error instanceof Error?error.message:'Unknown inspection error',limitations:['Parser failure is a tool observation, not an automatic product or business verdict.']})+'\n');}
}
