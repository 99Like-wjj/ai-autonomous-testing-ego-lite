import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {inspectKnowledge,queryKnowledge} from '../src/knowledge/commands.mjs';import {KnowledgeError,bytes,digest} from '../src/knowledge/contract.mjs';import type {Topic,Project,FeatureMap,Accounts,Source} from '../src/knowledge/contract.mjs';import {SOURCE_ROOT,TOOL_ROOT} from '../src/scripts/toolchain.mjs';
const exec=promisify(execFile),request={expectedProject:{id:'synthetic-project-a'},category:'rules'};
const code=(expected:string)=>(e:unknown)=>e instanceof KnowledgeError&&e.code===expected;
async function fixture(t:{after:(f:()=>Promise<void>)=>void}){const base=await fs.mkdtemp(path.join(os.tmpdir(),'ego-knowledge-synthetic-'));t.after(async()=>{assert.equal(path.dirname(base),path.resolve(os.tmpdir()));assert.ok(path.basename(base).startsWith('ego-knowledge-synthetic-'));await fs.rm(base,{recursive:true,force:true});});const root=path.join(base,'knowledge');await fs.cp(path.join(SOURCE_ROOT,'examples/knowledge.synthetic'),root,{recursive:true});return{base,root};}
const topic=async(root:string)=>JSON.parse(await fs.readFile(path.join(root,'rules/data-scope.json'),'utf8')) as Topic;
const write=(root:string,file:string,value:unknown)=>fs.writeFile(path.join(root,file),bytes(value));
test('the consumer pins the exact v3 producer contract and generated/external schemas',async()=>{
 const origin=JSON.parse(await fs.readFile(path.join(SOURCE_ROOT,'schemas/project-knowledge.origin.json'),'utf8'));assert.equal(origin.owner,'project-knowledge-maintainer');assert.equal(origin.knowledgeFormatVersion,3);assert.match(origin.sourceCommit,/^[a-f0-9]{40}$/);
 for(const [file,record]of Object.entries(origin.files) as [string,{sha256:string}][])assert.equal(digest(await fs.readFile(path.join(SOURCE_ROOT,file))),record.sha256);
});
test('no knowledge is optional and does not inspect a request or filesystem',async()=>{
 assert.equal((await inspectKnowledge()).availability,'not_configured');const input=new Proxy({},{get:()=>{throw new Error('must not inspect skipped input');}});
 const r=await queryKnowledge(undefined,input);assert.equal(r.availability,'not_configured');assert.deepEqual(r.items,[]);assert.equal(r.snapshotSha256,null);
});
test('module navigation, role and rule links read directly without loading account identifiers',async t=>{
 const f=await fixture(t),before=digest(await fs.readFile(path.join(f.root,'feature-map.json'))),inspect=await inspectKnowledge(f.root);assert.equal(inspect.selection.projectId,'synthetic-project-a');assert.equal(inspect.categorySummary.modules?.count,1);assert.equal(inspect.categorySummary.project?.count,1);
 const query=await queryKnowledge(f.root,{...request,category:'modules',query:'目录维护'});assert.equal(query.pagination.returnedCount,1);assert.equal(query.items[0]!.content,undefined);
 const result=await queryKnowledge(f.root,{...request,category:'modules',recordIds:['catalogue'],includeRelated:true,limit:50,maxBytes:100000},'read');
 for(const id of ['catalogue','owned-data','catalogue-maintainer'])assert.ok(result.items.some(i=>i.id===id));
 const m=result.items.find(i=>i.id==='catalogue')!.content as unknown as FeatureMap['modules'][number];assert.equal(m.entryPoints[0]!.page,'完全合成馆藏页');assert.equal(m.entryPoints[0]!.url,'https://console.example.invalid/catalogue');
 assert.ok(!result.usedFiles.some(f=>f.file==='project.json'||f.file==='accounts.json'));assert.ok(!JSON.stringify(result).includes('synthetic-user-a'));assert.equal(result.availability,'available');assert.equal(digest(await fs.readFile(path.join(f.root,'feature-map.json'))),before);
});
test('a map remains independently readable with no project/accounts files or registries',async t=>{
 const f=await fixture(t);await fs.unlink(path.join(f.root,'project.json'));await fs.unlink(path.join(f.root,'accounts.json'));
 const r=await queryKnowledge(f.root,{...request,category:'modules',recordIds:['catalogue'],includeRelated:true,limit:50,maxBytes:100000},'read');assert.equal(r.availability,'available');assert.equal(r.items.length,3);assert.equal(r.categorySummary.project?.presence,'not_present');assert.equal(r.categorySummary.accounts?.presence,'not_present');
 assert.equal((r.items.find(i=>i.id==='catalogue')!.content as FeatureMap['modules'][number]).entryPoints[0]!.application,'完全合成馆藏管理端');
});
test('multiple application/environment descriptions stay intact without the tool choosing a route',async t=>{
 const f=await fixture(t),m=JSON.parse(await fs.readFile(path.join(f.root,'feature-map.json'),'utf8')) as FeatureMap;
 const entry=structuredClone(m.modules[0]!.entryPoints[0]!);entry.id='other-entry';entry.application='另一个完全合成应用';entry.page='另一个合成页面';entry.url='https://other.example.invalid/catalogue';entry.appliesTo='另一测试环境，适用性需AI按本轮任务判断。';m.modules[0]!.entryPoints.push(entry);await write(f.root,'feature-map.json',m);
 const r=await queryKnowledge(f.root,{...request,category:'modules',recordIds:['catalogue']},'read'),body=r.items[0]!.content as FeatureMap['modules'][number];
 assert.equal(body.entryPoints.length,2);assert.deepEqual(body.entryPoints.map(e=>e.url),m.modules[0]!.entryPoints.map(e=>e.url));assert.ok(r.items[0]!.appliesTo?.includes(entry.appliesTo));
});
test('detailed role text, pending sections, retired statements and issues remain distinct',async t=>{
 const f=await fixture(t),data=await topic(f.root),role=data.entries.find(e=>e.kind==='role')!,original=role.statements[0]!;
 original.text+=' 完全合成的详细允许与禁止。'.repeat(100);
 role.statements.push({...structuredClone(original),id:'pending-permission',text:'完全合成的权限例外尚未确认。',meta:{...structuredClone(original.meta),state:'pending',sourceRefs:[]},issueIds:['permission-conflict']});
 role.statements.push({...structuredClone(original),id:'old-permission',text:'完全合成旧版本。',meta:{...structuredClone(original.meta),lifecycle:'retired'}});
 data.issues.push({id:'permission-conflict',type:'conflict',recordIds:['pending-permission'],summary:'完全合成待审例外。',sourceRefs:original.meta.sourceRefs,resolution:null});await write(f.root,'rules/data-scope.json',data);
 const r=await queryKnowledge(f.root,{...request,kinds:['role'],recordIds:[role.id],maxBytes:100000},'read'),item=r.items[0]!,body=item.content as unknown as typeof role;
 assert.equal(body.statements[0]!.text,original.text);assert.ok(item.states?.includes('pending'));assert.ok(item.states?.includes('confirmed'));assert.ok(item.lifecycles?.includes('retired'));assert.equal(item.issues.length,1);
 const precise=await queryKnowledge(f.root,{...request,recordIds:['pending-permission']},'read');assert.deepEqual(precise.items[0]!.states,['pending']);
});
test('account search uses only summaries/tags; precise reads preserve declarations without resolving credentials',async t=>{
 const f=await fixture(t),summary=await queryKnowledge(f.root,{...request,category:'accounts'}),raw=JSON.stringify(summary);
 assert.ok(!raw.includes('synthetic-user-a'));assert.ok(!raw.includes('synthetic-login-a'));assert.equal(summary.items[0]!.kind,'account');assert.ok(!('states'in summary.items[0]!));
 const scoped=await queryKnowledge(f.root,{...request,category:'accounts',query:'馆甲'});assert.equal(scoped.pagination.returnedCount,1);
 assert.equal((await queryKnowledge(f.root,{...request,category:'accounts',query:'synthetic-user-a'})).items.length,0);
 const full=await queryKnowledge(f.root,{...request,category:'accounts',recordIds:['test-account-a'],includeRelated:true},'read'),a=full.items[0]!.content as unknown as Accounts['items'][number];
 assert.equal(a.properties?.['登录标识'],'synthetic-user-a');assert.equal(a.properties?.['逻辑引用'],'synthetic-login-a');assert.match(full.caveat,/Credentials are never resolved/);assert.deepEqual(full.items[0]!.relatedIds,[]);assert.ok(!('ready'in a));assert.deepEqual(full.sources,[]);
});
test('minimal user records and reserved-looking custom attributes are opaque data, not knowledge metadata',async t=>{
 const f=await fixture(t),a:Accounts={items:[{id:'minimal',title:'完全合成最小账号'},{id:'opaque',title:'完全合成自定义账号',properties:{meta:{state:'confirmed'},sourceRefs:'free user text',roleId:'unregistered',nested:{id:'not-a-record'},values:[null,false,2]}}]},p:Project={items:[{id:'simple-project',title:'完全合成站点',properties:{入口:'https://example.invalid/',自定义配置:{选项:true}}}]};
 await write(f.root,'accounts.json',a);await write(f.root,'project.json',p);
 const result=await queryKnowledge(f.root,{...request,category:'accounts',recordIds:['opaque']},'read');assert.equal(result.availability,'available');assert.deepEqual(result.items[0]!.content,a.items[1]);assert.ok(!('states'in result.items[0]!));assert.deepEqual(result.sources,[]);assert.equal(result.categorySummary.accounts?.count,2);
 const pr=await queryKnowledge(f.root,{...request,category:'project',recordIds:['simple-project']},'read');assert.deepEqual(pr.items[0]!.content,p.items[0]);assert.equal(pr.categorySummary.project?.count,1);
});
test('missing/empty optional categories and damaged categories remain different',async t=>{
 const f=await fixture(t);await fs.unlink(path.join(f.root,'accounts.json'));const absent=await queryKnowledge(f.root,{...request,category:'accounts'});assert.equal(absent.availability,'available');assert.equal(absent.empty,true);assert.equal(absent.categorySummary.accounts?.presence,'not_present');
 await write(f.root,'accounts.json',{items:[]});const empty=await queryKnowledge(f.root,{...request,category:'accounts'});assert.equal(empty.availability,'available');assert.equal(empty.categorySummary.accounts?.presence,'empty');assert.deepEqual(empty.diagnostics,[]);
 await fs.writeFile(path.join(f.root,'accounts.json'),'{broken');const bad=await queryKnowledge(f.root,{...request,category:'accounts'});assert.equal(bad.availability,'unavailable');assert.ok(bad.diagnostics.some(d=>d.code==='INVALID_JSON'));
 const good=await queryKnowledge(f.root,request);assert.equal(good.availability,'available');assert.equal(good.pagination.returnedCount,2);assert.ok(!good.usedFiles.some(f=>f.file==='accounts.json'));assert.equal((await inspectKnowledge(f.root)).availability,'partial');
});
test('bad references stay attached to affected records while independent content is returned',async t=>{
 const f=await fixture(t),data=await topic(f.root);data.entries[0]!.statements[0]!.relations=[{type:'requires',targetId:'missing-role'}];await write(f.root,'rules/data-scope.json',data);
 const r=await queryKnowledge(f.root,request);assert.equal(r.availability,'partial');assert.equal(r.pagination.returnedCount,2);assert.ok(r.diagnostics.some(d=>d.code==='BROKEN_RELATION'));
 const missing=await queryKnowledge(f.root,{...request,recordIds:['unknown-record']});assert.equal(missing.items.length,0);assert.ok(missing.diagnostics.some(d=>d.code==='MISSING_RECORD'));
});
test('old formats, missing roots, pending writes and wrong identities yield no business content',async t=>{
 const f=await fixture(t),header=JSON.parse(await fs.readFile(path.join(f.root,'knowledge.json'),'utf8'));
 const wrong=await queryKnowledge(f.root,{...request,expectedProject:{id:'another-project'}});assert.equal(wrong.availability,'unavailable');assert.equal(wrong.selection.identityCheck,'mismatch');assert.deepEqual(wrong.items,[]);
 assert.equal((await inspectKnowledge(path.join(f.base,'absent'))).availability,'unavailable');
 for(const version of [1,2]){header.knowledgeFormatVersion=version;await write(f.root,'knowledge.json',header);const old=await inspectKnowledge(f.root);assert.equal(old.availability,'unavailable');assert.equal(old.diagnostics[0]!.code,'UNSUPPORTED_KNOWLEDGE_FORMAT');}
 header.knowledgeFormatVersion=3;await write(f.root,'knowledge.json',header);await fs.writeFile(path.join(f.root,'.knowledge-pending.json'),'{}');const pending=await queryKnowledge(f.root,request);assert.equal(pending.availability,'unavailable');assert.equal(pending.diagnostics[0]!.code,'KNOWLEDGE_WRITE_PENDING');
});
test('unsafe typed URLs and secret-like configuration values are never returned as normal context',async t=>{
 const f=await fixture(t),m=JSON.parse(await fs.readFile(path.join(f.root,'feature-map.json'),'utf8')) as FeatureMap;m.modules[0]!.entryPoints[0]!.url='https://example.invalid/?code=synthetic';await write(f.root,'feature-map.json',m);
 const maps=await queryKnowledge(f.root,{...request,category:'modules'});assert.equal(maps.availability,'unavailable');assert.ok(maps.diagnostics.some(d=>d.code==='AUTHENTICATION_IN_URL'));
 const a:Accounts={items:[{id:'bad-secret',title:'Completely synthetic',properties:{value:'Bearer '+'x'.repeat(32)}}]};await write(f.root,'accounts.json',a);const secret=await queryKnowledge(f.root,request);assert.equal(secret.availability,'unavailable');assert.equal(secret.diagnostics[0]!.code,'POSSIBLE_CREDENTIAL');assert.ok(!JSON.stringify(secret).includes('x'.repeat(32)));
});
test('caller mistakes and removed foreign-key filters are invocation errors',async t=>{
 const f=await fixture(t);await assert.rejects(queryKnowledge(f.root,{category:'unknown'}),code('INVALID_CATEGORY'));await assert.rejects(queryKnowledge(f.root,{...request,limit:0}),code('INVALID_QUERY_LIMIT'));await assert.rejects(queryKnowledge(f.root,{...request,expectedProject:{}}),code('INVALID_PROJECT_EXPECTATION'));
 for(const [key,value]of Object.entries({environmentId:'unused',applicationIds:['unused'],scopeIds:['unused'],roleIds:['unused']}))await assert.rejects(queryKnowledge(f.root,{...request,[key]:value}),code('INVALID_FIELDS'));
});
test('historical checks and attached issues include exact source records and hashes in full module reads',async t=>{
 const f=await fixture(t),m=JSON.parse(await fs.readFile(path.join(f.root,'feature-map.json'),'utf8')) as FeatureMap,source=JSON.parse(await fs.readFile(path.join(f.root,'sources/manual-v1.json'),'utf8')) as Source;
 source.id='map-observation';source.kind='observation';await write(f.root,'sources/map-observation.json',source);
 m.checks.push({id:'catalogue-check',targetId:'catalogue',actorNote:'完全合成观察身份，实际账号未登记。',outcome:'verified',coverage:'仅模块入口',observedAt:null,description:'完全合成历史页面入口观察。',sourceRefs:[{sourceId:source.id,locator:'Synthetic observation'}],limitations:['精确时间未知，不表示当前业务通过。']});await write(f.root,'feature-map.json',m);
 const r=await queryKnowledge(f.root,{...request,category:'modules',recordIds:['catalogue'],maxBytes:100000},'read');assert.ok(r.sources.some(v=>v.id===source.id));assert.ok(r.usedFiles.some(v=>v.file==='sources/map-observation.json'));assert.equal((r.items[0]!.content as FeatureMap).checks.length,1);assert.ok(r.items[0]!.sourceRefs.some(v=>v.sourceId===source.id));
});
test('pagination and total output budget cover prose, source records and diagnostics',async t=>{
 const f=await fixture(t),data=await topic(f.root),original=data.entries[0]!;
 for(let i=0;i<10;i++){const e=structuredClone(original);e.id='long-rule-'+i;e.title='完全合成长规则'+i;e.statements[0]!.id='long-statement-'+i;e.statements[0]!.text='完全合成长业务描述。'.repeat(160);data.entries.push(e);}await write(f.root,'rules/data-scope.json',data);
 const small=await queryKnowledge(f.root,{...request,limit:50,maxBytes:4096},'read');assert.ok(Buffer.byteLength(bytes(small))<=4096);assert.equal(small.pagination.truncated,true);assert.ok(small.pagination.omitted.length);assert.equal(small.pagination.omitted[0]!.reason,'output_budget');
 const full=await queryKnowledge(f.root,{...request,limit:50,maxBytes:200000},'read');assert.equal(full.pagination.returnedCount,12);assert.equal(full.pagination.truncated,false);
 const page=await queryKnowledge(f.root,{...request,offset:1,limit:1});assert.equal(page.pagination.returnedCount,1);assert.equal(page.pagination.offset,1);assert.equal(page.pagination.nextOffset,2);
});
test('natural-language applicability is retained; omitted applicability is not promoted or made a blocker',async t=>{
 const f=await fixture(t),data=await topic(f.root);delete data.entries[0]!.statements[0]!.appliesTo;await write(f.root,'rules/data-scope.json',data);
 const r=await queryKnowledge(f.root,{...request,recordIds:['owned-data']});assert.equal(r.availability,'available');assert.deepEqual(r.items[0]!.appliesTo,[]);assert.deepEqual(r.diagnostics,[]);assert.match(r.caveat,/Unspecified applicability does not mean global scope/);
 const role=await queryKnowledge(f.root,{...request,kinds:['role']});assert.match(role.items[0]!.appliesTo![0]!,/软件版本未知/);
});
test('Git draft selection and pinned reads cover v3 files without changing the checkout',async t=>{
 const f=await fixture(t),git=(...a:string[])=>exec('git',['-C',f.base,...a],{windowsHide:true});await git('init');await git('config','user.email','synthetic@example.invalid');await git('config','user.name','Synthetic Fixture');await git('add','knowledge');await git('commit','-m','Completely synthetic v3 base');const commit=(await git('rev-parse','HEAD')).stdout.trim();
 const data=await topic(f.root);data.entries[0]!.statements[0]!.text='完全合成的本地未提交草案。';const file=path.join(f.root,'rules/data-scope.json');await write(f.root,'rules/data-scope.json',data);const before=digest(await fs.readFile(file));
 const blocked=await queryKnowledge(f.root,request);assert.equal(blocked.availability,'unavailable');assert.equal(blocked.diagnostics[0]!.code,'DRAFT_OR_MERGE_REQUIRES_EXPLICIT_SELECTION');
 const fixed=await queryKnowledge(f.root,{...request,commit}),draft=await queryKnowledge(f.root,{...request,allowDraft:true});assert.equal(fixed.version!.mode,'commit');assert.equal(draft.version!.draft,true);assert.notEqual(fixed.snapshotSha256,draft.snapshotSha256);assert.equal(digest(await fs.readFile(file)),before);
});
test('CLI skips absent knowledge, exports an immutable v9 SourceRef and never exports unavailable context',async t=>{
 const f=await fixture(t),cli=path.join(TOOL_ROOT,'scripts/ego.mjs'),input=path.join(f.base,'request.json'),output=path.join(f.base,'context.json');await fs.writeFile(input,bytes(request));
 const skipped=JSON.parse((await exec(process.execPath,[cli,'knowledge','read'],{windowsHide:true})).stdout);assert.equal(skipped.availability,'not_configured');
 const receipt=JSON.parse((await exec(process.execPath,[cli,'knowledge','read','--knowledge-root',f.root,'--request',input,'--output-file',output],{windowsHide:true})).stdout);assert.equal(receipt.knowledgeReadVersion,3);assert.equal(receipt.sourceRef.sha256,digest(await fs.readFile(output)));
 const forbidden=path.join(f.root,'rules/export.json');await assert.rejects(exec(process.execPath,[cli,'knowledge','read','--knowledge-root',f.root,'--request',input,'--output-file',forbidden],{windowsHide:true}));await assert.rejects(fs.stat(forbidden));
 await fs.writeFile(input,bytes({...request,expectedProject:{id:'wrong-project'}}));const absentOut=path.join(f.base,'must-not-exist.json');const unavailable=JSON.parse((await exec(process.execPath,[cli,'knowledge','read','--knowledge-root',f.root,'--request',input,'--output-file',absentOut],{windowsHide:true})).stdout);assert.equal(unavailable.availability,'unavailable');await assert.rejects(fs.stat(absentOut));
});
