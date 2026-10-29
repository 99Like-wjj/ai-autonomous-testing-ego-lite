import { mapRecordEvidence } from '../core/action-events.mjs';
/** Recoverable file import under the caller's run lock. Never retries business actions. */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Case } from '../contracts/model.mjs';
import type { ExecutionLedger, ExecutionRequest, ImportState, Receipt, Operation } from '../contracts/execution-model.mjs';
import { assignmentId } from '../contracts/ids.mjs';
import { canonicalHash, fail, hash, inside, now, readJSON, safePath } from '../core/common.mjs';
import { parseCatalog, parseResults } from '../core/validation.mjs';
import { checkUnlocked, registerEvidenceUnlocked, recordResultUnlocked, evidenceOperationReceipt } from '../core/records.mjs';
import { assignment, checkpoint } from './ledger.mjs';
import { referencePath } from '../core/file-integrity.mjs';
import { parsePacket } from './parse.mjs';
import { matchRegisteredEvidence, validateAssessment, verifyPacketFiles } from './packets.mjs';
export interface ImportHooks { afterEvidenceCommit?: () => Promise<void>; afterResultCommit?: () => Promise<void>; afterPreparation?: () => Promise<void>; beforeResultCommit?: () => Promise<void> }

export async function importPacket(root: string, ledger: ExecutionLedger, cases: readonly Case[], request: Extract<ExecutionRequest, { kind: 'import' }>, operation: Operation, hooks: ImportHooks = {}): Promise<Receipt> {
  const filename = await safePath(request.packetFile, { existing: true }), relative = referencePath(root, filename), bytes = await fs.readFile(filename), packetSha256 = hash(bytes);
  const packet = parsePacket(JSON.parse(bytes.toString('utf8'))), a = assignment(ledger, assignmentId(packet.assignmentId));
  if (!inside(path.join(root, ...a.workerDirectory.split('/')), filename)) fail('Packet file belongs to a different assignment directory.');
  if (packet.runId !== ledger.runId || packet.baselineSha256 !== ledger.baselineSha256 || packet.caseId !== a.caseId || packet.attemptId !== a.attemptId) fail('Packet does not match its frozen run, case, and assignment.');
  const c = cases.find(c => c.id === packet.caseId); if (!c) fail('Packet case is not in the frozen baseline.');
  let journal = ledger.imports.find(imp => imp.operationId === request.operationId);
  if (journal && (journal.packetSha256 !== packetSha256 || journal.packetFile !== relative || journal.packetId !== packet.packetId || journal.phase === 'superseded')) fail('Immutable import input changed or was superseded.');
  const checked = await checkUnlocked(root), prior = checked.cases.find(c => c.id === packet.caseId); if (!prior) fail('Missing committed packet case.');
  const importedIds = new Map((journal?.evidenceJobs ?? []).flatMap(job => job.receipt ? [[job.key, job.receipt.evidenceId] as const] : []));
  validateAssessment(packet, c, request.review, { case: prior, catalog: checked.evidenceCatalog, evidenceIds: importedIds }); await verifyPacketFiles(root, a, packet);
  const mode = request.review.mode ?? packet.mode, record = request.review.record ?? packet.record;
  if (mode === 'final' && ledger.assignments.slice(ledger.assignments.indexOf(a) + 1).some(later => later.caseId === a.caseId)) fail('A stale assignment cannot replace a newer case final. Preserve it or explicitly review it as an attempt.');
  if (journal) {
    if (journal.packetSha256 !== packetSha256 || journal.packetFile !== relative || journal.packetId !== packet.packetId || journal.phase === 'superseded') fail('Immutable import input changed or was superseded.');
  } else {
    const old = ledger.imports.find(imp => imp.packetId === packet.packetId && imp.phase !== 'superseded');
    const evidenceJobs: ImportState['evidenceJobs'] = packet.evidence.map(item => ({ key: item.key }));
    if (old) {
      if (request.rebaseOf !== old.operationId || old.phase === 'complete' || old.packetSha256 !== packetSha256) fail('Packet ID already belongs to an import in this run; resume it or explicitly rebase an unapplied conflict. A different delivery needs a run-unique packet ID, for example one scoped by its assignment. Preserve the original packet.');
      const results = parseResults(await readJSON(path.join(root, 'results.json'))), catalog = parseCatalog(await readJSON(path.join(root, 'evidence.json')));
      if (old.resultRequest && results.entries.some(op => op.operationId === old.resultRequest?.operationId)) fail('The old result already committed. Resume the original import before revising it.');
      for (const job of old.evidenceJobs) {
        if (!job.request) continue;
        const committed = catalog.operations.find(op => op.operationId === job.request?.operationId);
        if (committed) {
          const target = evidenceJobs.find(item => item.key === job.key); if (!target || committed.caseId !== a.caseId) fail('Invalid retained evidence during rebase.');
          target.request = job.request; target.receipt = evidenceOperationReceipt(committed, true);
        } else if (job.receipt) fail('Previously committed evidence is missing; inspect rather than rebase.');
      }
      const oldOperation = ledger.operations.find(op => op.operationId === old.operationId); if (!oldOperation) fail('Original import operation missing.');
      old.phase = 'superseded'; old.supersededBy = request.operationId;
      oldOperation.receipt = { operationId: old.operationId, kind: 'import', revision: ledger.revision + 1, packetId: packet.packetId, assignmentId: a.id, state: 'superseded' };
    } else if (request.rebaseOf) fail('No matching import exists to rebase.');
    journal = { operationId: request.operationId, assignmentId: a.id, packetId: packet.packetId, packetSha256, packetFile: relative, originalPacket: packet, review: request.review, phase: 'prepared', startedAt: now(), evidenceJobs };
    ledger.imports.push(journal); ledger.operations.push(operation);
    await checkpoint(root, ledger, { operationId: request.operationId, kind: 'import-prepared', reason: request.reason, assignmentId: a.id });
    if (hooks.afterPreparation) await hooks.afterPreparation();
  }
  const prefix = 'imp-' + canonicalHash({ runId: ledger.runId, operationId: request.operationId }).slice(0, 32);
  for (const [i, item] of packet.evidence.entries()) {
    const job = journal.evidenceJobs.find(job => job.key === item.key); if (!job) fail('Missing evidence import job.');
    const sourceFile = path.join(root, ...a.workerDirectory.split('/'), ...item.path.split('/'));
    if (item.reuseEvidenceId) {
      const catalog = parseCatalog(await readJSON(path.join(root, 'evidence.json'))), retained = matchRegisteredEvidence(item, item.reuseEvidenceId, a.caseId, catalog);
      const sourceOperation = catalog.operations.find(op => op.operationId === retained.operationId && op.evidenceId === retained.id);
      if (!sourceOperation || job.request) fail('Explicit evidence reuse cannot create a new registration transaction.');
      const receipt = evidenceOperationReceipt(sourceOperation, true);
      if (job.receipt && canonicalHash(job.receipt) !== canonicalHash(receipt)) fail('Retained explicit evidence reuse receipt changed.');
      if (!job.receipt) {
        job.receipt = receipt; journal.phase = 'evidence';
        await checkpoint(root, ledger, { operationId: request.operationId, kind: 'evidence-reused', reason: request.reason, assignmentId: a.id });
      }
      continue;
    }
    if (job.receipt) {
      if (!job.request || job.receipt.operationId !== job.request.operationId || job.receipt.caseId !== a.caseId || job.receipt.sha256 !== item.sha256 || job.receipt.bytes !== item.bytes || job.request.sourceFile !== sourceFile) fail('Retained evidence job association changed.');
      continue;
    }
    if (!job.request) {
      const catalog = parseCatalog(await readJSON(path.join(root, 'evidence.json')));
      job.request = { schemaVersion: 7, operationId: prefix + '-ev-' + i, expectedRevision: catalog.revision, caseId: a.caseId, sourceFile: path.join(root, ...a.workerDirectory.split('/'), ...item.path.split('/')), kind: item.kind, source: item.source, description: item.description, ...(item.capturedAt === undefined ? {} : { capturedAt: item.capturedAt }) };
      journal.phase = 'evidence'; await checkpoint(root, ledger, { operationId: request.operationId, kind: 'evidence-prepared', reason: request.reason, assignmentId: a.id });
    }
    const expectedEvidence = { schemaVersion: 7, operationId: prefix + '-ev-' + i, expectedRevision: job.request.expectedRevision, caseId: a.caseId, sourceFile, kind: item.kind, source: item.source, description: item.description, ...(item.capturedAt === undefined ? {} : { capturedAt: item.capturedAt }) };
    if (canonicalHash(job.request) !== canonicalHash(expectedEvidence)) fail('Prepared evidence request changed.');
    job.receipt = await registerEvidenceUnlocked(root, job.request, hooks.afterEvidenceCommit ? { afterCommit: hooks.afterEvidenceCommit } : {});
    await checkpoint(root, ledger, { operationId: request.operationId, kind: 'evidence-committed', reason: request.reason, assignmentId: a.id });
  }
  const evidenceId = (key: string): string => { const receipt = journal.evidenceJobs.find(job => job.key === key)?.receipt; if (!receipt) fail('Evidence has not committed: ' + key); return receipt.evidenceId; };
  const mappedRecord = mapRecordEvidence(record, evidenceId);
  if (!journal.resultRequest) {
    const results = parseResults(await readJSON(path.join(root, 'results.json')));
    journal.resultRequest = { schemaVersion: 7, operationId: prefix + '-result', expectedRevision: results.revision, caseId: a.caseId, mode, record: mappedRecord };
    journal.phase = 'result'; await checkpoint(root, ledger, { operationId: request.operationId, kind: 'result-prepared', reason: request.reason, assignmentId: a.id });
  }
  const expectedResult = { schemaVersion: 7, operationId: prefix + '-result', expectedRevision: journal.resultRequest.expectedRevision, caseId: a.caseId, mode, record: mappedRecord };
  if (canonicalHash(journal.resultRequest) !== canonicalHash(expectedResult)) fail('Prepared result association or payload changed.');
  if (hooks.beforeResultCommit) await hooks.beforeResultCommit();
  journal.resultReceipt = await recordResultUnlocked(root, journal.resultRequest, hooks.afterResultCommit ? { afterCommit: hooks.afterResultCommit } : {});
  if (packet.executionWindow) a.executionWindow = packet.executionWindow;
  for (const use of packet.spaceUsage) if (use.spaceId === null || use.spaceId !== a.defaultSpaceId) a.spaceHistory.push({ spaceId: use.spaceId, kind: 'deviation', at: now(), reason: use.reason });
  a.updatedAt = now(); journal.phase = 'complete'; journal.completedAt = now();
  const receipt: Receipt = { operationId: request.operationId, kind: request.kind, revision: ledger.revision + 1, assignmentId: a.id, caseId: a.caseId, packetId: packet.packetId, evidenceIds: journal.evidenceJobs.map(job => evidenceId(job.key)), resultOperationId: journal.resultReceipt.operationId };
  operation.receipt = receipt;
  await checkpoint(root, ledger, { operationId: request.operationId, kind: 'import-complete', reason: request.reason, assignmentId: a.id });
  return receipt;
}
