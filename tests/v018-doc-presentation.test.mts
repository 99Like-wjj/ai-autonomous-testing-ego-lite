import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SOURCE_ROOT } from '../src/scripts/toolchain.mjs';

const read = (file: string) => fs.readFile(path.join(SOURCE_ROOT, file), 'utf8');
test('current README source commands match package identity and document language provenance', async () => {
  const pkg = JSON.parse(await read('package.json')) as { version: string; egoLiteTest: { toolRevision: string } };
  for (const name of ['README.md', 'README.en.md']) {
    const page = await read(name);
    const commands = [...page.matchAll(/tool-info --expect-version (\S+) --expect-revision (\S+)/g)];
    assert.ok(commands.length > 0);
    for (const match of commands) {
      assert.equal(match[1], pkg.version);
      assert.equal(match[2], pkg.egoLiteTest.toolRevision);
    }
    assert.match(page, /report-language-model/);
    assert.match(page, /思考等级|reasoning effort/);
    assert.doesNotMatch(page, /当前软件与契约不升级|Pending actions use Chinese business descriptions/);
  }
});
test('current validation and version indexes link the latest language provenance verification', async () => {
  for (const name of ['docs/testing.md', 'docs/testing.en.md', 'docs/version-history.md', 'docs/version-history.en.md']) {
    assert.match(await read(name), /v0\.1\.8-report-language-model-validation\.md/);
  }
});
test('illustrations include point scope and sourced model/language display without claiming real evidence', async () => {
  for (const suffix of ['', '.zh-CN']) {
    assert.match(await read(`docs/images/workflow${suffix}.svg`), /Points: selected IDs|编号选点/);
    const report = await read(`docs/images/result-specimen${suffix}.svg`);
    assert.match(report, /reasoning effort|思考等级/);
    assert.match(report, /original evidence stays unchanged|原始证据保持原文/);
    assert.match(report, /NOT A REAL REPORT SCREENSHOT|非真实报告截图/);
  }
});
