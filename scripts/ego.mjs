#!/usr/bin/env node
/** Local evidence bookkeeping only. No model, browser, network, or verdict inference. */
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const statuses = new Set(['pass', 'fail', 'inconclusive', 'blocked', 'not_run']);
const causes = new Set(['product_candidate', 'agent', 'environment', 'spec', 'unknown']);
const evidenceKinds = new Set(['screenshot', 'dom', 'tool_receipt', 'log', 'other']);
const reservedIds = new Set(['__proto__', 'prototype', 'constructor']);
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const fail = message => { throw new Error(message); };
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const inside = (root, target) => { const rel = path.relative(root, target); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const now = () => new Date().toISOString();
const randomId = prefix => prefix + crypto.randomUUID();

function assertClosed(value, allowed, label) {
  if (!object(value)) fail('Invalid ' + label + '.');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('Unexpected ' + label + ' key: ' + key);
}
function safeIdentifier(value, label = 'identifier') {
  if (typeof value !== 'string' || !idPattern.test(value) || reservedIds.has(value) || value === '.' || value === '..') fail('Invalid or unsafe ' + label + '.');
  return value;
}
function validTimestamp(value) {
  if (typeof value !== 'string' || !timestampPattern.test(value) || !Number.isFinite(Date.parse(value))) return false;
  return new Date(value).toISOString() === value.replace(/Z$/, value.includes('.') ? 'Z' : '.000Z');
}
function assertTimestamp(value, label) {
  if (!validTimestamp(value)) fail('Invalid ' + label + ' timestamp.');
}
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('Non-finite numbers are not valid request values.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (!object(value)) fail('Request contains an unsupported value.');
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}
function canonicalHash(value) { return hash(Buffer.from(canonical(value), 'utf8')); }
function canonicalRecord(record) {
  return {
    status: record.status, observed: record.observed, rationale: record.rationale,
    remainingQuestions: record.remainingQuestions,
    evidenceIds: record.evidenceIds ?? [], cause: record.cause ?? 'unknown'
  };
}
function sameRecord(left, right) { return canonical(canonicalRecord(left)) === canonical(canonicalRecord(right)); }

// Reject every symlink component, not just links that currently resolve outside a root.
export async function safePath(value, { external = false, existing = false } = {}) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0')) fail('Paths must be absolute and contain no NUL.');
  const resolved = path.resolve(value);
  if (external && (resolved === path.parse(resolved).root || inside(SOURCE_ROOT, resolved))) fail('Project and run records must be outside the source repository and not at a filesystem root.');
  let cursor = path.parse(resolved).root;
  for (const component of resolved.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    try { if ((await fs.lstat(cursor)).isSymbolicLink()) fail('Symlink path is not allowed: ' + cursor); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (existing) await fs.lstat(resolved);
  return resolved;
}
async function directory(value) {
  const target = await safePath(value, { external: true, existing: true });
  if (!(await fs.lstat(target)).isDirectory()) fail('Expected a directory.');
  return target;
}
async function readJSON(filename) {
  await safePath(filename, { existing: true });
  if (!(await fs.lstat(filename)).isFile()) fail('Expected a regular JSON file.');
  return JSON.parse(await fs.readFile(filename, 'utf8'));
}
async function syncDirectory(dirname) {
  let handle;
  try {
    handle = await fs.open(dirname, 'r');
    await handle.sync();
  } catch (error) {
    if (!['EINVAL', 'ENOTSUP', 'EISDIR', 'EPERM', 'EACCES', 'EBADF'].includes(error.code)) throw error;
  } finally { if (handle) await handle.close().catch(() => {}); }
}
async function writeNew(filename, data) {
  await safePath(filename);
  let handle;
  let created = false;
  try {
    handle = await fs.open(filename, 'wx', 0o600);
    created = true;
    await handle.writeFile(data, 'utf8');
    await handle.sync();
  } catch (error) {
    if (handle) { try { await handle.close(); } catch {} handle = undefined; }
    if (created) { try { await fs.unlink(filename); } catch {} }
    throw error;
  } finally { if (handle) await handle.close(); }
  await syncDirectory(path.dirname(filename));
}
async function removeRegularIfPresent(filename) {
  try {
    await safePath(filename, { existing: true });
    const st = await fs.lstat(filename);
    if (st.isSymbolicLink() || !st.isFile()) fail('Refusing to clean an unexpected non-regular file.');
    await fs.unlink(filename);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
async function atomicReplace(filename, data, tempPath = null) {
  await safePath(filename);
  try {
    const st = await fs.lstat(filename);
    if (st.isSymbolicLink() || !st.isFile()) fail('Refusing to replace a non-regular file.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = tempPath ?? path.join(path.dirname(filename), '.ego-tmp-' + crypto.randomUUID() + '.json');
  await safePath(temporary);
  let renamed = false;
  let temporaryOwned = false;
  try {
    await writeNew(temporary, data);
    temporaryOwned = true;
    await safePath(filename);
    await fs.rename(temporary, filename);
    renamed = true;
    await syncDirectory(path.dirname(filename));
  } finally { if (!renamed && temporaryOwned) await removeRegularIfPresent(temporary); }
}
async function acquireLock(root) {
  const filename = path.join(root, '.run.lock');
  await safePath(filename);
  const token = crypto.randomUUID();
  let handle;
  try {
    handle = await fs.open(filename, 'wx', 0o600);
    await handle.writeFile(json({ token, pid: process.pid, startedAt: now() }), 'utf8');
    await handle.sync();
    await syncDirectory(root);
  } catch (error) {
    if (error.code === 'EEXIST') fail('Run is locked by another operation. Retry after its owner exits.');
    if (handle) {
      try {
        // A partial write may leave invalid JSON. Remove only the path still linked to our open file.
        const opened = await handle.stat({ bigint: true });
        const current = await fs.lstat(filename, { bigint: true });
        const sameFile = opened.isFile() && current.isFile() && opened.ino > 0n && opened.dev === current.dev && opened.ino === current.ino;
        if (sameFile) {
          await fs.unlink(filename);
          await syncDirectory(root);
        }
      } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') error.cleanupError = cleanupError.message;
      }
    }
    throw error;
  } finally { if (handle) await handle.close(); }
  return async () => {
    try {
      const current = await readJSON(filename);
      if (current.token === token) await removeRegularIfPresent(filename);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  };
}
async function withRunLock(runDir, action) {
  const root = await directory(runDir);
  const release = await acquireLock(root);
  try { return await action(root); }
  finally { await release(); }
}
function newSafeCases(baseline) {
  for (const c of baseline.cases) {
    safeIdentifier(c.id, 'case id');
    for (const step of c.steps) safeIdentifier(step.id, 'step id');
  }
}
export function normalizeCases(input) {
  if (!object(input) || Object.keys(input).some(k => !['schemaVersion', 'project', 'cases'].includes(k)) || input.schemaVersion !== 3 || !nonempty(input.project) || !Array.isArray(input.cases) || !input.cases.length) fail('Cases require schemaVersion 3, project, and a nonempty cases array.');
  const ids = new Set();
  const cases = input.cases.map(c => {
    if (!object(c) || Object.keys(c).some(k => !['id', 'title', 'basis', 'criticalConditions', 'expected', 'requiredPath', 'stepOrder', 'steps', 'clarificationQuestions'].includes(k)) || !nonempty(c.id) || !nonempty(c.title) || !nonempty(c.expected)) fail('Each case requires id, title, and expected strings.');
    safeIdentifier(c.id, 'case id');
    if (ids.has(c.id)) fail('Duplicate case id: ' + c.id);
    ids.add(c.id);
    if (!object(c.basis) || Object.keys(c.basis).some(k => !['kind', 'source', 'text'].includes(k)) || !['explicit', 'interpretation', 'hypothesis'].includes(c.basis.kind) || !nonempty(c.basis.source) || !nonempty(c.basis.text)) fail('Invalid basis: ' + c.id);
    if (Object.hasOwn(c, 'clarificationQuestions') && (!Array.isArray(c.clarificationQuestions) || !c.clarificationQuestions.every(nonempty))) fail('Invalid clarificationQuestions: ' + c.id);
    if (!Array.isArray(c.criticalConditions) || !c.criticalConditions.every(nonempty)) fail('Invalid criticalConditions: ' + c.id);
    if (c.requiredPath !== null && !nonempty(c.requiredPath)) fail('requiredPath must be null or nonempty text: ' + c.id);
    if (!['strict', 'adaptive'].includes(c.stepOrder)) fail('Invalid stepOrder: ' + c.id);
    if (!Array.isArray(c.steps) || !c.steps.length) fail('A nonempty steps array is required: ' + c.id);
    const stepIds = new Set();
    const steps = c.steps.map(step => {
      if (!object(step) || Object.keys(step).some(k => !['id', 'action', 'expected'].includes(k)) || !nonempty(step.id) || !nonempty(step.action) || (Object.hasOwn(step, 'expected') && !nonempty(step.expected))) fail('Invalid step: ' + c.id);
      safeIdentifier(step.id, 'step id');
      if (stepIds.has(step.id)) fail('Duplicate step id: ' + c.id + '/' + step.id);
      stepIds.add(step.id);
      return { id: step.id, action: step.action, ...(Object.hasOwn(step, 'expected') ? { expected: step.expected } : {}) };
    });
    return { id: c.id, title: c.title, basis: { kind: c.basis.kind, source: c.basis.source, text: c.basis.text }, criticalConditions: [...c.criticalConditions], expected: c.expected, requiredPath: c.requiredPath, stepOrder: c.stepOrder, steps, ...(Object.hasOwn(c, 'clarificationQuestions') ? { clarificationQuestions: [...c.clarificationQuestions] } : {}) };
  });
  return { schemaVersion: 3, project: input.project, cases };
}
export async function validateCases(casesFile) {
  const baseline = normalizeCases(await readJSON(await safePath(casesFile, { existing: true })));
  newSafeCases(baseline);
  return { schemaVersion: 3, structurallyValid: true, project: baseline.project, caseCount: baseline.cases.length, stepCount: baseline.cases.reduce((sum, c) => sum + c.steps.length, 0), stepOrderCounts: { strict: baseline.cases.filter(c => c.stepOrder === 'strict').length, adaptive: baseline.cases.filter(c => c.stepOrder === 'adaptive').length } };
}
export async function init(projectDir) {
  const target = await safePath(projectDir, { external: true });
  await fs.mkdir(target, { mode: 0o700 });
  try {
    await writeNew(path.join(target, 'cases.example.json'), json({ schemaVersion: 3, project: 'Synthetic example', cases: [{ id: 'example-1', title: 'Create a synthetic configuration (replace before use)', basis: { kind: 'hypothesis', source: 'Example only, not an acceptance requirement', text: 'Synthetic requirement only: a configuration created with an approved name and value can be retrieved with those values. Replace with an actual source-backed requirement before use.' }, criticalConditions: [], expected: 'The configuration can be retrieved with name synthetic-example and value example-value.', requiredPath: null, stepOrder: 'strict', steps: [{ id: 'step-1', action: 'In the approved test environment, find the configuration center’s example configuration feature.' }, { id: 'step-2', action: 'Create an example configuration named synthetic-example with value example-value, using the user-approved test data.' }] }] }));
  } catch (error) { try { await fs.rmdir(target); } catch {} throw error; }
  return { projectDir: target };
}
export async function start({ projectDir, casesFile, outputDir }) {
  const project = await directory(projectDir);
  const target = await safePath(outputDir, { external: true });
  const baseline = normalizeCases(await readJSON(await safePath(casesFile, { existing: true })));
  newSafeCases(baseline);
  const bytes = json(baseline);
  await fs.mkdir(target, { mode: 0o700 });
  const createdFiles = [];
  let evidenceDirectoryCreated = false;
  try {
    const baselinePath = path.join(target, 'baseline.json');
    await writeNew(baselinePath, bytes); createdFiles.push(baselinePath);
    const manifestPath = path.join(target, 'manifest.json');
    await writeNew(manifestPath, json({ schemaVersion: 3, baselineSchemaVersion: 3, runId: crypto.randomUUID(), projectDir: project, baselineSha256: hash(bytes) })); createdFiles.push(manifestPath);
    const resultsPath = path.join(target, 'results.json');
    await writeNew(resultsPath, json({ schemaVersion: 3, revision: 0, cases: baseline.cases.map(c => ({ id: c.id, basis: c.basis, status: 'not_run', observed: '', rationale: '', remainingQuestions: [], evidenceIds: [], cause: 'unknown', attempts: [] })), operations: [] })); createdFiles.push(resultsPath);
    const evidencePath = path.join(target, 'evidence.json');
    await writeNew(evidencePath, json({ schemaVersion: 3, revision: 0, items: [], operations: [] })); createdFiles.push(evidencePath);
    await fs.mkdir(path.join(target, 'evidence'), { mode: 0o700 });
    evidenceDirectoryCreated = true;
  } catch (error) {
    for (const filename of createdFiles.reverse()) { try { await removeRegularIfPresent(filename); } catch {} }
    if (evidenceDirectoryCreated) { try { await fs.rmdir(path.join(target, 'evidence')); } catch {} }
    try { await fs.rmdir(target); } catch {}
    throw error;
  }
  return { runDir: target, cases: baseline.cases.length, runSchemaVersion: 3, baselineSchemaVersion: 3 };
}
function evidenceReference(ref) {
  if (!nonempty(ref) || ref.includes('\\') || ref.includes('\0') || ref.includes(':') || path.posix.isAbsolute(ref) || /^[A-Za-z]:/.test(ref) || ref.split('/').some(c => c === '..' || c === '.' || c === '')) fail('Evidence must use relative slash-separated paths without traversal.');
  if (!ref.startsWith('evidence/')) fail('Evidence files must be under the run evidence/ directory.');
}
async function evidenceFile(runDir, ref) {
  evidenceReference(ref);
  const filename = path.resolve(runDir, ...ref.split('/'));
  if (!inside(runDir, filename)) fail('Evidence escapes run directory.');
  await safePath(filename, { existing: true });
  if (!(await fs.lstat(filename)).isFile()) fail('Evidence is not a regular file: ' + ref);
  return filename;
}
async function hashFile(filename) {
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

function countsFor(cases) { return Object.fromEntries([...statuses].map(status => [status, cases.filter(c => c.status === status).length])); }
function progressFor(cases) {
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
async function readAndValidateBaseline(root, manifest) {
  const baselinePath = path.join(root, 'baseline.json');
  const bytes = await fs.readFile(await safePath(baselinePath, { existing: true }));
  if (hash(bytes) !== manifest.baselineSha256) fail('Baseline hash mismatch. This integrity check is not tamper-proof.');
  return { baseline: normalizeCases(JSON.parse(bytes.toString('utf8'))), bytes };
}
function validateV3Operation(operation, allowed, label, revision) {
  assertClosed(operation, allowed, label);
  safeIdentifier(operation.operationId, label + ' operation id');
  if (!/^[a-f0-9]{64}$/.test(operation.payloadSha256) || !Number.isSafeInteger(operation.revision) || operation.revision < 0 || operation.revision > revision || !validTimestamp(operation.committedAt)) fail('Invalid ' + label + ' operation receipt.');
}
async function validateV3EvidenceItem(root, item, byId, ids, paths) {
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
function validateV3AttemptShape(attempt, label) {
  assertClosed(attempt, ['attemptId', 'operationId', 'revision', 'recordedAt', 'kind', 'status', 'observed', 'rationale', 'remainingQuestions', 'evidenceIds', 'cause'], 'attempt');
  safeIdentifier(attempt.attemptId, 'attempt id'); safeIdentifier(attempt.operationId, 'attempt operation id');
  if (!Number.isSafeInteger(attempt.revision) || attempt.revision < 1 || !validTimestamp(attempt.recordedAt) || !['attempt', 'superseded_final'].includes(attempt.kind)) fail('Invalid attempt metadata: ' + label);
}
function validateV3ResultRecordShape(record, label) {
  assertClosed(record, ['id', 'basis', 'status', 'observed', 'rationale', 'remainingQuestions', 'evidenceIds', 'cause', 'attempts', 'operationId', 'revision', 'recordedAt'], 'result');
  if (!nonempty(record.id) || !Array.isArray(record.evidenceIds) || !Array.isArray(record.attempts)) fail('Invalid result record: ' + label);
  if (record.operationId !== undefined) safeIdentifier(record.operationId, 'result operation id');
  if (record.revision !== undefined && (!Number.isSafeInteger(record.revision) || record.revision < 1)) fail('Invalid result revision: ' + label);
  if (record.recordedAt !== undefined) assertTimestamp(record.recordedAt, 'result recordedAt');
}
async function validateV3Record(record, label, evidenceById, caseId, clarificationQuestions, resultOperations, attemptIds, globalRevision) {
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
    if (!statuses.has(attempt.status) || attempt.status === 'not_run' || typeof attempt.observed !== 'string' || typeof attempt.rationale !== 'string' || !Array.isArray(attempt.remainingQuestions) || !attempt.remainingQuestions.every(nonempty) || !Array.isArray(attempt.evidenceIds)) fail('Invalid attempt: ' + label);
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
async function checkV3(root, manifest) {
  assertClosed(manifest, ['schemaVersion', 'baselineSchemaVersion', 'runId', 'projectDir', 'baselineSha256'], 'manifest');
  if (manifest.schemaVersion !== 3 || manifest.baselineSchemaVersion !== 3 || !nonempty(manifest.projectDir) || !path.isAbsolute(manifest.projectDir) || !nonempty(manifest.runId) || !/^[a-f0-9]{64}$/.test(manifest.baselineSha256)) fail('Invalid v3 manifest.');
  const { baseline } = await readAndValidateBaseline(root, manifest);
  const byId = new Map(baseline.cases.map(c => [c.id, c]));
  const evidenceCatalog = await readJSON(path.join(root, 'evidence.json'));
  assertClosed(evidenceCatalog, ['schemaVersion', 'revision', 'items', 'operations'], 'evidence catalog');
  if (evidenceCatalog.schemaVersion !== 3 || !Number.isSafeInteger(evidenceCatalog.revision) || evidenceCatalog.revision < 0 || !Array.isArray(evidenceCatalog.items) || !Array.isArray(evidenceCatalog.operations)) fail('Invalid v3 evidence catalog.');
  const evidenceById = new Map(), catalogIds = new Set(), catalogPaths = new Set();
  for (const item of evidenceCatalog.items) {
    await validateV3EvidenceItem(root, item, byId, catalogIds, catalogPaths);
    evidenceById.set(item.id, item);
  }
  const evidenceOps = new Map();
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
  const results = await readJSON(path.join(root, 'results.json'));
  assertClosed(results, ['schemaVersion', 'revision', 'cases', 'operations'], 'results');
  if (results.schemaVersion !== 3 || !Number.isSafeInteger(results.revision) || results.revision < 0 || !Array.isArray(results.cases) || !Array.isArray(results.operations)) fail('Invalid v3 results schema.');
  const resultOps = new Map();
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
  const seen = new Set(), attemptIds = new Set();
  for (const record of results.cases) {
    if (!object(record) || !byId.has(record.id)) fail('Unknown case id in results.');
    if (seen.has(record.id)) fail('Duplicate result id: ' + record.id);
    seen.add(record.id);
    const expected = byId.get(record.id).basis;
    if (!object(record.basis) || Object.keys(record.basis).length !== 3 || ['kind', 'source', 'text'].some(key => record.basis[key] !== expected[key])) fail('Basis changed: ' + record.id);
    await validateV3Record(record, record.id, evidenceById, record.id, byId.get(record.id).clarificationQuestions ?? [], resultOps, attemptIds, results.revision);
  }
  if (seen.size !== byId.size) fail('Missing original cases in results. Keep unexecuted cases as not_run.');
  const attemptsById = new Map();
  for (const record of results.cases) for (const attempt of record.attempts) attemptsById.set(attempt.attemptId, attempt);
  for (const op of results.operations) if (op.attemptId !== undefined) {
    const attempt = attemptsById.get(op.attemptId);
    if (!attempt || attempt.operationId !== op.operationId || attempt.revision !== op.revision) fail('Result operation receipt references a mismatched attempt: ' + op.attemptId);
    if (attempt.kind === 'attempt' && (op.mode !== 'attempt' || attempt.status !== op.status)) fail('Attempt operation receipt does not match its attempt: ' + op.attemptId);
    if (attempt.kind === 'superseded_final' && op.mode !== 'final') fail('Superseded final snapshot must be linked to a final operation: ' + op.attemptId);
  }
  const ordered = baseline.cases.map(c => ({ ...c, ...results.cases.find(r => r.id === c.id) }));
  const counts = countsFor(ordered), progressSummary = progressFor(ordered);
  return {
    schemaVersion: 3, runId: manifest.runId, project: baseline.project, structurallyValid: true,
    revision: results.revision, evidenceRevision: evidenceCatalog.revision,
    hasUnexecutedCases: ordered.some(c => c.status === 'not_run'), counts, progress: progressSummary,
    recordedExplicitOutcomes: { pass: ordered.filter(c => c.basis.kind === 'explicit' && c.status === 'pass').length, fail: ordered.filter(c => c.basis.kind === 'explicit' && c.status === 'fail').length },
    evidenceIntegrity: { hashVerifiedItems: evidenceCatalog.items.length },
    caveat: 'Structural validation and file hash comparison only. Verdicts, sources, and capture times are operator supplied, not authenticated. SHA-256 matching proves only that the current bytes match the catalog hash, not who created them or whether they are true. The frozen baseline hash is not tamper-proof. Helpers are not a security boundary for actions bypassing them.',
    evidenceCatalog, cases: ordered
  };
}
async function checkUnlocked(root) {
  const manifest = await readJSON(path.join(root, 'manifest.json'));
  assertClosed(manifest, ['schemaVersion', 'baselineSchemaVersion', 'runId', 'projectDir', 'baselineSha256'], 'manifest');
  if (manifest.schemaVersion !== 3) fail('Unsupported run schema version. Start a new v3 run from the schemaVersion 3 cases file; old run directories are not migrated.');
  return checkV3(root, manifest);
}
async function markerExists(root) {
  const filename = path.join(root, '.evidence.pending.json');
  try { await safePath(filename, { existing: true }); return filename; }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function markerPaths(root, marker) {
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
async function recoverEvidence(root) {
  const markerFilename = await markerExists(root);
  if (!markerFilename) return;
  const marker = await readJSON(markerFilename);
  assertClosed(marker, ['schemaVersion', 'operationId', 'payloadSha256', 'evidenceId', 'stagePath', 'finalPath', 'catalogTempPath', 'markerTempPath', 'sha256', 'bytes'], 'pending evidence marker');
  if (marker.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(marker.payloadSha256)) fail('Invalid pending evidence recovery marker.');
  safeIdentifier(marker.operationId, 'pending evidence operation id');
  const paths = markerPaths(root, marker);
  const catalog = await readJSON(path.join(root, 'evidence.json'));
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
    if (!/^[a-f0-9]{64}$/.test(marker.sha256) || !Number.isSafeInteger(marker.bytes)) fail('Uncommitted evidence file has no verified cleanup hash; inspect the run manually.');
    const actual = await hashFile(paths.final);
    if (actual.sha256 !== marker.sha256 || actual.bytes !== marker.bytes) fail('Uncommitted evidence file changed; refusing cleanup.');
    await removeRegularIfPresent(paths.final);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await removeRegularIfPresent(markerFilename);
}
export async function check(runDir) {
  return withRunLock(runDir, async root => { await recoverEvidence(root); return checkUnlocked(root); });
}
function validateText(value, label, limit = 4096) {
  if (!nonempty(value) || value.length > limit || value.includes('\0')) fail('Invalid ' + label + '.');
  return value;
}
function validateRecordRequest(request) {
  assertClosed(request, ['schemaVersion', 'operationId', 'expectedRevision', 'caseId', 'mode', 'record'], 'record request');
  if (request.schemaVersion !== 3) fail('Record requests require schemaVersion 3.');
  safeIdentifier(request.operationId, 'operation id'); safeIdentifier(request.caseId, 'case id');
  if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0 || !['final', 'attempt'].includes(request.mode)) fail('Invalid record request revision or mode.');
  assertClosed(request.record, ['status', 'observed', 'rationale', 'remainingQuestions', 'evidenceIds', 'cause'], 'record payload');
  if (!statuses.has(request.record.status) || typeof request.record.observed !== 'string' || typeof request.record.rationale !== 'string' || !Array.isArray(request.record.remainingQuestions) || !request.record.remainingQuestions.every(nonempty) || !Array.isArray(request.record.evidenceIds)) fail('Invalid record payload.');
  if (request.mode === 'attempt' && request.record.status === 'not_run') fail('An attempt must record an observation; use final mode with not_run when no attempt occurred.');
  const ids = request.record.evidenceIds.map(id => safeIdentifier(id, 'evidence id'));
  if (new Set(ids).size !== ids.length) fail('Duplicate evidence id in record.');
  if (request.record.cause !== undefined && !causes.has(request.record.cause)) fail('Invalid cause.');
  if (['pass', 'fail'].includes(request.record.status) && (!request.record.observed.trim() || !request.record.rationale.trim() || !ids.length)) fail('Pass/fail requires rationale and evidence plus observed behavior.');
  if (['inconclusive', 'blocked'].includes(request.record.status) && !request.record.rationale.trim()) fail('Inconclusive/blocked requires rationale.');
}
function resultOperationReceipt(op, replayed = false) {
  return { operationId: op.operationId, revision: op.revision, caseId: op.caseId, mode: op.mode, status: op.status, ...(op.attemptId ? { attemptId: op.attemptId } : {}), ...(op.noOp ? { noOp: true } : {}), replayed };
}
function evidenceOperationReceipt(op, replayed = false) {
  return { operationId: op.operationId, revision: op.revision, caseId: op.caseId, evidenceId: op.evidenceId, path: op.path, sha256: op.sha256, bytes: op.bytes, collectedAt: op.committedAt, replayed };
}
export async function recordResult({ runDir, request }, testHooks = {}) {
  return withRunLock(runDir, async root => {
    await recoverEvidence(root);
    const checked = await checkUnlocked(root);
    if (checked.schemaVersion !== 3) fail('Run schemaVersion 3 is required; start a new run from the schemaVersion 3 cases file. Existing run directories are not migrated.');
    validateRecordRequest(request);
    const resultsPath = path.join(root, 'results.json'), results = await readJSON(resultsPath);
    const payloadSha256 = canonicalHash(request);
    const existing = results.operations.find(op => op.operationId === request.operationId);
    if (existing) {
      if (existing.payloadSha256 !== payloadSha256) fail('Operation ID was already used with a different payload.');
      return resultOperationReceipt(existing, true);
    }
    const evidenceCatalog = await readJSON(path.join(root, 'evidence.json'));
    if (evidenceCatalog.operations.some(op => op.operationId === request.operationId)) fail('Operation ID is already used by an evidence operation.');
    if (request.expectedRevision !== results.revision) fail('Revision conflict: expected ' + request.expectedRevision + ', current ' + results.revision + '.');
    const baselineCase = checked.cases.find(c => c.id === request.caseId);
    if (!baselineCase) fail('Unknown case id: ' + request.caseId);
    if ((baselineCase.clarificationQuestions ?? []).length && ['pass', 'fail'].includes(request.record.status)) fail('Pending clarification prohibits pass/fail: ' + request.caseId);
    const next = structuredClone(results), target = next.cases.find(c => c.id === request.caseId);
    const newRecord = {
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
    const isNoOp = request.mode === 'final' && sameRecord(target, newRecord);
    const revision = isNoOp ? results.revision : results.revision + 1;
    let attemptId;
    const recordedAt = now();
    if (request.mode === 'attempt') {
      attemptId = randomId('att-');
      target.attempts.push({ attemptId, operationId: request.operationId, revision, recordedAt, kind: 'attempt', ...newRecord });
    } else if (!isNoOp) {
      if (target.status !== 'not_run' && !target.attempts.some(a => sameRecord(a, target))) {
        attemptId = randomId('att-');
        target.attempts.push({
          attemptId, operationId: request.operationId,
          revision, recordedAt,
          kind: 'superseded_final', ...canonicalRecord(target)
        });
      }
      Object.assign(target, newRecord, { operationId: request.operationId, revision, recordedAt });
    }
    next.revision = revision;
    const operation = {
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
async function copyAndHashSource(source, stage) {
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
function validateEvidenceRequest(request) {
  assertClosed(request, ['schemaVersion', 'operationId', 'expectedRevision', 'caseId', 'sourceFile', 'kind', 'capturedAt', 'source', 'description'], 'evidence request');
  if (request.schemaVersion !== 3) fail('Evidence requests require schemaVersion 3.');
  safeIdentifier(request.operationId, 'operation id'); safeIdentifier(request.caseId, 'case id');
  if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0) fail('Invalid evidence request revision.');
  if (typeof request.sourceFile !== 'string' || !path.isAbsolute(request.sourceFile) || request.sourceFile.includes('\0')) fail('Evidence sourceFile must be an absolute local path.');
  if (!evidenceKinds.has(request.kind)) fail('Invalid evidence kind.');
  validateText(request.source, 'evidence source'); validateText(request.description, 'evidence description');
  if (Object.hasOwn(request, 'capturedAt')) assertTimestamp(request.capturedAt, 'capturedAt');
}
async function registerEvidenceUnlocked(root, request, testHooks = {}) {
  await recoverEvidence(root);
  const checked = await checkUnlocked(root);
  if (checked.schemaVersion !== 3) fail('Run schemaVersion 3 is required; start a new run from the schemaVersion 3 cases file. Existing run directories are not migrated.');
  validateEvidenceRequest(request);
  const catalogPath = path.join(root, 'evidence.json'), catalog = await readJSON(catalogPath);
  const payloadSha256 = canonicalHash(request);
  const existing = catalog.operations.find(op => op.operationId === request.operationId);
  if (existing) {
    if (existing.payloadSha256 !== payloadSha256) fail('Operation ID was already used with a different payload.');
    return evidenceOperationReceipt(existing, true);
  }
  const results = await readJSON(path.join(root, 'results.json'));
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
  const marker = {
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
    const item = {
      id: evidenceId, path: relativeFinal, caseId: request.caseId, kind: request.kind,
      ...(Object.hasOwn(request, 'capturedAt') ? { capturedAt: request.capturedAt } : {}),
      collectedAt, source: request.source, description: request.description,
      sha256: actual.sha256, bytes: actual.bytes, operationId: request.operationId
    };
    const operation = { operationId: request.operationId, payloadSha256, revision: catalog.revision + 1, committedAt: collectedAt, caseId: request.caseId, evidenceId, path: relativeFinal, sha256: actual.sha256, bytes: actual.bytes };
    const updated = { ...catalog, revision: catalog.revision + 1, items: [...catalog.items, item], operations: [...catalog.operations, operation] };
    if (typeof testHooks.beforeCatalogCommit === 'function') await testHooks.beforeCatalogCommit();
    await atomicReplace(catalogPath, json(updated), catalogTemp);
    committed = true;
    if (typeof testHooks.afterCommit === 'function') await testHooks.afterCommit();
    await removeRegularIfPresent(stage); await removeRegularIfPresent(markerTemp); await removeRegularIfPresent(markerFile);
    return evidenceOperationReceipt(operation, false);
  } catch (error) {
    let current;
    try { current = await readJSON(catalogPath); } catch {}
    committed = committed || Boolean(current?.operations?.some(op => op.operationId === request.operationId));
    if (committed) throw error;
    try { await recoverEvidence(root); } catch (cleanupError) { error.cleanupError = cleanupError.message; }
    throw error;
  }
}
export async function registerEvidence({ runDir, request }, testHooks = {}) {
  return withRunLock(runDir, root => registerEvidenceUnlocked(root, request, testHooks));
}
export async function progress(runDir) {
  return withRunLock(runDir, async root => {
    await recoverEvidence(root);
    const result = await checkUnlocked(root);
    return { schemaVersion: result.schemaVersion, runId: result.runId, revision: result.revision ?? null, progress: progressFor(result.cases), currentStatusCounts: result.counts };
  });
}
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\*_{}\[\]()#+.!|~-]/g, '\\$&').split(String.fromCharCode(96)).join('\\' + String.fromCharCode(96)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0')).replace(/\r?\n/g, '  \n');
export function markdown(report) {
  let output = '# Local evidence report\n\n' + escape(report.project) + '\n\n' + report.caveat + '\n\n';
  if (report.schemaVersion === 3) {
    output += 'Run revision: ' + report.revision + '; evidence revision: ' + report.evidenceRevision + '\n\n';
    output += 'Evidence entries with matching SHA-256 at check: ' + report.evidenceIntegrity.hashVerifiedItems + '\n\n';
    output += 'Progress: ' + report.progress.completed.count + ' completed; ' + report.progress.uncompleted.count + ' uncompleted; ' + report.progress.pendingClarification.count + ' pending clarification; ' + report.progress.attemptedCases.totalAttempts + ' historical attempts.\n\n';
  }
  output += 'Unexecuted cases remain (status not_run): ' + report.hasUnexecutedCases + '\n\n';
  output += 'Recorded explicit outcomes (operator supplied): ' + report.recordedExplicitOutcomes.pass + ' pass, ' + report.recordedExplicitOutcomes.fail + ' fail.\n\n';
  output += report.cases.map(c => {
    const attempts = c.attempts ?? [], evidenceIds = c.evidenceIds ?? [];
    return '## ' + escape(c.id) + ': ' + escape(c.title) + '\n\n' +
      'Basis: ' + c.basis.kind + (c.basis.kind === 'explicit' ? '' : ' (NOT confirmed acceptance)') + '\n\n' +
      'Source: ' + escape(c.basis.source) + '\n\nRequirement: ' + escape(c.basis.text) + '\n\n' +
      'Expected: ' + escape(c.expected) + '\n\n' +
      'Baseline clarification questions: ' + ((c.clarificationQuestions ?? []).map(escape).join('; ') || '(none supplied)') + '\n\n' +
      'Critical conditions: ' + escape(c.criticalConditions.join('; ') || '(none supplied)') + '\n\n' +
      'Required path: ' + escape(c.requiredPath ?? '(none supplied)') + '\n\n' +
      'Step order: ' + c.stepOrder + ' (' + (c.stepOrder === 'strict' ? 'preserve the business-step sequence' : 'UI route/order may adapt only within intent and preconditions; do not skip steps') + ')\n\n' +
      'Planned steps (frozen baseline, not execution proof):\n\n' +
      c.steps.map((step, index) => (index + 1) + '. ' + escape(step.id) + ': ' + escape(step.action) + '\n   Expected checkpoint: ' + (Object.hasOwn(step, 'expected') ? escape(step.expected) : '(not specified; no checkpoint verdict)') + '\n').join('') +
      'Recorded status: ' + c.status + '\n\nObserved: ' + escape(c.observed) + '\n\nRationale: ' + escape(c.rationale) + '\n\n' +
      'Remaining questions: ' + ((c.remainingQuestions ?? []).map(escape).join('; ') || '(none supplied)') + '\n\n' +
      'Cause: ' + (c.cause ?? 'unknown') + '\n\n' +
      'Evidence IDs: ' + (evidenceIds.map(escape).join(', ') || '(none)') + '\n\n' +
      'Recorded attempts: ' + attempts.length + '\n\n' +
      attempts.map((a, i) => 'Attempt ' + (i + 1) + (a.attemptId ? ' (' + escape(a.attemptId) + '; ' + escape(a.kind) + ')' : '') + ': ' + a.status + '; cause: ' + (a.cause ?? 'unknown') + '\n\nObserved: ' + escape(a.observed) + '\n\nRationale: ' + escape(a.rationale) + '\n\nRemaining questions: ' + ((a.remainingQuestions ?? []).map(escape).join('; ') || '(none supplied)') + '\n\nEvidence IDs: ' + (a.evidenceIds.map(escape).join(', ') || '(none)') + '\n\n').join('');
  }).join('');
  output += '## Evidence catalog\n\n' + report.evidenceCatalog.items.map(item => {
    const hasHash = typeof item.sha256 === 'string';
    return '- ' + escape(item.id) + ': ' + escape(item.path) + '\n' +
      '  Case: ' + escape(item.caseId) + '\n' +
      '  Kind: ' + item.kind + '; bytes: ' + item.bytes + '; SHA-256: ' + item.sha256 + '\n' +
      '  Collected at: ' + escape(item.collectedAt) + '; source captured at: ' + escape(item.capturedAt ?? '(not supplied)') + '\n' +
      '  Source: ' + escape(item.source) + '\n  Description: ' + escape(item.description) + '\n\n';
  }).join('');
  return output;
}

function rasterMime(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
function safeJsonForHtml(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => ({ '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029' })[character]);
}
async function htmlReportPayload(root, reportData) {
  const previews = {};
  for (const item of reportData.evidenceCatalog.items) {
    let preview = null, previewNote = '';
    if (item.kind === 'screenshot') {
      const filename = await evidenceFile(root, item.path);
      const bytes = await fs.readFile(filename);
      const sha256 = hash(bytes), mime = rasterMime(bytes);
      if (sha256 !== item.sha256 || bytes.length !== item.bytes) fail('Evidence content hash or byte count mismatch while building HTML: ' + item.id);
      if (mime) preview = 'data:' + mime + ';base64,' + bytes.toString('base64');
      else previewNote = '截图已登记且哈希匹配，但不是支持预览的 PNG、JPEG 或 WebP；未在 HTML 中作为图片打开。';
    }
    previews[item.id] = { preview, previewNote };
  }
  return { htmlPayloadVersion: 1, report: reportData, previews };
}
export function htmlReport(reportData) {
  const embedded = safeJsonForHtml(reportData);
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>本地测试报告</title>
<style>
:root{color-scheme:light;--navy:#12314c;--cyan:#087e91;--ink:#243747;--muted:#5f7180;--line:#dbe4e9;--paper:#f2f6f8;--white:#fff;--shadow:0 8px 24px #12314c0d}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}header{background:linear-gradient(120deg,#12314c,#087e91);color:white;padding:30px max(20px,calc((100% - 1180px)/2)) 26px}header h1{margin:0 0 6px;font-size:clamp(24px,4vw,34px)}header p{margin:0;color:#e1f2f4}.wrap{max-width:1180px;margin:auto;padding:22px 20px 56px}.notice{padding:12px 16px;background:#e6f4f5;border-left:4px solid var(--cyan);border-radius:8px;margin-bottom:18px}.summary{display:grid;grid-template-columns:repeat(8,minmax(100px,1fr));gap:12px;margin:18px 0}.metric,.panel,.case-card{background:var(--white);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow)}.metric{padding:14px}.metric b{display:block;font-size:24px;color:var(--navy)}.metric span{color:var(--muted);font-size:13px}.toolbar{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.toolbar input,.toolbar select{font:inherit;border:1px solid #bccbd3;background:#fff;border-radius:8px;padding:10px 12px;color:var(--ink)}.toolbar input{flex:1;min-width:210px}.case-list{display:grid;gap:13px}.case-card{overflow:hidden}.case-card[hidden]{display:none}.case-card summary{cursor:pointer;list-style:none;padding:17px 18px;display:flex;align-items:center;gap:12px}.case-card summary::-webkit-details-marker{display:none}.case-card summary:after{content:"展开 +";margin-left:auto;color:var(--cyan);font-weight:650}.case-card[open] summary:after{content:"收起 −"}.case-title{font-weight:700;color:var(--navy);min-width:0;overflow-wrap:anywhere}.case-id{font:12px ui-monospace,monospace;color:var(--muted)}.badge{border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700;white-space:nowrap;background:#edf1f4;color:#485763}.status-pass{background:#e1f4e9;color:#17633b}.status-fail{background:#fde8e7;color:#9b2721}.status-blocked{background:#fff1d7;color:#815609}.status-inconclusive{background:#e8eaff;color:#424d9a}.status-not_run{background:#edf1f4;color:#485763}.case-body{padding:0 18px 20px}.facts{display:grid;grid-template-columns:1fr 1fr;gap:12px}.panel{padding:14px 16px;box-shadow:none}.panel h3{font-size:14px;text-transform:none;color:var(--cyan);margin:0 0 8px}.panel p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.meta{color:var(--muted);font-size:13px}.section{margin-top:16px}.section h3{margin:0 0 8px;color:var(--navy);font-size:16px}.steps{margin:0;padding-left:22px}.steps li{padding:4px 0}.checkpoint{display:block;color:#6b4e12;font-size:13px}.list{margin:0;padding-left:21px}.history{display:grid;gap:10px}.history-item{border-left:3px solid #8ebac0;padding:3px 0 3px 12px}.history-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:7px}.evidence-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.evidence{border:1px solid var(--line);border-radius:9px;padding:8px;min-width:0}.thumb{width:100%;height:118px;object-fit:contain;background:#f2f5f7;border-radius:6px;cursor:zoom-in}.thumb:focus-visible,button:focus-visible,summary:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #24a4b5;outline-offset:2px}.evidence p{font-size:12px;margin:6px 0 0;overflow-wrap:anywhere}.compare{display:grid;grid-template-columns:1fr 1fr;gap:12px}.compare figure{margin:0}.compare img{width:100%;max-height:310px;object-fit:contain;background:#f2f5f7;border:1px solid var(--line);border-radius:8px;cursor:zoom-in}.compare figcaption{font-size:12px;color:var(--muted);margin-top:4px}.empty{padding:12px;background:#f4f6f7;border-radius:8px;color:var(--muted)}.integrity{font-size:13px;color:#426173}.muted{color:var(--muted)}dialog{width:min(96vw,1200px);max-width:none;max-height:94vh;padding:12px;border:0;border-radius:12px;background:#102536;color:white;box-shadow:0 20px 80px #0008}dialog::backdrop{background:#081522d9}.dialog-top{display:flex;justify-content:space-between;align-items:center;padding:2px 4px 10px}dialog button{border:1px solid #b9d1dc;border-radius:7px;background:#fff;color:#18364d;padding:7px 12px;font:inherit;cursor:pointer}dialog img{display:block;max-width:100%;max-height:80vh;margin:auto;object-fit:contain}@media(max-width:850px){.summary{grid-template-columns:repeat(4,1fr)}}@media(max-width:560px){header{padding:22px 18px}.wrap{padding:15px 12px 40px}.summary{grid-template-columns:repeat(2,1fr);gap:8px}.metric{padding:11px}.facts,.compare{grid-template-columns:1fr}.case-card summary{padding:14px 12px;gap:8px;flex-wrap:wrap}.case-body{padding:0 12px 15px}.toolbar>*{width:100%}.toolbar input{min-width:0}}
</style></head><body>
<header><h1>测试结果与证据</h1><p id="project-line"></p></header><main class="wrap">
<div class="notice"><strong>解读：</strong>状态是记录的业务判断；下方文件完整性只表示报告生成时证据字节与 catalog 中的 SHA-256 / 大小匹配。匹配不证明来源真实或业务结论正确。此文件可离线打开，截图以安全识别的 PNG/JPEG/WebP 数据内嵌。</div>
<div class="summary" id="summary" aria-label="结果概览"></div>
<p class="integrity" id="integrity"></p>
<div class="toolbar"><input id="search" type="search" placeholder="搜索用例、预期、观察或证据说明" aria-label="搜索报告"><select id="status-filter" aria-label="按状态筛选"><option value="all">所有状态</option><option value="pass">通过</option><option value="fail">失败</option><option value="inconclusive">待判断</option><option value="blocked">受阻</option><option value="not_run">未执行</option></select><span id="shown" class="meta" aria-live="polite"></span></div>
<div class="case-list" id="case-list"></div><p id="empty-results" class="empty" hidden>没有符合筛选条件的用例。</p></main>
<dialog id="lightbox" aria-label="截图预览"><div class="dialog-top"><span id="lightbox-caption"></span><button id="lightbox-close" type="button">关闭</button></div><img id="lightbox-image" alt="证据截图放大预览"></dialog>
<script type="application/json" id="report-data">${embedded}</script>
<script>
(()=>{'use strict';const payload=JSON.parse(document.getElementById('report-data').textContent);if(payload.htmlPayloadVersion!==1)throw new Error('Unsupported HTML report payload.');const data=payload.report;const $=s=>document.querySelector(s);const labels={pass:'通过',fail:'失败',inconclusive:'待判断',blocked:'受阻',not_run:'未执行'};const itemMap=new Map(data.evidenceCatalog.items.map(x=>[x.id,{...x,...payload.previews[x.id]}]));$('#project-line').textContent=(data.project||'未命名项目')+' · Run '+data.runId;$('#integrity').textContent='文件完整性：生成报告时 '+data.evidenceIntegrity.hashVerifiedItems+' 项已登记证据均通过 hash / 字节数校验。该检查与业务状态分开展示。';
const cards=[['用例总数',data.cases.length],['通过',data.counts.pass],['失败',data.counts.fail],['待判断',data.counts.inconclusive],['受阻',data.counts.blocked],['未执行',data.counts.not_run],['待澄清用例',data.progress.pendingClarification.count],['历史尝试',data.progress.attemptedCases.totalAttempts]];const summary=$('#summary');for(const [label,value] of cards){const div=document.createElement('div');div.className='metric';const strong=document.createElement('b');strong.textContent=String(value);const span=document.createElement('span');span.textContent=label;div.append(strong,span);summary.append(div)}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n}function panel(title,text){const p=el('section','panel');p.append(el('h3','',title),el('p','',text||'（未提供）'));return p}function addEvidence(parent,ids,owner){const known=ids.map(id=>itemMap.get(id)).filter(Boolean);const shots=known.filter(x=>x.kind==='screenshot'&&x.preview);if(!known.length){parent.append(el('div','empty','没有证据关联到这条记录。'));return shots}if(!shots.length){parent.append(el('div','empty','已关联 '+known.length+' 项证据，但没有可预览的截图。'));}const grid=el('div','evidence-grid');for(const item of known){const box=el('article','evidence');if(item.preview){const img=el('img','thumb');img.src=item.preview;img.alt=item.description||'登记的截图';img.tabIndex=0;img.dataset.caption=item.description||item.id;img.addEventListener('click',()=>openImage(img));img.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openImage(img)}});box.append(img)}box.append(el('p','',item.description||item.id),el('p','meta','ID '+item.id+' · '+item.kind+' · '+item.bytes+' bytes'),el('p','meta','登记 '+item.collectedAt+(item.capturedAt?' · 来源时间 '+item.capturedAt:'')),...(item.previewNote?[el('p','meta',item.previewNote)]:[]));grid.append(box)}parent.append(grid);return shots}
function openImage(img){$('#lightbox-image').src=img.src;$('#lightbox-caption').textContent=img.dataset.caption||img.alt;$('#lightbox').showModal()}$('#lightbox-close').addEventListener('click',()=>$('#lightbox').close());$('#lightbox').addEventListener('click',e=>{if(e.target===$('#lightbox'))$('#lightbox').close()});
function renderCase(c){const details=el('details','case-card');details.dataset.status=c.status;const searchable=[c.id,c.title,c.expected,c.observed,c.rationale,c.basis.text,c.basis.source,...c.remainingQuestions,...(c.clarificationQuestions||[]),...data.evidenceCatalog.items.filter(x=>x.caseId===c.id).map(x=>x.description)].join(' ').toLocaleLowerCase();details.dataset.search=searchable;const sum=document.createElement('summary');sum.append(el('span','case-id',c.id),el('span','case-title',c.title),el('span','badge status-'+c.status,labels[c.status]||c.status));details.append(sum);const body=el('div','case-body');const facts=el('div','facts');facts.append(panel('冻结业务预期',c.expected),panel('实际观察',c.observed|| (c.status==='not_run'?'尚无执行观察。':'尚未记录观察。')),panel('判断理由',c.rationale||'尚未记录判断理由。'),panel('需求依据 · '+(c.basis.kind==='explicit'?'明确要求':'解释 / 探索依据'),(c.basis.source?c.basis.source+'\\n':'')+c.basis.text));body.append(facts);
const steps=el('section','section');steps.append(el('h3','','冻结步骤与可选检查点'));const ol=el('ol','steps');for(const [i,s] of c.steps.entries()){const li=el('li','',s.action);if(Object.hasOwn(s,'expected'))li.append(el('span','checkpoint','预期检查点：'+s.expected+'（没有单独的步骤 verdict 字段）'));else li.append(el('span','meta','未定义独立步骤预期。'));ol.append(li)}steps.append(ol,el('p','meta','步骤检查点不单独记录 verdict；本报告不从计划步骤推断执行完成。请结合实际观察、判断理由与下方未验证项复核。'));body.append(steps);
const gaps=el('section','section');gaps.append(el('h3','','未验证项与待澄清'));const questions=[...(c.clarificationQuestions||[]).map(x=>'冻结待澄清：'+x),...(c.remainingQuestions||[]).map(x=>'记录的剩余问题：'+x)];if(c.status==='not_run')questions.unshift('该用例尚未执行。');else if(c.status==='blocked')questions.unshift('执行受阻；不能据此判断未观察目标。');else if(c.status==='inconclusive')questions.unshift('当前结论不确定；未解决的预期不可视为已验证。');else questions.unshift('步骤级结论未单独记录；报告只显示用例级状态。');if(!questions.length)questions.push('没有记录剩余问题；这不代表文件哈希能证明业务正确。');const ul=el('ul','list');for(const q of questions)ul.append(el('li','',q));gaps.append(ul);body.append(gaps);
const history=el('section','section');history.append(el('h3','','当前结果与历史尝试'));const observations=[...c.attempts.map((a,i)=>({record:a,label:(a.kind==='superseded_final'?'被替换的最终观察':'历史尝试')+' '+(i+1)})),{record:c,label:'当前最终结果'}];for(const entry of observations){const r=entry.record,box=el('div','history-item'),head=el('div','history-head');head.append(el('strong','',entry.label),el('span','badge status-'+r.status,labels[r.status]||r.status),el('span','meta',r.recordedAt||''),el('span','meta','原因：'+(r.cause||'unknown')));box.append(head,panel('观察',r.observed||'未记录'),panel('判断理由',r.rationale||'未记录'));const evidence=el('div','section');evidence.append(el('h3','','关联证据'));const shots=addEvidence(evidence,r.evidenceIds||[],c.id);if(!shots.length)evidence.append(el('p','meta','这条观察没有关联可预览的图片证据；图片不是强制要求，也不因此自动判定失败。'));box.append(evidence);history.append(box)}body.append(history);
const caseItems=data.evidenceCatalog.items.filter(x=>x.caseId===c.id).map(x=>itemMap.get(x.id));const unlinked=caseItems.filter(x=>![...c.evidenceIds,...c.attempts.flatMap(a=>a.evidenceIds)].includes(x.id));if(unlinked.length){const section=el('section','section');section.append(el('h3','','已登记但未被观察引用的证据'));const ids=unlinked.map(x=>x.id);addEvidence(section,ids,c.id);section.append(el('p','meta','这些文件已通过本次完整性校验，但未关联到当前结果或历史尝试，不作为其结论依据。'));body.append(section)}
const allShots=caseItems.filter(x=>x.kind==='screenshot'&&x.preview).sort((a,b)=>Date.parse(a.collectedAt)-Date.parse(b.collectedAt));if(allShots.length>=2){const section=el('section','section');section.append(el('h3','','截图时间对照'));const compare=el('div','compare');for(const [item,label] of [[allShots[0],'较早登记（collectedAt）'],[allShots[allShots.length-1],'较晚登记（collectedAt）']]){const figure=document.createElement('figure'),img=el('img','');img.src=item.preview;img.alt=item.description||label;img.dataset.caption=item.description||label;img.tabIndex=0;img.addEventListener('click',()=>openImage(img));img.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openImage(img)}});figure.append(img,el('figcaption','',label+' · '+(item.description||item.id)));compare.append(figure)}section.append(compare,el('p','meta','顺序依据工具登记时间；这只是文件时间对照，不代表业务状态变化或成功。'));body.append(section)}details.append(body);return details}
const list=$('#case-list');for(const c of data.cases)list.append(renderCase(c));function filter(){const q=$('#search').value.trim().toLocaleLowerCase(),status=$('#status-filter').value;let shown=0;for(const card of list.children){const visible=(status==='all'||card.dataset.status===status)&&(!q||card.dataset.search.includes(q));card.hidden=!visible;if(visible)shown++}$('#shown').textContent='显示 '+shown+' / '+data.cases.length+' 个用例';$('#empty-results').hidden=shown!==0}$('#search').addEventListener('input',filter);$('#status-filter').addEventListener('change',filter);filter();})();
</script></body></html>`;
}
export async function report(runDir) {
  return withRunLock(runDir, async root => {
    await recoverEvidence(root);
    const result = await checkUnlocked(root), htmlPayload = htmlReport(await htmlReportPayload(root, result)), jsonPayload = json(result), markdownPayload = markdown(result);
    const filenames = [path.join(root, 'report.json'), path.join(root, 'report.md'), path.join(root, 'report.html')];
    for (const filename of filenames) {
      await safePath(filename);
      try { await fs.lstat(filename); fail('Refusing to overwrite ' + path.basename(filename) + '.'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const created = [];
    try {
      await writeNew(filenames[0], jsonPayload); created.push(filenames[0]);
      await writeNew(filenames[1], markdownPayload); created.push(filenames[1]);
      await writeNew(filenames[2], htmlPayload); created.push(filenames[2]);
    } catch (error) {
      for (const filename of created.reverse()) { try { await removeRegularIfPresent(filename); } catch {} }
      throw error;
    }
    return { reportJson: filenames[0], reportMarkdown: filenames[1], reportHtml: filenames[2], schemaVersion: result.schemaVersion };
  });
}
export async function main(argv) {
  const [command, ...rest] = argv;
  if (command === '--help' || command === 'help' || !command) return 'Usage: node scripts/ego.mjs init --project-dir ABS\n       node scripts/ego.mjs validate-cases --cases ABS\n       node scripts/ego.mjs start --project-dir ABS --cases ABS --output-dir ABS\n       node scripts/ego.mjs evidence-add --run-dir ABS --request ABS_JSON\n       node scripts/ego.mjs record --run-dir ABS --request ABS_JSON\n       node scripts/ego.mjs progress --run-dir ABS\n       node scripts/ego.mjs check --run-dir ABS\n       node scripts/ego.mjs report --run-dir ABS\nreport writes report.json, report.md, and a standalone offline report.html; it refuses to overwrite them. Invalid run data or registered evidence stops report generation.\nCase inputs, run manifest, results, evidence catalog, requests, and JSON reports use schemaVersion 3. Existing v0.1.2 run directories are intentionally incompatible; create a new run from the original cases file. No migration command is provided.\nEvidence and record requests use operationId and expectedRevision. No network, model, browser, or Ego actions.';
  const allowed = { init: ['project-dir'], 'validate-cases': ['cases'], start: ['project-dir', 'cases', 'output-dir'], 'evidence-add': ['run-dir', 'request'], record: ['run-dir', 'request'], progress: ['run-dir'], check: ['run-dir'], report: ['run-dir'] }[command];
  if (!allowed) fail('Unknown command. Use --help.');
  const flags = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i].slice(2);
    if (!rest[i].startsWith('--') || !allowed.includes(key) || flags[key] !== undefined || !rest[i + 1] || rest[i + 1].startsWith('--')) fail('Unknown, duplicate, or incomplete option.');
    flags[key] = rest[i + 1];
  }
  if (allowed.some(key => !flags[key])) fail('Missing required option. Use --help.');
  if (command === 'validate-cases') return validateCases(flags.cases);
  if (command === 'init') return init(flags['project-dir']);
  if (command === 'start') return start({ projectDir: flags['project-dir'], casesFile: flags.cases, outputDir: flags['output-dir'] });
  if (command === 'evidence-add') return registerEvidence({ runDir: flags['run-dir'], request: await readJSON(await safePath(flags.request, { existing: true })) });
  if (command === 'record') return recordResult({ runDir: flags['run-dir'], request: await readJSON(await safePath(flags.request, { existing: true })) });
  if (command === 'progress') return progress(flags['run-dir']);
  if (command === 'check') return check(flags['run-dir']);
  return report(flags['run-dir']);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(result => process.stdout.write(typeof result === 'string' ? result + '\n' : json(result))).catch(error => { process.stderr.write('Error: ' + error.message + '\n'); process.exitCode = 1; });
}
