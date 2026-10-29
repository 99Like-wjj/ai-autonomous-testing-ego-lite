import { readExecution, summarize, verifyExecutionFiles } from '../execution/ledger.mjs';
import type { Baseline, Case, CheckedCase, CommittedAssessment, EvidenceCatalog, EvidenceItem, EvidenceOperation, EvidenceReceipt, EvidenceRequest, Manifest, Observation, PendingEvidence, RecordPayload, RecordRequest, Report, ResultEntry, ResultReceipt, TestHooks, ExecutionContext, Finding } from '../contracts/model.mjs';
import { readAndValidateBaseline } from './baseline.mjs';
import { parseCatalog, parseResults, parseManifest, parsePendingEvidence, parseRecordRequest, parseEvidenceRequest, parsePayload, payloadEvidenceIds } from './validation.mjs';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { assertClosed, fail, json, nonempty, now, randomId, safeIdentifier, canonicalHash, canonical, safePath, readJSON, writeNew, removeRegularIfPresent, atomicReplace, withRunLock, errorInfo } from './common.mjs';
import { evidenceReference, evidenceFile, hashFile } from './file-integrity.mjs';
import { requiredRefs } from '../contracts/targets.mjs';
export { evidenceReference, evidenceFile, hashFile } from './file-integrity.mjs';
export { readAndValidateBaseline } from './baseline.mjs';

