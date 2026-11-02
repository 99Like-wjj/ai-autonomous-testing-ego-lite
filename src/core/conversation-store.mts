/** Only verified retained files enter normalized conversations. Never contacts a tested service. */
import fs from 'node:fs/promises';
import type { ConversationArtifact, ConversationSourceBinding, EvidenceCatalog, EvidenceItem } from '../contracts/model.mjs';
import { fail, hash } from './common.mjs';
import { evidenceFile } from './file-integrity.mjs';
import { conversationSourceIds, parseConversationBytes, validateConversationSources, type ConversationSourceContent } from './conversations.mjs';

export async function retainedBytes(root: string, item: EvidenceItem): Promise<Buffer> {
  const bytes = await fs.readFile(await evidenceFile(root,item.path));
  if (hash(bytes) !== item.sha256 || bytes.length !== item.bytes) fail('Conversation source content changed: ' + item.id);
  return bytes;
}
export function sourceContent(bytes: Uint8Array, item?: Pick<EvidenceItem,'kind'|'metadata'>): ConversationSourceContent {
  let text: string | undefined; try { text = new TextDecoder('utf-8',{fatal:true}).decode(bytes); } catch { /* actual binary attachment */ }
  return { ...(text === undefined ? { binary: true } : { text }), excluded: ['excluded','failed'].includes(item?.metadata?.contentState ?? '') };
}
export async function validateRegisteredConversation(root: string, bytes: Uint8Array, caseId: string, bindings: readonly ConversationSourceBinding[] | undefined, catalog: EvidenceCatalog): Promise<ConversationArtifact> {
  const doc = parseConversationBytes(bytes), sourceIds = conversationSourceIds(doc);
  if (!bindings || bindings.length !== sourceIds.length || bindings.some(b => !sourceIds.includes(b.sourceId))) fail('Conversation source mappings must exactly cover the artifact sources.');
  const sources = new Map<string, ConversationSourceContent>();
  for (const binding of bindings) {
    const item = catalog.items.find(e => e.id === binding.evidenceId && e.caseId === caseId);
    if (!item || item.kind === 'conversation') fail('Conversation sources must be registered original files in the same case.');
    sources.set(binding.sourceId,sourceContent(await retainedBytes(root,item),item));
  }
  validateConversationSources(doc,sources); return doc;
}
export async function readConversationCatalog(root: string, catalog: EvidenceCatalog): Promise<Record<string, ConversationArtifact>> {
  const result: Record<string, ConversationArtifact> = {};
  for (const item of catalog.items) if (item.kind === 'conversation' && !['excluded','failed'].includes(item.metadata?.contentState ?? '')) {
    result[item.id] = await validateRegisteredConversation(root,await retainedBytes(root,item),item.caseId,item.metadata?.conversationSources,catalog);
  }
  return result;
}
