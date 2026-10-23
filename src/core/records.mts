import type { Attempt, Baseline, Case, CheckedCase, EvidenceCatalog, EvidenceItem, EvidenceOperation, EvidenceReceipt, EvidenceRequest, Manifest, PendingEvidence, RecordPayload, RecordRequest, Report, ResultOperation, ResultReceipt, ResultRecord, Results, Status, TestHooks } from '../contracts/model.mjs';
import { normalizeCases } from './cases.mjs';
import { parseCatalog, parseResults, parseManifest, parsePendingEvidence, parseRecordRequest, parseEvidenceRequest } from './validation.mjs';
import { errorInfo } from './common.mjs';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SOURCE_ROOT, statuses, causes, evidenceKinds, reservedIds, idPattern, fail, hash, json, inside, object, nonempty, timestampPattern, now, randomId, assertClosed, safeIdentifier, validTimestamp, assertTimestamp, canonical, canonicalHash, canonicalRecord, sameRecord, safePath, directory, readJSON, syncDirectory, writeNew, removeOwnedFileIfPresent, removeRegularIfPresent, atomicReplace, acquireLock, withRunLock } from './common.mjs';
export function evidenceReference(ref: unknown): asserts ref is string {
  if (!nonempty(ref) || ref.includes('\\') || ref.includes('\0') || ref.includes(':') || path.posix.isAbsolute(ref) || /^[A-Za-z]:/.test(ref) || ref.split('/').some(c => c === '..' || c === '.' || c === '')) fail('Evidence must use relative slash-separated paths without traversal.');
  if (!ref.startsWith('evidence/')) fail('Evidence files must be under the run evidence/ directory.');
}
export async function evidenceFile(runDir: string, ref: unknown): Promise<string> {
  evidenceReference(ref);
  const filename = path.resolve(runDir, ...ref.split('/'));
  if (!inside(runDir, filename)) fail('Evidence escapes run directory.');
  await safePath(filename, { existing: true });
  if (!(await fs.lstat(filename)).isFile()) fail('Evidence is not a regular file: ' + ref);
  return filename;
}
export async function hashFile(filename: string): Promise<{ sha256: string; bytes: number }> {
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  const handle = await fs.open(filename, flags);
  try {
    if (!(await handle.stat()).isFile()) fail('Expected a regular file.');
    const digest = crypto.createHash('sha256');
    let bytes = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) { digest.update(chunk); bytes += chunk.length; }
    return { sha256: digest.digest('hex'), bytes };
  } finally { await handle.close(); }
}

