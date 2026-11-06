import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runtimeFiles, referenceNames } from '../src/contracts/layout.mjs';
import { TOOL_ROOT, SOURCE_ROOT } from '../src/scripts/toolchain.mjs';
import { checkRuntimePackage } from '../tools/check-runtime-package.mjs';
import { buildSkill } from '../tools/build-skill.mjs';

const expected = [...runtimeFiles, 'SKILL.md', 'agents/openai.yaml', ...referenceNames.map(name => `references/${name}.md`), 'package.json', 'runtime-manifest.json'];
test('distribution contains only current operational documents and no development history', async () => {
  const docs = runtimeFiles.filter(name => name.startsWith('docs/')).sort();
  assert.deepEqual(docs, ['docs/asset-formats.en.md', 'docs/asset-formats.md', 'docs/case-review.md', 'docs/regression-reuse.md', 'docs/third-party-notices.md']);
  assert.ok(!runtimeFiles.some(name => /^(?:src|tests|tools|node_modules|\.git)\//.test(name)));
  assert.equal(new Set(expected).size, expected.length);
  assert.ok(!expected.some(name => name.startsWith('docs/images/real-example/') || name.endsWith('.jpg')));
  assert.ok(referenceNames.includes('download-files'));
  assert.ok(referenceNames.includes('report-language-model'));
  await checkRuntimePackage(TOOL_ROOT, expected);
});
test('fresh standalone build has exact file set, licenses and resolvable local guide links', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-package-test-'));
  try {
    const output = path.join(temporary, 'skill');
    await buildSkill(output);
    await checkRuntimePackage(output, expected);
    assert.ok((await fs.stat(path.join(output, 'vendor/THIRD-PARTY-LICENSES.txt'))).size > 0);
    await assert.rejects(buildSkill(output), /EEXIST/);
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
});
test('package checker rejects missing, leftover and broken-link files without deleting them', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-file-set-test-'));
  try {
    await fs.writeFile(path.join(temporary, 'guide.md'), '# Guide\n');
    await checkRuntimePackage(temporary, ['guide.md']);
    await assert.rejects(checkRuntimePackage(temporary, ['guide.md', 'missing.md']), /Missing: missing.md/);
    await fs.writeFile(path.join(temporary, 'old-design.md'), 'user modified');
    await assert.rejects(checkRuntimePackage(temporary, ['guide.md']), /extra: old-design.md/);
    assert.equal(await fs.readFile(path.join(temporary, 'old-design.md'), 'utf8'), 'user modified');
    await fs.writeFile(path.join(temporary, 'guide.md'), '[missing](absent.md)');
    await assert.rejects(checkRuntimePackage(temporary, ['guide.md', 'old-design.md']), /Broken local/);
    await fs.writeFile(path.join(temporary, 'guide.md'), '[outside](../outside.md)');
    await assert.rejects(checkRuntimePackage(temporary, ['guide.md', 'old-design.md']), /Broken local/);
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
});
test('normal build cleans its generated runtime before staging, not user installations', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(SOURCE_ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts.build.indexOf('clean-build.mjs') < pkg.scripts.build.indexOf('stage-runtime.mjs'));
  const clean = await fs.readFile(path.join(SOURCE_ROOT, 'tools/clean-build.mts'), 'utf8');
  assert.match(clean, /\['node','browser','runtime'\]/);
});

test('clean-build removes obsolete generated files while preserving source-side user data', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-clean-build-test-'));
  try {
    await fs.writeFile(path.join(temporary, 'package.json'), JSON.stringify({ name: 'ai-testing-ego-lite' }));
    await fs.mkdir(path.join(temporary, '.build/runtime/docs'), { recursive: true });
    await fs.writeFile(path.join(temporary, '.build/runtime/docs/old-design.md'), 'retired generated file');
    await fs.mkdir(path.join(temporary, 'private-project'));
    await fs.writeFile(path.join(temporary, 'private-project/evidence.txt'), 'real evidence');
    await promisify(execFile)(process.execPath, [path.join(SOURCE_ROOT, '.build/bootstrap/tools/clean-build.mjs')], { cwd: temporary });
    await assert.rejects(fs.stat(path.join(temporary, '.build/runtime')), /ENOENT/);
    assert.equal(await fs.readFile(path.join(temporary, 'private-project/evidence.txt'), 'utf8'), 'real evidence');
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
});

test('inline Markdown file links allow in-package relative targets and ignore web links', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-links-test-'));
  try {
    await fs.mkdir(path.join(temporary, 'docs'));
    await fs.writeFile(path.join(temporary, 'guide.md'), '# Guide');
    await fs.writeFile(path.join(temporary, 'docs/read.md'), '[guide](../guide.md#section) [web](https://example.com/)');
    const result = await checkRuntimePackage(temporary, ['guide.md', 'docs/read.md']);
    assert.equal(result.inlineMarkdownFileLinks, 'verified');
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
});
test('package checker rejects symlink entries without following or modifying the target', async (t) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-link-test-'));
  try {
    await fs.writeFile(path.join(temporary, 'original.md'), 'keep');
    try { await fs.symlink(path.join(temporary, 'original.md'), path.join(temporary, 'alias.md')); }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'EPERM') { t.skip('Windows symlink permission unavailable'); return; } throw error; }
    await assert.rejects(checkRuntimePackage(temporary, ['original.md', 'alias.md']), /Symlink/);
    assert.equal(await fs.readFile(path.join(temporary, 'original.md'), 'utf8'), 'keep');
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
});
