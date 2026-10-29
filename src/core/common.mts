import type { FileIdentity, RecordPayload } from '../contracts/model.mjs';
import type { FileHandle } from 'node:fs/promises';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SOURCE_ROOT } from '../scripts/toolchain.mjs';
export { SOURCE_ROOT };
export const statuses = new Set(['verified', 'violation', 'inconclusive', 'not_tested']);
export const causes = new Set(['product', 'agent', 'environment', 'spec', 'unknown']);
export const evidenceKinds = new Set(['screenshot', 'dom', 'tool_receipt', 'log', 'other']);
export const reservedIds = new Set(['__proto__', 'prototype', 'constructor']);
export const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export function fail(message: string): never { throw new Error(message); }
export const hash = (bytes: string | Uint8Array): string => crypto.createHash('sha256').update(bytes).digest('hex');
export const json = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';
export const inside = (root: string, target: string): boolean => { const rel = path.relative(root, target); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); };
export const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
export const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
export const now = () => new Date().toISOString();
export const randomId = (prefix: string): string => prefix + crypto.randomUUID();

export function assertClosed(value: unknown, allowed: readonly string[], label: string): asserts value is Record<string, unknown> {
  if (!object(value)) fail('Invalid ' + label + '.');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('Unexpected ' + label + ' key: ' + key);
}
export function safeIdentifier(value: unknown, label = 'identifier'): string {
  if (typeof value !== 'string' || !idPattern.test(value) || reservedIds.has(value) || value === '.' || value === '..') fail('Invalid or unsafe ' + label + '.');
  return value;
}
export function validTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !timestampPattern.test(value) || !Number.isFinite(Date.parse(value))) return false;
  return new Date(value).toISOString() === value.replace(/Z$/, value.includes('.') ? 'Z' : '.000Z');
}
export function assertTimestamp(value: unknown, label: string): asserts value is string {
  if (!validTimestamp(value)) fail('Invalid ' + label + ' timestamp.');
}
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('Non-finite numbers are not valid request values.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (!object(value)) fail('Request contains an unsupported value.');
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}
export function canonicalHash(value: unknown): string { return hash(Buffer.from(canonical(value), 'utf8')); }
export function canonicalRecord(record: RecordPayload): Required<RecordPayload> {
  return { observations: record.observations, assessments: record.assessments };
}
export function sameRecord(left: RecordPayload, right: RecordPayload): boolean { return canonical(canonicalRecord(left)) === canonical(canonicalRecord(right)); }

