/** Bounded read-only v3 snapshots. No remote access, migration or business judgments. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {digest,canonical,fail,parseHeader,parseDocument,checkReferences,checkSecrets,KnowledgeError,indexLibrary} from './contract.mjs';
import type {Header,Source,Topic,Diagnostic,Project,FeatureMap,Accounts,Library,Unit,Category} from './contract.mjs';
const exec=promisify(execFile);
export const PENDING='.knowledge-pending.json';
export const managed=(name:string)=>['knowledge.json','project.json','feature-map.json','accounts.json'].includes(name)||/^(?:rules|sources)\/[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.json$/.test(name)&&!name.includes('..');
const absent=(e:unknown)=>e instanceof Error&&'code'in e&&e.code==='ENOENT';
export async function safePath(value:string,{existing=false,protectedRoots=[] as string[]}={}){
  if(!path.isAbsolute(value))fail('ABSOLUTE_PATH_REQUIRED');const full=path.resolve(value);
  for(const protectedRoot of protectedRoots){const r=path.relative(path.resolve(protectedRoot),full);if(!r||!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r))fail('PROTECTED_PATH');}
  let cursor=path.parse(full).root;for(const part of full.slice(cursor.length).split(path.sep).filter(Boolean)){cursor=path.join(cursor,part);try{if((await fs.lstat(cursor)).isSymbolicLink())fail('SYMLINK_PATH');}catch(e){if(!absent(e))throw e;}}
  if(existing)await fs.stat(full);return full;
}
export async function regular(file:string):Promise<Buffer>{await safePath(file,{existing:true});const stat=await fs.lstat(file);if(!stat.isFile()||stat.size>1024*1024)fail('INVALID_FILE_OR_SIZE');const value=await fs.readFile(file);if(value.length>1024*1024)fail('INVALID_FILE_OR_SIZE');return value;}
async function git(root:string,args:string[]){return(await exec('git',['--no-optional-locks','-c','core.fsmonitor=false','-c','core.untrackedCache=false','-C',root,...args],{encoding:'utf8',maxBuffer:20*1024*1024,timeout:10000,windowsHide:true})).stdout;}
const paths=['knowledge.json','project.json','feature-map.json','accounts.json','rules','sources'];
export interface GitState{gitCommit:string|null;draft:boolean;unmerged:boolean;remoteFreshness:'unknown';available:boolean}
export async function gitState(root:string):Promise<GitState>{try{await git(root,['rev-parse','--show-toplevel']);let gitCommit:string|null=null;try{gitCommit=(await git(root,['rev-parse','--verify','HEAD'])).trim();}catch{}const dirty=await git(root,['status','--porcelain=v1','-z','--untracked-files=all','--',...paths]),unmerged=await git(root,['ls-files','-u','-z','--',...paths]);return{gitCommit,draft:!gitCommit||dirty.length>0,unmerged:unmerged.length>0,remoteFreshness:'unknown',available:true};}catch{return{gitCommit:null,draft:true,unmerged:false,remoteFreshness:'unknown',available:false};}}
export interface Snapshot extends Library{units:Unit[];diagnostics:Diagnostic[];files:Record<string,{sha256:string;content:unknown}>;snapshotSha256:string;version:GitState&{mode:'working_tree'|'commit'};presence:Record<Category,boolean>}
async function inventory(root:string):Promise<string[]>{
  const names:string[]=[];for(const name of paths.slice(0,4)){try{await safePath(path.join(root,name),{existing:true});names.push(name);}catch(e){if(!absent(e))throw e;}}
  for(const folder of ['rules','sources']){let entries:string[];try{await safePath(path.join(root,folder),{existing:true});entries=await fs.readdir(path.join(root,folder));}catch(e){if(absent(e))continue;throw e;}for(const name of entries){if(name.startsWith('.'))continue;const relative=folder+'/'+name;if(!managed(relative))fail('UNEXPECTED_KNOWLEDGE_FILE');names.push(relative);}}
  return names.sort();
}
async function noPending(root:string){try{await fs.lstat(path.join(root,PENDING));fail('KNOWLEDGE_WRITE_PENDING');}catch(e){if(!absent(e))throw e;}}
export async function loadKnowledge(root:string,{commit,ignorePending=false}:{commit?:string;ignorePending?:boolean}={}):Promise<Snapshot>{
  root=await safePath(root,{existing:true});if(!ignorePending)await noPending(root);
  const state=await gitState(root),raw:Record<string,Buffer>={};
  if(commit!==undefined){
    if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit))fail('FULL_COMMIT_REQUIRED');const actual=(await git(root,['rev-parse','--verify',commit+'^{commit}'])).trim();if(actual!==commit)fail('COMMIT_MISMATCH');
    const prefix=(await git(root,['rev-parse','--show-prefix'])).trim(),lines=(await git(root,['ls-tree','--full-tree','-r','-z',commit])).split('\0').filter(Boolean);
    for(const line of lines){const [meta,name]=line.split('\t');if(!meta||!name)fail('INVALID_GIT_TREE');const relative=prefix?name.startsWith(prefix)?name.slice(prefix.length):'':name;if(!managed(relative))continue;if(!meta.startsWith('100644 ')&&!meta.startsWith('100755 '))fail('INVALID_GIT_FILE');raw[relative]=Buffer.from(await git(root,['show',commit+':'+name]));}
  }else{for(const name of await inventory(root))raw[name]=await regular(path.join(root,name));}
  const names=Object.keys(raw).sort();if(names.length>512||Object.values(raw).reduce((n,b)=>n+b.length,0)>16*1024*1024)fail('KNOWLEDGE_SIZE_LIMIT');
  if(!raw['knowledge.json'])fail('MISSING_HEADER');
  const parse=(name:string):unknown=>{const b=raw[name]!;if(b.length>1024*1024||!Buffer.from(b.toString('utf8'),'utf8').equals(b))fail('INVALID_FILE_OR_SIZE');let v:unknown;try{v=JSON.parse(b.toString('utf8'));}catch{fail('INVALID_JSON');}checkSecrets(v);return v;};
  const header:Header=parseHeader(parse('knowledge.json')),sources:Source[]=[],topics:Topic[]=[],diagnostics:Diagnostic[]=[],files:Snapshot['files']={};
  let project:Project|null=null,map:FeatureMap|null=null,accounts:Accounts|null=null;
  for(const name of names){try{
    const content=parse(name);files[name]={sha256:digest(raw[name]!),content};if(name==='knowledge.json')continue;
    const value=parseDocument(name,content);
    if(name==='project.json')project=value as Project;else if(name==='feature-map.json')map=value as FeatureMap;else if(name==='accounts.json')accounts=value as Accounts;else{
      const item=value as Source|Topic;if(name!==name.split('/')[0]+'/'+item.id+'.json')fail('FILENAME_ID_MISMATCH');if(name.startsWith('sources/'))sources.push(item as Source);else topics.push(item as Topic);
    }
  }catch(e){if(!(e instanceof KnowledgeError)||e.code==='POSSIBLE_CREDENTIAL')throw e;diagnostics.push({code:e.code,file:name,affectedIds:[]});}}
  const library={header,project,map,accounts,topics,sources};diagnostics.push(...checkReferences(library));
  if(!commit){for(const name of names)if(digest(await regular(path.join(root,name)))!==digest(raw[name]!))fail('KNOWLEDGE_CHANGED_DURING_READ');if(canonical(await inventory(root))!==canonical(names))fail('KNOWLEDGE_CHANGED_DURING_READ');if(!ignorePending)await noPending(root);}
  return{...library,units:indexLibrary(library),diagnostics,files,snapshotSha256:digest(canonical(names.map(name=>({name,sha256:digest(raw[name]!)})))),version:{...state,gitCommit:commit??state.gitCommit,draft:commit?false:state.draft,mode:commit?'commit':'working_tree'},presence:{project:names.includes('project.json'),modules:names.includes('feature-map.json'),rules:names.some(n=>n.startsWith('rules/')),accounts:names.includes('accounts.json')}};
}
