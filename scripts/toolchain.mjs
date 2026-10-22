/** Runtime identity and installation integrity only; no business decisions. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const TOOL_VERSION = '0.1.3';
export const TOOL_REVISION = 'html-report-delivery-1';
export const TOOL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const runtimeFiles = [
  'scripts/ego.mjs', 'scripts/toolchain.mjs', 'LICENSE',
  'schemas/common.schema.json', 'schemas/cases.schema.json', 'schemas/manifest.schema.json',
  'schemas/evidence.schema.json', 'schemas/evidence-request.schema.json',
  'schemas/results.schema.json', 'schemas/record-request.schema.json',
  'schemas/report.schema.json', 'schemas/report-context.schema.json',
  'docs/asset-formats.md', 'docs/asset-formats.en.md',
  'examples/cases.example.json', 'examples/generated-cases.example.json',
  'examples/evidence-request.example.json', 'examples/record-request.example.json',
  'examples/project.example/brief.md', 'examples/project.example/feature-request.md', 'examples/project.example/usage.md'
];
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const bad = message => { throw new Error(message); };
export async function regularBytes(filename) {
  let cursor = path.parse(filename).root;
  for (const part of path.resolve(filename).slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    if ((await fs.lstat(cursor)).isSymbolicLink()) bad('Symlink in runtime path.');
  }
  if (!(await fs.lstat(filename)).isFile()) bad('Runtime asset is not a regular file.');
  return fs.readFile(filename);
}
export async function runtimeEntries(root = TOOL_ROOT) {
  let installed;
  try { await fs.lstat(path.join(root, 'SKILL.md')); installed = true; }
  catch (error) { if (error.code !== 'ENOENT') throw error; installed = false; }
  const skillPrefix = installed ? '' : 'skills/ego-lite-test/';
  const entries = runtimeFiles.map(name => ({ source: name, destination: name }));
  entries.push({ source: skillPrefix + 'SKILL.md', destination: 'SKILL.md' });
  for (const name of ['case-authoring', 'ego-usage-boundaries', 'evidence-and-report', 'judgment-and-diagnosis', 'local-toolbox', 'local-toolbox.en', 'test-strategy']) {
    entries.push({ source: skillPrefix + 'references/' + name + '.md', destination: 'references/' + name + '.md' });
  }
  return { installed, entries };
}
export async function toolInfo(root = TOOL_ROOT) {
  const { installed, entries } = await runtimeEntries(root);
  const pkg = JSON.parse(await regularBytes(path.join(root, 'package.json')));
  const skill = (await regularBytes(path.join(root, installed ? 'SKILL.md' : 'skills/ego-lite-test/SKILL.md'))).toString('utf8');
  if (pkg.name !== 'ego-lite-test-skill' || pkg.version !== TOOL_VERSION || pkg.egoLiteTest?.toolRevision !== TOOL_REVISION || pkg.egoLiteTest?.schemaVersion !== 3 ||
      !skill.includes('version: "' + TOOL_VERSION + '"') || !skill.includes('tool-revision: "' + TOOL_REVISION + '"')) bad('Skill/tool version or revision mismatch.');
  const files = {};
  for (const entry of [...entries, { source: 'package.json', destination: 'package.json' }].sort((a,b) => a.destination.localeCompare(b.destination, 'en'))) {
    const bytes = await regularBytes(path.join(root, entry.source));
    files[entry.destination] = { bytes: bytes.length, sha256: digest(bytes) };
  }
  if (installed) {
    const manifest = JSON.parse(await regularBytes(path.join(root, 'runtime-manifest.json')));
    if (manifest.manifestVersion !== 1 || manifest.version !== TOOL_VERSION || manifest.toolRevision !== TOOL_REVISION ||
        JSON.stringify(manifest.files) !== JSON.stringify(files)) bad('Installed runtime manifest mismatch; inspect changes before updating.');
  }
  return { name: pkg.name, version: TOOL_VERSION, toolRevision: TOOL_REVISION, schemaVersion: 3,
    toolRoot: path.resolve(root), skillFile: path.join(root, installed ? 'SKILL.md' : 'skills/ego-lite-test/SKILL.md'),
    installationIntegrity: installed ? 'verified' : 'source-layout', fileCount: Object.keys(files).length,
    fingerprint: digest(JSON.stringify(files)), files };
}
