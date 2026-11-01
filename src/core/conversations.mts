/** Provider-neutral normalized messages. No capture, protocol routing, model calls or business verdicts. */
import type { ConversationArtifact, ConversationMessage, ConversationSourceBinding, ConversationSourceRef, RecordPayload, EvidenceMetadata } from '../contracts/model.mjs';
import { assertClosed, assertTimestamp, fail, nonempty, safeIdentifier } from './common.mjs';

export const CONVERSATION_VERSION = 1;
export const CONVERSATION_MAX_BYTES = 8 * 1024 * 1024;
const text = (v: unknown, label: string, max = 262144, empty = false): string => { if (typeof v !== 'string' || !empty && !nonempty(v) || typeof v === 'string' && v.length > max) fail('Invalid conversation ' + label + '.'); return v; };
function array(v: unknown, label: string, max = 1000): unknown[] { if (!Array.isArray(v) || v.length > max) fail('Invalid conversation ' + label + '.'); return v; }
function choice<const T extends readonly string[]>(v: unknown, values: T, label: string): T[number] { if (typeof v !== 'string' || !values.includes(v)) fail('Invalid conversation ' + label + '.'); return v as T[number]; }
function ids(v: unknown, label: string): string[] { const a = array(v,label).map(x => safeIdentifier(x,label)); if (new Set(a).size !== a.length) fail('Duplicate conversation ' + label + '.'); return a; }
const notes = (v: unknown) => array(v,'limitations').map(x => text(x,'limitation',16384));

