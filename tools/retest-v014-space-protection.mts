import { SOURCE_ROOT as confirmedSourceRoot } from '../src/scripts/toolchain.mjs';
import { errorInfo, inside } from '../src/core/common.mjs';
import { textValue } from '../src/core/validation.mjs';
import { readData, record as parseObject, inventory as parseInventory, binding as parseBinding, bindings as parseBindings, proof as parseProof, server as parseServer, snapshots as parseSnapshots, treeHashes as parseHashes, roundData as parseRoundData, roundRecord as parseRoundRecord, closureConfirmation as parseClosure, goals as parseGoals, evidenceManifest as parseEvidenceManifest, protectionAssessment as parseAssessment, required } from './proof-data.mjs';
import type { TreeHashes } from './proof-data.mjs';
// One bounded synthetic protection retest. No host-isolation probe or business actions.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { start, registerEvidence, recordResult, report, verifyReport } from '../src/scripts/ego.mjs';
const source = confirmedSourceRoot;
const [command, inputRoot, ...args] = process.argv.slice(2);
if (!inputRoot || !path.isAbsolute(inputRoot))
    throw new Error('Absolute evidence directory required');
const root = path.resolve(inputRoot);
const relative = path.relative(source, root);
if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)))
    throw new Error('Evidence must stay outside source');
