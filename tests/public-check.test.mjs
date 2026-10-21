import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scanner = fileURLToPath(new URL('../tools/public-check.mjs', import.meta.url));
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ego-public-check-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.mkdir(path.join(dir, 'tools'));
  await fs.copyFile(scanner, path.join(dir, 'tools', 'public-check.mjs'));
  const write = async (name, content) => {
    await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await fs.writeFile(path.join(dir, name), content);
  };
  const run = () => spawnSync(process.execPath, [path.join(dir, 'tools', 'public-check.mjs')], { encoding: 'utf8' });
  return { dir, write, run };
}
test('publication checker accepts a small generic source tree', async t => {
  const f = await fixture(t);
  await f.write('README.md', '[Design](docs/design.md)\n');
  await f.write('docs/design.md', 'Synthetic project at https://service.example\n');
  const r = f.run();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).ok, true);
});
test('publication checker flags a synthetic secret without echoing it', async t => {
  const f = await fixture(t);
  const fake = ['ghp', '_', 'x'.repeat(36)].join('');
  await f.write('README.md', fake);
  const r = f.run();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /possible github-token/);
  assert.ok(!r.stderr.includes(fake));
});
test('publication checker does not echo secrets in broken link diagnostics', async t => {
  const f = await fixture(t);
  const fake = ['ghp', '_', 'x'.repeat(36)].join('');
  await f.write('README.md', `[link](${fake})`);
  const r = f.run();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /missing relative link/);
  assert.ok(!r.stderr.includes(fake));
});
test('publication checker does not echo credential-like filenames', async t => {
  const f = await fixture(t);
  const fake = ['ghp', '_', 'x'.repeat(36)].join('');
  await f.write(`docs/${fake}.md`, 'Synthetic');
  const r = f.run();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /redacted filename/);
  assert.ok(!(r.stderr + r.stdout).includes(fake));
});
test('publication checker rejects real-output directory names', async t => {
  const f = await fixture(t);
  await f.write('runs/result.json', '{}');
  assert.equal(f.run().status, 1);
});
test('publication checker rejects credentials files even under docs', async t => {
  const f = await fixture(t);
  await f.write('docs/.env.local', 'placeholder');
  assert.equal(f.run().status, 1);
});
test('publication checker rejects broken local links', async t => {
  const f = await fixture(t);
  await f.write('README.md', '[Missing](docs/absent.md)');
  assert.match(f.run().stderr, /missing relative link/);
});
test('publication checker rejects links outside the publication root', async t => {
  const f = await fixture(t);
  await f.write('README.md', '[Outside](../private.md)');
  assert.match(f.run().stderr, /link leaves publication root/);
});
test('publication checker rejects symlink publication entries', async t => {
  const f = await fixture(t);
  await f.write('docs/target.md', 'public');
  try { await fs.symlink(path.join(f.dir, 'docs/target.md'), path.join(f.dir, 'docs/link.md')); }
  catch (e) { if (['EPERM', 'EACCES'].includes(e.code)) { t.skip('Symlink privilege unavailable'); return; } throw e; }
  assert.match(f.run().stderr, /symlink is not publishable/);
});
test('publication checker rejects invalid text bytes', async t => {
  const f = await fixture(t);
  await f.write('README.md', Buffer.from([0xff, 0x00]));
  assert.match(f.run().stderr, /invalid text encoding/);
});
test('publication checker rejects unknown root artifacts', async t => {
  const f = await fixture(t);
  await f.write('debug.txt', 'Synthetic debug output');
  assert.match(f.run().stderr, /outside publication allowlist/);
});
test('publication checker explicitly does not scan Git history', async t => {
  const f = await fixture(t);
  await f.write('.git/config', 'Synthetic local git metadata');
  const r = f.run();
  assert.equal(r.status, 0, r.stderr);
  assert.ok(JSON.parse(r.stdout).limitations.some(x => x.includes('Git history')));
});
