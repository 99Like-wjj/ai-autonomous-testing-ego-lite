#!/usr/bin/env node
/** Builds a new standalone installation directory. Never updates an existing install. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeEntries, regularBytes, toolInfo, TOOL_ROOT } from '../scripts/toolchain.mjs';

export async function buildSkill(outputDir) {
  if (!path.isAbsolute(outputDir)) throw new Error('Use an absolute output directory.');
  const target = path.resolve(outputDir), relative = path.relative(TOOL_ROOT, target);
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('Installation artifacts must be outside the source repository.');
  await toolInfo();
  // Validate parents before mkdir, and require a fresh destination. No recursive cleanup.
  let cursor = path.parse(target).root;
  for (const part of target.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    try { if ((await fs.lstat(cursor)).isSymbolicLink()) throw new Error('Symlink installation path refused.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await fs.mkdir(target);
  const { entries } = await runtimeEntries();
  for (const entry of entries) {
    await fs.mkdir(path.dirname(path.join(target, entry.destination)), { recursive: true });
    await fs.writeFile(path.join(target, entry.destination), await regularBytes(path.join(TOOL_ROOT, entry.source)), { flag: 'wx' });
  }
  const pkg = JSON.parse(await regularBytes(path.join(TOOL_ROOT, 'package.json')));
  delete pkg.scripts;
  await fs.writeFile(path.join(target, 'package.json'), JSON.stringify(pkg, null, 2) + '\n', { flag: 'wx' });
  // Compute hashes with the source-layout reader, then seal the installed-layout manifest.
  const crypto = await import('node:crypto');
  const files = {};
  for (const name of [...entries.map(e => e.destination), 'package.json'].sort((a,b) => a.localeCompare(b, 'en'))) {
    const bytes = await regularBytes(path.join(target, name));
    files[name] = { bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  }
  const manifest = { manifestVersion: 1, version: pkg.version, toolRevision: pkg.egoLiteTest.toolRevision, files };
  await fs.writeFile(path.join(target, 'runtime-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  const verified = await toolInfo(target);
  return { outputDir: target, version: verified.version, toolRevision: verified.toolRevision, files: verified.fileCount, fingerprint: verified.fingerprint };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--output-dir') { process.stderr.write('Usage: node tools/build-skill.mjs --output-dir ABS_NEW_SKILL_DIR\n'); process.exitCode = 1; }
  else buildSkill(args[1]).then(value => process.stdout.write(JSON.stringify(value, null, 2) + '\n')).catch(error => { process.stderr.write('Error: ' + error.message + '\n'); process.exitCode = 1; });
}
