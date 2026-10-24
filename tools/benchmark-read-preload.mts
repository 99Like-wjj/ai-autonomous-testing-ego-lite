/** Offline benchmark instrumentation; no browser, network or installed-skill writes. */
import fs from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import type { ReadStream } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const output = process.env.EGO_BENCH_METRICS;
const run = process.env.EGO_BENCH_RUN;
const runtime = process.env.EGO_BENCH_RUNTIME;
if (!output || !run || !runtime) throw new Error('Explicit offline benchmark paths are required.');
interface Counter { calls: number; bytes: number }
const counters: Record<string, Counter> = {};
let lockStarted: number | null = null, lockConflicts = 0;
const lockHoldMs: number[] = [];
const isLock = (input: unknown) => typeof input === 'string' && path.resolve(input) === path.join(run!, '.run.lock');
function key(input: unknown): string {
  const filename = input instanceof URL ? fileURLToPath(input) : typeof input === 'string' ? input : null;
  if (!filename) return 'other';
  const relative = path.relative(run!, path.resolve(filename)).replaceAll('\\', '/');
  if (relative.startsWith('evidence/')) return 'retainedEvidence';
  if (relative.startsWith('workers/')) return 'workerReferences';
  if (relative && !relative.startsWith('../') && !path.isAbsolute(relative)) return 'runMetadata';
  const tool = path.relative(runtime!, path.resolve(filename));
  return tool && !tool.startsWith('..' + path.sep) && !path.isAbsolute(tool) ? 'runtimeAssets' : 'other';
}
function count(category: string, value: unknown, call: boolean): void {
  const counter = counters[category] ??= { calls: 0, bytes: 0 };
  if (call) counter.calls++;
  if (typeof value === 'string') counter.bytes += Buffer.byteLength(value);
  else if (Buffer.isBuffer(value)) counter.bytes += value.length;
}
fs.readFile = new Proxy(fs.readFile, {
  async apply(target, receiver, args: unknown[]) {
    const value: unknown = await Reflect.apply(target, receiver, args);
    count(key(args[0]), value, true); return value;
  }
});
fs.open = new Proxy(fs.open, {
  async apply(target, receiver, args: unknown[]) {
    let handle: FileHandle;
    try { handle = await Reflect.apply(target, receiver, args); }
    catch (caught) { if (isLock(args[0]) && caught && typeof caught === 'object' && 'code' in caught && caught.code === 'EEXIST') lockConflicts++; throw caught; }
    if (isLock(args[0]) && args[1] === 'wx') lockStarted = performance.now();
    const category = key(args[0]);
    handle.createReadStream = new Proxy(handle.createReadStream, {
      apply(create, streamReceiver, options: unknown[]) {
        const stream: ReadStream = Reflect.apply(create, streamReceiver, options);
        count(category, undefined, true);
        stream[Symbol.asyncIterator] = new Proxy(stream[Symbol.asyncIterator], {
          apply(iterate, iteratorReceiver, iteratorArgs: unknown[]) {
            const iterator: ReturnType<ReadStream[typeof Symbol.asyncIterator]> = Reflect.apply(iterate, iteratorReceiver, iteratorArgs);
            iterator.next = new Proxy(iterator.next, {
              async apply(next, nextReceiver, nextArgs: unknown[]) {
                const result: IteratorResult<unknown> = await Reflect.apply(next, nextReceiver, nextArgs);
                if (!result.done) count(category, result.value, false); return result;
              }
            });
            return iterator;
          }
        });
        return stream;
      }
    });
    return handle;
  }
});
fs.unlink = new Proxy(fs.unlink, {
  async apply(target, receiver, args: unknown[]) {
    const result: unknown = await Reflect.apply(target, receiver, args);
    if (isLock(args[0]) && lockStarted !== null) { lockHoldMs.push(performance.now() - lockStarted); lockStarted = null; }
    return result;
  }
});
process.once('exit', () => writeFileSync(output, JSON.stringify({ measurementVersion: 2, counters, lockHoldMs, lockConflicts, unfinishedLock: lockStarted !== null, caveat: 'Instrumented promises.readFile, FileHandle stream consumption and lock open/unlink; loader internals, physical disk I/O and OS caching are not measured.' }), { flag: 'wx' }));
