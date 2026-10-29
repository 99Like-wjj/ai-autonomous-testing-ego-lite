/** Network evidence has its own version. No business verdicts or legacy capture reader. */
import { assertClosed, object, safeIdentifier, validTimestamp } from '../core/common.mjs';

export const NETWORK_VERSION = 1 as const;
export const limitations = [
  'Only registered top-level targets, page origins and interface paths during the stated windows are covered.',
  'Independent iframe, worker and service-worker targets are not automatically attached. Pre-start traffic is unavailable.',
  'Control checks and writes are not atomic. Handoff stops collection; recovery requires an explicit new start.',
  'Content filtering is heuristic; use JSON field selection or omit bodies for stricter data policies.',
  'HTTP status, missing events and monitoring errors do not determine a business verdict.'
] as const;
export class NetworkError extends Error {
  constructor(readonly code: string) { super('Network observation: ' + code); }
}
export function reject(code: string): never { throw new NetworkError(code); }
export const codeOf = (error: unknown): string => error instanceof NetworkError ? error.code : object(error) && typeof error.code === 'string' && ['ENOENT', 'EACCES', 'EPERM', 'ENOSPC', 'EIO', 'EROFS', 'EMFILE', 'ENFILE', 'EEXIST'].includes(error.code) ? 'local_io_' + error.code : 'unexpected_local_failure';
export interface PageScope { label: string; targetId: string; origins: string[] }
export interface InterfaceScope { origin: string; pathPrefixes: string[] }
export interface ContentPolicy { bodies: 'redact' | 'omit'; jsonFields: string[] | null; headers: string[]; wsBinary: 'include' | 'omit' }
export interface Limits {
  maxBodyBytes: number; maxDiskBytes: number; maxQueueEvents: number; maxQueueBytes: number;
  maxTrackedRequests: number; maxQueryBytes: number; pollMs: number; commandTimeoutMs: number; startupTimeoutMs: number;
}
export interface NetworkConfig { networkVersion: 1; spaceId: number; pages: PageScope[]; interfaces: InterfaceScope[]; policy: ContentPolicy; limits: Limits }
export const defaultLimits: Limits = {
  maxBodyBytes: 512 * 1024, maxDiskBytes: 64 * 1024 * 1024, maxQueueEvents: 4096, maxQueueBytes: 8 * 1024 * 1024,
  maxTrackedRequests: 4096, maxQueryBytes: 256 * 1024, pollMs: 100, commandTimeoutMs: 5000, startupTimeoutMs: 15000
};
export const sensitiveKey = /password|passwd|(?:^|[_-])pwd(?:$|[_-])|token|authorization|authentication|^auth$|^auth[_-]|cookie|secret|credential|private.?key|api.?key|access.?key|session|csrf|signature|^sig$/i;
export const unsafeKey = (key: string) => ['__proto__', 'prototype', 'constructor'].includes(key);
export function whole(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) reject('invalid_' + label); return value;
}
export function short(value: unknown, label: string, max = 256): string {
  if (typeof value !== 'string' || !value.length || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) reject('invalid_' + label); return value;
}
export function originValue(value: unknown): string {
  const text = short(value, 'origin'); let url: URL; try { url = new URL(text); } catch { return reject('invalid_origin'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== text || url.username || url.password) reject('invalid_origin'); return text;
}
function strings(value: unknown, label: string, max: number): string[] {
  if (!Array.isArray(value) || value.length > max) reject('invalid_' + label);
  const result = value.map(item => short(item, label)); if (new Set(result).size !== result.length) reject('duplicate_' + label); return result;
}
export function pathValue(value: unknown): string {
  const text = short(value, 'path', 1024);
  if (!text.startsWith('/') || text.startsWith('//') || /[?#\\*]/.test(text) || /(?:^|\/)\.\.?(?:\/|$)/.test(text)) reject('invalid_path');
  try { if (decodeURIComponent(text).split('/').some(part => part === '.' || part === '..')) reject('invalid_path'); } catch { reject('invalid_path'); }
  return text;
}
export function parseConfig(input: unknown): NetworkConfig {
  assertClosed(input, ['networkVersion', 'spaceId', 'pages', 'interfaces', 'policy', 'limits'], 'network start');
  if (input.networkVersion !== NETWORK_VERSION) reject('unsupported_network_version');
  if (!Array.isArray(input.pages) || !input.pages.length || input.pages.length > 16) reject('invalid_pages');
  const pages = input.pages.map(value => {
    assertClosed(value, ['label', 'targetId', 'origins'], 'registered page');
    const label = safeIdentifier(value.label, 'page label'), targetId = short(value.targetId, 'target_id', 128);
    if (!/^[A-Za-z0-9._:-]+$/.test(targetId)) reject('invalid_target_id');
    const origins = strings(value.origins, 'page_origins', 16).map(originValue); if (!origins.length) reject('invalid_page_origins');
    return { label, targetId, origins };
  });
  if (new Set(pages.map(p => p.label)).size !== pages.length || new Set(pages.map(p => p.targetId)).size !== pages.length) reject('duplicate_page');
  if (!Array.isArray(input.interfaces) || !input.interfaces.length || input.interfaces.length > 32) reject('invalid_interfaces');
  const interfaces = input.interfaces.map(value => {
    assertClosed(value, ['origin', 'pathPrefixes'], 'interface scope');
    const pathPrefixes = strings(value.pathPrefixes, 'path_prefixes', 32).map(pathValue); if (!pathPrefixes.length) reject('invalid_path_prefixes');
    return { origin: originValue(value.origin), pathPrefixes };
  });
  const rawPolicy = input.policy ?? {}; assertClosed(rawPolicy, ['bodies', 'jsonFields', 'headers', 'wsBinary'], 'content policy');
  const bodies = rawPolicy.bodies ?? 'redact', wsBinary = rawPolicy.wsBinary ?? 'include';
  if (bodies !== 'redact' && bodies !== 'omit') reject('invalid_body_policy');
  if (wsBinary !== 'include' && wsBinary !== 'omit') reject('invalid_binary_policy');
  const jsonFields = rawPolicy.jsonFields === undefined || rawPolicy.jsonFields === null ? null : strings(rawPolicy.jsonFields, 'json_fields', 64);
  if (jsonFields?.some(f => !/^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*){0,15}$/.test(f) || f.split('.').some(k => unsafeKey(k) || sensitiveKey.test(k)))) reject('unsafe_json_field');
  const headers = strings(rawPolicy.headers ?? ['content-type', 'content-length', 'location', 'retry-after', 'x-request-id', 'x-correlation-id'], 'headers', 32).map(x => x.toLowerCase());
  if (headers.some(h => sensitiveKey.test(h) || !/^[a-z0-9-]+$/.test(h)) || new Set(headers).size !== headers.length) reject('unsafe_header');
  const rawLimits = input.limits ?? {}; assertClosed(rawLimits, Object.keys(defaultLimits), 'network limits');
  const ranges: Record<keyof Limits, [number, number]> = {
    maxBodyBytes: [256, 8 * 1024 * 1024], maxDiskBytes: [32768, 1024 * 1024 * 1024], maxQueueEvents: [4, 65536], maxQueueBytes: [4096, 64 * 1024 * 1024],
    maxTrackedRequests: [4, 65536], maxQueryBytes: [8192, 2 * 1024 * 1024], pollMs: [25, 2000], commandTimeoutMs: [100, 30000], startupTimeoutMs: [100, 60000]
  };
  const limits = { ...defaultLimits };
  for (const key of Object.keys(defaultLimits) as (keyof Limits)[]) { const [min, max] = ranges[key]; limits[key] = whole(rawLimits[key] ?? defaultLimits[key], min, max, key); }
  if (limits.maxBodyBytes > limits.maxDiskBytes / 2) reject('body_limit_exceeds_disk_budget');
  return { networkVersion: 1, spaceId: whole(input.spaceId, 0, Number.MAX_SAFE_INTEGER, 'space_id'), pages, interfaces, policy: { bodies, jsonFields, headers, wsBinary }, limits };
}
export function interfaceURL(value: string, config: NetworkConfig): URL | null {
  let url: URL; try { url = new URL(value); } catch { return null; }
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) || url.username || url.password) return null;
  const origin = url.origin.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
  return config.interfaces.some(scope => scope.origin === origin && scope.pathPrefixes.some(p => url.pathname === p || url.pathname.startsWith(p.endsWith('/') ? p : p + '/'))) ? url : null;
}
export type BodyState = 'saved' | 'empty' | 'in_progress' | 'not_collected' | 'excluded' | 'truncated' | 'failed';
export interface BodyRef { state: BodyState; reason?: string; file?: string; sha256?: string; bytes?: number; sourceBytes?: number; encoding?: 'utf8' | 'base64'; transformed?: boolean }
export interface Source { page: string; targetId: string; generation: number; sessionId: string }
export interface EventData {
  kind: string; source: Source; requestKey?: string; requestId?: string; redirectHop?: number;
  url?: string; method?: string; status?: number; path?: string; direction?: 'sent' | 'received';
  protocolTime?: { value: number; clock: 'monotonic'; unit: 'seconds' }; wallTime?: { value: number; clock: 'unix'; unit: 'seconds' };
  receivedAt: string; details?: Record<string, unknown>; body?: BodyRef;
}
export interface NetworkEvent extends EventData { networkVersion: 1; captureId: string; seq: number; committedAt: string }
export interface Cleanup { callbacksCleared: boolean; sessions: { sessionId: string; networkDisabled: boolean; detached: boolean }[]; path: 'explicit' | 'host_context' | 'not_attached'; contextEnd: 'pending' | 'reported' }
export interface Runtime {
  networkVersion: 1; captureId: string; state: 'starting' | 'recording' | 'stopping' | 'stopped' | 'failed';
  reason: string | null; heartbeatAt: string; committedSeq: number; committedEventBytes: number; committedGapBytes: number; bytes: number;
  eventHash: string; gapHash: string; gaps: number; counters: Record<string, number>; cleanup: Cleanup;
}
export interface Session { networkVersion: 1; captureId: string; runId: string; createdAt: string; priorCaptureBytes: number; config: NetworkConfig; toolVersion: string; toolRevision: string; limitations: readonly string[] }
export interface Startup { networkVersion: 1; captureDir: string; sessionSha256: string; executable: string }
export interface NativeTab { targetId: string; url: string }
export interface NativeBridge {
  useTaskSpace(id: number): unknown;
  listTabs(): Promise<{ tabs?: NativeTab[]; error?: string; error_code?: string }>;
  getBrowserVersion?: () => Promise<unknown>;
  sendCDPMessage(message: string): unknown;
  onCDPMessage?: ((message: string) => void) | null | undefined;
  onSendCDPMessageError?: ((message: string, code: string) => void) | null | undefined;
}
export interface NativeEvent { method: string; sessionId?: string; params: Record<string, unknown> }
export interface Query {
  networkVersion: 1; captureIds?: string[]; page?: string; path?: string; urlContains?: string; method?: string; status?: number; errorsOnly?: boolean;
  requestKey?: string; kind?: string; direction?: 'sent' | 'received'; after?: string; before?: string;
  limit: number; scanLimit: number; includeBodies: boolean; bodyOffset: number; bodyLimit: number; cursor?: string;
}
export function parseQuery(input: unknown): Query {
  assertClosed(input, ['networkVersion', 'captureIds', 'page', 'path', 'urlContains', 'method', 'status', 'errorsOnly', 'requestKey', 'kind', 'direction', 'after', 'before', 'limit', 'scanLimit', 'includeBodies', 'bodyOffset', 'bodyLimit', 'cursor'], 'network query');
  if (input.networkVersion !== 1) reject('unsupported_network_version');
  const result: Query = { networkVersion: 1, limit: whole(input.limit ?? 20, 1, 200, 'limit'), scanLimit: whole(input.scanLimit ?? 5000, 1, 50000, 'scan_limit'), includeBodies: input.includeBodies === true, bodyOffset: whole(input.bodyOffset ?? 0, 0, 16 * 1024 * 1024, 'body_offset'), bodyLimit: whole(input.bodyLimit ?? 4096, 1, 65536, 'body_limit') };
  if (input.includeBodies !== undefined && typeof input.includeBodies !== 'boolean' || input.errorsOnly !== undefined && typeof input.errorsOnly !== 'boolean') reject('invalid_query_boolean');
  if (input.captureIds !== undefined) result.captureIds = strings(input.captureIds, 'capture_ids', 128).map(x => safeIdentifier(x));
  for (const key of ['page', 'urlContains', 'method', 'requestKey', 'kind', 'cursor'] as const) if (input[key] !== undefined) result[key] = short(input[key], key, key === 'cursor' ? 32768 : 1024);
  if (result.method && !/^[A-Z]{1,20}$/.test(result.method)) reject('invalid_method');
  if (input.path !== undefined) result.path = pathValue(input.path);
  if (input.status !== undefined) result.status = whole(input.status, 100, 599, 'status');
  if (input.errorsOnly !== undefined) result.errorsOnly = input.errorsOnly;
  if (input.direction !== undefined) { if (input.direction !== 'sent' && input.direction !== 'received') reject('invalid_direction'); result.direction = input.direction; }
  for (const key of ['after', 'before'] as const) if (input[key] !== undefined) { if (!validTimestamp(input[key])) reject('invalid_query_time'); result[key] = input[key]; }
  if (result.after && result.before && result.after > result.before) reject('invalid_time_window');
  return result;
}
export function asObject(value: unknown): Record<string, unknown> { return object(value) ? value : {}; }
