/** Stage only generated runtime artifacts. Never stages real projects or updates user installations. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { runtimeFiles, referenceNames, TOOL_VERSION, TOOL_REVISION } from '../src/contracts/layout.mjs';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--source-root' || !args[1]) throw new Error('Use --source-root CONFIRMED_SOURCE_ROOT.');
const root = path.resolve(args[1]), target = path.join(root, '.build/runtime');
const pkg: unknown = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
if (!pkg || typeof pkg !== 'object' || !('name' in pkg) || pkg.name !== 'ai-autonomous-testing-ego-lite' || !('version' in pkg) || pkg.version !== TOOL_VERSION) throw new Error('Source identity mismatch.');
async function safe(filename: string) {
  const relative = path.relative(root, filename);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Build path outside source root.');
  let cursor = path.parse(filename).root;
  for (const part of filename.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    try { if ((await fs.lstat(cursor)).isSymbolicLink()) throw new Error('Symlink build path refused.'); }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
  }
  return filename;
}
await safe(target); await fs.mkdir(target, { recursive: true });
await fs.writeFile(await safe(path.join(root, '.build/node/src/scripts/development-context.json')), JSON.stringify({ contextVersion: 1, sourceRoot: root, runtimeRoot: target }) + '\n');
const entries = runtimeFiles.map(name => ({ source: name.endsWith('.mjs') ? '.build/node/src/' + name : name === 'report-ui/main.js' ? '.build/browser/report-ui/main.js' : name, destination: name }));
entries.push({ source: 'skills/ai-autonomous-testing-ego-lite/SKILL.md', destination: 'SKILL.md' });
entries.push({ source: 'skills/ai-autonomous-testing-ego-lite/agents/openai.yaml', destination: 'agents/openai.yaml' });
entries.push(...referenceNames.map(name => ({ source: 'skills/ai-autonomous-testing-ego-lite/references/' + name + '.md', destination: 'references/' + name + '.md' })));
for (const entry of entries) {
  const destination = await safe(path.join(target, entry.destination)), source = await safe(path.join(root, entry.source));
  if (!(await fs.lstat(source)).isFile()) throw new Error('Runtime input is not a regular file.');
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, await fs.readFile(source));
}
const { scripts: _scripts, devDependencies: _dependencies, ...runtimePackage } = pkg as Record<string, unknown>;
await fs.writeFile(await safe(path.join(target, 'package.json')), JSON.stringify(runtimePackage, null, 2) + '\n');
const files: Record<string, { bytes: number; sha256: string }> = {};
for (const name of [...entries.map(entry => entry.destination), 'package.json'].sort((a, b) => a.localeCompare(b, 'en'))) {
  const bytes = await fs.readFile(await safe(path.join(target, name)));
  files[name] = { bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}
await fs.writeFile(await safe(path.join(target, 'runtime-manifest.json')), JSON.stringify({ manifestVersion: 1, version: TOOL_VERSION, toolRevision: TOOL_REVISION, files }, null, 2) + '\n');
const { toolInfo } = await import('../src/scripts/toolchain.mjs');
const checked = await toolInfo(target);
process.stdout.write(JSON.stringify({ runtimeRoot: target, files: checked.fileCount, fingerprint: checked.fingerprint }) + '\n');
