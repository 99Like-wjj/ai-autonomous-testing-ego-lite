/** Bundle the typed browser entry; only fixed local presentation modules enter it. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
const root = path.resolve(process.cwd()), entry = path.join(root, '.build/browser/review-ui/main.js');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')) as { name: string };
if (pkg.name !== 'ai-autonomous-testing-ego-lite') throw Error('Run from the confirmed source root.');
const output = await build({ entryPoints: [entry], bundle: true, platform: 'browser', format: 'iife', target: 'es2022', write: false, outfile: path.join(root, '.build/browser/review-ui/bundled.js'), legalComments: 'none' });
if (output.outputFiles.length !== 1) throw Error('Unexpected review UI bundle output.');
await fs.writeFile(entry, output.outputFiles[0]!.contents);
process.stdout.write('Typed case review UI bundled.\n');
