/** CDP facts to scoped evidence. No retries, business requests, DOM execution or business decisions. */
import { asObject, codeOf, interfaceURL, reject, type BodyRef, type EventData, type NativeEvent, type PageScope, type Source } from './model.mjs';
import { CaptureStore } from './store.mjs';
import { processBinary, processSSE, processText, redactText, safeHeaders, safeURL } from './policy.mjs';
import { SSEUnits, sseDetails } from './stream.mjs';
import { hash } from '../core/common.mjs';

export interface Binding { source: Source; page: PageScope; mainFrameId: string }
export interface Reader { send(method: string, params: Record<string, unknown>, sessionId: string): Promise<Record<string, unknown>> }
interface RequestState {
  source: Source; rawId: string; key: string; hop: number; url: string; method: string; type: string; mime: string; done: boolean;
  stream: SSEUnits | null; streamStarted: boolean; streamFailed: boolean; sourceBytes: number; units: number; bodyState: BodyRef['state'];
  http: { decoder: InstanceType<typeof TextDecoder>; text: string; expectedBytes: number | null; lastHash: string; ref: BodyRef | null } | null;
  ssePendingBytes: number;
  streamSavedUnits: number; streamExcludedUnits: number;
  status: number | null;
  lastContentReadAt: string | null;
}
const textMIME = (mime: string) => /^(?:text\/|application\/(?:[\w.+-]*json|[\w.+-]*xml|javascript|x-www-form-urlencoded))/.test(mime.toLowerCase());
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
function base64(value: unknown): Buffer {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) reject('invalid_protocol_base64'); return Buffer.from(value, 'base64');
}
export class Recorder {
  private requests = new Map<string, RequestState>();
  private filtered = new Set<string>();
  private ordinal = 0;
  private bufferedContentBytes = 0;
  constructor(readonly store: CaptureStore, private readonly reader: Reader, private readonly guard: () => Promise<void>) {}
  private async emit(data: EventData) { await this.guard(); return this.store.event(data); }
  private identity(binding: Binding, id: string) { return binding.source.sessionId + '\0' + id; }
  private common(r: RequestState, at: string, params: Record<string, unknown>): Omit<EventData, 'kind'> {
    return { source: r.source, requestKey: r.key, requestId: r.rawId, redirectHop: r.hop, url: safeURL(r.url), path: new URL(safeURL(r.url)).pathname, method: r.method, receivedAt: at,
      ...(finite(params.timestamp) ? { protocolTime: { value: params.timestamp, clock: 'monotonic', unit: 'seconds' } } : {}),
      ...(r.status === null ? {} : { status: r.status }),
      ...(finite(params.wallTime) ? { wallTime: { value: params.wallTime, clock: 'unix', unit: 'seconds' } } : {}) };
  }
  private async content(text: string | Buffer, binary = false): Promise<BodyRef> {
    const limit = this.store.session.config.limits.maxBodyBytes, bytes = Buffer.isBuffer(text) ? text.length : Buffer.byteLength(text);
    if (bytes > limit) { await this.store.gap('body_limit', { sourceBytes: bytes }); return { state: 'truncated', reason: 'body_limit', sourceBytes: bytes }; }
    await this.guard(); return this.store.body(binary ? processBinary(Buffer.isBuffer(text) ? text : Buffer.from(text), this.store.session.config.policy) : processText(String(text), this.store.session.config.policy));
  }
  private async newRequest(binding: Binding, id: string, url: string, method: string, type: string) {
    const lookup = this.identity(binding, id), previous = this.requests.get(lookup);
    if (previous?.http) { this.bufferedContentBytes -= previous.sourceBytes; previous.http = null; }
    if (!this.requests.has(lookup) && this.requests.size >= this.store.session.config.limits.maxTrackedRequests) {
      const completed = [...this.requests].find(([, item]) => item.done); if (completed) this.requests.delete(completed[0]); else reject('request_tracking_limit');
    }
    const hop = previous ? previous.hop + 1 : 0;
    const key = this.store.session.captureId + ':' + hash(JSON.stringify([binding.source, id, hop, ++this.ordinal]));
    const r: RequestState = { source: { ...binding.source }, rawId: id, key, hop, url, method, type, mime: '', done: false, stream: null, streamStarted: false, streamFailed: false, sourceBytes: 0, units: 0, bodyState: 'not_collected', http: null, ssePendingBytes: 0, streamSavedUnits: 0, streamExcludedUnits: 0, status: null, lastContentReadAt: null };
    this.requests.set(lookup, r); this.store.peak('trackedRequestsPeak', this.requests.size); return r;
  }
  private async scopeGap(binding: Binding, reason: string) {
    this.store.count(reason); const key = binding.source.sessionId + reason;
    if (!this.filtered.has(key)) { this.filtered.add(key); await this.store.gap(reason, { page: binding.source.page }); }
  }
  async handle(binding: Binding, event: NativeEvent, receivedAt: string) {
    const p = event.params, id = typeof p.requestId === 'string' && p.requestId.length <= 256 ? p.requestId : null;
    if (event.method === 'Page.frameNavigated') {
      const frame = asObject(p.frame);
      if (!frame.parentId && typeof frame.id === 'string') {
        binding.mainFrameId = frame.id;
        await this.emit({ kind: 'navigation', source: binding.source, receivedAt, details: { url: typeof frame.url === 'string' ? safeURL(frame.url) : '[unavailable]' } });
      }
      return;
    }
    if (!id) return;
    const config = this.store.session.config, lookup = this.identity(binding, id);
    if (event.method === 'Network.requestWillBeSent' || event.method === 'Network.webSocketCreated') {
      const request = asObject(p.request), isWS = event.method === 'Network.webSocketCreated', rawURL = isWS ? p.url : request.url;
      const previous = this.requests.get(lookup);
      if (typeof rawURL === 'string' && rawURL.length > 16384) { this.requests.delete(lookup); await this.scopeGap(binding, 'url_metadata_limit'); return; }
      if (previous && p.redirectResponse) {
        const response = asObject(p.redirectResponse);
        await this.emit({ ...this.common(previous, receivedAt, p), kind: 'redirect', ...(typeof response.status === 'number' ? { status: response.status } : {}), details: { headers: safeHeaders(response.headers, config.policy), nextURL: typeof rawURL === 'string' ? safeURL(rawURL) : '[unavailable]' }, body: { state: 'not_collected', reason: 'redirect_intermediate_body' } });
        previous.done = true;
        if (previous.http) { this.bufferedContentBytes -= previous.sourceBytes; previous.http = null; }
      }
      // A redirect outside scope invalidates the old association before any later body read.
      if (typeof rawURL !== 'string' || !interfaceURL(rawURL, config)) { this.requests.delete(lookup); await this.scopeGap(binding, 'interface_scope_filtered'); return; }
      if (typeof p.frameId === 'string' && p.frameId !== binding.mainFrameId) { this.requests.delete(lookup); await this.scopeGap(binding, 'subframe_filtered'); return; }
      const method = isWS ? 'GET' : typeof request.method === 'string' && /^[A-Z]{1,20}$/.test(request.method) ? request.method : 'UNKNOWN';
      const r = await this.newRequest(binding, id, rawURL, method, isWS ? 'WebSocket' : String(p.type ?? 'Unknown'));
      this.store.count(isWS ? 'wsConnections' : 'httpRequests');
      const headers = safeHeaders(request.headers, config.policy);
      let body: BodyRef = { state: 'not_collected', reason: 'post_data_not_reported' };
      const requestMIME = Object.entries(asObject(request.headers)).find(([k]) => k.toLowerCase() === 'content-type')?.[1];
      if (config.policy.bodies === 'omit') body = { state: 'excluded', reason: 'content_policy' };
      else if (typeof requestMIME === 'string' && !textMIME(requestMIME)) body = { state: 'excluded', reason: 'http_binary_or_upload_metadata_only' };
      else if (typeof request.postData === 'string') { r.lastContentReadAt = receivedAt; body = await this.content(request.postData); }
      else if (request.hasPostData === true && !isWS) {
        try { const data = await this.reader.send('Network.getRequestPostData', { requestId: id }, r.source.sessionId); r.lastContentReadAt = new Date().toISOString(); if (typeof data.postData === 'string') body = await this.content(data.postData); else body = { state: 'failed', reason: 'request_body_unavailable' }; }
        catch (error) { if (codeOf(error) !== 'cdp_command_failed') throw error; body = { state: 'failed', reason: 'request_body_unavailable' }; await this.store.gap('request_body_unavailable', { requestKey: r.key }); }
      }
      await this.emit({ ...this.common(r, receivedAt, p), kind: isWS ? 'ws-open' : 'request', details: { resourceType: r.type, headers, frameId: typeof p.frameId === 'string' ? p.frameId : null, loaderId: typeof p.loaderId === 'string' ? p.loaderId : null, initiatorType: typeof asObject(p.initiator).type === 'string' ? asObject(p.initiator).type : null, bodyReadAt: r.lastContentReadAt }, ...(isWS ? {} : { body }) });
      return;
    }
    const r = this.requests.get(lookup);
    const relevant = ['Network.responseReceived', 'Network.loadingFailed', 'Network.loadingFinished', 'Network.webSocketFrameSent', 'Network.webSocketFrameReceived', 'Network.webSocketClosed', 'Network.webSocketFrameError', 'Network.webSocketHandshakeResponseReceived'];
    if (!r) {
      if (relevant.includes(event.method)) { this.store.count('orphanEvents'); await this.emit({ kind: 'orphan', source: binding.source, requestId: id, receivedAt, details: { method: event.method, association: 'unavailable_no_body_read' } }); }
      return;
    }
    const common = this.common(r, receivedAt, p);
    if (event.method === 'Network.responseReceived') {
      const response = asObject(p.response);
      r.lastContentReadAt = null;
      if (typeof response.url === 'string' && response.url !== r.url) { await this.store.gap('response_url_association_mismatch', { requestKey: r.key }); this.requests.delete(lookup); return; }
      r.mime = typeof response.mimeType === 'string' ? response.mimeType.toLowerCase() : '';
      if (typeof response.status === 'number' && Number.isFinite(response.status)) r.status = response.status;
      r.bodyState = config.policy.bodies === 'omit' ? 'excluded' : textMIME(r.mime) ? 'in_progress' : 'excluded';
      if (r.bodyState === 'in_progress' && r.mime !== 'text/event-stream') {
        const headers = asObject(response.headers), length = Object.entries(headers).find(([k]) => k.toLowerCase() === 'content-length')?.[1], encoding = Object.entries(headers).find(([k]) => k.toLowerCase() === 'content-encoding')?.[1];
        r.http = { decoder: new TextDecoder('utf8', { fatal: true }), text: '', expectedBytes: !encoding && typeof length === 'string' && /^\d+$/.test(length) && Number.isSafeInteger(Number(length)) ? Number(length) : null, lastHash: '', ref: null };
      }
      await this.emit({ ...common, kind: 'response', ...(typeof response.status === 'number' ? { status: response.status } : {}), details: { headers: safeHeaders(response.headers, config.policy), mimeType: r.mime, fromDiskCache: response.fromDiskCache === true, fromServiceWorker: response.fromServiceWorker === true }, body: { state: r.bodyState, ...(r.bodyState === 'excluded' ? { reason: config.policy.bodies === 'omit' ? 'content_policy' : 'http_binary_metadata_only' } : {}) } });
    } else if (event.method === 'Network.dataReceived' && (r.mime === 'text/event-stream' || r.http) && r.bodyState !== 'excluded' && !r.streamFailed) {
      if (!r.streamStarted) {
        r.streamStarted = true; if (r.mime === 'text/event-stream') r.stream = new SSEUnits(config.limits.maxBodyBytes);
        try {
          const initial = await this.reader.send('Network.streamResourceContent', { requestId: id }, r.source.sessionId);
          r.lastContentReadAt = new Date().toISOString();
          const prefix = base64(initial.bufferedData); this.store.count(r.mime === 'text/event-stream' ? 'ssePrefixBytes' : 'httpPrefixBytes', prefix.length);
          await this.emit({ ...common, kind: 'stream-start', details: { prefixBytes: prefix.length, bodyReadAt: r.lastContentReadAt, bodyReadSource: 'native_reply' }, body: { state: 'in_progress' } });
          if (r.mime === 'text/event-stream') await this.streamBytes(r, prefix, receivedAt, p); else await this.httpBytes(r, prefix, receivedAt, p);
        } catch (error) { if (codeOf(error) !== 'cdp_command_failed') throw error; r.streamFailed = true; if (r.mime === 'text/event-stream') r.bodyState = 'failed'; await this.store.gap(r.mime === 'text/event-stream' ? 'sse_stream_unavailable' : 'http_live_stream_unavailable', { requestKey: r.key }); }
      } else if (typeof p.data === 'string') {
        r.lastContentReadAt = receivedAt;
        if (r.mime === 'text/event-stream') await this.streamBytes(r, base64(p.data), receivedAt, p); else await this.httpBytes(r, base64(p.data), receivedAt, p);
      }
    } else if (event.method === 'Network.loadingFinished' || event.method === 'Network.loadingFailed') {
      const failed = event.method === 'Network.loadingFailed';
      if (!failed && r.mime === 'text/event-stream' && !r.streamStarted && r.bodyState !== 'excluded') {
        r.stream = new SSEUnits(config.limits.maxBodyBytes); r.streamStarted = true;
        try {
          const full = await this.reader.send('Network.getResponseBody', { requestId: id }, r.source.sessionId);
          r.lastContentReadAt = new Date().toISOString();
          if (typeof full.body !== 'string') reject('invalid_body_reply');
          await this.streamBytes(r, full.base64Encoded === true ? base64(full.body) : Buffer.from(full.body), receivedAt, p);
        } catch (error) { if (codeOf(error) !== 'cdp_command_failed') throw error; r.streamFailed = true; r.bodyState = 'failed'; await this.store.gap('response_body_unavailable', { requestKey: r.key }); }
      }
      if (r.stream && !r.streamFailed) {
        try { await this.saveUnits(r, r.stream.push(new Uint8Array(), true), receivedAt, p); r.bodyState = failed ? 'failed' : !r.sourceBytes ? 'empty' : r.streamSavedUnits ? 'saved' : r.streamExcludedUnits ? 'excluded' : 'not_collected'; }
        catch (error) { r.bodyState = 'truncated'; await this.store.gap(codeOf(error), { requestKey: r.key }); }
      }
      if (!failed && r.mime !== 'text/event-stream' && r.bodyState === 'in_progress') {
        let body: BodyRef;
        try {
          if (r.http && r.streamStarted && !r.streamFailed) {
            try { r.http.text += r.http.decoder.decode(); } catch { reject('invalid_response_utf8'); }
            body = r.http.ref && hash(r.http.text) === r.http.lastHash ? { ...r.http.ref, state: r.http.ref.bytes ? 'saved' : 'empty' } : await this.content(r.http.text);
          } else {
            const reply = await this.reader.send('Network.getResponseBody', { requestId: id }, r.source.sessionId);
            r.lastContentReadAt = new Date().toISOString();
            if (typeof reply.body !== 'string') reject('invalid_body_reply');
            const bytes = reply.base64Encoded === true ? base64(reply.body) : Buffer.from(reply.body);
            let text: string; try { text = new TextDecoder('utf8', { fatal: true }).decode(bytes); } catch { reject('invalid_response_utf8'); }
            body = await this.content(text);
          }
        } catch (error) { if (!['cdp_command_failed', 'invalid_response_utf8'].includes(codeOf(error))) throw error; body = { state: 'failed', reason: codeOf(error) }; await this.store.gap(codeOf(error), { requestKey: r.key }); }
        r.bodyState = body.state; await this.emit({ ...common, kind: 'response-body', body, details: { bodyReadAt: r.lastContentReadAt, responseEndObserved: true } });
      }
      r.done = true;
      if (r.http) { this.bufferedContentBytes -= r.sourceBytes; r.http = null; }
      this.bufferedContentBytes -= r.ssePendingBytes; r.ssePendingBytes = 0; r.stream = null;
      await this.emit({ ...common, kind: failed ? 'network-error' : 'request-end', details: { ...(failed ? { errorText: redactText(typeof p.errorText === 'string' ? p.errorText.slice(0, 4096) : '[unavailable]'), canceled: p.canceled === true } : {}), encodedDataLength: finite(p.encodedDataLength) ? p.encodedDataLength : null, streamUnits: r.units, streamSavedUnits: r.streamSavedUnits, streamExcludedUnits: r.streamExcludedUnits, streamSourceBytes: r.sourceBytes }, body: { state: failed ? 'failed' : r.bodyState, ...(failed ? { reason: 'network_loading_failed' } : {}) } });
    } else if (event.method === 'Network.webSocketHandshakeResponseReceived') {
      const response = asObject(p.response); if (typeof response.status === 'number') r.status = response.status;
      await this.emit({ ...common, kind: 'ws-handshake', ...(typeof response.status === 'number' ? { status: response.status } : {}), details: { headers: safeHeaders(response.headers, config.policy) } });
    } else if (event.method === 'Network.webSocketFrameSent' || event.method === 'Network.webSocketFrameReceived') {
      const frame = asObject(p.response), opcode = typeof frame.opcode === 'number' ? frame.opcode : -1, data = typeof frame.payloadData === 'string' ? frame.payloadData : '';
      const direction = event.method === 'Network.webSocketFrameSent' ? 'sent' : 'received';
      let body: BodyRef = { state: 'not_collected', reason: 'control_frame' };
      if (opcode === 1) body = await this.content(data); else if (opcode === 2) body = await this.content(base64(data), true);
      const details: Record<string, unknown> = { opcode, masked: frame.mask === true, messageSemantics: 'browser_reassembled_message' };
      if (opcode === 8) { const bytes = base64(data); if (bytes.length >= 2) { details.closeCode = bytes.readUInt16BE(); details.closeReason = redactText(bytes.subarray(2).toString('utf8')); } }
      details.bodyReadAt = receivedAt; details.bodyReadSource = 'event_payload';
      await this.emit({ ...common, kind: opcode === 1 || opcode === 2 ? 'ws-message' : 'ws-control', direction, details, body });
    } else if (event.method === 'Network.webSocketFrameError') {
      await this.emit({ ...common, kind: 'ws-error', details: { errorText: redactText(typeof p.errorMessage === 'string' ? p.errorMessage.slice(0, 4096) : '[unavailable]') } });
    } else if (event.method === 'Network.webSocketClosed') {
      r.done = true; await this.emit({ ...common, kind: 'ws-close', details: { closeCode: null, reason: 'CDP_closed_event_does_not_supply_code' } });
    }
  }
  private async httpBytes(r: RequestState, bytes: Buffer, receivedAt: string, p: Record<string, unknown>) {
    const http = r.http; if (!http || r.streamFailed) return;
    r.sourceBytes += bytes.length; this.bufferedContentBytes += bytes.length;
    this.store.peak('pendingContentBytesPeak', this.bufferedContentBytes);
    if (r.sourceBytes > this.store.session.config.limits.maxBodyBytes) { r.streamFailed = true; r.bodyState = 'truncated'; this.bufferedContentBytes -= r.sourceBytes; r.http = null; await this.store.gap('http_body_limit', { requestKey: r.key, sourceBytes: r.sourceBytes }); return; }
    if (this.bufferedContentBytes > this.store.session.config.limits.maxQueueBytes) reject('content_buffer_limit');
    try { http.text += http.decoder.decode(bytes, { stream: true }); } catch { r.streamFailed = true; r.bodyState = 'failed'; await this.store.gap('invalid_response_utf8', { requestKey: r.key }); return; }
    let completeJSON = false; if (/json/.test(r.mime)) { try { JSON.parse(http.text); completeJSON = true; } catch {} }
    // A complete JSON value or an exact unencoded Content-Length is a safe content
    // unit. It is still explicitly in_progress until an actual loadingFinished.
    if (!completeJSON && (http.expectedBytes === null || http.expectedBytes !== r.sourceBytes)) return;
    const digest = hash(http.text); if (digest === http.lastHash) return;
    await this.guard(); const body = await this.store.body(processText(http.text, this.store.session.config.policy));
    http.lastHash = digest; http.ref = body;
    await this.emit({ ...this.common(r, receivedAt, p), kind: 'response-body', body: body.file ? { ...body, state: 'in_progress', reason: 'response_end_not_observed' } : body,
      details: { contentUnit: completeJSON ? 'complete_json_value' : 'unencoded_content_length', responseEndObserved: false, sourceBytes: r.sourceBytes, bodyReadAt: r.lastContentReadAt } });
  }
  private async streamBytes(r: RequestState, bytes: Buffer, receivedAt: string, p: Record<string, unknown>) {
    if (r.streamFailed || !r.stream) return;
    r.sourceBytes += bytes.length;
    if (r.sourceBytes > this.store.session.config.limits.maxBodyBytes) { r.streamFailed = true; r.bodyState = 'truncated'; this.bufferedContentBytes -= r.ssePendingBytes; r.ssePendingBytes = 0; r.stream = null; await this.store.gap('stream_body_limit', { requestKey: r.key, sourceBytes: r.sourceBytes }); return; }
    let units: string[];
    try { units = r.stream.push(bytes); } catch (error) { r.streamFailed = true; r.bodyState = 'truncated'; this.bufferedContentBytes -= r.ssePendingBytes; r.ssePendingBytes = 0; r.stream = null; await this.store.gap(codeOf(error), { requestKey: r.key }); return; }
    this.bufferedContentBytes += r.stream.pendingBytes - r.ssePendingBytes; r.ssePendingBytes = r.stream.pendingBytes;
    this.store.peak('pendingContentBytesPeak', this.bufferedContentBytes);
    if (this.bufferedContentBytes > this.store.session.config.limits.maxQueueBytes) reject('content_buffer_limit');
    await this.saveUnits(r, units, receivedAt, p);
  }
  private async saveUnits(r: RequestState, units: string[], receivedAt: string, p: Record<string, unknown>) {
    for (const unit of units) {
      await this.guard(); const processed = processSSE(unit, this.store.session.config.policy), body = await this.store.body(processed);
      if (body.file) r.streamSavedUnits++; else if (body.state === 'excluded') r.streamExcludedUnits++;
      const parsed = processed ? sseDetails(processed.data) : null;
      await this.emit({ ...this.common(r, receivedAt, p), kind: 'sse-unit', details: { index: ++r.units, event: parsed ? redactText(parsed.event) : null, id: parsed?.id === undefined ? null : redactText(parsed.id), retry: parsed?.retry ?? null, dispatched: parsed?.dispatched ?? null, bodyReadAt: r.lastContentReadAt }, body });
    }
  }
  async interrupted(reason: string, source?: Source) {
    for (const r of this.requests.values()) if (!r.done && (!source || source.sessionId === r.source.sessionId)) {
      await this.store.gap('request_interrupted', { requestKey: r.key, reason }); r.done = true;
      if (r.http) { this.bufferedContentBytes -= r.sourceBytes; r.http = null; }
      this.bufferedContentBytes -= r.ssePendingBytes; r.ssePendingBytes = 0; r.stream = null;
    }
  }
}
