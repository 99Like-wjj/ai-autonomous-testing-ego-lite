/** Facts and explicit AI dispositions only. This module never executes or retries business actions. */
import type { ActionAttemptProjection, ActionEvent, ContextFact, FactSource, RecordPayload, RunContext } from '../contracts/model.mjs';
import { assertClosed, canonical, fail, safeIdentifier } from './common.mjs';
import { arrayValue, oneOf, textValue, timeValue, uniqueStrings } from './validation.mjs';

export function parseFactSource(value: unknown): FactSource {
  assertClosed(value, ['kind', 'reference', 'evidenceIds'], 'fact source');
  const result = { kind: oneOf(value.kind, ['evidence', 'requirement', 'user_confirmation', 'resource', 'other'], 'fact source kind'), reference: textValue(value.reference, 'fact source reference'), evidenceIds: uniqueStrings(value.evidenceIds, 'fact source evidenceIds', true) };
  if (result.kind === 'evidence' && !result.evidenceIds.length) fail('Evidence fact sources require evidence references.');
  return result;
}
export function parseContextFact(value: unknown): ContextFact {
  assertClosed(value, ['state', 'summary', 'sources'], 'context fact');
  const result = { state: oneOf(value.state, ['known', 'unknown', 'not_applicable'], 'context fact state'), summary: textValue(value.summary, 'context fact summary'), sources: arrayValue(value.sources, 'context fact sources').map(parseFactSource) };
  if (result.state === 'known' && !result.sources.length) fail('Known context facts require source references.');
  return result;
}
const contextFields = ['environment', 'identity', 'objects', 'initialState', 'authorization'] as const;
export function parseRunContext(value: unknown): RunContext {
  assertClosed(value, ['id', ...contextFields, 'notes'], 'run context');
  return { ...(value.notes===undefined?{}:{notes:textValue(value.notes,'context notes')}), id: safeIdentifier(value.id, 'context ID'), environment: parseContextFact(value.environment), identity: parseContextFact(value.identity), objects: parseContextFact(value.objects), initialState: parseContextFact(value.initialState), authorization: parseContextFact(value.authorization) };
}
export function parseActionEvent(value: unknown): ActionEvent {
  assertClosed(value, ['id', 'actionId', 'kind', 'purpose', 'contextId', 'actor', 'summary', 'sideEffectRisk', 'evidenceIds', 'occurredAt', 'timeSource', 'planRef', 'target', 'inputs', 'sideEffects', 'dispatchState', 'acceptanceState', 'resultState', 'readOnly', 'observationWindow', 'disposition', 'conflictsWithEventIds', 'retry'], 'action event');
  const event: ActionEvent = { id: safeIdentifier(value.id, 'action event ID'), actionId: safeIdentifier(value.actionId, 'action ID'), kind: oneOf(value.kind, ['intent', 'dispatch', 'result', 'reconciliation', 'disposition'], 'action event kind'), purpose: oneOf(value.purpose, ['prepare', 'test', 'reproduce', 'recover', 'cleanup', 'explore'], 'action purpose'), contextId: safeIdentifier(value.contextId, 'action context ID'), actor: textValue(value.actor, 'action actor'), summary: textValue(value.summary, 'action summary'), sideEffectRisk: oneOf(value.sideEffectRisk, ['none', 'possible', 'unknown'], 'side-effect risk'), evidenceIds: uniqueStrings(value.evidenceIds, 'action evidenceIds', true) };
  for (const key of ['timeSource', 'planRef', 'target'] as const) if (value[key] !== undefined) event[key] = textValue(value[key], key);
  for (const key of ['inputs', 'sideEffects'] as const) if (value[key] !== undefined) event[key] = uniqueStrings(value[key], key);
  if (value.occurredAt !== undefined) event.occurredAt = timeValue(value.occurredAt, 'action occurredAt');
  if ((event.occurredAt === undefined) !== (event.timeSource === undefined)) fail('Action occurrence time and its source must be supplied together.');
  if (value.conflictsWithEventIds !== undefined) event.conflictsWithEventIds = uniqueStrings(value.conflictsWithEventIds, 'conflicting event IDs', true);
  if (value.dispatchState !== undefined) event.dispatchState = oneOf(value.dispatchState, ['issued', 'not_issued', 'unknown'], 'dispatch state');
  if (value.acceptanceState !== undefined) event.acceptanceState = oneOf(value.acceptanceState, ['accepted', 'rejected', 'unknown', 'not_applicable'], 'acceptance state');
  if (value.resultState !== undefined) event.resultState = oneOf(value.resultState, ['known', 'processing', 'window_incomplete', 'failed', 'unknown'], 'result state');
  if (value.readOnly !== undefined) { if (value.readOnly !== true) fail('Reconciliation must be explicitly read-only.'); event.readOnly = true; }
  if (value.observationWindow !== undefined) {
    const window = value.observationWindow; assertClosed(window, ['startedAt', 'endedAt', 'source', 'limitation'], 'action observation window');
    event.observationWindow = { startedAt: timeValue(window.startedAt, 'observation start'), endedAt: timeValue(window.endedAt, 'observation end'), source: textValue(window.source, 'observation time source'), limitation: textValue(window.limitation, 'observation window limitation') };
    if (Date.parse(event.observationWindow.endedAt) < Date.parse(event.observationWindow.startedAt)) fail('Observation window ends before it starts.');
  }
  if (value.disposition !== undefined) {
    const d = value.disposition; assertClosed(d, ['state', 'rationale', 'scope', 'limitations', 'resolvesEventIds'], 'action disposition');
    event.disposition = { state: oneOf(d.state, ['confirmed_occurred', 'confirmed_not_occurred', 'unknown', 'deferred', 'conflicting'], 'action disposition state'), rationale: textValue(d.rationale, 'disposition rationale'), scope: textValue(d.scope, 'disposition scope'), limitations: uniqueStrings(d.limitations, 'disposition limitations'), resolvesEventIds: uniqueStrings(d.resolvesEventIds, 'disposition event IDs', true) };
  }
  if (value.retry !== undefined) {
    const retry = value.retry; assertClosed(retry, ['actionId', 'rationale', 'authorizationSources', 'idempotencyBasis'], 'action retry');
    event.retry = { actionId: safeIdentifier(retry.actionId, 'previous action ID'), rationale: textValue(retry.rationale, 'retry rationale'), authorizationSources: arrayValue(retry.authorizationSources, 'retry authorization sources').map(parseFactSource), ...(retry.idempotencyBasis === undefined ? {} : { idempotencyBasis: parseContextFact(retry.idempotencyBasis) }) };
    if (!event.retry.authorizationSources.length) fail('A new attempt requires current retry authorization sources.');
  }
  if (event.kind === 'intent' && (!event.target || !event.inputs || !event.sideEffects)) fail('Intent requires target, key inputs and possible side effects.');
  if (event.kind === 'dispatch' && (!event.dispatchState || !event.acceptanceState)) fail('Dispatch observations require dispatch and acceptance states.');
  if (['result', 'reconciliation'].includes(event.kind) && !event.resultState) fail('Result observations require an explicit result state.');
  if (event.kind === 'reconciliation' && !event.readOnly) fail('Reconciliation must be explicitly read-only.');
  if (event.kind === 'disposition' && !event.disposition) fail('Disposition events require an explicit AI disposition.');
  if (event.dispatchState && event.kind !== 'dispatch' || event.acceptanceState && event.kind !== 'dispatch' || event.resultState && !['result', 'reconciliation'].includes(event.kind) || event.readOnly && event.kind !== 'reconciliation' || event.disposition && event.kind !== 'disposition') fail('Action state fields do not match the event kind.');
  if (event.resultState === 'window_incomplete' && !event.observationWindow) fail('An incomplete observation window requires its actual bounds and limitation.');
  if (event.observationWindow && !['result', 'reconciliation'].includes(event.kind)) fail('Observation windows belong to result or reconciliation events.');
  if ((event.kind === 'disposition' || event.kind === 'reconciliation' || event.dispatchState && event.dispatchState !== 'unknown' || event.resultState && event.resultState !== 'unknown' || event.conflictsWithEventIds?.length) && !event.evidenceIds.length) fail('Confirmed action facts, reconciliation, conflicts and dispositions require evidence references.');
  if (event.disposition && !event.disposition.resolvesEventIds.length) fail('Disposition must identify the facts it addresses.');
  return event;
}
export function recordEvidenceIds(record: RecordPayload): string[] {
  const sources = (fact: ContextFact) => fact.sources.flatMap(source => source.evidenceIds);
  return [...record.observations.flatMap(o => [...o.evidenceIds,...(o.actions??[]).flatMap(a=>a.evidenceIds),...(o.evidenceLinks??[]).map(l=>l.evidenceId)]), ...record.assessments.flatMap(a => [...(a.diagnosis?.evidenceIds ?? []),...(a.phenomena??[]).flatMap(p=>p.evidenceIds)]),...(record.findings??[]).flatMap(f=>f.evidenceIds), ...(record.contexts ?? []).flatMap(c => contextFields.flatMap(key => sources(c[key]))), ...(record.actionEvents ?? []).flatMap(event => [...event.evidenceIds, ...(event.retry?.authorizationSources.flatMap(s => s.evidenceIds) ?? []), ...(event.retry?.idempotencyBasis ? sources(event.retry.idempotencyBasis) : [])])];
}
export function mapRecordEvidence(record: RecordPayload, map: (id: string) => string): RecordPayload {
  const source = (s: FactSource): FactSource => ({ ...s, evidenceIds: s.evidenceIds.map(map) });
  const fact = (f: ContextFact): ContextFact => ({ ...f, sources: f.sources.map(source) });
  return { observations: record.observations.map(o => ({ ...o, evidenceIds: o.evidenceIds.map(map), ...(o.actions?{actions:o.actions.map(a=>({...a,evidenceIds:a.evidenceIds.map(map)}))}:{}), ...(o.evidenceLinks?{evidenceLinks:o.evidenceLinks.map(l=>({...l,evidenceId:map(l.evidenceId)}))}:{}) })), findings: record.findings?.map(f=>({...f,evidenceIds:f.evidenceIds.map(map)}))??[], assessments: record.assessments.map(a => ({ ...a, ...(a.phenomena?{phenomena:a.phenomena.map(p=>({...p,evidenceIds:p.evidenceIds.map(map)}))}:{}), ...(a.diagnosis ? { diagnosis: { ...a.diagnosis, evidenceIds: a.diagnosis.evidenceIds.map(map) } } : {}) })), ...(record.contexts === undefined ? {} : { contexts: record.contexts.map(c => ({ ...c, environment: fact(c.environment), identity: fact(c.identity), objects: fact(c.objects), initialState: fact(c.initialState), authorization: fact(c.authorization) })) }), ...(record.actionEvents === undefined ? {} : { actionEvents: record.actionEvents.map(e => ({ ...e, evidenceIds: e.evidenceIds.map(map), ...(e.retry ? { retry: { ...e.retry, authorizationSources: e.retry.authorizationSources.map(source), ...(e.retry.idempotencyBasis ? { idempotencyBasis: fact(e.retry.idempotencyBasis) } : {}) } } : {}) })) }) };
}
export interface ActionFacts { contexts: readonly RunContext[]; actionEvents: readonly ActionEvent[] }
export function validateActionFacts(record: RecordPayload, prior: ActionFacts, planRefs: ReadonlySet<string>, checkEvidence: (ids: readonly string[]) => void): ActionFacts {
  const contexts = new Map<string, RunContext>(), events = new Map<string, ActionEvent>();
  for (const c of [...prior.contexts, ...(record.contexts ?? [])]) { const old = contexts.get(c.id); if (old && canonical(old) !== canonical(c)) fail('Context ID was already used with different content: ' + c.id); contexts.set(c.id, c); }
  for (const e of [...prior.actionEvents, ...(record.actionEvents ?? [])]) {
    const old = events.get(e.id); if (old && canonical(old) !== canonical(e)) fail('Action event ID was already used with different content: ' + e.id);
    if (!contexts.has(e.contextId)) fail('Unknown action context ID: ' + e.contextId);
    if (e.planRef && !planRefs.has(e.planRef)) fail('Unknown action plan reference: ' + e.planRef);
    events.set(e.id, e);
  }
  const byAction = new Map<string, ActionEvent[]>();
  for (const event of events.values()) {
    const own = byAction.get(event.actionId) ?? [];
    if (own.some(e => e.purpose !== event.purpose)) fail('An action attempt cannot change its purpose: ' + event.actionId);
    if (['intent', 'dispatch'].includes(event.kind) && own.some(e => e.kind === event.kind)) fail('Each actual attempt allows one intent and one dispatch observation; use a new actionId for another attempt.');
    for (const id of [...(event.conflictsWithEventIds ?? []), ...(event.disposition?.resolvesEventIds ?? [])]) {
      const linked = events.get(id); if (!linked || linked.actionId !== event.actionId || linked.id === event.id) fail('Unknown, self or cross-action event reference: ' + id);
      if (!own.some(e => e.id === id)) fail('Action event references must address previously recorded facts: ' + id);
    }
    if (event.retry) {
      if (event.retry.actionId === event.actionId || !byAction.has(event.retry.actionId)) fail('Retry requires an earlier, different action attempt.');
      const previousRetry = own.find(e => e.retry)?.retry;
      if (previousRetry && canonical(previousRetry) !== canonical(event.retry)) fail('Retry basis cannot change within one attempt.');
    }
    own.push(event); byAction.set(event.actionId, own);
  }
  checkEvidence(recordEvidenceIds({ observations: [], assessments: [], contexts: [...contexts.values()], actionEvents: [...events.values()] }));
  return { contexts: [...contexts.values()], actionEvents: [...events.values()] };
}
export type { ActionAttemptProjection } from '../contracts/model.mjs';
/** Explicit scope coverage, not event order or result labels, can settle a potentially side-effecting attempt. */
export function projectActionAttempts(events: readonly ActionEvent[]): ActionAttemptProjection[] {
  const grouped = new Map<string, ActionEvent[]>();
  for (const e of events) { const own = grouped.get(e.actionId) ?? []; if (!own.some(old => old.id === e.id)) own.push(e); grouped.set(e.actionId, own); }
  return [...grouped].map(([actionId, own]) => {
    const dispositionEvents = own.filter(e => e.disposition), explicitIssues = own.some(e => e.conflictsWithEventIds?.length || ['unknown', 'deferred', 'conflicting'].includes(e.disposition?.state ?? ''));
    const pending = own.some(e => e.kind === 'intent' || e.sideEffectRisk !== 'none' || e.dispatchState === 'unknown' || ['unknown', 'processing', 'window_incomplete'].includes(e.resultState ?? '')) || explicitIssues;
    const settled = dispositionEvents.some(e => ['confirmed_occurred', 'confirmed_not_occurred'].includes(e.disposition!.state) && e.evidenceIds.length > 0 && !e.conflictsWithEventIds?.length && own.every(other => other.id === e.id || e.disposition!.resolvesEventIds.includes(other.id)));
    const reasons: string[] = [];
    if (pending && !settled) {
      if (own.some(e => e.kind === 'intent') && !own.some(e => e.kind === 'dispatch')) reasons.push('只有动作意图，没有派发回执，尚不能确认是否发出。');
      if (explicitIssues) reasons.push('结果仍为未知、暂缓或相互矛盾，尚无证据核对结论覆盖全部已登记事实。');
      if (!reasons.length) reasons.push('尚无证据核对结论覆盖这次尝试的全部记录。');
    }
    const label = own.find(e => e.kind === 'intent')?.summary ?? own[0]!.summary;
    const latestFact = own.filter(e => e.kind === 'disposition' || e.kind === 'result' || e.kind === 'reconciliation').at(-1);
    const detail = latestFact?.disposition?.rationale ?? latestFact?.summary ?? (reasons.join('；') || '尚未登记可核实的业务结果；操作意图或派发记录不代表业务已经完成。');
    return { actionId, label, detail, purpose: own[0]!.purpose, eventIds: own.map(e => e.id), issuedEventIds: own.filter(e => e.kind === 'dispatch' && e.dispatchState === 'issued').map(e => e.id), dispositionEventIds: dispositionEvents.map(e => e.id), unresolved: pending && !settled, reasons };
  });
}
