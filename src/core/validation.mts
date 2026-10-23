/** Parse untrusted JSON into data contracts before it reaches the transaction layer. */
import type { Basis, EvidenceCatalog, EvidenceItem, EvidenceOperation, EvidenceRequest, Manifest, PendingEvidence, RecordPayload, RecordRequest, ResultOperation, ResultRecord, Results, Attempt } from '../contracts/model.mjs';
import { assertClosed, assertTimestamp, fail, nonempty, safeIdentifier } from './common.mjs';

export const statusValues = ['pass', 'fail', 'inconclusive', 'blocked', 'not_run'] as const;
export const causeValues = ['product_candidate', 'agent', 'environment', 'spec', 'unknown'] as const;
export const kindValues = ['screenshot', 'dom', 'tool_receipt', 'log', 'other'] as const;
export function oneOf<const T extends readonly string[]>(value: unknown, values: T, label: string): T[number] {
  if (typeof value !== 'string' || !values.some(item => item === value)) fail('Invalid ' + label + '.');
  return value as T[number]; // Membership was checked above; no coercion.
}
export function textValue(value: unknown, label: string, { empty = false, limit = Infinity } = {}): string {
  if (typeof value !== 'string' || (!empty && !nonempty(value)) || value.length > limit) fail('Invalid ' + label + '.');
  return value;
}
export function arrayValue(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail('Invalid ' + label + ' array.');
  return value;
}
export function strings(value: unknown, label: string): string[] { return arrayValue(value, label).map(item => textValue(item, label)); }
export function integer(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) fail('Invalid ' + label + '.');
  return value;
}
export function sha256Value(value: unknown, label = 'SHA-256'): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail('Invalid ' + label + '.');
  return value;
}
export function timeValue(value: unknown, label: string): string { assertTimestamp(value, label); return value; }
export function parseBasis(value: unknown): Basis {
  assertClosed(value, ['kind', 'source', 'text'], 'basis');
  return { kind: oneOf(value.kind, ['explicit', 'interpretation', 'hypothesis'], 'basis kind'), source: textValue(value.source, 'basis source'), text: textValue(value.text, 'basis text') };
}
export function parsePayload(value: unknown): RecordPayload {
  assertClosed(value, ['status', 'observed', 'rationale', 'remainingQuestions', 'evidenceIds', 'cause'], 'record payload');
  const status = oneOf(value.status, statusValues, 'record status');
  const observed = textValue(value.observed, 'observed', { empty: true }), rationale = textValue(value.rationale, 'rationale', { empty: true });
  const remainingQuestions = strings(value.remainingQuestions, 'remainingQuestions');
  const evidenceIds = arrayValue(value.evidenceIds, 'evidenceIds').map(item => safeIdentifier(item, 'evidence id'));
  if (new Set(evidenceIds).size !== evidenceIds.length) fail('Duplicate evidence id in record.');
  if (['pass', 'fail'].includes(status) && (!observed.trim() || !rationale.trim() || !evidenceIds.length)) fail('Pass/fail requires rationale and evidence plus observed behavior.');
  if (['inconclusive', 'blocked'].includes(status) && !rationale.trim()) fail('Inconclusive/blocked requires rationale.');
  return { status, observed, rationale, remainingQuestions, evidenceIds, ...(value.cause === undefined ? {} : { cause: oneOf(value.cause, causeValues, 'cause') }) };
}
export function parseRecordRequest(value: unknown): RecordRequest {
  assertClosed(value, ['schemaVersion', 'operationId', 'expectedRevision', 'caseId', 'mode', 'record'], 'record request');
  if (value.schemaVersion !== 3) fail('Record requests require schemaVersion 3.');
  const mode = oneOf(value.mode, ['final', 'attempt'], 'record mode'), record = parsePayload(value.record);
  if (mode === 'attempt' && record.status === 'not_run') fail('An attempt must record an observation; use final mode with not_run when no attempt occurred.');
  return { schemaVersion: 3, operationId: safeIdentifier(value.operationId, 'operation id'), expectedRevision: integer(value.expectedRevision, 'record revision'), caseId: safeIdentifier(value.caseId, 'case id'), mode, record };
}
export function parseEvidenceRequest(value: unknown): EvidenceRequest {
  assertClosed(value, ['schemaVersion', 'operationId', 'expectedRevision', 'caseId', 'sourceFile', 'kind', 'capturedAt', 'source', 'description'], 'evidence request');
  if (value.schemaVersion !== 3) fail('Evidence requests require schemaVersion 3.');
  return {
    schemaVersion: 3, operationId: safeIdentifier(value.operationId, 'operation id'), expectedRevision: integer(value.expectedRevision, 'evidence revision'),
    caseId: safeIdentifier(value.caseId, 'case id'), sourceFile: textValue(value.sourceFile, 'evidence sourceFile'), kind: oneOf(value.kind, kindValues, 'evidence kind'),
    source: textValue(value.source, 'evidence source', { limit: 4096 }), description: textValue(value.description, 'evidence description', { limit: 4096 }),
    ...(Object.hasOwn(value, 'capturedAt') ? { capturedAt: timeValue(value.capturedAt, 'capturedAt') } : {})
  };
}
export function parseManifest(value: unknown): Manifest {
  assertClosed(value, ['schemaVersion', 'baselineSchemaVersion', 'runId', 'projectDir', 'baselineSha256'], 'manifest');
  if (value.schemaVersion !== 3 || value.baselineSchemaVersion !== 3) fail('Unsupported run schema version. Start a new v3 run from the schemaVersion 3 cases file; old run directories are not migrated.');
  return { schemaVersion: 3, baselineSchemaVersion: 3, runId: textValue(value.runId, 'run ID'), projectDir: textValue(value.projectDir, 'project directory'), baselineSha256: sha256Value(value.baselineSha256, 'baseline hash') };
}
function operationBase(value: Record<string, unknown>) {
  return { operationId: safeIdentifier(value.operationId, 'operation id'), payloadSha256: sha256Value(value.payloadSha256, 'operation payload hash'), revision: integer(value.revision, 'operation revision'), committedAt: timeValue(value.committedAt, 'committedAt'), caseId: safeIdentifier(value.caseId, 'operation case id') };
}
export function parseEvidenceItem(value: unknown): EvidenceItem {
  assertClosed(value, ['id', 'path', 'caseId', 'kind', 'capturedAt', 'collectedAt', 'source', 'description', 'sha256', 'bytes', 'operationId'], 'evidence catalog item');
  return {
    id: safeIdentifier(value.id, 'evidence id'), path: textValue(value.path, 'evidence path'), caseId: safeIdentifier(value.caseId, 'evidence case id'), kind: oneOf(value.kind, kindValues, 'evidence kind'),
    collectedAt: timeValue(value.collectedAt, 'collectedAt'), source: textValue(value.source, 'evidence source'), description: textValue(value.description, 'evidence description'),
    sha256: sha256Value(value.sha256, 'evidence hash'), bytes: integer(value.bytes, 'evidence byte count'), operationId: safeIdentifier(value.operationId, 'evidence operation id'),
    ...(Object.hasOwn(value, 'capturedAt') ? { capturedAt: timeValue(value.capturedAt, 'capturedAt') } : {})
  };
}
function parseEvidenceOperation(value: unknown): EvidenceOperation {
  assertClosed(value, ['operationId', 'payloadSha256', 'revision', 'committedAt', 'caseId', 'evidenceId', 'path', 'sha256', 'bytes'], 'evidence operation');
  return { ...operationBase(value), evidenceId: safeIdentifier(value.evidenceId, 'evidence id'), path: textValue(value.path, 'evidence path'), sha256: sha256Value(value.sha256), bytes: integer(value.bytes, 'evidence byte count') };
}
export function parseCatalog(value: unknown): EvidenceCatalog {
  assertClosed(value, ['schemaVersion', 'revision', 'items', 'operations'], 'evidence catalog');
  if (value.schemaVersion !== 3) fail('Invalid v3 evidence catalog.');
  return { schemaVersion: 3, revision: integer(value.revision, 'evidence revision'), items: arrayValue(value.items, 'evidence items').map(parseEvidenceItem), operations: arrayValue(value.operations, 'evidence operations').map(parseEvidenceOperation) };
}
function parseResultOperation(value: unknown): ResultOperation {
  assertClosed(value, ['operationId', 'payloadSha256', 'revision', 'committedAt', 'caseId', 'mode', 'status', 'attemptId', 'noOp'], 'result operation');
  if (value.noOp !== undefined && typeof value.noOp !== 'boolean') fail('Invalid noOp flag.');
  return { ...operationBase(value), mode: oneOf(value.mode, ['final', 'attempt'], 'result mode'), status: oneOf(value.status, statusValues, 'result status'),
    ...(value.attemptId === undefined ? {} : { attemptId: safeIdentifier(value.attemptId, 'attempt id') }), ...(value.noOp === undefined ? {} : { noOp: value.noOp }) };
}
function payloadFromStored(value: Record<string, unknown>): RecordPayload {
  return parsePayload({ status: value.status, observed: value.observed, rationale: value.rationale, remainingQuestions: value.remainingQuestions, evidenceIds: value.evidenceIds, ...(value.cause === undefined ? {} : { cause: value.cause }) });
}
function parseAttempt(value: unknown): Attempt {
  assertClosed(value, ['attemptId', 'operationId', 'revision', 'recordedAt', 'kind', 'status', 'observed', 'rationale', 'remainingQuestions', 'evidenceIds', 'cause'], 'attempt');
  const payload = payloadFromStored(value);
  if (payload.status === 'not_run') fail('Invalid attempt status: not_run.');
  return { ...payload, status: payload.status, attemptId: safeIdentifier(value.attemptId, 'attempt id'), operationId: safeIdentifier(value.operationId, 'attempt operation id'), revision: integer(value.revision, 'attempt revision', 1), recordedAt: timeValue(value.recordedAt, 'recordedAt'), kind: oneOf(value.kind, ['attempt', 'superseded_final'], 'attempt kind') };
}
function parseResult(value: unknown): ResultRecord {
  assertClosed(value, ['id', 'basis', 'status', 'observed', 'rationale', 'remainingQuestions', 'evidenceIds', 'cause', 'attempts', 'operationId', 'revision', 'recordedAt'], 'result');
  return { ...payloadFromStored(value), id: safeIdentifier(value.id, 'result case id'), basis: parseBasis(value.basis), attempts: arrayValue(value.attempts, 'attempts').map(parseAttempt),
    ...(value.operationId === undefined ? {} : { operationId: safeIdentifier(value.operationId, 'operation id') }),
    ...(value.revision === undefined ? {} : { revision: integer(value.revision, 'result revision', 1) }), ...(value.recordedAt === undefined ? {} : { recordedAt: timeValue(value.recordedAt, 'recordedAt') }) };
}
export function parseResults(value: unknown): Results {
  assertClosed(value, ['schemaVersion', 'revision', 'cases', 'operations'], 'results');
  if (value.schemaVersion !== 3) fail('Invalid v3 results schema.');
  return { schemaVersion: 3, revision: integer(value.revision, 'results revision'), cases: arrayValue(value.cases, 'results cases').map(parseResult), operations: arrayValue(value.operations, 'result operations').map(parseResultOperation) };
}
export function parsePendingEvidence(value: unknown): PendingEvidence {
  assertClosed(value, ['schemaVersion', 'operationId', 'payloadSha256', 'evidenceId', 'stagePath', 'finalPath', 'catalogTempPath', 'markerTempPath', 'sha256', 'bytes'], 'pending evidence marker');
  if (value.schemaVersion !== 1) fail('Invalid pending evidence recovery marker.');
  return { schemaVersion: 1, operationId: safeIdentifier(value.operationId), payloadSha256: sha256Value(value.payloadSha256), evidenceId: safeIdentifier(value.evidenceId),
    stagePath: textValue(value.stagePath, 'stagePath'), finalPath: textValue(value.finalPath, 'finalPath'), catalogTempPath: textValue(value.catalogTempPath, 'catalogTempPath'), markerTempPath: textValue(value.markerTempPath, 'markerTempPath'),
    ...(value.sha256 === undefined ? {} : { sha256: sha256Value(value.sha256) }), ...(value.bytes === undefined ? {} : { bytes: integer(value.bytes, 'pending bytes') }) };
}
