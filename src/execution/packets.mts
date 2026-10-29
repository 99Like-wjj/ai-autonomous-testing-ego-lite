/** Worker-local sealing; does not take the shared run lock or make browser/AI decisions. */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Case } from '../contracts/model.mjs';
import type { Assignment, WorkerPacket, PacketReview } from '../contracts/execution-model.mjs';
import { assignmentId } from '../contracts/ids.mjs';
import { assertClosed, directory, errorInfo, fail, hash, inside, json, readJSON, safeIdentifier, safePath, writeNew } from '../core/common.mjs';
import { parseManifest, arrayValue, textValue } from '../core/validation.mjs';
import { readAndValidateBaseline } from '../core/baseline.mjs';
import { parsePacket } from './parse.mjs';
import { retainReference, workerEvidencePath } from '../core/file-integrity.mjs';
import { validatePayloadAgainstCase } from '../core/records.mjs';

export function validateAssessment(packet: WorkerPacket, c: Case, review?: PacketReview): void {
  const record = review?.record ?? packet.record;
  // Packet-local evidence identifiers are resolved by import, then checked by the same transaction validator.
  const evidence = new Map(packet.evidence.map(item => [item.key, { caseId: c.id }]));
  validatePayloadAgainstCase(c, record, [], evidence);
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
  const manifest = parseManifest(await readJSON(path.join(root, 'manifest.json'))); if (manifest.schemaVersion !== 6) fail('Packet sealing requires a v6 run.');
  const { baseline } = await readAndValidateBaseline(root, manifest);
  const workerRoot = path.join(root, 'workers', id), marker = await readJSON(await safePath(path.join(workerRoot, 'assignment.json'), { existing: true }));
  assertClosed(marker, ['assignmentId', 'caseId', 'attemptId', 'operationId'], 'assignment receipt');
  if (marker.assignmentId !== id) fail('Wrong assignment receipt.');
  const caseId = safeIdentifier(marker.caseId), attemptId = safeIdentifier(marker.attemptId), c = baseline.cases.find(c => c.id === caseId); if (!c) fail('Unknown frozen case.');
  const inputPath = await safePath(draftFile, { existing: true }); if (!inside(workerRoot, inputPath)) fail('Draft must belong to the assigned worker directory.');
  const draft = await readJSON(inputPath);
  assertClosed(draft, ['schemaVersion', 'packetId', 'mode', 'record', 'evidence', 'executionWindow', 'spaceUsage'], 'worker draft');
  if (draft.schemaVersion !== 6) fail('Worker drafts require schemaVersion 6.');
  const packetId = safeIdentifier(draft.packetId, 'packet ID');
  const evidence = [];
  for (const raw of arrayValue(draft.evidence, 'draft evidence')) {
    assertClosed(raw, ['key', 'path', 'kind', 'source', 'description', 'capturedAt', 'metadata'], 'draft evidence');
    const relative = textValue(raw.path, 'draft evidence path');
    const filename = workerEvidencePath(workerRoot, relative, 'Draft');
    const actual = await retainReference(root, filename); evidence.push({ ...raw, sha256: actual.sha256, bytes: actual.bytes });
  }
  const packet = parsePacket({ ...draft, schemaVersion: 6, runId: manifest.runId, baselineSha256: manifest.baselineSha256, caseId, assignmentId: id, attemptId, evidence });
  // Validate the worker's supplied decision. A later coordinator review may explicitly revise it.
  validateAssessment(packet, c);
  const filename = await safePath(path.join(workerRoot, 'packet-' + packetId + '.json')), bytes = json(packet);
  let replayed = false;
  try { await writeNew(filename, bytes); } catch (caught) { const error = errorInfo(caught); if (error.code !== 'EEXIST' || await fs.readFile(await safePath(filename, { existing: true }), 'utf8') !== bytes) throw error; replayed = true; }
  return { packetFile: filename, packetId, assignmentId: id, caseId, sha256: hash(bytes), bytes: Buffer.byteLength(bytes), replayed, committed: false };
}
