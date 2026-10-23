/** Read-only verification of the frozen v0.1.3 frame; no legacy executable is shipped. */
import type { Report } from '../contracts/model.mjs';
import { canonicalHash, fail, hash, json } from '../core/common.mjs';
import { htmlReportPayload, markdown } from './render.mjs';
export const legacySentinel = '__EGO_V013_PAYLOAD__';
// Static frame from ae2ce6b40ad96a4e02593767964c3e52c262cf6b; the inert JSON payload is checked separately.
export const legacyFrameSha256 = 'ca841189f39d2e264bdc6467ce22ffbbb1d6d6489b77bacf458b330d7f2557ac';
export async function verifyLegacyContent(root: string, checked: Report, files: readonly Buffer[]): Promise<void> {
  const [jsonBytes, markdownBytes, htmlBytes] = files;
  if (checked.schemaVersion !== 3 || !jsonBytes || !markdownBytes || !htmlBytes) fail('Report file does not match the checked records.');
  const saved: unknown = JSON.parse(jsonBytes.toString('utf8'));
  if (canonicalHash(saved) !== canonicalHash(checked)) fail('Report file does not match the checked records: legacy JSON data.');
  // Canonical equality with the validated report establishes the complete data shape, including context.
  const report = saved as Report;
  if (!jsonBytes.equals(Buffer.from(json(report))) || !markdownBytes.equals(Buffer.from(markdown(report)))) fail('Report file does not match the checked records: legacy JSON/Markdown.');
  const html = htmlBytes.toString('utf8'), match = html.match(/<script type="application\/json" id="report-data">([\s\S]*?)<\/script>/);
  if (!match || match.index === undefined || !match[1]) fail('Report file does not match the checked records: legacy payload missing.');
  const payload: unknown = JSON.parse(match[1]);
  if (canonicalHash(payload) !== canonicalHash(await htmlReportPayload(root, report))) fail('Report file does not match the checked records: legacy HTML data.');
  const start = match.index + match[0].indexOf('>') + 1, end = start + match[1].length;
  if (hash(html.slice(0, start) + legacySentinel + html.slice(end)) !== legacyFrameSha256) fail('Report file does not match the checked records: unknown or altered legacy HTML frame.');
}
