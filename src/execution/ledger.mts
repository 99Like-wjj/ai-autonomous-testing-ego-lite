import { referencePath, retainReference, workerEvidencePath } from '../core/file-integrity.mjs';
/** Deterministic execution data and file transactions. No scheduling or browser actions. */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Baseline, Manifest } from '../contracts/model.mjs';
import type { Assignment, AssignmentState, ConfigurationSnapshot, ExecutionLedger, ExecutionSummary, FileReference, ImportState, Receipt, Event } from '../contracts/execution-model.mjs';
import { activeStates } from '../contracts/execution-model.mjs';
import { assignmentId } from '../contracts/ids.mjs';
import type { AssignmentId } from '../contracts/ids.mjs';
import { assertClosed, atomicReplace, canonicalHash, errorInfo, fail, json, now, readJSON, safeIdentifier, safePath, writeNew } from '../core/common.mjs';
import { arrayValue, integer, oneOf, parseEvidenceRequest, parseRecordRequest, sha256Value, textValue, timeValue } from '../core/validation.mjs';
import { executionWindow, numbers, parsePacket, parseRequest, parseReview, uniqueStrings } from './parse.mjs';
import { parallelLimit } from './config.mjs';

export function initialExecution(manifest: Manifest, configuration: ConfigurationSnapshot): ExecutionLedger {
  return { schemaVersion: 7, runId: manifest.runId, baselineSha256: manifest.baselineSha256, revision: 0, configuration, knownAvailableWorkers: null, capacityReason: '', protectedSpaceIds: null, peakReservations: 0, assignments: [], imports: [], operations: [], events: [] };
}
export function fileReference(value: unknown): FileReference {
  assertClosed(value, ['path', 'sha256', 'bytes'], 'execution file reference');
  return { path: textValue(value.path, 'file reference path'), sha256: sha256Value(value.sha256), bytes: integer(value.bytes, 'file reference bytes') };
}
function configurationSnapshot(value: unknown): ConfigurationSnapshot {
  assertClosed(value, ['kind', 'initialMaxParallelCases', 'requestedMaxParallelCases', 'configuration', 'configFile', 'configSha256'], 'configuration snapshot');
  assertClosed(value.configuration, ['schemaVersion', 'maxParallelCases'], 'configuration input');
  if (value.configuration.schemaVersion !== 7) fail('Invalid configuration snapshot version.');
  return { kind: oneOf(value.kind, ['default', 'project', 'file', 'override'], 'configuration source'), initialMaxParallelCases: parallelLimit(value.initialMaxParallelCases), requestedMaxParallelCases: parallelLimit(value.requestedMaxParallelCases), configuration: { schemaVersion: 7, maxParallelCases: parallelLimit(value.configuration.maxParallelCases) }, ...(value.configFile === undefined ? {} : { configFile: textValue(value.configFile, 'configuration file') }), ...(value.configSha256 === undefined ? {} : { configSha256: sha256Value(value.configSha256) }) };
}
function parseAssignment(value: unknown): Assignment {
  assertClosed(value, ['id', 'caseId', 'attemptId', 'state', 'workerDirectory', 'resources', 'createdAt', 'updatedAt', 'workerId', 'model', 'reasoning', 'defaultSpaceId', 'spaceHistory', 'ownedSpaces', 'executionWindow'], 'assignment');
  const id = assignmentId(value.id), workerDirectory = textValue(value.workerDirectory, 'worker directory');
  if (workerDirectory !== 'workers/' + id) fail('Assignment directory does not match its ID.');
  return { id, caseId: safeIdentifier(value.caseId), attemptId: safeIdentifier(value.attemptId), state: oneOf(value.state, ['reserved', 'running', 'paused', 'stop_requested', 'stopped', 'completed', 'failed', 'lost'], 'assignment state'), workerDirectory, resources: uniqueStrings(value.resources, 'resources'), createdAt: timeValue(value.createdAt, 'createdAt'), updatedAt: timeValue(value.updatedAt, 'updatedAt'),
    defaultSpaceId: value.defaultSpaceId === null ? null : integer(value.defaultSpaceId, 'default Space'),
    spaceHistory: arrayValue(value.spaceHistory, 'Space history').map(value => { assertClosed(value, ['spaceId', 'kind', 'at', 'reason'], 'Space history'); return { spaceId: value.spaceId === null ? null : integer(value.spaceId, 'Space ID'), kind: oneOf(value.kind, ['default', 'recovery', 'deviation', 'cleaned'], 'Space history kind'), at: timeValue(value.at, 'Space observation time'), reason: textValue(value.reason, 'Space observation reason') }; }),
    ownedSpaces: arrayValue(value.ownedSpaces, 'owned Spaces').map(value => { assertClosed(value, ['spaceId', 'name', 'createdAt', 'receipt', 'closedAt'], 'owned Space'); return { spaceId: integer(value.spaceId, 'owned Space ID'), name: textValue(value.name, 'Space name'), createdAt: timeValue(value.createdAt, 'Space createdAt'), receipt: fileReference(value.receipt), ...(value.closedAt === undefined ? {} : { closedAt: timeValue(value.closedAt, 'Space closedAt') }) }; }),
    ...(value.workerId === undefined ? {} : { workerId: textValue(value.workerId, 'worker ID') }), ...(value.model === undefined ? {} : { model: textValue(value.model, 'worker model') }), ...(value.reasoning === undefined ? {} : { reasoning: textValue(value.reasoning, 'worker reasoning') }), ...(value.executionWindow === undefined ? {} : { executionWindow: executionWindow(value.executionWindow) }) };
}
function parseReceipt(value: unknown): Receipt {
  assertClosed(value, ['operationId', 'kind', 'revision', 'assignmentId', 'caseId', 'packetId', 'workerDirectory', 'evidenceIds', 'state', 'maxParallelCases', 'availableWorkers', 'resultOperationId'], 'execution receipt');
  return { operationId: safeIdentifier(value.operationId), kind: textValue(value.kind, 'receipt kind'), revision: integer(value.revision, 'receipt revision'),
    ...(value.assignmentId === undefined ? {} : { assignmentId: assignmentId(value.assignmentId) }), ...(value.caseId === undefined ? {} : { caseId: safeIdentifier(value.caseId) }), ...(value.packetId === undefined ? {} : { packetId: safeIdentifier(value.packetId) }), ...(value.workerDirectory === undefined ? {} : { workerDirectory: textValue(value.workerDirectory, 'worker directory') }),
    ...(value.evidenceIds === undefined ? {} : { evidenceIds: uniqueStrings(value.evidenceIds, 'receipt evidence IDs') }), ...(value.state === undefined ? {} : { state: textValue(value.state, 'receipt state') }), ...(value.maxParallelCases === undefined ? {} : { maxParallelCases: parallelLimit(value.maxParallelCases) }), ...(value.availableWorkers === undefined ? {} : { availableWorkers: value.availableWorkers === null ? null : integer(value.availableWorkers, 'available workers') }), ...(value.resultOperationId === undefined ? {} : { resultOperationId: safeIdentifier(value.resultOperationId) }) };
}
function parseImport(value: unknown): ImportState {
  assertClosed(value, ['operationId', 'assignmentId', 'packetId', 'packetSha256', 'packetFile', 'originalPacket', 'review', 'evidenceJobs', 'resultRequest', 'resultReceipt', 'phase', 'startedAt', 'completedAt', 'supersededBy'], 'packet import');
  const result: ImportState = { operationId: safeIdentifier(value.operationId), assignmentId: assignmentId(value.assignmentId), packetId: safeIdentifier(value.packetId), packetSha256: sha256Value(value.packetSha256), packetFile: textValue(value.packetFile, 'packet file'), originalPacket: parsePacket(value.originalPacket), review: parseReview(value.review), phase: oneOf(value.phase, ['prepared', 'evidence', 'result', 'complete', 'superseded'], 'import phase'), startedAt: timeValue(value.startedAt, 'import startedAt'), ...(value.supersededBy === undefined ? {} : { supersededBy: safeIdentifier(value.supersededBy) }), evidenceJobs: arrayValue(value.evidenceJobs, 'evidence jobs').map(raw => {
    assertClosed(raw, ['key', 'request', 'receipt'], 'evidence import job');
    let receipt: ImportState['evidenceJobs'][number]['receipt'];
    if (raw.receipt !== undefined) {
      const v = raw.receipt; assertClosed(v, ['operationId', 'revision', 'caseId', 'evidenceId', 'path', 'sha256', 'bytes', 'collectedAt', 'replayed'], 'evidence receipt');
      if (typeof v.replayed !== 'boolean') fail('Invalid evidence receipt replay flag.');
      receipt = { operationId: safeIdentifier(v.operationId), revision: integer(v.revision, 'evidence revision'), caseId: safeIdentifier(v.caseId), evidenceId: safeIdentifier(v.evidenceId), path: textValue(v.path, 'evidence path'), sha256: sha256Value(v.sha256), bytes: integer(v.bytes, 'evidence bytes'), collectedAt: timeValue(v.collectedAt, 'collectedAt'), replayed: v.replayed };
    }
    return { key: safeIdentifier(raw.key), ...(raw.request === undefined ? {} : { request: parseEvidenceRequest(raw.request) }), ...(receipt === undefined ? {} : { receipt }) };
  }), ...(value.resultRequest === undefined ? {} : { resultRequest: parseRecordRequest(value.resultRequest) }), ...(value.completedAt === undefined ? {} : { completedAt: timeValue(value.completedAt, 'import completedAt') }) };
  if (value.resultReceipt !== undefined) {
    const v = value.resultReceipt; assertClosed(v, ['operationId', 'revision', 'caseId', 'mode', 'replayed'], 'result receipt');
    if (typeof v.replayed !== 'boolean') fail('Invalid result receipt flags.');
    result.resultReceipt = { operationId: safeIdentifier(v.operationId), revision: integer(v.revision, 'result revision'), caseId: safeIdentifier(v.caseId), mode: oneOf(v.mode, ['final', 'attempt'], 'result mode'), replayed: v.replayed };
  }
  return result;
}
export function parseLedger(value: unknown): ExecutionLedger {
  assertClosed(value, ['schemaVersion', 'runId', 'baselineSha256', 'revision', 'configuration', 'knownAvailableWorkers', 'capacityReason', 'protectedSpaceIds', 'peakReservations', 'assignments', 'imports', 'operations', 'events'], 'execution ledger');
  if (value.schemaVersion !== 7) fail('Execution ledger requires schemaVersion 7.');
  const result: ExecutionLedger = { schemaVersion: 7, runId: textValue(value.runId, 'run ID'), baselineSha256: sha256Value(value.baselineSha256), revision: integer(value.revision, 'execution revision'), configuration: configurationSnapshot(value.configuration), knownAvailableWorkers: value.knownAvailableWorkers === null ? null : integer(value.knownAvailableWorkers, 'worker capacity'), capacityReason: textValue(value.capacityReason, 'capacity reason', { empty: true }), protectedSpaceIds: value.protectedSpaceIds === null ? null : numbers(value.protectedSpaceIds), peakReservations: integer(value.peakReservations, 'peak reservations'), assignments: arrayValue(value.assignments, 'assignments').map(parseAssignment), imports: arrayValue(value.imports, 'imports').map(parseImport),
    operations: arrayValue(value.operations, 'execution operations').map(raw => { assertClosed(raw, ['operationId', 'payloadSha256', 'request', 'startedAt', 'receipt'], 'execution operation'); return { operationId: safeIdentifier(raw.operationId), payloadSha256: sha256Value(raw.payloadSha256), request: parseRequest(raw.request), startedAt: timeValue(raw.startedAt, 'operation startedAt'), ...(raw.receipt === undefined ? {} : { receipt: parseReceipt(raw.receipt) }) }; }),
    events: arrayValue(value.events, 'execution events').map(raw => { assertClosed(raw, ['revision', 'operationId', 'at', 'kind', 'reason', 'assignmentId', 'evidenceFiles'], 'execution event'); return { revision: integer(raw.revision, 'event revision', 1), operationId: safeIdentifier(raw.operationId), at: timeValue(raw.at, 'event time'), kind: textValue(raw.kind, 'event kind'), reason: textValue(raw.reason, 'event reason'), ...(raw.assignmentId === undefined ? {} : { assignmentId: assignmentId(raw.assignmentId) }), ...(raw.evidenceFiles === undefined ? {} : { evidenceFiles: arrayValue(raw.evidenceFiles, 'event evidence').map(fileReference) }) }; }) };
  if (result.revision !== result.events.length || result.events.some((event, i) => event.revision !== i + 1)) fail('Execution revision does not match its event ledger.');
  const operationIds = new Set<string>();
  for (const op of result.operations) {
    if (operationIds.has(op.operationId) || op.operationId !== op.request.operationId || canonicalHash(op.request) !== op.payloadSha256) fail('Execution operation identity or payload mismatch.');
    if (op.receipt && (op.receipt.operationId !== op.operationId || op.receipt.kind !== op.request.kind || op.receipt.revision > result.revision)) fail('Execution operation receipt mismatch.');
    if (!op.receipt && op.request.kind !== 'import') fail('Incomplete non-import execution operation.'); operationIds.add(op.operationId);
  }
  if (result.events.some(event => !operationIds.has(event.operationId))) fail('Execution event has no operation.');
  const assignmentIds = new Set<string>(), activeCases = new Set<string>(), ownedSpaces = new Set<number>();
  for (const a of result.assignments) {
    if (assignmentIds.has(a.id)) fail('Duplicate assignment ID.'); assignmentIds.add(a.id);
    if (isActive(a.state)) { if (activeCases.has(a.caseId)) fail('One case has multiple active assignments.'); activeCases.add(a.caseId); }
    for (const owned of a.ownedSpaces) { if (ownedSpaces.has(owned.spaceId) || result.protectedSpaceIds?.includes(owned.spaceId)) fail('Owned Space is duplicated or protected.'); ownedSpaces.add(owned.spaceId); }
    if (a.defaultSpaceId !== null && !a.ownedSpaces.some(s => s.spaceId === a.defaultSpaceId)) fail('Default Space has no ownership receipt.');
  }
  if (result.peakReservations < activeCount(result) || result.peakReservations > result.assignments.length) fail('Invalid reservation peak.');
  const packetIds = new Set<string>();
  for (const imp of result.imports) {
    const op = result.operations.find(op => op.operationId === imp.operationId), a = result.assignments.find(a => a.id === imp.assignmentId);
    if (!op || op.request.kind !== 'import' || !a || imp.originalPacket.assignmentId !== a.id || imp.originalPacket.caseId !== a.caseId || imp.originalPacket.attemptId !== a.attemptId || imp.packetId !== imp.originalPacket.packetId || (packetIds.has(imp.packetId) && !op.request.rebaseOf)) fail('Packet import association mismatch.');
    if (canonicalHash(imp.review) !== canonicalHash(op.request.review)) fail('Import review changed.');
    if (imp.phase === 'complete' && (!imp.resultReceipt || !op.receipt || !imp.completedAt)) fail('Incomplete import marked complete.');
    if (imp.phase === 'superseded' && (!imp.supersededBy || op.receipt?.state !== 'superseded')) fail('Superseded import has no explicit replacement.');
    const rebaseOf = op.request.rebaseOf;
    if (rebaseOf) {
      const previous = result.imports.find(previous => previous.operationId === rebaseOf);
      if (!previous || previous.phase !== 'superseded' || previous.supersededBy !== op.operationId || previous.packetId !== imp.packetId || previous.packetSha256 !== imp.packetSha256) fail('Invalid explicit import rebase chain.');
    }
    packetIds.add(imp.packetId);
  }
  return result;
}
export function isActive(state: AssignmentState): boolean { return activeStates.includes(state); }
export function activeCount(ledger: ExecutionLedger): number { return ledger.assignments.filter(a => isActive(a.state)).length; }
export function assignment(ledger: ExecutionLedger, id: AssignmentId): Assignment { const result = ledger.assignments.find(a => a.id === id); if (!result) fail('Unknown assignment: ' + id); return result; }
export async function readExecution(root: string, manifest: Manifest, baseline: Baseline): Promise<ExecutionLedger> {
  if (manifest.schemaVersion !== 7 || manifest.executionFile !== 'execution.json') fail('This command requires a v7 run.');
  const ledger = parseLedger(await readJSON(path.join(root, 'execution.json')));
  if (ledger.runId !== manifest.runId || ledger.baselineSha256 !== manifest.baselineSha256 || ledger.assignments.some(a => !baseline.cases.some(c => c.id === a.caseId))) fail('Execution ledger does not match the frozen run.');
  validateExecutionReferencePaths(root, ledger);
  return ledger;
}
/** Lexical checks only; neither opens nor follows historical references. Shared by all readers. */
export function validateExecutionReferencePaths(root: string, ledger: ExecutionLedger): void {
  for (const a of ledger.assignments) for (const space of a.ownedSpaces) {
    if (!referencePath(root, space.receipt.path).startsWith(a.workerDirectory + '/')) fail('Space receipt belongs to a different assignment directory.');
  }
  for (const event of ledger.events) for (const file of event.evidenceFiles ?? []) referencePath(root, file.path);
  for (const imp of ledger.imports) {
    const a = assignment(ledger, assignmentId(imp.assignmentId));
    if (!referencePath(root, imp.packetFile).startsWith(a.workerDirectory + '/')) fail('Packet file belongs to a different assignment directory.');
    if (imp.originalPacket.runId !== ledger.runId || imp.originalPacket.baselineSha256 !== ledger.baselineSha256) fail('Saved packet does not match its frozen run.');
    for (const item of imp.originalPacket.evidence) workerEvidencePath(path.join(root, ...a.workerDirectory.split('/')), item.path);
  }
}
export { referencePath, retainReference } from '../core/file-integrity.mjs';
export async function verifyExecutionFiles(root: string, ledger: ExecutionLedger): Promise<void> {
  const references = [...ledger.events.flatMap(event => event.evidenceFiles ?? []), ...ledger.assignments.flatMap(a => a.ownedSpaces.map(space => space.receipt))];
  for (const expected of references) { const actual = await retainReference(root, expected.path); if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) fail('Execution reference changed: ' + expected.path); }
  for (const imp of ledger.imports) {
    const actual = await retainReference(root, imp.packetFile);
    if (actual.sha256 !== imp.packetSha256 || canonicalHash(parsePacket(await readJSON(path.join(root, ...actual.path.split('/'))))) !== canonicalHash(imp.originalPacket)) fail('Immutable worker packet or saved snapshot changed: ' + imp.packetId);
  }
}
export async function checkpoint(root: string, ledger: ExecutionLedger, event: Omit<Event, 'revision' | 'at'>): Promise<void> {
  ledger.revision++; ledger.events.push({ ...event, revision: ledger.revision, at: now() });
  parseLedger(ledger); await atomicReplace(path.join(root, 'execution.json'), json(ledger));
}
/** Total active-assignment cap available to this run, including its existing reservations; not a free-slot count. */
export function availableLimit(ledger: ExecutionLedger): number { return Math.min(ledger.configuration.requestedMaxParallelCases, ledger.knownAvailableWorkers ?? Number.MAX_SAFE_INTEGER); }
export function checkSlot(ledger: ExecutionLedger, caseId: string, resources: readonly string[], excludingId?: string): void {
  const active = ledger.assignments.filter(a => isActive(a.state) && a.id !== excludingId);
  if (active.length >= availableLimit(ledger)) fail('No available case slot; configured or known host capacity reached.');
  if (active.some(a => a.caseId === caseId)) fail('Case already has an active assignment.');
  if (active.some(a => a.resources.some(key => resources.includes(key)))) fail('Declared resource is already reserved.');
}
export async function ensureWorkerDirectory(root: string, a: Assignment, operationId: string): Promise<void> {
  const directory = await safePath(path.join(root, ...a.workerDirectory.split('/')));
  let created = false;
  try { await fs.mkdir(directory, { mode: 0o700 }); created = true; } catch (caught) { const error = errorInfo(caught); if (error.code !== 'EEXIST') throw error; }
  if (!(await fs.lstat(directory)).isDirectory()) fail('Worker directory is not a directory.');
  const marker = path.join(directory, 'assignment.json'), receipt = json({ assignmentId: a.id, caseId: a.caseId, attemptId: a.attemptId, operationId });
  if (created) await writeNew(marker, receipt);
  else if (await fs.readFile(await safePath(marker, { existing: true }), 'utf8') !== receipt) fail('Existing worker directory has no matching ownership receipt; preserve it.');
  const captures = await safePath(path.join(directory, 'captures'));
  try { await fs.mkdir(captures, { mode: 0o700 }); } catch (caught) { const error = errorInfo(caught); if (error.code !== 'EEXIST') throw error; }
  if (!(await fs.lstat(captures)).isDirectory()) fail('Capture path is not a directory.');
}
export function summarize(ledger: ExecutionLedger, _baseline: Baseline): ExecutionSummary {
  const perCase = new Map<string, { start: number; end: number }[]>();
  for (const imp of ledger.imports) if (imp.phase === 'complete' && imp.originalPacket.executionWindow) {
    const window = imp.originalPacket.executionWindow, intervals = perCase.get(imp.originalPacket.caseId) ?? [];
    intervals.push({ start: Date.parse(window.startedAt), end: Date.parse(window.endedAt) }); perCase.set(imp.originalPacket.caseId, intervals);
  }
  const windows: { start: number; end: number }[] = [];
  for (const intervals of perCase.values()) {
    let current: { start: number; end: number } | undefined;
    for (const item of intervals.sort((a, b) => a.start - b.start)) {
      if (!current || item.start > current.end) { current = { ...item }; windows.push(current); }
      else current.end = Math.max(current.end, item.end);
    }
  }
  const events = windows.filter(window => window.end > window.start).flatMap(window => [{ at: window.start, delta: 1 }, { at: window.end, delta: -1 }]).sort((a, b) => a.at - b.at || a.delta - b.delta);
  let active = 0, peak = 0; for (const event of events) { active += event.delta; peak = Math.max(peak, active); }
  return { configuredMaxParallelCases: ledger.configuration.requestedMaxParallelCases, knownAvailableWorkers: ledger.knownAvailableWorkers, activeReservations: activeCount(ledger), peakReservations: ledger.peakReservations, reportedExecutionPeak: windows.length ? peak : null, executionWindowSource: 'Worker-supplied intervals and referenced files; not independently authenticated. Reservation counts are separate.', draining: activeCount(ledger) > availableLimit(ledger), unfinishedAssignmentIds: ledger.assignments.filter(a => !['completed', 'stopped', 'failed'].includes(a.state)).map(a => a.id), pendingImportIds: ledger.imports.filter(imp => !['complete', 'superseded'].includes(imp.phase)).map(imp => imp.operationId) };
}
