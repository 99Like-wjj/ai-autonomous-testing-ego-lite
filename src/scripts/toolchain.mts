/** Runtime identity and installation integrity; no business decisions. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TOOL_VERSION, TOOL_REVISION, FORMAT_VERSIONS, runtimeFiles, referenceNames } from '../contracts/layout.mjs';
export { TOOL_VERSION, TOOL_REVISION, FORMAT_VERSIONS, runtimeFiles } from '../contracts/layout.mjs';
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function bad(message: string): never { throw new Error(message); }
const errorCode = (value: unknown) => object(value) && typeof value.code === 'string' ? value.code : undefined;
const digest = (bytes: string | Uint8Array) => crypto.createHash('sha256').update(bytes).digest('hex');
export async function regularBytes(filename: string): Promise<Buffer> {
  if (!path.isAbsolute(filename)) bad('Runtime paths must be absolute.');
  let cursor = path.parse(filename).root;
  for (const part of path.resolve(filename).slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    if ((await fs.lstat(cursor)).isSymbolicLink()) bad('Symlink in runtime path.');
  }
  if (!(await fs.lstat(filename)).isFile()) bad('Runtime asset is not a regular file.');
  return fs.readFile(filename);
}
const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let toolRoot = moduleRoot, sourceRoot = moduleRoot;
let hasSkill = false;
try { hasSkill = (await fs.lstat(path.join(moduleRoot, 'SKILL.md'))).isFile(); }
catch (error) { if (errorCode(error) !== 'ENOENT') throw error; }
if (!hasSkill) {
  // Written by stage-runtime at the exact compiled-module location. No upward searching or env/global configuration.
  const context: unknown = JSON.parse((await regularBytes(path.join(path.dirname(fileURLToPath(import.meta.url)), 'development-context.json'))).toString('utf8'));
  if (!object(context) || context.contextVersion !== 1 || typeof context.sourceRoot !== 'string' || !path.isAbsolute(context.sourceRoot) || typeof context.runtimeRoot !== 'string' || !path.isAbsolute(context.runtimeRoot)) bad('Invalid development context; rebuild from the confirmed source root.');
  toolRoot = context.runtimeRoot; sourceRoot = context.sourceRoot;
}
export const TOOL_ROOT = toolRoot;
export const SOURCE_ROOT = sourceRoot;
export async function runtimeEntries(root = TOOL_ROOT) {
  const installed = (await fs.lstat(path.join(root, 'SKILL.md'))).isFile();
  if (!installed) bad('Use a built runtime or standalone installation. Run npm run build in the source directory.');
  return { installed, entries: [
    ...runtimeFiles.map(name => ({ source: name, destination: name })),
    { source: 'SKILL.md', destination: 'SKILL.md' },
    { source: 'agents/openai.yaml', destination: 'agents/openai.yaml' },
    ...referenceNames.map(name => ({ source: 'references/' + name + '.md', destination: 'references/' + name + '.md' }))
  ] };
}
export interface FileFingerprint { bytes: number; sha256: string }
export async function toolInfo(root = TOOL_ROOT) {
  root = path.resolve(root);
  const { entries } = await runtimeEntries(root);
  const pkg: unknown = JSON.parse((await regularBytes(path.join(root, 'package.json'))).toString('utf8'));
  const skill = (await regularBytes(path.join(root, 'SKILL.md'))).toString('utf8');
  if (!object(pkg) || pkg.name !== 'ai-autonomous-testing-ego-lite' || pkg.version !== TOOL_VERSION || !object(pkg.egoLiteTest) || pkg.egoLiteTest.toolRevision !== TOOL_REVISION || pkg.egoLiteTest.regressionVersion !== 1 || pkg.egoLiteTest.networkFormatVersion !== 1 || JSON.stringify(pkg.egoLiteTest.formatVersions) !== JSON.stringify(FORMAT_VERSIONS) ||
      !skill.startsWith('---\nname: ai-autonomous-testing-ego-lite\n') || !skill.includes('version: "' + TOOL_VERSION + '"') || !skill.includes('tool-revision: "' + TOOL_REVISION + '"')) bad('Skill/tool version or revision mismatch.');
  const files: Record<string, FileFingerprint> = {};
  for (const entry of [...entries, { source: 'package.json', destination: 'package.json' }].sort((a, b) => a.destination.localeCompare(b.destination, 'en'))) {
    const bytes = await regularBytes(path.join(root, entry.source));
    files[entry.destination] = { bytes: bytes.length, sha256: digest(bytes) };
  }
  const manifest: unknown = JSON.parse((await regularBytes(path.join(root, 'runtime-manifest.json'))).toString('utf8'));
  if (!object(manifest) || manifest.manifestVersion !== 1 || manifest.version !== TOOL_VERSION || manifest.toolRevision !== TOOL_REVISION || JSON.stringify(manifest.files) !== JSON.stringify(files)) bad('Installed runtime manifest mismatch; inspect changes before updating.');
  return { name: 'ai-autonomous-testing-ego-lite', version: TOOL_VERSION, toolRevision: TOOL_REVISION, formatVersions: FORMAT_VERSIONS, networkFormatVersion: 1, regressionVersion: 1,
    toolRoot: root, skillFile: path.join(root, 'SKILL.md'), installationIntegrity: 'verified', fileCount: Object.keys(files).length,
    fingerprint: digest(JSON.stringify(files)), files };
}
