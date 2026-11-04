/** Optional, bounded v3 knowledge reading; AI interprets free configuration and business applicability. */
import path from 'node:path';
import {object,text,id,ids,strings,fail,bytes,metadata,sourceReferences,configurationUnit,KnowledgeError} from './contract.mjs';
import type {Category,Unit,Source,Diagnostic} from './contract.mjs';
import {loadKnowledge,safePath} from './store.mjs';
import type {Snapshot} from './store.mjs';

type Availability='not_configured'|'available'|'partial'|'unavailable';
interface Request{expectedProject?:{id?:string;name?:string};category:Category;query?:string;recordIds?:string[];kinds?:string[];moduleIds?:string[];domainIds?:string[];includeRelated?:boolean;maxDepth?:number;offset?:number;limit?:number;maxBytes?:number;allowDraft?:boolean;commit?:string}
export interface KnowledgeItem{id:string;category:Category|'sources';kind:string;title:string;summary:string;tags:string[];states?:string[];lifecycles?:string[];appliesTo?:string[];locator:{file:string;recordId:string;parentId:string|null};relatedIds:string[];sourceRefs:{sourceId:string;locator:string}[];issues:unknown[];diagnostics:Diagnostic[];content?:unknown}
export interface KnowledgeResult{
 knowledgeReadVersion:3;availability:Availability;empty:boolean;
 selection:{root:string|null;projectId:string|null;projectName:string|null;knowledgeId:string|null;identityCheck:'matched_id'|'matched_name'|'not_checked'|'mismatch'};
 version:Snapshot['version']|null;snapshotSha256:string|null;usedFiles:{file:string;sha256:string}[];
 categorySummary:Record<string,{presence:'not_present'|'empty'|'present'|'invalid';count:number}>;
 items:KnowledgeItem[];sources:Source[];diagnostics:Diagnostic[];diagnosticCount:number;diagnosticsTruncated:boolean;
 pagination:{offset:number;limit:number;returnedCount:number;nextOffset:number|null;truncated:boolean;omitted:{id:string;reason:string}[]};
 caveat:string;
}
const categories=['project','modules','rules','accounts'] as const;
const caveat='Optional project context. Rules, user-declared configuration and historical checks are distinct from current verification. Unspecified applicability does not mean global scope. Credentials are never resolved; remote freshness is unknown.';
function number(v:unknown,fallback:number,min:number,max:number){if(v===undefined)return fallback;if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max)fail('INVALID_QUERY_LIMIT');return v;}
function request(input:unknown):Request{
 const r=object(input,['expectedProject','category','query','recordIds','kinds','moduleIds','domainIds','includeRelated','maxDepth','offset','limit','maxBytes','allowDraft','commit'],['category']);
 if(!categories.includes(r.category as Category))fail('INVALID_CATEGORY');
 if(r.expectedProject!==undefined){const p=object(r.expectedProject,['id','name'],[]);if(!p.id&&!p.name)fail('INVALID_PROJECT_EXPECTATION');if(p.id!==undefined)id(p.id);if(p.name!==undefined)text(p.name);}
 for(const key of ['recordIds','moduleIds','domainIds'])if(r[key]!==undefined)ids(r[key]);
 if(r.kinds!==undefined)strings(r.kinds);if(r.query!==undefined)text(r.query);if(r.commit!==undefined){const commit=text(r.commit);if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit))fail('FULL_COMMIT_REQUIRED');}
 for(const key of ['includeRelated','allowDraft'])if(r[key]!==undefined&&typeof r[key]!=='boolean')fail('INVALID_QUERY_OPTION');
 number(r.offset,0,0,100000);number(r.limit,10,1,50);number(r.maxBytes,24000,2048,200000);number(r.maxDepth,1,0,5);return r as unknown as Request;
}
function base(root:string|null,availability:Availability,r?:Request):KnowledgeResult{return{knowledgeReadVersion:3,availability,empty:true,selection:{root,projectId:null,projectName:null,knowledgeId:null,identityCheck:'not_checked'},version:null,snapshotSha256:null,usedFiles:[],categorySummary:{},items:[],sources:[],diagnostics:[],diagnosticCount:0,diagnosticsTruncated:false,pagination:{offset:r?.offset??0,limit:r?.limit??10,returnedCount:0,nextOffset:null,truncated:false,omitted:[]},caveat};}
function unavailable(root:string,r:Request|undefined,error:unknown):KnowledgeResult{
 const result=base(root,'unavailable',r);const code=error instanceof KnowledgeError?error.code:error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT'?'KNOWLEDGE_NOT_FOUND':'KNOWLEDGE_READ_FAILED';
 result.diagnostics=[{code,file:'',affectedIds:[]}];result.diagnosticCount=1;if(code==='PROJECT_MISMATCH')result.selection.identityCheck='mismatch';return result;
}
const categoryFile=(file:string,category:Category)=>category==='rules'?file.startsWith('rules/'):file===({project:'project.json',modules:'feature-map.json',accounts:'accounts.json'} as Partial<Record<Category,string>>)[category];
function summaries(s:Snapshot){return Object.fromEntries(categories.map(category=>{const count=s.units.filter(u=>u.category===category&&u.queryable).length,invalid=s.diagnostics.some(d=>categoryFile(d.file,category));return[category,{presence:!s.presence[category]?'not_present':invalid&&!count?'invalid':count?'present':'empty',count}];})) as KnowledgeResult['categorySummary'];}
function selection(result:KnowledgeResult,s:Snapshot,r?:Request){
 result.selection.projectId=s.header.projectId;result.selection.projectName=s.header.projectName;result.selection.knowledgeId=s.header.knowledgeId;
 const p=r?.expectedProject;if(p?.id){if(p.id!==s.header.projectId)fail('PROJECT_MISMATCH');result.selection.identityCheck='matched_id';if(p.name&&p.name!==s.header.projectName)result.diagnostics.push({code:'PROJECT_NAME_DIFFERS',file:'knowledge.json',affectedIds:[]});}
 else if(p?.name){if(p.name!==s.header.projectName)fail('PROJECT_MISMATCH');result.selection.identityCheck='matched_name';}
 result.version=s.version;result.snapshotSha256=s.snapshotSha256;result.categorySummary=summaries(s);
}
export async function inspectKnowledge(root?:string):Promise<KnowledgeResult>{
 if(!root)return base(null,'not_configured');
 try{root=await safePath(root,{existing:true});const s=await loadKnowledge(root),result=base(root,s.diagnostics.length?'partial':'available');selection(result,s);result.empty=!s.units.some(u=>u.queryable);result.diagnosticCount=s.diagnostics.length;result.diagnostics=s.diagnostics.slice(0,5);result.diagnosticsTruncated=s.diagnostics.length>5;result.usedFiles=[{file:'knowledge.json',sha256:s.files['knowledge.json']!.sha256}];return result;}
 catch(e){return unavailable(root,undefined,e);}
}
function issueRecords(s:Snapshot,u:Unit){const descendants=s.units.filter(v=>v.id===u.id||v.parentId===u.id).map(v=>v.id);return s.units.filter(issue=>issue.kind==='issue'&&((issue.content.recordIds as string[]).some(id=>descendants.includes(id))||descendants.some(id=>{const child=s.units.find(x=>x.id===id);return child?.kind==='statement'&&(child.content.issueIds as string[]).includes(issue.id);}))).map(v=>v.content);}
function item(s:Snapshot,u:Unit,mode:'query'|'read'):KnowledgeItem{
 const configuration=configurationUnit(u),children=s.units.filter(v=>v.parentId===u.id),idsForProblems=new Set([u.id,...u.links,...children.map(v=>v.id)]),issues=configuration?[]:issueRecords(s,u);
 let content=u.content;
 if(mode==='read'){
  content=structuredClone(content);
  if(u.kind==='module')content.checks=s.units.filter(v=>v.kind==='check'&&(v.content.targetId===u.id||children.some(c=>c.id===v.content.targetId))).map(v=>v.content);
 }
 const sourceRefs=configuration?[]:[...new Map(sourceReferences({record:content,issues}).map(v=>[v.sourceId+'#'+v.locator,v])).values()];
 const result:KnowledgeItem={id:u.id,category:u.category,kind:u.kind,title:u.title,summary:u.summary.slice(0,400),tags:u.tags,locator:{file:u.file,recordId:u.id,parentId:u.parentId},relatedIds:u.links,sourceRefs,issues,diagnostics:s.diagnostics.filter(d=>d.affectedIds.length?d.affectedIds.some(id=>idsForProblems.has(id)):d.file===u.file)};
 if(!configuration){const meta=metadata(u.content);result.states=[...new Set(meta.map(m=>m.state))];result.lifecycles=[...new Set(meta.map(m=>m.lifecycle))];result.appliesTo=u.appliesTo;if(u.kind==='check')result.states=['observed'];}
 if(mode==='read')result.content=content;
 return result;
}
export async function queryKnowledge(root:string|undefined,input:unknown,mode:'query'|'read'='query'):Promise<KnowledgeResult>{
 if(!root)return base(null,'not_configured');
 const r=request(input),offset=r.offset??0,limit=r.limit??10,maxBytes=r.maxBytes??24000;
 let s:Snapshot,result:KnowledgeResult;
 try{
  root=await safePath(root,{existing:true});s=await loadKnowledge(root,r.commit?{commit:r.commit}:{});
  if(!r.commit&&(s.version.unmerged||s.version.available&&s.version.draft)&&!r.allowDraft)fail('DRAFT_OR_MERGE_REQUIRES_EXPLICIT_SELECTION');
  result=base(root,'available',r);selection(result,s,r);
 }catch(e){return unavailable(root,r,e);}
 const words=r.query?.toLocaleLowerCase().split(/\s+/).filter(Boolean)??[],wanted=r.recordIds??[],selected=new Set<string>();
 const duplicateIds=new Set(s.diagnostics.filter(d=>d.code==='DUPLICATE_ID').flatMap(d=>d.affectedIds));
 for(const u of s.units){
  if(u.category!==r.category||duplicateIds.has(u.id)||(!wanted.length&&!u.queryable))continue;
  if(wanted.length&&!wanted.includes(u.id)||r.kinds?.length&&!r.kinds.includes(u.kind)||r.domainIds?.length&&!r.domainIds.includes(u.domainId??u.id))continue;
  if(r.moduleIds?.length&&!r.moduleIds.some(id=>u.moduleIds.includes(id)))continue;
  const meta=configurationUnit(u)?[]:metadata(u.content);if(!wanted.length&&meta.length&&!meta.some(m=>m.lifecycle==='active'))continue;
  const search=[u.id,u.title,...u.aliases,...u.tags,u.summary,...(configurationUnit(u)?[]:[JSON.stringify(u.content)])].join('\n').toLocaleLowerCase();
  if(words.length&&!words.every(w=>search.includes(w)))continue;selected.add(u.id);
 }
 const missing:Diagnostic[]=wanted.filter(id=>!s.units.some(u=>u.id===id&&u.category===r.category)).map(id=>({code:'MISSING_RECORD',file:'',affectedIds:[id]}));
 if(r.includeRelated){let frontier=[...selected];for(let depth=0;depth<(r.maxDepth??1);depth++){const next:string[]=[];for(const id of frontier){const u=s.units.find(v=>v.id===id);if(!u)continue;for(const target of u.links){const v=s.units.find(x=>x.id===target);if(!v||duplicateIds.has(target)||v.category==='sources'||configurationUnit(v)||selected.has(target))continue;selected.add(target);next.push(target);}}frontier=next;}}
 const candidates=[...selected].sort().map(id=>s.units.find(u=>u.id===id)!);
 const relevant=new Set(candidates.map(u=>u.file)),dependencyIds=new Set(candidates.flatMap(u=>[u.id,...u.links,...s.units.filter(v=>v.parentId===u.id).map(v=>v.id)]));
 const impacting=s.diagnostics.filter(d=>d.affectedIds.some(id=>dependencyIds.has(id))),diagnostics=[...result.diagnostics,...s.diagnostics.filter(d=>categoryFile(d.file,r.category)||relevant.has(d.file)||d.affectedIds.some(id=>dependencyIds.has(id))),...missing];
 const categoryInvalid=s.diagnostics.some(d=>categoryFile(d.file,r.category));
 result.availability=categoryInvalid||impacting.length>0?(candidates.length?'partial':'unavailable'):'available';
 result.empty=candidates.length===0;result.diagnosticCount=diagnostics.length;result.diagnostics=diagnostics.slice(0,20).map(d=>({...d,affectedIds:d.affectedIds.slice(0,10)}));result.diagnosticsTruncated=diagnostics.length>20||diagnostics.some(d=>d.affectedIds.length>10);
 let budgetLimited=false;
 const materialize=()=>{
  const fileNames=new Set(['knowledge.json']),sourceIds=new Set<string>();
  for(const v of result.items){fileNames.add(v.locator.file);for(const sr of v.sourceRefs)sourceIds.add(sr.sourceId);}
  result.sources=s.sources.filter(v=>sourceIds.has(v.id));for(const v of result.sources)fileNames.add('sources/'+v.id+'.json');
  result.usedFiles=[...fileNames].sort().filter(f=>s.files[f]).map(file=>({file,sha256:s.files[file]!.sha256}));
  const end=offset+result.items.length,truncated=end<candidates.length;result.pagination={offset,limit,returnedCount:result.items.length,nextOffset:truncated?end:null,truncated,omitted:truncated?candidates.slice(end,end+10).map(u=>({id:u.id,reason:budgetLimited?'output_budget':'pagination'})):[]};
 };
 for(const u of candidates.slice(offset,offset+limit)){
  result.items.push(item(s,u,mode));materialize();
  if(Buffer.byteLength(bytes(result))>maxBytes){result.items.pop();budgetLimited=true;break;}
 }
 materialize();
 while(result.items.length&&Buffer.byteLength(bytes(result))>maxBytes){result.items.pop();budgetLimited=true;materialize();}
 if(Buffer.byteLength(bytes(result))>maxBytes)fail('OUTPUT_BUDGET_TOO_SMALL');
 return result;
}