// Reject every symlink component, not just links that currently resolve outside a root.
export async function safePath(value: unknown, { external = false, existing = false }: { external?: boolean; existing?: boolean } = {}): Promise<string> {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0')) fail('Paths must be absolute and contain no NUL.');
  const resolved = path.resolve(value);
  if (external && (resolved === path.parse(resolved).root || inside(SOURCE_ROOT, resolved))) fail('Project and run records must be outside the source repository and not at a filesystem root.');
  let cursor = path.parse(resolved).root;
  for (const component of resolved.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    try { if ((await fs.lstat(cursor)).isSymbolicLink()) fail('Symlink path is not allowed: ' + cursor); }
    catch (caughterror) { const error = errorInfo(caughterror); if (error.code !== 'ENOENT') throw error; }
  }
  if (existing) await fs.lstat(resolved);
  return resolved;
}
export async function directory(value: unknown): Promise<string> {
  const target = await safePath(value, { external: true, existing: true });
  if (!(await fs.lstat(target)).isDirectory()) fail('Expected a directory.');
  return target;
}
export async function readJSON(filename: string): Promise<unknown> {
  await safePath(filename, { existing: true });
  if (!(await fs.lstat(filename)).isFile()) fail('Expected a regular JSON file.');
  return JSON.parse(await fs.readFile(filename, 'utf8'));
}
export async function syncDirectory(dirname: string): Promise<void> {
  let handle: FileHandle | undefined;
  try {
    handle = await fs.open(dirname, 'r');
    await handle.sync();
  } catch (caughterror) { const error = errorInfo(caughterror);
    if (!['EINVAL', 'ENOTSUP', 'EISDIR', 'EPERM', 'EACCES', 'EBADF'].includes(error.code ?? '')) throw error;
  } finally { if (handle) await handle.close().catch(() => {}); }
}
export async function writeNew(filename: string, data: string): Promise<FileIdentity> {
  await safePath(filename);
  let handle: FileHandle | undefined;
  let created = false;
  let identity: FileIdentity | undefined;
  try {
    handle = await fs.open(filename, 'wx', 0o600);
    created = true;
    const stat = await handle.stat();
    identity = { dev: stat.dev, ino: stat.ino };
    await handle.writeFile(data, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await syncDirectory(path.dirname(filename));
    return identity;
  } catch (caughterror) { const error = errorInfo(caughterror);
    if (created && !identity && handle) {
      try { const stat = await handle.stat(); identity = { dev: stat.dev, ino: stat.ino }; } catch {}
    }
    if (handle) { try { await handle.close(); } catch {} handle = undefined; }
    if (created && identity) {
      try { await removeOwnedFileIfPresent(filename, identity); }
      catch (caughtcleanupError) { const cleanupError = errorInfo(caughtcleanupError); error.cleanupError = cleanupError.message; }
    } else if (created) error.cleanupError = 'Could not verify the created file identity; it was left for inspection.';
    throw error;
  }
}
export async function removeOwnedFileIfPresent(filename: string, identity: FileIdentity): Promise<void> {
  try {
    await safePath(filename, { existing: true });
    const stat = await fs.lstat(filename);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.dev !== identity.dev || stat.ino !== identity.ino) fail('Refusing to remove a file that no longer matches this operation.');
    await fs.unlink(filename);
  } catch (caughterror) { const error = errorInfo(caughterror); if (error.code !== 'ENOENT') throw error; }
}
export async function removeRegularIfPresent(filename: string): Promise<void> {
  try {
    await safePath(filename, { existing: true });
    const st = await fs.lstat(filename);
    if (st.isSymbolicLink() || !st.isFile()) fail('Refusing to clean an unexpected non-regular file.');
    await fs.unlink(filename);
  } catch (caughterror) { const error = errorInfo(caughterror); if (error.code !== 'ENOENT') throw error; }
}
export async function atomicReplace(filename: string, data: string, tempPath: string | null = null): Promise<void> {
  await safePath(filename);
  try {
    const st = await fs.lstat(filename);
    if (st.isSymbolicLink() || !st.isFile()) fail('Refusing to replace a non-regular file.');
  } catch (caughterror) { const error = errorInfo(caughterror); if (error.code !== 'ENOENT') throw error; }
  const temporary = tempPath ?? path.join(path.dirname(filename), '.ego-tmp-' + crypto.randomUUID() + '.json');
  await safePath(temporary);
  let renamed = false;
  let temporaryOwned = false;
  try {
    await writeNew(temporary, data);
    temporaryOwned = true;
    await safePath(filename);
    await fs.rename(temporary, filename);
    renamed = true;
    await syncDirectory(path.dirname(filename));
  } finally { if (!renamed && temporaryOwned) await removeRegularIfPresent(temporary); }
}
export async function acquireLock(root: string): Promise<() => Promise<void>> {
  const filename = path.join(root, '.run.lock');
  await safePath(filename);
  const token = crypto.randomUUID();
  let handle: FileHandle | undefined;
  try {
    handle = await fs.open(filename, 'wx', 0o600);
    await handle.writeFile(json({ token, pid: process.pid, startedAt: now() }), 'utf8');
    await handle.sync();
    await syncDirectory(root);
  } catch (caughterror) { const error = errorInfo(caughterror);
    if (error.code === 'EEXIST') fail('Run is locked by another operation. Retry after its owner exits.');
    if (handle) {
      try {
        // A partial write may leave invalid JSON. Remove only the path still linked to our open file.
        const opened = await handle.stat({ bigint: true });
        const current = await fs.lstat(filename, { bigint: true });
        const sameFile = opened.isFile() && current.isFile() && opened.ino > 0n && opened.dev === current.dev && opened.ino === current.ino;
        if (sameFile) {
          await fs.unlink(filename);
          await syncDirectory(root);
        }
      } catch (caughtcleanupError) { const cleanupError = errorInfo(caughtcleanupError);
        if (cleanupError.code !== 'ENOENT') error.cleanupError = cleanupError.message;
      }
    }
    throw error;
  } finally { if (handle) await handle.close(); }
  return async () => {
    try {
      const current = await readJSON(filename);
      if (object(current) && current.token === token) await removeRegularIfPresent(filename);
    } catch (caughterror) { const error = errorInfo(caughterror); if (error.code !== 'ENOENT') throw error; }
  };
}
export async function withRunLock<T>(runDir: unknown, action: (root: string) => T | Promise<T>): Promise<T> {
  const root = await directory(runDir);
  const release = await acquireLock(root);
  try { return await action(root); }
  finally { await release(); }
}

export interface LocalError extends Error { code?: string; cleanupError?: string }
export function errorInfo(value: unknown): LocalError { return value instanceof Error ? value : new Error(String(value)); }
