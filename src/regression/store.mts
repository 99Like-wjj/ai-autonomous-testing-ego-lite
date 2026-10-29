/** Immutable, single-file revisions. The project lock serializes library writers, not business actions. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { acquireLock, canonicalHash, directory, errorInfo, fail, hash, inside, json, now, readJSON, safeIdentifier, safePath, syncDirectory, writeNew, removeOwnedFileIfPresent } from '../core/common.mjs';
import { hashFile } from '../core/file-integrity.mjs';
import { integer, sha256Value } from '../core/validation.mjs';
import type { ActionEvent } from '../contracts/model.mjs';
import { parseArtifactRequest, parseStoredArtifact } from './validation.mjs';
import { verifyRuleSource, verifySourceRef } from './sources.mjs';
import type { ArtifactCommitRequest, ArtifactDraft, ArtifactReceipt, RegressionLibrary, SourceRun, StoredArtifact, StoredRule, TaskDraft } from './model.mjs';
export { validateArtifact } from './validation.mjs';

function artifactId(value: ArtifactDraft): string { return value.kind === 'rule' ? value.ruleId : value.taskId; }
function exactRule(library: RegressionLibrary, ref: { ruleId: string; revision: number; contentSha256: string }): StoredRule {
  const item = library.rules.find(r => r.ruleId === ref.ruleId && r.revision === ref.revision);
  if (!item || item.contentSha256 !== ref.contentSha256) fail('Missing or changed exact normative rule revision: ' + ref.ruleId + '/' + ref.revision);
  return item;
}
function validateTaskReferences(task: TaskDraft, library: RegressionLibrary): void {
  for (const binding of task.ruleBindings) for (const ref of binding.ruleRefs) {
    const rule = exactRule(library, ref);
    if (task.maturity === 'defined' && !['explicit', 'confirmed'].includes(rule.confirmation.state)) fail('Defined task binds an unresolved normative rule.');
  }
  const replaced = task.applicability.replacedBy;
  if (replaced && !library.tasks.some(t => t.taskId === replaced.taskId && t.revision === replaced.revision && t.contentSha256 === replaced.contentSha256)) fail('Replacement task revision does not exist.');
}
async function libraryRoot(projectDir: unknown, create = false): Promise<{ project: string; root: string; exists: boolean }> {
  const project = await directory(projectDir), root = await safePath(path.join(project, 'regression'), { external: true });
  if (!inside(project, root)) fail('Regression library escapes project directory.');
  try {
    const stat = await fs.lstat(root); if (!stat.isDirectory()) fail('Regression library must be a directory.');
  } catch (caught) {
    if (errorInfo(caught).code !== 'ENOENT') throw caught;
    if (!create) return { project, root, exists: false };
    try { await fs.mkdir(root, { mode: 0o700 }); } catch (error) { if (errorInfo(error).code !== 'EEXIST') throw error; }
    await safePath(root, { existing: true }); if (!(await fs.lstat(root)).isDirectory()) fail('Regression library must be a directory.');
  }
  return { project, root, exists: true };
}
async function readLibraryUnlocked(project: string, root: string): Promise<RegressionLibrary> {
  const library: RegressionLibrary = { regressionVersion: 1, projectDir: project, rules: [], tasks: [] }, operations = new Set<string>();
  for (const kind of ['rule', 'task'] as const) {
    const category = await safePath(path.join(root, kind + 's'));
    let directories;
    try { directories = await fs.readdir(category, { withFileTypes: true }); } catch (caught) { if (errorInfo(caught).code === 'ENOENT') continue; throw caught; }
    for (const dir of directories.sort((a, b) => a.name.localeCompare(b.name))) {
      safeIdentifier(dir.name, 'artifact directory');
      const folder = await safePath(path.join(category, dir.name), { existing: true });
      if (!dir.isDirectory()) fail('Unexpected non-directory artifact entry.');
      const revisions: StoredArtifact[] = [];
      for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
        // An interrupted precommit stage is not a committed revision; preserve it for inspection.
        if (/^\.pending-[a-f0-9-]+\.json$/.test(entry.name)) { await safePath(path.join(folder, entry.name), { existing: true }); continue; }
        if (!/^[1-9][0-9]*\.json$/.test(entry.name) || !entry.isFile()) fail('Unexpected artifact revision file: ' + entry.name);
        const item = parseStoredArtifact(await readJSON(path.join(folder, entry.name)));
        if (item.kind !== kind || artifactId(item) !== dir.name || item.revision !== Number(entry.name.slice(0, -5))) fail('Artifact identity does not match its immutable path.');
        if (operations.has(item.operationId)) fail('Regression operation ID is reused.'); operations.add(item.operationId);
        revisions.push(item);
      }
      revisions.sort((a, b) => a.revision - b.revision);
      for (const [index, item] of revisions.entries()) {
        if (item.revision !== index + 1) fail('Regression revision history contains a gap.');
        const prior = revisions[index - 1];
        if (!prior && item.supersedes !== null) fail('Initial artifact revision cannot supersede another revision.');
        if (prior && (!item.supersedes || item.supersedes.revision !== prior.revision || item.supersedes.contentSha256 !== prior.contentSha256 || ('ruleId' in item.supersedes ? item.supersedes.ruleId : item.supersedes.taskId) !== artifactId(prior))) fail('Artifact supersedes reference does not match its prior immutable revision.');
        if (item.kind === 'rule') library.rules.push(item); else library.tasks.push(item);
      }
    }
  }
  for (const task of library.tasks) validateTaskReferences(task, library);
  return library;
}
export async function readLibrary(projectDir: unknown): Promise<RegressionLibrary> {
  const { project, root, exists } = await libraryRoot(projectDir);
  if (!exists) return { regressionVersion: 1, projectDir: project, rules: [], tasks: [] };
  const release = await acquireLock(root);
  try { return await readLibraryUnlocked(project, root); } finally { await release(); }
}
export async function readArtifact({ projectDir, kind, artifactId: id, revision, contentSha256 }: { projectDir: unknown; kind: 'rule' | 'task'; artifactId: string; revision: number; contentSha256?: string }): Promise<StoredArtifact | null> {
  safeIdentifier(id); integer(revision, 'artifact revision', 1); if (contentSha256 !== undefined) sha256Value(contentSha256);
  if (kind !== 'rule' && kind !== 'task') fail('Invalid artifact kind.');
  const { root, exists } = await libraryRoot(projectDir); if (!exists) return null;
  const release = await acquireLock(root);
  try {
    let value: unknown;
    try { value = await readJSON(path.join(root, kind + 's', id, revision + '.json')); } catch (caught) { if (errorInfo(caught).code === 'ENOENT') return null; throw caught; }
    const item = parseStoredArtifact(value);
    if (item.kind !== kind || artifactId(item) !== id || item.revision !== revision || (contentSha256 !== undefined && item.contentSha256 !== contentSha256)) fail('Exact artifact reference mismatch.');
    return item;
  } finally { await release(); }
}
function receipt(item: StoredArtifact, replayed: boolean): ArtifactReceipt {
  return { regressionVersion: 1, kind: item.kind, artifactId: artifactId(item), revision: item.revision, operationId: item.operationId, contentSha256: item.contentSha256, recordedAt: item.recordedAt, replayed };
}
function validateRevision(request: ArtifactCommitRequest, library: RegressionLibrary): StoredArtifact | undefined {
  const all = [...library.rules, ...library.tasks], payloadSha256 = canonicalHash(request), existing = all.find(item => item.operationId === request.operationId);
  if (existing) { if (existing.payloadSha256 !== payloadSha256) fail('Regression operation ID was already committed with different content.'); return existing; }
  const id = artifactId(request.artifact), prior = all.filter(a => a.kind === request.artifact.kind && artifactId(a) === id).sort((a, b) => b.revision - a.revision)[0];
  if (request.expectedRevision !== (prior?.revision ?? 0)) fail('Regression revision conflict: expected ' + request.expectedRevision + ', current ' + (prior?.revision ?? 0) + '.');
  const supersedes = request.artifact.supersedes;
  if (!prior && supersedes !== null) fail('Initial artifact revision cannot supersede another revision.');
  if (prior && (!supersedes || supersedes.revision !== prior.revision || supersedes.contentSha256 !== prior.contentSha256 || ('ruleId' in supersedes ? supersedes.ruleId : supersedes.taskId) !== id)) fail('New artifact revision must explicitly supersede its exact prior revision.');
  return undefined;
}
async function verifyArtifactReferences(artifact: ArtifactDraft, library: RegressionLibrary): Promise<void> {
  if (artifact.kind === 'rule') { await verifyRuleSource(artifact.source); return; }
  validateTaskReferences(artifact, library);
  // A retained rule snapshot remains readable if its source disappears, but new validation reports that gap.
  const rules = new Map(artifact.ruleBindings.flatMap(b => b.ruleRefs).map(ref => [ref.ruleId + '/' + ref.revision, exactRule(library, ref)]));
  for (const rule of rules.values()) await verifyRuleSource(rule.source);
  const sources = new Map<string, SourceRun>();
  for (const source of artifact.sourceRefs) sources.set(source.id, await verifySourceRef(source));
  const actualPathEvent = (event: ActionEvent): boolean => event.evidenceIds.length > 0 && (
    event.kind === 'dispatch' && event.dispatchState === 'issued' ||
    (event.kind === 'result' || event.kind === 'reconciliation') && event.resultState !== 'unknown'
  );
  for (const knowledge of artifact.pathKnowledge.filter(p => p.state === 'observed')) {
    const supported = knowledge.sourceRefIds.some(id => {
      const ref = artifact.sourceRefs.find(s => s.id === id), c = ref ? sources.get(id)?.checked.cases.find(c => c.id === ref.caseId) : undefined;
      return ref && c && (c.observations.some(o => ref.observationIds.includes(o.id) && o.coveredRefs.includes(knowledge.planRef) && o.evidenceIds.length > 0 &&
        (!o.actionEventIds?.length || o.actionEventIds.some(id => c.actionEvents.some(e => e.id === id && actualPathEvent(e) && e.evidenceIds.some(eid => o.evidenceIds.includes(eid)))))) ||
        c.actionEvents.some(e => ref.actionIds.includes(e.actionId) && e.planRef === knowledge.planRef && actualPathEvent(e)));
    });
    if (!supported) fail('Observed path knowledge lacks an evidenced source observation or actual action for its exact plan reference: ' + knowledge.planRef);
  }
}
/** Validation is read-only, checks current availability, and is not a readiness or semantic approval. */
export async function validateArtifactRequest({ projectDir, request: input }: { projectDir: unknown; request: unknown }) {
  const request = parseArtifactRequest(input), library = await readLibrary(projectDir), existing = validateRevision(request, library);
  await verifyArtifactReferences(request.artifact, library);
  return { regressionVersion: 1 as const, structurallyValid: true as const, referencesChecked: true as const, operationId: request.operationId,
    kind: request.artifact.kind, artifactId: artifactId(request.artifact), expectedRevision: request.expectedRevision, alreadyCommitted: Boolean(existing),
    caveat: 'No artifact was committed. Structure, revision conditions and referenced retained files were checked at read time; this is not semantic correctness, current readiness, authorization or product acceptance. Commit rechecks its own transaction preconditions.' };
}
export async function commitArtifact({ projectDir, request: input }: { projectDir: unknown; request: unknown }, hooks: { afterCommit?: () => Promise<void>; beforePublish?: () => Promise<void> } = {}): Promise<ArtifactReceipt> {
  const request = parseArtifactRequest(input), { project, root } = await libraryRoot(projectDir, true), release = await acquireLock(root);
  try {
    const library = await readLibraryUnlocked(project, root), payloadSha256 = canonicalHash(request), existing = validateRevision(request, library);
    if (existing) return receipt(existing, true);
    const id = artifactId(request.artifact); await verifyArtifactReferences(request.artifact, library);
    const item: StoredArtifact = { ...request.artifact, regressionVersion: 1, revision: request.expectedRevision + 1, expectedRevision: request.expectedRevision, operationId: request.operationId, payloadSha256,
      contentSha256: canonicalHash(request.artifact), recordedAt: now(), timeSource: 'local_transaction_clock' };
    const folder = await safePath(path.join(root, item.kind + 's', id)); await fs.mkdir(folder, { recursive: true, mode: 0o700 }); await safePath(folder, { existing: true });
    const final = await safePath(path.join(folder, item.revision + '.json')), stage = path.join(folder, '.pending-' + crypto.randomUUID() + '.json');
    const identity = await writeNew(stage, json(item));
    try {
      if (hooks.beforePublish) await hooks.beforePublish();
      await safePath(stage, { existing: true });
      const staged = await fs.lstat(stage);
      if (!staged.isFile() || staged.dev !== identity.dev || staged.ino !== identity.ino || (await hashFile(stage)).sha256 !== hash(json(item))) fail('Staged artifact changed before immutable publication.');
      // Hard-link publication is atomic and fails if the immutable destination already exists.
      await safePath(final); await fs.link(stage, final); await syncDirectory(folder);
    } finally { await removeOwnedFileIfPresent(stage, identity); }
    if (hooks.afterCommit) await hooks.afterCommit();
    return receipt(item, false);
  } finally { await release(); }
}
