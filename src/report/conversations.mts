/** Read-only messages from retained evidence and explicitly sourced retrospective annotations. */
import fs from 'node:fs/promises';
import type { CheckedCase, ConversationArtifact, ConversationSourceView, ConversationView, EvidenceItem, Report, ReportContext } from '../contracts/model.mjs';
import { assertClosed, fail, hash, safeIdentifier, safePath } from '../core/common.mjs';
import { arrayValue, strings, textValue, uniqueStrings } from '../core/validation.mjs';
import { conversationSourceIds, parseConversationBytes, pointerValue, validateConversationSources, type ConversationSourceContent } from '../core/conversations.mjs';
import { sourceContent } from '../core/conversation-store.mjs';
import { evidenceFile } from '../core/file-integrity.mjs';
import { caseGoals } from './execution-view.mjs';

type ReadingConversation = NonNullable<ReportContext['conversations']>[number];
export interface ConversationEvidenceFile { key: string; item: EvidenceItem; runDir: string | null }
const sourceLimit = 16000;
function goalScope(report: Report,c: CheckedCase,goalId: string) {
  const scoped=caseGoals(report,c).find(s=>s.goal.id===goalId)!;
  const evidence=new Set(scoped.evidenceIds),queue=[...evidence];
  for(let i=0;i<queue.length;i++)for(const id of report.evidenceCatalog.items.find(e=>e.id===queue[i])?.metadata?.contextEvidenceIds??[])if(!evidence.has(id)){evidence.add(id);queue.push(id);}
  return {...scoped,evidenceIds:[...evidence]};
}
async function contextSource(context: ReportContext,label: string): Promise<Buffer> {
  const source=context.sources.find(s=>s.label===label);if(!source)fail('Unknown conversation context source: '+label);
  const file=await safePath(source.file,{existing:true});if(!(await fs.lstat(file)).isFile())fail('Conversation context source must be a regular file.');
  const bytes=await fs.readFile(file);if(hash(bytes)!==source.sha256)fail('Conversation context source hash changed: '+label);return bytes;
}
export function parseReadingConversations(value: unknown,context: ReportContext,report: Report): ReadingConversation[] {
  const keys=new Set<string>(),labels=new Set(context.sources.map(s=>s.label));
  if(labels.size!==context.sources.length)fail('Conversation context source labels must be unique.');
  return arrayValue(value,'reading conversations').map(v=>{
    assertClosed(v,['caseId','goalId','sourceLabel','sourceBindings','actions','limitations'],'reading conversation');
    const caseId=safeIdentifier(v.caseId),goalId=safeIdentifier(v.goalId),sourceLabel=textValue(v.sourceLabel,'conversation source label');
    const c=report.cases.find(c=>c.id===caseId);if(!c||!c.goals.some(g=>g.id===goalId)||!labels.has(sourceLabel))fail('Reading conversation needs an existing current goal and verified source.');
    const key=caseId+'/'+goalId+'/'+sourceLabel;if(keys.has(key))fail('Duplicate reading conversation.');keys.add(key);
    const scoped=goalScope(report,c,goalId),allowed=new Set(scoped.evidenceIds),sourceIds=new Set<string>();
    const sourceBindings=arrayValue(v.sourceBindings,'reading source bindings').map(b=>{
      assertClosed(b,['sourceId','evidenceId','sourceLabel'],'reading source binding');const sourceId=safeIdentifier(b.sourceId);
      if(sourceIds.has(sourceId))fail('Duplicate local conversation source ID.');sourceIds.add(sourceId);
      if((b.evidenceId===undefined)===(b.sourceLabel===undefined))fail('Choose one retained evidence or context source for a conversation binding.');
      if(b.evidenceId!==undefined){const evidenceId=safeIdentifier(b.evidenceId);if(!allowed.has(evidenceId))fail('Reading conversation cannot borrow another goal\'s evidence.');return{sourceId,evidenceId};}
      const label=textValue(b.sourceLabel,'reading bound source label');if(!labels.has(label)||label===sourceLabel)fail('Unknown or self-referencing conversation source.');return{sourceId,sourceLabel:label};
    });
    if(!sourceBindings.length)fail('Reading conversation needs source bindings.');
    const actionKeys=new Set<string>(),actions=arrayValue(v.actions,'reading conversation actions').map(a=>{
      assertClosed(a,['observationId','actionId','messageIds'],'reading conversation action');const observationId=safeIdentifier(a.observationId),actionId=safeIdentifier(a.actionId),key=observationId+'/'+actionId;
      if(!scoped.observations.some(o=>o.id===observationId&&o.actions?.some(a=>a.id===actionId))||actionKeys.has(key))fail('Conversation bindings must use unique actual current-goal actions, never planned steps.');actionKeys.add(key);
      const messageIds=uniqueStrings(a.messageIds,'reading conversation messages',true);if(!messageIds.length)fail('Conversation actions must identify their messages.');return{observationId,actionId,messageIds};
    });
    const limitations=strings(v.limitations,'reading conversation limitations');if(!limitations.length)fail('Reading conversation must declare retrospective limitations.');
    return{caseId,goalId,sourceLabel,sourceBindings,actions,limitations};
  });
}
function preview(doc: ConversationArtifact,sourceId: string,source: ConversationSourceContent): Pick<ConversationSourceView,'text'|'truncated'> {
  if(source.text===undefined)return{};
  const selected=doc.messages.flatMap(m=>m.sourceRefs.filter(r=>r.sourceId===sourceId).map(r=>r.quote??pointerValue(source.text!,r.jsonPointer)));
  const body=[...new Set(selected)].join('\n\n'),prefix=body.slice(0,sourceLimit),text=/[\uD800-\uDBFF]$/.test(prefix)?prefix.slice(0,-1):prefix;return{text,truncated:body.length>text.length};
}
export async function readingConversationViews(context: ReportContext,report: Report,root?: string): Promise<Record<string,ConversationView>> {
  const views:Record<string,ConversationView>={};
  for(const reading of context.conversations??[]){
    const artifact=parseConversationBytes(await contextSource(context,reading.sourceLabel)),ids=conversationSourceIds(artifact);
    if(reading.sourceBindings.length!==ids.length||reading.sourceBindings.some(s=>!ids.includes(s.sourceId)))fail('Reading conversation mappings must exactly cover local sources.');
    const content=new Map<string,ConversationSourceContent>(),sources:ConversationSourceView[]=[];
    for(const binding of reading.sourceBindings){
      if(binding.evidenceId!==undefined){
        if(!root)fail('Retained conversation sources require the confirmed run root.');
        const e=report.evidenceCatalog.items.find(e=>e.id===binding.evidenceId);if(!e||e.kind==='conversation')fail('Reading source must be an original retained file.');
        const b=await fs.readFile(await evidenceFile(root,e.path));if(hash(b)!==e.sha256||b.length!==e.bytes)fail('Reading conversation evidence changed.');
        const source=sourceContent(b,e);content.set(binding.sourceId,source);sources.push({sourceId:binding.sourceId,label:e.description,sha256:e.sha256,evidenceId:e.id,...preview(artifact,binding.sourceId,source)});
      }else{
        const label=binding.sourceLabel!,b=await contextSource(context,label),s=context.sources.find(s=>s.label===label)!,source=sourceContent(b);
        if(source.binary&&artifact.messages.some(m=>m.attachmentSourceIds?.includes(binding.sourceId)))fail('Binary conversation attachments must use registered evidence, not an external reading source.');
        content.set(binding.sourceId,source);sources.push({sourceId:binding.sourceId,label,sha256:s.sha256,...preview(artifact,binding.sourceId,source)});
      }
    }
    validateConversationSources(artifact,content);
    for(const action of reading.actions)if(action.messageIds.some(id=>!artifact.messages.some(m=>m.id===id)))fail('Reading action refers to an unknown conversation message.');
    const id='reading-'+hash(JSON.stringify([reading.caseId,reading.goalId,reading.sourceLabel])).slice(0,24);
    views[id]={id,artifact,sources,caseId:reading.caseId,goalId:reading.goalId,retrospective:true,limitations:reading.limitations,actions:reading.actions,artifactSource:{label:reading.sourceLabel,sha256:context.sources.find(s=>s.label===reading.sourceLabel)!.sha256}};
  }
  return views;
}
export async function registeredConversationViews(root: string,report: Report,files: readonly ConversationEvidenceFile[],historyFiles?: ReadonlyMap<string,string>): Promise<Record<string,ConversationView>> {
  const views:Record<string,ConversationView>={};
  conversations:for(const file of files){
    const e=file.item;if(e.kind!=='conversation'||['excluded','failed'].includes(e.metadata?.contentState??''))continue;
    const historical=file.key!==e.id;if(historical&&!file.runDir&&!historyFiles?.has(file.key))continue;
    try{
    let bytes:Buffer;try{const archived=historyFiles?.get(file.key);bytes=await fs.readFile(archived?await safePath(archived,{existing:true}):await evidenceFile(file.runDir??root,e.path));}catch(err){if(historical)continue;throw err;}
    if(hash(bytes)!==e.sha256||bytes.length!==e.bytes)fail('Conversation artifact changed while rendering.');const artifact=parseConversationBytes(bytes),bindings=e.metadata?.conversationSources??[],sourceIds=conversationSourceIds(artifact);
    if(bindings.length!==sourceIds.length||bindings.some(b=>!sourceIds.includes(b.sourceId)))fail('Incomplete registered conversation source mappings.');
    const content=new Map<string,ConversationSourceContent>(),sources:ConversationSourceView[]=[];
    for(const binding of bindings){
      const sourceFile=files.find(f=>f.runDir===file.runDir&&(f.key!==f.item.id)===historical&&f.item.id===binding.evidenceId);if(!sourceFile||sourceFile.item.caseId!==e.caseId||sourceFile.item.kind==='conversation'){if(historical)continue conversations;fail('Unknown conversation source while rendering.');}
      if(historical&&!sourceFile.runDir&&!historyFiles?.has(sourceFile.key))continue conversations;
      const sourceItem=sourceFile.item,archived=historyFiles?.get(sourceFile.key);let b:Buffer;
      try{b=await fs.readFile(archived?await safePath(archived,{existing:true}):await evidenceFile(sourceFile.runDir??root,sourceItem.path));}catch(error){if(historical)continue conversations;throw error;}
      if(hash(b)!==sourceItem.sha256||b.length!==sourceItem.bytes)fail('Conversation retained source changed while rendering.');const source=sourceContent(b,sourceItem);content.set(binding.sourceId,source);sources.push({sourceId:binding.sourceId,label:sourceItem.description,sha256:sourceItem.sha256,evidenceId:sourceFile.key,...preview(artifact,binding.sourceId,source)});
    }
    validateConversationSources(artifact,content);views[file.key]={id:file.key,artifact,sources,caseId:e.caseId,evidenceId:file.key,retrospective:historical,limitations:artifact.limitations,actions:[]};
    }catch(error){if(!historical)throw error;/* Historical gaps never acquire a trusted conversation view. */}
  }
  return views;
}
