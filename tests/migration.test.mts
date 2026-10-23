import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateImages } from '../docs/images/render.mjs';
import { SOURCE_ROOT, safePath } from '../src/scripts/ego.mjs';
import { buildSkill } from '../tools/build-skill.mjs';
import { checkPublication } from '../tools/public-check.mjs';

test('TypeScript diagram generator preserves all eight original SVGs and refuses overwrite', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ego-migration-'));
  t.after(async () => { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('ego-migration-')); await fs.rm(root, { recursive: true, force: true }); });
  const target = path.join(root, 'images'), generated = await generateImages(target);
  assert.equal(generated.svgFiles, 8);
  const names = (await fs.readdir(target)).filter(name => name.endsWith('.svg'));
  assert.equal(names.length, 8);
  for (const name of names) assert.deepEqual(await fs.readFile(path.join(target, name)), await fs.readFile(path.join(SOURCE_ROOT, 'docs/images', name)), name);
  await assert.rejects(generateImages(target), { code: 'EEXIST' });
  for (const name of names) assert.deepEqual(await fs.readFile(path.join(target, name)), await fs.readFile(path.join(SOURCE_ROOT, 'docs/images', name)), name);
});

test('directory links are rejected by records, installation builder, and publication checker', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ego-junction-'));
  t.after(async () => { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('ego-junction-')); await fs.rm(root, { recursive: true, force: true }); });
  const target = path.join(root, 'target'), publication = path.join(root, 'public');
  await fs.mkdir(target); await fs.mkdir(publication); await fs.mkdir(path.join(publication, 'docs'));
  await fs.writeFile(path.join(target, 'asset.json'), '{}');
  const link = path.join(publication, 'docs', 'linked');
  await fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(safePath(path.join(link, 'asset.json'), { existing: true }), /Symlink/);
  await assert.rejects(buildSkill(path.join(link, 'new-skill')), /Symlink/);
  const checked = await checkPublication(publication);
  assert.equal(checked.ok, false);
  assert.ok('errors' in checked && checked.errors?.some(error => error.includes('symlink')));
  assert.equal(await fs.readFile(path.join(target, 'asset.json'), 'utf8'), '{}');
});
