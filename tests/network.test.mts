import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fixture, writeJSON } from './goals-fixture.mjs';
import { now, hash } from '../src/core/common.mjs';
import { TOOL_VERSION, TOOL_REVISION } from '../src/contracts/layout.mjs';
import { parseConfig, interfaceURL, defaultLimits, NetworkError, limitations, type NativeBridge, type NativeEvent, type NativeTab, type Session } from '../src/observation/model.mjs';
import { processBinary, processSSE, processText, safeURL, safeHeaders, redactText } from '../src/observation/policy.mjs';
import { SSEUnits, sseDetails } from '../src/observation/stream.mjs';
import { CaptureStore, readBody, committedRows, networkRoot, readCapture } from '../src/observation/store.mjs';
import { Recorder, type Binding, type Reader } from '../src/observation/recorder.mjs';
import { NativeChannel } from '../src/observation/native.mjs';
import { collect } from '../src/observation/collector.mjs';
import { queryNetwork } from '../src/observation/query.mjs';
import { startNetwork, captureStatus, stopNetwork } from '../src/observation/commands.mjs';
import { streamText, wsBinary } from '../tools/network-fixture.mjs';

const origin = 'http://127.0.0.1:51709';
const configOf = (overrides: Record<string, unknown> = {}) => ({ networkVersion: 1, spaceId: 8, pages: [{ label: 'p1', targetId: 'target-1', origins: [origin] }], interfaces: [{ origin, pathPrefixes: ['/api', '/events', '/socket'] }], ...overrides });
const binding = (sessionId = 's1', generation = 1): Binding => ({ source: { page: 'p1', targetId: 'target-1', sessionId, generation }, page: { label: 'p1', targetId: 'target-1', origins: [origin] }, mainFrameId: 'main' });
const e = (method: string, params: Record<string, unknown>): NativeEvent => ({ method, params });
const req = (id: string, url = origin + '/api/save', data?: string) => e('Network.requestWillBeSent', { requestId: id, frameId: 'main', type: 'Fetch', timestamp: 1, wallTime: 1793000000, request: { url, method: 'POST', headers: { 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { postData: data }) } });
const res = (id: string, url = origin + '/api/save', mime = 'application/json', status = 200) => e('Network.responseReceived', { requestId: id, timestamp: 2, response: { url, mimeType: mime, status, headers: { 'Content-Type': mime } } });
const end = (id: string) => e('Network.loadingFinished', { requestId: id, timestamp: 3 });
async function setup(t: TestContext, overrides: Record<string, unknown> = {}) {
  const f = await fixture(t), { root, runId } = await networkRoot(f.runDir, true), captureId = 'cap-test', dir = path.join(root, 'captures', captureId);
  const config = parseConfig(configOf(overrides));
  const session: Session = { networkVersion: 1, captureId, runId, createdAt: now(), priorCaptureBytes: 0, config, toolVersion: TOOL_VERSION, toolRevision: TOOL_REVISION, limitations };
  return { ...f, dir, config, store: await CaptureStore.create(dir, session) };
}
async function rows(store: CaptureStore) { const result = []; for await (const row of committedRows(store.dir, store.runtime)) result.push(row.event); return result; }
function reader(replies: Record<string, unknown> = { body: '{"ok":true}' }): Reader & { calls: { method: string; params: Record<string, unknown>; sessionId: string }[] } {
  const calls: { method: string; params: Record<string, unknown>; sessionId: string }[] = [];
  return { calls, async send(method, params, sessionId) { calls.push({ method, params, sessionId }); if (replies.error) throw new NetworkError('cdp_command_failed'); return replies; } };
}
async function eventually(predicate: () => Promise<boolean>, timeout = 2500) {
  const end = Date.now() + timeout; while (Date.now() < end) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); } assert.fail('timed out waiting for synthetic condition');
}
class FakeNative implements NativeBridge {
  onCDPMessage: NativeBridge['onCDPMessage']; onSendCDPMessageError: NativeBridge['onSendCDPMessageError'];
  calls: { id: number; method: string; params: Record<string, unknown>; sessionId?: string }[] = [];
  tabs: NativeTab[] = [{ targetId: 'target-1', url: origin + '/' }]; controlError: string | null = null; nextSession = 0; selected: number | null = null;
  useTaskSpace(id: number) { this.selected = id; }
  async listTabs() { return this.controlError ? { error: 'synthetic reason', error_code: this.controlError } : { tabs: this.tabs }; }
  sendCDPMessage(raw: string) {
    const call = JSON.parse(raw) as typeof this.calls[number]; this.calls.push(call);
    const result = call.method === 'Target.attachToTarget' ? { sessionId: 's' + (++this.nextSession) } : call.method === 'Page.getFrameTree' ? { frameTree: { frame: { id: 'main' } } } : call.method === 'Network.getResponseBody' ? { body: '{"ok":true}', base64Encoded: false } : {};
    queueMicrotask(() => this.onCDPMessage?.(JSON.stringify({ id: call.id, result })));
  }
  event(method: string, params: Record<string, unknown>, sessionId = 's1') { this.onCDPMessage?.(JSON.stringify({ method, params, sessionId })); }
}

