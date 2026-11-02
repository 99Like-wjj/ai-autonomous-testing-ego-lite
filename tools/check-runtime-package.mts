/** Build-time checks only. Never removes files or updates an installed Skill. */
import fs from 'node:fs/promises';
import path from 'node:path';

export async function checkRuntimePackage(root: string, expectedFiles: readonly string[]) {
  const expected = [...expectedFiles].sort();
  if (new Set(expected).size !== expected.length) throw Error('Duplicate runtime file in distribution list.');
  if (!(await fs.lstat(root)).isDirectory() || (await fs.lstat(root)).isSymbolicLink()) throw Error('Runtime root must be an ordinary directory.');
  const actual: string[] = [];
  async function visit(directory: string) {
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, item.name);
      if (item.isSymbolicLink()) throw Error('Symlink in distribution tree.');
      if (item.isDirectory()) await visit(full);
      else if (item.isFile()) actual.push(path.relative(root, full).split(path.sep).join('/'));
      else throw Error('Non-regular distribution entry.');
    }
  }
  await visit(root);
  actual.sort();
  const missing = expected.filter(name => !actual.includes(name));
  const extra = actual.filter(name => !expected.includes(name));
  if (missing.length || extra.length) throw Error(`Runtime file set mismatch. Missing: ${missing.join(', ')}; extra: ${extra.join(', ')}. Inspect files; do not blindly delete user data.`);
  const files = new Set(actual);
  for (const name of actual.filter(name => name.endsWith('.md'))) {
    const source = (await fs.readFile(path.join(root, name), 'utf8')).replace(/```[\s\S]*?```/g, '');
    for (const match of source.matchAll(/!?\[[^\]\n]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
      const href = match[1]!.replace(/^<|>$/g, '');
      if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(href)) continue;
      const local = decodeURIComponent(href.split(/[?#]/)[0]!);
      if (!local) continue;
      const destination = path.posix.normalize(path.posix.join(path.posix.dirname(name), local));
      if (destination.startsWith('../') || path.posix.isAbsolute(local) || !files.has(destination)) throw Error(`Broken local distribution link: ${name} -> ${href}`);
    }
  }
  return { fileCount: actual.length, inlineMarkdownFileLinks: 'verified' };
}
