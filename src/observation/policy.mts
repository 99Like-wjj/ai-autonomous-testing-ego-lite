/** Apply the same policy before any URL, header, body or error reaches disk/output. */
import { asObject, sensitiveKey, unsafeKey, type ContentPolicy } from './model.mjs';

export function redactText(text: string): string {
  return text.replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+\/=:-]+/gi, '[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/((?:["']?)(?:password|passwd|pwd|[\w-]*token|secret|client[_-]?secret|api[_-]?key|access[_-]?key|authorization|cookie|signature|credential)(?:["']?)\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;&}\r\n]+)/gi, '$1[REDACTED]')
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[REDACTED]@');
}
export function safeURL(value: string): string {
  try {
    const url = new URL(value); url.username = ''; url.password = ''; url.hash = '';
    const query = new URLSearchParams();
    for (const [key, val] of url.searchParams) query.append(key, sensitiveKey.test(key) ? '[REDACTED]' : redactText(val));
    url.search = query.toString();
    const redacted = redactText(url.toString()); return redacted.length > 4096 ? redacted.slice(0, 4096) : redacted;
  } catch { return '[invalid URL]'; }
}
export function safeHeaders(value: unknown, policy: ContentPolicy): Record<string, string> {
  const result: Record<string, string> = {}; let total = 0;
  for (const [key, item] of Object.entries(asObject(value))) {
    const name = key.toLowerCase(); if (!policy.headers.includes(name) || sensitiveKey.test(name) || typeof item !== 'string' || item.length > 4096) continue;
    const filtered = name === 'location' ? safeURL(item) : redactText(item);
    total += Buffer.byteLength(name) + Buffer.byteLength(filtered); if (total > 16384) break;
    result[name] = filtered;
  }
  return result;
}
function scrub(value: unknown, depth = 0): unknown {
  if (depth > 32) return '[DEPTH LIMIT]';
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(item => scrub(item, depth + 1));
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !unsafeKey(key)).map(([key, item]) => [key, sensitiveKey.test(key) ? '[REDACTED]' : scrub(item, depth + 1)]));
  return value;
}
export interface Processed { data: string; encoding: 'utf8' | 'base64'; sourceBytes: number; transformed: boolean }
export function processText(text: string, policy: ContentPolicy): Processed | null {
  if (policy.bodies === 'omit') return null;
  let value: unknown; let parsed = false; try { value = JSON.parse(text); parsed = true; } catch {}
  let data: string;
  if (policy.jsonFields !== null) {
    if (!parsed) return null;
    const selected: Record<string, unknown> = {};
    for (const field of policy.jsonFields) {
      let current = value;
      for (const key of field.split('.')) { const record = asObject(current); current = Object.hasOwn(record, key) ? record[key] : undefined; }
      if (current !== undefined) selected[field] = scrub(current);
    }
    data = JSON.stringify(selected);
  } else data = parsed ? JSON.stringify(scrub(value)) : redactText(text);
  return { data, encoding: 'utf8', sourceBytes: Buffer.byteLength(text), transformed: data !== text };
}
export function processBinary(bytes: Buffer, policy: ContentPolicy): Processed | null {
  if (policy.bodies === 'omit' || policy.wsBinary === 'omit' || policy.jsonFields !== null) return null;
  // Text-bearing binary messages still pass through the text policy. Opaque binary
  // is reversible only inside explicitly scoped WS endpoints; it has no generic secret detector.
  let processed = bytes; let transformed = false;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
      const result = processText(text, policy); if (!result) return null;
      processed = Buffer.from(result.data); transformed = result.transformed;
    }
  } catch {}
  return { data: processed.toString('base64'), encoding: 'base64', sourceBytes: bytes.length, transformed };
}
export function processSSE(raw: string, policy: ContentPolicy): Processed | null {
  if (policy.bodies === 'omit') return null;
  const lines = raw.split(/(\r\n|\r|\n)/), dataIndices: number[] = [];
  for (let i = 0; i < lines.length; i += 2) if (lines[i]?.startsWith('data:') || lines[i] === 'data') dataIndices.push(i);
  const data = dataIndices.map(i => (lines[i] ?? '').slice(4).replace(/^: ?/, '')).join('\n');
  const body = processText(data, policy); if (!body) return null;
  if (body.data !== data) {
    const first = dataIndices[0]; if (first !== undefined) lines[first] = 'data: ' + body.data.replace(/\r?\n/g, '\ndata: ');
    for (const i of dataIndices.slice(1)) { lines[i] = ''; lines[i + 1] = ''; }
  }
  // IDs, comments and other fields are untrusted text too.
  const output = redactText(lines.join(''));
  return { data: output, encoding: 'utf8', sourceBytes: Buffer.byteLength(raw), transformed: output !== raw };
}
