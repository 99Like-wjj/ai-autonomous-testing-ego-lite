/** Private append-only evidence. A runtime checkpoint publishes only fully written rows and bodies. */
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createInterface } from 'node:readline';
import { atomicReplace, hash, json, now, readJSON, safeIdentifier, safePath, writeNew, object, assertClosed } from '../core/common.mjs';
import { parseManifest } from '../core/validation.mjs';
import { codeOf, parseConfig, reject, whole, type BodyRef, type Cleanup, type EventData, type NetworkEvent, type Runtime, type Session } from './model.mjs';
import type { Processed } from './policy.mjs';

export const emptyHash = hash('');
export function parseLocalJSON(text: string): unknown { try { return JSON.parse(text); } catch { return reject('invalid_local_json'); } }
export async function networkRoot(runDir: unknown, create = false): Promise<{ root: string; runId: string }> {
  const root = await safePath(runDir, { external: true, existing: true });
  if (!(await fs.lstat(root)).isDirectory()) reject('run_not_directory');
  const manifest = parseManifest(await readJSON(path.join(root, 'manifest.json')));
  const target = await safePath(path.join(root, 'network'));
  if (create) {
    await fs.mkdir(target, { mode: 0o700, recursive: true });
    for (const name of ['captures', 'exports']) await fs.mkdir(await safePath(path.join(target, name)), { mode: 0o700, recursive: true });
  }
  return { root: target, runId: manifest.runId };
}
export async function capturePath(root: string, captureId: string): Promise<string> {
  return safePath(path.join(root, 'captures', safeIdentifier(captureId, 'capture ID')), { existing: true });
}
export async function boundedJSON(filename: string, max = 1024 * 1024): Promise<unknown> {
  await safePath(filename, { existing: true }); const stat = await fs.lstat(filename);
  if (!stat.isFile() || stat.size > max) reject('invalid_or_oversized_file');
  return parseLocalJSON(await fs.readFile(filename, 'utf8'));
}
export function parseSession(value: unknown): Session {
  assertClosed(value, ['networkVersion', 'captureId', 'runId', 'createdAt', 'priorCaptureBytes', 'config', 'toolVersion', 'toolRevision', 'limitations'], 'network session');
  if (value.networkVersion !== 1 || typeof value.runId !== 'string' || typeof value.createdAt !== 'string' || typeof value.toolVersion !== 'string' || typeof value.toolRevision !== 'string' || !Array.isArray(value.limitations) || value.limitations.some(x => typeof x !== 'string')) reject('invalid_session');
  return { networkVersion: 1, captureId: safeIdentifier(value.captureId), runId: value.runId, createdAt: value.createdAt, priorCaptureBytes: whole(value.priorCaptureBytes, 0, Number.MAX_SAFE_INTEGER, 'prior_capture_bytes'), config: parseConfig(value.config), toolVersion: value.toolVersion, toolRevision: value.toolRevision, limitations: value.limitations as string[] };
}
export function parseRuntime(value: unknown): Runtime {
  assertClosed(value, ['networkVersion', 'captureId', 'state', 'reason', 'heartbeatAt', 'committedSeq', 'committedEventBytes', 'committedGapBytes', 'bytes', 'eventHash', 'gapHash', 'gaps', 'counters', 'cleanup'], 'network runtime');
  if (value.networkVersion !== 1 || !['starting', 'recording', 'stopping', 'stopped', 'failed'].includes(String(value.state)) || typeof value.heartbeatAt !== 'string' || !(value.reason === null || typeof value.reason === 'string') || !object(value.counters) || !object(value.cleanup)) reject('invalid_runtime');
  for (const key of ['committedSeq', 'committedEventBytes', 'committedGapBytes', 'bytes', 'gaps'] as const) whole(value[key], 0, Number.MAX_SAFE_INTEGER, key);
  for (const key of ['eventHash', 'gapHash'] as const) if (typeof value[key] !== 'string' || !/^[a-f0-9]{64}$/.test(value[key])) reject('invalid_checkpoint_hash');
  safeIdentifier(value.captureId);
  for (const [key, count] of Object.entries(value.counters)) { if (!/^[a-zA-Z0-9_]{1,64}$/.test(key)) reject('invalid_counter'); whole(count, 0, Number.MAX_SAFE_INTEGER, 'counter'); }
  return value as unknown as Runtime;
}
export interface StoredRow { event: NetworkEvent; previousHash: string; sha256: string }
export class CaptureStore {
  readonly runtime: Runtime;
  private bodyIndex = 0;
  constructor(readonly dir: string, readonly session: Session, initialBytes: number) {
    this.runtime = { networkVersion: 1, captureId: session.captureId, state: 'starting', reason: null, heartbeatAt: now(), committedSeq: 0, committedEventBytes: 0, committedGapBytes: 0, bytes: initialBytes, eventHash: emptyHash, gapHash: emptyHash, gaps: 0, counters: {}, cleanup: { callbacksCleared: false, sessions: [], path: 'not_attached', contextEnd: 'pending' } };
  }
  static async create(dir: string, session: Session) {
    const serializedSession = json(session);
    if (session.priorCaptureBytes + Buffer.byteLength(serializedSession) + 8192 > session.config.limits.maxDiskBytes - 4096) reject('disk_budget_too_small_for_session');
    await safePath(dir); await fs.mkdir(dir, { mode: 0o700 }); await fs.mkdir(path.join(dir, 'bodies'), { mode: 0o700 });
    const bytes = serializedSession; await writeNew(path.join(dir, 'session.json'), bytes);
    await writeNew(path.join(dir, 'events.jsonl'), ''); await writeNew(path.join(dir, 'gaps.jsonl'), '');
    const store = new CaptureStore(dir, session, Buffer.byteLength(bytes) + 8192); await store.checkpoint(); return store;
  }
  private capacity(bytes: number, emergency = false) {
    if (this.session.priorCaptureBytes + this.runtime.bytes + bytes > this.session.config.limits.maxDiskBytes - (emergency ? 0 : 4096)) reject('disk_capacity_exhausted');
  }
  count(key: string, amount = 1) { this.runtime.counters[key] = (this.runtime.counters[key] ?? 0) + amount; }
  peak(key: string, value: number) { this.runtime.counters[key] = Math.max(this.runtime.counters[key] ?? 0, value); }
  async checkpoint() {
    this.runtime.heartbeatAt = now();
    // Some Windows readers temporarily deny replacement. Retry only this mutable
    // metadata transaction; events/bodies and business operations are never replayed.
    const delays = [10, 25, 50, 100];
    for (let attempt = 0; ; attempt++) {
      try { await atomicReplace(path.join(this.dir, 'runtime.json'), json(this.runtime)); return; }
      catch (error) {
        const code = codeOf(error), delay = delays[attempt];
        if (process.platform !== 'win32' || !['local_io_EPERM', 'local_io_EACCES'].includes(code) || delay === undefined) throw error;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  private async append(name: string, line: string) {
    const target = await safePath(path.join(this.dir, name), { existing: true });
    const file = await fs.open(target, 'a'); try { if (!(await file.stat()).isFile()) reject('invalid_log_file'); await file.writeFile(line); await file.sync(); } finally { await file.close(); }
  }
  async event(data: EventData): Promise<NetworkEvent> {
    const event: NetworkEvent = { ...data, networkVersion: 1, captureId: this.session.captureId, seq: this.runtime.committedSeq + 1, committedAt: now() };
    const previousHash = this.runtime.eventHash, sha256 = hash(previousHash + '\n' + JSON.stringify(event));
    const line = JSON.stringify({ event, previousHash, sha256 }) + '\n', bytes = Buffer.byteLength(line);
    if (bytes > 64 * 1024) reject('event_metadata_limit'); this.capacity(bytes);
    await this.append('events.jsonl', line);
    this.runtime.committedSeq = event.seq; this.runtime.committedEventBytes += bytes; this.runtime.bytes += bytes; this.runtime.eventHash = sha256;
    await this.checkpoint(); return event;
  }
  async gap(reason: string, facts: Record<string, string | number | boolean> = {}) {
    // Reasons/facts are generated codes and identities, never raw protocol messages.
    if (!/^[a-zA-Z0-9_]{1,128}$/.test(reason)) reject('unsafe_gap_code');
    const entry = { networkVersion: 1, captureId: this.session.captureId, at: now(), reason, facts }, previousHash = this.runtime.gapHash;
    const sha256 = hash(previousHash + '\n' + JSON.stringify(entry)), line = JSON.stringify({ entry, previousHash, sha256 }) + '\n', bytes = Buffer.byteLength(line);
    this.capacity(bytes, true); await this.append('gaps.jsonl', line);
    this.runtime.gaps++; this.runtime.committedGapBytes += bytes; this.runtime.bytes += bytes; this.runtime.gapHash = sha256; await this.checkpoint();
  }
  async body(content: Processed | null): Promise<BodyRef> {
    if (!content) return { state: 'excluded', reason: 'content_policy' };
    const bytes = content.encoding === 'base64' ? Buffer.from(content.data, 'base64') : Buffer.from(content.data);
    if (content.sourceBytes > this.session.config.limits.maxBodyBytes || bytes.length > this.session.config.limits.maxBodyBytes) return { state: 'truncated', reason: 'body_limit', sourceBytes: content.sourceBytes };
    const record = { networkVersion: 1, encoding: content.encoding, data: content.data }, serialized = json(record); this.capacity(Buffer.byteLength(serialized) + 2048);
    const file = 'bodies/b' + String(++this.bodyIndex).padStart(8, '0') + '.json';
    await writeNew(path.join(this.dir, file), serialized); this.runtime.bytes += Buffer.byteLength(serialized);
    this.count('bodyFiles'); this.count('processedBodyBytes', bytes.length); this.peak('maxBodySourceBytes', content.sourceBytes);
    return { state: bytes.length ? 'saved' : 'empty', file, sha256: hash(bytes), bytes: bytes.length, sourceBytes: content.sourceBytes, encoding: content.encoding, transformed: content.transformed };
  }
  async finish(state: 'stopped' | 'failed', reason: string, cleanup: Cleanup) {
    this.runtime.state = state; this.runtime.reason = reason; this.runtime.cleanup = cleanup; await this.checkpoint();
    await writeNew(path.join(this.dir, 'ended.json'), json({ networkVersion: 1, captureId: this.session.captureId, at: now(), state, reason, cleanup, committedSeq: this.runtime.committedSeq }));
  }
}
export async function readCapture(dir: string) {
  const session = parseSession(await boundedJSON(path.join(dir, 'session.json'))), runtime = parseRuntime(await boundedJSON(path.join(dir, 'runtime.json')));
  if (session.captureId !== runtime.captureId || path.basename(dir) !== session.captureId) reject('capture_identity_mismatch'); return { session, runtime };
}
export async function readBody(dir: string, ref: BodyRef, maxBytes: number) {
  if (!ref.file || !/^bodies\/b\d{8}\.json$/.test(ref.file) || !ref.sha256 || !['utf8', 'base64'].includes(ref.encoding ?? '')) reject('invalid_body_reference');
  const value = await boundedJSON(path.join(dir, ref.file), maxBytes * 2 + 4096);
  assertClosed(value, ['networkVersion', 'encoding', 'data'], 'network body');
  if (value.networkVersion !== 1 || value.encoding !== ref.encoding || typeof value.data !== 'string') reject('invalid_body_file');
  const bytes = value.encoding === 'base64' ? Buffer.from(value.data, 'base64') : Buffer.from(value.data);
  if (bytes.length > maxBytes || bytes.length !== ref.bytes || hash(bytes) !== ref.sha256 || value.encoding === 'base64' && bytes.toString('base64') !== value.data) reject('body_integrity_mismatch');
  return { data: value.data, encoding: value.encoding as 'utf8' | 'base64' };
}
export async function* committedRows(dir: string, checkpoint: Pick<Runtime, 'committedSeq' | 'committedEventBytes' | 'eventHash'>): AsyncGenerator<StoredRow> {
  const file = await safePath(path.join(dir, 'events.jsonl'), { existing: true }), stat = await fs.lstat(file);
  if (!stat.isFile() || stat.size < checkpoint.committedEventBytes) reject('log_shorter_than_checkpoint');
  if (!checkpoint.committedEventBytes) { if (checkpoint.committedSeq || checkpoint.eventHash !== emptyHash) reject('invalid_empty_checkpoint'); return; }
  const stream = createReadStream(file, { start: 0, end: checkpoint.committedEventBytes - 1, encoding: 'utf8', highWaterMark: 65536 });
  const lines = createInterface({ input: stream, crlfDelay: Infinity }); let seq = 0, previousHash = emptyHash, bytes = 0;
  try {
    for await (const line of lines) {
      bytes += Buffer.byteLength(line) + 1; if (line.length > 128 * 1024) reject('oversized_log_row');
      const row = parseLocalJSON(line); assertClosed(row, ['event', 'previousHash', 'sha256'], 'network row');
      if (!object(row.event) || row.previousHash !== previousHash || row.sha256 !== hash(previousHash + '\n' + JSON.stringify(row.event))) reject('event_integrity_mismatch');
      const e = row.event;
      assertClosed(e, ['networkVersion', 'captureId', 'seq', 'committedAt', 'kind', 'source', 'requestKey', 'requestId', 'redirectHop', 'url', 'method', 'status', 'path', 'direction', 'protocolTime', 'wallTime', 'receivedAt', 'details', 'body'], 'network event');
      if (e.networkVersion !== 1 || e.captureId !== path.basename(dir) || e.seq !== ++seq || typeof e.kind !== 'string' || typeof e.receivedAt !== 'string' || !object(e.source)) reject('invalid_event');
      if (e.body && (!object(e.body) || !['saved', 'empty', 'in_progress', 'not_collected', 'excluded', 'truncated', 'failed'].includes(String(e.body.state)))) reject('invalid_body_state');
      previousHash = String(row.sha256); yield row as unknown as StoredRow;
    }
    if (seq !== checkpoint.committedSeq || bytes !== checkpoint.committedEventBytes || previousHash !== checkpoint.eventHash) reject('checkpoint_integrity_mismatch');
  } finally { lines.close(); stream.destroy(); }
}
export async function listCaptureIds(root: string): Promise<string[]> {
  let entries; try { entries = await fs.readdir(await safePath(path.join(root, 'captures')), { withFileTypes: true }); } catch (error) { if (object(error) && error.code === 'ENOENT') return []; throw error; }
  return entries.map(entry => { if (!entry.isDirectory() || entry.isSymbolicLink()) reject('unexpected_capture_entry'); return safeIdentifier(entry.name); }).sort();
}
export const newCaptureId = () => 'cap-' + new Date().toISOString().replace(/[-:.]/g, '') + '-' + crypto.randomUUID();
