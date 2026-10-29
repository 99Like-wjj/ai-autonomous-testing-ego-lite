import fs from 'node:fs/promises';
import path from 'node:path';
import type { FileIdentity, Report, ReportContext } from '../contracts/model.mjs';
import { assertClosed, directory, errorInfo, fail, hash, json, object, readJSON, removeOwnedFileIfPresent, safePath, withRunLock, writeNew } from '../core/common.mjs';
import { arrayValue, sha256Value, strings, textValue } from '../core/validation.mjs';
import { checkUnlocked, recoverEvidence } from '../core/records.mjs';
import { markdown, htmlReport, htmlReportPayload } from './render.mjs';

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
export async function verifyReportFiles(root: string, reportDir: string, result: Report) {
  const expected = [json(result), markdown(result), htmlReport(await htmlReportPayload(root, result))];
  const names = ['report.json', 'report.md', 'report.html'];
  const artifacts: { path: string; bytes: number; sha256: string }[] = [];
  let matches = true;
  for (const [i, name] of names.entries()) {
    const filename = await safePath(path.join(reportDir, name), { existing: true });
    if (!(await fs.lstat(filename)).isFile()) fail('Report output is not a regular file.');
    const bytes = await fs.readFile(filename), wanted = expected[i];
    if (wanted === undefined || !bytes.equals(Buffer.from(wanted, 'utf8'))) matches = false;
    artifacts.push({ path: filename, bytes: bytes.length, sha256: hash(bytes) });
  }
  if (!matches) fail('Report file does not match the checked records. Historical formats are unsupported and unchanged.');
  return { filesVerified: true, artifacts, browserOpen: 'not_checked', renderer: 'v7' };
}
export async function verifyReport(runDir: unknown, reportDir: unknown = runDir) {
  return withRunLock(runDir, async root => {
    const target = await directory(reportDir), saved = await readJSON(path.join(target, 'report.json'));
    if (!object(saved)) fail('Invalid saved report.');
    if (saved.schemaVersion !== 7) fail('Unsupported saved report format; v7 is required. Historical files remain unchanged.');
    const result = await checkUnlocked(root);
    if (saved.context !== undefined) result.context = await validateReportContext(saved.context, result);
    return verifyReportFiles(root, target, result);
  });
}
export async function report(runDir: unknown, { outputDir = runDir, contextFile }: { outputDir?: unknown; contextFile?: string | undefined } = {}) {
  return withRunLock(runDir, async root => {
    await recoverEvidence(root);
    const target = await directory(outputDir), result = await checkUnlocked(root);
    if (contextFile !== undefined) result.context = await validateReportContext(await readJSON(contextFile), result);
    const htmlPayload = htmlReport(await htmlReportPayload(root, result)), jsonPayload = json(result), markdownPayload = markdown(result);
    const filenames: [string, string, string] = [path.join(target, 'report.json'), path.join(target, 'report.md'), path.join(target, 'report.html')];
    for (const filename of filenames) {
      await safePath(filename);
      try { await fs.lstat(filename); fail('Refusing to overwrite ' + path.basename(filename) + '.'); }
      catch (caught) { const error = errorInfo(caught); if (error.code !== 'ENOENT') throw error; }
    }
    const created: { filename: string; identity: FileIdentity }[] = [];
    let verification: Awaited<ReturnType<typeof verifyReportFiles>>;
    try {
      created.push({ filename: filenames[0], identity: await writeNew(filenames[0], jsonPayload) });
      created.push({ filename: filenames[1], identity: await writeNew(filenames[1], markdownPayload) });
      created.push({ filename: filenames[2], identity: await writeNew(filenames[2], htmlPayload) });
      verification = await verifyReportFiles(root, target, result);
    } catch (caught) {
      const error = errorInfo(caught), cleanupErrors: string[] = [];
      for (const item of created.reverse()) { try { await removeOwnedFileIfPresent(item.filename, item.identity); } catch (cleanup) { cleanupErrors.push(errorInfo(cleanup).message); } }
      if (cleanupErrors.length) error.cleanupError = cleanupErrors.join('; ');
      throw error;
    }
    return { reportJson: filenames[0], reportMarkdown: filenames[1], reportHtml: filenames[2], schemaVersion: result.schemaVersion, ...verification };
  });
}
