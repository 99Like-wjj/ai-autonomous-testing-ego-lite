/** Read-only source verification. No historical evidence is copied or registered in a new run. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertClosed, canonicalHash, errorInfo, fail, hash, object, readJSON, withRunLock } from '../core/common.mjs';
import { projectActionAttempts, recordEvidenceIds } from '../core/action-events.mjs';
import { evidenceFile, hashFile, regularFilePath } from '../core/file-integrity.mjs';
import { parseCatalog, parseManifest, parseResults, integer, arrayValue } from '../core/validation.mjs';
import { readAndValidateBaseline } from '../core/baseline.mjs';
import { checkUnlocked, markerExists, validateResultEntries, countsFor } from '../core/records.mjs';
import { readRunBinding } from './run-binding.mjs';
import type { EvidenceItem, Report } from '../contracts/model.mjs';
import type { RegressionLibrary, RuleSource, SourceContext, SourceRef, SourceRun, StoredArtifact } from './model.mjs';

export async function verifyRuleSource(source: RuleSource): Promise<void> {
  const content = await fs.readFile(await regularFilePath(source.contentFile));
  if (hash(content) !== source.contentSha256) fail('Normative source content hash mismatch.');
  if (!content.toString('utf8').includes(source.excerpt)) fail('Normative excerpt is not present in the retained source content.');
}
export async function readSourceRun(runDir: unknown, options: { resultsRevision?: number } = {}): Promise<SourceRun> {
  return withRunLock(runDir, async root => {
    // Unlike check(), source inspection does not repair or clean historical files.
    const manifest = parseManifest(await readJSON(path.join(root, 'manifest.json')));
    if (!path.isAbsolute(manifest.projectDir)) fail('Manifest project directory must be absolute.');
    const { baseline } = await readAndValidateBaseline(root, manifest);
    if (options.resultsRevision === undefined) {
      if (await markerExists(root)) fail('Historical source has an unfinished evidence transaction; source inspection cannot recover it.');
      const checked = await checkUnlocked(root), results = parseResults(await readJSON(path.join(root, 'results.json')));
      return { runDir: root, manifest, baseline, results, checked, baselineSha256: manifest.baselineSha256, resultsSha256: canonicalHash(results),
        evidenceScope: { kind: 'complete_current_catalog', catalogRevision: checked.evidenceRevision, note: 'Current run ledger and retained evidence catalog were checked in full.' } };
    }
    const revision = integer(options.resultsRevision, 'source results revision'), raw = await readJSON(path.join(root, 'results.json'));
    assertClosed(raw, ['schemaVersion', 'revision', 'entries'], 'source results');
    if (raw.schemaVersion !== 7) fail('Historical results require schemaVersion 7; files are not migrated.');
    if (revision > integer(raw.revision, 'source current revision')) fail('Requested source results revision does not exist.');
    const results = parseResults({ schemaVersion: 7, revision, entries: arrayValue(raw.entries, 'source result entries').slice(0, revision) });
    const evidenceIds = new Set(results.entries.flatMap(entry => recordEvidenceIds(entry.record)));
    const rawCatalog = await readJSON(path.join(root, 'evidence.json'));
    assertClosed(rawCatalog, ['schemaVersion', 'revision', 'items', 'operations'], 'source evidence catalog');
    if (rawCatalog.schemaVersion !== 7) fail('Historical evidence requires schemaVersion 7.');
    const evidenceCatalog = parseCatalog({ schemaVersion: 7, revision: integer(rawCatalog.revision, 'source evidence catalog revision'),
      items: arrayValue(rawCatalog.items, 'source evidence items').filter(item => object(item) && typeof item.id === 'string' && evidenceIds.has(item.id)),
      operations: arrayValue(rawCatalog.operations, 'source evidence operations').filter(op => object(op) && typeof op.evidenceId === 'string' && evidenceIds.has(op.evidenceId)) });
    const evidenceById = new Map<string, EvidenceItem>(), operationIds = new Set<string>(), paths = new Set<string>();
    for (const item of evidenceCatalog.items) {
      if (evidenceById.has(item.id) || paths.has(item.path)) fail('Duplicate referenced source evidence ID or path.');
      if (!baseline.cases.some(c => c.id === item.caseId)) fail('Source evidence refers to an unknown case.');
      const actual = await hashFile(await evidenceFile(root, item.path));
      if (actual.sha256 !== item.sha256 || actual.bytes !== item.bytes) fail('Historical evidence content hash or byte count mismatch.');
      const operations = evidenceCatalog.operations.filter(op => op.evidenceId === item.id);
      const op = operations[0];
      if (operations.length !== 1 || !op || op.operationId !== item.operationId || op.caseId !== item.caseId || op.path !== item.path || op.sha256 !== item.sha256 || op.bytes !== item.bytes || op.committedAt !== item.collectedAt || op.revision > evidenceCatalog.revision || operationIds.has(op.operationId)) fail('Referenced source evidence does not match its original catalog operation.');
      evidenceById.set(item.id, item); operationIds.add(op.operationId); paths.add(item.path);
    }
    if (evidenceById.size !== evidenceIds.size) fail('Referenced historical evidence is missing from its source catalog.');
    const cases = validateResultEntries(baseline, results, evidenceById, operationIds), counts = countsFor(cases);
    const regressionBinding = await readRunBinding(root, manifest, baseline);
    const checked: Report = { schemaVersion: 7, runId: manifest.runId, project: baseline.project, structurallyValid: true, revision, evidenceRevision: evidenceCatalog.revision,
      caseCount: cases.length, goalCount: cases.reduce((sum, c) => sum + c.goals.length, 0), counts, assessmentComplete: counts.unassessed === 0, cases, evidenceCatalog,
      ...(regressionBinding ? { regressionBinding } : {}), actionAttempts: cases.flatMap(c => projectActionAttempts(c.actionEvents).map(a => ({ caseId: c.id, ...a }))),
      evidenceIntegrity: { hashVerifiedItems: evidenceCatalog.items.length }, evidenceCoverage: {
        registeredScreenshots: evidenceCatalog.items.filter(e => e.kind === 'screenshot').length, distinctRetainedContents: new Set(evidenceCatalog.items.map(e => e.sha256)).size,
        goalsWithoutScreenshots: cases.flatMap(c => c.assessments.filter(a => a.status !== 'not_tested' && (a.status === 'verified' || a.status === 'violation' || a.observationIds.length > 0) && !a.observationIds.some(id => c.observations.find(o => o.id === id)?.evidenceIds.some(eid => evidenceById.get(eid)?.kind === 'screenshot'))).map(a => ({ caseId: c.id, goalId: a.goalId }))) },
      caveat: 'Only the exact results prefix and its referenced original evidence were checked. Evidence operations retain their original catalog revisions and are a subset, not a rewritten catalog. Later result entries, unrelated evidence and the current execution ledger are outside this historical snapshot. Hashes do not authenticate observations or business judgments.' };
    return { runDir: root, manifest, baseline, results, checked, baselineSha256: manifest.baselineSha256, resultsSha256: canonicalHash(results),
      evidenceScope: { kind: 'results_prefix_references', catalogRevision: evidenceCatalog.revision, note: checked.caveat } };
  });
}
export async function verifySourceRef(ref: SourceRef, source?: SourceRun): Promise<SourceRun> {
  const actual = source ?? await readSourceRun(ref.runDir, { resultsRevision: ref.resultsRevision });
  if (path.resolve(ref.runDir) !== actual.runDir || ref.runId !== actual.manifest.runId || ref.baselineSha256 !== actual.baselineSha256 || ref.resultsRevision !== actual.results.revision || ref.resultsSha256 !== actual.resultsSha256) fail('Historical source run identity, revision, or content hash mismatch.');
  const c = actual.checked.cases.find(c => c.id === ref.caseId);
  if (!c || !c.goals.some(g => g.id === ref.goalId)) fail('Historical source case or goal is missing.');
  const observations = new Map(c.observations.map(o => [o.id, o]));
  for (const id of ref.observationIds) if (!observations.has(id)) fail('Historical source observation is missing from the exact results revision: ' + id);
  const actionIds = new Set(c.actionEvents.map(event => event.actionId));
  for (const id of ref.actionIds) if (!actionIds.has(id)) fail('Historical source action is missing from the exact results revision: ' + id);
  const selectedObservations = c.observations.filter(o => ref.observationIds.includes(o.id));
  const selectedActions = c.actionEvents.filter(e => ref.actionIds.includes(e.actionId));
  const contextIds = new Set([...selectedObservations.flatMap(o => o.contextId ? [o.contextId] : []), ...selectedActions.map(e => e.contextId)]);
  const usedEvidence = new Set(recordEvidenceIds({ observations: selectedObservations, assessments: [], actionEvents: selectedActions, contexts: c.contexts.filter(context => contextIds.has(context.id)) }));
  for (const item of ref.evidence) {
    const original = actual.checked.evidenceCatalog.items.find(e => e.id === item.evidenceId && e.caseId === ref.caseId);
    if (!original || original.sha256 !== item.sha256) fail('Historical source evidence identity or hash mismatch: only evidence retained by the selected results prefix and referenced facts can be used.');
    if (!usedEvidence.has(item.evidenceId)) fail('Historical evidence is not referenced by the selected observations, actions, or their contexts at the selected results revision.');
  }
  return actual;
}
export interface SourceAvailability {
  artifactKind: 'rule' | 'task'; artifactId: string; revision: number; sourceId: string;
  referenceStatus: 'checked' | 'unavailable'; issue: string | null;
}
/** A missing original source is a visible reference gap, never a reason to erase a frozen asset. */
export async function inspectArtifactSources(artifact: StoredArtifact): Promise<SourceAvailability[]> {
  const checks = artifact.kind === 'rule'
    ? [{ sourceId: 'normative-source', verify: () => verifyRuleSource(artifact.source) }]
    : artifact.sourceRefs.map(ref => ({ sourceId: ref.id, verify: async () => { await verifySourceRef(ref); } }));
  const result: SourceAvailability[] = [];
  for (const check of checks) {
    let issue: string | null = null;
    try { await check.verify(); } catch (caught) { issue = errorInfo(caught).message; }
    result.push({ artifactKind: artifact.kind, artifactId: artifact.kind === 'rule' ? artifact.ruleId : artifact.taskId, revision: artifact.revision, sourceId: check.sourceId, referenceStatus: issue === null ? 'checked' : 'unavailable', issue });
  }
  return result;
}
/** All source goals remain visible, independent of their verdict and whether a reusable task exists. */
export function sourceContext(source: SourceRun, library: RegressionLibrary): SourceContext {
  const prefixHashes = new Map([[source.results.revision, source.resultsSha256]]);
  const prefixHash = (revision: number): string => {
    const known = prefixHashes.get(revision); if (known) return known;
    const value = canonicalHash({ ...source.results, revision, entries: source.results.entries.slice(0, revision) });
    prefixHashes.set(revision, value); return value;
  };
  return { regressionVersion: 1, source, rules: library.rules,
    facts: source.checked.cases.flatMap(c => c.goals.map(goal => {
      const linked = library.tasks.flatMap(task => task.sourceRefs.filter(ref => ref.runId === source.manifest.runId && ref.baselineSha256 === source.baselineSha256 && ref.caseId === c.id && ref.goalId === goal.id && ref.resultsRevision <= source.results.revision).map(ref => ({ task, ref })));
      const matching = linked.filter(({ ref }) => ref.resultsSha256 === prefixHash(ref.resultsRevision));
      const taskRefs = matching.map(({ task, ref }) => ({ taskId: task.taskId, revision: task.revision, contentSha256: task.contentSha256,
        sourceRefId: ref.id, sourceResultsRevision: ref.resultsRevision, sourceResultsSha256: ref.resultsSha256,
        relation: ref.resultsRevision === source.results.revision ? 'exact' as const : 'earlier' as const }));
      const gap = matching.length !== linked.length
        ? 'Tasks are linked to this source goal, but one or more referenced source fingerprints do not match the selected history; verify those references.'
        : taskRefs.some(ref => ref.relation === 'exact') ? null
        : taskRefs.length ? 'This goal already has task associations from earlier results revisions. Review subsequent changes before treating those tasks as current coverage; no reassessment or automatic reuse is implied.'
        : 'Source goal has not been organized into a regression task at or before the selected results revision.';
      return { caseId: c.id, goalId: goal.id, assessment: c.assessments.find(a => a.goalId === goal.id) ?? null, taskRefs,
        gap };
    })),
    caveat: 'Rules are normative snapshots; source facts are historical observations, not normative requirements or current authorization. Task links preserve their exact source references: earlier links require review and later source revisions do not count as historical coverage. Missing assessments and unorganized goals remain gaps. No task or business verdict was changed, and no source evidence was collected anew.' };
}
