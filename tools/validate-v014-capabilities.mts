import { SOURCE_ROOT as confirmedSourceRoot } from '../src/scripts/toolchain.mjs';
import { errorInfo, inside } from '../src/core/common.mjs';
import { textValue } from '../src/core/validation.mjs';
import { readData, record as parseObject, inventory as parseInventory, binding as parseBinding, bindings as parseBindings, proof as parseProof, server as parseServer, snapshots as parseSnapshots, treeHashes as parseHashes, roundData as parseRoundData, roundRecord as parseRoundRecord, closureConfirmation as parseClosure, goals as parseGoals, evidenceManifest as parseEvidenceManifest, protectionAssessment as parseAssessment, required } from './proof-data.mjs';
import type { TreeHashes } from './proof-data.mjs';
// Synthetic capability proof only. Not a product executor, installer, or release tool.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL, fileURLToPath } from 'node:url';
const runFile = promisify(execFile);
const sourceRoot = confirmedSourceRoot;
const stamp = () => new Date().toISOString();
const digest = (bytes: Uint8Array) => crypto.createHash('sha256').update(bytes).digest('hex');
const json = (data: unknown) => JSON.stringify(data, null, 2) + '\n';
const [command, directory, ...rest] = process.argv.slice(2);
if (!directory || !path.isAbsolute(directory) || inside(sourceRoot, directory))
    throw new Error('Use a new absolute evidence directory outside the source repository.');
