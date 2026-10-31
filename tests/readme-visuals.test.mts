import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SOURCE_ROOT } from '../src/scripts/ego.mjs';

test('both READMEs retain the documented visual sections and historical navigation', async () => {
  for (const [file, suffix, history] of [['README.md', '.zh-CN', 'docs/version-history.md'], ['README.en.md', '', 'docs/version-history.en.md']] as const) {
    const text = await fs.readFile(path.join(SOURCE_ROOT, file), 'utf8');
    for (const name of ['hero', 'readme-version-history', 'workflow', 'result-specimen', 'architecture', 'parallel']) {
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

test('README timeline contains four versions and labels the current candidate without promoting it', async () => {
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
    assert.equal(versions.at(-1), current);
    if (!pkg.version.includes('-')) assert.equal(stable, pkg.version);
    else {
      assert.ok(readme.includes(pkg.version));
      assert.equal(versions.at(-2), stable);
      assert.match(svg, /RC\.1 · NOT RELEASED|候选 rc\.1 · 未发布/);
    }
    assert.ok((await fs.stat(path.join(SOURCE_ROOT, `docs/images/version-history${suffix}.svg`))).size > 0);
  }
});

 test('current illustrations explain report and regression boundaries in both languages', async () => {
  for (const suffix of ['', '.zh-CN']) {
    const read = (name: string) => fs.readFile(path.join(SOURCE_ROOT, `docs/images/${name}${suffix}.svg`), 'utf8');
    assert.match(await read('hero'), /0\.1\.7-rc\.1/);
    assert.match(await read('hero'), /NOT RELEASED|尚未发布/);
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
