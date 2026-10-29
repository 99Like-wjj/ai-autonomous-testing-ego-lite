/** Own the documented native callback slots in a dedicated Ego invocation. Never use SDK CDP helpers here. */
import { asObject, NetworkError, reject, type NativeBridge, type NativeEvent, type Limits } from './model.mjs';

interface Pending { id: number; resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
export class NativeChannel {
  private id = 100000;
  private pending: Pending | null = null;
  private queue: { event: NativeEvent; receivedAt: string; bytes: number }[] = [];
  private queuedBytes = 0;
  private sessions = new Set<string>();
  readonly metrics = { queueEventsPeak: 0, queueBytesPeak: 0 };
  failure: string | null = null;
  private readonly onMessage = (raw: string) => {
    if (this.failure) return;
    if (raw.length > this.limits.maxQueueBytes) { this.poison('native_message_limit'); return; }
    let value: unknown; try { value = JSON.parse(raw); } catch { this.poison('invalid_native_message'); return; }
    const data = asObject(value);
    if (typeof data.id === 'number') {
      const pending = this.pending; if (!pending || data.id !== pending.id) return;
      clearTimeout(pending.timer); this.pending = null;
      if (data.error) pending.reject(new NetworkError('cdp_command_failed')); else pending.resolve(asObject(data.result));
      return;
    }
    const method = data.method;
    if (typeof method !== 'string' || !['Network.', 'Page.', 'Target.detachedFromTarget'].some(p => method.startsWith(p))) return;
    if (typeof data.sessionId === 'string' && !this.sessions.has(data.sessionId)) return;
    if (!data.sessionId && data.method !== 'Target.detachedFromTarget') return;
    const bytes = Buffer.byteLength(raw);
    if (this.queue.length >= this.limits.maxQueueEvents || this.queuedBytes + bytes > this.limits.maxQueueBytes) { this.poison('event_queue_limit'); return; }
    const event: NativeEvent = { method, params: asObject(data.params), ...(typeof data.sessionId === 'string' ? { sessionId: data.sessionId } : {}) };
    this.queue.push({ event, receivedAt: new Date().toISOString(), bytes }); this.queuedBytes += bytes;
    this.metrics.queueEventsPeak = Math.max(this.metrics.queueEventsPeak, this.queue.length); this.metrics.queueBytesPeak = Math.max(this.metrics.queueBytesPeak, this.queuedBytes);
  };
  private readonly onError = (_message: string, code: string) => {
    const reason = /^EGO_[A-Z_]{1,80}$/.test(code) ? code : 'native_send_failed'; this.failure = reason;
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(new NetworkError(reason)); this.pending = null; }
  };
  constructor(readonly bridge: NativeBridge, private readonly limits: Limits) {}
  private poison(code: string) {
    this.failure = code;
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(new NetworkError(code)); this.pending = null; }
  }
  install() {
    if (!this.bridge || typeof this.bridge.useTaskSpace !== 'function' || typeof this.bridge.listTabs !== 'function' || typeof this.bridge.sendCDPMessage !== 'function') reject('native_capability_unavailable');
    if (this.bridge.onCDPMessage != null || this.bridge.onSendCDPMessageError != null) reject('callback_slots_occupied');
    this.bridge.onCDPMessage = this.onMessage; this.bridge.onSendCDPMessageError = this.onError;
    if (!this.ownsCallbacks()) reject('callback_identity_unverifiable');
  }
  ownsCallbacks() { return this.bridge.onCDPMessage === this.onMessage && this.bridge.onSendCDPMessageError === this.onError; }
  async send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<Record<string, unknown>> {
    if (this.pending) reject('concurrent_native_command');
    if (!this.ownsCallbacks()) reject('callback_ownership_changed');
    if (this.failure) reject(this.failure);
    if (sessionId ? !this.sessions.has(sessionId) || !['Network.enable', 'Network.disable', 'Network.getResponseBody', 'Network.getRequestPostData', 'Network.streamResourceContent', 'Page.getFrameTree', 'Page.enable', 'Page.disable'].includes(method) : !['Target.attachToTarget', 'Target.detachFromTarget'].includes(method)) reject('forbidden_native_command');
    if (method === 'Target.detachFromTarget' && (typeof params.sessionId !== 'string' || !this.sessions.has(params.sessionId))) reject('foreign_native_session');
    const id = ++this.id;
    const result = await new Promise<Record<string, unknown>>((resolve, rejectPending) => {
      const timer = setTimeout(() => { this.pending = null; this.failure = 'native_command_timeout'; rejectPending(new NetworkError('native_command_timeout')); }, this.limits.commandTimeoutMs);
      this.pending = { id, resolve, reject: rejectPending, timer };
      try { this.bridge.sendCDPMessage(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }
      catch { clearTimeout(timer); this.pending = null; this.failure = 'native_channel_unavailable'; rejectPending(new NetworkError('native_channel_unavailable')); }
    });
    if (method === 'Target.attachToTarget') { if (typeof result.sessionId !== 'string') reject('missing_native_session'); this.sessions.add(result.sessionId); }
    if (method === 'Target.detachFromTarget') this.sessions.delete(String(params.sessionId));
    return result;
  }
  take(max = 100) {
    const batch = this.queue.splice(0, max); this.queuedBytes -= batch.reduce((sum, item) => sum + item.bytes, 0); return batch;
  }
  get queued() { return this.queue.length; }
  discard() { const count = this.queue.length; this.queue = []; this.queuedBytes = 0; return count; }
  clear() {
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(new NetworkError('context_ending')); this.pending = null; }
    if (this.bridge.onCDPMessage === this.onMessage) this.bridge.onCDPMessage = undefined;
    if (this.bridge.onSendCDPMessageError === this.onError) this.bridge.onSendCDPMessageError = undefined;
    this.discard(); return this.bridge.onCDPMessage == null && this.bridge.onSendCDPMessageError == null;
  }
}