export function countsFor(cases: readonly { status: Status }[]): Report['counts'] {
  return { pass: cases.filter(c => c.status === 'pass').length, fail: cases.filter(c => c.status === 'fail').length, inconclusive: cases.filter(c => c.status === 'inconclusive').length, blocked: cases.filter(c => c.status === 'blocked').length, not_run: cases.filter(c => c.status === 'not_run').length };
}
export function progressFor(cases: readonly Pick<CheckedCase, 'id' | 'status' | 'clarificationQuestions' | 'attempts'>[]): Report['progress'] {
  const completed = cases.filter(c => ['pass', 'fail'].includes(c.status));
  const uncompleted = cases.filter(c => !['pass', 'fail'].includes(c.status));
  const pending = cases.filter(c => (c.clarificationQuestions ?? []).length > 0);
  return {
    completed: { count: completed.length, caseIds: completed.map(c => c.id), statusCounts: { pass: completed.filter(c => c.status === 'pass').length, fail: completed.filter(c => c.status === 'fail').length } },
    uncompleted: { count: uncompleted.length, caseIds: uncompleted.map(c => c.id), statusCounts: { not_run: uncompleted.filter(c => c.status === 'not_run').length, blocked: uncompleted.filter(c => c.status === 'blocked').length, inconclusive: uncompleted.filter(c => c.status === 'inconclusive').length } },
    pendingClarification: { count: pending.length, caseIds: pending.map(c => c.id) },
    attemptedCases: { count: cases.filter(c => (c.attempts ?? []).length > 0).length, totalAttempts: cases.reduce((sum, c) => sum + (c.attempts ?? []).length, 0) }
  };
}
export async function readAndValidateBaseline(root: string, manifest: Manifest) {
  const baselinePath = path.join(root, 'baseline.json');
  const bytes = await fs.readFile(await safePath(baselinePath, { existing: true }));
  if (hash(bytes) !== manifest.baselineSha256) fail('Baseline hash mismatch. This integrity check is not tamper-proof.');
  return { baseline: normalizeCases(JSON.parse(bytes.toString('utf8'))), bytes };
}
export function validateV3Operation(operation: EvidenceOperation | ResultOperation, allowed: string[], label: string, revision: number) {
  assertClosed(operation, allowed, label);
  safeIdentifier(operation.operationId, label + ' operation id');
  if (!/^[a-f0-9]{64}$/.test(operation.payloadSha256) || !Number.isSafeInteger(operation.revision) || operation.revision < 0 || operation.revision > revision || !validTimestamp(operation.committedAt)) fail('Invalid ' + label + ' operation receipt.');
}
export async function validateV3EvidenceItem(root: string, item: EvidenceItem, byId: Map<string, Case>, ids: Set<string>, paths: Set<string>) {
  assertClosed(item, ['id', 'path', 'caseId', 'kind', 'capturedAt', 'collectedAt', 'source', 'description', 'sha256', 'bytes', 'operationId'], 'evidence catalog item');
  safeIdentifier(item.id, 'evidence id'); safeIdentifier(item.caseId, 'evidence case id'); safeIdentifier(item.operationId, 'evidence operation id');
  if (!byId.has(item.caseId) || !nonempty(item.path) || !evidenceKinds.has(item.kind) || !nonempty(item.source) || !nonempty(item.description)) fail('Invalid versioned evidence catalog item.');
  if (Object.hasOwn(item, 'capturedAt')) assertTimestamp(item.capturedAt, 'capturedAt');
  assertTimestamp(item.collectedAt, 'collectedAt');
  if (!/^[a-f0-9]{64}$/.test(item.sha256) || !Number.isSafeInteger(item.bytes) || item.bytes < 0) fail('Invalid evidence hash or byte count.');
  if (ids.has(item.id) || paths.has(item.path)) fail('Duplicate evidence id or path.');
  const filename = await evidenceFile(root, item.path);
  const actual = await hashFile(filename);
  if (actual.sha256 !== item.sha256 || actual.bytes !== item.bytes) fail('Evidence content hash or byte count mismatch: ' + item.id);
  ids.add(item.id); paths.add(item.path);
  return item;
}
export function validateV3AttemptShape(attempt: Attempt, label: string) {
  assertClosed(attempt, ['attemptId', 'operationId', 'revision', 'recordedAt', 'kind', 'status', 'observed', 'rationale', 'remainingQuestions', 'evidenceIds', 'cause'], 'attempt');
  safeIdentifier(attempt.attemptId, 'attempt id'); safeIdentifier(attempt.operationId, 'attempt operation id');
  if (!Number.isSafeInteger(attempt.revision) || attempt.revision < 1 || !validTimestamp(attempt.recordedAt) || !['attempt', 'superseded_final'].includes(attempt.kind)) fail('Invalid attempt metadata: ' + label);
}
export function validateV3ResultRecordShape(record: ResultRecord, label: string) {
  assertClosed(record, ['id', 'basis', 'status', 'observed', 'rationale', 'remainingQuestions', 'evidenceIds', 'cause', 'attempts', 'operationId', 'revision', 'recordedAt'], 'result');
  if (!nonempty(record.id) || !Array.isArray(record.evidenceIds) || !Array.isArray(record.attempts)) fail('Invalid result record: ' + label);
  if (record.operationId !== undefined) safeIdentifier(record.operationId, 'result operation id');
  if (record.revision !== undefined && (!Number.isSafeInteger(record.revision) || record.revision < 1)) fail('Invalid result revision: ' + label);
  if (record.recordedAt !== undefined) assertTimestamp(record.recordedAt, 'result recordedAt');
}
export async function validateV3Record(record: ResultRecord, label: string, evidenceById: Map<string, EvidenceItem>, caseId: string, clarificationQuestions: string[], resultOperations: Map<string, ResultOperation>, attemptIds: Set<string>, globalRevision: number) {
  validateV3ResultRecordShape(record, label);
  if (record.operationId !== undefined && (record.revision === undefined || record.recordedAt === undefined)) fail('Current final record has incomplete operation metadata: ' + label);
  if (record.operationId === undefined && (record.revision !== undefined || record.recordedAt !== undefined)) fail('Current final record has incomplete operation metadata: ' + label);
  if (!statuses.has(record.status) || typeof record.observed !== 'string' || typeof record.rationale !== 'string' || !Array.isArray(record.remainingQuestions) || !record.remainingQuestions.every(nonempty)) fail('Invalid result record: ' + label);
  if (clarificationQuestions.length && ['pass', 'fail'].includes(record.status)) fail('Pending clarification prohibits pass/fail: ' + label);
  if (record.cause !== undefined && !causes.has(record.cause)) fail('Invalid cause: ' + label);
  const evidenceIds = record.evidenceIds;
  if (new Set(evidenceIds).size !== evidenceIds.length) fail('Duplicate evidence reference: ' + label);
  if (['pass', 'fail'].includes(record.status) && (!record.observed.trim() || !record.rationale.trim() || !evidenceIds.length)) fail('Pass/fail requires rationale and evidence plus observed behavior: ' + label);
  if (['inconclusive', 'blocked'].includes(record.status) && !record.rationale.trim()) fail('Inconclusive/blocked requires rationale: ' + label);
  for (const id of evidenceIds) {
    safeIdentifier(id, 'evidence reference id');
    const item = evidenceById.get(id);
    if (!item) fail('Evidence ID missing from catalog: ' + id);
    if (item.caseId !== caseId) fail('Evidence is associated with a different case: ' + id);
  }
  for (const [index, attempt] of (record.attempts ?? []).entries()) {
    validateV3AttemptShape(attempt, label + ' attempt ' + (index + 1));
    if (!statuses.has(attempt.status) || typeof attempt.observed !== 'string' || typeof attempt.rationale !== 'string' || !Array.isArray(attempt.remainingQuestions) || !attempt.remainingQuestions.every(nonempty) || !Array.isArray(attempt.evidenceIds)) fail('Invalid attempt: ' + label);
    if (clarificationQuestions.length && ['pass', 'fail'].includes(attempt.status)) fail('Pending clarification prohibits pass/fail: ' + label + ' attempt ' + (index + 1));
    if (attempt.cause !== undefined && !causes.has(attempt.cause)) fail('Invalid attempt cause: ' + label);
    if (['pass', 'fail'].includes(attempt.status) && (!attempt.observed.trim() || !attempt.rationale.trim() || !attempt.evidenceIds.length)) fail('Pass/fail attempt requires rationale and evidence plus observed behavior: ' + label);
    if (['inconclusive', 'blocked'].includes(attempt.status) && !attempt.rationale.trim()) fail('Inconclusive/blocked attempt requires rationale: ' + label);
    if (attemptIds.has(attempt.attemptId)) fail('Duplicate attempt id: ' + attempt.attemptId);
    if (new Set(attempt.evidenceIds).size !== attempt.evidenceIds.length) fail('Duplicate attempt evidence reference: ' + label);
    attemptIds.add(attempt.attemptId);
    const op = resultOperations.get(attempt.operationId);
    if (!op || op.caseId !== caseId || attempt.revision > globalRevision) fail('Attempt is not linked to a recorded operation: ' + attempt.attemptId);
    for (const id of attempt.evidenceIds) {
      const item = evidenceById.get(id);
      if (!item || item.caseId !== caseId) fail('Attempt evidence ID missing or associated with a different case: ' + id);
    }
  }
  if (record.operationId !== undefined) {
    const op = resultOperations.get(record.operationId);
    if (!op || op.caseId !== caseId || op.mode !== 'final' || op.status !== record.status || op.revision !== record.revision || record.revision > globalRevision) fail('Final result is not linked to a recorded operation: ' + label);
  }
}
export async function checkV3(root: string, manifest: Manifest): Promise<Report> {
  assertClosed(manifest, ['schemaVersion', 'baselineSchemaVersion', 'runId', 'projectDir', 'baselineSha256'], 'manifest');
  if (manifest.schemaVersion !== 3 || manifest.baselineSchemaVersion !== 3 || !nonempty(manifest.projectDir) || !path.isAbsolute(manifest.projectDir) || !nonempty(manifest.runId) || !/^[a-f0-9]{64}$/.test(manifest.baselineSha256)) fail('Invalid v3 manifest.');
  const { baseline } = await readAndValidateBaseline(root, manifest);
  const byId = new Map(baseline.cases.map(c => [c.id, c]));
  const evidenceCatalog = parseCatalog(await readJSON(path.join(root, 'evidence.json')));
  assertClosed(evidenceCatalog, ['schemaVersion', 'revision', 'items', 'operations'], 'evidence catalog');
  if (evidenceCatalog.schemaVersion !== 3 || !Number.isSafeInteger(evidenceCatalog.revision) || evidenceCatalog.revision < 0 || !Array.isArray(evidenceCatalog.items) || !Array.isArray(evidenceCatalog.operations)) fail('Invalid v3 evidence catalog.');
  const evidenceById = new Map<string, EvidenceItem>(), catalogIds = new Set<string>(), catalogPaths = new Set<string>();
  for (const item of evidenceCatalog.items) {
    await validateV3EvidenceItem(root, item, byId, catalogIds, catalogPaths);
    evidenceById.set(item.id, item);
  }
  const evidenceOps = new Map<string, EvidenceOperation>();
  let committedEvidenceRevision = 0;
  for (const op of evidenceCatalog.operations) {
    validateV3Operation(op, ['operationId', 'payloadSha256', 'revision', 'committedAt', 'caseId', 'evidenceId', 'path', 'sha256', 'bytes'], 'evidence', evidenceCatalog.revision);
    safeIdentifier(op.caseId, 'evidence operation case id'); safeIdentifier(op.evidenceId, 'evidence operation evidence id');
    if (!byId.has(op.caseId) || !Number.isSafeInteger(op.bytes) || op.bytes < 0 || !/^[a-f0-9]{64}$/.test(op.sha256) || !nonempty(op.path) || op.revision !== ++committedEvidenceRevision) fail('Invalid evidence operation receipt.');
    if (evidenceOps.has(op.operationId)) fail('Duplicate evidence operation id: ' + op.operationId);
    const item = evidenceById.get(op.evidenceId);
    if (!item || item.operationId !== op.operationId || item.caseId !== op.caseId || item.path !== op.path || item.sha256 !== op.sha256 || item.bytes !== op.bytes) fail('Evidence operation receipt does not match its catalog item.');
    evidenceOps.set(op.operationId, op);
  }
  if (committedEvidenceRevision !== evidenceCatalog.revision) fail('Evidence catalog revision does not match its operation ledger.');
  for (const item of evidenceCatalog.items) if (!evidenceOps.has(item.operationId)) fail('Versioned evidence item has no operation receipt: ' + item.id);
  const results = parseResults(await readJSON(path.join(root, 'results.json')));
  assertClosed(results, ['schemaVersion', 'revision', 'cases', 'operations'], 'results');
  if (results.schemaVersion !== 3 || !Number.isSafeInteger(results.revision) || results.revision < 0 || !Array.isArray(results.cases) || !Array.isArray(results.operations)) fail('Invalid v3 results schema.');
  const resultOps = new Map<string, ResultOperation>();
  let committedResultRevision = 0;
  for (const op of results.operations) {
    validateV3Operation(op, ['operationId', 'payloadSha256', 'revision', 'committedAt', 'caseId', 'mode', 'status', 'attemptId', 'noOp'], 'result', results.revision);
    safeIdentifier(op.caseId, 'result operation case id');
    if (!byId.has(op.caseId) || !['final', 'attempt'].includes(op.mode) || !statuses.has(op.status) || (op.noOp !== undefined && typeof op.noOp !== 'boolean')) fail('Invalid result operation receipt.');
    if (op.attemptId !== undefined) safeIdentifier(op.attemptId, 'attempt id');
    if (op.mode === 'attempt' && op.attemptId === undefined) fail('Attempt operation receipt is missing its attempt ID.');
    if (op.noOp === true) {
      if (op.mode !== 'final' || op.revision !== committedResultRevision) fail('No-op result operation has an invalid revision.');
    } else if (op.revision !== ++committedResultRevision) fail('Result revision does not match its operation ledger.');
    if (resultOps.has(op.operationId)) fail('Duplicate result operation id: ' + op.operationId);
    resultOps.set(op.operationId, op);
  }
  if (committedResultRevision !== results.revision) fail('Results revision does not match its operation ledger.');
  for (const opId of evidenceOps.keys()) if (resultOps.has(opId)) fail('Operation ID is reused across evidence and result records: ' + opId);
  const seen = new Set<string>(), attemptIds = new Set<string>();
  for (const record of results.cases) {
    if (!object(record) || !byId.has(record.id)) fail('Unknown case id in results.');
    if (seen.has(record.id)) fail('Duplicate result id: ' + record.id);
    seen.add(record.id);
    const baselineCase = byId.get(record.id); if (!baselineCase) fail('Unknown baseline case.'); const expected = baselineCase.basis;
    if (!object(record.basis) || Object.keys(record.basis).length !== 3 || (['kind', 'source', 'text'] as const).some(key => record.basis[key] !== expected[key])) fail('Basis changed: ' + record.id);
    await validateV3Record(record, record.id, evidenceById, record.id, baselineCase.clarificationQuestions ?? [], resultOps, attemptIds, results.revision);
  }
  if (seen.size !== byId.size) fail('Missing original cases in results. Keep unexecuted cases as not_run.');
  const attemptsById = new Map<string, Attempt>();
  for (const record of results.cases) for (const attempt of record.attempts) attemptsById.set(attempt.attemptId, attempt);
  for (const op of results.operations) if (op.attemptId !== undefined) {
    const attempt = attemptsById.get(op.attemptId);
    if (!attempt || attempt.operationId !== op.operationId || attempt.revision !== op.revision) fail('Result operation receipt references a mismatched attempt: ' + op.attemptId);
    if (attempt.kind === 'attempt' && (op.mode !== 'attempt' || attempt.status !== op.status)) fail('Attempt operation receipt does not match its attempt: ' + op.attemptId);
    if (attempt.kind === 'superseded_final' && op.mode !== 'final') fail('Superseded final snapshot must be linked to a final operation: ' + op.attemptId);
  }
  const ordered: CheckedCase[] = baseline.cases.map(c => { const record = results.cases.find(r => r.id === c.id); if (!record) fail('Missing original case.'); return { ...c, ...record, cause: record.cause ?? 'unknown' }; });
  const counts = countsFor(ordered), progressSummary = progressFor(ordered);
  return {
    schemaVersion: 3, runId: manifest.runId, project: baseline.project, structurallyValid: true,
    revision: results.revision, evidenceRevision: evidenceCatalog.revision,
    hasUnexecutedCases: ordered.some(c => c.status === 'not_run' && c.attempts.length === 0), counts, progress: progressSummary,
    recordedExplicitOutcomes: { pass: ordered.filter(c => c.basis.kind === 'explicit' && c.status === 'pass').length, fail: ordered.filter(c => c.basis.kind === 'explicit' && c.status === 'fail').length },
    evidenceIntegrity: { hashVerifiedItems: evidenceCatalog.items.length },
    evidenceCoverage: {
      registeredScreenshots: evidenceCatalog.items.filter(item => item.kind === 'screenshot').length,
      distinctRetainedContents: new Set(evidenceCatalog.items.map(item => item.sha256)).size,
      finalCasesWithoutScreenshots: ordered.filter(c => c.status !== 'not_run' && !c.evidenceIds.some(id => evidenceCatalog.items.some(item => item.id === id && item.kind === 'screenshot'))).map(c => c.id)
    },
    caveat: 'Structural validation and file hash comparison only. Verdicts, sources, and capture times are operator supplied, not authenticated. SHA-256 matching proves only that the current bytes match the catalog hash, not who created them or whether they are true. The frozen baseline hash is not tamper-proof. Helpers are not a security boundary for actions bypassing them.',
    evidenceCatalog, cases: ordered
  };
}
export async function checkUnlocked(root: string): Promise<Report> {
  const manifest = parseManifest(await readJSON(path.join(root, 'manifest.json')));
  assertClosed(manifest, ['schemaVersion', 'baselineSchemaVersion', 'runId', 'projectDir', 'baselineSha256'], 'manifest');
  if (manifest.schemaVersion !== 3) fail('Unsupported run schema version. Start a new v3 run from the schemaVersion 3 cases file; old run directories are not migrated.');
  return checkV3(root, manifest);
}
export async function markerExists(root: string): Promise<string | null> {
  const filename = path.join(root, '.evidence.pending.json');
  try { await safePath(filename, { existing: true }); return filename; }
  catch (caughterror) { const error = errorInfo(caughterror); if (error.code === 'ENOENT') return null; throw error; }
}
export function markerPaths(root: string, marker: PendingEvidence) {
  safeIdentifier(marker.evidenceId, 'pending evidence id');
  if (!/^ev-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(marker.evidenceId)) fail('Invalid pending evidence ID.');
  const stage = 'evidence/.' + marker.evidenceId + '.stage';
  const finalPattern = new RegExp('^evidence/' + marker.evidenceId + '(?:\\.[a-z0-9]{1,10})?$');
  const catalogTemp = '.ego-evidence-' + marker.evidenceId + '.tmp';
  const markerTemp = '.ego-marker-' + marker.evidenceId + '.tmp';
  if (marker.stagePath !== stage || typeof marker.finalPath !== 'string' || !finalPattern.test(marker.finalPath) || marker.catalogTempPath !== catalogTemp || marker.markerTempPath !== markerTemp) fail('Invalid pending evidence recovery marker.');
  evidenceReference(marker.finalPath);
  return { stage: path.join(root, ...stage.split('/')), final: path.join(root, ...marker.finalPath.split('/')), catalogTemp: path.join(root, catalogTemp), markerTemp: path.join(root, markerTemp) };
}
export async function recoverEvidence(root: string): Promise<void> {
  const markerFilename = await markerExists(root);
  if (!markerFilename) return;
  const marker = parsePendingEvidence(await readJSON(markerFilename));
  assertClosed(marker, ['schemaVersion', 'operationId', 'payloadSha256', 'evidenceId', 'stagePath', 'finalPath', 'catalogTempPath', 'markerTempPath', 'sha256', 'bytes'], 'pending evidence marker');
  if (marker.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(marker.payloadSha256)) fail('Invalid pending evidence recovery marker.');
  safeIdentifier(marker.operationId, 'pending evidence operation id');
  const paths = markerPaths(root, marker);
  const catalog = parseCatalog(await readJSON(path.join(root, 'evidence.json')));
  if (catalog.schemaVersion !== 3) fail('Pending evidence transaction requires run schemaVersion 3.');
  const committed = catalog.operations.find(op => op.operationId === marker.operationId);
  if (committed) {
    const item = catalog.items.find(entry => entry.id === marker.evidenceId);
    if (!item || item.path !== marker.finalPath || item.operationId !== marker.operationId) fail('Committed evidence transaction does not match its marker.');
    await removeRegularIfPresent(paths.stage); await removeRegularIfPresent(paths.catalogTemp); await removeRegularIfPresent(paths.markerTemp); await removeRegularIfPresent(markerFilename);
    return;
  }
  await removeRegularIfPresent(paths.stage); await removeRegularIfPresent(paths.catalogTemp); await removeRegularIfPresent(paths.markerTemp);
  try {
    await safePath(paths.final, { existing: true });
    if (typeof marker.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(marker.sha256) || !Number.isSafeInteger(marker.bytes)) fail('Uncommitted evidence file has no verified cleanup hash; inspect the run manually.');
    const actual = await hashFile(paths.final);
    if (actual.sha256 !== marker.sha256 || actual.bytes !== marker.bytes) fail('Uncommitted evidence file changed; refusing cleanup.');
    await removeRegularIfPresent(paths.final);
  } catch (caughterror) { const error = errorInfo(caughterror); if (error.code !== 'ENOENT') throw error; }
  await removeRegularIfPresent(markerFilename);
}
export async function check(runDir: unknown): Promise<Report> {
  return withRunLock(runDir, async root => { await recoverEvidence(root); return checkUnlocked(root); });
}
export function validateText(value: unknown, label: string, limit = 4096): string {
  if (!nonempty(value) || value.length > limit || value.includes('\0')) fail('Invalid ' + label + '.');
  return value;
}
export function validateRecordRequest(request: unknown): asserts request is RecordRequest { parseRecordRequest(request); }
export function resultOperationReceipt(op: ResultOperation, replayed = false): ResultReceipt {
  return { operationId: op.operationId, revision: op.revision, caseId: op.caseId, mode: op.mode, status: op.status, ...(op.attemptId ? { attemptId: op.attemptId } : {}), ...(op.noOp ? { noOp: true } : {}), replayed };
}
export function evidenceOperationReceipt(op: EvidenceOperation, replayed = false): EvidenceReceipt {
  return { operationId: op.operationId, revision: op.revision, caseId: op.caseId, evidenceId: op.evidenceId, path: op.path, sha256: op.sha256, bytes: op.bytes, collectedAt: op.committedAt, replayed };
}
export async function recordResult({ runDir, request }: { runDir: unknown; request: unknown }, testHooks: TestHooks = {}): Promise<ResultReceipt> {
  return withRunLock(runDir, async root => {
    await recoverEvidence(root);
    const checked = await checkUnlocked(root);
    if (checked.schemaVersion !== 3) fail('Run schemaVersion 3 is required; start a new run from the schemaVersion 3 cases file. Existing run directories are not migrated.');
    validateRecordRequest(request);
    const resultsPath = path.join(root, 'results.json'), results = parseResults(await readJSON(resultsPath));
    const payloadSha256 = canonicalHash(request);
    const existing = results.operations.find(op => op.operationId === request.operationId);
    if (existing) {
      if (existing.payloadSha256 !== payloadSha256) fail('Operation ID was already used with a different payload.');
      return resultOperationReceipt(existing, true);
    }
    const evidenceCatalog = parseCatalog(await readJSON(path.join(root, 'evidence.json')));
    if (evidenceCatalog.operations.some(op => op.operationId === request.operationId)) fail('Operation ID is already used by an evidence operation.');
    if (request.expectedRevision !== results.revision) fail('Revision conflict: expected ' + request.expectedRevision + ', current ' + results.revision + '.');
    const baselineCase = checked.cases.find(c => c.id === request.caseId);
    if (!baselineCase) fail('Unknown case id: ' + request.caseId);
    if ((baselineCase.clarificationQuestions ?? []).length && ['pass', 'fail'].includes(request.record.status)) fail('Pending clarification prohibits pass/fail: ' + request.caseId);
    const next = structuredClone(results), target = next.cases.find(c => c.id === request.caseId);
    const newRecord: Required<RecordPayload> = {
      status: request.record.status, observed: request.record.observed, rationale: request.record.rationale,
      remainingQuestions: [...request.record.remainingQuestions], evidenceIds: [...request.record.evidenceIds],
      cause: request.record.cause ?? 'unknown'
    };
    const evidenceById = new Map(evidenceCatalog.items.map(item => [item.id, item]));
    for (const id of newRecord.evidenceIds) {
      const item = evidenceById.get(id);
      if (!item) fail('Evidence ID is not registered in the catalog: ' + id);
      if (item.caseId !== request.caseId) fail('Evidence is associated with a different case: ' + id);
    }
    if (!target) fail('Missing result case: ' + request.caseId);
    const isNoOp = request.mode === 'final' && sameRecord(target, newRecord);
    const revision = isNoOp ? results.revision : results.revision + 1;
    let attemptId: string | undefined;
    const recordedAt = now();
    if (!target) fail('Missing result case: ' + request.caseId);
    if (request.mode === 'attempt') {
      attemptId = randomId('att-');
      if (newRecord.status === 'not_run') fail('Invalid attempt status.');
      target.attempts.push({ attemptId, operationId: request.operationId, revision, recordedAt, kind: 'attempt', ...newRecord, status: newRecord.status });
    } else if (!isNoOp) {
      if (target.status !== 'not_run' && !target.attempts.some(a => sameRecord(a, target))) {
        attemptId = randomId('att-');
        target.attempts.push({
          attemptId, operationId: request.operationId,
          revision, recordedAt,
          kind: 'superseded_final', ...canonicalRecord(target), status: target.status
        });
      }
      Object.assign(target, newRecord, { operationId: request.operationId, revision, recordedAt });
    }
    next.revision = revision;
    const operation: ResultOperation = {
      operationId: request.operationId, payloadSha256, revision, committedAt: recordedAt,
      caseId: request.caseId, mode: request.mode, status: request.record.status,
      ...(attemptId ? { attemptId } : {}), ...(isNoOp ? { noOp: true } : {})
    };
    next.operations.push(operation);
    await atomicReplace(resultsPath, json(next));
    if (typeof testHooks.afterCommit === 'function') await testHooks.afterCommit();
    return resultOperationReceipt(operation, false);
  });
}
export async function copyAndHashSource(source: string, stage: string) {
  await safePath(stage);
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  const input = await fs.open(source, flags);
  let output;
  try {
    const before = await input.stat();
    if (!before.isFile()) fail('Evidence source must be a regular file.');
    output = await fs.open(stage, 'wx', 0o600);
    const digest = crypto.createHash('sha256');
    let bytes = 0;
    for await (const chunk of input.createReadStream({ autoClose: false })) {
      digest.update(chunk); bytes += chunk.length;
      let offset = 0;
      while (offset < chunk.length) {
        const written = await output.write(chunk, offset, chunk.length - offset, null);
        if (!written.bytesWritten) fail('Evidence source copy made no progress.');
        offset += written.bytesWritten;
      }
    }
    await output.sync();
    const after = await input.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) fail('Evidence source changed while it was being copied.');
    return { sha256: digest.digest('hex'), bytes };
  } finally { if (output) await output.close(); await input.close(); }
}
export function validateEvidenceRequest(request: unknown): asserts request is EvidenceRequest {
  const value = parseEvidenceRequest(request);
  if (!path.isAbsolute(value.sourceFile) || value.sourceFile.includes('\0')) fail('Evidence sourceFile must be an absolute local path.');
  validateText(value.source, 'evidence source'); validateText(value.description, 'evidence description');
}
export async function registerEvidenceUnlocked(root: string, request: unknown, testHooks: TestHooks = {}): Promise<EvidenceReceipt> {
  await recoverEvidence(root);
  const checked = await checkUnlocked(root);
  if (checked.schemaVersion !== 3) fail('Run schemaVersion 3 is required; start a new run from the schemaVersion 3 cases file. Existing run directories are not migrated.');
  validateEvidenceRequest(request);
  const catalogPath = path.join(root, 'evidence.json'), catalog = parseCatalog(await readJSON(catalogPath));
  const payloadSha256 = canonicalHash(request);
  const existing = catalog.operations.find(op => op.operationId === request.operationId);
  if (existing) {
    if (existing.payloadSha256 !== payloadSha256) fail('Operation ID was already used with a different payload.');
    return evidenceOperationReceipt(existing, true);
  }
  const results = parseResults(await readJSON(path.join(root, 'results.json')));
  if (results.operations.some(op => op.operationId === request.operationId)) fail('Operation ID is already used by a result operation.');
  if (request.expectedRevision !== catalog.revision) fail('Evidence revision conflict: expected ' + request.expectedRevision + ', current ' + catalog.revision + '.');
  if (!checked.cases.some(c => c.id === request.caseId)) fail('Unknown case id: ' + request.caseId);
  const source = await safePath(request.sourceFile, { existing: true });
  if (!(await fs.lstat(source)).isFile()) fail('Evidence source must be a regular file.');
  const evidenceId = randomId('ev-'), extension = path.extname(source).toLowerCase();
  const safeExtension = /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : '';
  const relativeFinal = 'evidence/' + evidenceId + safeExtension, stageRelative = 'evidence/.' + evidenceId + '.stage';
  const stage = path.join(root, ...stageRelative.split('/')), final = path.join(root, ...relativeFinal.split('/'));
  const catalogTemp = path.join(root, '.ego-evidence-' + evidenceId + '.tmp'), markerTemp = path.join(root, '.ego-marker-' + evidenceId + '.tmp');
  const markerFile = path.join(root, '.evidence.pending.json');
  const marker: PendingEvidence = {
    schemaVersion: 1, operationId: request.operationId, payloadSha256, evidenceId,
    stagePath: stageRelative, finalPath: relativeFinal,
    catalogTempPath: path.basename(catalogTemp), markerTempPath: path.basename(markerTemp)
  };
  await writeNew(markerFile, json(marker));
  let committed = false;
  try {
    const copied = await copyAndHashSource(source, stage);
    if (typeof testHooks.afterCopy === 'function') await testHooks.afterCopy();
    marker.sha256 = copied.sha256; marker.bytes = copied.bytes;
    await atomicReplace(markerFile, json(marker), markerTemp);
    await safePath(stage, { existing: true });
    await safePath(final);
    await fs.link(stage, final);
    const actual = await hashFile(final);
    if (actual.sha256 !== copied.sha256 || actual.bytes !== copied.bytes) fail('Evidence copy verification failed.');
    const collectedAt = now();
    const item: EvidenceItem = {
      id: evidenceId, path: relativeFinal, caseId: request.caseId, kind: request.kind,
      ...(request.capturedAt !== undefined ? { capturedAt: request.capturedAt } : {}),
      collectedAt, source: request.source, description: request.description,
      sha256: actual.sha256, bytes: actual.bytes, operationId: request.operationId
    };
    const operation: EvidenceOperation = { operationId: request.operationId, payloadSha256, revision: catalog.revision + 1, committedAt: collectedAt, caseId: request.caseId, evidenceId, path: relativeFinal, sha256: actual.sha256, bytes: actual.bytes };
    const updated = { ...catalog, revision: catalog.revision + 1, items: [...catalog.items, item], operations: [...catalog.operations, operation] };
    if (typeof testHooks.beforeCatalogCommit === 'function') await testHooks.beforeCatalogCommit();
    await atomicReplace(catalogPath, json(updated), catalogTemp);
    committed = true;
    if (typeof testHooks.afterCommit === 'function') await testHooks.afterCommit();
    await removeRegularIfPresent(stage); await removeRegularIfPresent(markerTemp); await removeRegularIfPresent(markerFile);
    return evidenceOperationReceipt(operation, false);
  } catch (caughterror) { const error = errorInfo(caughterror);
    let current: EvidenceCatalog | undefined;
    try { current = parseCatalog(await readJSON(catalogPath)); } catch {}
    committed = committed || Boolean(current?.operations?.some(op => op.operationId === request.operationId));
    if (committed) throw error;
    try { await recoverEvidence(root); } catch (caughtcleanupError) { const cleanupError = errorInfo(caughtcleanupError); error.cleanupError = cleanupError.message; }
    throw error;
  }
}
export async function registerEvidence({ runDir, request }: { runDir: unknown; request: unknown }, testHooks: TestHooks = {}): Promise<EvidenceReceipt> {
  return withRunLock(runDir, root => registerEvidenceUnlocked(root, request, testHooks));
}
export async function progress(runDir: unknown) {
  return withRunLock(runDir, async root => {
    await recoverEvidence(root);
    const result = await checkUnlocked(root);
    return { schemaVersion: result.schemaVersion, runId: result.runId, revision: result.revision ?? null, progress: progressFor(result.cases), currentStatusCounts: result.counts };
  });
}
