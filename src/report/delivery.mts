import fs, { type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import type { FileIdentity, HtmlPayload, Report, ReportContext } from '../contracts/model.mjs';
import { assertClosed, directory, errorInfo, fail, hash, json, object, readJSON, removeOwnedFileIfPresent, safePath, syncDirectory, withRunLock, writeNew } from '../core/common.mjs';
import { arrayValue, sha256Value, strings, textValue } from '../core/validation.mjs';
import { checkUnlocked, recoverEvidence } from '../core/records.mjs';
import { markdown, htmlReport, htmlReportPayload } from './render.mjs';
import { evidenceFile } from '../core/file-integrity.mjs';
import { TEXT_PREVIEW_LIMIT, type PayloadOptions } from './assets.mjs';
import { caseGoals } from './execution-view.mjs';

export async function validateReportContext(input: unknown, result: Report): Promise<ReportContext> {
  assertClosed(input, ['schemaVersion', 'kind', 'summary', 'limitations', 'sources', 'supplementalCaseIds', 'goalNotes', 'readerNotes'], 'report context');
  if (input.schemaVersion !== 8 || input.kind !== 'retrospective') fail('Invalid retrospective report context.');
  const context: ReportContext = {
    schemaVersion: 8, kind: 'retrospective', summary: textValue(input.summary, 'context summary'), limitations: strings(input.limitations, 'limitations'),
    supplementalCaseIds: strings(input.supplementalCaseIds, 'supplemental case IDs'),
    sources: arrayValue(input.sources, 'sources').map(value => { assertClosed(value, ['label', 'file', 'sha256'], 'report source'); return { label: textValue(value.label, 'source label'), file: textValue(value.file, 'source file'), sha256: sha256Value(value.sha256, 'source hash') }; }),
  };
  if (!context.limitations.length || !context.sources.length) fail('Invalid retrospective report context.');
  const ids = new Set(result.cases.map(c => c.id)), supplemental = new Set<string>();
  for (const id of context.supplementalCaseIds) {
    if (!ids.has(id) || supplemental.has(id)) fail('Unknown or duplicate supplemental case ID.'); supplemental.add(id);
  }
  for (const source of context.sources) {
    const filename = await safePath(source.file, { existing: true });
    if (!(await fs.lstat(filename)).isFile() || hash(await fs.readFile(filename)) !== source.sha256) fail('Report source hash mismatch or non-regular file.');
  }
  if (input.goalNotes !== undefined) {
    const sourceLabels = new Set(context.sources.map(s => s.label)), noteKeys = new Set<string>(), evidenceIds = new Set(result.evidenceCatalog.items.map(e => e.id));
    if (sourceLabels.size !== context.sources.length) fail('Reading-note source labels must be unique.');
    context.goalNotes = arrayValue(input.goalNotes, 'goal reading notes').map(value => {
      assertClosed(value, ['caseId', 'goalId', 'summary', 'preparation', 'reviewSteps', 'limitations', 'sourceLabels', 'primaryEvidenceIds', 'evidenceUses'], 'goal reading note');
      const caseId = textValue(value.caseId, 'note case ID'), goalId = textValue(value.goalId, 'note goal ID'), key = caseId + '/' + goalId;
      if (!result.cases.some(c => c.id === caseId && c.goals.some(g => g.id === goalId)) || noteKeys.has(key)) fail('Unknown or duplicate goal reading note.'); noteKeys.add(key);
      const labels = strings(value.sourceLabels, 'note source labels'), primaryEvidenceIds = strings(value.primaryEvidenceIds, 'primary evidence IDs');
      if (!labels.length || new Set(labels).size !== labels.length || labels.some(s => !sourceLabels.has(s))) fail('Unknown or duplicate reading-note source.');
      if (new Set(primaryEvidenceIds).size !== primaryEvidenceIds.length || primaryEvidenceIds.some(id => !evidenceIds.has(id))) fail('Unknown or duplicate reading-note primary evidence.');
      const limitations = strings(value.limitations, 'note limitations'); if (!limitations.length) fail('Reading notes must declare retrospective limitations.');
      const evidenceUses = arrayValue(value.evidenceUses, 'note evidence uses').map(item => {
        assertClosed(item, ['evidenceId', 'purpose', 'fact', 'limitations'], 'reading-note evidence use');
        const evidenceId = textValue(item.evidenceId, 'note evidence ID'); if (!evidenceIds.has(evidenceId)) fail('Unknown reading-note evidence.');
        const limitations = strings(item.limitations, 'note evidence limitations');
        if (result.evidenceCatalog.items.find(e => e.id === evidenceId)?.caseId !== caseId && !limitations.length) fail('Cross-case reading-note evidence must declare its relationship limitations.');
        return { evidenceId, purpose: textValue(item.purpose, 'note evidence purpose'), fact: textValue(item.fact, 'note supported fact'), limitations };
      });
      if (primaryEvidenceIds.some(id => !evidenceUses.some(use => use.evidenceId === id))) fail('Primary reading-note evidence needs an explicit purpose and limitations.');
      return { caseId, goalId, summary: textValue(value.summary, 'note summary'), preparation: strings(value.preparation, 'note preparation'), reviewSteps: strings(value.reviewSteps, 'suggested review steps'), limitations, sourceLabels: labels, primaryEvidenceIds, evidenceUses };
    });
  }
  if (input.readerNotes !== undefined) {
    const labels = new Set(context.sources.map(s => s.label)), keys = new Set<string>();
    if (labels.size !== context.sources.length) fail('Reader-note source labels must be unique.');
    context.readerNotes = arrayValue(input.readerNotes, 'reader notes').map(value => {
      assertClosed(value, ['caseId', 'goalId', 'title', 'description', 'focusAction', 'actions', 'sourceLabels', 'limitations'], 'reader note');
      const caseId = textValue(value.caseId, 'reader case ID'), goalId = textValue(value.goalId, 'reader goal ID'), key = caseId + '/' + goalId;
      const c = result.cases.find(c => c.id === caseId), a = c?.assessments.find(a => a.goalId === goalId);
      if (!c?.goals.some(g => g.id === goalId) || keys.has(key)) fail('Unknown or duplicate reader goal.'); keys.add(key);
      const observations = c.observations.filter(o => a?.observationIds.includes(o.id));
      const evidence = new Set(caseGoals(result, c).find(item => item.goal.id === goalId)?.evidenceIds ?? []);
      const sourceLabels = strings(value.sourceLabels, 'reader sources'), limitations = strings(value.limitations, 'reader limitations');
      if (!sourceLabels.length || new Set(sourceLabels).size !== sourceLabels.length || sourceLabels.some(l => !labels.has(l)) || !limitations.length) fail('Reader notes require valid sources and limitations.');
      const actionKeys = new Set<string>();
      const actions = arrayValue(value.actions, 'reader actions').map(item => {
        assertClosed(item, ['observationId', 'actionId', 'title', 'result', 'note', 'evidenceIds'], 'reader action');
        const observationId = textValue(item.observationId, 'reader observation ID'), actionId = textValue(item.actionId, 'reader action ID'), actionKey = observationId + '/' + actionId;
        if (!observations.some(o => o.id === observationId && o.actions?.some(a => a.id === actionId)) || actionKeys.has(actionKey)) fail('Reader actions must uniquely reference actual actions of this current goal.'); actionKeys.add(actionKey);
        const evidenceIds = strings(item.evidenceIds, 'reader action evidence');
        if (new Set(evidenceIds).size !== evidenceIds.length || evidenceIds.some(id => !evidence.has(id))) fail('Reader evidence must be linked to this current goal; do not borrow other goals or history.');
        return { observationId, actionId, title: textValue(item.title, 'reader action title'), evidenceIds, ...(item.result === undefined ? {} : { result: textValue(item.result, 'reader result explanation') }), ...(item.note === undefined ? {} : { note: textValue(item.note, 'reader action note') }) };
      });
      let focusAction: { observationId: string; actionId: string } | undefined;
      if (value.focusAction !== undefined) {
        assertClosed(value.focusAction, ['observationId', 'actionId'], 'reader focus action');
        const focus = { observationId: textValue(value.focusAction.observationId, 'focus observation'), actionId: textValue(value.focusAction.actionId, 'focus action') };
        if (!observations.some(o => o.id === focus.observationId && o.actions?.some(a => a.id === focus.actionId))) fail('Reader focus must reference an actual current-goal action, never a planned step.');
        focusAction = focus;
      }
      return { caseId, goalId, title: textValue(value.title, 'reader title'), description: textValue(value.description, 'reader description'), actions, sourceLabels, limitations, ...(focusAction ? { focusAction } : {}) };
    });
  }
  return context;
}

interface Attachment { path: string; sha256: string; bytes: number; evidenceIds: string[] }
interface DeliveryManifest {
  deliveryVersion: 1; reportSchemaVersion: 8; runId: string; revision: number; evidenceRevision: number;
  options: { mode: 'inline' | 'bundle'; textPreviewLimitBytes: number; allowMissingScreenshots: boolean };
  complete: boolean; attachments: Attachment[];
}
function manifestFor(payload: HtmlPayload): DeliveryManifest {
  const unique = new Map<string, Attachment>();
  for (const item of payload.report.evidenceCatalog.items) {
    const filename = payload.previews[item.id]?.attachmentPath; if (!filename) continue;
    let attachment = unique.get(filename);
    if (!attachment) { attachment = { path: filename, sha256: item.sha256, bytes: item.bytes, evidenceIds: [] }; unique.set(filename, attachment); }
    attachment.evidenceIds.push(item.id);
  }
  return { deliveryVersion: 1, reportSchemaVersion: 8, runId: payload.report.runId, revision: payload.report.revision, evidenceRevision: payload.report.evidenceRevision,
    options: { mode: payload.delivery.mode, textPreviewLimitBytes: payload.delivery.textPreviewLimitBytes, allowMissingScreenshots: payload.delivery.allowMissingScreenshots },
    complete: payload.delivery.complete, attachments: [...unique.values()] };
}
async function readDeliveryOptions(target: string): Promise<Required<PayloadOptions>> {
  const value = await readJSON(await safePath(path.join(target, 'report-delivery.json'), { existing: true }));
  assertClosed(value, ['deliveryVersion', 'reportSchemaVersion', 'runId', 'revision', 'evidenceRevision', 'options', 'complete', 'attachments'], 'report delivery');
  if (value.deliveryVersion !== 1 || value.reportSchemaVersion !== 8) fail('Unsupported report delivery manifest.');
  assertClosed(value.options, ['mode', 'textPreviewLimitBytes', 'allowMissingScreenshots'], 'report delivery options');
  const options = value.options;
  if (options.mode !== 'inline' && options.mode !== 'bundle' || !Number.isSafeInteger(options.textPreviewLimitBytes) || typeof options.textPreviewLimitBytes !== 'number' || options.textPreviewLimitBytes < 256 || options.textPreviewLimitBytes > 16 * 1024 * 1024 || typeof options.allowMissingScreenshots !== 'boolean') fail('Invalid report delivery options.');
  return { mode: options.mode, textPreviewLimitBytes: options.textPreviewLimitBytes, allowMissingScreenshots: options.allowMissingScreenshots };
}
async function writeBinaryNew(filename: string, bytes: Buffer): Promise<FileIdentity> {
  await safePath(filename);
  let handle: FileHandle | undefined, identity: FileIdentity | undefined; let created = false;
  try {
    handle = await fs.open(filename, 'wx', 0o600); created = true;
    const stat = await handle.stat(); identity = { dev: stat.dev, ino: stat.ino };
    await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = undefined;
    await syncDirectory(path.dirname(filename)); return identity;
  } catch (caught) {
    const error = errorInfo(caught);
    if (created && !identity && handle) { try { const stat = await handle.stat(); identity = { dev: stat.dev, ino: stat.ino }; } catch {} }
    if (handle) { try { await handle.close(); } catch {} handle = undefined; }
    if (created && identity) {
      try { await removeOwnedFileIfPresent(filename, identity); }
      catch (cleanup) { error.cleanupError = errorInfo(cleanup).message; }
    } else if (created) error.cleanupError = 'Could not verify the created attachment identity; it was left for inspection.';
    throw error;
  }
}
export async function verifyReportFiles(root: string, reportDir: string, result: Report, suppliedPayload?: HtmlPayload) {
  const payload = suppliedPayload ?? await htmlReportPayload(root, result, await readDeliveryOptions(reportDir));
  const manifest = manifestFor(payload), expected = [json(result), markdown(result, payload), htmlReport(payload), json(manifest)];
  const names = ['report.json', 'report.md', 'report.html', 'report-delivery.json'];
  const artifacts: { path: string; bytes: number; sha256: string }[] = [];
  for (const [index, name] of names.entries()) {
    const filename = await safePath(path.join(reportDir, name), { existing: true });
    if (!(await fs.lstat(filename)).isFile()) fail('Report output is not a regular file.');
    const bytes = await fs.readFile(filename);
    if (!bytes.equals(Buffer.from(expected[index]!, 'utf8'))) fail('Report file does not match the checked records: ' + name + '. Historical formats remain unchanged.');
    artifacts.push({ path: filename, bytes: bytes.length, sha256: hash(bytes) });
  }
  for (const attachment of manifest.attachments) {
    const filename = await safePath(path.join(reportDir, ...attachment.path.split('/')), { existing: true });
    if (!(await fs.lstat(filename)).isFile()) fail('Report attachment is not a regular file.');
    const bytes = await fs.readFile(filename);
    if (hash(bytes) !== attachment.sha256 || bytes.length !== attachment.bytes) fail('Report attachment hash or byte count mismatch: ' + attachment.path);
    artifacts.push({ path: filename, bytes: bytes.length, sha256: hash(bytes) });
  }
  return { filesVerified: true, artifacts, browserOpen: 'not_checked', renderer: 'v8', deliveryMode: payload.delivery.mode, deliveryComplete: payload.delivery.complete };
}
export async function verifyReport(runDir: unknown, reportDir: unknown = runDir) {
  return withRunLock(runDir, async root => {
    const target = await directory(reportDir), saved = await readJSON(path.join(target, 'report.json'));
    if (!object(saved) || saved.schemaVersion !== 8) fail('Unsupported saved report format; v8 is required. Historical files remain unchanged.');
    const options = await readDeliveryOptions(target), result = await checkUnlocked(root, { allowMissingScreenshots: options.allowMissingScreenshots });
    if (saved.context !== undefined) result.context = await validateReportContext(saved.context, result);
    return verifyReportFiles(root, target, result, await htmlReportPayload(root, result, options));
  });
}
export interface ReportOptions { outputDir?: unknown; contextFile?: string | undefined; deliveryMode?: 'inline' | 'bundle'; allowMissingScreenshots?: boolean; textPreviewLimitBytes?: number }
export async function report(runDir: unknown, { outputDir = runDir, contextFile, deliveryMode = 'inline', allowMissingScreenshots = false, textPreviewLimitBytes = TEXT_PREVIEW_LIMIT }: ReportOptions = {}) {
  return withRunLock(runDir, async root => {
    await recoverEvidence(root);
    const target = await directory(outputDir), result = await checkUnlocked(root, { allowMissingScreenshots });
    if (contextFile !== undefined) result.context = await validateReportContext(await readJSON(contextFile), result);
    const payload = await htmlReportPayload(root, result, { mode: deliveryMode, textPreviewLimitBytes, allowMissingScreenshots }), manifest = manifestFor(payload);
    const contents = [json(result), markdown(result, payload), htmlReport(payload), json(manifest)];
    const filenames = ['report.json', 'report.md', 'report.html', 'report-delivery.json'].map(name => path.join(target, name));
    const attachmentDir = path.join(target, 'attachments');
    for (const filename of [...filenames, ...(manifest.attachments.length ? [attachmentDir] : [])]) {
      await safePath(filename);
      try { await fs.lstat(filename); fail('Refusing to overwrite ' + path.basename(filename) + '.'); }
      catch (caught) { if (errorInfo(caught).code !== 'ENOENT') throw caught; }
    }
    const created: { filename: string; identity: FileIdentity }[] = []; let createdDir: FileIdentity | undefined;
    try {
      if (manifest.attachments.length) { await fs.mkdir(attachmentDir); const stat = await fs.lstat(attachmentDir); createdDir = { dev: stat.dev, ino: stat.ino }; }
      for (const attachment of manifest.attachments) {
        const item = result.evidenceCatalog.items.find(item => item.id === attachment.evidenceIds[0]);
        if (!item) fail('Missing report attachment source.');
        const bytes = await fs.readFile(await evidenceFile(root, item.path));
        if (hash(bytes) !== attachment.sha256 || bytes.length !== attachment.bytes) fail('Evidence changed during bundle generation.');
        const filename = path.join(target, ...attachment.path.split('/')); created.push({ filename, identity: await writeBinaryNew(filename, bytes) });
      }
      for (const [index, filename] of filenames.entries()) created.push({ filename, identity: await writeNew(filename, contents[index]!) });
      const verification = await verifyReportFiles(root, target, result, payload);
      return { reportJson: filenames[0]!, reportMarkdown: filenames[1]!, reportHtml: filenames[2]!, reportDeliveryManifest: filenames[3]!, schemaVersion: result.schemaVersion, ...verification };
    } catch (caught) {
      const error = errorInfo(caught), cleanupErrors: string[] = [];
      for (const item of created.reverse()) { try { await removeOwnedFileIfPresent(item.filename, item.identity); } catch (cleanup) { cleanupErrors.push(errorInfo(cleanup).message); } }
      if (createdDir) {
        try { const stat = await fs.lstat(attachmentDir); if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev !== createdDir.dev || stat.ino !== createdDir.ino) fail('Attachment directory identity changed; preserving it.'); await fs.rmdir(attachmentDir); }
        catch (cleanup) { cleanupErrors.push(errorInfo(cleanup).message); }
      }
      if (cleanupErrors.length) error.cleanupError = [error.cleanupError, ...cleanupErrors].filter(Boolean).join('; ');
      throw error;
    }
  });
}
