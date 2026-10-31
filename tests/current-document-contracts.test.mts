import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeCases } from '../src/core/baseline.mjs';
import { FORMAT_VERSIONS } from '../src/contracts/layout.mjs';
import { SOURCE_ROOT } from '../src/scripts/toolchain.mjs';

test('current request examples in guides use the runtime contract, without rewriting historical documents', async () => {
  const files = ['skills/ai-autonomous-testing-ego-lite/references/case-authoring.md', 'skills/ai-autonomous-testing-ego-lite/references/local-toolbox.md', 'skills/ai-autonomous-testing-ego-lite/references/parallel-testing.md', 'docs/asset-formats.md'];
  let requests = 0;
  const visit = (value: unknown, source: string) => {
    if (value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(v => visit(v, source)); return; }
    const object = value as Record<string, unknown>;
    if (Object.hasOwn(object, 'schemaVersion')) { assert.equal(object.schemaVersion, FORMAT_VERSIONS.cases, source); requests++; }
    Object.values(object).forEach(v => visit(v, source));
  };
  for (const name of files) {
    const text = await fs.readFile(path.join(SOURCE_ROOT, name), 'utf8');
    for (const match of text.matchAll(/```json\s*\n([\s\S]*?)```/g)) visit(JSON.parse(match[1]!), name);
  }
  assert.ok(requests >= 4, 'Current guides must contain usable request examples.');
});

test('current prose agrees with runtime configuration and execution view versions', async () => {
  const read = (file: string) => fs.readFile(path.join(SOURCE_ROOT, file), 'utf8');
  assert.match(await read('docs/architecture.en.md'), new RegExp(`contracts use version ${FORMAT_VERSIONS.cases}`));
  assert.match(await read('docs/asset-formats.md'), new RegExp(`配置 schemaVersion 为 ${FORMAT_VERSIONS.configuration}`));
  assert.match(await read('skills/ai-autonomous-testing-ego-lite/references/local-toolbox.en.md'), new RegExp(`execution query viewVersion ${FORMAT_VERSIONS.executionRead}`));
  assert.match(await read('docs/asset-formats.md'), /每个 goal 有 id、title/);
  assert.match(await read('docs/asset-formats.en.md'), /Each goal has id, title/);
});

test('validation indexes keep one copy of each historical section', async () => {
  for (const name of ['docs/testing.md', 'docs/testing.en.md']) {
    const content = await fs.readFile(path.join(SOURCE_ROOT, name), 'utf8');
    assert.equal([...content.matchAll(/^# /gm)].length, 1, name);
    const sections = [...content.matchAll(/^## (.+)$/gm)].map(match => match[1]);
    assert.equal(sections.length, new Set(sections).size, name);
    assert.match(content, /report-usability/);
  }
});

test('case-authoring documentation contains cases accepted by the real runtime validator', async () => {
  const content = await fs.readFile(path.join(SOURCE_ROOT, 'skills/ai-autonomous-testing-ego-lite/references/case-authoring.md'), 'utf8');
  const examples = [...content.matchAll(/```json\s*\n([\s\S]*?)```/g)];
  assert.ok(examples.length > 0);
  for (const example of examples) {
    const normalized = normalizeCases(JSON.parse(example[1]!));
    assert.ok(normalized.cases.every(c => c.goals.every(goal => goal.title.length > 0)));
  }
});
