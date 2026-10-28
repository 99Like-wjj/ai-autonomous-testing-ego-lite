import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { TOOL_ROOT, TOOL_VERSION } from '../src/scripts/toolchain.mjs';
import { objectValue } from './support.mjs';

const exec = promisify(execFile);

async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ego-cli-entrypoint-'));
  const link = path.join(root, 'linked skill with spaces');
  let linked = false;
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('ego-cli-entrypoint-'));
    // Unlink the alias before deleting this test's files; never recurse into TOOL_ROOT.
    if (linked) await fs.unlink(link);
    await fs.rm(root, { recursive: true, force: true });
  });
  await fs.symlink(TOOL_ROOT, link, process.platform === 'win32' ? 'junction' : 'dir');
  linked = true;
  return { root, realEntry: path.join(TOOL_ROOT, 'scripts/ego.mjs'), linkedEntry: path.join(link, 'scripts/ego.mjs') };
}

test('real and linked CLI paths execute commands and create the requested project', async t => {
  const f = await fixture(t);
  for (const [label, entry] of [['real', f.realEntry], ['linked', f.linkedEntry]] as const) {
    const info = await exec(process.execPath, [entry, 'tool-info'], { cwd: f.root });
    assert.notEqual(info.stdout.trim(), '', label + ' must return a tool receipt');
    const identity = objectValue(JSON.parse(info.stdout));
    assert.equal(identity.version, TOOL_VERSION);
    assert.equal(identity.installationIntegrity, 'verified');
    assert.equal(identity.toolRoot, await fs.realpath(TOOL_ROOT));
    const project = path.join(f.root, label + ' project');
    const initialized = await exec(process.execPath, [entry, 'init', '--project-dir', project], { cwd: f.root });
    assert.equal(objectValue(JSON.parse(initialized.stdout)).projectDir, project);
    const cases = objectValue(JSON.parse(await fs.readFile(path.join(project, 'cases.example.json'), 'utf8')));
    assert.ok(Array.isArray(cases.cases) && cases.cases.length > 0);
  }
});

test('linked CLI paths return a nonzero error for invalid commands', async t => {
  const f = await fixture(t);
  await assert.rejects(exec(process.execPath, [f.linkedEntry, 'invalid-command'], { cwd: f.root }), error => {
    assert.ok(error instanceof Error && 'code' in error && error.code === 1);
    assert.ok('stderr' in error && typeof error.stderr === 'string' && error.stderr.includes('Unknown command'));
    return true;
  });
});

test('importing the CLI through a directory link does not execute command arguments', async t => {
  const f = await fixture(t), caller = path.join(f.root, 'caller.mjs');
  await fs.writeFile(caller, 'await import(' + JSON.stringify(pathToFileURL(f.linkedEntry).href) + '); process.stdout.write("import-only\\n");\n', { flag: 'wx' });
  const imported = await exec(process.execPath, [caller, 'invalid-command'], { cwd: f.root });
  assert.equal(imported.stdout, 'import-only\n');
  assert.equal(imported.stderr, '');
});

test('evaluated imports accept ordinary non-file arguments without invoking the CLI', async t => {
  const f = await fixture(t);
  const program = 'await import(' + JSON.stringify(pathToFileURL(f.linkedEntry).href) + '); process.stdout.write("import-only\\n");';
  const imported = await exec(process.execPath, ['--input-type=module', '-e', program, 'not-a-script-file'], { cwd: f.root });
  assert.equal(imported.stdout, 'import-only\n');
  assert.equal(imported.stderr, '');
});
