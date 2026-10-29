/** Entry point for a dedicated native-only Ego context. Never terminate the shared embedded PID. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { hash, json, now, object, safePath, writeNew } from '../core/common.mjs';
import { toolInfo } from '../scripts/toolchain.mjs';
import { asObject, codeOf, reject, type Cleanup, type NativeBridge, type NativeTab } from './model.mjs';
import { CaptureStore, boundedJSON, parseSession } from './store.mjs';
import { NativeChannel } from './native.mjs';
import { Recorder, type Binding } from './recorder.mjs';

const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function exists(filename: string) { try { await safePath(filename, { existing: true }); return true; } catch (error) { if (object(error) && error.code === 'ENOENT') return false; throw error; } }
export async function collect(store: CaptureStore, bridge: NativeBridge, stopRequested = () => exists(path.join(store.dir, 'stop.json'))) {
  const config = store.session.config, channel = new NativeChannel(bridge, config.limits), bindings = new Map<string, Binding>();
  const cleanup: Cleanup = { callbacksCleared: false, sessions: [], path: 'not_attached', contextEnd: 'pending' };
  store.runtime.cleanup = cleanup;
  let controlled = true, reason = 'stop_requested', failure = false, installed = false;
  const control = async (): Promise<NativeTab[]> => {
    if (!channel.ownsCallbacks()) reject('callback_ownership_changed');
    if (channel.failure) reject(channel.failure);
    let result; try { result = await bridge.listTabs(); } catch { controlled = false; reject('task_control_unavailable'); }
    if (result.error || !Array.isArray(result.tabs)) { controlled = false; reject(typeof result.error_code === 'string' && /^EGO_[A-Z_]{1,80}$/.test(result.error_code) ? result.error_code : 'task_control_unavailable'); }
    for (const binding of bindings.values()) {
      const tab = result.tabs.find(t => t.targetId === binding.page.targetId);
      if (!tab) reject('registered_target_missing');
      let origin: string; try { origin = new URL(tab.url).origin; } catch { controlled = false; reject('registered_page_origin_unavailable'); }
      if (!binding.page.origins.includes(origin)) { controlled = false; reject('registered_page_origin_changed'); }
    }
    return result.tabs;
  };
  const recorder = new Recorder(store, channel, async () => { await control(); });
  const bind = async (page: typeof config.pages[number], generation: number) => {
    const tabs = await control(), tab = tabs.find(t => t.targetId === page.targetId);
    if (!tab) reject('registered_target_missing');
    if (!page.origins.includes(new URL(tab.url).origin)) reject('registered_page_origin_changed');
    const attached = await channel.send('Target.attachToTarget', { targetId: page.targetId, flatten: true }), sessionId = String(attached.sessionId);
    const resource = { sessionId, networkDisabled: false, detached: false }; cleanup.sessions.push(resource); cleanup.path = 'host_context';
    await store.checkpoint();
    const source = { page: page.label, targetId: page.targetId, generation, sessionId };
    const frame = await channel.send('Page.getFrameTree', {}, sessionId), mainFrameId = asObject(asObject(frame.frameTree).frame).id;
    if (typeof mainFrameId !== 'string') reject('top_frame_identity_unavailable');
    const binding: Binding = { source, page, mainFrameId }; bindings.set(sessionId, binding);
    await channel.send('Page.enable', {}, sessionId);
    await channel.send('Network.enable', { maxTotalBufferSize: Math.min(config.limits.maxQueueBytes * 2, 64 * 1024 * 1024), maxResourceBufferSize: config.limits.maxBodyBytes, maxPostDataSize: config.limits.maxBodyBytes }, sessionId);
    await control(); await store.event({ kind: 'binding', source, receivedAt: now(), details: { state: 'attached', generation, mainFrameId } });
    return binding;
  };
  try {
    channel.install(); installed = true; bridge.useTaskSpace(config.spaceId);
    if (await stopRequested()) reject('stopped_before_attach');
    for (const page of config.pages) { if (await stopRequested()) reject('stopped_before_attach'); await bind(page, 1); }
    let browserVersion: string | null = null;
    if (typeof bridge.getBrowserVersion === 'function') { try { const result = asObject(await bridge.getBrowserVersion()); if (typeof result.currentVersion === 'string' && /^[A-Za-z0-9.+_-]{1,64}$/.test(result.currentVersion)) browserVersion = result.currentVersion; } catch {} }
    await control();
    await writeNew(path.join(store.dir, 'ready.json'), json({ networkVersion: 1, captureId: store.session.captureId, at: now(), browserVersion, nativeCapabilities: ['useTaskSpace', 'listTabs', 'sendCDPMessage', 'callback_identity'], bindings: [...bindings.values()].map(b => b.source) }));
    store.runtime.state = 'recording'; await store.checkpoint();
    let lastHeartbeat = Date.now();
    while (true) {
      if (await stopRequested()) {
        store.runtime.state = 'stopping'; await store.checkpoint();
        // A bounded drain of events already queued at stop; ongoing streams are marked interrupted.
        await control(); const remaining = channel.take(config.limits.maxQueueEvents);
        for (const item of remaining) { const binding = item.event.sessionId ? bindings.get(item.event.sessionId) : undefined; if (binding) await recorder.handle(binding, item.event, item.receivedAt); }
        break;
      }
      await control();
      for (const item of channel.take(100)) {
        if (item.event.method === 'Target.detachedFromTarget') {
          const sessionId = typeof item.event.params.sessionId === 'string' ? item.event.params.sessionId : '', old = bindings.get(sessionId);
          if (old) {
            await recorder.interrupted('session_detached', old.source); await store.gap('session_binding_gap', { page: old.page.label, generation: old.source.generation });
            const resource = cleanup.sessions.find(s => s.sessionId === sessionId); if (resource) resource.detached = true;
            bindings.delete(sessionId);
            // Only the same registered target may rebind. A replacement target with unknown
            // lineage requires explicit registration in a new segment, never index/URL guessing.
            await bind(old.page, old.source.generation + 1);
          }
          continue;
        }
        const binding = item.event.sessionId ? bindings.get(item.event.sessionId) : undefined;
        if (binding) await recorder.handle(binding, item.event, item.receivedAt);
      }
      if (Date.now() - lastHeartbeat >= 1000) {
        store.count('controlCycles'); store.peak('queueEventsPeak', channel.metrics.queueEventsPeak); store.peak('queueBytesPeak', channel.metrics.queueBytesPeak);
        // Ego uses a shared embedded runtime. This is diagnostic context, not exclusive collector memory.
        store.peak('sharedHeapUsedBytesPeak', process.memoryUsage().heapUsed);
        await store.checkpoint(); lastHeartbeat = Date.now();
      }
      if (!channel.queued) await pause(config.limits.pollMs);
    }
  } catch (error) {
    reason = codeOf(error); failure = !['stopped_before_attach', 'EGO_TASK_SPACE_USER_IN_CONTROL', 'EGO_TASK_SPACE_INACTIVE', 'EGO_TASK_SPACE_NOT_FOUND', 'registered_page_origin_changed'].includes(reason);
    channel.discard();
    try { await store.gap(reason); } catch {}
  } finally {
    // Handoff/ownership failures drop queued content. Only generated identities/codes may be committed afterwards.
    channel.discard();
    try { await recorder.interrupted(reason); } catch {}
    if (installed && controlled && channel.ownsCallbacks() && !channel.failure) {
      try {
        // Recheck the native gate immediately before explicit resource transactions.
        const result = await bridge.listTabs(); if (result.error || !Array.isArray(result.tabs)) controlled = false;
        if (controlled) for (const resource of cleanup.sessions.filter(s => !s.detached)) {
          try {
            await channel.send('Network.disable', {}, resource.sessionId); resource.networkDisabled = true;
            await channel.send('Page.disable', {}, resource.sessionId);
            await channel.send('Target.detachFromTarget', { sessionId: resource.sessionId }); resource.detached = true;
          } catch { break; }
        }
      } catch {}
    }
    cleanup.callbacksCleared = installed ? channel.clear() : bridge?.onCDPMessage == null && bridge?.onSendCDPMessageError == null;
    cleanup.path = !cleanup.sessions.length ? 'not_attached' : cleanup.sessions.every(s => s.detached) ? 'explicit' : 'host_context';
    cleanup.contextEnd = 'reported';
    store.peak('queueEventsPeak', channel.metrics.queueEventsPeak); store.peak('queueBytesPeak', channel.metrics.queueBytesPeak);
    try { await store.finish(failure ? 'failed' : 'stopped', reason, cleanup); } catch { /* A failed final write remains unknown to readers; never fabricate an end receipt. */ }
  }
}
export async function runCollector(startupFile: string) {
  const input = await boundedJSON(await safePath(startupFile, { external: true, existing: true }));
  if (!object(input) || input.networkVersion !== 1 || typeof input.captureDir !== 'string' || typeof input.sessionSha256 !== 'string') reject('invalid_startup');
  const dir = await safePath(input.captureDir, { external: true, existing: true });
  if (path.dirname(startupFile) !== dir) reject('startup_path_mismatch');
  const bytes = await fs.readFile(await safePath(path.join(dir, 'session.json'), { existing: true })); if (hash(bytes) !== input.sessionSha256) reject('startup_session_mismatch');
  const session = parseSession(JSON.parse(bytes.toString('utf8'))); if (session.captureId !== path.basename(dir)) reject('capture_identity_mismatch');
  const info = await toolInfo(); if (session.toolVersion !== info.version || session.toolRevision !== info.toolRevision) reject('startup_tool_mismatch');
  // Initial store/checkpoint was created by network start, before launching. Reopening
  // is allowed only before any collector has committed a row, guarded by an exclusive claim.
  await writeNew(path.join(dir, 'context-claim.json'), json({ networkVersion: 1, captureId: session.captureId, at: now() }));
  const runtime = asObject(await boundedJSON(path.join(dir, 'runtime.json')));
  if (runtime.state !== 'starting' || runtime.committedSeq !== 0) reject('capture_already_started');
  const store = new CaptureStore(dir, session, typeof runtime.bytes === 'number' ? runtime.bytes : bytes.length + 8192);
  const bridge = (globalThis as { ego?: NativeBridge }).ego;
  if (!bridge) { await store.finish('failed', 'native_capability_unavailable', { callbacksCleared: true, sessions: [], path: 'not_attached', contextEnd: 'reported' }); return; }
  await collect(store, bridge);
}
