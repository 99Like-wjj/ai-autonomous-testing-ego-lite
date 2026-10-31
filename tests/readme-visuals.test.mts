import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SOURCE_ROOT } from '../src/scripts/ego.mjs';

test('both READMEs retain the documented visual sections and historical navigation', async () => {
  for (const [file, suffix, history] of [['README.md', '.zh-CN', 'docs/version-history.md'], ['README.en.md', '', 'docs/version-history.en.md']] as const) {
    const text = await fs.readFile(path.join(SOURCE_ROOT, file), 'utf8');
    for (const name of ['design-philosophy', 'hero', 'readme-version-history', 'workflow', 'result-specimen', 'parallel']) {
      const pattern = new RegExp('docs/images/' + name + suffix.replaceAll('.', '\\.') + '\\.(?:png|svg)');
      const match = text.match(pattern);
      assert.ok(match, `${file}: missing ${name} diagram reference`);
      assert.ok((await fs.stat(path.join(SOURCE_ROOT, match[0]))).size > 0);
    }
    assert.ok(text.includes(history), `${file}: missing full version history`);
    assert.ok(text.includes('docs/requirements.md'), `${file}: missing historical requirements`);
    assert.ok(text.includes('docs/rename-upgrade.md'), `${file}: missing upgrade guidance`);
  }
});

test('README timeline contains four versions and labels the current release consistently', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(SOURCE_ROOT, 'package.json'), 'utf8')) as { version: string };
  for (const suffix of ['', '.zh-CN']) {
    const svg = await fs.readFile(path.join(SOURCE_ROOT, `docs/images/readme-version-history${suffix}.svg`), 'utf8');
    const versions = [...svg.matchAll(/>v(\d+\.\d+\.\d+)</g)].map(m => m[1]);
    assert.equal(versions.length, 4);
    assert.equal(new Set(versions).size, 4);
    const readme = await fs.readFile(path.join(SOURCE_ROOT, suffix ? 'README.md' : 'README.en.md'), 'utf8');
    const stable = readme.match(/releases\/tag\/v(\d+\.\d+\.\d+)/)?.[1];
    assert.ok(stable, 'README must identify its last stable release');
    const current = pkg.version.split('-')[0];
    assert.equal(versions[0], current);
    if (!pkg.version.includes('-')) {
      assert.equal(stable, pkg.version);
      assert.doesNotMatch(svg, /RC\.1|候选|NOT RELEASED|未发布/);
      assert.match(svg, /RELEASED|正式发布/);
    }
    else {
      assert.ok(readme.includes(pkg.version));
      assert.equal(versions[1], stable);
      assert.match(svg, /RC\.1 · NOT RELEASED|候选 rc\.1 · 未发布/);
    }
    assert.ok((await fs.stat(path.join(SOURCE_ROOT, `docs/images/version-history${suffix}.svg`))).size > 0);
  }
});

 test('current illustrations explain report and regression boundaries in both languages', async () => {
  for (const suffix of ['', '.zh-CN']) {
    const read = (name: string) => fs.readFile(path.join(SOURCE_ROOT, `docs/images/${name}${suffix}.svg`), 'utf8');
    assert.match(await read('hero'), /0\.1\.7/);
    assert.match(await read('hero'), /STABLE RELEASE|正式版本/);
    assert.doesNotMatch(await read('hero'), /rc\.1|NOT RELEASED|尚未发布/);
    assert.match(await read('workflow'), /whole scenarios|整条场景/);
    assert.match(await read('workflow'), /not automatically replayed|不自动重放/);
    assert.match(await read('result-specimen'), /NOT A REAL REPORT SCREENSHOT|非真实报告截图/);
    assert.match(await read('result-specimen'), /ACTUAL STEPS|实际步骤/);
    assert.match(await read('result-specimen'), /never rewrite business outcomes|不改写业务四态/);
  }
});

