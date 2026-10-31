import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TOOL_VERSION, TOOL_REVISION } from '../src/contracts/layout.mjs';
import { SOURCE_ROOT } from '../src/scripts/toolchain.mjs';

test('formal release identity agrees across package, lockfile, Skill and current guides', async () => {
  const read = (name: string) => fs.readFile(path.join(SOURCE_ROOT, name), 'utf8');
  const pkg = JSON.parse(await read('package.json'));
  const lock = JSON.parse(await read('package-lock.json'));
  assert.equal(TOOL_VERSION, '0.1.7');
  assert.equal(pkg.name, 'ai-autonomous-testing-ego-lite');
  assert.equal(pkg.version, TOOL_VERSION);
  assert.equal(lock.version, TOOL_VERSION);
  assert.equal(lock.packages[''].version, TOOL_VERSION);
  assert.equal(pkg.egoLiteTest.toolRevision, TOOL_REVISION);
  assert.match(await read('skills/ai-autonomous-testing-ego-lite/SKILL.md'), /version: "0\.1\.7"/);
  const config = await read('skills/ai-autonomous-testing-ego-lite/agents/openai.yaml');
  assert.match(config, /display_name: "AI 自主自动化测试 · Ego Lite"/);
  assert.doesNotMatch(config, /dev|rc\.1/i);
  for (const file of ['README.md', 'README.en.md', 'docs/asset-formats.md', 'docs/asset-formats.en.md', 'docs/architecture.md', 'docs/architecture.en.md', 'docs/regression-reuse.md', 'docs/version-history.md', 'docs/version-history.en.md', 'skills/ai-autonomous-testing-ego-lite/SKILL.md', 'skills/ai-autonomous-testing-ego-lite/references/local-toolbox.md', 'skills/ai-autonomous-testing-ego-lite/references/local-toolbox.en.md']) {
    assert.doesNotMatch(await read(file), /0\.1\.7-(?:dev|rc)/, file);
  }
});
