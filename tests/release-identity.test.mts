import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TOOL_VERSION, TOOL_REVISION } from '../src/contracts/layout.mjs';
import { SOURCE_ROOT } from '../src/scripts/toolchain.mjs';

test('release identity agrees across package, lockfile, Skill and current guides', async () => {
  const read = (name: string) => fs.readFile(path.join(SOURCE_ROOT, name), 'utf8');
  const pkg = JSON.parse(await read('package.json'));
  const lock = JSON.parse(await read('package-lock.json'));
  assert.equal(TOOL_VERSION, '0.2.1');
  assert.equal(pkg.name, 'ai-testing-ego-lite');
  assert.equal(pkg.version, TOOL_VERSION);
  assert.equal(lock.version, TOOL_VERSION);
  assert.equal(lock.packages[''].version, TOOL_VERSION);
  assert.equal(pkg.egoLiteTest.toolRevision, TOOL_REVISION);
  assert.ok((await read('skills/ai-testing-ego-lite/SKILL.md')).includes('version: "'+TOOL_VERSION+'"'));
  const config = await read('skills/ai-testing-ego-lite/agents/openai.yaml');
  assert.match(config, /display_name: "AI 自动化测试 · Ego Lite"/);
  assert.doesNotMatch(config, /dev|rc\.\d+/i);
  for (const file of ['README.md', 'README.en.md', 'docs/asset-formats.md', 'docs/asset-formats.en.md', 'docs/architecture.md', 'docs/architecture.en.md', 'docs/regression-reuse.md', 'docs/version-history.md', 'docs/version-history.en.md', 'skills/ai-testing-ego-lite/SKILL.md', 'skills/ai-testing-ego-lite/references/local-toolbox.md', 'skills/ai-testing-ego-lite/references/local-toolbox.en.md']) {
    assert.doesNotMatch(await read(file), /0\.1\.7-(?:dev|rc)/, file);
  }
});


test('current branding is consistent without changing autonomous-testing behavior or historical names', async () => {
  const current = ['README.md', 'README.en.md', 'INSTALL.zh-CN.md', 'skills/ai-testing-ego-lite/SKILL.md', 'skills/ai-testing-ego-lite/agents/openai.yaml', 'docs/v0.2.1-design.md', 'docs/v0.2.1-rename-design.md', 'docs/images/render.mts', 'docs/images/hero.svg', 'docs/images/hero.zh-CN.svg'];
  for (const name of current) {
    const text = await fs.readFile(path.join(SOURCE_ROOT, name), 'utf8');
    assert.doesNotMatch(text, /AI 自主自动化测试|AI Autonomous Testing|AI AUTONOMOUS TESTING/, name);
  }
  const config = await fs.readFile(path.join(SOURCE_ROOT, 'skills/ai-testing-ego-lite/agents/openai.yaml'), 'utf8');
  assert.match(config, /由 AI 自主分析与规划/);
  assert.match(config, /使用 \$ai-testing-ego-lite/);
  assert.match(await fs.readFile(path.join(SOURCE_ROOT, 'docs/images/hero.zh-CN.svg'), 'utf8'), /AI 自主规划与执行/);
  assert.match(await fs.readFile(path.join(SOURCE_ROOT, 'docs/v0.1.7-release-validation.md'), 'utf8'), /AI 自主自动化测试 · Ego Lite/);
});


test('published current documentation removes review holds while preserving release and candidate history', async () => {
  const read = (name: string) => fs.readFile(path.join(SOURCE_ROOT, name), 'utf8');
  for (const name of ['README.md', 'README.en.md']) {
    const text = await read(name);
    assert.doesNotMatch(text, /发布前人工审核快照|Pre-release manual review snapshot|尚未创建 Tag|no tag or Release has been created/);
    assert.ok(text.includes('releases/tag/v' + TOOL_VERSION), name);
  }
  const chinese = await read('README.md');
  assert.ok(chinese.includes('当前正式版本为 ' + TOOL_VERSION));
  assert.ok(chinese.includes('docs/v' + TOOL_VERSION + '-release-validation.md'));
  const english = await read('README.en.md');
  assert.ok(english.includes(TOOL_VERSION + ' is the current stable version'));
  assert.ok(english.includes('docs/v' + TOOL_VERSION + '-release-validation.md'));
  const changelog = await read('CHANGELOG.md');
  assert.match(changelog, /^## 0\.2\.1 \/ attachments-review-2 .*正式版本$/m);
  assert.match(changelog, /^## 0\.2\.1-rc\.1 .*开发候选，未发布$/m);
  const validation = await read('docs/v0.2.1-release-validation.md');
  assert.match(validation, /状态：已于 2026-11-06 完成人工审核并正式发布/);
  assert.match(validation, /5bccc9c8aa0402c7d03f986793050d6617bacc4b/);
  assert.match(validation, /1af1c951bb1ecb466718f3075a494e0cfd2c1953e3ac1f09fa4535af00ad8ed2/);
  assert.match(validation, /当时本机安装未操作，发版仍暂停等待人工审核/);
});
