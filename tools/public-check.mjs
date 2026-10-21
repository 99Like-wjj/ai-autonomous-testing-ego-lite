#!/usr/bin/env node
// Heuristic current-tree publication check. Never prints a matching secret value.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootFiles = new Set(['README.md', 'README.zh-CN.md', 'LICENSE', 'SECURITY.md', 'CHANGELOG.md', 'package.json', '.gitignore', '.gitattributes']);
const dirs = new Set(['skills', 'scripts', 'schemas', 'examples', 'docs', 'tests', 'tools']);
const textExtensions = new Set(['.md', '.mjs', '.json', '.svg', '.yaml', '.yml']);
const forbiddenSegments = /^(?:\.env(?:\..*)?|\.local|local|private|projects|runs|run-output|evidence|reports|screenshots|traces|profiles|node_modules|credentials.*|secrets.*|auth\.json|cookies.*|storage-?state.*)$/i;
const secretPatterns = [
  ['private-key', /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['model-key', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/],
  ['cloud-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['bearer-value', /\bBearer\s+[A-Za-z0-9._~+\/-]{24,}/i],
  ['jwt-value', /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/],
  ['credential-url', /https?:\/\/[^\s/@:]+:[^\s/@]+@/i],
];
const files = [];
const errors = [];
async function walk(relative = '') {
  for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
    if (!relative && entry.name === '.git') continue;
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (secretPatterns.some(([, pattern]) => pattern.test(name))) { errors.push('[redacted filename]: possible credential in path; inspect locally'); continue; }
    if (entry.isSymbolicLink()) { errors.push(`${name}: symlink is not publishable`); continue; }
    if (name.split('/').some(segment => forbiddenSegments.test(segment))) { errors.push(`${name}: private/output path is not publishable`); continue; }
    if (!relative && !(entry.isDirectory() ? dirs.has(entry.name) : rootFiles.has(entry.name))) { errors.push(`${name}: outside publication allowlist`); continue; }
    if (entry.isDirectory()) { await walk(name); continue; }
    if (!entry.isFile()) { errors.push(`${name}: not a regular file`); continue; }
    const extension = path.extname(name).toLowerCase();
    if (!rootFiles.has(name) && !textExtensions.has(extension) && name !== 'docs/images/render.py' && !(name.startsWith('docs/images/') && extension === '.png')) { errors.push(`${name}: unsupported publication file type`); continue; }
    const bytes = await fs.readFile(path.join(root, name));
    if (bytes.length > 10 * 1024 * 1024) errors.push(`${name}: exceeds per-file review size`);
    if (extension === '.png') {
      if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') errors.push(`${name}: invalid PNG signature`);
    } else {
      const text = bytes.toString('utf8');
      if (text.includes('\0') || !Buffer.from(text, 'utf8').equals(bytes)) errors.push(`${name}: invalid text encoding`);
      for (const [label, pattern] of secretPatterns) if (pattern.test(text)) errors.push(`${name}: possible ${label}; inspect locally (value suppressed)`);
      if (extension === '.md') {
        for (const match of text.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
          const ref = match[1].split('#')[0];
          if (!ref || /^[a-z][a-z0-9+.-]*:/i.test(ref)) continue;
          let target;
          try { target = path.resolve(path.dirname(path.join(root, name)), decodeURIComponent(ref)); }
          catch { errors.push(`${name}: invalid link encoding`); continue; }
          const rel = path.relative(root, target);
          if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) { errors.push(`${name}: link leaves publication root`); continue; }
          try { await fs.stat(target); } catch { errors.push(`${name}: missing relative link (target suppressed)`); }
        }
      }
    }
    files.push(name);
  }
}
await walk();
files.sort();
if (errors.length) {
  process.stderr.write(JSON.stringify({ ok: false, errors, scannedFiles: files.length }, null, 2) + '\n');
  process.exitCode = 1;
} else {
  process.stdout.write(JSON.stringify({ ok: true, files, limitations: ['Current allowlisted files only; Git history and remote artifacts are not scanned.', 'Patterns are heuristic; image content and business privacy require manual review.', 'This is not a credential detector or a permission sandbox.'] }, null, 2) + '\n');
}