async function read<T>(name: string, decoder: (value: unknown) => T): Promise<T>;
async function read(name: string): Promise<Record<string, unknown>>;
async function read(name: string, decoder: (value: unknown) => unknown = parseObject): Promise<unknown> { return readData(path.join(root, name), decoder); }
const save = (name: string, value: unknown) => fs.writeFile(path.join(root, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const hash = (bytes: Uint8Array) => crypto.createHash('sha256').update(bytes).digest('hex');
const now = () => new Date().toISOString();
const runFile = promisify(execFile);
async function hashes(base: string): Promise<TreeHashes> {
    const result: TreeHashes = {};
    async function walk(rel = '') {
        const target = path.join(base, rel), stat = await fs.lstat(target);
        if (stat.isSymbolicLink()) {
            result[rel || '.'] = { link: await fs.readlink(target) };
            return;
        }
        if (stat.isDirectory()) {
            for (const name of await fs.readdir(target))
                if (name !== '.git')
                    await walk(path.join(rel, name));
        }
        else if (stat.isFile())
            result[rel || '.'] = hash(await fs.readFile(target));
    }
    try {
        await walk();
    }
    catch (caughte) {
        const e = errorInfo(caughte);
        if (e.code !== 'ENOENT')
            throw e;
        result.absent = true;
    }
    return result;
}
async function oldProof() {
    const base = path.resolve(root, '..', 'ego014-capability-20261023-01');
    const bytes = await fs.readFile(path.join(base, 'evidence-manifest.json'));
    const manifest = parseEvidenceManifest(JSON.parse(bytes.toString('utf8')));
    const changed = [];
    for (const [name, expected] of Object.entries(manifest.files)) {
        if (hash(await fs.readFile(path.join(base, name))) !== expected.sha256)
            changed.push(name);
    }
    return { base, manifestSha256: hash(bytes), fileCount: Object.keys(manifest.files).length, changed };
}
async function prepare() {
    await fs.mkdir(root);
    for (const d of ['rounds', 'raw', 'screenshots', 'project', 'requests', 'fixtures'])
        await fs.mkdir(path.join(root, d));
    const proof = { proofId: crypto.randomUUID(), startedAt: now(), sourceRoot: source, maxParallelCases: 2, syntheticOnly: true, retestOf: 'PROTECTION', userWillNotInteract: true };
    await save('proof.json', proof);
    const prior = await oldProof();
    if (prior.changed.length)
        throw new Error('Prior evidence changed; preserve and inspect');
    await save('prior-evidence-before.json', prior);
    const oldPlan = parseGoals(JSON.parse(await fs.readFile(path.join(prior.base, 'frozen-plan.json'), 'utf8')));
    const protectionGoal = oldPlan.goals.find(g => g.id === 'PROTECTION');
    if (!protectionGoal)
        throw new Error('Original protection goal missing');
    const expected = protectionGoal.expected;
    await save('frozen-plan.json', { frozenAt: now(), scope: 'Protection retest only; host isolation and other conclusions are not retested', expected, fixtureCases: ['A', 'B'], coordinatorOnlyInventory: true, maxParallelCases: 2, limitations: ['Protect all existing Spaces without reading their page content', 'Only fresh synthetic A/B Spaces may be selected or finished', 'No takeover, cookie/cache clear, restart, installed Skill change, push or release'] });
    const casesFile = path.join(root, 'project', 'cases.json');
    await fs.writeFile(casesFile, JSON.stringify({ schemaVersion: 3, project: 'v0.1.4 Space 保护独立补测', cases: [{ id: 'PROTECTION-R2', title: '无人工关闭干预的常规 Space 保护', basis: { kind: 'explicit', source: '用户本次重试请求及首轮 PROTECTION 冻结目标', text: expected }, criticalConditions: ['本轮用户不操作 Ego；仅合成页面；最多两个自有 fixture Space；已存在 Space 一律保护'], expected, requiredPath: null, stepOrder: 'strict', steps: [{ id: 'before', action: '只读冻结现存 Space 清单及安装 hash' }, { id: 'exercise', action: '协调器为独立 fixture A/B 各创建一个 Space，各自使用原 numeric ID 操作合成页面并续跑' }, { id: 'finish', action: '证据和清理前报告留存后，仅清理有本次创建回执的精确 ID' }, { id: 'after', action: '独立读回全部原 Space、安装 hash 和历史证据，核对清理范围' }] }] }, null, 2) + '\n', { flag: 'wx' });
    await start({ projectDir: path.join(root, 'project'), casesFile, outputDir: path.join(root, 'record-run'), runSchemaVersion: 3 });
    await save('source-before.json', await hashes(source));
    const home = textValue(process.env.USERPROFILE, 'USERPROFILE');
    const protectedPaths = [path.join(home, '.agents', 'skills', 'ego-lite-test'), path.join(home, '.agents', 'skills', 'ego-browser'), path.join(home, '.codex', 'skills', 'ego-lite-test'), path.join(home, '.codex', 'config.toml')];
    const installed: Record<string, TreeHashes> = {};
    for (const p of protectedPaths)
        installed[p] = await hashes(p);
    await save('installed-before.json', installed);
    for (const id of ['A', 'B'])
        await fs.writeFile(path.join(root, 'fixtures', id + '.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Protection fixture ${id}</title><style>body{font:24px system-ui;padding:40px;background:${id === 'A' ? '#e5f0ff' : '#fff0df'}}main{background:white;padding:35px;border:3px solid #456;border-radius:12px}input,button{font:24px system-ui;padding:10px;margin:12px}output{display:block;padding:20px;background:#edf7ed}</style><main><h1>Protection fixture ${id}</h1><p id="marker">${proof.proofId}:${id}</p><label>Fixture value <input id="value"></label><button id="commit">Commit synthetic value</button><output id="result">Not committed</output></main><script>document.querySelector('#commit').onclick=()=>{document.querySelector('#result').textContent=${JSON.stringify(id + ':')}+document.querySelector('#value').value;};</script></html>`, { flag: 'wx' });
    await save('versions.json', { ego: (await runFile('ego-browser', ['--version'], { windowsHide: true })).stdout.trim(), node: process.version });
    console.log(JSON.stringify({ evidenceRoot: root, proofId: proof.proofId, priorFilesVerified: prior.fileCount, frozenBeforeBrowser: true }));
}
async function ego(label: string, code: string) {
    const script = path.join(root, 'rounds', label + '.mjs');
    await fs.writeFile(script, code, { flag: 'wx' });
    const began = now();
    const proc = spawn('ego-browser', ['nodejs', '-e', `await import('${pathToFileURL(script).href}')`], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    proc.stdout.on('data', b => { stdout += b; });
    proc.stderr.on('data', b => { stderr += b; });
    const exit = await new Promise<{
        code: number | null;
        signal: NodeJS.Signals | null;
    }>((resolve, reject) => { proc.once('error', reject); proc.once('exit', (code, signal) => resolve({ code, signal })); });
    const raw = { label, startedAt: began, endedAt: now(), cliPid: proc.pid, ...exit, stdout, stderr };
    await save('raw/' + label + '.json', raw);
    const match = (stdout + '\n' + stderr).match(/PROOF_JSON::(\{[^\n]*\})/);
    if (match)
        await save(label + '.json', JSON.parse(textValue(match[1], 'proof JSON capture')));
    console.log(JSON.stringify({ ...raw, data: match ? parseRoundData(JSON.parse(textValue(match[1], 'proof JSON capture'))) : null }, null, 2));
}
async function exercise(id: string, phase: string) {
    if (!['A', 'B'].includes(id) || !['initial', 'recovered', 'resume'].includes(phase))
        throw new Error('Invalid fixture');
    const binding = await read('binding-' + id + '.json', parseBinding), proof = await read('proof.json', parseProof);
    const screenshot = path.join(root, 'screenshots', id + '-' + phase + '.png').replaceAll('\\', '/');
    const value = id + '-' + phase + '-' + proof.proofId.slice(0, 8);
    await ego('fixture-' + id.toLowerCase() + '-' + phase, `const task = await taskSpace(${binding.spaceId}); const page = task.page('p1');
${phase === 'initial' ? `await page.goto(${JSON.stringify(pathToFileURL(path.join(root, 'fixtures', id + '.html')).href)});` : ''}
console.log(await page.snapshot());
const marker = await page.evaluate(() => document.querySelector('#marker').textContent); if (marker !== ${JSON.stringify(proof.proofId + ':' + id)}) throw new Error('Wrong fixture identity');
await page.fill('#value', ${JSON.stringify(value)}); await page.click('#commit', { label: 'commit protection fixture value' });
await page.waitForFunction(expected => document.querySelector('#result').textContent === expected, ${JSON.stringify(id + ':' + value)}, { timeout: 5000 });
const observed = await page.evaluate(() => ({ marker: document.querySelector('#marker').textContent, value: document.querySelector('#value').value, result: document.querySelector('#result').textContent, href: location.href }));
let screenshotError; try { await page.screenshot({ path: ${JSON.stringify(screenshot)} }); } catch(error) { screenshotError = error.message; }
console.log('PROOF_JSON::' + JSON.stringify({ fixture: ${JSON.stringify(id)}, phase: ${JSON.stringify(phase)}, spaceId: task.spaceId, pageSpaceId: page.spaceId, pageLabel: page.label, nodePid: process.pid, observed, screenshot: screenshotError ? null : ${JSON.stringify(screenshot)}, screenshotError })); console.log(await page.snapshot());\n`);
}
async function compare(label: string) {
    if (!/^[a-z-]+$/.test(label))
        throw new Error('Invalid inventory label');
    const before = await read('spaces-before.json', parseInventory), current = await read(label + '.json', parseInventory);
    const actual = new Map(current.spaces.map(s => [s.id, s]));
    await save(label + '-comparison.json', { at: now(), initialIds: before.spaces.map(s => s.id), currentIds: [...actual.keys()], missingInitialIds: before.spaces.filter(s => !actual.has(s.id)).map(s => s.id), changedInitialMetadataIds: before.spaces.filter(s => actual.has(s.id) && JSON.stringify(s) !== JSON.stringify(actual.get(s.id))).map(s => s.id) });
    console.log(JSON.stringify(await read(label + '-comparison.json')));
}
async function observe(id: string, phase = 'after-error') {
    if (!['A', 'B'].includes(id))
        throw new Error('Invalid fixture');
    if (!/^[a-z-]+$/.test(phase))
        throw new Error('Invalid observation label');
    const binding = await read('binding-' + id + '.json', parseBinding);
    await ego('observe-' + id.toLowerCase() + '-' + phase, `const task = await taskSpace(${binding.spaceId}); const page = task.page('p1'); const info = await page.info(); const dom = await page.evaluate(() => { const e=document.querySelector('#value'), r=e.getBoundingClientRect(); return { readyState: document.readyState, visibilityState: document.visibilityState, width: innerWidth, height: innerHeight, value: e.value, result: document.querySelector('#result').textContent, rect: {x:r.x,y:r.y,width:r.width,height:r.height}, display:getComputedStyle(e).display, visibility:getComputedStyle(e).visibility, htmlLength:document.documentElement.outerHTML.length }; }); console.log('PROOF_JSON::'+JSON.stringify({spaceId:task.spaceId,info,dom,window:await task.cdp('Browser.getWindowForTarget',{targetId:page.targetId})})); console.log(await page.snapshot());\n`);
}
async function restore(id: string) {
    if (!['A', 'B'].includes(id))
        throw new Error('Invalid fixture');
    const binding = await read('binding-' + id + '.json', parseBinding);
    await ego('restore-' + id.toLowerCase() + '-owned-window', `const task=await taskSpace(${binding.spaceId}); const page=task.page('p1'); await page.info(); const before=await task.cdp('Browser.getWindowForTarget',{targetId:page.targetId}); if(before.bounds.windowState !== 'minimized') throw new Error('Window state changed; do not restore'); const receipt=await task.cdp('Browser.setWindowBounds',{windowId:before.windowId,bounds:{windowState:'normal'}}); console.log('PROOF_JSON::'+JSON.stringify({spaceId:task.spaceId,before,receipt}));\n`);
}
async function integrity() {
    const installed = await read('installed-before.json', parseSnapshots), sourceBefore = await read('source-before.json', parseHashes);
    const installedAfter: Record<string, TreeHashes> = {};
    for (const p of Object.keys(installed))
        installedAfter[p] = await hashes(p);
    const sourceAfter = await hashes(source), prior = await oldProof();
    const result = { at: now(), installedUnchanged: JSON.stringify(installed) === JSON.stringify(installedAfter), changedSourceFiles: Object.keys(sourceBefore).filter(p => JSON.stringify(sourceBefore[p]) !== JSON.stringify(sourceAfter[p])), priorEvidenceFilesVerified: prior.fileCount, priorManifestUnchanged: prior.manifestSha256 === (await read('prior-evidence-before.json')).manifestSha256, changedPriorEvidenceFiles: prior.changed };
    await save('integrity-final.json', result);
    console.log(JSON.stringify(result));
}
async function inspectIntegrity() {
    const before = await read('installed-before.json', parseSnapshots), after: Record<string, TreeHashes> = {}, differences: {
        base: string;
        path: string;
        before: unknown;
        after: unknown;
    }[] = [];
    for (const base of Object.keys(before)) {
        after[base] = await hashes(base);
        for (const rel of new Set([...Object.keys(required(before, base)), ...Object.keys(required(after, base))])) {
            if (JSON.stringify(required(before, base)[rel]) !== JSON.stringify(required(after, base)[rel]))
                differences.push({ base, path: rel, before: required(before, base)[rel] ?? null, after: required(after, base)[rel] ?? null });
        }
    }
    await save('installed-after.json', after);
    const result = { at: now(), differences, canonicalUnchanged: differences.length === 0 };
    await save('integrity-diagnosis.json', result);
    console.log(JSON.stringify(result, null, 2));
}
async function render(assessmentName: string, outputName: string) {
    if (!/^assessment-[a-z]+\.json$/.test(assessmentName) || !/^[a-z-]+$/.test(outputName))
        throw new Error('Invalid report input');
    const assessment = await read(assessmentName, parseAssessment), runDir = path.join(root, 'record-run'), evidenceIds = [];
    for (const [i, filename] of assessment.evidence.entries()) {
        if (path.isAbsolute(filename) || filename.split(/[\\/]/).includes('..'))
            throw new Error('Evidence escapes proof');
        const revision = (await read('record-run/evidence.json')).revision;
        const request = { schemaVersion: 3, operationId: outputName + '-ev-' + i, expectedRevision: revision, caseId: 'PROTECTION-R2', sourceFile: path.join(root, filename), kind: filename.endsWith('.png') ? 'screenshot' : 'log', source: '本次 Space 保护补测 ' + filename, description: filename };
        await save('requests/' + request.operationId + '.json', request);
        evidenceIds.push((await registerEvidence({ runDir, request })).evidenceId);
    }
    const revision = (await read('record-run/results.json')).revision;
    for (const [i, attempt] of (assessment.attempts ?? []).entries()) {
        const current = (await read('record-run/results.json')).revision;
        await recordResult({ runDir, request: { schemaVersion: 3, operationId: outputName + '-attempt-' + i, expectedRevision: current, caseId: 'PROTECTION-R2', mode: 'attempt', record: { ...attempt, evidenceIds } } });
    }
    const finalRevision = (await read('record-run/results.json')).revision;
    await recordResult({ runDir, request: { schemaVersion: 3, operationId: outputName + '-result', expectedRevision: finalRevision, caseId: 'PROTECTION-R2', mode: 'final', record: { ...assessment.record, evidenceIds } } });
    const outputDir = path.join(root, outputName);
    await fs.mkdir(outputDir);
    const receipt = await report(runDir, { outputDir }), verified = await verifyReport(runDir, outputDir);
    await save(outputName + '-receipt.json', { receipt, verified });
    console.log(JSON.stringify({ receipt, verified }, null, 2));
}
if (command === 'prepare')
    await prepare();
else if (command === 'exercise')
    await exercise(textValue(args[0], 'proof argument'), textValue(args[1], 'proof argument'));
else if (command === 'compare')
    await compare(textValue(args[0], 'proof argument'));
else if (command === 'observe')
    await observe(textValue(args[0], 'proof argument'), textValue(args[1], 'proof argument'));
else if (command === 'restore')
    await restore(textValue(args[0], 'proof argument'));
else if (command === 'integrity')
    await integrity();
else if (command === 'inspect-integrity')
    await inspectIntegrity();
else if (command === 'report')
    await render(textValue(args[0], 'proof argument'), textValue(args[1], 'proof argument'));
else
    throw new Error('Unknown protection-retest command');
