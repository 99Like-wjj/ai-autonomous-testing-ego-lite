/** JSON Schema is the external contract. Generation does not replace runtime checks. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { compileFromFile } from 'json-schema-to-typescript';

const root = path.resolve(process.cwd());
const mode = process.argv[2];
if (!['--check', '--write'].includes(mode ?? '')) throw new Error('Use --check or --write from the source root.');
const pkg: unknown = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
if (!pkg || typeof pkg !== 'object' || !('name' in pkg) || pkg.name !== 'ai-autonomous-testing-ego-lite') throw new Error('Expected the source root.');
const directory = path.join(root, 'src/contracts/generated');
if (mode === '--write') await fs.mkdir(directory, { recursive: true });
for (const name of (await fs.readdir(path.join(root, 'schemas'))).filter(name => name.endsWith('.schema.json')).sort()) {
  const target = path.join(directory, name.replace('.schema.json', '.d.mts'));
  const text = await compileFromFile(path.join(root, 'schemas', name), {
    cwd: path.join(root, 'schemas'), unknownAny: true, additionalProperties: false, ignoreMinAndMaxItems: true,
    bannerComment: '/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */',
    style: { singleQuote: true, semi: true, tabWidth: 2, trailingComma: 'none' }
  });
  if (mode === '--write') await fs.writeFile(target, text, 'utf8');
  else if (await fs.readFile(target, 'utf8') !== text) throw new Error('Generated contract drift: ' + name);
}
process.stdout.write('Schema declarations ' + (mode === '--write' ? 'generated' : 'verified') + '.\n');
