/** Explicit, local usage exports only. No model, billing API, log discovery or business decisions. */
import fs from 'node:fs/promises';
import { assertClosed, canonical, fail, hash, json, safePath, validTimestamp, writeNew } from '../core/common.mjs';
const metrics=['inputTokens','cachedInputTokens','cacheWriteInputTokens','outputTokens','reasoningOutputTokens','totalTokens'] as const;
type Metric=typeof metrics[number];
type NullableMetrics=Record<Metric,number|null>;
interface Source{id:string;kind:'host_export'|'provider_export'|'operator_normalized';locator:string;sha256:string|null;completeness:'complete'|'partial'|'unknown';start:string|null;end:string|null}
interface Attribution{runId:string|null;pointIds:string[];stage:string|null;operationId:string|null;basis:string|null}
interface ModelRecord extends NullableMetrics{kind:'model';sourceId:string;responseId:string;timestamp:string|null;purpose:'model'|'compaction'|'unknown';attribution:Attribution}
interface ToolRecord{kind:'tool';sourceId:string;eventId:string;timestamp:string|null;toolName:string;durationMs:number|null;outputBytes:number|null;truncated:boolean|null;attribution:Attribution}
type UsageRecord=ModelRecord|ToolRecord;
function text(value:unknown,max=300):string{if(typeof value!=='string'||!value.trim()||value.length>max||value.includes('\0'))fail('INVALID_USAGE_TEXT');return value;}
function integer(value:unknown):number|null{if(value===null||value===undefined)return null;if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)fail('INVALID_USAGE_INTEGER');return value;}
function time(value:unknown):string|null{if(value===null||value===undefined)return null;if(!validTimestamp(value))fail('INVALID_USAGE_TIMESTAMP');return value;}
const maybeText=(v:unknown)=>v===null||v===undefined?null:text(v);
function attribution(value:unknown):Attribution{
  const v=value??{};assertClosed(v,['runId','pointIds','stage','operationId','basis'],'usage attribution');
  const raw=v.pointIds??[];if(!Array.isArray(raw)||raw.length>100||raw.some(x=>typeof x!=='string'))fail('INVALID_USAGE_POINT_IDS');
  const a={runId:maybeText(v.runId),pointIds:[...new Set(raw.map(x=>text(x,128)))].sort(),stage:maybeText(v.stage),operationId:maybeText(v.operationId),basis:maybeText(v.basis)};
  if((a.runId||a.pointIds.length||a.stage||a.operationId)&&!a.basis)fail('USAGE_ATTRIBUTION_REQUIRES_BASIS');return a;
}
function source(value:unknown):Source{
  assertClosed(value,['id','kind','locator','sha256','completeness','start','end'],'usage source');
  const id=text(value.id,128),kind=text(value.kind),completeness=text(value.completeness);
  if(!['host_export','provider_export','operator_normalized'].includes(kind)||!['complete','partial','unknown'].includes(completeness))fail('INVALID_USAGE_SOURCE');
  const sha256=maybeText(value.sha256);if(sha256!==null&&!/^[a-f0-9]{64}$/.test(sha256))fail('INVALID_USAGE_SOURCE_HASH');
  const start=time(value.start),end=time(value.end);if(start&&end&&Date.parse(start)>Date.parse(end))fail('INVALID_USAGE_RANGE');
  return{id,kind:kind as Source['kind'],locator:text(value.locator,1000),sha256,completeness:completeness as Source['completeness'],start,end};
}
function record(value:unknown,sources:Map<string,Source>):UsageRecord{
  assertClosed(value,['kind','sourceId','responseId','eventId','timestamp','purpose','attribution','toolName','durationMs','outputBytes','truncated',...metrics],'usage record');
  const sourceId=text(value.sourceId,128),s=sources.get(sourceId);if(!s)fail('UNKNOWN_USAGE_SOURCE');
  const timestamp=time(value.timestamp);if(timestamp&&(s.start&&Date.parse(timestamp)<Date.parse(s.start)||s.end&&Date.parse(timestamp)>Date.parse(s.end)))fail('USAGE_OUTSIDE_DECLARED_RANGE');
  const a=attribution(value.attribution);
  if(value.kind==='model'){
    if(['eventId','toolName','durationMs','outputBytes','truncated'].some(k=>value[k]!==undefined))fail('INVALID_MODEL_USAGE_FIELDS');
    const purpose=value.purpose??'unknown';if(!['model','compaction','unknown'].includes(String(purpose)))fail('INVALID_USAGE_PURPOSE');
    const m=Object.fromEntries(metrics.map(k=>[k,integer(value[k])])) as NullableMetrics;
    for(const [child,parent]of [['cachedInputTokens','inputTokens'],['cacheWriteInputTokens','inputTokens'],['reasoningOutputTokens','outputTokens']] as const)if(m[child]!==null&&m[parent]!==null&&m[child]!>m[parent]!)fail('INVALID_USAGE_SUBTOTAL');
    if(m.inputTokens!==null&&m.outputTokens!==null&&m.totalTokens!==null&&safeAdd(m.inputTokens,m.outputTokens)!==m.totalTokens)fail('INVALID_USAGE_TOTAL');
    return{kind:'model',sourceId,responseId:text(value.responseId,200),timestamp,purpose:purpose as ModelRecord['purpose'],attribution:a,...m};
  }
  if(value.kind!=='tool'||['responseId','purpose',...metrics].some(k=>value[k]!==undefined))fail('INVALID_TOOL_USAGE_FIELDS');
  const truncated=value.truncated??null;if(truncated!==null&&typeof truncated!=='boolean')fail('INVALID_USAGE_TRUNCATION');
  return{kind:'tool',sourceId,eventId:text(value.eventId,200),timestamp,toolName:text(value.toolName),durationMs:integer(value.durationMs),outputBytes:integer(value.outputBytes),truncated:truncated as boolean|null,attribution:a};
}
function safeAdd(a:number,b:number){const n=a+b;if(!Number.isSafeInteger(n))fail('USAGE_SUM_EXCEEDS_SAFE_INTEGER');return n;}
function aggregate(values:(number|null)[]){let knownSum=0,knownCount=0;for(const v of values)if(v!==null){knownSum=safeAdd(knownSum,v);knownCount++;}return{knownSum:knownCount?knownSum:null,knownCount,unknownCount:values.length-knownCount,complete:values.length>0&&knownCount===values.length};}
function totals(records:readonly UsageRecord[]){
  const models=records.filter((r):r is ModelRecord=>r.kind==='model'),tools=records.filter((r):r is ToolRecord=>r.kind==='tool');
  return{modelRequests:models.length,toolEvents:tools.length,tokens:Object.fromEntries(metrics.map(k=>[k,aggregate(models.map(m=>m[k]))])),noncachedInputTokens:aggregate(models.map(m=>m.inputTokens===null||m.cachedInputTokens===null?null:m.inputTokens-m.cachedInputTokens)),durationMs:aggregate(tools.map(t=>t.durationMs)),outputBytes:aggregate(tools.map(t=>t.outputBytes)),truncated:aggregate(tools.map(t=>t.truncated===null?null:Number(t.truncated)))};
}
export function summarizeUsage(input:unknown,groupLimit=20){
  assertClosed(input,['usageVersion','sources','records'],'usage export');if(input.usageVersion!==1)fail('UNSUPPORTED_USAGE_VERSION');
  if(!Number.isSafeInteger(groupLimit)||groupLimit<1||groupLimit>100)fail('INVALID_USAGE_GROUP_LIMIT');
  if(!Array.isArray(input.sources)||input.sources.length>1000||!Array.isArray(input.records)||input.records.length>100000)fail('USAGE_SIZE_LIMIT');
  const sources=input.sources.map(source),sourceMap=new Map(sources.map(s=>[s.id,s]));if(sourceMap.size!==sources.length)fail('DUPLICATE_USAGE_SOURCE');
  const unique=new Map<string,UsageRecord>();let duplicateCount=0;
  for(const raw of input.records){const r=record(raw,sourceMap),key=canonical([r.kind,r.sourceId,r.kind==='model'?r.responseId:r.eventId]),prior=unique.get(key);if(prior){if(canonical(prior)!==canonical(r))fail('CONFLICTING_USAGE_RECORD');duplicateCount++;}else unique.set(key,r);}
  const records=[...unique.values()],models=records.filter((r):r is ModelRecord=>r.kind==='model'),inputs=models.flatMap(m=>m.inputTokens===null?[]:[m.inputTokens]).sort((a,b)=>a-b);
  const groups=(key:'stage'|'point')=>{
    const entries=new Map<string,UsageRecord[]>();for(const r of records){const keys=key==='stage'?(r.attribution.stage?[r.attribution.stage]:[]):r.attribution.pointIds;for(const id of keys){const group=entries.get(id)??[];group.push(r);entries.set(id,group);}}
    return{additive:false,total:entries.size,truncated:entries.size>groupLimit,items:[...entries].sort(([a],[b])=>a.localeCompare(b)).slice(0,groupLimit).map(([id,rr])=>({id,...totals(rr)}))};
  };
  const inputTotal=aggregate(inputs);
  return{
    usageSummaryVersion:1 as const,sources:{total:sources.length,truncated:sources.length>groupLimit,items:sources.slice(0,groupLimit)},
    duplicateCount,...totals(records),
    inputDistribution:{knownCount:inputs.length,unknownCount:models.length-inputs.length,mean:inputTotal.knownSum===null?null:inputTotal.knownSum/inputs.length,median:inputs.length?(inputs[Math.floor((inputs.length-1)/2)]!+inputs[Math.floor(inputs.length/2)]!)/2:null,p90:inputs.length?inputs[Math.floor(.9*(inputs.length-1))]!:null,max:inputs.at(-1)??null},
    purposes:['model','compaction','unknown'].map(purpose=>({purpose,...totals(models.filter(m=>m.purpose===purpose))})),
    attribution:{unattributed:records.filter(r=>!r.attribution.runId&&!r.attribution.pointIds.length&&!r.attribution.stage&&!r.attribution.operationId).length,stages:groups('stage'),points:groups('point')},
    limitations:['Source labels and associations are caller declarations, not authentication or causal cost attribution. Cached input and reasoning output are subsets, never added again. Missing metrics are unknown, not zero. No pricing or billing conclusion. Group totals overlap and must not be added.'],
    coverage:{sourceComplete:sources.length>0&&sources.every(s=>s.completeness==='complete'),modelData:models.length?'supplied':'not_supplied',toolData:records.some(r=>r.kind==='tool')?'supplied':'not_supplied'}
  };
}
export async function summarizeUsageFile(request:unknown,outputFile?:string){
  assertClosed(request,['inputFile','groupLimit'],'usage request');
  const file=await safePath(request.inputFile,{existing:true}),stat=await fs.lstat(file);
  if(!stat.isFile()||stat.size>16*1024*1024)fail('USAGE_SIZE_LIMIT');
  const bytes=await fs.readFile(file);if(bytes.length>16*1024*1024||!Buffer.from(bytes.toString('utf8'),'utf8').equals(bytes))fail('INVALID_USAGE_FILE');
  let input:unknown;try{input=JSON.parse(bytes.toString('utf8'));}catch{fail('INVALID_USAGE_JSON');}
  const limit=request.groupLimit===undefined?20:request.groupLimit;if(typeof limit!=='number')fail('INVALID_USAGE_GROUP_LIMIT');
  const result={...summarizeUsage(input,limit),input:{file,sha256:hash(bytes),bytes:bytes.length}};
  if(!outputFile)return result;
  const output=await safePath(outputFile,{external:true}),data=json(result);await writeNew(output,data);
  return{usageSummaryVersion:1,outputFile:output,sha256:hash(data),bytes:Buffer.byteLength(data),input:result.input,businessExecuted:false};
}
