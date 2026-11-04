/** User-initiated file saving only. No network, automatic retries or draft mutations. */
import { uiText as u } from '../report/ui-text.mjs';

export interface ReviewFile { readonly name: string; readonly content: string; readonly mime: string; readonly extension: '.html' | '.json'; readonly description: string }
export interface SaveHandle {
  createWritable(): Promise<{ write(content: string): Promise<void>; close(): Promise<void>; abort?(): Promise<void> }>;
  getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
}
export interface SaveHost {
  pick?: (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<SaveHandle>;
  download(file: ReviewFile): void;
}
export type SaveOutcome = { status: 'saved' } | { status: 'download_requested' } | { status: 'cancelled' } | { status: 'error'; message: string };

export async function saveReviewFile(file: ReviewFile, host: SaveHost, downloadOnly = false): Promise<SaveOutcome> {
  try {
    if (downloadOnly || !host.pick) { host.download(file); return { status: 'download_requested' }; }
    // Call the picker before the first await, while the click's activation is live.
    let handle: SaveHandle;
    try { handle = await host.pick({ suggestedName: file.name, types: [{ description: file.description, accept: { [file.mime.split(';')[0]!]: [file.extension] } }] }); }
    catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return { status: 'cancelled' };
      throw error;
    }
    const writable = await handle.createWritable();
    try { await writable.write(file.content); await writable.close(); }
    catch (error) { try { await writable.abort?.(); } catch { /* Preserve the first failure. */ } throw error; }
    const actual = new Uint8Array(await (await handle.getFile()).arrayBuffer()), expected = new TextEncoder().encode(file.content);
    if (actual.length !== expected.length || actual.some((value, i) => value !== expected[i])) throw Error(u('保存后的文件内容与导出快照不一致。'));
    return { status: 'saved' };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}
