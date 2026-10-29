/** Worker-local sealing; does not take the shared run lock or make browser/AI decisions. */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Case, CheckedCase, EvidenceCatalog } from '../contracts/model.mjs';
import type { Assignment, WorkerPacket, PacketReview } from '../contracts/execution-model.mjs';
import { assignmentId } from '../contracts/ids.mjs';
import { assertClosed, canonical, canonicalHash, directory, errorInfo, fail, hash, inside, json, readJSON, safeIdentifier, safePath, writeNew } from '../core/common.mjs';
import { parseManifest, arrayValue, textValue } from '../core/validation.mjs';
import { mapRecordEvidence } from '../core/action-events.mjs';
import { parsePacket } from './parse.mjs';
import { retainReference, workerEvidencePath } from '../core/file-integrity.mjs';
import { checkUnlocked, validatePayloadAgainstCase } from '../core/records.mjs';

/** An explicit existing ID is resolved only inside the current run's verified catalog. Equal bytes alone never deduplicate collection. */
export function matchRegisteredEvidence(item: WorkerPacket['evidence'][number], id: string, caseId: string, catalog: EvidenceCatalog) {
  const registered = catalog.items.find(e => e.id === id);
  if (!registered || registered.caseId !== caseId) fail('Reused evidence must already exist in this run and case: ' + id);
  if (canonical(registered.metadata??null)!==canonical(item.metadata??null)) fail('Reused evidence metadata differs from its registered source.');
  if (registered.kind !== item.kind || registered.source !== item.source || registered.description !== item.description || registered.sha256 !== item.sha256 || registered.bytes !== item.bytes || registered.capturedAt !== item.capturedAt) fail('Reused evidence metadata or content differs from its registered source: ' + id);
  return registered;
}
export interface CommittedPacketFacts { case: CheckedCase; catalog: EvidenceCatalog; evidenceIds?: ReadonlyMap<string, string> }
export function validateAssessment(packet: WorkerPacket, c: Case, review?: PacketReview, committed?: CommittedPacketFacts): void {
  const record = review?.record ?? packet.record;
  if (review?.record) for (const key of ['contexts', 'actionEvents'] as const) for (const fact of packet.record[key] ?? []) {
    const retained = record[key]?.find(item => item.id === fact.id);
    if (!retained || canonical(retained) !== canonical(fact)) fail('Review must retain immutable worker ' + key + ': ' + fact.id);
  }
  if (committed && committed.case.id !== c.id) fail('Committed packet facts belong to a different case.');
  // Preserve real IDs for explicit reuse or a resumed import. New local evidence gets a validation-only ID.
  const evidence = new Map((committed?.catalog.items ?? []).map(item => [item.id, { caseId: item.caseId }])), ids = new Map<string, string>();
  for (const item of packet.evidence) {
    const importedId = committed?.evidenceIds?.get(item.key), existingId = item.reuseEvidenceId ?? importedId;
    if (importedId && item.reuseEvidenceId && importedId !== item.reuseEvidenceId) fail('Resumed import changed its explicit evidence reuse ID.');
    if (existingId) {
      if (!committed) fail('Explicit evidence reuse requires verified current-run facts.');
      const meta=item.metadata?{...item.metadata,...(item.metadata.contextEvidenceIds?{contextEvidenceIds:item.metadata.contextEvidenceIds.map(k=>packet.evidence.find(e=>e.key===k)?.reuseEvidenceId??committed.evidenceIds?.get(k)??k)}:{})}:undefined;
      matchRegisteredEvidence({...item,...(meta?{metadata:meta}:{})}, existingId, c.id, committed.catalog);
    }
    const id = existingId ?? 'packet-local-' + canonicalHash({ packetId: packet.packetId, key: item.key }).slice(0, 40);
    ids.set(item.key, id); evidence.set(id, { caseId: c.id });
  }
  const mapped = mapRecordEvidence(record, key => { const id = ids.get(key); if (!id) fail('Unknown packet evidence key: ' + key); return id; });
  validatePayloadAgainstCase(c, mapped, committed?.case.observations ?? [], evidence, committed?.case);
}
export async function verifyPacketFiles(root: string, a: Assignment, packet: WorkerPacket): Promise<void> {
  const workerRoot = path.join(root, ...a.workerDirectory.split('/'));
  for (const item of packet.evidence) {
    const filename = workerEvidencePath(workerRoot, item.path);
    const actual = await retainReference(root, filename);
    if (actual.sha256 !== item.sha256 || actual.bytes !== item.bytes) fail('Published packet evidence changed: ' + item.key);
  }
}
export async function sealPacket({ runDir, assignment, draftFile }: { runDir: unknown; assignment: string; draftFile: string }) {
  const root = await directory(runDir), id = assignmentId(assignment);
  const manifest = parseManifest(await readJSON(path.join(root, 'manifest.json'))); if (manifest.schemaVersion !== 8) fail('Packet sealing requires a v8 run.');
  const checked = await checkUnlocked(root);
  const workerRoot = path.join(root, 'workers', id), marker = await readJSON(await safePath(path.join(workerRoot, 'assignment.json'), { existing: true }));
  assertClosed(marker, ['assignmentId', 'caseId', 'attemptId', 'operationId'], 'assignment receipt');
  if (marker.assignmentId !== id) fail('Wrong assignment receipt.');
  const caseId = safeIdentifier(marker.caseId), attemptId = safeIdentifier(marker.attemptId), c = checked.cases.find(c => c.id === caseId); if (!c) fail('Unknown frozen case.');
  const inputPath = await safePath(draftFile, { existing: true }); if (!inside(workerRoot, inputPath)) fail('Draft must belong to the assigned worker directory.');
  const draft = await readJSON(inputPath);
  assertClosed(draft, ['schemaVersion', 'packetId', 'mode', 'record', 'evidence', 'executionWindow', 'spaceUsage'], 'worker draft');
  if (draft.schemaVersion !== 8) fail('Worker drafts require schemaVersion 8.');
  const packetId = safeIdentifier(draft.packetId, 'packet ID');
  const evidence = [];
  for (const raw of arrayValue(draft.evidence, 'draft evidence')) {
    assertClosed(raw, ['key', 'path', 'kind', 'source', 'description', 'capturedAt', 'reuseEvidenceId', 'metadata'], 'draft evidence');
    const relative = textValue(raw.path, 'draft evidence path');
    const filename = workerEvidencePath(workerRoot, relative, 'Draft');
    const actual = await retainReference(root, filename); evidence.push({ ...raw, sha256: actual.sha256, bytes: actual.bytes });
  }
  const packet = parsePacket({ ...draft, schemaVersion: 8, runId: manifest.runId, baselineSha256: manifest.baselineSha256, caseId, assignmentId: id, attemptId, evidence });
  const bytes = json(packet), priorImport = checked.execution?.imports.find(imp => imp.assignmentId === id && imp.packetId === packetId && imp.packetSha256 === hash(bytes) && imp.phase !== 'superseded');
  const importedIds = new Map((priorImport?.evidenceJobs ?? []).flatMap(job => job.receipt ? [[job.key, job.receipt.evidenceId] as const] : []));
  // Validate the worker's supplied decision. A later coordinator review may explicitly revise it.
  validateAssessment(packet, c, undefined, { case: c, catalog: checked.evidenceCatalog, evidenceIds: importedIds });
  const filename = await safePath(path.join(workerRoot, 'packet-' + packetId + '.json'));
  let replayed = false;
  try { await writeNew(filename, bytes); } catch (caught) { const error = errorInfo(caught); if (error.code !== 'EEXIST' || await fs.readFile(await safePath(filename, { existing: true }), 'utf8') !== bytes) throw error; replayed = true; }
  return { packetFile: filename, packetId, assignmentId: id, caseId, sha256: hash(bytes), bytes: Buffer.byteLength(bytes), replayed, committed: false };
}
