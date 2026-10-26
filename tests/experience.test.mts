import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { checkExperience } from '../tools/check-experience.mjs';
import { SOURCE_ROOT } from '../src/scripts/ego.mjs';
import { referenceNames } from '../src/contracts/layout.mjs';
const source = path.join(SOURCE_ROOT, 'skills/ai-autonomous-testing-ego-lite/references');
const added = ['case-design-guide', 'case-design-methods', 'experience-guide', 'experience-data-safety', 'experience-execution'];
test('experience indexes and shipped reference bytes agree without changing contracts', async () => {
  assert.deepEqual(await checkExperience(source), []);
  for (const name of added) {
    assert.ok(referenceNames.includes(name));
    assert.deepEqual(await fs.readFile(path.join(source, name + '.md')), await fs.readFile(path.join(SOURCE_ROOT, '.build/runtime/references', name + '.md')));
  }
  const skill = await fs.readFile(path.join(SOURCE_ROOT, '.build/runtime/SKILL.md'), 'utf8');
  for (const name of ['case-design-guide', 'experience-guide']) assert.ok(skill.includes('references/' + name + '.md'));
});
for (const [label, from, to] of [
  ['stage', '适用阶段：设计', '适用阶段：执行'],
  ['index-stage', '  - 阶段：设计', '  - 阶段：执行'],
  ['field', '  - 主题：边界与等价类', '  - 其他：边界与等价类'],
  ['target', 'case-design-methods.md#d-boundary', '../outside.md#d-boundary'],
  ['anchor', '<a id="d-boundary"></a>', '<a id="d-missing"></a>'],
  ['body-stage', '适用阶段：设计。', '适用阶段：执行。'],
] as const) test('experience validator rejects ' + label + ' drift', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ego-experience-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.cp(source, root, { recursive: true });
  const target = path.join(root, label === 'anchor' || label === 'body-stage' ? 'case-design-methods.md' : 'case-design-guide.md');
  const original = await fs.readFile(target, 'utf8'); assert.ok(original.includes(from));
  await fs.writeFile(target, original.replace(from, to));
  assert.ok((await checkExperience(root)).length > 0);
});
test('experience validator rejects duplicate ids and anchors', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ego-experience-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.cp(source, root, { recursive: true });
  const guide = path.join(root, 'case-design-guide.md');
  const content = await fs.readFile(guide, 'utf8');
  const entry = content.split(/(?=^- 标识：)/m)[1]?.split(/^\s*$/m)[0]; assert.ok(entry);
  await fs.appendFile(guide, '\n' + entry + '\n\n');
  await fs.appendFile(path.join(root, 'case-design-methods.md'), '\n<a id="d-boundary"></a>\n');
  const errors = await checkExperience(root);
  assert.ok(errors.some(e => e.includes('duplicate id')));
  assert.ok(errors.some(e => e.includes('duplicate anchor')));
});

// This window must never truncate the full history data or diagrams.
import { readmeVersionWindow } from '../docs/images/render.mjs';
test('README keeps only the latest plus three previous versions without mutating history', () => {
  const all = ['1', '2', '3', '4', '5', '6'];
  assert.deepEqual(readmeVersionWindow(all), ['3', '4', '5', '6']);
  assert.equal(all.length, 6);
  assert.deepEqual(readmeVersionWindow([]), []);
  assert.deepEqual(readmeVersionWindow(['1']), ['1']);
});