export function countsFor(cases: readonly CheckedCase[]): Report['counts'] {
  const counts: Report['counts'] = { verified: 0, violation: 0, inconclusive: 0, not_tested: 0, unassessed: 0 };
  for (const c of cases) { for (const a of c.assessments) counts[a.status]++; counts.unassessed += c.missingGoalIds.length; }
  return counts;
}
export function progressFor(cases: readonly CheckedCase[]) {
  const counts = countsFor(cases);
  return { caseCount: cases.length, goalCount: cases.reduce((sum, c) => sum + c.goals.length, 0), counts, assessmentComplete: counts.unassessed === 0,
    recordedEntries: cases.reduce((sum, c) => sum + c.entries.length, 0) };
}
/** Pure semantic validation shared by serial records and reviewed parallel packets. */
export function validatePayloadAgainstCase(c: Case, payload: RecordPayload, availableObservations: readonly Observation[] = [], evidenceById?: ReadonlyMap<string, Pick<EvidenceItem, 'caseId'>>, prior: { contexts?: readonly ExecutionContext[]; findings?: readonly Finding[]; entries?: readonly ResultEntry[] } = {}): void {
  parsePayload(payload);
  const refs = new Set(requiredRefs(c)), observations = new Map<string, Observation>();
  const checkEvidence = (ids: readonly string[]) => {
    for (const id of ids) {
      if (evidenceById && !evidenceById.has(id)) fail('Evidence ID is not registered: ' + id);
      if (evidenceById && evidenceById.get(id)?.caseId !== c.id) fail('Evidence is associated with a different case: ' + id);
    }
  };
  checkEvidence(payloadEvidenceIds(payload));
  const contexts = new Map<string, ExecutionContext>();
  for (const context of [...(prior.contexts ?? []), ...(payload.contexts ?? [])]) {
    const previous = contexts.get(context.id);
    if (previous && canonical(previous) !== canonical(context)) fail('Context ID was already used with different content: ' + context.id);
    contexts.set(context.id, context);
  }
  for (const o of [...availableObservations, ...payload.observations]) {
    const prior = observations.get(o.id);
    if (prior && canonical(prior) !== canonical(o)) fail('Observation ID was already used with different content: ' + o.id);
    if (o.coveredRefs.some(ref => !refs.has(ref))) fail('Observation refers to an unknown plan reference: ' + o.id);
    if (o.contextId && !contexts.has(o.contextId)) fail('Unknown context ID: ' + o.contextId);
    for (const action of o.actions ?? []) {
      if (action.planRefs.some(ref => !refs.has(ref))) fail('Action refers to an unknown plan reference: ' + action.id);
      if (action.evidenceIds.some(id => !o.evidenceIds.includes(id))) fail('Action evidence must be included in its observation: ' + action.id);
    }
    for (const link of o.evidenceLinks ?? []) {
      if (!o.evidenceIds.includes(link.evidenceId)) fail('Evidence link must belong to its observation.');
      if (link.actionId && !o.actions?.some(a => a.id === link.actionId)) fail('Unknown linked action: ' + link.actionId);
    }
    checkEvidence(o.evidenceIds); observations.set(o.id, o);
  }
  for (const a of payload.assessments) {
    const goal = c.goals.find(g => g.id === a.goalId);
    if (!goal) fail('Unknown goal ID: ' + a.goalId);
    const observed = a.observationIds.map(id => { const o = observations.get(id); if (!o) fail('Unknown observation ID: ' + id); return o; });
    for (const p of a.phenomena ?? []) {
      if (!p.observationIds.length || p.observationIds.some(id => !a.observationIds.includes(id))) fail('Phenomenon must refer to its assessment observations: ' + p.id);
      const supported = new Set(observed.filter(o => p.observationIds.includes(o.id)).flatMap(o => o.evidenceIds));
      if (p.evidenceIds.some(id => !supported.has(id))) fail('Phenomenon evidence must belong to its observations: ' + p.id);
    }
    if (a.previousOperationId && prior.entries !== undefined && !prior.entries.some(e => e.mode === 'final' && e.operationId === a.previousOperationId && e.record.assessments.some(old => old.goalId === a.goalId))) fail('Assessment revision must reference an earlier final for the same goal.');
    if (a.diagnosis) {
      checkEvidence(a.diagnosis.evidenceIds);
      if (a.diagnosis.state === 'confirmed' && !a.diagnosis.evidenceIds.length) fail('Confirmed diagnosis requires its own evidence references.');
    }
    if (a.status === 'verified' || a.status === 'violation') {
      if (goal.clarificationQuestions?.length) fail('Pending clarification prohibits verified/violation for goal: ' + goal.id);
      if (!observed.length || !observed.some(o => o.evidenceIds.length)) fail('Verified/violation requires observations and associated evidence: ' + goal.id);
    }
    if (a.status === 'verified') {
      const covered = new Set(observed.filter(o => o.evidenceIds.length > 0).flatMap(o => o.coveredRefs));
      const missing = goal.requiredRefs.filter(ref => !covered.has(ref));
      if (missing.length) fail('Verified goal omits necessary plan references: ' + missing.join(', '));
      if (a.gaps.length || a.gapDetails?.length) fail('Verified goal cannot retain unresolved gaps: ' + goal.id);
    }
  }
  const findings = new Map<string, Finding>();
  for (const f of [...(prior.findings ?? []), ...(payload.findings ?? [])]) {
    const previous = findings.get(f.id);
    if (previous && canonical(previous) !== canonical(f)) fail('Finding ID was already used with different content: ' + f.id);
    if (f.scope === 'original' && !f.goalIds.length) fail('An original-scope finding requires a goal reference.');
    if (f.goalIds.some(id => !c.goals.some(g => g.id === id))) fail('Finding refers to an unknown goal.');
    if (!f.observationIds.length || f.observationIds.some(id => !observations.has(id))) fail('Finding requires known observations.');
    const supported = new Set(f.observationIds.flatMap(id => observations.get(id)?.evidenceIds ?? []));
    if (f.evidenceIds.some(id => !supported.has(id))) fail('Finding evidence must belong to its observations.');
    findings.set(f.id, f);
  }
}
/** Current assessments are a projection of explicit final events; attempt events remain historical. */
export function projectCases(baseline: Baseline, entries: readonly ResultEntry[]): CheckedCase[] {
  return baseline.cases.map(c => {
    const own = entries.filter(entry => entry.caseId === c.id), observations = new Map<string, Observation>(), contexts = new Map<string, ExecutionContext>(), findings = new Map<string, Finding>(), current = new Map<string, CommittedAssessment>();
    for (const entry of own) {
      for (const o of entry.record.observations) observations.set(o.id, o);
      for (const context of entry.record.contexts ?? []) contexts.set(context.id, context);
      for (const finding of entry.record.findings ?? []) findings.set(finding.id, finding);
      if (entry.mode === 'final') for (const assessment of entry.record.assessments) current.set(assessment.goalId, { ...assessment, operationId: entry.operationId, revision: entry.revision, recordedAt: entry.recordedAt });
    }
    return { ...c, assessments: c.goals.flatMap(g => { const a = current.get(g.id); return a ? [a] : []; }), observations: [...observations.values()], contexts: [...contexts.values()], findings: [...findings.values()], entries: own, missingGoalIds: c.goals.filter(g => !current.has(g.id)).map(g => g.id) };
  });
}
async function validateEvidenceCatalog(root: string, catalog: EvidenceCatalog, cases: readonly Case[], options: { allowMissingScreenshots?: boolean } = {}) {
  const caseIds = new Set(cases.map(c => c.id)), evidenceById = new Map<string, EvidenceItem>(), paths = new Set<string>(), operationIds = new Set<string>();
  const missingScreenshotIds: string[] = [];
  for (const item of catalog.items) {
    if (!caseIds.has(item.caseId)) fail('Unknown evidence case ID: ' + item.caseId);
    if (evidenceById.has(item.id) || paths.has(item.path)) fail('Duplicate evidence ID or path.');
    evidenceReference(item.path);
    try {
      const actual = await hashFile(await evidenceFile(root, item.path));
      if (actual.sha256 !== item.sha256 || actual.bytes !== item.bytes) fail('Evidence content hash or byte count mismatch: ' + item.id);
    } catch (caught) {
      if (options.allowMissingScreenshots === true && item.kind === 'screenshot' && errorInfo(caught).code === 'ENOENT') missingScreenshotIds.push(item.id);
      else throw caught;
    }
    evidenceById.set(item.id, item); paths.add(item.path);
  }
  let revision = 0;
  for (const op of catalog.operations) {
    if (op.revision !== ++revision || operationIds.has(op.operationId)) fail('Invalid evidence operation order or duplicate operation ID.');
    const item = evidenceById.get(op.evidenceId);
    if (!item || item.operationId !== op.operationId || item.caseId !== op.caseId || item.path !== op.path || item.sha256 !== op.sha256 || item.bytes !== op.bytes || item.collectedAt !== op.committedAt) fail('Evidence operation does not match its catalog item.');
    operationIds.add(op.operationId);
  }
  if (revision !== catalog.revision || catalog.items.length !== catalog.operations.length) fail('Evidence catalog revision does not match its operation ledger.');
  for (const item of catalog.items) if (!operationIds.has(item.operationId)) fail('Evidence item has no operation receipt.');
  for (const item of catalog.items) for (const id of item.metadata?.contextEvidenceIds ?? []) {
    const linked = evidenceById.get(id);
    if (!linked || linked.caseId !== item.caseId || linked.id === item.id) fail('Invalid evidence context association: ' + id);
    if (catalog.items.indexOf(linked) >= catalog.items.indexOf(item)) fail('Evidence context must reference an earlier registration.');
  }
  return { evidenceById, operationIds, missingScreenshotIds };
}
export async function checkUnlocked(root: string, options: { allowMissingScreenshots?: boolean } = {}): Promise<Report> {
  const manifest: Manifest = parseManifest(await readJSON(path.join(root, 'manifest.json')));
  if (!path.isAbsolute(manifest.projectDir)) fail('Manifest project directory must be absolute.');
  const { baseline } = await readAndValidateBaseline(root, manifest);
  for (const c of baseline.cases) for (const goal of c.goals) {
    const ref = goal.followUpOf;
    if (ref?.runId === manifest.runId && ((ref.caseId === c.id && ref.goalId === goal.id) || !baseline.cases.some(source => source.id === ref.caseId && source.goals.some(g => g.id === ref.goalId)))) fail('Invalid same-run follow-up goal reference.');
  }
  const evidenceCatalog = parseCatalog(await readJSON(path.join(root, 'evidence.json')));
  const { evidenceById, operationIds, missingScreenshotIds } = await validateEvidenceCatalog(root, evidenceCatalog, baseline.cases, options);
  const results = parseResults(await readJSON(path.join(root, 'results.json')));
  const observationsByCase = new Map<string, Observation[]>(), contextsByCase = new Map<string, ExecutionContext[]>(), findingsByCase = new Map<string, Finding[]>(), entriesByCase = new Map<string, ResultEntry[]>(), casesById = new Map(baseline.cases.map(c => [c.id, c]));
  let revision = 0;
  for (const entry of results.entries) {
    const c = casesById.get(entry.caseId); if (!c) fail('Unknown result case ID: ' + entry.caseId);
    if (entry.expectedRevision !== revision || entry.revision !== ++revision) fail('Result revision does not match append-only event order.');
    if (operationIds.has(entry.operationId)) fail('Operation ID is reused: ' + entry.operationId);
    const request: RecordRequest = { schemaVersion: 7, operationId: entry.operationId, expectedRevision: entry.expectedRevision, caseId: entry.caseId, mode: entry.mode, record: entry.record };
    if (canonicalHash(request) !== entry.payloadSha256) fail('Result event payload hash mismatch: ' + entry.operationId);
    const prior = observationsByCase.get(c.id) ?? [];
    const contexts = contextsByCase.get(c.id) ?? [], findings = findingsByCase.get(c.id) ?? [], entries = entriesByCase.get(c.id) ?? [];
    validatePayloadAgainstCase(c, entry.record, prior, evidenceById, { contexts, findings, entries });
    const merged = new Map([...prior, ...entry.record.observations].map(o => [o.id, o]));
    observationsByCase.set(c.id, [...merged.values()]); operationIds.add(entry.operationId);
    contextsByCase.set(c.id, [...new Map([...contexts, ...(entry.record.contexts ?? [])].map(x => [x.id, x])).values()]);
    findingsByCase.set(c.id, [...new Map([...findings, ...(entry.record.findings ?? [])].map(x => [x.id, x])).values()]);
    entriesByCase.set(c.id, [...entries, entry]);
  }
  if (revision !== results.revision) fail('Results revision does not match its entries.');
  const cases = projectCases(baseline, results.entries), counts = countsFor(cases);
  const execution = await readExecution(root, manifest, baseline); await verifyExecutionFiles(root, execution);
  return {
    schemaVersion: 7, runId: manifest.runId, project: baseline.project, structurallyValid: true,
    revision: results.revision, evidenceRevision: evidenceCatalog.revision, caseCount: cases.length,
    goalCount: cases.reduce((sum, c) => sum + c.goals.length, 0), counts, assessmentComplete: counts.unassessed === 0,
    execution, executionSummary: summarize(execution, baseline), cases, evidenceCatalog,
    evidenceIntegrity: { hashVerifiedItems: evidenceCatalog.items.length - missingScreenshotIds.length, ...(options.allowMissingScreenshots === true ? { missingScreenshotIds } : {}) },
    evidenceCoverage: {
      registeredScreenshots: evidenceCatalog.items.filter(item => item.kind === 'screenshot').length,
      distinctRetainedContents: new Set(evidenceCatalog.items.map(item => item.sha256)).size,
      goalsWithoutScreenshots: cases.flatMap(c => c.assessments.filter(a => a.status !== 'not_tested' && (a.status === 'verified' || a.status === 'violation' || a.observationIds.length > 0) && !a.observationIds.some(id => c.observations.find(o => o.id === id)?.evidenceIds.some(eid => evidenceById.get(eid)?.kind === 'screenshot' && !missingScreenshotIds.includes(eid)))).map(a => ({ caseId: c.id, goalId: a.goalId })))
    },
    caveat: 'Structural validation and file hashes do not authenticate observations or business judgments. Recorded times are local transaction times; capture times are source supplied when known. Missing assessments are recording gaps, not business verdicts.'
  };
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
  if (marker.schemaVersion !== 7 || !/^[a-f0-9]{64}$/.test(marker.payloadSha256)) fail('Invalid pending evidence recovery marker.');
  safeIdentifier(marker.operationId, 'pending evidence operation id');
  const paths = markerPaths(root, marker);
  const catalog = parseCatalog(await readJSON(path.join(root, 'evidence.json')));
  if (catalog.schemaVersion !== 7) fail('Pending evidence transaction requires run schemaVersion 7.');
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
  if (!nonempty(value) || value.length > limit || value.includes('\0')) fail('Invalid ' + label + '.'); return value;
}
export function validateRecordRequest(request: unknown): asserts request is RecordRequest { parseRecordRequest(request); }
export function resultOperationReceipt(entry: ResultEntry, replayed = false): ResultReceipt {
  return { operationId: entry.operationId, revision: entry.revision, caseId: entry.caseId, mode: entry.mode, replayed };
}
export function evidenceOperationReceipt(op: EvidenceOperation, replayed = false): EvidenceReceipt {
  return { operationId: op.operationId, revision: op.revision, caseId: op.caseId, evidenceId: op.evidenceId, path: op.path, sha256: op.sha256, bytes: op.bytes, collectedAt: op.committedAt, replayed };
}
export async function recordResultUnlocked(root: string, input: unknown, testHooks: TestHooks = {}): Promise<ResultReceipt> {
  await recoverEvidence(root);
  const checked = await checkUnlocked(root), request = parseRecordRequest(input);
  const resultsPath = path.join(root, 'results.json'), results = parseResults(await readJSON(resultsPath));
  const payloadSha256 = canonicalHash(request), existing = results.entries.find(entry => entry.operationId === request.operationId);
  if (existing) {
    if (existing.payloadSha256 !== payloadSha256) fail('Operation ID was already used with a different payload.');
    return resultOperationReceipt(existing, true);
  }
  if (checked.evidenceCatalog.operations.some(op => op.operationId === request.operationId)) fail('Operation ID is already used by an evidence operation.');
  if (request.expectedRevision !== results.revision) fail('Revision conflict: expected ' + request.expectedRevision + ', current ' + results.revision + '.');
  const c = checked.cases.find(c => c.id === request.caseId); if (!c) fail('Unknown case ID: ' + request.caseId);
  validatePayloadAgainstCase(c, request.record, c.observations, new Map(checked.evidenceCatalog.items.map(item => [item.id, item])), { contexts: c.contexts, findings: c.findings, entries: c.entries });
  const entry: ResultEntry = { operationId: request.operationId, payloadSha256, expectedRevision: request.expectedRevision, revision: results.revision + 1, recordedAt: now(), caseId: request.caseId, mode: request.mode, record: request.record };
  await atomicReplace(resultsPath, json({ schemaVersion: 7, revision: entry.revision, entries: [...results.entries, entry] }));
  if (testHooks.afterCommit) await testHooks.afterCommit();
  return resultOperationReceipt(entry, false);
}
export async function recordResult({ runDir, request }: { runDir: unknown; request: unknown }, testHooks: TestHooks = {}): Promise<ResultReceipt> {
  return withRunLock(runDir, root => recordResultUnlocked(root, request, testHooks));
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
  if (checked.schemaVersion !== 7) fail('Run manifest v7 is required.');
  validateEvidenceRequest(request);
  const catalogPath = path.join(root, 'evidence.json'), catalog = parseCatalog(await readJSON(catalogPath));
  const payloadSha256 = canonicalHash(request);
  const existing = catalog.operations.find(op => op.operationId === request.operationId);
  if (existing) {
    if (existing.payloadSha256 !== payloadSha256) fail('Operation ID was already used with a different payload.');
    return evidenceOperationReceipt(existing, true);
  }
  const results = parseResults(await readJSON(path.join(root, 'results.json')));
  if (results.entries.some(op => op.operationId === request.operationId)) fail('Operation ID is already used by a result operation.');
  if (request.expectedRevision !== catalog.revision) fail('Evidence revision conflict: expected ' + request.expectedRevision + ', current ' + catalog.revision + '.');
  if (!checked.cases.some(c => c.id === request.caseId)) fail('Unknown case id: ' + request.caseId);
  for (const id of request.metadata?.contextEvidenceIds ?? []) if (!catalog.items.some(e => e.id === id && e.caseId === request.caseId)) fail('Evidence context must reference registered evidence in the same case: ' + id);
  const source = await safePath(request.sourceFile, { existing: true });
  if (!(await fs.lstat(source)).isFile()) fail('Evidence source must be a regular file.');
  const evidenceId = randomId('ev-'), extension = path.extname(source).toLowerCase();
  const safeExtension = /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : '';
  const relativeFinal = 'evidence/' + evidenceId + safeExtension, stageRelative = 'evidence/.' + evidenceId + '.stage';
  const stage = path.join(root, ...stageRelative.split('/')), final = path.join(root, ...relativeFinal.split('/'));
  const catalogTemp = path.join(root, '.ego-evidence-' + evidenceId + '.tmp'), markerTemp = path.join(root, '.ego-marker-' + evidenceId + '.tmp');
  const markerFile = path.join(root, '.evidence.pending.json');
  const marker: PendingEvidence = {
    schemaVersion: 7, operationId: request.operationId, payloadSha256, evidenceId,
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
      ...(request.metadata !== undefined ? { metadata: request.metadata } : {}),
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
