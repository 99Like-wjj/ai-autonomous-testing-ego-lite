#!/usr/bin/env node
/** Builds a new standalone directory outside the source. Never updates an installed Skill. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { runtimeEntries, regularBytes, toolInfo, TOOL_ROOT, SOURCE_ROOT } from '../src/scripts/toolchain.mjs';
import type { FileFingerprint } from '../src/scripts/toolchain.mjs';
import { errorInfo, inside, object } from '../src/core/common.mjs';

export async function buildSkill(outputDir: string) {
  if (!path.isAbsolute(outputDir)) throw new Error('Use an absolute output directory.');
  const target = path.resolve(outputDir);
  if (inside(SOURCE_ROOT, target) || inside(TOOL_ROOT, target)) throw new Error('Installation artifacts must be outside the source repository.');
  await toolInfo();
  let cursor = path.parse(target).root;
  for (const part of target.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    try { if ((await fs.lstat(cursor)).isSymbolicLink()) throw new Error('Symlink installation path refused.'); }
    catch (caught) { const error = errorInfo(caught); if (error.code !== 'ENOENT') throw error; }
  }
  await fs.mkdir(target);
  const { entries } = await runtimeEntries();
  for (const entry of entries) {
    await fs.mkdir(path.dirname(path.join(target, entry.destination)), { recursive: true });
    await fs.writeFile(path.join(target, entry.destination), await regularBytes(path.join(TOOL_ROOT, entry.source)), { flag: 'wx' });
  }
  const pkg: unknown = JSON.parse((await regularBytes(path.join(TOOL_ROOT, 'package.json'))).toString('utf8'));
  if (!object(pkg) || !object(pkg.egoLiteTest)) throw new Error('Invalid runtime package metadata.');
  delete pkg.scripts; delete pkg.devDependencies;
  await fs.writeFile(path.join(target, 'package.json'), JSON.stringify(pkg, null, 2) + '\n', { flag: 'wx' });
  const files: Record<string, FileFingerprint> = {};
  for (const name of [...entries.map(e => e.destination), 'package.json'].sort((a, b) => a.localeCompare(b, 'en'))) {
    const bytes = await regularBytes(path.join(target, name));
    files[name] = { bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  }
  await fs.writeFile(path.join(target, 'runtime-manifest.json'), JSON.stringify({ manifestVersion: 1, version: pkg.version, toolRevision: pkg.egoLiteTest.toolRevision, files }, null, 2) + '\n', { flag: 'wx' });
  const verified = await toolInfo(target);
  return { outputDir: target, version: verified.version, toolRevision: verified.toolRevision, files: verified.fileCount, fingerprint: verified.fingerprint };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--output-dir' || !args[1]) { process.stderr.write('Use --output-dir ABS_NEW_SKILL_DIR\n'); process.exitCode = 1; }
  else buildSkill(args[1]).then(value => process.stdout.write(JSON.stringify(value, null, 2) + '\n')).catch(caught => { process.stderr.write('Error: ' + errorInfo(caught).message + '\n'); process.exitCode = 1; });
}
