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
import { fixture as runFixture,request,untested,writeJSON } from './goals-fixture.mjs';

const exec = promisify(execFile);

test('CLI exposes scoped reads, commit feedback and explicit usage through the built runtime',async t=>{
  const f=await runFixture(t),entry=path.join(TOOL_ROOT,'scripts/ego.mjs');
  const call=async(...args:string[])=>objectValue(JSON.parse((await exec(process.execPath,[entry,...args])).stdout));
  const index=await call('progress','--run-dir',f.runDir,'--view','goals','--limit','1');assert.equal(index.contextReadVersion,1);assert.equal(objectValue(index.pagination).total,4);
  const req=path.join(f.root,'record.json');await writeJSON(req,request(untested()));const committed=await call('record','--run-dir',f.runDir,'--request',req);assert.equal(committed.recordResponseVersion,1);assert.equal(committed.committed,true);assert.equal(objectValue(committed.receipt).revision,1);
  const replay=await call('record','--run-dir',f.runDir,'--request',req);assert.equal(objectValue(replay.receipt).replayed,true);
  const history=await call('regression','context','--run-dir',f.runDir,'--results-revision','0');assert.equal(objectValue(history.scope).resultsRevision,0);
  const usage=path.join(f.root,'usage.json'),ur=path.join(f.root,'usage-request.json');await writeJSON(usage,{usageVersion:1,sources:[],records:[]});await writeJSON(ur,{inputFile:usage});const summary=await call('usage','summarize','--request',ur);assert.equal(summary.usageSummaryVersion,1);assert.equal(objectValue(summary.coverage).modelData,'not_supplied');
  await assert.rejects(call('progress','--run-dir',f.runDir,'--view','point'),/INVALID_CONTEXT_FILTER/);
  await assert.rejects(call('regression','context','--run-dir',f.runDir,'--view','full'),/REQUIRES_OUTPUT_FILE/);
});

test('review export no longer exposes or accepts a server command', async () => {
  const entry = path.join(TOOL_ROOT, 'scripts/ego.mjs');
  const help = await exec(process.execPath, [entry, '--help']);
  assert.doesNotMatch(help.stdout, /cases serve|idle-minutes/);
  await assert.rejects(exec(process.execPath, [entry, 'cases', 'serve']), /Unknown cases action/);
});

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
    const cases = objectValue(JSON.parse(await fs.readFile(path.join(project, 'cases-save-request.example.json'), 'utf8')));
    assert.ok(Array.isArray(cases.cases) && cases.cases.length > 0);
    assert.equal(cases.expectedVersion,0);
    assert.deepEqual(await fs.readdir(path.join(project,'runs')),[]);
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
