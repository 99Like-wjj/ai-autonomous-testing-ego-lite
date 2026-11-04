/** Optional CLI feedback writer. The offline page exports without this process. */
import fs from 'node:fs/promises';
import { withPresentation, type Presentation } from './presentation.mjs';
import path from 'node:path';
import type { FileIdentity } from '../contracts/model.mjs';
import { feedbackFromText, parseReviewFeedback, type ReviewFeedback } from '../contracts/review-feedback.mjs';
import { readCasesFile, caseFilename } from '../core/case-versions.mjs';
import { acquireLock, canonical, canonicalHash, fail, hash, json, safePath, writeNew, removeOwnedFileIfPresent } from '../core/common.mjs';
import { regularFilePath } from '../core/file-integrity.mjs';
import { reviewDocuments, reviewFileLimit } from './review-feedback-document.mjs';

export async function readFeedbackInput(file: unknown): Promise<unknown> {
  const filename = await regularFilePath(await safePath(file, { existing: true }));
  if ((await fs.stat(filename)).size > reviewFileLimit) fail('Review feedback exceeds the 8 MiB input limit.');
  const bytes = await fs.readFile(filename);
  if (bytes.length > reviewFileLimit) fail('Review feedback grew beyond the input limit.');
  return feedbackFromText(bytes.toString('utf8'));
}
interface ExportFile { name: string; sha256: string; bytes: number }
interface ExportManifest { kind: 'case-review-export'; exportVersion: 1; requestSha256: string; files: ExportFile[] }
export interface ReviewExportReceipt {
  outputDir: string; json: string; html: string; manifest: string; requestSha256: string;
  files: ExportFile[]; replayed: boolean; nativeWrite: true; reviewRegistered: false; businessExecuted: false;
}
export async function exportReviewFeedback({ casesFile, request, outputDir, presentation }: { casesFile: unknown; request: unknown; outputDir: unknown; presentation?:Presentation | undefined }): Promise<ReviewExportReceipt> {
  const saved = await readCasesFile(casesFile), identity = { cases: saved.ref, pointIds: saved.baseline.cases.flatMap(c => c.goals.map(g => g.pointId)) };
  const feedback = parseReviewFeedback(request, identity);
  const root = await safePath(outputDir, { external: true }); await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const digest = canonicalHash(feedback), prefix = caseFilename(saved.ref.caseVersion).slice(0, -5) + '-review-' + digest.slice(0, 20) + (presentation ? '-'+canonicalHash(presentation).slice(0,8) : '');
  const names = [prefix + '.json', prefix + '.html'], manifestFile = path.join(root, prefix + '-delivery.json');
  const receipt = (files: ExportFile[], replayed: boolean): ReviewExportReceipt => ({ outputDir: root, json: path.join(root, names[0]!), html: path.join(root, names[1]!), manifest: manifestFile, requestSha256: digest, files, replayed, nativeWrite: true, reviewRegistered: false, businessExecuted: false });
  const release = await acquireLock(root);
  try {
    let existingManifest: string | undefined;
    try { existingManifest = await fs.readFile(await regularFilePath(manifestFile), 'utf8'); }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
    if (existingManifest !== undefined) {
      const raw = JSON.parse(existingManifest) as ExportManifest;
      if (raw.kind !== 'case-review-export' || raw.exportVersion !== 1 || raw.requestSha256 !== digest || !Array.isArray(raw.files) || raw.files.length !== 2) fail('Existing review export identity mismatch.');
      for (let i = 0; i < names.length; i++) {
        const f = raw.files[i]; if (!f || f.name !== names[i]) fail('Unexpected review export filename.');
        const bytes = await fs.readFile(await regularFilePath(path.join(root, f.name)));
        if (hash(bytes) !== f.sha256 || bytes.length !== f.bytes) fail('Existing review export changed.');
        const value = parseReviewFeedback(feedbackFromText(bytes.toString('utf8')), identity);
        if (canonical(value) !== canonical(feedback)) fail('Existing review export content mismatch.');
      }
      return receipt(raw.files, true);
    }
    const titles = new Map(saved.baseline.cases.flatMap(c => c.goals.map(g => [g.pointId, g.title] as const)));
    const documents = withPresentation(presentation, () => reviewDocuments(feedback, identity, saved.baseline.project, titles));
    const contents = [Buffer.from(documents.json), Buffer.from(documents.html)];
    const files = contents.map((bytes, i) => ({ name: names[i]!, sha256: hash(bytes), bytes: bytes.length }));
    const owned: { file: string; identity: FileIdentity }[] = [];
    try {
      for (let i = 0; i < names.length; i++) { const file = path.join(root, names[i]!); owned.push({ file, identity: await writeNew(file, contents[i]!) }); }
      if ((await readCasesFile(saved.file)).ref.sha256 !== saved.ref.sha256) fail('Case source changed before review export publication.');
      for (let i = 0; i < names.length; i++) {
        const bytes = await fs.readFile(await regularFilePath(path.join(root, names[i]!)));
        if (hash(bytes) !== files[i]!.sha256 || canonical(parseReviewFeedback(feedbackFromText(bytes.toString('utf8')), identity)) !== canonical(feedback)) fail('Native review export readback failed.');
      }
      const metadata: ExportManifest = { kind: 'case-review-export', exportVersion: 1, requestSha256: digest, files };
      owned.push({ file: manifestFile, identity: await writeNew(manifestFile, json(metadata)) });
      return receipt(files, false);
    } catch (error) { for (const item of owned.reverse()) await removeOwnedFileIfPresent(item.file, item.identity); throw error; }
  } finally { await release(); }
}
