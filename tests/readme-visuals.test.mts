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

test('README timeline contains four stable releases and does not promote a development candidate', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(SOURCE_ROOT, 'package.json'), 'utf8')) as { version: string };
  for (const suffix of ['', '.zh-CN']) {
    const svg = await fs.readFile(path.join(SOURCE_ROOT, `docs/images/readme-version-history${suffix}.svg`), 'utf8');
    const versions = [...svg.matchAll(/>v(\d+\.\d+\.\d+)</g)].map(m => m[1]);
    assert.equal(versions.length, 4);
    assert.equal(new Set(versions).size, 4);
    const readme = await fs.readFile(path.join(SOURCE_ROOT, suffix ? 'README.md' : 'README.en.md'), 'utf8');
    const stable = readme.match(/releases\/tag\/v(\d+\.\d+\.\d+)/)?.[1];
    assert.ok(stable, 'README must identify its last stable release');
    assert.equal(versions.at(-1), stable);
    if (!pkg.version.includes('-')) assert.equal(stable, pkg.version);
    else { assert.ok(readme.includes(pkg.version)); assert.ok(!versions.includes(pkg.version)); }
    assert.doesNotMatch(svg, /IN DEVELOPMENT|开发中，未发布/);
    assert.ok((await fs.stat(path.join(SOURCE_ROOT, `docs/images/version-history${suffix}.svg`))).size > 0);
  }
});
