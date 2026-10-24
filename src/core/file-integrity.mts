/** Shared file scope and integrity primitives. Business ownership remains with callers. */
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { FileReference } from '../contracts/execution-model.mjs';
import { errorInfo, fail, inside, nonempty, safePath } from './common.mjs';

export async function regularFilePath(filename: string): Promise<string> {
  const target = await safePath(filename, { existing: true });
  if (!(await fs.lstat(target)).isFile()) fail('Expected a regular file: ' + filename);
  return target;
}
export async function existingRegularFile(filename: string): Promise<string | null> {
  try { return await regularFilePath(filename); }
  catch (caught) { if (errorInfo(caught).code === 'ENOENT') return null; throw caught; }
}

export function evidenceReference(ref: unknown): asserts ref is string {
  if (!nonempty(ref) || ref.includes('\\') || ref.includes('\0') || ref.includes(':') || path.posix.isAbsolute(ref) || /^[A-Za-z]:/.test(ref) || ref.split('/').some(c => c === '..' || c === '.' || c === '')) fail('Evidence must use relative slash-separated paths without traversal.');
  if (!ref.startsWith('evidence/')) fail('Evidence files must be under the run evidence/ directory.');
}
export async function evidenceFile(runDir: string, ref: unknown): Promise<string> {
  evidenceReference(ref);
  const filename = path.resolve(runDir, ...ref.split('/'));
  if (!inside(runDir, filename)) fail('Evidence escapes run directory.');
  await safePath(filename, { existing: true });
  if (!(await fs.lstat(filename)).isFile()) fail('Evidence is not a regular file: ' + ref);
  return filename;
}
export async function hashFile(filename: string): Promise<{ sha256: string; bytes: number }> {
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  const handle = await fs.open(filename, flags);
  try {
    if (!(await handle.stat()).isFile()) fail('Expected a regular file.');
    const digest = crypto.createHash('sha256');
    let bytes = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) { digest.update(chunk); bytes += chunk.length; }
    return { sha256: digest.digest('hex'), bytes };
  } finally { await handle.close(); }
}

export function referencePath(root: string, input: string): string {
  const absolute = path.isAbsolute(input) ? path.resolve(input) : path.resolve(root, input);
  if (!inside(root, absolute) || absolute === root) fail('Execution file escapes its run directory.');
  const relative = path.relative(root, absolute).replaceAll('\\', '/');
  if (relative.includes(':') || relative.includes('\0') || relative.split('/').some(part => !part || part === '.' || part === '..')) fail('Unsafe execution file reference.');
  return relative;
}
export async function retainReference(root: string, input: string): Promise<FileReference> {
  const relative = referencePath(root, input), filename = await safePath(path.join(root, ...relative.split('/')), { existing: true });
  if (!(await fs.lstat(filename)).isFile()) fail('Execution reference is not a regular file.');
  const actual = await hashFile(filename); return { path: relative, ...actual };
}
export function workerEvidencePath(workerRoot: string, relative: string, label: 'Packet' | 'Draft' = 'Packet'): string {
  if (path.isAbsolute(relative) || relative.includes('\0') || relative.includes('\\') || relative.includes(':') || relative.split('/').some(part => !part || part === '.' || part === '..')) fail(label === 'Draft' ? 'Draft evidence must be worker-relative.' : 'Packet evidence must use safe worker-relative paths.');
  const filename = path.resolve(workerRoot, ...relative.split('/'));
  if (!inside(workerRoot, filename) || filename === workerRoot) fail(label === 'Draft' ? 'Draft evidence escapes worker directory.' : 'Packet evidence escapes its assignment directory.');
  return filename;
}
