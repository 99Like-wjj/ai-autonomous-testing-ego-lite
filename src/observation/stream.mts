/** Incremental SSE units; neither UTF-8 code points nor credential fields are persisted mid-unit. */
import { reject } from './model.mjs';
export class SSEUnits {
  private decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  private pending = '';
  private ended = false;
  constructor(private readonly maxBytes: number) {}
  get pendingBytes() { return Buffer.byteLength(this.pending); }
  push(bytes: Uint8Array, final = false): string[] {
    if (this.ended) reject('stream_already_ended');
    try { this.pending += this.decoder.decode(bytes, { stream: !final }); } catch { reject('invalid_stream_utf8'); }
    const units: string[] = []; let start = 0, lineStart = 0;
    for (let i = 0; i < this.pending.length; i++) {
      const char = this.pending[i]; if (char !== '\r' && char !== '\n') continue;
      if (char === '\r' && i === this.pending.length - 1 && !final) break;
      const end = i + (char === '\r' && this.pending[i + 1] === '\n' ? 2 : 1);
      if (i === lineStart) { const unit = this.pending.slice(start, end); if (Buffer.byteLength(unit) > this.maxBytes) reject('stream_unit_limit'); units.push(unit); start = end; }
      lineStart = end; i = end - 1;
    }
    this.pending = this.pending.slice(start);
    if (Buffer.byteLength(this.pending) > this.maxBytes) reject('stream_unit_limit');
    if (final) { this.ended = true; if (this.pending.length) reject('incomplete_stream_unit'); }
    return units;
  }
}
export function sseDetails(raw: string): { event: string; id?: string; retry?: number; data: string; dispatched: boolean } {
  const values: string[] = []; let event = 'message', id: string | undefined, retry: number | undefined;
  for (const line of raw.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)) {
    if (!line || line.startsWith(':')) continue;
    const index = line.indexOf(':'), name = index === -1 ? line : line.slice(0, index), value = index === -1 ? '' : line.slice(index + 1).replace(/^ /, '');
    if (name === 'data') values.push(value); else if (name === 'event') event = value || 'message';
    else if (name === 'id' && !value.includes('\0')) id = value;
    else if (name === 'retry' && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))) retry = Number(value);
  }
  return { event, ...(id === undefined ? {} : { id }), ...(retry === undefined ? {} : { retry }), data: values.join('\n'), dispatched: values.length > 0 };
}
