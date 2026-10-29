/** Parse untrusted JSON before it reaches the transaction layer. */
import type { Basis, EvidenceCatalog, EvidenceItem, EvidenceOperation, EvidenceRequest, Manifest, PendingEvidence, RecordPayload, RecordRequest, ResultEntry, Results, Observation, Assessment, Diagnosis, ContextFact, ExecutionContext, ActionFact, EvidenceLink, Phenomenon, GapDetail, ReproductionPreparation, Finding, EvidenceMetadata } from '../contracts/model.mjs';
import { assertClosed, assertTimestamp, fail, nonempty, safeIdentifier } from './common.mjs';
export const statusValues = ['verified', 'violation', 'inconclusive', 'not_tested'] as const;
export const causeValues = ['product', 'agent', 'environment', 'spec', 'unknown'] as const;
export const kindValues = ['screenshot', 'dom', 'tool_receipt', 'log', 'other'] as const;
export function oneOf<const T extends readonly string[]>(value: unknown, values: T, label: string): T[number] {
  if (typeof value !== 'string' || !values.some(item => item === value)) fail('Invalid ' + label + '.');
  return value as T[number];
}
export function textValue(value: unknown, label: string, { empty = false, limit = Infinity } = {}): string {
  if (typeof value !== 'string' || (!empty && !nonempty(value)) || value.length > limit) fail('Invalid ' + label + '.');
  return value;
}
export function arrayValue(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail('Invalid ' + label + ' array.'); return value;
}
export function strings(value: unknown, label: string): string[] { return arrayValue(value, label).map(item => textValue(item, label)); }
export function integer(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) fail('Invalid ' + label + '.'); return value;
}
export function sha256Value(value: unknown, label = 'SHA-256'): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail('Invalid ' + label + '.'); return value;
}
export function timeValue(value: unknown, label: string): string { assertTimestamp(value, label); return value; }
export function uniqueStrings(value: unknown, label: string, identifiers = false): string[] {
  const values = identifiers ? arrayValue(value, label).map(item => safeIdentifier(item, label)) : strings(value, label);
  if (new Set(values).size !== values.length) fail('Duplicate ' + label + '.'); return values;
}
export function parseBasis(value: unknown): Basis {
  assertClosed(value, ['kind', 'source', 'text'], 'basis');
  return { kind: oneOf(value.kind, ['explicit', 'interpretation', 'hypothesis'], 'basis kind'), source: textValue(value.source, 'basis source'), text: textValue(value.text, 'basis text') };
}
export function parseObservation(value: unknown): Observation {
  assertClosed(value, ['id', 'summary', 'coveredRefs', 'evidenceIds', 'contextId', 'actual', 'occurredAt', 'actions', 'evidenceLinks'], 'observation');
  const actions = value.actions === undefined ? undefined : arrayValue(value.actions, 'actions').map(parseActionFact);
  if (actions && new Set(actions.map(a => a.id)).size !== actions.length) fail('Duplicate action ID in observation.');
  return { id: safeIdentifier(value.id, 'observation ID'), summary: textValue(value.summary, 'observation summary'), coveredRefs: uniqueStrings(value.coveredRefs, 'coveredRefs'), evidenceIds: uniqueStrings(value.evidenceIds, 'evidenceIds', true),
    ...(value.contextId === undefined ? {} : { contextId: safeIdentifier(value.contextId, 'context ID') }),
    ...(value.actual === undefined ? {} : { actual: textValue(value.actual, 'actual observation') }),
    ...(value.occurredAt === undefined ? {} : { occurredAt: timeValue(value.occurredAt, 'observation occurredAt') }),
    ...(actions ? { actions } : {}), ...(value.evidenceLinks === undefined ? {} : { evidenceLinks: arrayValue(value.evidenceLinks, 'evidence links').map(parseEvidenceLink) }) };
}
export function parseDiagnosis(value: unknown): Diagnosis {
  assertClosed(value, ['state', 'category', 'summary', 'evidenceIds'], 'diagnosis');
  return { state: oneOf(value.state, ['unknown', 'hypothesis', 'confirmed'], 'diagnosis state'), category: oneOf(value.category, causeValues, 'diagnosis category'), summary: textValue(value.summary, 'diagnosis summary'), evidenceIds: uniqueStrings(value.evidenceIds, 'diagnosis evidenceIds', true) };
}
export function parseAssessment(value: unknown): Assessment {
  assertClosed(value, ['goalId', 'status', 'rationale', 'observationIds', 'gaps', 'diagnosis', 'summary', 'phenomena', 'gapDetails', 'revisionReason', 'previousOperationId', 'reproduction'], 'assessment');
  const phenomena = value.phenomena === undefined ? undefined : arrayValue(value.phenomena, 'phenomena').map(parsePhenomenon);
  if (phenomena && new Set(phenomena.map(p => p.id)).size !== phenomena.length) fail('Duplicate phenomenon ID in assessment.');
  if (value.previousOperationId !== undefined && value.revisionReason === undefined) fail('An assessment revision reference requires a reason.');
  return { goalId: safeIdentifier(value.goalId, 'goal ID'), status: oneOf(value.status, statusValues, 'goal status'), rationale: textValue(value.rationale, 'assessment rationale'), observationIds: uniqueStrings(value.observationIds, 'observationIds', true), gaps: strings(value.gaps, 'assessment gaps'), ...(value.diagnosis === undefined ? {} : { diagnosis: parseDiagnosis(value.diagnosis) }),
    ...(value.summary === undefined ? {} : { summary: textValue(value.summary, 'assessment summary') }), ...(phenomena ? { phenomena } : {}),
    ...(value.gapDetails === undefined ? {} : { gapDetails: arrayValue(value.gapDetails, 'gap details').map(parseGapDetail) }),
    ...(value.revisionReason === undefined ? {} : { revisionReason: textValue(value.revisionReason, 'revision reason') }),
    ...(value.previousOperationId === undefined ? {} : { previousOperationId: safeIdentifier(value.previousOperationId, 'previous operation') }),
    ...(value.reproduction === undefined ? {} : { reproduction: parseReproduction(value.reproduction) }) };
}
export function parsePayload(value: unknown): RecordPayload {
  assertClosed(value, ['observations', 'assessments', 'contexts', 'findings'], 'record payload');
  const observations = arrayValue(value.observations, 'observations').map(parseObservation), assessments = arrayValue(value.assessments, 'assessments').map(parseAssessment);
  const contexts = value.contexts === undefined ? undefined : arrayValue(value.contexts, 'contexts').map(parseExecutionContext), findings = value.findings === undefined ? undefined : arrayValue(value.findings, 'findings').map(parseFinding);
  if (!observations.length && !assessments.length && !contexts?.length && !findings?.length) fail('A record must contain observations, contexts, findings or explicit goal assessments.');
  if (new Set(observations.map(item => item.id)).size !== observations.length) fail('Duplicate observation ID in record.');
  if (new Set(assessments.map(item => item.goalId)).size !== assessments.length) fail('Duplicate goal assessment in record.');
  if (contexts && new Set(contexts.map(c => c.id)).size !== contexts.length) fail('Duplicate context ID in record.');
  if (findings && new Set(findings.map(f => f.id)).size !== findings.length) fail('Duplicate finding ID in record.');
  return { observations, assessments, ...(contexts ? { contexts } : {}), ...(findings ? { findings } : {}) };
}
export function parseRecordRequest(value: unknown): RecordRequest {
  assertClosed(value, ['schemaVersion', 'operationId', 'expectedRevision', 'caseId', 'mode', 'record'], 'record request');
  if (value.schemaVersion !== 7) fail('Record requests require schemaVersion 7.');
  return { schemaVersion: 7, operationId: safeIdentifier(value.operationId, 'operation ID'), expectedRevision: integer(value.expectedRevision, 'record revision'), caseId: safeIdentifier(value.caseId, 'case ID'), mode: oneOf(value.mode, ['final', 'attempt'], 'record mode'), record: parsePayload(value.record) };
}
export function parseEvidenceRequest(value: unknown): EvidenceRequest {
  assertClosed(value, ['schemaVersion', 'operationId', 'expectedRevision', 'caseId', 'sourceFile', 'kind', 'capturedAt', 'source', 'description', 'metadata'], 'evidence request');
  if (value.schemaVersion !== 7) fail('Evidence requests require schemaVersion 7.');
  return { schemaVersion: 7, operationId: safeIdentifier(value.operationId), expectedRevision: integer(value.expectedRevision, 'evidence revision'), caseId: safeIdentifier(value.caseId), sourceFile: textValue(value.sourceFile, 'sourceFile'), kind: oneOf(value.kind, kindValues, 'evidence kind'), source: textValue(value.source, 'evidence source', { limit: 4096 }), description: textValue(value.description, 'evidence description', { limit: 4096 }), ...(Object.hasOwn(value, 'capturedAt') ? { capturedAt: timeValue(value.capturedAt, 'capturedAt') } : {}), ...(value.metadata === undefined ? {} : { metadata: parseEvidenceMetadata(value.metadata) }) };
}
export function parseManifest(value: unknown): Manifest {
  assertClosed(value, ['schemaVersion', 'baselineSchemaVersion', 'runId', 'projectDir', 'baselineSha256', 'executionFile'], 'manifest');
  if (value.schemaVersion !== 7 || value.baselineSchemaVersion !== 7) fail('Unsupported run schema version. Only schemaVersion 7 is supported; existing files are not migrated.');
  if (value.executionFile !== 'execution.json') fail('Invalid execution reference.');
  return { schemaVersion: 7, baselineSchemaVersion: 7, runId: textValue(value.runId, 'run ID'), projectDir: textValue(value.projectDir, 'project directory'), baselineSha256: sha256Value(value.baselineSha256), executionFile: 'execution.json' };
}
export function parseEvidenceItem(value: unknown): EvidenceItem {
  assertClosed(value, ['id', 'path', 'caseId', 'kind', 'capturedAt', 'collectedAt', 'source', 'description', 'sha256', 'bytes', 'operationId', 'metadata'], 'evidence item');
  return { id: safeIdentifier(value.id), path: textValue(value.path, 'evidence path'), caseId: safeIdentifier(value.caseId), kind: oneOf(value.kind, kindValues, 'evidence kind'), collectedAt: timeValue(value.collectedAt, 'collectedAt'), source: textValue(value.source, 'source'), description: textValue(value.description, 'description'), sha256: sha256Value(value.sha256), bytes: integer(value.bytes, 'bytes'), operationId: safeIdentifier(value.operationId), ...(Object.hasOwn(value, 'capturedAt') ? { capturedAt: timeValue(value.capturedAt, 'capturedAt') } : {}), ...(value.metadata === undefined ? {} : { metadata: parseEvidenceMetadata(value.metadata) }) };
}
function parseEvidenceOperation(value: unknown): EvidenceOperation {
  assertClosed(value, ['operationId', 'payloadSha256', 'revision', 'committedAt', 'caseId', 'evidenceId', 'path', 'sha256', 'bytes'], 'evidence operation');
  return { operationId: safeIdentifier(value.operationId), payloadSha256: sha256Value(value.payloadSha256), revision: integer(value.revision, 'revision', 1), committedAt: timeValue(value.committedAt, 'committedAt'), caseId: safeIdentifier(value.caseId), evidenceId: safeIdentifier(value.evidenceId), path: textValue(value.path, 'path'), sha256: sha256Value(value.sha256), bytes: integer(value.bytes, 'bytes') };
}
export function parseCatalog(value: unknown): EvidenceCatalog {
  assertClosed(value, ['schemaVersion', 'revision', 'items', 'operations'], 'evidence catalog');
  if (value.schemaVersion !== 7) fail('Evidence catalog requires schemaVersion 7.');
  return { schemaVersion: 7, revision: integer(value.revision, 'evidence revision'), items: arrayValue(value.items, 'evidence items').map(parseEvidenceItem), operations: arrayValue(value.operations, 'evidence operations').map(parseEvidenceOperation) };
}
export function parseResultEntry(value: unknown): ResultEntry {
  assertClosed(value, ['operationId', 'payloadSha256', 'expectedRevision', 'revision', 'recordedAt', 'caseId', 'mode', 'record'], 'result entry');
  return { operationId: safeIdentifier(value.operationId), payloadSha256: sha256Value(value.payloadSha256), expectedRevision: integer(value.expectedRevision, 'expectedRevision'), revision: integer(value.revision, 'revision', 1), recordedAt: timeValue(value.recordedAt, 'recordedAt'), caseId: safeIdentifier(value.caseId), mode: oneOf(value.mode, ['final', 'attempt'], 'record mode'), record: parsePayload(value.record) };
}
export function parseResults(value: unknown): Results {
  assertClosed(value, ['schemaVersion', 'revision', 'entries'], 'results');
  if (value.schemaVersion !== 7) fail('Results require schemaVersion 7.');
  return { schemaVersion: 7, revision: integer(value.revision, 'results revision'), entries: arrayValue(value.entries, 'entries').map(parseResultEntry) };
}
export function parsePendingEvidence(value: unknown): PendingEvidence {
  assertClosed(value, ['schemaVersion', 'operationId', 'payloadSha256', 'evidenceId', 'stagePath', 'finalPath', 'catalogTempPath', 'markerTempPath', 'sha256', 'bytes'], 'pending evidence marker');
  if (value.schemaVersion !== 7) fail('Pending evidence marker requires schemaVersion 7.');
  return { schemaVersion: 7, operationId: safeIdentifier(value.operationId), payloadSha256: sha256Value(value.payloadSha256), evidenceId: safeIdentifier(value.evidenceId), stagePath: textValue(value.stagePath, 'stagePath'), finalPath: textValue(value.finalPath, 'finalPath'), catalogTempPath: textValue(value.catalogTempPath, 'catalogTempPath'), markerTempPath: textValue(value.markerTempPath, 'markerTempPath'), ...(value.sha256 === undefined ? {} : { sha256: sha256Value(value.sha256) }), ...(value.bytes === undefined ? {} : { bytes: integer(value.bytes, 'pending bytes') }) };
}

