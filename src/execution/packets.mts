/** Worker-local sealing; does not take the shared run lock or make browser/AI decisions. */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Case } from '../contracts/model.mjs';
import type { Assignment, WorkerPacket, PacketReview } from '../contracts/execution-model.mjs';
import { assignmentId } from '../contracts/ids.mjs';
import { assertClosed, canonicalHash, directory, errorInfo, fail, hash, inside, json, object, readJSON, safeIdentifier, safePath, writeNew } from '../core/common.mjs';
import { parseManifest, arrayValue, integer, textValue } from '../core/validation.mjs';
import { normalizeCases } from '../core/cases.mjs';
import { parsePacket } from './parse.mjs';
import { referencePath, retainReference } from './ledger.mjs';
import { requiredTargets } from '../contracts/targets.mjs';
export { requiredTargets } from '../contracts/targets.mjs';

export function validateAssessment(packet: WorkerPacket, c: Case, review?: PacketReview): void {
  const record = review?.record ?? packet.record, goals = review?.goalAssessments ?? packet.goalAssessments;
  const targets = requiredTargets(c), seen = new Set<string>(), keys = new Set(packet.evidence.map(item => item.key));
  for (const goal of goals) for (const target of goal.targets) {
    if (!targets.includes(target) || seen.has(target)) fail('Unknown or duplicate frozen goal target: ' + target); seen.add(target);
  }
  if (targets.some(target => !seen.has(target))) fail('Packet omits frozen goals, necessary steps, conditions, or required path.');
  for (const key of [...record.evidenceKeys, ...goals.flatMap(goal => goal.evidenceKeys)]) if (!keys.has(key)) fail('Review references unknown evidence key: ' + key);
  if (record.status === 'pass' && goals.some(goal => goal.status !== 'verified')) fail('A pass record cannot hide unverified frozen goals.');
  if (record.status === 'fail' && !goals.some(goal => goal.status === 'violation')) fail('A fail record needs an explicit violated goal.');
  if ((c.clarificationQuestions ?? []).length && ['pass', 'fail'].includes(record.status)) fail('Pending clarification prohibits pass/fail.');
}
export async function verifyPacketFiles(root: string, a: Assignment, packet: WorkerPacket): Promise<void> {
  const workerRoot = path.join(root, ...a.workerDirectory.split('/'));
  for (const item of packet.evidence) {
    if (path.isAbsolute(item.path) || item.path.includes('\\') || item.path.includes(':') || item.path.split('/').some(part => !part || part === '.' || part === '..')) fail('Packet evidence must use safe worker-relative paths.');
    const filename = path.resolve(workerRoot, ...item.path.split('/'));
    if (!inside(workerRoot, filename) || filename === workerRoot) fail('Packet evidence escapes its assignment directory.');
    const actual = await retainReference(root, filename);
    if (actual.sha256 !== item.sha256 || actual.bytes !== item.bytes) fail('Published packet evidence changed: ' + item.key);
  }
}
export async function sealPacket({ runDir, assignment, draftFile }: { runDir: unknown; assignment: string; draftFile: string }) {
  const root = await directory(runDir), id = assignmentId(assignment);
  const manifest = parseManifest(await readJSON(path.join(root, 'manifest.json'))); if (manifest.schemaVersion !== 4) fail('Packet sealing requires a v4 run.');
  const baselineBytes = await fs.readFile(await safePath(path.join(root, 'baseline.json'), { existing: true }));
  if (hash(baselineBytes) !== manifest.baselineSha256) fail('Baseline hash mismatch.');
  const baseline = normalizeCases(JSON.parse(baselineBytes.toString('utf8')));
  const workerRoot = path.join(root, 'workers', id), marker = await readJSON(await safePath(path.join(workerRoot, 'assignment.json'), { existing: true }));
  assertClosed(marker, ['assignmentId', 'caseId', 'attemptId', 'operationId'], 'assignment receipt');
  if (marker.assignmentId !== id) fail('Wrong assignment receipt.');
  const caseId = safeIdentifier(marker.caseId), attemptId = safeIdentifier(marker.attemptId), c = baseline.cases.find(c => c.id === caseId); if (!c) fail('Unknown frozen case.');
  const inputPath = await safePath(draftFile, { existing: true }); if (!inside(workerRoot, inputPath)) fail('Draft must belong to the assigned worker directory.');
  const draft = await readJSON(inputPath);
  assertClosed(draft, ['packetId', 'mode', 'record', 'evidence', 'goalAssessments', 'executionWindow', 'spaceUsage'], 'worker draft');
  const packetId = safeIdentifier(draft.packetId, 'packet ID');
  const evidence = [];
  for (const raw of arrayValue(draft.evidence, 'draft evidence')) {
    assertClosed(raw, ['key', 'path', 'kind', 'source', 'description', 'capturedAt'], 'draft evidence');
    const relative = textValue(raw.path, 'draft evidence path');
    if (path.isAbsolute(relative) || relative.includes('\\') || relative.includes(':') || relative.split('/').some(part => !part || part === '.' || part === '..')) fail('Draft evidence must be worker-relative.');
    const filename = path.resolve(workerRoot, ...relative.split('/')); if (!inside(workerRoot, filename)) fail('Draft evidence escapes worker directory.');
    const actual = await retainReference(root, filename); evidence.push({ ...raw, sha256: actual.sha256, bytes: actual.bytes });
  }
  const packet = parsePacket({ ...draft, schemaVersion: 1, runId: manifest.runId, baselineSha256: manifest.baselineSha256, caseId, assignmentId: id, attemptId, evidence });
  // Validate the worker's supplied decision. A later coordinator review may explicitly revise it.
  validateAssessment(packet, c);
  const filename = await safePath(path.join(workerRoot, 'packet-' + packetId + '.json')), bytes = json(packet);
  let replayed = false;
  try { await writeNew(filename, bytes); } catch (caught) { const error = errorInfo(caught); if (error.code !== 'EEXIST' || await fs.readFile(await safePath(filename, { existing: true }), 'utf8') !== bytes) throw error; replayed = true; }
  return { packetFile: filename, packetId, assignmentId: id, caseId, sha256: hash(bytes), bytes: Buffer.byteLength(bytes), replayed, committed: false };
}
