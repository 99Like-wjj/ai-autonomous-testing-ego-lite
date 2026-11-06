import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeCases } from '../src/core/baseline.mjs';
import { FORMAT_VERSIONS } from '../src/contracts/layout.mjs';
import { SOURCE_ROOT } from '../src/scripts/toolchain.mjs';

test('current request examples in guides use the runtime contract, without rewriting historical documents', async () => {
  const files = ['skills/ai-testing-ego-lite/references/case-authoring.md', 'skills/ai-testing-ego-lite/references/local-toolbox.md', 'skills/ai-testing-ego-lite/references/parallel-testing.md', 'docs/asset-formats.md'];
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
  assert.match(await read('skills/ai-testing-ego-lite/references/local-toolbox.en.md'), new RegExp(`execution read viewVersion ${FORMAT_VERSIONS.executionRead}`));
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
  const content = await fs.readFile(path.join(SOURCE_ROOT, 'skills/ai-testing-ego-lite/references/case-authoring.md'), 'utf8');
  const examples = [...content.matchAll(/```json\s*\n([\s\S]*?)```/g)];
  assert.ok(examples.length > 0);
  for (const example of examples) {
    const normalized = normalizeCases(JSON.parse(example[1]!));
    assert.ok(normalized.cases.every(c => c.goals.every(goal => goal.title.length > 0)));
  }
});


test('Chinese knowledge diagram localizes labels while preserving the English graph and Chinese entry link', async () => {
  const read = (file: string) => fs.readFile(path.join(SOURCE_ROOT, file), 'utf8');
  const chinese = await read('docs/architecture.md');
  const english = await read('docs/architecture.en.md');
  const diagram = (text: string) => text.match(/```mermaid\n([\s\S]*?)```/)?.[1] ?? '';
  const zh = diagram(chinese), en = diagram(english);
  assert.ok(zh && en);
  const graph = (text: string) => text.replace(/\[[^\]]*\]/g, '[]').replace(/\|[^|]*\|/g, '|label|');
  assert.equal(graph(zh), graph(en), 'Localization must preserve nodes, edges and direction.');
  for (const label of ['创建 / 更新', '独立项目知识 v3', '检查 / 检索 / 读取', 'Ego 知识工具', '带来源信息的上下文', 'AI 规划与执行测试', '通用测试经验', '当前需求与授权']) assert.ok(zh.includes(label), label);
  for (const identifier of ['project-knowledge-maintainer', 'inspect / query / read', 'Ego', 'v3']) assert.ok(zh.includes(identifier), identifier);
  assert.doesNotMatch(zh, /create \/ update|Independent knowledge|Generic testing experience|Current requirements and authorization/);
  assert.match(en, /create \/ update/);
  assert.match(en, /Generic testing experience/);
  assert.match(await read('docs/architecture.zh-CN.md'), /\[完整文档\]\(architecture\.md\)/);
});