export function parseContextFact(value: unknown): ContextFact {
  assertClosed(value, ['state', 'value', 'reason', 'sourceEvidenceIds'], 'context fact');
  const state = oneOf(value.state, ['known', 'unknown', 'not_applicable'], 'context fact state');
  if (state === 'known' && value.value === undefined) fail('Known context facts require a value.');
  if (state !== 'known' && value.reason === undefined) fail('Unknown or inapplicable context facts require a reason.');
  if (state !== 'known' && value.value !== undefined) fail('Unknown or inapplicable facts must not assert a value.');
  return { state, sourceEvidenceIds: uniqueStrings(value.sourceEvidenceIds, 'context source evidence', true),
    ...(value.value === undefined ? {} : { value: textValue(value.value, 'context value') }),
    ...(value.reason === undefined ? {} : { reason: textValue(value.reason, 'context reason') }) };
}
export function parseExecutionContext(value: unknown): ExecutionContext {
  assertClosed(value, ['id', 'environment', 'actor', 'object', 'initialState', 'authorization', 'notes'], 'execution context');
  return { id: safeIdentifier(value.id, 'context ID'), environment: parseContextFact(value.environment), actor: parseContextFact(value.actor), object: parseContextFact(value.object), initialState: parseContextFact(value.initialState), authorization: parseContextFact(value.authorization), ...(value.notes === undefined ? {} : { notes: textValue(value.notes, 'context notes') }) };
}
export function parseActionFact(value: unknown): ActionFact {
  assertClosed(value, ['id', 'description', 'input', 'result', 'planRefs', 'evidenceIds', 'occurredAt'], 'action fact');
  return { id: safeIdentifier(value.id, 'action ID'), description: textValue(value.description, 'actual action'), planRefs: uniqueStrings(value.planRefs, 'action plan references'), evidenceIds: uniqueStrings(value.evidenceIds, 'action evidence', true),
    ...(value.input === undefined ? {} : { input: textValue(value.input, 'action input') }), ...(value.result === undefined ? {} : { result: textValue(value.result, 'action result') }),
    ...(value.occurredAt === undefined ? {} : { occurredAt: timeValue(value.occurredAt, 'action occurredAt') }) };
}
export function parseEvidenceLink(value: unknown): EvidenceLink {
  assertClosed(value, ['evidenceId', 'purpose', 'fact', 'actionId', 'limitations'], 'evidence link');
  return { evidenceId: safeIdentifier(value.evidenceId, 'linked evidence'), purpose: textValue(value.purpose, 'evidence purpose'), fact: textValue(value.fact, 'supported fact'), limitations: strings(value.limitations, 'evidence limitations'), ...(value.actionId === undefined ? {} : { actionId: safeIdentifier(value.actionId, 'linked action') }) };
}
export function parsePhenomenon(value: unknown): Phenomenon {
  assertClosed(value, ['id', 'title', 'actual', 'observationIds', 'evidenceIds', 'limitations'], 'phenomenon');
  return { id: safeIdentifier(value.id, 'phenomenon ID'), title: textValue(value.title, 'phenomenon title'), actual: textValue(value.actual, 'phenomenon actual'), observationIds: uniqueStrings(value.observationIds, 'phenomenon observations', true), evidenceIds: uniqueStrings(value.evidenceIds, 'phenomenon evidence', true), limitations: strings(value.limitations, 'phenomenon limitations') };
}
export function parseGapDetail(value: unknown): GapDetail {
  assertClosed(value, ['kind', 'missing', 'impact', 'nextStep'], 'gap detail');
  return { kind: oneOf(value.kind, ['record', 'evidence', 'environment', 'authorization', 'requirement'], 'gap kind'), missing: textValue(value.missing, 'missing fact'), impact: textValue(value.impact, 'gap impact'), ...(value.nextStep === undefined ? {} : { nextStep: textValue(value.nextStep, 'gap next step') }) };
}
export function parseReproduction(value: unknown): ReproductionPreparation {
  assertClosed(value, ['preparation', 'limitations', 'objectState', 'repeatability'], 'reproduction preparation');
  return { preparation: strings(value.preparation, 'reproduction preparation'), limitations: strings(value.limitations, 'reproduction limitations'), objectState: textValue(value.objectState, 'object state'), repeatability: textValue(value.repeatability, 'repeatability') };
}
export function parseFinding(value: unknown): Finding {
  assertClosed(value, ['id', 'title', 'goalIds', 'observationIds', 'evidenceIds', 'relationReason', 'reviewState', 'scope'], 'finding');
  return { id: safeIdentifier(value.id, 'finding ID'), title: textValue(value.title, 'finding title'), goalIds: uniqueStrings(value.goalIds, 'finding goals', true), observationIds: uniqueStrings(value.observationIds, 'finding observations', true), evidenceIds: uniqueStrings(value.evidenceIds, 'finding evidence', true), relationReason: textValue(value.relationReason, 'finding relation reason'), reviewState: oneOf(value.reviewState, ['proposed', 'reviewed'], 'finding review state'), scope: oneOf(value.scope, ['original', 'additional'], 'finding scope') };
}
export function parseEvidenceMetadata(value: unknown): EvidenceMetadata {
  assertClosed(value, ['mediaType', 'encoding', 'scope', 'page', 'object', 'purpose', 'limitations', 'contextEvidenceIds', 'contentState', 'redaction', 'omissionReason', 'width', 'height'], 'evidence metadata');
  const result: EvidenceMetadata = {};
  for (const field of ['mediaType', 'encoding', 'page', 'object', 'purpose', 'redaction', 'omissionReason'] as const) if (value[field] !== undefined) result[field] = textValue(value[field], 'evidence ' + field, { limit: 4096 });
  if (value.scope !== undefined) result.scope = oneOf(value.scope, ['page', 'viewport', 'element', 'document', 'unknown'], 'evidence scope');
  if (value.contentState !== undefined) result.contentState = oneOf(value.contentState, ['full', 'selected_fields', 'summary', 'truncated', 'excluded', 'failed', 'unknown'], 'evidence content state');
  if (value.limitations !== undefined) result.limitations = strings(value.limitations, 'evidence limitations');
  if (value.contextEvidenceIds !== undefined) result.contextEvidenceIds = uniqueStrings(value.contextEvidenceIds, 'context evidence IDs', true);
  if (value.width !== undefined) result.width = integer(value.width, 'evidence width', 1);
  if (value.height !== undefined) result.height = integer(value.height, 'evidence height', 1);
  if ((result.width === undefined) !== (result.height === undefined)) fail('Evidence dimensions require both width and height.');
  if (['truncated', 'excluded', 'failed'].includes(result.contentState ?? '') && !result.omissionReason) fail('Incomplete evidence content requires an omission reason.');
  return result;
}

