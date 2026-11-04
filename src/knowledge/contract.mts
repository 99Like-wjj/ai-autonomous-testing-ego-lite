/** Knowledge v3: structured rules/navigation and opaque user-supplied configuration. */
import crypto from 'node:crypto';
import schema from './schema.generated.mjs';

export const FORMAT_VERSION=3 as const;
export class KnowledgeError extends Error { constructor(public readonly code:string,message=code){super(message);this.name='KnowledgeError';} }
export function fail(code:string,message?:string):never{throw new KnowledgeError(code,message);}
export const digest=(value:string|Uint8Array)=>crypto.createHash('sha256').update(value).digest('hex');
export const bytes=(value:unknown)=>JSON.stringify(value,null,2)+'\n';
export function canonical(value:unknown):string{if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value!==null&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';return JSON.stringify(value);}
export function object(value:unknown,keys:readonly string[],required:readonly string[]=keys):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))fail('INVALID_OBJECT');const out=value as Record<string,unknown>;if(Object.keys(out).some(k=>!keys.includes(k))||required.some(k=>!Object.hasOwn(out,k)))fail('INVALID_FIELDS');return out;}
export function text(value:unknown,empty=false):string{if(typeof value!=='string'||(!empty&&!value.trim())||value.length>16000)fail('INVALID_TEXT');return value;}
export function id(value:unknown):string{const s=text(value);if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(s)||s.includes('..'))fail('INVALID_ID');return s;}
export function list(value:unknown):unknown[]{if(!Array.isArray(value)||value.length>2000)fail('INVALID_ARRAY');return value;}
export const strings=(v:unknown)=>list(v).map(x=>text(x));
export const ids=(v:unknown)=>{const a=list(v).map(id);if(new Set(a).size!==a.length)fail('DUPLICATE_REFERENCE');return a;};
export function one<T extends string>(v:unknown,choices:readonly T[]):T{if(typeof v!=='string'||!choices.includes(v as T))fail('INVALID_ENUM');return v as T;}
export function timestamp(v:unknown):string{const s=text(v);if(!validTime(s))fail('INVALID_TIME');return s;}
export function sha(v:unknown):string{const s=text(v);if(!/^[a-f0-9]{64}$/.test(s))fail('INVALID_SHA256');return s;}

type Shape=Record<string,unknown>;
const definitions=(schema as unknown as {$defs:Record<string,Shape>}).$defs;
function validTime(v:string):boolean{const m=/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d+)?(?:Z|[+-](\d\d):(\d\d))$/.exec(v);if(!m)return false;const [,y,mo,d,h,mi,se,oh='00',om='00']=m;return +mo!>=1&&+mo!<=12&&+d!>=1&&+d!<=new Date(Date.UTC(+y!,+mo!,0)).getUTCDate()&&+h!<=23&&+mi!<=59&&+se!<=59&&+oh<=23&&+om<=59&&Number.isFinite(Date.parse(v));}
function shapeError(value:unknown,rule:Shape,at='$',depth=0):string|null{
  if(depth>100)return at+': schema depth';
  const check=(v:unknown,r:unknown,p=at)=>shapeError(v,r as Shape,p,depth+1);
  if(typeof rule.$ref==='string'){const target=definitions[rule.$ref.replace('#/$defs/','')];return target?check(value,target):at+': schema reference';}
  if(Array.isArray(rule.anyOf)&&!rule.anyOf.some(r=>check(value,r)===null))return at+': alternatives';
  if(Array.isArray(rule.oneOf)&&rule.oneOf.filter(r=>check(value,r)===null).length!==1)return at+': alternatives';
  if(Array.isArray(rule.allOf))for(const r of rule.allOf){const e=check(value,r);if(e)return e;}
  if(rule.if&&check(value,rule.if)===null&&rule.then){const e=check(value,rule.then);if(e)return e;}
  if(Object.hasOwn(rule,'const')&&canonical(value)!==canonical(rule.const))return at+': constant';
  if(Array.isArray(rule.enum)&&!rule.enum.some(v=>canonical(v)===canonical(value)))return at+': enum';
  if(rule.type==='null'&&value!==null)return at+': null';
  if(rule.type==='object'&&(!value||typeof value!=='object'||Array.isArray(value)))return at+': object';
  if(rule.type==='array'&&!Array.isArray(value))return at+': array';
  if(rule.type==='string'&&typeof value!=='string')return at+': string';
  if(rule.type==='boolean'&&typeof value!=='boolean')return at+': boolean';
  if(rule.type==='number'&&(typeof value!=='number'||!Number.isFinite(value)))return at+': number';
  if(typeof value==='string'){
    const n=[...value].length;if(typeof rule.minLength==='number'&&n<rule.minLength||typeof rule.maxLength==='number'&&n>rule.maxLength)return at+': length';
    if(typeof rule.pattern==='string'&&!new RegExp(rule.pattern,'u').test(value))return at+': pattern';
    if(rule.format==='date-time'&&!validTime(value))return at+': time';
  }
  if(Array.isArray(value)){
    if(typeof rule.minItems==='number'&&value.length<rule.minItems||typeof rule.maxItems==='number'&&value.length>rule.maxItems)return at+': count';
    if(rule.uniqueItems&&new Set(value.map(canonical)).size!==value.length)return at+': duplicates';
    if(rule.items)for(let i=0;i<value.length;i++){const e=check(value[i],rule.items,at+'['+i+']');if(e)return e;}
  }
  if(value!==null&&typeof value==='object'&&!Array.isArray(value)){
    const v=value as Shape,props=rule.properties as Record<string,Shape>|undefined;
    if(Array.isArray(rule.required)&&rule.required.some(k=>!Object.hasOwn(v,k as string)))return at+': required';
    if(props){if(rule.additionalProperties===false&&Object.keys(v).some(k=>!Object.hasOwn(props,k)))return at+': fields';for(const [k,r]of Object.entries(props))if(Object.hasOwn(v,k)){const e=check(v[k],r,at+'.'+k);if(e)return e;}}
    if(rule.additionalProperties&&typeof rule.additionalProperties==='object')for(const [k,x]of Object.entries(v))if(!props||!Object.hasOwn(props,k)){const e=check(x,rule.additionalProperties,at+'.'+k);if(e)return e;}
  }
  return null;
}
export function assertShape(value:unknown,name:string):void{const rule=definitions[name];if(!rule)fail('INVALID_SCHEMA_DEFINITION');const error=shapeError(value,rule);if(error)fail('INVALID_STRUCTURE',error);}

