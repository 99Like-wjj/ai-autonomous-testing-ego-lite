import type { TestContext } from 'node:test';
import { at, readJson as read, objectValue, FakeElement } from './support.mjs';
import { errorInfo } from '../src/core/common.mjs';
import { validateReportContext } from '../src/report/delivery.mjs';
import { TOOL_VERSION, TOOL_REVISION } from '../src/scripts/toolchain.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import vm from 'node:vm';
import { init, start, report, verifyReport, registerEvidence, recordResult, main, check } from '../src/scripts/ego.mjs';
import { buildSkill } from '../tools/build-skill.mjs';
import { toolInfo, TOOL_ROOT } from '../src/scripts/toolchain.mjs';
const exec = promisify(execFile);
const hash = (bytes: Uint8Array) => crypto.createHash('sha256').update(bytes).digest('hex');
const write = (file: string, value: unknown) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
async function temporary(t: TestContext) {
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
async function fixture(t: TestContext) {
    const root = await temporary(t), project = path.join(root, 'project'), run = path.join(root, 'run');
    await init(project);
    const input = path.join(project, 'cases.json');
    await write(input, cases());
    await start({ projectDir: project, casesFile: input, outputDir: run });
    const source = path.join(root, 'source.txt');
    await fs.writeFile(source, 'Synthetic observation, not a screenshot.');
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
async function context(f: Awaited<ReturnType<typeof fixture>>) {
    const value = { schemaVersion: 1, kind: 'retrospective', summary: 'Synthetic assembly after execution </script><img src=x>',
        limitations: ['Synthetic missing screenshot; no new execution.'],
        sources: [{ label: 'Synthetic source', file: f.source, sha256: hash(await fs.readFile(f.source)) }],
        supplementalCaseIds: ['extra'], reviews: [
            { caseId: 'original', status: 'inconclusive', rationale: 'Synthetic key UI screenshot missing; original claim is preserved separately.' },
            { caseId: 'extra', status: 'not_tested', rationale: 'Synthetic untested supplemental goal.' }
        ] };
    const filename = path.join(f.root, 'context.json');
    await write(filename, value);
    return { filename, value };
}
test('standalone package contains resolvable guides/scripts/schemas and runs from an unrelated cwd', async (t) => {
    const root = await temporary(t), bundle = path.join(root, 'standalone skill');
    const built = await buildSkill(bundle), identity = await toolInfo(bundle);
    assert.equal(identity.installationIntegrity, 'verified');
    assert.equal(identity.fingerprint, built.fingerprint);
    assert.deepEqual(await fs.readFile(path.join(bundle, 'scripts/ego.mjs')), await fs.readFile(path.join(TOOL_ROOT, 'scripts/ego.mjs')));
    const manifest = await read(path.join(bundle, 'runtime-manifest.json'));
    const manifestFiles = objectValue(manifest.files);
    for (const name of Object.keys(manifestFiles).filter(name => name.endsWith('.md'))) {
        const text = await fs.readFile(path.join(bundle, name), 'utf8');
        for (const match of text.matchAll(/!?\[[^\]]*\]\(([^\s)]+)\)/g)) {
            const ref = at(match, 1).split('#')[0];
            if (!ref || /^[a-z][a-z0-9+.-]*:/i.test(ref))
                continue;
            const target = path.resolve(path.dirname(path.join(bundle, name)), decodeURIComponent(ref));
            const relative = path.relative(bundle, target);
            assert.ok(relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
            await fs.stat(target);
        }
    }
    const cli = async (args: string[]) => objectValue(JSON.parse((await exec(process.execPath, [path.join(bundle, 'scripts/ego.mjs'), ...args], { cwd: root })).stdout));
    assert.equal((await cli(['tool-info', '--expect-version', TOOL_VERSION, '--expect-revision', TOOL_REVISION])).toolRoot, bundle);
    const project = path.join(root, 'project'), run = path.join(root, 'run');
    await cli(['init', '--project-dir', project]);
    await cli(['start', '--project-dir', project, '--cases', path.join(project, 'cases.example.json'), '--output-dir', run]);
    const out = await cli(['report', '--run-dir', run]);
    assert.equal(out.filesVerified, true);
    assert.equal(out.browserOpen, 'not_checked');
    const verification = await cli(['verify-report', '--run-dir', run, '--report-dir', run]); assert.ok(Array.isArray(verification.artifacts)); assert.equal(verification.artifacts.length, 3);
    for (const name of Object.keys(manifestFiles).filter(name => name.startsWith('schemas/'))) {
        const schema = await read(path.join(bundle, name));
        for (const ref of JSON.stringify(schema).matchAll(/"\$ref":"([^"#]+)(?:#[^"]*)?"/g))
            await fs.stat(path.join(bundle, 'schemas', at(ref, 1)));
    }
});
test('installation build refuses existing directories and preserves their contents', async (t) => {
    const root = await temporary(t), output = path.join(root, 'existing');
    await fs.mkdir(output);
    await fs.writeFile(path.join(output, 'user.txt'), 'synthetic user-owned content');
    await assert.rejects(buildSkill(output), { code: 'EEXIST' });
    assert.equal(await fs.readFile(path.join(output, 'user.txt'), 'utf8'), 'synthetic user-owned content');
});
test('runtime rejects missing assets, changed installed files and wrong requested revision', async (t) => {
    const root = await temporary(t), bundle = path.join(root, 'skill');
    await buildSkill(bundle);
    await assert.rejects(main(['tool-info', '--expect-revision', 'older-revision']), /revision mismatch/);
    await fs.appendFile(path.join(bundle, 'scripts/ego.mjs'), '\n// Synthetic unknown modification\n');
    await assert.rejects(toolInfo(bundle), /manifest mismatch/);
    const cli = path.join(bundle, 'scripts/ego.mjs');
    await assert.rejects(exec(process.execPath, [cli, 'check', '--run-dir', path.join(root, 'unused')]), error => { const failure = objectValue(error); return typeof failure.stderr === 'string' && /manifest mismatch/.test(failure.stderr); });
    await fs.unlink(path.join(bundle, 'schemas/cases.schema.json'));
    await assert.rejects(toolInfo(bundle), { code: 'ENOENT' });
});
test('report and verifier read back all three files without claiming browser opening or inferring verdicts', async (t) => {
    const f = await fixture(t), out = await report(f.run), data = await check(f.run); assert.deepEqual(await read(out.reportJson), data);
    assert.equal(out.filesVerified, true);
    assert.equal(out.browserOpen, 'not_checked');
    assert.equal(out.artifacts.length, 3);
    for (const artifact of out.artifacts) {
        const bytes = await fs.readFile(artifact.path);
        assert.equal(bytes.length, artifact.bytes);
        assert.equal(hash(bytes), artifact.sha256);
    }
    assert.equal(at(data.cases, 0).status, 'pass'); // No automatic business judgment from missing images.
    assert.deepEqual(data.evidenceCoverage.finalCasesWithoutScreenshots, ['original']);
    assert.equal(data.evidenceCoverage.registeredScreenshots, 0);
    assert.equal((await verifyReport(f.run)).filesVerified, true);
    await fs.appendFile(out.reportHtml, '\nSynthetic alteration');
    await assert.rejects(verifyReport(f.run), /does not match/);
    await fs.unlink(out.reportMarkdown);
    await assert.rejects(verifyReport(f.run), { code: 'ENOENT' });
});
test('retrospective rendering preserves original files and separates supplemental scope and AI reviews', async (t) => {
    const f = await fixture(t), original = await report(f.run), ctx = await context(f);
    const names = ['baseline.json', 'manifest.json', 'results.json', 'evidence.json', 'report.json', 'report.md', 'report.html'];
    const before = await Promise.all(names.map(name => fs.readFile(path.join(f.run, name))));
    const target = path.join(f.root, 'new report');
    await fs.mkdir(target);
    const out = await main(['report', '--run-dir', f.run, '--output-dir', target, '--context', ctx.filename]);
    const data = await check(f.run);
    data.context = await validateReportContext(ctx.value, data);
    assert.deepEqual(await read(out.reportJson), data);
    const html = await fs.readFile(out.reportHtml, 'utf8');
    assert.equal(at(data.cases, 0).status, 'pass');
    assert.equal(at(data.context.reviews, 0).status, 'inconclusive');
    assert.deepEqual(data.context.supplementalCaseIds, ['extra']);
    assert.match(html, /事后整理与本次复核/);
    assert.match(html, /原记录：/);
    assert.match(html, /补充发现/);
    assert.match(html, /来源计划步骤（不证明执行前冻结）/);
    assert.doesNotMatch(html, /<img src=x>/);
    assert.match(html, /截图证据缺口/);
    assert.doesNotMatch(html, /图片不是强制要求/);
    // Execute the viewer with real generated context: original claims and new reviews stay distinct.
    const Element = FakeElement;
    const nodeIds = ['report-data', 'project-line', 'integrity', 'summary', 'report-context', 'evidence-coverage', 'search', 'status-filter', 'shown', 'empty-results', 'case-list', 'lightbox-image', 'lightbox-error', 'lightbox-caption', 'lightbox', 'lightbox-close'] as const;
    const nodes = Object.fromEntries(nodeIds.map(id => [id, new Element()])) as Record<typeof nodeIds[number], FakeElement>;
    const encoded = html.match(/<script type="application\/json" id="report-data">([\s\S]*?)<\/script>/); assert.ok(encoded); nodes['report-data'].textContent = at(encoded, 1);
    nodes['status-filter'].value = 'all';
    const script = at(at([...html.matchAll(/<script(?![^>]*application\/json)[^>]*>([\s\S]*?)<\/script>/g)], 0), 1);
    new vm.Script(script).runInNewContext({ document: { getElementById: (id: typeof nodeIds[number]) => nodes[id], querySelector: (selector: string) => nodes[selector.slice(1) as typeof nodeIds[number]], createElement: () => new Element() } });
    const text = (node: FakeElement): string => [node.textContent, ...node.children.map(text)].join(' ');
    assert.equal(at(at(nodes.summary.children, 1).children, 0).textContent, '1'); // Original pass remains recorded.
    assert.match(text(at(nodes.summary.children, 1)), /原记录.*通过/);
    assert.match(text(nodes['report-context']), /本次复核 无法判断：1/);
    assert.match(text(at(nodes['case-list'].children, 0)), /本次复核：无法判断/);
    assert.match(text(at(nodes['case-list'].children, 1)), /补充发现/);
    assert.equal((await main(['verify-report', '--run-dir', f.run, '--report-dir', target])).filesVerified, true);
    for (let i = 0; i < names.length; i++)
        assert.deepEqual(await fs.readFile(path.join(f.run, at(names, i))), before[i]);
    await assert.rejects(report(f.run, { outputDir: target, contextFile: ctx.filename }), /overwrite/);
    assert.equal(original.reportHtml, path.join(f.run, 'report.html'));
});
test('retrospective context rejects invented source hashes, incomplete reviews and wrong scope before outputs', async (t) => {
    const f = await fixture(t), ctx = await context(f), target = path.join(f.root, 'new');
    await fs.mkdir(target);
    const mutations: ((value: Awaited<ReturnType<typeof context>>["value"]) => void)[] = [
        value => { at(value.sources, 0).sha256 = '0'.repeat(64); },
        value => { value.reviews.pop(); },
        value => { at(value.reviews, 1).caseId = 'original'; },
        value => { value.supplementalCaseIds.push('missing'); },
        value => { Object.assign(value, { capturedAt: 'invented' }); }
    ];
    for (const mutate of mutations) {
        const value = structuredClone(ctx.value);
        mutate(value);
        await write(ctx.filename, value);
        await assert.rejects(report(f.run, { outputDir: target, contextFile: ctx.filename }));
        assert.deepEqual(await fs.readdir(target), []);
    }
});
test('verification detects changed retrospective sources and later records without rewriting reports', async (t) => {
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
test('multiple registrations of the same text are counted as one retained content and no screenshots', async (t) => {
    const f = await fixture(t);
    await registerEvidence({ runDir: f.run, request: {
            schemaVersion: 3, operationId: 'duplicate-text', expectedRevision: 1, caseId: 'extra', sourceFile: f.source,
            kind: 'other', source: 'Synthetic shared index', description: 'Second association, not a second independent observation.'
        } });
    const out = await report(f.run), data = await check(f.run);
    assert.deepEqual(await read(out.reportJson), data);
    assert.equal(data.evidenceIntegrity.hashVerifiedItems, 2);
    assert.equal(data.evidenceCoverage.distinctRetainedContents, 1);
    assert.equal(data.evidenceCoverage.registeredScreenshots, 0);
    assert.equal(at(data.cases, 0).status, 'pass');
});
