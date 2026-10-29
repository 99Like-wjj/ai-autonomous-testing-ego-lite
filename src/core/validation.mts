/** Parse untrusted JSON before it reaches the transaction layer. */
import type { Basis, EvidenceCatalog, EvidenceItem, EvidenceOperation, EvidenceRequest, Manifest, PendingEvidence, RecordPayload, RecordRequest, ResultEntry, Results, Observation, Assessment, Diagnosis } from '../contracts/model.mjs';
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
  assertClosed(value, ['id', 'summary', 'coveredRefs', 'evidenceIds'], 'observation');
  return { id: safeIdentifier(value.id, 'observation ID'), summary: textValue(value.summary, 'observation summary'), coveredRefs: uniqueStrings(value.coveredRefs, 'coveredRefs'), evidenceIds: uniqueStrings(value.evidenceIds, 'evidenceIds', true) };
}
export function parseDiagnosis(value: unknown): Diagnosis {
  assertClosed(value, ['state', 'category', 'summary', 'evidenceIds'], 'diagnosis');
  return { state: oneOf(value.state, ['unknown', 'hypothesis', 'confirmed'], 'diagnosis state'), category: oneOf(value.category, causeValues, 'diagnosis category'), summary: textValue(value.summary, 'diagnosis summary'), evidenceIds: uniqueStrings(value.evidenceIds, 'diagnosis evidenceIds', true) };
}
export function parseAssessment(value: unknown): Assessment {
  assertClosed(value, ['goalId', 'status', 'rationale', 'observationIds', 'gaps', 'diagnosis'], 'assessment');
  return { goalId: safeIdentifier(value.goalId, 'goal ID'), status: oneOf(value.status, statusValues, 'goal status'), rationale: textValue(value.rationale, 'assessment rationale'), observationIds: uniqueStrings(value.observationIds, 'observationIds', true), gaps: strings(value.gaps, 'assessment gaps'), ...(value.diagnosis === undefined ? {} : { diagnosis: parseDiagnosis(value.diagnosis) }) };
}
export function parsePayload(value: unknown): RecordPayload {
  assertClosed(value, ['observations', 'assessments'], 'record payload');
  const observations = arrayValue(value.observations, 'observations').map(parseObservation), assessments = arrayValue(value.assessments, 'assessments').map(parseAssessment);
  if (!observations.length && !assessments.length) fail('A record must contain observations or explicit goal assessments.');
  if (new Set(observations.map(item => item.id)).size !== observations.length) fail('Duplicate observation ID in record.');
  if (new Set(assessments.map(item => item.goalId)).size !== assessments.length) fail('Duplicate goal assessment in record.');
  return { observations, assessments };
}
export function parseRecordRequest(value: unknown): RecordRequest {
  assertClosed(value, ['schemaVersion', 'operationId', 'expectedRevision', 'caseId', 'mode', 'record'], 'record request');
  if (value.schemaVersion !== 5) fail('Record requests require schemaVersion 5.');
  return { schemaVersion: 5, operationId: safeIdentifier(value.operationId, 'operation ID'), expectedRevision: integer(value.expectedRevision, 'record revision'), caseId: safeIdentifier(value.caseId, 'case ID'), mode: oneOf(value.mode, ['final', 'attempt'], 'record mode'), record: parsePayload(value.record) };
}
export function parseEvidenceRequest(value: unknown): EvidenceRequest {
  assertClosed(value, ['schemaVersion', 'operationId', 'expectedRevision', 'caseId', 'sourceFile', 'kind', 'capturedAt', 'source', 'description'], 'evidence request');
  if (value.schemaVersion !== 5) fail('Evidence requests require schemaVersion 5.');
  return { schemaVersion: 5, operationId: safeIdentifier(value.operationId), expectedRevision: integer(value.expectedRevision, 'evidence revision'), caseId: safeIdentifier(value.caseId), sourceFile: textValue(value.sourceFile, 'sourceFile'), kind: oneOf(value.kind, kindValues, 'evidence kind'), source: textValue(value.source, 'evidence source', { limit: 4096 }), description: textValue(value.description, 'evidence description', { limit: 4096 }), ...(Object.hasOwn(value, 'capturedAt') ? { capturedAt: timeValue(value.capturedAt, 'capturedAt') } : {}) };
}
export function parseManifest(value: unknown): Manifest {
  assertClosed(value, ['schemaVersion', 'baselineSchemaVersion', 'runId', 'projectDir', 'baselineSha256', 'executionFile'], 'manifest');
  if (value.schemaVersion !== 5 || value.baselineSchemaVersion !== 5) fail('Unsupported run schema version. Only schemaVersion 5 is supported; existing files are not migrated.');
  if (value.executionFile !== 'execution.json') fail('Invalid execution reference.');
  return { schemaVersion: 5, baselineSchemaVersion: 5, runId: textValue(value.runId, 'run ID'), projectDir: textValue(value.projectDir, 'project directory'), baselineSha256: sha256Value(value.baselineSha256), executionFile: 'execution.json' };
}
export function parseEvidenceItem(value: unknown): EvidenceItem {
  assertClosed(value, ['id', 'path', 'caseId', 'kind', 'capturedAt', 'collectedAt', 'source', 'description', 'sha256', 'bytes', 'operationId'], 'evidence item');
  return { id: safeIdentifier(value.id), path: textValue(value.path, 'evidence path'), caseId: safeIdentifier(value.caseId), kind: oneOf(value.kind, kindValues, 'evidence kind'), collectedAt: timeValue(value.collectedAt, 'collectedAt'), source: textValue(value.source, 'source'), description: textValue(value.description, 'description'), sha256: sha256Value(value.sha256), bytes: integer(value.bytes, 'bytes'), operationId: safeIdentifier(value.operationId), ...(Object.hasOwn(value, 'capturedAt') ? { capturedAt: timeValue(value.capturedAt, 'capturedAt') } : {}) };
}
function parseEvidenceOperation(value: unknown): EvidenceOperation {
  assertClosed(value, ['operationId', 'payloadSha256', 'revision', 'committedAt', 'caseId', 'evidenceId', 'path', 'sha256', 'bytes'], 'evidence operation');
  return { operationId: safeIdentifier(value.operationId), payloadSha256: sha256Value(value.payloadSha256), revision: integer(value.revision, 'revision', 1), committedAt: timeValue(value.committedAt, 'committedAt'), caseId: safeIdentifier(value.caseId), evidenceId: safeIdentifier(value.evidenceId), path: textValue(value.path, 'path'), sha256: sha256Value(value.sha256), bytes: integer(value.bytes, 'bytes') };
}
export function parseCatalog(value: unknown): EvidenceCatalog {
  assertClosed(value, ['schemaVersion', 'revision', 'items', 'operations'], 'evidence catalog');
  if (value.schemaVersion !== 5) fail('Evidence catalog requires schemaVersion 5.');
  return { schemaVersion: 5, revision: integer(value.revision, 'evidence revision'), items: arrayValue(value.items, 'evidence items').map(parseEvidenceItem), operations: arrayValue(value.operations, 'evidence operations').map(parseEvidenceOperation) };
}
export function parseResultEntry(value: unknown): ResultEntry {
  assertClosed(value, ['operationId', 'payloadSha256', 'expectedRevision', 'revision', 'recordedAt', 'caseId', 'mode', 'record'], 'result entry');
  return { operationId: safeIdentifier(value.operationId), payloadSha256: sha256Value(value.payloadSha256), expectedRevision: integer(value.expectedRevision, 'expectedRevision'), revision: integer(value.revision, 'revision', 1), recordedAt: timeValue(value.recordedAt, 'recordedAt'), caseId: safeIdentifier(value.caseId), mode: oneOf(value.mode, ['final', 'attempt'], 'record mode'), record: parsePayload(value.record) };
}
export function parseResults(value: unknown): Results {
  assertClosed(value, ['schemaVersion', 'revision', 'entries'], 'results');
  if (value.schemaVersion !== 5) fail('Results require schemaVersion 5.');
  return { schemaVersion: 5, revision: integer(value.revision, 'results revision'), entries: arrayValue(value.entries, 'entries').map(parseResultEntry) };
}
export function parsePendingEvidence(value: unknown): PendingEvidence {
  assertClosed(value, ['schemaVersion', 'operationId', 'payloadSha256', 'evidenceId', 'stagePath', 'finalPath', 'catalogTempPath', 'markerTempPath', 'sha256', 'bytes'], 'pending evidence marker');
  if (value.schemaVersion !== 5) fail('Pending evidence marker requires schemaVersion 5.');
  return { schemaVersion: 5, operationId: safeIdentifier(value.operationId), payloadSha256: sha256Value(value.payloadSha256), evidenceId: safeIdentifier(value.evidenceId), stagePath: textValue(value.stagePath, 'stagePath'), finalPath: textValue(value.finalPath, 'finalPath'), catalogTempPath: textValue(value.catalogTempPath, 'catalogTempPath'), markerTempPath: textValue(value.markerTempPath, 'markerTempPath'), ...(value.sha256 === undefined ? {} : { sha256: sha256Value(value.sha256) }), ...(value.bytes === undefined ? {} : { bytes: integer(value.bytes, 'pending bytes') }) };
}
