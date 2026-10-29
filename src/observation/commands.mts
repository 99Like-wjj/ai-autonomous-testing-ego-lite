/** Run-scoped lifecycle transactions. Unknown execution never licenses a duplicate collector. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { TOOL_ROOT, TOOL_VERSION, TOOL_REVISION } from '../scripts/toolchain.mjs';
import { hash, json, now, object, safePath, writeNew, withRunLock } from '../core/common.mjs';
import { parseConfig, reject, limitations, type Session } from './model.mjs';
import { CaptureStore, boundedJSON, capturePath, listCaptureIds, networkRoot, newCaptureId, readCapture } from './store.mjs';
import { gapSummary } from './query.mjs';
export { queryNetwork } from './query.mjs';

const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function optionalJSON(filename: string) {
  try { return await boundedJSON(filename); } catch (error) { if (object(error) && error.code === 'ENOENT') return null; throw error; }
}
export async function captureStatus(dir: string) {
  const { session, runtime } = await readCapture(dir), ended = await optionalJSON(path.join(dir, 'ended.json')), launcher = await optionalJSON(path.join(dir, 'launcher.json')), launcherEnded = await optionalJSON(path.join(dir, 'launcher-ended.json')), ready = await optionalJSON(path.join(dir, 'ready.json'));
  const endedMatches = object(ended) && ended.captureId === session.captureId && ended.committedSeq === runtime.committedSeq;
  const handleEnded = object(launcherEnded) && launcherEnded.captureId === session.captureId;
  const fresh = Date.now() - Date.parse(runtime.heartbeatAt) < Math.max(10000, session.config.limits.commandTimeoutMs * 2);
  const state = endedMatches && handleEnded ? runtime.state : handleEnded ? 'unknown' : endedMatches ? 'stopping' : fresh && object(launcher) && object(ready) && runtime.state === 'recording' ? 'recording' : fresh && runtime.state === 'starting' ? 'starting' : 'unknown';
  return { networkVersion: 1, captureId: session.captureId, runId: session.runId, createdAt: session.createdAt, state, lastReportedState: runtime.state, reason: runtime.reason, heartbeatAt: runtime.heartbeatAt, heartbeatFresh: fresh,
    committedSeq: runtime.committedSeq, bytes: runtime.bytes, priorCaptureBytes: session.priorCaptureBytes, runBudgetBytes: session.priorCaptureBytes + runtime.bytes, counters: runtime.counters, memorySemantics: 'shared_embedded_runtime_not_exclusive_collector_usage', gaps: runtime.gaps, gapSummary: await gapSummary(dir, runtime),
    cleanup: runtime.cleanup, contextEndReceipt: Boolean(endedMatches), launcherHandleEnded: Boolean(handleEnded),
    native: object(ready) ? { browserVersion: ready.browserVersion ?? null, capabilities: ready.nativeCapabilities ?? [] } : null,
    scope: { spaceId: session.config.spaceId, pages: session.config.pages, interfaces: session.config.interfaces }, policy: session.config.policy, limits: session.config.limits, limitations: session.limitations };
}
async function activeCapture(root: string) {
  const active = await optionalJSON(path.join(root, 'active.json'));
  if (active === null) return null;
  if (!object(active) || active.networkVersion !== 1 || typeof active.captureId !== 'string') reject('invalid_active_capture');
  const dir = await capturePath(root, active.captureId), status = await captureStatus(dir);
  return { dir, status, terminal: status.contextEndReceipt && status.launcherHandleEnded };
}
export async function resolveEgoExecutable(): Promise<string> {
  const names = process.platform === 'win32' ? ['ego-browser.exe'] : ['ego-browser'];
  for (const folder of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) for (const name of names) {
    const filename = path.join(folder, name);
    try { const real = await fs.realpath(filename); if ((await fs.stat(real)).isFile()) return real; } catch {}
  }
  return reject('ego_browser_executable_unavailable');
}
interface StartHooks { executable?: () => Promise<string>; launch?: (startupFile: string) => Promise<void> }
export async function startNetwork({ runDir, config: input }: { runDir: unknown; config: unknown }, hooks: StartHooks = {}) {
  const config = parseConfig(input);
  return withRunLock(runDir, async runRoot => {
    const { root, runId } = await networkRoot(runRoot, true), active = await activeCapture(root);
    if (active && !active.terminal) return { networkVersion: 1, started: false, reason: 'active_or_unknown_capture_exists', capture: active.status };
    let priorCaptureBytes = 0;
    for (const id of await listCaptureIds(root)) priorCaptureBytes += (await readCapture(await capturePath(root, id))).runtime.bytes;
    if (priorCaptureBytes + 16384 > config.limits.maxDiskBytes) return { networkVersion: 1, started: false, reason: 'run_disk_budget_exhausted_preserve_history', priorCaptureBytes };
    const executable = await (hooks.executable ?? resolveEgoExecutable)(), captureId = newCaptureId(), dir = path.join(root, 'captures', captureId);
    const session: Session = { networkVersion: 1, captureId, runId, createdAt: now(), priorCaptureBytes, config, toolVersion: TOOL_VERSION, toolRevision: TOOL_REVISION, limitations };
    const store = await CaptureStore.create(dir, session);
    const startupFile = path.join(dir, 'startup.json'), sessionBytes = await fs.readFile(path.join(dir, 'session.json'));
    await writeNew(startupFile, json({ networkVersion: 1, captureDir: dir, sessionSha256: hash(sessionBytes), executable }));
    // active.json is a pointer, not history. Prior session/event files remain immutable.
    const { atomicReplace } = await import('../core/common.mjs');
    await atomicReplace(path.join(root, 'active.json'), json({ networkVersion: 1, captureId, runId, createdAt: session.createdAt }));
    if (hooks.launch) await hooks.launch(startupFile);
    else {
      const child = spawn(process.execPath, [path.join(TOOL_ROOT, 'scripts/network-launcher.mjs'), startupFile], { detached: true, stdio: 'ignore', windowsHide: true, cwd: dir, shell: false });
      child.once('error', () => { void store.finish('failed', 'launcher_start_failed', { callbacksCleared: true, sessions: [], path: 'not_attached', contextEnd: 'reported' }).then(() => writeNew(path.join(dir, 'launcher-ended.json'), json({ networkVersion: 1, captureId, at: now(), launchError: true }))).catch(() => {}); });
      child.unref();
    }
    const deadline = Date.now() + config.limits.startupTimeoutMs;
    while (Date.now() < deadline) {
      const status = await captureStatus(dir);
      if (status.state === 'recording') return { networkVersion: 1, started: true, capture: status };
      if (status.contextEndReceipt || status.launcherHandleEnded) return { networkVersion: 1, started: false, reason: status.reason ?? 'collector_ended_before_ready', capture: status };
      await pause(Math.min(100, config.limits.pollMs));
    }
    return { networkVersion: 1, started: false, reason: 'startup_timeout_execution_unknown_do_not_duplicate', capture: await captureStatus(dir) };
  });
}
export async function statusNetwork(runDir: unknown, captureId?: string) {
  const { root, runId } = await networkRoot(runDir), ids = captureId ? [captureId] : await listCaptureIds(root);
  if (ids.length > 128) reject('status_history_limit_use_capture_id');
  const captures = []; for (const id of ids) captures.push(await captureStatus(await capturePath(root, id)));
  return { networkVersion: 1, runId, captures, limitations };
}
export async function stopNetwork({ runDir, captureId }: { runDir: unknown; captureId?: string }) {
  return withRunLock(runDir, async runRoot => {
    const { root } = await networkRoot(runRoot), active = await activeCapture(root);
    const dir = captureId ? await capturePath(root, captureId) : active?.dir;
    if (!dir) return { networkVersion: 1, requested: false, reason: 'no_capture' };
    const before = await captureStatus(dir);
    if (before.contextEndReceipt && before.launcherHandleEnded) return { networkVersion: 1, requested: false, reason: 'already_ended', capture: before };
    const stopFile = path.join(dir, 'stop.json');
    if (await optionalJSON(stopFile) === null) await writeNew(stopFile, json({ networkVersion: 1, captureId: before.captureId, at: now(), request: 'orderly_stop' }));
    const deadline = Date.now() + Math.min(15000, before.limits.commandTimeoutMs * Math.max(2, before.scope.pages.length * 3) + 2000);
    while (Date.now() < deadline) { const status = await captureStatus(dir); if (status.contextEndReceipt && status.launcherHandleEnded) return { networkVersion: 1, requested: true, capture: status }; await pause(100); }
    return { networkVersion: 1, requested: true, reason: 'stop_timeout_execution_or_cleanup_unknown_no_pid_signal', capture: await captureStatus(dir) };
  });
}