test('feedback follows all project sections and precedes the final license in both READMEs', async () => {
  for (const [file, contact, license] of [['README.md', '问题反馈与联系', '许可证'], ['README.en.md', 'Feedback and contact', 'License']] as const) {
    const content = await fs.readFile(path.join(SOURCE_ROOT, file), 'utf8');
    const headings = [...content.matchAll(/^## (.+)$/gm)].map(match => match[1]);
    assert.deepEqual(headings.slice(-2), [contact, license]);
    assert.ok(content.includes('docs/images/wechat-contact-qr.png'));
    assert.ok(content.includes('https://github.com/99Like-wjj/ai-autonomous-testing-ego-lite/issues'));
  }
});

test('README highlights the current version while retaining the detailed 0.1.6 history', async () => {
  for (const [readme, history, heading, oldHeading, detail] of [
    ['README.md', 'docs/version-history.md', '## 0.1.7 做了什么', '## v0.1.6 已交付的基础能力', '### 0.1.6 能力补充与验证依据'],
    ['README.en.md', 'docs/version-history.en.md', '## What changed in 0.1.7', '## Capabilities delivered in v0.1.6', '### v0.1.6 detailed capabilities and validation sources']
  ] as const) {
    const current = await fs.readFile(path.join(SOURCE_ROOT, readme), 'utf8');
    const previous = await fs.readFile(path.join(SOURCE_ROOT, history), 'utf8');
    assert.ok(current.includes(heading)); assert.ok(!current.includes(oldHeading));
    assert.ok(previous.includes(detail));
    for (const topic of ['v0.1.6-development-validation.md', 'v0.1.6-goal-assessment-validation.md', 'v0.1.6-network-validation.md', 'v0.1.6-cross-host-integration.md']) assert.ok(previous.includes(topic));
  }
});

test('version history pages and diagrams list developed versions newest first, excluding planning', async () => {
  for (const suffix of ['', '.zh-CN']) {
    const full = await fs.readFile(path.join(SOURCE_ROOT, `docs/images/version-history${suffix}.svg`), 'utf8');
    const recent = await fs.readFile(path.join(SOURCE_ROOT, `docs/images/readme-version-history${suffix}.svg`), 'utf8');
    const versions = (svg: string) => [...svg.matchAll(/>v(\d+\.\d+\.\d+)</g)].map(match => match[1]);
    assert.deepEqual(versions(full), ['0.1.7', '0.1.6', '0.1.5', '0.1.4', '0.1.3', '0.1.2']);
    assert.deepEqual(versions(recent), ['0.1.7', '0.1.6', '0.1.5', '0.1.4']);
    const page = await fs.readFile(path.join(SOURCE_ROOT, suffix ? 'docs/version-history.md' : 'docs/version-history.en.md'), 'utf8');
    assert.deepEqual([...page.matchAll(/^## v(\d+\.\d+\.\d+)/gm)].map(match => match[1]), ['0.1.7', '0.1.6', '0.1.5']);
    assert.ok(!page.includes('v0.1.8'));
  }
});

test('approved philosophy precedes version details and architecture visuals remain available', async () => {
  for (const [readme, philosophy, version, architecture, suffix] of [
    ['README.md', '## 设计理念：AI 主导，工具提供能力', '## 当前版本', 'docs/architecture.md', '.zh-CN'],
    ['README.en.md', '## Design philosophy: AI leads, tools provide capabilities', '## Current release', 'docs/architecture.en.md', '']
  ] as const) {
    const page = await fs.readFile(path.join(SOURCE_ROOT, readme), 'utf8');
    assert.equal(page.split(philosophy).length - 1, 1);
    assert.ok(page.indexOf(philosophy) < page.indexOf(version));
    assert.ok(page.includes(`docs/images/design-philosophy${suffix}.png`));
    assert.ok(!page.includes(`docs/images/architecture${suffix}.png`));
    const architectureText = await fs.readFile(path.join(SOURCE_ROOT, architecture), 'utf8');
    assert.ok(architectureText.includes(`images/architecture${suffix}.png`));
    assert.ok((await fs.stat(path.join(SOURCE_ROOT, `docs/images/architecture${suffix}.png`))).size > 0);
    const diagram = await fs.readFile(path.join(SOURCE_ROOT, `docs/images/design-philosophy${suffix}.svg`), 'utf8');
    assert.match(diagram, /AI leads|AI 主导/);
    assert.match(diagram, /Authorization|授权边界/);
    assert.match(diagram, /No fixed business decision tree|不把业务测试写成固定决策树/);
  }
});
