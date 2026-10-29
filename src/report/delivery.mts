import fs, { type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import type { FileIdentity, HtmlPayload, Report, ReportContext } from '../contracts/model.mjs';
import { assertClosed, directory, errorInfo, fail, hash, json, object, readJSON, removeOwnedFileIfPresent, safePath, syncDirectory, withRunLock, writeNew } from '../core/common.mjs';
import { arrayValue, sha256Value, strings, textValue } from '../core/validation.mjs';
import { checkUnlocked, recoverEvidence } from '../core/records.mjs';
import { markdown, htmlReport, htmlReportPayload } from './render.mjs';
import { evidenceFile } from '../core/file-integrity.mjs';
import { TEXT_PREVIEW_LIMIT, type PayloadOptions } from './assets.mjs';

export async function validateReportContext(input: unknown, result: Report): Promise<ReportContext> {
  assertClosed(input, ['schemaVersion', 'kind', 'summary', 'limitations', 'sources', 'supplementalCaseIds'], 'report context');
  if (input.schemaVersion !== 7 || input.kind !== 'retrospective') fail('Invalid retrospective report context.');
  const context: ReportContext = {
    schemaVersion: 7, kind: 'retrospective', summary: textValue(input.summary, 'context summary'), limitations: strings(input.limitations, 'limitations'),
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
  return context;
}

interface Attachment { path: string; sha256: string; bytes: number; evidenceIds: string[] }
interface DeliveryManifest {
  deliveryVersion: 1; reportSchemaVersion: 6; runId: string; revision: number; evidenceRevision: number;
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
  return { deliveryVersion: 1, reportSchemaVersion: 6, runId: payload.report.runId, revision: payload.report.revision, evidenceRevision: payload.report.evidenceRevision,
    options: { mode: payload.delivery.mode, textPreviewLimitBytes: payload.delivery.textPreviewLimitBytes, allowMissingScreenshots: payload.delivery.allowMissingScreenshots },
    complete: payload.delivery.complete, attachments: [...unique.values()] };
}
async function readDeliveryOptions(target: string): Promise<Required<PayloadOptions>> {
  const value = await readJSON(await safePath(path.join(target, 'report-delivery.json'), { existing: true }));
  assertClosed(value, ['deliveryVersion', 'reportSchemaVersion', 'runId', 'revision', 'evidenceRevision', 'options', 'complete', 'attachments'], 'report delivery');
  if (value.deliveryVersion !== 1 || value.reportSchemaVersion !== 6) fail('Unsupported report delivery manifest.');
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
  return { filesVerified: true, artifacts, browserOpen: 'not_checked', renderer: 'v7', deliveryMode: payload.delivery.mode, deliveryComplete: payload.delivery.complete };
}
export async function verifyReport(runDir: unknown, reportDir: unknown = runDir) {
  return withRunLock(runDir, async root => {
    const target = await directory(reportDir), saved = await readJSON(path.join(target, 'report.json'));
    if (!object(saved) || saved.schemaVersion !== 7) fail('Unsupported saved report format; v7 is required. Historical files remain unchanged.');
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
