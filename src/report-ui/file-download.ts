/** Download already verified bounded bytes; never fetches a file URL or executes its media type. */
import type { HtmlPayload } from '../contracts/model.mjs';
export function downloadTestFile(payload: HtmlPayload, id: string): boolean {
  const file = payload.testFiles?.items.find(f => f.id === id), data = file?.sha256 ? payload.testFileDownloads?.[file.sha256] : undefined;
  if (!file || file.status !== 'retained' || data === undefined) return false;
  const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0)), url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const link = document.createElement('a'); link.href = url; link.download = file.name; document.body.append(link);
  try { link.click(); } finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 15000); }
  return true;
}