export type Category='project'|'modules'|'rules'|'accounts';
export interface SourceRef{sourceId:string;locator:string}
export interface Meta{state:'confirmed'|'observed'|'pending';lifecycle:'active'|'superseded'|'retired';sourceRefs:SourceRef[];updatedAt:string;changeReason:string;limitations:string[]}
export interface Header{knowledgeFormatVersion:3;knowledgeId:string;projectId:string;projectName:string;createdAt:string}
export interface Source{id:string;documentId:string;title:string;kind:'requirement'|'manual'|'observation'|'confirmation'|'other';version:string|null;issuedAt:string|null;sha256:string|null;locator:string;limitations:string[]}
export type JsonValue=null|boolean|number|string|JsonValue[]|JsonObject;
export interface JsonObject{[key:string]:JsonValue}
export interface ConfigurationRecord{id:string;title:string;summary?:string;tags?:string[];description?:string;properties?:JsonObject}
export interface Configuration{items:ConfigurationRecord[]}
export type Project=Configuration;
export type Accounts=Configuration;
export interface Statement{id:string;text:string;appliesTo?:string;meta:Meta;relations:{type:'requires'|'uses_role'|'operates_on'|'affects'|'navigates_to'|'related_to';targetId:string}[];issueIds:string[]}
export interface Issue{id:string;type:'conflict'|'stale'|'needs_review'|'missing';recordIds:string[];summary:string;sourceRefs:SourceRef[];resolution:null|{text:string;sourceRefs:SourceRef[]}}
export interface Check{id:string;targetId:string;actorNote:string|null;outcome:'verified'|'violation'|'inconclusive'|'not_tested';coverage:string;observedAt:string|null;description:string;sourceRefs:SourceRef[];limitations:string[]}
export interface Domain{id:string;title:string;aliases:string[]}
export interface EntryPoint{id:string;application?:string;page?:string;url?:string;appliesTo?:string;menuPath:string[];accessNotes:string|null;meta:Meta}
export interface Module{id:string;domainId:string|null;title:string;aliases:string[];summary:string;descriptions:Statement[];entryPoints:EntryPoint[];ruleIds:string[];roleIds:string[]}
export interface FeatureMap{domains:Domain[];modules:Module[];checks:Check[];issues:Issue[]}
export interface Entry{id:string;kind:'rule'|'role';title:string;aliases:string[];summary:string;moduleIds:string[];businessTags:string[];statements:Statement[]}
export interface Topic{id:string;title:string;entries:Entry[];issues:Issue[]}
export interface Diagnostic{code:string;file:string;affectedIds:string[]}
export interface Library{header:Header;project:Project|null;map:FeatureMap|null;topics:Topic[];accounts:Accounts|null;sources:Source[]}
export const emptyProject=():Project=>({items:[]});
export function parseHeader(v:unknown):Header{if(v&&typeof v==='object'&&'knowledgeFormatVersion'in v&&v.knowledgeFormatVersion!==FORMAT_VERSION)fail('UNSUPPORTED_KNOWLEDGE_FORMAT');assertShape(v,'header');return v as Header;}
export function parseSource(v:unknown):Source{assertShape(v,'source');return v as Source;}
export function parseProject(v:unknown):Project{assertShape(v,'project');return v as Project;}
export function parseMap(v:unknown):FeatureMap{
  assertShape(v,'map');const m=v as FeatureMap;
  for(const entry of m.modules.flatMap(v=>v.entryPoints))if(entry.url!==undefined){
    let u:URL;try{u=new URL(entry.url);}catch{fail('INVALID_PAGE_URL');}
    if(!['http:','https:'].includes(u.protocol)||u.username||u.password)fail('INVALID_PAGE_URL');
    const forbidden=/^(?:code|token|access_token|id_token|refresh_token|authorization|cookie|password|secret)$/i;
    if([...u.searchParams.keys()].some(k=>forbidden.test(k))||/(?:^|[?&#])(?:access_token|id_token|refresh_token|token|code)=/i.test(u.hash))fail('AUTHENTICATION_IN_URL');
  }
  return m;
}
export function parseTopic(v:unknown):Topic{assertShape(v,'topic');return v as Topic;}
export function parseAccounts(v:unknown):Accounts{assertShape(v,'accounts');return v as Accounts;}
export function parseDocument(name:string,v:unknown):Header|Project|FeatureMap|Topic|Accounts|Source{checkSecrets(v);return name==='knowledge.json'?parseHeader(v):name==='project.json'?parseProject(v):name==='feature-map.json'?parseMap(v):name==='accounts.json'?parseAccounts(v):name.startsWith('rules/')?parseTopic(v):parseSource(v);}

export interface Unit{id:string;file:string;category:Category|'sources';kind:string;title:string;aliases:string[];tags:string[];summary:string;content:Record<string,unknown>;parentId:string|null;queryable:boolean;appliesTo:string[];moduleIds:string[];domainId:string|null;meta:Meta|null;links:string[]}
export const configurationUnit=(u:Unit)=>u.kind==='account'||u.kind==='project_config';
/** Configuration properties are opaque, including keys that happen to be named meta/sourceRefs/id. */
export function sourceReferences(value:unknown):SourceRef[]{const out:SourceRef[]=[];function walk(v:unknown){if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(walk);return;}for(const [k,x]of Object.entries(v)){if(k==='properties')continue;if(k==='sourceRefs')out.push(...x as SourceRef[]);else walk(x);}}walk(value);return out;}
export function metadata(value:unknown):Meta[]{const out:Meta[]=[];function walk(v:unknown){if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(walk);return;}for(const [k,x]of Object.entries(v)){if(k==='properties')continue;if(k==='meta')out.push(x as Meta);else walk(x);}}walk(value);return out;}
export function indexLibrary(lib:Library):Unit[]{
  const out:Unit[]=[];
  const add=(file:string,category:Unit['category'],kind:string,value:{id:string},queryable=false,parentId:string|null=null,extra:Partial<Pick<Unit,'links'|'appliesTo'|'moduleIds'|'domainId'>>={})=>{
    const c=value as unknown as Record<string,unknown>,title=typeof c.title==='string'?c.title:typeof c.text==='string'?c.text.slice(0,120):typeof c.description==='string'?c.description.slice(0,120):value.id;
    out.push({id:value.id,file,category,kind,title,aliases:Array.isArray(c.aliases)?c.aliases as string[]:[],tags:Array.isArray(c.tags)?c.tags as string[]:[],summary:typeof c.summary==='string'?c.summary:title,content:c,parentId,queryable,appliesTo:typeof c.appliesTo==='string'?[c.appliesTo]:[],moduleIds:[],domainId:null,meta:c.meta?c.meta as Meta:null,links:[],...extra});
  };
  const issue=(file:string,category:Category,i:Issue)=>add(file,category,'issue',i,false,null,{links:i.recordIds});
  const st=(file:string,category:Category,s:Statement,parent:string)=>add(file,category,'statement',s,false,parent,{links:s.relations.map(r=>r.targetId)});
  if(lib.project)for(const p of lib.project.items)add('project.json','project','project_config',p,true);
  if(lib.map){
    const m=lib.map;for(const d of m.domains)add('feature-map.json','modules','domain',d);
    for(const v of m.modules){
      const appliesTo=[...new Set([...v.descriptions,...v.entryPoints].flatMap(s=>s.appliesTo?[s.appliesTo]:[]))];
      add('feature-map.json','modules','module',v,true,null,{appliesTo,domainId:v.domainId,moduleIds:[v.id],links:[...v.ruleIds,...v.roleIds,...v.descriptions.flatMap(s=>s.relations.map(r=>r.targetId))]});
      for(const s of v.descriptions)st('feature-map.json','modules',s,v.id);
      for(const e of v.entryPoints)add('feature-map.json','modules','entry_point',e,false,v.id);
    }
    for(const c of m.checks)add('feature-map.json','modules','check',c,false,c.targetId,{links:[c.targetId]});
    m.issues.forEach(i=>issue('feature-map.json','modules',i));
  }
  for(const t of lib.topics){
    const file='rules/'+t.id+'.json';add(file,'rules','topic',t);
    for(const e of t.entries){
      add(file,'rules',e.kind,e,true,t.id,{appliesTo:[...new Set(e.statements.flatMap(s=>s.appliesTo?[s.appliesTo]:[]))],moduleIds:e.moduleIds,links:[...e.moduleIds,...e.statements.flatMap(s=>s.relations.map(r=>r.targetId))]});
      e.statements.forEach(s=>st(file,'rules',s,e.id));
    }
    t.issues.forEach(i=>issue(file,'rules',i));
  }
  if(lib.accounts)for(const a of lib.accounts.items)add('accounts.json','accounts','account',a,true);
  for(const s of lib.sources)add('sources/'+s.id+'.json','sources','source',s);
  return out;
}
export function checkReferences(lib:Library):Diagnostic[]{
  const units=indexLibrary(lib),diagnostics:Diagnostic[]=[],byId=new Map<string,Unit>(),sourceMap=new Map(lib.sources.map(s=>[s.id,s]));
  const add=(code:string,u:Unit,targets:string[]=[])=>diagnostics.push({code,file:u.file,affectedIds:[u.id,...targets]});
  for(const u of units){if(byId.has(u.id)){add('DUPLICATE_ID',u);const old=byId.get(u.id)!;if(old.file!==u.file)add('DUPLICATE_ID',old);}else byId.set(u.id,u);}
  const check=(u:Unit,target:string|null,kind:string|readonly string[],code:string)=>{if(target===null)return;const found=byId.get(target);if(!found)add(code,u,[target]);else if(!(typeof kind==='string'?[kind]:kind).includes(found.kind))add('INVALID_REFERENCE_KIND',u,[target]);};
  for(const u of units){
    if(configurationUnit(u))continue;
    for(const ref of sourceReferences(u.content))if(!sourceMap.has(ref.sourceId))add('MISSING_SOURCE',u,[ref.sourceId]);
    for(const meta of metadata(u.content))if(meta.state==='confirmed'&&meta.sourceRefs.every(r=>sourceMap.get(r.sourceId)?.kind==='observation'))add('CONFIRMATION_REQUIRES_BASIS',u);
    for(const m of u.moduleIds)check(u,m,'module','MISSING_MODULE');
    const c=u.content;
    if(u.kind==='module'){check(u,c.domainId as string|null,'domain','MISSING_DOMAIN');for(const r of c.ruleIds as string[])check(u,r,'rule','MISSING_RULE');for(const r of c.roleIds as string[])check(u,r,'role','MISSING_ROLE');}
    if(u.kind==='statement'){for(const rel of c.relations as Statement['relations'])check(u,rel.targetId,['module','rule','role','statement','entry_point'],'BROKEN_RELATION');for(const x of c.issueIds as string[])check(u,x,'issue','MISSING_ISSUE');}
    if(u.kind==='check')check(u,c.targetId as string,['module','entry_point'],'MISSING_CHECK_TARGET');
    if(u.kind==='issue')for(const x of c.recordIds as string[]){const target=byId.get(x);if(!target)add('MISSING_RECORD',u,[x]);else if(configurationUnit(target))add('INVALID_REFERENCE_KIND',u,[x]);}
  }
  const unique=new Map(diagnostics.map(d=>[canonical(d),d]));return [...unique.values()];
}
/** Known secret-pattern heuristic; never echo the matched value. */
export function checkSecrets(v:unknown):void{const s=JSON.stringify(v);if(/-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}|\bBearer\s+[A-Za-z0-9._~-]{24,}|\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}|https?:\/\/[^\s/@:]+:[^\s/@]+@/i.test(s))fail('POSSIBLE_CREDENTIAL');}