/** Every new fact relation participates in packet mapping and ownership checks. */
export function payloadEvidenceIds(payload: RecordPayload): string[] {
  return [...new Set([
    ...(payload.contexts ?? []).flatMap(c => [c.environment, c.actor, c.object, c.initialState, c.authorization].flatMap(f => f.sourceEvidenceIds)),
    ...payload.observations.flatMap(o => [...o.evidenceIds, ...(o.actions ?? []).flatMap(a => a.evidenceIds), ...(o.evidenceLinks ?? []).map(l => l.evidenceId)]),
    ...payload.assessments.flatMap(a => [...(a.diagnosis?.evidenceIds ?? []), ...(a.phenomena ?? []).flatMap(p => p.evidenceIds)]),
    ...(payload.findings ?? []).flatMap(f => f.evidenceIds)
  ])];
}
export function mapPayloadEvidence(payload: RecordPayload, map: (id: string) => string): RecordPayload {
  const fact = (f: ContextFact): ContextFact => ({ ...f, sourceEvidenceIds: f.sourceEvidenceIds.map(map) });
  return { ...payload,
    ...(payload.contexts ? { contexts: payload.contexts.map(c => ({ ...c, environment: fact(c.environment), actor: fact(c.actor), object: fact(c.object), initialState: fact(c.initialState), authorization: fact(c.authorization) })) } : {}),
    observations: payload.observations.map(o => ({ ...o, evidenceIds: o.evidenceIds.map(map), ...(o.actions ? { actions: o.actions.map(a => ({ ...a, evidenceIds: a.evidenceIds.map(map) })) } : {}), ...(o.evidenceLinks ? { evidenceLinks: o.evidenceLinks.map(l => ({ ...l, evidenceId: map(l.evidenceId) })) } : {}) })),
    assessments: payload.assessments.map(a => ({ ...a, ...(a.diagnosis ? { diagnosis: { ...a.diagnosis, evidenceIds: a.diagnosis.evidenceIds.map(map) } } : {}), ...(a.phenomena ? { phenomena: a.phenomena.map(p => ({ ...p, evidenceIds: p.evidenceIds.map(map) })) } : {}) })),
    ...(payload.findings ? { findings: payload.findings.map(f => ({ ...f, evidenceIds: f.evidenceIds.map(map) })) } : {})
  };
}
