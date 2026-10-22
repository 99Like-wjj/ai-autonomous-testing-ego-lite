import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import vm from 'node:vm';
import { init, start, report, verifyReport, registerEvidence, recordResult, main } from '../scripts/ego.mjs';
import { buildSkill } from '../tools/build-skill.mjs';
import { toolInfo, TOOL_ROOT } from '../scripts/toolchain.mjs';

const exec = promisify(execFile);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const write = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
async function temporary(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ego-delivery-synthetic-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('ego-delivery-synthetic-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  return root;
}
function cases() {
  return { schemaVersion: 3, project: 'Synthetic report delivery only', cases: ['original', 'extra'].map(id => ({
    id, title: 'Synthetic ' + id, basis: { kind: 'explicit', source: 'Synthetic fixture', text: 'Synthetic expectation.' },
    criticalConditions: [], expected: 'Synthetic result is visible.', requiredPath: null, stepOrder: 'strict',
    steps: [{ id: 'inspect', action: 'Inspect the synthetic result.' }]
  })) };
}
async function fixture(t) {
  const root = await temporary(t), project = path.join(root, 'project'), run = path.join(root, 'run');
  await init(project);
  const input = path.join(project, 'cases.json'); await write(input, cases());
  await start({ projectDir: project, casesFile: input, outputDir: run });
  const source = path.join(root, 'source.txt'); await fs.writeFile(source, 'Synthetic observation, not a screenshot.');
  const ev = await registerEvidence({ runDir: run, request: {
    schemaVersion: 3, operationId: 'ev', expectedRevision: 0, caseId: 'original', sourceFile: source,
    kind: 'other', source: 'Synthetic observer', description: 'Synthetic text evidence.'
  } });
  await recordResult({ runDir: run, request: {
    schemaVersion: 3, operationId: 'final', expectedRevision: 0, caseId: 'original', mode: 'final',
    record: { status: 'pass', observed: 'Synthetic result.', rationale: 'Synthetic caller verdict.', remainingQuestions: [], evidenceIds: [ev.evidenceId], cause: 'unknown' }
  } });
  return { root, project, run, source };
}
async function context(f) {
  const value = { schemaVersion: 1, kind: 'retrospective', summary: 'Synthetic assembly after execution </script><img src=x>',
    limitations: ['Synthetic missing screenshot; no new execution.'],
    sources: [{ label: 'Synthetic source', file: f.source, sha256: hash(await fs.readFile(f.source)) }],
    supplementalCaseIds: ['extra'], reviews: [
      { caseId: 'original', status: 'inconclusive', rationale: 'Synthetic key UI screenshot missing; original claim is preserved separately.' },
      { caseId: 'extra', status: 'not_tested', rationale: 'Synthetic untested supplemental goal.' }
    ] };
  const filename = path.join(f.root, 'context.json'); await write(filename, value);
  return { filename, value };
}

test('standalone package contains resolvable guides/scripts/schemas and runs from an unrelated cwd', async t => {
  const root = await temporary(t), bundle = path.join(root, 'standalone skill');
  const built = await buildSkill(bundle), identity = await toolInfo(bundle);
  assert.equal(identity.installationIntegrity, 'verified');
  assert.equal(identity.fingerprint, built.fingerprint);
  assert.deepEqual(await fs.readFile(path.join(bundle, 'scripts/ego.mjs')), await fs.readFile(path.join(TOOL_ROOT, 'scripts/ego.mjs')));
  const manifest = await read(path.join(bundle, 'runtime-manifest.json'));
  for (const name of Object.keys(manifest.files).filter(name => name.endsWith('.md'))) {
    const text = await fs.readFile(path.join(bundle, name), 'utf8');
    for (const match of text.matchAll(/!?\[[^\]]*\]\(([^\s)]+)\)/g)) {
      const ref = match[1].split('#')[0];
      if (!ref || /^[a-z][a-z0-9+.-]*:/i.test(ref)) continue;
      const target = path.resolve(path.dirname(path.join(bundle, name)), decodeURIComponent(ref));
      const relative = path.relative(bundle, target);
      assert.ok(relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
      await fs.stat(target);
    }
  }
  const cli = async args => JSON.parse((await exec(process.execPath, [path.join(bundle, 'scripts/ego.mjs'), ...args], { cwd: root })).stdout);
  assert.equal((await cli(['tool-info', '--expect-version', '0.1.3', '--expect-revision', 'html-report-delivery-1'])).toolRoot, bundle);
  const project = path.join(root, 'project'), run = path.join(root, 'run');
  await cli(['init', '--project-dir', project]);
  await cli(['start', '--project-dir', project, '--cases', path.join(project, 'cases.example.json'), '--output-dir', run]);
  const out = await cli(['report', '--run-dir', run]);
  assert.equal(out.filesVerified, true);
  assert.equal(out.browserOpen, 'not_checked');
  assert.equal((await cli(['verify-report', '--run-dir', run, '--report-dir', run])).artifacts.length, 3);
  for (const name of Object.keys(manifest.files).filter(name => name.startsWith('schemas/'))) {
    const schema = await read(path.join(bundle, name));
    for (const ref of JSON.stringify(schema).matchAll(/"\$ref":"([^"#]+)(?:#[^"]*)?"/g)) await fs.stat(path.join(bundle, 'schemas', ref[1]));
  }
});

test('installation build refuses existing directories and preserves their contents', async t => {
  const root = await temporary(t), output = path.join(root, 'existing');
  await fs.mkdir(output); await fs.writeFile(path.join(output, 'user.txt'), 'synthetic user-owned content');
  await assert.rejects(buildSkill(output), { code: 'EEXIST' });
  assert.equal(await fs.readFile(path.join(output, 'user.txt'), 'utf8'), 'synthetic user-owned content');
});

test('runtime rejects missing assets, changed installed files and wrong requested revision', async t => {
  const root = await temporary(t), bundle = path.join(root, 'skill'); await buildSkill(bundle);
  await assert.rejects(main(['tool-info', '--expect-revision', 'older-revision']), /revision mismatch/);
  await fs.appendFile(path.join(bundle, 'scripts/ego.mjs'), '\n// Synthetic unknown modification\n');
  await assert.rejects(toolInfo(bundle), /manifest mismatch/);
  const cli = path.join(bundle, 'scripts/ego.mjs');
  await assert.rejects(exec(process.execPath, [cli, 'check', '--run-dir', path.join(root, 'unused')]), error => /manifest mismatch/.test(error.stderr));
  await fs.unlink(path.join(bundle, 'schemas/cases.schema.json'));
  await assert.rejects(toolInfo(bundle), { code: 'ENOENT' });
});

test('report and verifier read back all three files without claiming browser opening or inferring verdicts', async t => {
  const f = await fixture(t), out = await report(f.run), data = await read(out.reportJson);
  assert.equal(out.filesVerified, true); assert.equal(out.browserOpen, 'not_checked');
  assert.equal(out.artifacts.length, 3);
  for (const artifact of out.artifacts) {
    const bytes = await fs.readFile(artifact.path);
    assert.equal(bytes.length, artifact.bytes); assert.equal(hash(bytes), artifact.sha256);
  }
  assert.equal(data.cases[0].status, 'pass'); // No automatic business judgment from missing images.
  assert.deepEqual(data.evidenceCoverage.finalCasesWithoutScreenshots, ['original']);
  assert.equal(data.evidenceCoverage.registeredScreenshots, 0);
  assert.equal((await verifyReport(f.run)).filesVerified, true);
  await fs.appendFile(out.reportHtml, '\nSynthetic alteration');
  await assert.rejects(verifyReport(f.run), /does not match/);
  await fs.unlink(out.reportMarkdown);
  await assert.rejects(verifyReport(f.run), { code: 'ENOENT' });
});

test('retrospective rendering preserves original files and separates supplemental scope and AI reviews', async t => {
  const f = await fixture(t), original = await report(f.run), ctx = await context(f);
  const names = ['baseline.json', 'manifest.json', 'results.json', 'evidence.json', 'report.json', 'report.md', 'report.html'];
  const before = await Promise.all(names.map(name => fs.readFile(path.join(f.run, name))));
  const target = path.join(f.root, 'new report'); await fs.mkdir(target);
  const out = await main(['report', '--run-dir', f.run, '--output-dir', target, '--context', ctx.filename]);
  const data = await read(out.reportJson), html = await fs.readFile(out.reportHtml, 'utf8');
  assert.equal(data.cases[0].status, 'pass');
  assert.equal(data.context.reviews[0].status, 'inconclusive');
  assert.deepEqual(data.context.supplementalCaseIds, ['extra']);
  assert.match(html, /事后整理与本次复核/); assert.match(html, /原记录：/); assert.match(html, /补充发现/);
  assert.match(html, /来源计划步骤（不证明执行前冻结）/);
  assert.doesNotMatch(html, /<img src=x>/);
  assert.match(html, /截图证据缺口/); assert.doesNotMatch(html, /图片不是强制要求/);
  // Execute the viewer with real generated context: original claims and new reviews stay distinct.
  class Element {
    constructor() { this.children=[]; this.dataset={}; this.hidden=false; this.value=''; this.textContent=''; }
    append(...nodes) { this.children.push(...nodes); }
    addEventListener() {}
  }
  const nodes=Object.fromEntries(['report-data','project-line','integrity','summary','report-context','evidence-coverage','search','status-filter','shown','empty-results','case-list','lightbox-image','lightbox-error','lightbox-caption','lightbox','lightbox-close'].map(id=>[id,new Element()]));
  nodes['report-data'].textContent=html.match(/<script type="application\/json" id="report-data">([\s\S]*?)<\/script>/)[1];
  nodes['status-filter'].value='all';
  const script=[...html.matchAll(/<script(?![^>]*application\/json)[^>]*>([\s\S]*?)<\/script>/g)][0][1];
  new vm.Script(script).runInNewContext({document:{getElementById:id=>nodes[id],querySelector:selector=>nodes[selector.slice(1)],createElement:()=>new Element()}});
  const text=node=>[node.textContent,...node.children.map(text)].join(' ');
  assert.equal(nodes.summary.children[1].children[0].textContent, '1'); // Original pass remains recorded.
  assert.match(text(nodes.summary.children[1]), /原记录.*通过/);
  assert.match(text(nodes['report-context']), /本次复核 无法判断：1/);
  assert.match(text(nodes['case-list'].children[0]), /本次复核：无法判断/);
  assert.match(text(nodes['case-list'].children[1]), /补充发现/);
  assert.equal((await main(['verify-report', '--run-dir', f.run, '--report-dir', target])).filesVerified, true);
  for (let i = 0; i < names.length; i++) assert.deepEqual(await fs.readFile(path.join(f.run, names[i])), before[i]);
  await assert.rejects(report(f.run, { outputDir: target, contextFile: ctx.filename }), /overwrite/);
  assert.equal(original.reportHtml, path.join(f.run, 'report.html'));
});

test('retrospective context rejects invented source hashes, incomplete reviews and wrong scope before outputs', async t => {
  const f = await fixture(t), ctx = await context(f), target = path.join(f.root, 'new'); await fs.mkdir(target);
  for (const mutate of [
    value => { value.sources[0].sha256 = '0'.repeat(64); },
    value => { value.reviews.pop(); },
    value => { value.reviews[1].caseId = 'original'; },
    value => { value.supplementalCaseIds.push('missing'); },
    value => { value.capturedAt = 'invented'; }
  ]) {
    const value = structuredClone(ctx.value); mutate(value); await write(ctx.filename, value);
    await assert.rejects(report(f.run, { outputDir: target, contextFile: ctx.filename }));
    assert.deepEqual(await fs.readdir(target), []);
  }
});

test('verification detects changed retrospective sources and later records without rewriting reports', async t => {
  const f = await fixture(t), ctx = await context(f), out = await report(f.run, { contextFile: ctx.filename });
  const html = await fs.readFile(out.reportHtml);
  await fs.appendFile(f.source, '\nSynthetic changed source');
  await assert.rejects(verifyReport(f.run), /source hash mismatch/);
  assert.deepEqual(await fs.readFile(out.reportHtml), html);
  await fs.writeFile(f.source, 'Synthetic observation, not a screenshot.');
  await recordResult({ runDir: f.run, request: {
    schemaVersion: 3, operationId: 'later', expectedRevision: 1, caseId: 'extra', mode: 'final',
    record: { status: 'inconclusive', observed: 'Synthetic later observation.', rationale: 'Synthetic pending check.', remainingQuestions: [], evidenceIds: [], cause: 'unknown' }
  } });
  await assert.rejects(verifyReport(f.run), /does not match/);
  assert.deepEqual(await fs.readFile(out.reportHtml), html);
});

test('multiple registrations of the same text are counted as one retained content and no screenshots', async t => {
  const f = await fixture(t);
  await registerEvidence({ runDir: f.run, request: {
    schemaVersion: 3, operationId: 'duplicate-text', expectedRevision: 1, caseId: 'extra', sourceFile: f.source,
    kind: 'other', source: 'Synthetic shared index', description: 'Second association, not a second independent observation.'
  } });
  const out = await report(f.run), data = await read(out.reportJson);
  assert.equal(data.evidenceIntegrity.hashVerifiedItems, 2);
  assert.equal(data.evidenceCoverage.distinctRetainedContents, 1);
  assert.equal(data.evidenceCoverage.registeredScreenshots, 0);
  assert.equal(data.cases[0].status, 'pass');
});
