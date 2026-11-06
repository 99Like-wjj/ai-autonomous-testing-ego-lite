import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { summarizeUsage,summarizeUsageFile } from '../src/diagnostics/usage.mjs';
import { fixture,writeJSON } from './goals-fixture.mjs';
import { conforms,loadSchemaDocuments,schema } from './schema-support.mjs';
import { SOURCE_ROOT } from '../src/scripts/toolchain.mjs';
import { objectValue } from './support.mjs';
const source={id:'synthetic-source',kind:'host_export',locator:'Synthetic source only',completeness:'complete',start:null,end:null};
const model={kind:'model',sourceId:source.id,responseId:'response-1',purpose:'model',inputTokens:100,cachedInputTokens:80,cacheWriteInputTokens:0,outputTokens:20,reasoningOutputTokens:10,totalTokens:120};
const tool={kind:'tool',sourceId:source.id,eventId:'tool-1',toolName:'synthetic_tool',durationMs:5,outputBytes:200,truncated:false};
const data=(records:unknown[])=>({usageVersion:1,sources:[source],records});
test('usage deduplicates requests without adding cached input or reasoning twice',()=>{
  const r=summarizeUsage(data([model,model,tool]));assert.equal(r.modelRequests,1);assert.equal(r.toolEvents,1);assert.equal(r.duplicateCount,1);
  assert.equal(r.tokens.totalTokens!.knownSum,120);assert.equal(r.tokens.inputTokens!.knownSum,100);assert.equal(r.noncachedInputTokens.knownSum,20);assert.equal(r.outputBytes.knownSum,200);
  assert.throws(()=>summarizeUsage(data([model,{...model,outputTokens:21,totalTokens:121}])),/CONFLICTING/);
});
test('missing metrics, tool-only exports and operator associations stay explicit',()=>{
  const missing=summarizeUsage(data([{kind:'model',sourceId:source.id,responseId:'missing'}]));assert.equal(missing.tokens.totalTokens!.knownSum,null);assert.equal(missing.tokens.totalTokens!.unknownCount,1);assert.equal(missing.tokens.totalTokens!.complete,false);
  const tools=summarizeUsage(data([tool]));assert.equal(tools.coverage.modelData,'not_supplied');assert.equal(tools.tokens.inputTokens!.knownSum,null);
  assert.throws(()=>summarizeUsage(data([{...model,attribution:{pointIds:['a']}}])),/REQUIRES_BASIS/);
});
test('overlapping point tags are non-additive; compaction has its own totals',()=>{
  const r=summarizeUsage(data([{...model,attribution:{pointIds:['p1','p2'],stage:'synthetic-stage',basis:'Explicit synthetic mapping'}},{...model,responseId:'compact',purpose:'compaction'}]),1);
  assert.equal(r.tokens.totalTokens!.knownSum,240);assert.equal(r.purposes.find(p=>p.purpose==='compaction')!.tokens.totalTokens!.knownSum,120);
  assert.equal(r.attribution.points.additive,false);assert.equal(r.attribution.points.total,2);assert.equal(r.attribution.points.truncated,true);
});
test('usage rejects malformed fields, unsafe arithmetic and declared-range violations',()=>{
  for(const bad of [{...model,inputTokens:-1},{...model,cachedInputTokens:101},{...model,reasoningOutputTokens:21},{...model,totalTokens:121},{...model,inputTokens:NaN},{...model,inputTokens:Number.MAX_SAFE_INTEGER+1},{...model,prompt:'must not be retained'},{...tool,responseId:'wrong'}])assert.throws(()=>summarizeUsage(data([bad])));
  assert.throws(()=>summarizeUsage(data([{...model,inputTokens:Number.MAX_SAFE_INTEGER,cachedInputTokens:0,outputTokens:null,totalTokens:null},{...model,responseId:'other',inputTokens:1,cachedInputTokens:0,outputTokens:null,totalTokens:null}])),/SAFE_INTEGER/);
  assert.throws(()=>summarizeUsage({...data([model]),sources:[source,source]}),/DUPLICATE/);
  assert.throws(()=>summarizeUsage({...data([{...model,timestamp:'2020-01-01T00:00:00Z'}]),sources:[{...source,start:'2021-01-01T00:00:00Z'}]}),/OUTSIDE/);
  assert.throws(()=>summarizeUsage(data([{...model,sourceId:'unknown'}])),/UNKNOWN_USAGE_SOURCE/);
});
test('input and output honor published contracts',async()=>{
  const docs=await loadSchemaDocuments(path.join(SOURCE_ROOT,'schemas'));
  for(const [name,v]of [['usage-input.schema.json',data([model,tool])],['usage-summary.schema.json',summarizeUsage(data([model,tool]))]] as const){const d=docs.get(name)!;assert.ok(conforms(v,schema(d),d,docs));}
});
test('usage reads only an explicit regular file, emits a small export receipt and refuses overwrites',async t=>{
  const f=await fixture(t),input=path.join(f.root,'usage.json'),out=path.join(f.root,'usage-summary.json');await writeJSON(input,data([model]));const before=await fs.readFile(input);
  const receipt=objectValue(await summarizeUsageFile({inputFile:input},out));assert.equal(receipt.businessExecuted,false);assert.equal(receipt.usageSummaryVersion,1);assert.deepEqual(await fs.readFile(input),before);
  const docs=await loadSchemaDocuments(path.join(SOURCE_ROOT,'schemas')),d=docs.get('usage-summary.schema.json')!;assert.ok(conforms(receipt,schema(d),d,docs));
  await assert.rejects(summarizeUsageFile({inputFile:input},out),/exist/i);await assert.rejects(summarizeUsageFile({inputFile:f.root}),/SIZE_LIMIT/);
  const huge=path.join(f.root,'too-large.json');await fs.writeFile(huge,'');await fs.truncate(huge,16*1024*1024+1);await assert.rejects(summarizeUsageFile({inputFile:huge}),/SIZE_LIMIT/);
});
