import { portableFileName } from '../contracts/attachment-path.mjs';
/** Deterministic UTF-8 ZIP (stored entries). Only explicit, hash-verified test originals and an index. */
import fs from 'node:fs/promises';
import { evidenceFile } from '../core/file-integrity.mjs';
import { fail, hash, safePath } from '../core/common.mjs';
import type { HtmlPayload } from '../contracts/model.mjs';

const crcTable = Uint32Array.from({ length: 256 }, (_, i) => { let v = i; for (let k = 0; k < 8; k++) v = v >>> 1 ^ (v & 1 ? 0xedb88320 : 0); return v >>> 0; });
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) crc = crc >>> 8 ^ crcTable[(crc ^ b) & 255]!;
  return (crc ^ 0xffffffff) >>> 0;
}
export function storedZip(files: readonly { name: string; bytes: Buffer }[]): Buffer {
  if (files.length > 65535) fail('Test attachment archive exceeds the classic ZIP entry limit.');
  const locals: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const file of files) {
    if (!file.name || file.name.startsWith('/') || /[\\\x00-\x1f]/.test(file.name) || file.name.split('/').some(p => p === '.' || p === '..' || !p)) fail('Unsafe test attachment ZIP name.');
    const name = Buffer.from(file.name, 'utf8'), size = file.bytes.length, crc = crc32(file.bytes);
    if (name.length > 65535 || size > 0xffffffff || offset + size + name.length + 30 > 0xffffffff) fail('Test attachment archive exceeds classic ZIP size limits.');
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(33, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(size, 18); local.writeUInt32LE(size, 22); local.writeUInt16LE(name.length, 26);
    locals.push(local, name, file.bytes);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x800, 8); entry.writeUInt16LE(33, 14); entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(size, 20); entry.writeUInt32LE(size, 24); entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(offset, 42); central.push(entry, name);
    offset += local.length + name.length + size;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  if (offset + directory.length > 0xffffffff) fail('Test attachment ZIP central directory exceeds limits.');
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
export async function testFileArchive(root: string, payload: HtmlPayload, historicalFiles?: ReadonlyMap<string, string>): Promise<Buffer | undefined> {
  const view = payload.testFiles, originals = view?.items.filter(f => f.status === 'retained' && f.evidenceId && f.attachmentPath) ?? [];
  if (!originals.length) return undefined;
  const files: { name: string; bytes: Buffer }[] = [], paths = new Map<string, string>();
  for (const file of originals) {
    const id = file.evidenceId!, historical = payload.report.history?.evidence.find(e => e.key === id), item = historical?.item ?? payload.report.evidenceCatalog.items.find(e => e.id === id);
    if (!item) fail('Missing test attachment evidence.');
    const archived = historicalFiles?.get(id), filename = archived ? await safePath(archived, { existing: true }) : await evidenceFile(historical?.resolvedRunDir ?? root, item.path);
    const bytes = await fs.readFile(filename); if (hash(bytes) !== file.sha256 || bytes.length !== file.bytes) fail('Test attachment changed during archive creation.');
    const name = 'files/' + file.sha256! + '-' + hash(Buffer.from(file.name)).slice(0, 12) + '/' + portableFileName(file.name);
    paths.set(id, name);
    if (!files.some(f => f.name === name)) files.push({ name, bytes });
  }
  const index = { kind: 'test-attachments', runId: payload.report.runId, revision: payload.report.revision, evidenceRevision: payload.report.evidenceRevision, complete: view!.complete,
    files: view!.items.map(f => ({ ...f, attachmentPath: f.evidenceId ? paths.get(f.evidenceId) ?? null : null })),
    note: 'Only retained test originals are included. Missing/excluded files are listed without replacement. Filename sanitation affects ZIP paths only; original names and hashes are retained above. File availability is not a business verdict.' };
  files.unshift({ name: 'test-files.json', bytes: Buffer.from(JSON.stringify(index, null, 2) + '\n') });
  return storedZip(files);
}
