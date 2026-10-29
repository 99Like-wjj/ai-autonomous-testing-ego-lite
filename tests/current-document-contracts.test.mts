import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
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