export function parseConversationSourceBindings(value: unknown): ConversationSourceBinding[] {
  const bindings = array(value,'source bindings').map(v => { assertClosed(v,['sourceId','evidenceId'],'conversation source binding'); return { sourceId: safeIdentifier(v.sourceId), evidenceId: safeIdentifier(v.evidenceId) }; });
  if (!bindings.length || new Set(bindings.map(v => v.sourceId)).size !== bindings.length) fail('Conversation source bindings must be nonempty and unique.');
  return bindings;
}
export function mapConversationMetadata(metadata: EvidenceMetadata | undefined, map: (id: string) => string): EvidenceMetadata | undefined {
  if (!metadata) return undefined;
  return { ...metadata, ...(metadata.contextEvidenceIds ? { contextEvidenceIds: metadata.contextEvidenceIds.map(map) } : {}), ...(metadata.conversationSources ? { conversationSources: metadata.conversationSources.map(s => ({ ...s, evidenceId: map(s.evidenceId) })) } : {}) };
}
export function parseConversation(value: unknown): ConversationArtifact {
  assertClosed(value,['conversationVersion','id','title','messages','limitations'],'conversation artifact');
  if (value.conversationVersion !== CONVERSATION_VERSION) fail('Conversation evidence requires conversationVersion 1.');
  const messages = array(value.messages,'messages').map(v => {
    assertClosed(v,['id','role','displayName','format','content','language','presentation','completeness','state','completionBasis','sourceRefs','attachmentSourceIds','sentAt','observedAt','displayTime','limitations'],'conversation message');
    const sourceRefs: ConversationSourceRef[] = array(v.sourceRefs,'message sources',32).map(s => {
      assertClosed(s,['sourceId','jsonPointer','quote'],'conversation source reference');
      const pointer = s.jsonPointer === undefined ? undefined : text(s.jsonPointer,'JSON Pointer',4096,true);
      if (pointer !== undefined && pointer !== '' && (!pointer.startsWith('/') || /~(?![01])/.test(pointer))) fail('Invalid conversation JSON Pointer.');
      return { sourceId: safeIdentifier(s.sourceId), ...(pointer === undefined ? {} : { jsonPointer: pointer }), ...(s.quote === undefined ? {} : { quote: text(s.quote,'source quote') }) };
    });
    if (!sourceRefs.length) fail('Every conversation message needs retained sources.');
    const attachmentSourceIds = v.attachmentSourceIds === undefined ? undefined : ids(v.attachmentSourceIds,'attachment sources');
    const content = text(v.content,'content',262144,true), presentation = choice(v.presentation,['verbatim','normalized','summary'],'presentation'), completeness = choice(v.completeness,['complete','partial','unknown'],'completeness');
    if (!nonempty(content) && !attachmentSourceIds?.length) fail('A conversation message needs text or an actual attachment.');
    if (presentation === 'summary' && completeness === 'complete') fail('A summary cannot claim complete original-message coverage.');
    const message = { id: safeIdentifier(v.id), role: choice(v.role,['user','assistant','tool','notice'],'role'), format: choice(v.format,['text','markdown','json','code'],'format'), content, presentation, completeness,
      state: choice(v.state,['final','streaming','interrupted','waiting_confirmation','unknown'],'message state'), completionBasis: text(v.completionBasis,'completion basis'), sourceRefs, limitations: notes(v.limitations),
      ...(attachmentSourceIds === undefined ? {} : { attachmentSourceIds }), ...(v.displayName === undefined ? {} : { displayName: text(v.displayName,'display name',240) }), ...(v.language === undefined ? {} : { language: text(v.language,'language',80,true) }), ...(v.displayTime === undefined ? {} : { displayTime: text(v.displayTime,'display time',120) }) } as ConversationMessage;
    if (v.sentAt !== undefined) { assertTimestamp(v.sentAt,'conversation sentAt'); message.sentAt = v.sentAt; }
    if (v.observedAt !== undefined) { assertTimestamp(v.observedAt,'conversation observedAt'); message.observedAt = v.observedAt; }
    return message;
  });
  if (!messages.length || new Set(messages.map(m => m.id)).size !== messages.length) fail('Conversation messages must be nonempty and have unique IDs.');
  return { conversationVersion: 1, id: safeIdentifier(value.id), title: text(value.title,'title',4096), messages, limitations: notes(value.limitations) };
}
export function conversationSourceIds(doc: ConversationArtifact): string[] { return [...new Set(doc.messages.flatMap(m => [...m.sourceRefs.map(s => s.sourceId), ...(m.attachmentSourceIds ?? [])]))]; }
export function parseConversationBytes(bytes: Uint8Array): ConversationArtifact {
  if (bytes.byteLength > CONVERSATION_MAX_BYTES) fail('Conversation artifact exceeds the 8 MiB bound; retain smaller explicitly scoped artifacts.');
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8',{ fatal: true }).decode(bytes).replace(/^\uFEFF/,'')); } catch { fail('Conversation evidence must be valid UTF-8 JSON.'); }
  return parseConversation(value);
}
export function pointerValue(text: string, pointer?: string): string {
  if (pointer === undefined) return text;
  if (pointer !== '' && (!pointer.startsWith('/') || /~(?![01])/.test(pointer))) fail('Invalid conversation JSON Pointer.');
  let value: unknown;
  try { value = JSON.parse(text.replace(/^\uFEFF/,'')); } catch { fail('Conversation JSON Pointer requires a JSON source.'); }
  for (const encoded of pointer === '' ? [] : pointer.slice(1).split('/')) {
    const key = encoded.replace(/~1/g,'/').replace(/~0/g,'~');
    if (!value || typeof value !== 'object' || !Object.hasOwn(value,key)) fail('Conversation source JSON Pointer does not exist.');
    value = (value as Record<string,unknown>)[key];
  }
  return typeof value === 'string' ? value : JSON.stringify(value,null,2);
}
export interface ConversationSourceContent { text?: string; excluded?: boolean; binary?: boolean }
/** Exact source membership is checked; normalized Markdown meaning remains the author's responsibility. */
export function validateConversationSources(doc: ConversationArtifact, sources: ReadonlyMap<string, ConversationSourceContent>): void {
  for (const id of conversationSourceIds(doc)) if (!sources.has(id) || sources.get(id)?.excluded) fail('Conversation source is missing or excluded: ' + id);
  for (const message of doc.messages) {
    let literalSupported = !message.content;
    for (const ref of message.sourceRefs) {
      const source = sources.get(ref.sourceId)!;
      if (source.text === undefined) { if (!message.attachmentSourceIds?.includes(ref.sourceId) || ref.jsonPointer !== undefined || ref.quote !== undefined) fail('Non-text conversation sources require an explicit attachment reference.'); continue; }
      const selected = pointerValue(source.text,ref.jsonPointer);
      if (ref.quote !== undefined && !selected.includes(ref.quote)) fail('Conversation quote is absent from its retained source: ' + ref.sourceId);
      if ((ref.quote ?? selected).includes(message.content)) literalSupported = true;
    }
    if (message.presentation === 'verbatim' && !literalSupported) fail('A verbatim conversation message must match its retained source, not an AI summary.');
  }
}
export function validateConversationActions(payload: RecordPayload, docs: Readonly<Record<string, ConversationArtifact>>): void {
  for (const observation of payload.observations) for (const action of observation.actions ?? []) {
    let verbatimInputSupported=false;
    for (const ref of action.conversations ?? []) {
    if (!action.evidenceIds.includes(ref.evidenceId)) fail('Conversation evidence must belong to its actual action.');
    const doc = docs[ref.evidenceId]; if (!doc) fail('Action conversation is absent or excluded: ' + ref.evidenceId);
    if (ref.messageIds.some(id => !doc.messages.some(m => m.id === id))) fail('Action refers to an unknown conversation message.');
      if(doc.messages.some(m => ref.messageIds.includes(m.id) && m.role === 'user' && m.presentation === 'verbatim' && m.content === action.input))verbatimInputSupported=true;
    }
    if(action.conversations?.length&&action.inputPresentation==='verbatim'&&action.input&&!verbatimInputSupported)fail('Verbatim action input must match a linked original user message.');
  }
}
