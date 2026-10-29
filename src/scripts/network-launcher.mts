/** Detached local helper owns only the CLI handle. It never kills an Ego/Node PID. */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TOOL_ROOT } from './toolchain.mjs';
import { atomicReplace, json, now, object, safePath, writeNew } from '../core/common.mjs';
import { boundedJSON } from '../observation/store.mjs';

export async function launch(startupFile: string) {
  const startup = await boundedJSON(await safePath(startupFile, { external: true, existing: true }));
  if (!object(startup) || startup.networkVersion !== 1 || typeof startup.captureDir !== 'string' || typeof startup.executable !== 'string' || !path.isAbsolute(startup.executable)) throw Error('Invalid network launcher startup.');
  const dir = await safePath(startup.captureDir, { external: true, existing: true });
  if (path.dirname(startupFile) !== dir) throw Error('Network startup path mismatch.');
  const code = 'await (await import(' + JSON.stringify(pathToFileURL(path.join(TOOL_ROOT, 'observation/collector.mjs')).href) + ')).runCollector(' + JSON.stringify(startupFile) + ')';
  const child = spawn(startup.executable, ['nodejs', '-e', code], { cwd: dir, windowsHide: true, stdio: 'ignore', shell: false });
  const completion = new Promise<void>(resolve => {
    let ended = false;
    const finish = async (code: number | null, signal: string | null, launchError: boolean) => {
      if (ended) return; ended = true;
      await atomicReplace(path.join(dir, 'launcher-ended.json'), json({ networkVersion: 1, captureId: path.basename(dir), at: now(), exitCode: code, signal, launchError })).catch(() => {}); resolve();
    };
    child.once('error', () => { void finish(null, null, true); });
    child.once('exit', (code, signal) => { void finish(code, signal, false); });
  });
  await writeNew(path.join(dir, 'launcher.json'), json({ networkVersion: 1, captureId: path.basename(dir), at: now(), handle: 'ego-browser-cli', childPid: child.pid ?? null, embeddedPidSemantics: 'shared_do_not_signal' }));
  await completion;
}
const file = process.argv[2];
if (file) await launch(file);
