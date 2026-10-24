import type { ExecutionRequest, GoalAssessment, PacketRecord, PacketReview, WorkerPacket, ExecutionWindow } from '../contracts/execution-model.mjs';
import { assertClosed, fail, safeIdentifier } from '../core/common.mjs';
import { arrayValue, integer, oneOf, parsePayload, sha256Value, strings, textValue, timeValue } from '../core/validation.mjs';
import { parallelLimit } from './config.mjs';

export const requestKinds = ['inventory', 'capacity', 'reserve', 'attach-space', 'note', 'set-limit', 'reconcile', 'import'] as const;
export function uniqueStrings(value: unknown, label: string): string[] { const result = strings(value, label); if (new Set(result).size !== result.length) fail('Duplicate ' + label + '.'); return result; }
export function numbers(value: unknown): number[] { const result = arrayValue(value, 'Space IDs').map(v => integer(v, 'Space ID')); if (new Set(result).size !== result.length) fail('Duplicate Space ID.'); return result; }
export function packetRecord(value: unknown): PacketRecord {
  assertClosed(value, ['status', 'observed', 'rationale', 'remainingQuestions', 'evidenceKeys', 'cause'], 'packet record');
  const payload = parsePayload({ status: value.status, observed: value.observed, rationale: value.rationale, remainingQuestions: value.remainingQuestions, evidenceIds: value.evidenceKeys, ...(value.cause === undefined ? {} : { cause: value.cause }) });
  const { evidenceIds, ...rest } = payload; return { ...rest, evidenceKeys: evidenceIds };
}
export function goals(value: unknown): GoalAssessment[] {
  const result = arrayValue(value, 'goal assessments').map(value => {
    assertClosed(value, ['targets', 'status', 'observed', 'rationale', 'evidenceKeys'], 'goal assessment');
    const targets = uniqueStrings(value.targets, 'goal targets'); if (!targets.length) fail('A goal assessment needs target references.');
    const status = oneOf(value.status, ['verified', 'violation', 'inconclusive', 'not_tested'], 'goal status');
    const observed = textValue(value.observed, 'goal observed', { empty: true }), rationale = textValue(value.rationale, 'goal rationale');
    const evidenceKeys = uniqueStrings(value.evidenceKeys, 'goal evidence keys'); evidenceKeys.forEach(key => safeIdentifier(key, 'evidence key'));
    if (['verified', 'violation'].includes(status) && (!observed.trim() || !evidenceKeys.length)) fail('Verified/violation goals need observations and evidence.');
    return { targets, status, observed, rationale, evidenceKeys };
  });
  if (!result.length) fail('A packet needs goal assessments.'); return result;
}
export function executionWindow(value: unknown): ExecutionWindow {
  assertClosed(value, ['startedAt', 'endedAt', 'evidenceKeys'], 'execution window');
  const startedAt = timeValue(value.startedAt, 'execution start'), endedAt = timeValue(value.endedAt, 'execution end');
  if (Date.parse(endedAt) < Date.parse(startedAt)) fail('Execution window ends before it starts.');
  const evidenceKeys = uniqueStrings(value.evidenceKeys, 'execution-window evidence'); if (!evidenceKeys.length) fail('Execution windows require referenced evidence.');
  return { startedAt, endedAt, evidenceKeys };
}
export function parsePacket(value: unknown): WorkerPacket {
  assertClosed(value, ['schemaVersion', 'runId', 'baselineSha256', 'caseId', 'assignmentId', 'attemptId', 'packetId', 'mode', 'record', 'evidence', 'goalAssessments', 'executionWindow', 'spaceUsage'], 'worker packet');
  if (value.schemaVersion !== 1) fail('Worker packets require schemaVersion 1.');
  const evidence = arrayValue(value.evidence, 'packet evidence').map(value => {
    assertClosed(value, ['key', 'path', 'kind', 'source', 'description', 'sha256', 'bytes', 'capturedAt'], 'packet evidence');
    return { key: safeIdentifier(value.key, 'evidence key'), path: textValue(value.path, 'evidence path'), kind: oneOf(value.kind, ['screenshot', 'dom', 'tool_receipt', 'log', 'other'], 'evidence kind'), source: textValue(value.source, 'evidence source'), description: textValue(value.description, 'evidence description'), sha256: sha256Value(value.sha256), bytes: integer(value.bytes, 'evidence bytes'), ...(value.capturedAt === undefined ? {} : { capturedAt: timeValue(value.capturedAt, 'capturedAt') }) };
  });
  const keys = new Set(evidence.map(item => item.key)); if (keys.size !== evidence.length) fail('Duplicate packet evidence key.');
  const record = packetRecord(value.record), mode = oneOf(value.mode, ['attempt', 'final'], 'packet mode');
  if (mode === 'attempt' && record.status === 'not_run') fail('An attempt cannot use not_run.');
  const goalAssessments = goals(value.goalAssessments), window = value.executionWindow === undefined ? undefined : executionWindow(value.executionWindow);
  const spaceUsage = arrayValue(value.spaceUsage, 'actual Space usage').map(raw => { assertClosed(raw, ['spaceId', 'reason', 'evidenceKeys'], 'Space usage'); return { spaceId: raw.spaceId === null ? null : integer(raw.spaceId, 'actual Space ID'), reason: textValue(raw.reason, 'Space usage reason'), evidenceKeys: uniqueStrings(raw.evidenceKeys, 'Space usage evidence') }; });
  if (!spaceUsage.length) fail('Record actual Space usage, or an explicit unknown observation.');
  for (const key of [...record.evidenceKeys, ...goalAssessments.flatMap(goal => goal.evidenceKeys), ...(window?.evidenceKeys ?? []), ...spaceUsage.flatMap(use => use.evidenceKeys)]) if (!keys.has(key)) fail('Unknown packet evidence key: ' + key);
  return { schemaVersion: 1, runId: textValue(value.runId, 'run ID'), baselineSha256: sha256Value(value.baselineSha256), caseId: safeIdentifier(value.caseId, 'case ID'), assignmentId: safeIdentifier(value.assignmentId, 'assignment ID'), attemptId: safeIdentifier(value.attemptId, 'attempt ID'), packetId: safeIdentifier(value.packetId, 'packet ID'), mode, record, evidence, goalAssessments, spaceUsage, ...(window ? { executionWindow: window } : {}) };
}
export function parseReview(value: unknown): PacketReview {
  assertClosed(value, ['decision', 'reviewer', 'rationale', 'record', 'goalAssessments', 'mode'], 'packet review');
  const decision = oneOf(value.decision, ['accept', 'revise'], 'review decision');
  if (decision === 'accept' && (value.record !== undefined || value.goalAssessments !== undefined || value.mode !== undefined)) fail('An accept review cannot override worker assessments.');
  if (decision === 'revise' && value.record === undefined && value.goalAssessments === undefined && value.mode === undefined) fail('A revise review needs an explicit replacement.');
  return { decision, reviewer: textValue(value.reviewer, 'reviewer'), rationale: textValue(value.rationale, 'review rationale'), ...(value.record === undefined ? {} : { record: packetRecord(value.record) }), ...(value.goalAssessments === undefined ? {} : { goalAssessments: goals(value.goalAssessments) }), ...(value.mode === undefined ? {} : { mode: oneOf(value.mode, ['attempt', 'final'], 'review mode') }) };
}
export function parseRequest(value: unknown): ExecutionRequest {
  const common = ['schemaVersion', 'operationId', 'expectedRevision', 'reason', 'kind'];
  assertClosed(value, [...common, 'spaceIds', 'evidenceFiles', 'availableWorkers', 'caseId', 'baselineSha256', 'resources', 'workerId', 'model', 'reasoning', 'assignmentId', 'spaceId', 'name', 'receiptFile', 'created', 'replaceDefault', 'category', 'remainingSpaceIds', 'maxParallelCases', 'state', 'inFlight', 'packetFile', 'review', 'rebaseOf'], 'execution request');
  if (value.schemaVersion !== 1) fail('Execution requests require schemaVersion 1.');
  const base = { schemaVersion: 1 as const, operationId: safeIdentifier(value.operationId, 'operation ID'), expectedRevision: integer(value.expectedRevision, 'execution revision'), reason: textValue(value.reason, 'execution reason') };
  const kind = oneOf(value.kind, requestKinds, 'execution request kind');
  const files = value.evidenceFiles === undefined ? {} : { evidenceFiles: uniqueStrings(value.evidenceFiles, 'evidence files') };
  const worker = { ...(value.workerId === undefined ? {} : { workerId: textValue(value.workerId, 'worker ID') }), ...(value.model === undefined ? {} : { model: textValue(value.model, 'model') }), ...(value.reasoning === undefined ? {} : { reasoning: textValue(value.reasoning, 'reasoning') }) };
  const closed = (allowed: string[]) => assertClosed(value, [...common, ...allowed], 'execution ' + kind + ' request');
  switch (kind) {
    case 'inventory': closed(['spaceIds', 'evidenceFiles']); return { ...base, kind, spaceIds: numbers(value.spaceIds), ...files };
    case 'capacity': closed(['availableWorkers', 'evidenceFiles']); return { ...base, kind, availableWorkers: value.availableWorkers === null ? null : integer(value.availableWorkers, 'available workers'), ...files };
    case 'reserve': closed(['caseId', 'baselineSha256', 'resources', 'workerId', 'model', 'reasoning']); return { ...base, kind, caseId: safeIdentifier(value.caseId, 'case ID'), baselineSha256: sha256Value(value.baselineSha256), ...(value.resources === undefined ? {} : { resources: uniqueStrings(value.resources, 'resources') }), ...worker };
    case 'attach-space': {
      closed(['assignmentId', 'spaceId', 'name', 'receiptFile', 'created', 'replaceDefault']); if (value.created !== true || (value.replaceDefault !== undefined && typeof value.replaceDefault !== 'boolean')) fail('Space attachment requires a creation receipt and explicit boolean replacement flag.');
      return { ...base, kind, assignmentId: safeIdentifier(value.assignmentId, 'assignment ID'), spaceId: integer(value.spaceId, 'Space ID'), name: textValue(value.name, 'Space name'), receiptFile: textValue(value.receiptFile, 'creation receipt'), created: true, ...(value.replaceDefault === undefined ? {} : { replaceDefault: value.replaceDefault }) };
    }
    case 'note': closed(['assignmentId', 'category', 'spaceIds', 'remainingSpaceIds', 'evidenceFiles']); return { ...base, kind, category: oneOf(value.category, ['observation', 'space-deviation', 'skill-bug', 'external-change', 'cleanup'], 'note category'), ...(value.assignmentId === undefined ? {} : { assignmentId: safeIdentifier(value.assignmentId, 'assignment ID') }), ...(value.spaceIds === undefined ? {} : { spaceIds: arrayValue(value.spaceIds, 'actual Space IDs').map(v => v === null ? null : integer(v, 'Space ID')) }), ...(value.remainingSpaceIds === undefined ? {} : { remainingSpaceIds: numbers(value.remainingSpaceIds) }), ...files };
    case 'set-limit': closed(['maxParallelCases']); return { ...base, kind, maxParallelCases: parallelLimit(value.maxParallelCases) };
    case 'reconcile': {
      closed(['assignmentId', 'state', 'inFlight', 'workerId', 'model', 'reasoning', 'evidenceFiles']); if (typeof value.inFlight !== 'boolean') fail('Reconcile requires an explicit inFlight observation.');
      return { ...base, kind, assignmentId: safeIdentifier(value.assignmentId, 'assignment ID'), state: oneOf(value.state, ['running', 'paused', 'stop_requested', 'stopped', 'completed', 'failed', 'lost'], 'assignment state'), inFlight: value.inFlight, ...worker, ...files };
    }
    case 'import': closed(['packetFile', 'review', 'rebaseOf']); return { ...base, kind, packetFile: textValue(value.packetFile, 'packet file'), review: parseReview(value.review), ...(value.rebaseOf === undefined ? {} : { rebaseOf: safeIdentifier(value.rebaseOf, 'superseded import') }) };
  }
}