test('network scope is exact, cross-origin is explicit, path boundaries and input keys are enforced', () => {
  const c = parseConfig(configOf());
  assert.ok(interfaceURL(origin + '/api/save', c)); assert.ok(interfaceURL(origin.replace('http:', 'ws:') + '/socket', c));
  for (const url of [origin + '/api2', 'http://other.invalid/api', origin + '/outside']) assert.equal(interfaceURL(url, c), null);
  for (const extra of [{ networkVersion: 5 }, { spaceId: -1 }, { pages: [] }, { mystery: true }, { interfaces: [{ origin: origin + '/', pathPrefixes: ['/'] }] }, { policy: { headers: ['authorization'] } }, { policy: { jsonFields: ['nested.token'] } }, { limits: { pollMs: 0 } }]) assert.throws(() => parseConfig(configOf(extra)));
  assert.equal(parseConfig(configOf({ policy: { bodies: 'omit', wsBinary: 'omit' } })).policy.bodies, 'omit');
});
test('one content policy filters JSON, free text, URL parameters, selected headers and text-bearing binary', () => {
  const policy = parseConfig(configOf()).policy;
  const secret = 'synthetic-private-value', text = JSON.stringify({ ok: true, nested: { accessToken: secret, password: secret }, note: 'Bearer ' + secret });
  assert.doesNotMatch(processText(text, policy)!.data, new RegExp(secret));
  const url = safeURL(origin + '/api?q=ok&q=also&token=' + secret + '#secret'); assert.doesNotMatch(url, new RegExp(secret)); assert.equal(new URL(url).searchParams.getAll('q').length, 2);
  assert.deepEqual(safeHeaders({ Authorization: secret, Cookie: secret, 'Content-Type': 'application/json' }, policy), { 'content-type': 'application/json' });
  assert.doesNotMatch(Buffer.from(processBinary(Buffer.from('password=' + secret), policy)!.data, 'base64').toString(), new RegExp(secret));
  assert.deepEqual(Buffer.from(processBinary(wsBinary, policy)!.data, 'base64'), wsBinary);
  const selected = { ...policy, jsonFields: ['result.value'] };
  assert.equal(processText('{"result":{"value":7,"token":"hidden"},"other":8}', selected)?.data, '{"result.value":7}');
  assert.equal(processText('not JSON', selected), null); assert.equal(processBinary(wsBinary, selected), null); assert.equal(processText('anything', { ...policy, bodies: 'omit' }), null);
  assert.doesNotMatch(redactText('password="two private words" token=synthetic'), /private|synthetic/);
});
test('SSE decoding survives every byte boundary, CRLF, multiline data and comments without duplication', () => {
  const bytes = Buffer.from(streamText);
  for (let split = 1; split < bytes.length; split++) {
    const parser = new SSEUnits(4096), units = [...parser.push(bytes.subarray(0, split)), ...parser.push(bytes.subarray(split)), ...parser.push(new Uint8Array(), true)];
    assert.equal(units.join(''), streamText); assert.equal(units.length, 3);
    assert.equal(sseDetails(units[0]!).data, '你好，合成流\n第二行'); assert.equal(sseDetails(units[0]!).id, 'one'); assert.equal(sseDetails(units[1]!).dispatched, false);
  }
  const parser = new SSEUnits(4096), result: string[] = []; for (const byte of bytes) result.push(...parser.push(Buffer.from([byte]))); assert.equal(result.join(''), streamText);
});
test('stream secrets split across chunks are handled only after a safe complete unit; unsafe incomplete units never persist', () => {
  const parser = new SSEUnits(4096), a = parser.push(Buffer.from('data: {"to')); assert.deepEqual(a, []);
  const b = parser.push(Buffer.from('ken":"synthetic-never-retain"}\n\n')); assert.equal(b.length, 1);
  const processed = processSSE(b[0]!, parseConfig(configOf()).policy); assert.doesNotMatch(processed!.data, /synthetic-never-retain/); assert.equal(processed!.transformed, true);
  const unfinished = new SSEUnits(4096); unfinished.push(Buffer.from('data: token=part')); assert.throws(() => unfinished.push(new Uint8Array(), true), /incomplete_stream_unit/);
  assert.throws(() => new SSEUnits(8).push(Buffer.from('x'.repeat(9))), /stream_unit_limit/);
  assert.throws(() => new SSEUnits(128).push(Buffer.from([255])), /invalid_stream_utf8/);
});
test('HTTP request and response bodies retain true request identity, status and independent clock types', async t => {
  const f = await setup(t), r = reader({ body: '{"ok":false,"token":"never-retain"}' }), recorder = new Recorder(f.store, r, async () => {}), b = binding();
  await recorder.handle(b, req('one', origin + '/api/save?token=never-retain', '{"title":"合成","password":"never-retain"}'), now());
  await recorder.handle(b, res('one', origin + '/api/save?token=never-retain'), now()); await recorder.handle(b, end('one'), now());
  const events = await rows(f.store); assert.deepEqual(events.map(e => e.kind), ['request', 'response', 'response-body', 'request-end']);
  assert.equal(new Set(events.map(e => e.requestKey)).size, 1); assert.equal(events[0]?.wallTime?.clock, 'unix'); assert.equal(events[2]?.protocolTime?.clock, 'monotonic');
  const q = await queryNetwork({ runDir: f.runDir, request: { networkVersion: 1, includeBodies: true } });
  assert.doesNotMatch(JSON.stringify(q), /never-retain/); assert.equal((q.events[2]?.bodyPreview as { data: string }).data, '{"ok":false,"token":"[REDACTED]"}');
  assert.equal(r.calls[0]?.sessionId, 's1'); assert.equal(q.scan.complete, true);
  const byStatus = await queryNetwork({ runDir: f.runDir, request: { networkVersion: 1, status: 200, includeBodies: true } }); assert.ok(byStatus.events.some(e => e.kind === 'response-body' && e.bodyPreview));
});
test('repeated URLs, sessions and redirects stay distinct; redirect outside scope cannot read a body', async t => {
  const f = await setup(t), r = reader(), recorder = new Recorder(f.store, r, async () => {}), a = binding(), b = binding('s2');
  await recorder.handle(a, req('same'), now()); await recorder.handle(b, req('same'), now());
  await recorder.handle(a, { ...req('same', origin + '/api/final'), params: { ...req('same', origin + '/api/final').params, redirectResponse: { status: 302, headers: {} } } }, now());
  await recorder.handle(a, res('same', origin + '/api/final'), now()); await recorder.handle(a, end('same'), now());
  await recorder.handle(b, { ...req('same', 'http://excluded.invalid/api'), params: { ...req('same', 'http://excluded.invalid/api').params, redirectResponse: { status: 302 } } }, now());
  await recorder.handle(b, end('same'), now());
  const events = await rows(f.store), requests = events.filter(e => e.kind === 'request'); assert.equal(new Set(requests.map(e => e.requestKey)).size, 3); assert.equal(requests[2]?.redirectHop, 1);
  assert.equal(r.calls.length, 1); assert.equal(r.calls[0]?.sessionId, 's1'); assert.equal(events.at(-1)?.kind, 'orphan');
  assert.equal(f.store.runtime.gaps, 1);
});
test('SSE is queryable while open, includes a nonempty prefix and preserves exact safe bytes across increments', async t => {
  const f = await setup(t), bytes = Buffer.from(streamText), prefix = bytes.subarray(0, 39), r = reader({ bufferedData: prefix.toString('base64') }), recorder = new Recorder(f.store, r, async () => {}), b = binding();
  await recorder.handle(b, req('stream', origin + '/events'), now()); await recorder.handle(b, res('stream', origin + '/events', 'text/event-stream'), now());
  await recorder.handle(b, e('Network.dataReceived', { requestId: 'stream', dataLength: prefix.length }), now());
  for (const part of [bytes.subarray(39, 42), bytes.subarray(42, 69), bytes.subarray(69)]) await recorder.handle(b, e('Network.dataReceived', { requestId: 'stream', data: part.toString('base64') }), now());
  const q = await queryNetwork({ runDir: f.runDir, request: { networkVersion: 1, kind: 'sse-unit', includeBodies: true } });
  assert.equal(q.returned, 3); assert.equal(q.events.map(e => (e.bodyPreview as { data: string }).data).join(''), streamText);
  assert.equal(r.calls.length, 1); assert.equal(f.store.runtime.counters.ssePrefixBytes, prefix.length);
  await recorder.handle(b, end('stream'), now()); assert.equal((await rows(f.store)).at(-1)?.body?.state, 'saved');
});
test('unconsumed HTTP JSON is available from a safe live unit without fabricating loadingFinished', async t => {
  const f = await setup(t), raw = '{"state":"pending","token":"synthetic-private"}', r = reader({ bufferedData: Buffer.from(raw).toString('base64') }), recorder = new Recorder(f.store, r, async () => {}), b = binding();
  await recorder.handle(b, req('live'), now()); await recorder.handle(b, res('live'), now());
  await recorder.handle(b, e('Network.dataReceived', { requestId: 'live', dataLength: Buffer.byteLength(raw) }), now());
  const live = (await rows(f.store)).at(-1)!; assert.equal(live.kind, 'response-body'); assert.equal(live.body?.state, 'in_progress'); assert.equal(live.details?.responseEndObserved, false);
  assert.doesNotMatch((await readBody(f.dir, live.body!, f.config.limits.maxBodyBytes)).data, /synthetic-private/);
  const count = (await fs.readdir(path.join(f.dir, 'bodies'))).length;
  await recorder.handle(b, end('live'), now()); const final = (await rows(f.store)).filter(e => e.kind === 'response-body').at(-1)!; assert.equal(final.body?.state, 'saved'); assert.equal(final.body?.sha256, live.body?.sha256); assert.equal((await fs.readdir(path.join(f.dir, 'bodies'))).length, count);
});
test('plain HTTP live content waits for its full unencoded length and applies the policy across all chunks', async t => {
  const f = await setup(t), raw = 'message password=synthetic-private', split = 13, r = reader({ bufferedData: Buffer.from(raw.slice(0, split)).toString('base64') }), recorder = new Recorder(f.store, r, async () => {}), b = binding();
  await recorder.handle(b, req('plain'), now()); const response = res('plain', origin + '/api/save', 'text/plain'); (response.params.response as Record<string, unknown>).headers = { 'Content-Length': String(Buffer.byteLength(raw)) };
  await recorder.handle(b, response, now()); await recorder.handle(b, e('Network.dataReceived', { requestId: 'plain' }), now()); assert.equal((await rows(f.store)).some(e => e.kind === 'response-body'), false);
  await recorder.handle(b, e('Network.dataReceived', { requestId: 'plain', data: Buffer.from(raw.slice(split)).toString('base64') }), now());
  const last = (await rows(f.store)).at(-1)!; assert.equal(last.kind, 'response-body'); assert.doesNotMatch((await readBody(f.dir, last.body!, f.config.limits.maxBodyBytes)).data, /synthetic-private/); assert.equal(last.body?.state, 'in_progress');
});
test('WebSocket text/binary, directions, browser reassembly and error/close facts remain explicit', async t => {
  const f = await setup(t), recorder = new Recorder(f.store, reader(), async () => {}), b = binding();
  await recorder.handle(b, e('Network.webSocketCreated', { requestId: 'ws', url: origin.replace('http:', 'ws:') + '/socket' }), now());
  for (const [method, opcode, payloadData] of [['Network.webSocketFrameSent', 1, 'client 你好'], ['Network.webSocketFrameReceived', 1, 'fragmented 消息'], ['Network.webSocketFrameReceived', 2, wsBinary.toString('base64')]] as const) await recorder.handle(b, e(method, { requestId: 'ws', response: { opcode, payloadData } }), now());
  await recorder.handle(b, e('Network.webSocketFrameError', { requestId: 'ws', errorMessage: 'token=synthetic-private' }), now());
  await recorder.handle(b, e('Network.webSocketClosed', { requestId: 'ws' }), now());
  const events = await rows(f.store); assert.equal(events[1]?.direction, 'sent'); assert.equal(events[2]?.direction, 'received');
  const content = await readBody(f.dir, events[3]!.body!, f.config.limits.maxBodyBytes); assert.deepEqual(Buffer.from(content.data, 'base64'), wsBinary);
  assert.equal(events.at(-1)?.details?.closeCode, null); assert.doesNotMatch(JSON.stringify(events), /synthetic-private/);
});
test('binary HTTP/upload bodies are metadata-only, missing text body replies become observable gaps', async t => {
  const f = await setup(t), r = reader({ error: true }), recorder = new Recorder(f.store, r, async () => {}), b = binding();
  await recorder.handle(b, req('binary'), now()); await recorder.handle(b, res('binary', origin + '/api/save', 'application/octet-stream'), now()); await recorder.handle(b, end('binary'), now()); assert.equal(r.calls.length, 0);
  const upload = req('upload', origin + '/api/upload', 'synthetic file'); (upload.params.request as Record<string, unknown>).headers = { 'Content-Type': 'multipart/form-data' };
  await recorder.handle(b, upload, now()); assert.equal((await rows(f.store)).at(-1)?.body?.state, 'excluded');
  await recorder.handle(b, req('text', origin + '/api/save', '{"safe":true}'), now()); await recorder.handle(b, res('text'), now()); await recorder.handle(b, end('text'), now());
  assert.equal(r.calls.length, 1); assert.equal(f.store.runtime.gaps, 1); assert.equal((await rows(f.store)).find(e => e.kind === 'response-body')?.body?.state, 'failed'); assert.equal((await rows(f.store)).find(e => e.kind === 'response-body')?.details?.bodyReadAt, null);
});
test('ordinary top-level navigation refreshes frame binding, independent subframe traffic is excluded', async t => {
  const f = await setup(t), recorder = new Recorder(f.store, reader(), async () => {}), b = binding();
  await recorder.handle(b, e('Page.frameNavigated', { frame: { id: 'main-new', url: origin + '/next' } }), now());
  await recorder.handle(b, req('old-frame'), now()); const current = req('new-frame'); current.params.frameId = 'main-new'; await recorder.handle(b, current, now());
  assert.deepEqual((await rows(f.store)).map(e => e.kind), ['navigation', 'request']); assert.equal(f.store.runtime.counters.subframe_filtered, 1);
});
test('a denied control guard prevents pending body or event content from reaching disk', async t => {
  const f = await setup(t), recorder = new Recorder(f.store, reader(), async () => { throw new NetworkError('EGO_TASK_SPACE_USER_IN_CONTROL'); });
  await assert.rejects(recorder.handle(binding(), req('one', origin + '/api/save', '{"title":"not allowed"}'), now()), /EGO_TASK_SPACE_USER_IN_CONTROL/);
  assert.equal(f.store.runtime.committedSeq, 0); assert.deepEqual(await fs.readdir(path.join(f.dir, 'bodies')), []);
});
test('native callback ownership is exclusive and cleanup preserves a replacement owner', () => {
  const fake = new FakeNative(), occupied = () => {}; fake.onCDPMessage = occupied;
  assert.throws(() => new NativeChannel(fake, defaultLimits).install(), /callback_slots_occupied/); assert.equal(fake.onCDPMessage, occupied);
  fake.onCDPMessage = undefined; const channel = new NativeChannel(fake, defaultLimits); channel.install(); fake.onCDPMessage = occupied;
  assert.equal(channel.clear(), false); assert.equal(fake.onCDPMessage, occupied); assert.equal(fake.onSendCDPMessageError, undefined);
});
test('native commands are serialized, foreign sessions and unsupported methods cannot be sent', async () => {
  const fake = new FakeNative(), channel = new NativeChannel(fake, defaultLimits); channel.install();
  const pending = channel.send('Target.attachToTarget', { targetId: 'target-1', flatten: true });
  await assert.rejects(channel.send('Target.attachToTarget', { targetId: 'target-1' }), /concurrent_native_command/); await pending;
  await assert.rejects(channel.send('Runtime.evaluate', {}, 's1'), /forbidden_native_command/);
  await assert.rejects(channel.send('Network.enable', {}, 'foreign'), /forbidden_native_command/);
  assert.equal(fake.calls.length, 1); channel.clear();
});
test('native timeouts poison the channel and oversized event queues stop instead of silently losing data', async () => {
  const fake = new FakeNative(), channel = new NativeChannel(fake, { ...defaultLimits, commandTimeoutMs: 100, maxQueueEvents: 4 }); channel.install();
  await channel.send('Target.attachToTarget', { targetId: 'target-1' });
  for (let i = 0; i < 5; i++) fake.event('Network.loadingFinished', { requestId: String(i) }); assert.equal(channel.failure, 'event_queue_limit');
  await assert.rejects(channel.send('Network.enable', {}, 's1'), /event_queue_limit/); channel.clear();
  const silent = new FakeNative(); silent.sendCDPMessage = () => {}; const waiting = new NativeChannel(silent, { ...defaultLimits, commandTimeoutMs: 100 }); waiting.install();
  await assert.rejects(waiting.send('Target.attachToTarget', { targetId: 'target-1' }), /native_command_timeout/);
  await assert.rejects(waiting.send('Target.attachToTarget', { targetId: 'target-1' }), /native_command_timeout/); waiting.clear();
});
test('normal collector stop has actual disable/detach receipts and clears its callbacks', async t => {
  const f = await setup(t, { limits: { pollMs: 25 } }), fake = new FakeNative(); let stop = false;
  const running = collect(f.store, fake, async () => stop);
  await eventually(async () => { try { return (await fs.stat(path.join(f.dir, 'ready.json'))).isFile(); } catch { return false; } });
  stop = true; await running;
  const status = await readCapture(f.dir); assert.equal(status.runtime.state, 'stopped'); assert.equal(status.runtime.cleanup.path, 'explicit'); assert.equal(status.runtime.cleanup.sessions[0]?.detached, true);
  assert.ok(fake.calls.some(c => c.method === 'Network.disable')); assert.ok(fake.calls.some(c => c.method === 'Target.detachFromTarget')); assert.equal(fake.onCDPMessage, undefined);
});
test('handoff stops without native cleanup attempts and reports host lifecycle rather than a fabricated detach', async t => {
  const f = await setup(t, { limits: { pollMs: 25 } }), fake = new FakeNative(); const running = collect(f.store, fake, async () => false);
  await eventually(async () => { try { return (await fs.stat(path.join(f.dir, 'ready.json'))).isFile(); } catch { return false; } });
  const atHandoff = fake.calls.length; fake.controlError = 'EGO_TASK_SPACE_USER_IN_CONTROL'; await running;
  assert.equal(fake.calls.length, atHandoff); assert.equal(fake.onCDPMessage, undefined); assert.equal(f.store.runtime.cleanup.path, 'host_context'); assert.equal(f.store.runtime.cleanup.sessions[0]?.detached, false);
  assert.equal(f.store.runtime.reason, 'EGO_TASK_SPACE_USER_IN_CONTROL');
});
test('session detach rebinds only the exact registered target with a new generation and a recorded gap', async t => {
  const f = await setup(t, { limits: { pollMs: 25 } }), fake = new FakeNative(); let stop = false; const running = collect(f.store, fake, async () => stop);
  await eventually(async () => fake.calls.some(c => c.method === 'Network.enable'));
  fake.event('Target.detachedFromTarget', { sessionId: 's1', targetId: 'target-1' });
  await eventually(async () => fake.nextSession === 2); stop = true; await running;
  const events = await rows(f.store); assert.deepEqual(events.filter(e => e.kind === 'binding').map(e => e.source.generation), [1, 2]); assert.ok(f.store.runtime.gaps > 0);
  assert.ok(fake.calls.filter(c => c.method === 'Target.attachToTarget').every(c => c.params.targetId === 'target-1'));
});
test('unregistered page origin changes stop capture and cannot attach a replacement target by index', async t => {
  const f = await setup(t, { limits: { pollMs: 25 } }), fake = new FakeNative(); const running = collect(f.store, fake, async () => false);
  await eventually(async () => fake.calls.some(c => c.method === 'Network.enable')); fake.tabs = [{ targetId: 'target-2', url: origin + '/' }]; await running;
  assert.equal(fake.nextSession, 1); assert.equal(f.store.runtime.reason, 'registered_target_missing');
});
test('committed checkpoints ignore a partial uncommitted tail but detect changes to committed rows or selected bodies', async t => {
  const f = await setup(t), recorder = new Recorder(f.store, reader(), async () => {});
  await recorder.handle(binding(), req('one', origin + '/api/save', '{"ok":true}'), now());
  await fs.appendFile(path.join(f.dir, 'events.jsonl'), '{"unfinished');
  assert.equal((await queryNetwork({ runDir: f.runDir, request: { networkVersion: 1 } })).returned, 1);
  const event = (await rows(f.store))[0]!; await fs.writeFile(path.join(f.dir, event.body!.file!), '{"networkVersion":1,"encoding":"utf8","data":"changed"}');
  await assert.rejects(queryNetwork({ runDir: f.runDir, request: { networkVersion: 1, includeBodies: true } }), /body_integrity_mismatch/);
  const file = path.join(f.dir, 'events.jsonl'), text = await fs.readFile(file, 'utf8'); await fs.writeFile(file, text.replace('"kind":"request"', '"kind":"changed"'));
  await assert.rejects(queryNetwork({ runDir: f.runDir, request: { networkVersion: 1 } }), /event_integrity_mismatch/);
});
test('pagination freezes cutoffs, preserves zero-match scan limits, excludes later appends and binds filters', async t => {
  const f = await setup(t), recorder = new Recorder(f.store, reader(), async () => {});
  for (let i = 0; i < 5; i++) await recorder.handle(binding(), req(String(i)), now());
  const request = { networkVersion: 1, limit: 2, scanLimit: 2 }, first = await queryNetwork({ runDir: f.runDir, request }); assert.equal(first.hasMore, true); assert.equal(first.scan.complete, false); assert.equal(first.scan.totalMatchedInSnapshot, undefined);
  await recorder.handle(binding(), req('new'), now());
  let page = first; const ids = first.events.map(e => e.requestId);
  while (page.hasMore) { page = await queryNetwork({ runDir: f.runDir, request: { ...request, cursor: page.cursor } }); ids.push(...page.events.map(e => e.requestId)); }
  assert.deepEqual(ids, ['0', '1', '2', '3', '4']); assert.equal(page.scan.totalMatchedInSnapshot, 5);
  await assert.rejects(queryNetwork({ runDir: f.runDir, request: { ...request, path: '/api/other', cursor: first.cursor } }), /invalid_query_cursor/);
  const empty = await queryNetwork({ runDir: f.runDir, request: { networkVersion: 1, kind: 'ws-message', scanLimit: 2 } }); assert.equal(empty.returned, 0); assert.equal(empty.hasMore, true); assert.equal(empty.scan.totalMatchedInSnapshot, undefined);
});
test('exports are explicit immutable files; capture and directory-link writes are refused', async t => {
  const f = await setup(t); const filename = path.join(f.root, 'selected.json');
  const query = await queryNetwork({ runDir: f.runDir, request: { networkVersion: 1 }, outputFile: filename }); assert.ok('export' in query);
  const before = await fs.readFile(filename); await assert.rejects(queryNetwork({ runDir: f.runDir, request: { networkVersion: 1 }, outputFile: filename }), /EEXIST/); assert.deepEqual(await fs.readFile(filename), before);
  await assert.rejects(queryNetwork({ runDir: f.runDir, request: { networkVersion: 1 }, outputFile: path.join(f.dir, 'new.json') }), /export_cannot_modify_capture/);
  const link = path.join(f.root, 'alias'); await fs.symlink(f.dir, link, process.platform === 'win32' ? 'junction' : 'dir');
  try { await assert.rejects(queryNetwork({ runDir: f.runDir, request: { networkVersion: 1 }, outputFile: path.join(link, 'new.json') }), /Symlink/); } finally { await fs.unlink(link); }
});
test('body, tracking and total disk limits preserve prior facts and expose the limiting reason', async t => {
  const f = await setup(t, { limits: { maxBodyBytes: 256, maxDiskBytes: 32768, maxTrackedRequests: 4 } }), recorder = new Recorder(f.store, reader(), async () => {});
  await recorder.handle(binding(), req('large', origin + '/api/save', 'x'.repeat(300)), now()); assert.equal((await rows(f.store))[0]?.body?.state, 'truncated'); assert.ok(f.store.runtime.gaps > 0);
  for (let i = 0; i < 3; i++) await recorder.handle(binding(), req(String(i)), now());
  await assert.rejects(recorder.handle(binding(), req('fifth'), now()), /request_tracking_limit/);
  const seq = f.store.runtime.committedSeq;
  let hit = false; for (let i = 0; i < 100; i++) { try { await f.store.event({ kind: 'bounded', source: binding().source, receivedAt: now(), details: { text: 'x'.repeat(512) } }); } catch (error) { assert.match(String(error), /disk_capacity_exhausted/); hit = true; break; } }
  assert.equal(hit, true); assert.ok((await rows(f.store)).length >= seq); assert.ok(f.store.runtime.bytes <= 32768);
});
test('unknown startup blocks duplicate launch and stop remains an orderly file request without PID signalling', async t => {
  const f = await fixture(t), config = configOf({ limits: { startupTimeoutMs: 100, commandTimeoutMs: 100, pollMs: 25 } }); let launches = 0;
  const first = await startNetwork({ runDir: f.runDir, config }, { executable: async () => process.execPath, launch: async () => { launches++; } });
  assert.equal(first.started, false); assert.equal(first.reason, 'startup_timeout_execution_unknown_do_not_duplicate');
  const again = await startNetwork({ runDir: f.runDir, config }, { executable: async () => process.execPath, launch: async () => { launches++; } });
  assert.equal(again.started, false); assert.equal(again.reason, 'active_or_unknown_capture_exists'); assert.equal(launches, 1);
  const status = 'capture' in first ? first.capture : undefined; assert.ok(status);
  const dir = path.join(f.runDir, 'network/captures', status.captureId); await writeJSON(path.join(dir, 'launcher-ended.json'), { captureId: status.captureId, networkVersion: 1 });
  const before = await captureStatus(dir); assert.equal(before.state, 'unknown');
  const stopped = await stopNetwork({ runDir: f.runDir }); assert.equal(stopped.requested, true);
  assert.ok((await fs.stat(path.join(dir, 'stop.json'))).isFile()); assert.equal(launches, 1);
});
test('disk append failure leaves the prior checkpoint readable and exposes a code without echoing raw error content', async t => {
  const f = await setup(t); await f.store.event({ kind: 'before', source: binding().source, receivedAt: now() }); const checkpoint = structuredClone(f.store.runtime);
  const original = fs.open;
  const patched = t.mock.method(fs, 'open', (async (...args: Parameters<typeof fs.open>) => {
    if (String(args[0]) === path.join(f.dir, 'events.jsonl') && args[1] === 'a') throw Object.assign(new Error('token=synthetic-do-not-echo'), { code: 'ENOSPC' });
    return original(...args);
  }) as typeof fs.open);
  await assert.rejects(f.store.event({ kind: 'after', source: binding().source, receivedAt: now() }), error => typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOSPC'); patched.mock.restore();
  assert.equal(f.store.runtime.committedSeq, checkpoint.committedSeq); assert.equal((await rows(f.store)).length, 1);
});
test('query rejects malformed local evidence without including its untrusted secret text in diagnostics', async t => {
  const f = await setup(t); await f.store.event({ kind: 'before', source: binding().source, receivedAt: now() });
  await fs.writeFile(path.join(f.dir, 'runtime.json'), '{"token":"synthetic-do-not-echo", broken');
  await assert.rejects(queryNetwork({ runDir: f.runDir, request: { networkVersion: 1 } }), error => { assert.match(String(error), /invalid_local_json/); assert.doesNotMatch(String(error), /synthetic-do-not-echo/); return true; });
});
test('aggregate pending HTTP content is bounded independently of each body and request tracking limits', async t => {
  const f = await setup(t, { limits: { maxBodyBytes: 8192, maxQueueBytes: 4096 } }), r = reader({ bufferedData: Buffer.from('x'.repeat(2500)).toString('base64') }), recorder = new Recorder(f.store, r, async () => {}), b = binding();
  for (const id of ['a','b']) { await recorder.handle(b, req(id), now()); await recorder.handle(b, res(id, origin + '/api/save', 'text/plain'), now()); }
  await recorder.handle(b, e('Network.dataReceived', { requestId: 'a' }), now());
  await assert.rejects(recorder.handle(b, e('Network.dataReceived', { requestId: 'b' }), now()), /content_buffer_limit/);
  assert.deepEqual(await fs.readdir(path.join(f.dir, 'bodies')), []);
});
test('SSE final lone CR separator is committed at EOF with the same bytes', async t => {
  const f = await setup(t), raw = 'data: ending\r\r', r = reader({ bufferedData: Buffer.from(raw).toString('base64') }), recorder = new Recorder(f.store, r, async () => {}), b = binding();
  await recorder.handle(b, req('cr', origin + '/events'), now()); await recorder.handle(b, res('cr', origin + '/events', 'text/event-stream'), now()); await recorder.handle(b, e('Network.dataReceived', { requestId: 'cr' }), now());
  await recorder.handle(b, end('cr'), now()); const unit = (await rows(f.store)).find(e => e.kind === 'sse-unit'); assert.ok(unit); assert.equal((await readBody(f.dir, unit.body!, f.config.limits.maxBodyBytes)).data, raw);
});
test('SSE field-selection exclusions remain excluded at the end instead of becoming a saved body', async t => {
  const f = await setup(t, { policy: { jsonFields: ['safe'] } }), raw = 'data: plain data\n\n', r = reader({ bufferedData: Buffer.from(raw).toString('base64') }), recorder = new Recorder(f.store, r, async () => {}), b = binding();
  await recorder.handle(b, req('excluded', origin + '/events'), now()); await recorder.handle(b, res('excluded', origin + '/events', 'text/event-stream'), now()); await recorder.handle(b, e('Network.dataReceived', { requestId: 'excluded' }), now()); await recorder.handle(b, end('excluded'), now());
  assert.equal((await rows(f.store)).at(-1)?.body?.state, 'excluded'); assert.deepEqual(await fs.readdir(path.join(f.dir, 'bodies')), []);
});
test('an observed zero-byte HTTP body is distinct from missing request data and a still-open response', async t => {
  const f = await setup(t), r = reader({ body: '', base64Encoded: false }), recorder = new Recorder(f.store, r, async () => {}), b = binding();
  await recorder.handle(b, req('empty'), now()); await recorder.handle(b, res('empty', origin + '/api/save', 'text/plain', 204), now());
  const before = await rows(f.store); assert.equal(before[0]?.body?.state, 'not_collected'); assert.equal(before[1]?.body?.state, 'in_progress');
  await recorder.handle(b, end('empty'), now()); const body = (await rows(f.store)).find(e => e.kind === 'response-body')!.body!; assert.equal(body.state, 'empty'); assert.equal(body.bytes, 0); assert.equal((await readBody(f.dir, body, f.config.limits.maxBodyBytes)).data, '');
});
test('native body-read time is separate from protocol event clocks, callback receipt and disk commit time', async t => {
  const f = await setup(t), recorder = new Recorder(f.store, reader(), async () => {}), oldReceipt = '2026-01-01T00:00:00.000Z';
  await recorder.handle(binding(), req('clock'), oldReceipt); await recorder.handle(binding(), res('clock'), oldReceipt); await recorder.handle(binding(), end('clock'), oldReceipt);
  const event = (await rows(f.store)).find(e => e.kind === 'response-body')!; assert.equal(event.receivedAt, oldReceipt); assert.equal(event.protocolTime?.clock, 'monotonic'); assert.equal(typeof event.details?.bodyReadAt, 'string'); assert.notEqual(event.details?.bodyReadAt, oldReceipt); assert.ok(Date.parse(String(event.details?.bodyReadAt)) <= Date.parse(event.committedAt));
});
test('transient Windows checkpoint replacement failures do not duplicate already appended events', { skip: process.platform !== 'win32' }, async t => {
  const f = await setup(t), original = fs.rename; let failures = 0;
  const patched = t.mock.method(fs, 'rename', (async (...args: Parameters<typeof fs.rename>) => {
    if (String(args[1]) === path.join(f.dir, 'runtime.json') && failures++ < 2) throw Object.assign(new Error('Synthetic sharing collision'), { code: 'EPERM' });
    return original(...args);
  }) as typeof fs.rename);
  await f.store.event({ kind: 'single', source: binding().source, receivedAt: now() }); patched.mock.restore();
  assert.equal(failures, 3); assert.equal((await rows(f.store)).length, 1); assert.equal((await readCapture(f.dir)).runtime.committedSeq, 1);
});
test('session metadata that exceeds the disk budget is rejected before creating capture history or launching Ego', async t => {
  const f = await fixture(t), prefixes = Array.from({ length: 32 }, (_, i) => '/' + 'a'.repeat(200) + i); let launches = 0;
  const config = configOf({ interfaces: Array.from({ length: 32 }, () => ({ origin, pathPrefixes: prefixes })), limits: { maxDiskBytes: 32768, maxBodyBytes: 256 } });
  await assert.rejects(startNetwork({ runDir: f.runDir, config }, { executable: async () => process.execPath, launch: async () => { launches++; } }), /disk_budget_too_small_for_session/);
  assert.equal(launches, 0); assert.deepEqual(await fs.readdir(path.join(f.runDir, 'network/captures')), []);
});