const root = path.resolve(directory);
async function read<T>(name: string, decoder: (value: unknown) => T): Promise<T>;
async function read(name: string): Promise<Record<string, unknown>>;
async function read(name: string, decoder: (value: unknown) => unknown = parseObject): Promise<unknown> { return readData(path.join(root, name), decoder); }
const save = (name: string, value: unknown) => fs.writeFile(path.join(root, name), json(value), { flag: 'wx' });
async function treeHashes(base: string): Promise<TreeHashes> {
    const result: TreeHashes = {};
    async function visit(relative = '') {
        const target = path.join(base, relative);
        const stat = await fs.lstat(target);
        if (stat.isSymbolicLink()) {
            result[relative || '.'] = { link: await fs.readlink(target) };
            return;
        }
        if (stat.isDirectory()) {
            for (const name of await fs.readdir(target))
                if (name !== '.git')
                    await visit(path.join(relative, name));
        }
        else if (stat.isFile())
            result[relative] = digest(await fs.readFile(target));
    }
    try {
        await visit();
    }
    catch (caughte) {
        const e = errorInfo(caughte);
        if (e.code !== 'ENOENT')
            throw e;
        result.absent = true;
    }
    return result;
}
export async function egoRound(proofRoot: string, label: string, code: string, timeout = 65000) {
    if (!/^[a-z0-9-]+$/.test(label))
        throw new Error('Invalid round label');
    const script = path.join(proofRoot, 'rounds', label + '.mjs');
    await fs.writeFile(script, code, { flag: 'wx' });
    const startedAt = stamp();
    const proc = spawn('ego-browser', ['nodejs', '-e', `await import('${pathToFileURL(script).href}')`], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false;
    proc.stdout.on('data', b => { stdout += b; });
    proc.stderr.on('data', b => { stderr += b; });
    const timer = setTimeout(() => { timedOut = true; proc.kill(); }, timeout);
    const exit = await new Promise<{
        code: number | null;
        signal: NodeJS.Signals | null;
    }>((resolve, reject) => { proc.on('error', reject); proc.on('exit', (code, signal) => resolve({ code, signal })); });
    clearTimeout(timer);
    const record = { label, startedAt, endedAt: stamp(), cliPid: proc.pid, ...exit, timedOut, stdout, stderr };
    await fs.writeFile(path.join(proofRoot, 'raw', label + '.json'), json(record), { flag: 'wx' });
    const match = (stdout + '\n' + stderr).match(/PROOF_JSON::(\{[^\n]*\})/);
    const data = match ? parseRoundData(JSON.parse(textValue(match[1], 'proof JSON capture'))) : undefined;
    return { ...record, data };
}
async function prepare() {
    await fs.mkdir(root);
    for (const name of ['rounds', 'raw', 'screenshots', 'project', 'requests'])
        await fs.mkdir(path.join(root, name));
    const config = { proofId: crypto.randomUUID(), startedAt: stamp(), sourceRoot, maxParallelCases: 2, syntheticOnly: true };
    await save('proof.json', config);
    const versions: Record<string, string> = {};
    for (const executable of ['ego-browser', 'node'])
        versions[executable] = (await runFile(executable, ['--version'], { windowsHide: true })).stdout.trim();
    const guide = (await runFile('ego-browser', ['skill'], { windowsHide: true, maxBuffer: 2e6 })).stdout;
    await fs.writeFile(path.join(root, 'ego-guide.txt'), guide, { flag: 'wx' });
    await save('versions.json', versions);
    await save('source-before.json', await treeHashes(sourceRoot));
    const homeDir = textValue(process.env.USERPROFILE, 'USERPROFILE');
    const protectedPaths = [path.join(homeDir, '.agents', 'skills', 'ego-lite-test'), path.join(homeDir, '.agents', 'skills', 'ego-browser'), path.join(homeDir, '.codex', 'skills', 'ego-lite-test'), path.join(homeDir, '.codex', 'config.toml')];
    const protectedHashes: Record<string, TreeHashes> = {};
    for (const p of protectedPaths)
        protectedHashes[p] = await treeHashes(p);
    await save('installed-before.json', protectedHashes);
    const plan = {
        frozenAt: stamp(), source: 'User authorized 0.1.4 capability validation only',
        limits: ['max 2 active test cases', 'loopback synthetic pages only', 'never claim/select/close pre-existing Spaces', 'no installed Skill modification', 'no push or release'],
        goals: [
            { id: 'H-NATIVE', expected: 'Native desktop subagents cannot directly invoke raw Ego CLI or a general host shell.' },
            { id: 'H-RESTRICTED', expected: 'Candidate restricted Codex host exposes only the case-scoped synthetic probe tool, with trusted thread identity and no alternative execution/browser tools.' },
            { id: 'ROUTE-A', expected: 'Case A remains in its one owned Space across rounds, edits/observes only synthetic A, saves a real screenshot, and overlaps a second process at the server barrier.' },
            { id: 'ROUTE-B', expected: 'Case B remains in its one owned Space across rounds, edits/observes only synthetic B, saves a real screenshot, and overlaps a second process at the server barrier.' },
            { id: 'PROTECTION', expected: 'Pre-existing Space IDs remain present; cleanup only addresses exact IDs created by this proof; installed Skill and user config hashes remain unchanged.' }
        ]
    };
    await save('frozen-plan.json', plan);
    console.log(json({ evidenceRoot: root, proofId: config.proofId, goals: plan.goals.length }));
}
async function inventory(label: string) {
    const result = await egoRound(root, label, `console.log('PROOF_JSON::' + JSON.stringify({ at: new Date().toISOString(), nodePid: process.pid, parentPid: process.ppid, spaces: await listTaskSpaces() }));\n`);
    if (result.data)
        await save(label + '.json', result.data);
    console.log(json(result));
}
async function correctedBaseline() {
    const original = await read('raw/spaces-before.json', parseRoundRecord);
    const match = (original.stdout + '\n' + original.stderr).match(/PROOF_JSON::(\{[^\n]*\})/);
    if (!match?.[1])
        throw new Error('Original inventory did not return observations');
    await save('spaces-before.json', JSON.parse(match[1]));
    await save('source-before-corrected.json', await treeHashes(sourceRoot));
    const old = await read('installed-before.json', parseSnapshots);
    const corrected: Record<string, TreeHashes> = {};
    for (const p of Object.keys(old))
        corrected[p] = await treeHashes(p);
    await save('installed-before-corrected.json', corrected);
    await save('preflight-correction.json', { at: stamp(), reason: 'Ego sends console observations on stderr. Reparsed original read-only inventory. Fixed missing braces in the new proof-only hash walker and took valid hashes before creating any Space. Original raw files retained.', sourceFiles: Object.keys(await treeHashes(sourceRoot)).length, installedFiles: Object.values(corrected).reduce((n, v) => n + Object.keys(v).length, 0) });
    console.log(json({ corrected: true, protectedSpaceIds: parseInventory(JSON.parse(match[1])).spaces.map(s => s.id) }));
}
async function allocate() {
    const before = await read('spaces-before.json', parseInventory);
    const existing = new Set(before.spaces.map(s => s.id));
    const proof = await read('proof.json', parseProof);
    const bindings: ReturnType<typeof parseBinding>[] = [];
    // At-most-once intents: this command cannot be rerun after an uncertain creation.
    await save('allocation-intent.json', { at: stamp(), proofId: proof.proofId, cases: ['A', 'B'] });
    for (const caseId of ['A', 'B']) {
        const name = 'ego014-' + proof.proofId.slice(0, 8) + '-' + caseId;
        const result = await egoRound(root, 'allocate-' + caseId.toLowerCase(), `const task = await taskSpace(${JSON.stringify(name)});\nconsole.log('PROOF_JSON::' + JSON.stringify({ caseId: ${JSON.stringify(caseId)}, spaceId: task.spaceId, name: task.name, ownership: task.ownership, nodePid: process.pid, parentPid: process.ppid, pages: await task.pages() }));\n`);
        if (result.code !== 0 || !result.data || (typeof result.data.spaceId !== 'number' || existing.has(result.data.spaceId)) || bindings.some(x => x.spaceId === result.data?.spaceId))
            throw new Error('Allocation uncertain or not fresh; stop without retry/cleanup by name.');
        bindings.push(parseBinding(result.data));
        await save('binding-' + caseId + '.json', result.data);
    }
    await save('bindings.json', bindings);
    console.log(json(bindings));
}
function fixture(caseId: string, proofId: string) {
    return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Synthetic case ${caseId}</title><style>body{font:22px system-ui;background:${caseId === 'A' ? '#e5f0ff' : '#fff0df'};margin:50px;color:#132133}main{background:white;padding:35px;border:3px solid #345;border-radius:15px;max-width:900px}input,button{font:22px system-ui;padding:12px;margin:10px}output{display:block;padding:20px;background:#eef6ef}</style><main><h1>Synthetic case ${caseId}</h1><p id="marker">${proofId}:${caseId}</p><label>Case value <input id="value" autocomplete="off"></label><button id="commit">Commit synthetic value</button><output id="result">No value committed</output><p id="barrier">Not joined</p><a id="popup" href="/popup/${caseId}" target="_blank">Open same-case popup</a></main><script>document.querySelector('#commit').onclick=()=>{const value=document.querySelector('#value').value;document.querySelector('#result').textContent='${caseId}:'+value;document.body.dataset.committed=value;};window.proofCase=${JSON.stringify(caseId)};window.proofId=${JSON.stringify(proofId)};</script></html>`;
}
async function serve() {
    const proof = await read('proof.json', parseProof);
    const barriers = new Map<string, Map<string, {
        res: http.ServerResponse;
        arrivedAt: string;
        timer: ReturnType<typeof setTimeout>;
    }>>();
    const logPath = path.join(root, 'server-events.jsonl');
    const log = (data: Record<string, unknown>) => fs.appendFile(logPath, JSON.stringify({ at: stamp(), ...data }) + '\n');
    const server = http.createServer(async (req, res) => {
        const u = new URL(req.url ?? '/', 'http://127.0.0.1');
        await log({ event: 'request', method: req.method, path: u.pathname });
        if (u.pathname === '/shutdown' && req.method === 'POST') {
            res.end('stopping');
            server.close();
            return;
        }
        if (/^\/case\/[AB]$/.test(u.pathname)) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:" });
            res.end(fixture(textValue(u.pathname.at(-1), 'fixture case'), proof.proofId));
            return;
        }
        if (/^\/popup\/[AB]$/.test(u.pathname)) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h1>Popup ' + u.pathname.at(-1) + '</h1><p>' + proof.proofId + '</p>');
            return;
        }
        if (/^\/barrier\/[a-z0-9-]+\/[AB]$/.test(u.pathname)) {
            const [, , phase, caseId] = u.pathname.split('/');
            if (!phase || !caseId)
                throw new Error('Invalid barrier route');
            const members = barriers.get(phase) ?? new Map();
            barriers.set(phase, members);
            if (members.has(caseId)) {
                res.writeHead(409);
                res.end('duplicate');
                return;
            }
            const arrivedAt = stamp();
            const timer = setTimeout(async () => { await log({ event: 'barrier-timeout', phase, caseId }); if (!res.writableEnded) {
                res.writeHead(504);
                res.end(JSON.stringify({ error: 'peer did not arrive' }));
            } }, 20000);
            members.set(caseId, { res, arrivedAt, timer });
            await log({ event: 'barrier-arrival', phase, caseId, arrivedAt });
            if (members.size === 2) {
                const releasedAt = stamp();
                await log({ event: 'barrier-release', phase, members: [...members].map(([id, v]) => ({ caseId: id, arrivedAt: v.arrivedAt })), releasedAt });
                for (const [id, member] of members) {
                    clearTimeout(member.timer);
                    if (!member.res.writableEnded) {
                        member.res.writeHead(200, { 'Content-Type': 'application/json' });
                        member.res.end(JSON.stringify({ phase, caseId: id, releasedAt, peerObserved: true }));
                    }
                }
            }
            return;
        }
        if (u.pathname === '/health') {
            res.end(JSON.stringify({ proofId: proof.proofId, synthetic: true }));
            return;
        }
        res.writeHead(404);
        res.end('not found');
    });
    server.listen(0, '127.0.0.1', async () => {
        const address = server.address();
        if (!address || typeof address === 'string')
            throw new Error('Missing loopback address');
        await save('server.json', { pid: process.pid, baseURL: 'http://127.0.0.1:' + address.port, startedAt: stamp(), proofId: proof.proofId });
        console.log('Synthetic server ready ' + address.port);
    });
}
async function round(caseId: string, phase: string) {
    if (!['A', 'B'].includes(caseId) || !['initial', 'resume'].includes(phase))
        throw new Error('Invalid synthetic case/phase');
    const binding = await read('binding-' + caseId + '.json', parseBinding);
    const server = await read('server.json', parseServer);
    const proof = await read('proof.json', parseProof);
    const screenshot = path.join(root, 'screenshots', caseId + '-' + phase + '.png').replaceAll('\\', '/');
    const value = caseId + '-' + phase + '-' + proof.proofId.slice(0, 8);
    const code = `const fs = await import('node:fs/promises');
const task = await taskSpace(${binding.spaceId});
const page = task.page('p1');
const startedAt = new Date().toISOString();
${phase === 'initial' ? `await page.goto(${JSON.stringify(server.baseURL + '/case/' + caseId)});` : ''}
const before = await page.snapshot();
console.log('SNAPSHOT_BEFORE::' + before);
await page.fill('#value', ${JSON.stringify(value)});
await page.click('#commit', { label: 'commit synthetic case value' });
await page.waitForFunction((expected) => document.body.dataset.committed === expected, ${JSON.stringify(value)}, { timeout: 5000 });
const barrier = await page.fetch(${JSON.stringify('/barrier/' + phase + '/' + caseId)}, { timeout: 25000 });
const observed = await page.evaluate(() => ({ caseId: window.proofCase, proofId: window.proofId, marker: document.querySelector('#marker').textContent, value: document.querySelector('#value').value, result: document.querySelector('#result').textContent, href: location.href }));
let screenshotError;
try { await page.screenshot({ path: ${JSON.stringify(screenshot)} }); } catch (caughterror) { const error = errorInfo(caughterror); screenshotError = error.message; }
console.log('PROOF_JSON::' + JSON.stringify({ caseId: ${JSON.stringify(caseId)}, phase: ${JSON.stringify(phase)}, spaceId: task.spaceId, pageSpaceId: page.spaceId, pageLabel: page.label, nodePid: process.pid, parentPid: process.ppid, startedAt, endedAt: new Date().toISOString(), observed, barrier, screenshot: screenshotError ? null : ${JSON.stringify(screenshot)}, screenshotError, pages: await task.pages() }));
console.log(await page.snapshot());
if (screenshotError) throw new Error('Screenshot evidence missing: ' + screenshotError);
`;
    const result = await egoRound(root, 'route-' + caseId.toLowerCase() + '-' + phase, code);
    if (result.data)
        await save('route-' + caseId + '-' + phase + '.json', result.data);
    console.log(json(result));
}
async function readback(caseId: string) {
    const binding = await read('binding-' + caseId + '.json', parseBinding);
    const result = await egoRound(root, 'independent-readback-' + caseId.toLowerCase(), `const task = await taskSpace(${binding.spaceId}); const page = task.page('p1'); console.log('PROOF_JSON::' + JSON.stringify({ spaceId: task.spaceId, nodePid: process.pid, observed: await page.evaluate(() => ({ caseId: window.proofCase, proofId: window.proofId, value: document.querySelector('#value').value, result: document.querySelector('#result').textContent, href: location.href })), pages: await task.pages() }));\n`);
    if (result.data)
        await save('readback-' + caseId + '.json', result.data);
    console.log(json(result));
}
async function windowState(action: string) {
    const binding = await read('binding-A.json', parseBinding);
    if (!['inspect', 'inspect-resolved', 'restore'].includes(action))
        throw new Error('Invalid window action');
    const code = `const task = await taskSpace(${binding.spaceId}); const page = task.page('p1'); ${action !== 'inspect' ? 'await page.info();' : ''} const before = await task.cdp('Browser.getWindowForTarget', { targetId: page.targetId }); ${action === 'restore' ? "if (before.bounds.windowState !== 'minimized') throw new Error('Window state changed, refusing restore'); await task.cdp('Browser.setWindowBounds', { windowId: before.windowId, bounds: { windowState: 'normal' } });" : ''} console.log('PROOF_JSON::' + JSON.stringify({ spaceId: task.spaceId, before, after: await task.cdp('Browser.getWindowForTarget', { targetId: page.targetId }) }));\n`;
    const result = await egoRound(root, 'window-' + action, code);
    if (result.data)
        await save('window-' + action + '.json', result.data);
    console.log(json(result));
}
async function finish(caseId: string) {
    const binding = await read('binding-' + caseId + '.json', parseBinding);
    const before = await read('spaces-before.json', parseInventory);
    if (before.spaces.some(s => s.id === binding.spaceId))
        throw new Error('Refusing to finish a protected pre-existing Space');
    await save('finish-intent-' + caseId + '.json', { at: stamp(), spaceId: binding.spaceId, created: binding, policy: 'close only this owned synthetic Space; no pre-existing Space' });
    const result = await egoRound(root, 'finish-' + caseId.toLowerCase(), `const spaces = await listTaskSpaces(); const current = spaces.find(s => s.id === ${binding.spaceId}); if (!current || current.ownership !== 'agent' || current.name !== ${JSON.stringify(binding.name)}) throw new Error('Ownership changed; preserve Space'); const task = await taskSpace(${binding.spaceId}); console.log('PROOF_JSON::' + JSON.stringify({ spaceId: task.spaceId, finish: await task.finish({ keep: [] }) }));\n`);
    if (result.data)
        await save('finish-' + caseId + '.json', result.data);
    console.log(json(result));
}
async function reportPreview() {
    const binding = await read('binding-A.json', parseBinding);
    const htmlPath = path.join(root, 'precleanup-report', 'report.html');
    const code = `const task = await taskSpace(${binding.spaceId}); const page = await task.newPage(); await page.goto(${JSON.stringify(pathToFileURL(htmlPath).href)}); const observed = await page.evaluate(() => ({ title: document.title, caseCount: document.querySelectorAll('.case').length, images: [...document.images].map(i => ({ complete: i.complete, naturalWidth: i.naturalWidth })), text: document.body.innerText.slice(0, 1400) })); const screenshot = ${JSON.stringify(path.join(root, 'screenshots', 'report-preview.png').replaceAll('\\', '/'))}; await page.screenshot({ path: screenshot }); console.log('PROOF_JSON::' + JSON.stringify({ spaceId: task.spaceId, pageLabel: page.label, url: await page.url(), observed, screenshot })); console.log(await page.snapshot());\n`;
    const result = await egoRound(root, 'report-preview', code);
    if (result.data)
        await save('report-preview.json', result.data);
    console.log(json(result));
}
async function readPreview() {
    const binding = await read('binding-A.json', parseBinding);
    const expectedURL = pathToFileURL(path.join(root, 'precleanup-report', 'report.html')).href;
    const code = `const task = await taskSpace(${binding.spaceId}); const pages = await task.pages(); if (!pages.some(p => p.label === 'p2')) throw new Error('Original report Page missing; do not create another'); const page = task.page('p2'); const url = await page.url(); if (url !== ${JSON.stringify(expectedURL)}) throw new Error('Report Page changed; stop'); console.log('PROOF_JSON::' + JSON.stringify({ spaceId: task.spaceId, pageLabel: page.label, url, observed: await page.evaluate(() => ({ title: document.title, images: [...document.images].map(i => ({ complete: i.complete, naturalWidth: i.naturalWidth })), text: document.body.innerText.slice(0, 2500) })), window: await task.cdp('Browser.getWindowForTarget', { targetId: page.targetId }) }));\n`;
    const result = await egoRound(root, 'report-preview-readback', code);
    if (result.data)
        await save('report-preview-readback.json', result.data);
    console.log(json(result));
}
async function integrity(suffix = 'after') {
    if (!['after', 'final'].includes(suffix))
        throw new Error('Invalid integrity label');
    const protectedBefore = await read('installed-before-corrected.json', parseSnapshots);
    const protectedAfter: Record<string, TreeHashes> = {};
    for (const p of Object.keys(protectedBefore))
        protectedAfter[p] = await treeHashes(p);
    const beforeSource = await read('source-before-corrected.json', parseHashes);
    const afterSource = await treeHashes(sourceRoot);
    const originalChanged = Object.keys(beforeSource).filter(p => JSON.stringify(beforeSource[p]) !== JSON.stringify(afterSource[p]));
    const added = Object.keys(afterSource).filter(p => !(p in beforeSource));
    const result = { at: stamp(), installedUnchanged: JSON.stringify(protectedBefore) === JSON.stringify(protectedAfter), originalChanged, added };
    await save('integrity-' + suffix + '.json', result);
    console.log(json(result));
}
async function audit() {
    const before = await read('spaces-before.json', parseInventory);
    const after = await read('spaces-after-cleanup.json', parseInventory);
    const confirmed = await read('user-space-confirmation.json', parseClosure);
    const bindings = await read('bindings.json', parseBindings);
    const actual = new Set(after.spaces.map(s => s.id));
    const records: ReturnType<typeof parseRoundRecord>[] = [];
    for (const name of await fs.readdir(path.join(root, 'raw'))) {
        if (!name.endsWith('.json'))
            continue;
        const record = await read('raw/' + name, parseRoundRecord);
        if (record.cliPid && record.startedAt && record.endedAt)
            records.push(record);
    }
    const events = records.flatMap(r => [{ t: r.startedAt, delta: 1 }, { t: r.endedAt, delta: -1 }]).sort((a, b) => a.t.localeCompare(b.t) || a.delta - b.delta);
    let active = 0, maximum = 0;
    for (const event of events) {
        active += event.delta;
        maximum = Math.max(maximum, active);
    }
    const scripts: Record<string, string> = {};
    const numericSelections = new Set<number>();
    for (const name of await fs.readdir(path.join(root, 'rounds'))) {
        const bytes = await fs.readFile(path.join(root, 'rounds', name));
        scripts[name] = digest(bytes);
        for (const match of bytes.toString('utf8').matchAll(/taskSpace\((\d+)\)/g))
            numericSelections.add(Number(match[1]));
    }
    const result = {
        at: stamp(), initialIds: before.spaces.map(s => s.id), finalIds: [...actual], ownedIds: bindings.map(b => b.spaceId),
        userConfirmedClosedIds: confirmed.confirmedManualClosureIds,
        missingInitialIds: before.spaces.map(s => s.id).filter(id => !actual.has(id)),
        unexplainedMissingInitialIds: before.spaces.map(s => s.id).filter(id => !actual.has(id) && !confirmed.confirmedManualClosureIds.includes(id)),
        remainingProtectedMetadataMatches: before.spaces.filter(s => actual.has(s.id)).every(s => JSON.stringify(s) === JSON.stringify(after.spaces.find(v => v.id === s.id))),
        ownedSpacesGone: bindings.every(b => !actual.has(b.spaceId)),
        finishReceipts: await Promise.all(['A', 'B'].map(id => read('finish-' + id + '.json'))),
        numericSelections: [...numericSelections], unexpectedNumericSelections: [...numericSelections].filter(id => !bindings.some(b => b.spaceId === id)),
        maxOverlappingEgoCliInvocations: maximum, records: records.map(({ label, startedAt, endedAt, cliPid, code }) => ({ label, startedAt, endedAt, cliPid, code })),
        roundScriptSha256: scripts,
        caveat: 'Metadata and recorded calls only. User-confirmed closures are external to this proof. No user page content was inspected. This is not a browser restart or hostile-program isolation proof.'
    };
    await save('audit-summary.json', result);
    console.log(json(result));
}
async function shutdown() {
    const server = await read('server.json', parseServer);
    const proof = await read('proof.json', parseProof);
    const url = new URL(server.baseURL);
    if (url.hostname !== '127.0.0.1')
        throw new Error('Only this loopback fixture may be stopped');
    const health = parseProof(await (await fetch(new URL('/health', url))).json());
    if (health.proofId !== proof.proofId)
        throw new Error('Fixture identity changed');
    const response = await fetch(new URL('/shutdown', url), { method: 'POST' });
    await save('server-shutdown.json', { at: stamp(), proofId: proof.proofId, status: response.status, body: await response.text() });
    console.log('Owned synthetic server shutdown requested');
}
if (command === 'prepare')
    await prepare();
else if (command === 'baseline-correction')
    await correctedBaseline();
else if (command === 'inventory')
    await inventory(textValue(rest[0], 'proof argument'));
else if (command === 'allocate')
    await allocate();
else if (command === 'serve')
    await serve();
else if (command === 'round')
    await round(textValue(rest[0], 'proof argument'), textValue(rest[1], 'proof argument'));
else if (command === 'readback')
    await readback(textValue(rest[0], 'proof argument'));
else if (command === 'window')
    await windowState(textValue(rest[0], 'proof argument'));
else if (command === 'finish')
    await finish(textValue(rest[0], 'proof argument'));
else if (command === 'preview-report')
    await reportPreview();
else if (command === 'read-preview')
    await readPreview();
else if (command === 'integrity')
    await integrity(textValue(rest[0], 'proof argument'));
else if (command === 'audit')
    await audit();
else if (command === 'shutdown')
    await shutdown();
else
    throw new Error('Unknown proof command');
