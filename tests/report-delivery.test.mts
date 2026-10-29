import type { TestContext } from 'node:test';
import { at, readJson as read, objectValue } from './support.mjs';
import { validateReportContext } from '../src/report/delivery.mjs';
import { htmlReport, htmlReportPayload, markdown } from '../src/report/render.mjs';
import { TOOL_VERSION, TOOL_REVISION } from '../src/scripts/toolchain.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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
    return { schemaVersion: 7, project: 'Synthetic report delivery only', cases: ['original', 'extra'].map(id => ({
        id, title: 'Synthetic ' + id, criticalConditions: [], requiredPath: null, stepOrder: 'strict',
        steps: [{ id: 'inspect', action: 'Inspect the synthetic result.' }],
        goals: ['visible','scope'].map(goal => ({id: goal, title:'Synthetic '+goal, basis: {kind:'explicit',source:'Synthetic fixture',text:'Synthetic expectation.'}, expected: 'Synthetic '+goal+' result.',requiredRefs:['step:inspect']}))
    })) };
}
async function fixture(t: TestContext) {
    const root=await temporary(t),project=path.join(root,'project'),run=path.join(root,'run');await init(project);
    const input=path.join(project,'cases.json');await write(input,cases());await start({projectDir:project,casesFile:input,outputDir:run});
    const source=path.join(root,'source.txt');await fs.writeFile(source,'Synthetic observation, not a screenshot.');
    const ev=await registerEvidence({runDir:run,request:{schemaVersion:7,operationId:'ev',expectedRevision:0,caseId:'original',sourceFile:source,kind:'other',source:'Synthetic observer',description:'Synthetic text evidence.'}});
    await recordResult({runDir:run,request:{schemaVersion:7,operationId:'first-attempt',expectedRevision:0,caseId:'original',mode:'attempt',record:{observations:[{id:'first',summary:'Initial uncertainty preserved.',coveredRefs:['step:inspect'],evidenceIds:[ev.evidenceId]}],assessments:[{goalId:'visible',status:'inconclusive',rationale:'Action confirmation missing.',observationIds:['first'],gaps:['Need independent readback.']}]}}});
    await recordResult({runDir:run,request:{schemaVersion:7,operationId:'final',expectedRevision:1,caseId:'original',mode:'final',record:{observations:[{id:'readback',summary:'Synthetic valid readback.',coveredRefs:['step:inspect'],evidenceIds:[ev.evidenceId]}],assessments:[{goalId:'visible',status:'violation',rationale:'Readback contradicts the explicit expected result.',observationIds:['readback'],gaps:[],diagnosis:{state:'unknown',category:'unknown',summary:'Business violation established; implementation cause unknown.',evidenceIds:[]}},{goalId:'scope',status:'not_tested',rationale:'User deferred the second identity.',observationIds:[],gaps:['Second identity unavailable.']}]}}});
    return {root,project,run,source,evidenceId:ev.evidenceId};
}
async function context(f:Awaited<ReturnType<typeof fixture>>) {
    const value={schemaVersion:7,kind:'retrospective',summary:'Synthetic assembly after execution </script><img src=x>',limitations:['Synthetic missing screenshot; no new execution.'],sources:[{label:'Synthetic source',file:f.source,sha256:hash(await fs.readFile(f.source))}],supplementalCaseIds:['extra']};
    const filename=path.join(f.root,'context.json');await write(filename,value);return {filename,value};
}
function payloadOf(html: string) {
    const encoded = html.match(/<script[^>]*id="report-data"[^>]*>([\s\S]*?)<\/script>/);
    assert.ok(encoded); return objectValue(JSON.parse(at(encoded, 1)));
}
test('standalone package contains resolvable guides/scripts/schemas and runs from an unrelated cwd', async (t) => {
    const root = await temporary(t), bundle = path.join(root, 'standalone skill');
    const built = await buildSkill(bundle), identity = await toolInfo(bundle);
    assert.equal(identity.installationIntegrity, 'verified');
    assert.equal(identity.name, 'ai-autonomous-testing-ego-lite');
    const skillText = await fs.readFile(path.join(bundle, 'SKILL.md'), 'utf8');
    assert.ok(skillText.startsWith('---\nname: ai-autonomous-testing-ego-lite\n'));
    const ui = await fs.readFile(path.join(bundle, 'agents/openai.yaml'), 'utf8');
    assert.ok(ui.includes('display_name: "AI 自主自动化测试 · Ego Lite"'));
    assert.ok(ui.includes('$ai-autonomous-testing-ego-lite'));
    assert.equal((await read(path.join(bundle, 'package.json'))).name, identity.name);
    assert.equal(identity.fingerprint, built.fingerprint);
    assert.deepEqual(await fs.readFile(path.join(bundle, 'scripts/ego.mjs')), await fs.readFile(path.join(TOOL_ROOT, 'scripts/ego.mjs')));
    const manifest = await read(path.join(bundle, 'runtime-manifest.json'));
    const manifestFiles = objectValue(manifest.files);
    for (const name of ['agents/openai.yaml', 'docs/rename-upgrade.md', 'references/resource-readiness.md', 'docs/version-history.md', 'docs/version-history.en.md', 'docs/v0.1.5-local-acceptance.md', 'docs/images/version-history.svg', 'docs/images/version-history.zh-CN.svg', 'docs/images/version-history.png', 'docs/images/version-history.zh-CN.png']) {
        assert.ok(Object.hasOwn(manifestFiles, name), 'Required readiness/history asset must be shipped: ' + name);
        assert.deepEqual(await fs.readFile(path.join(bundle, name)), await fs.readFile(path.join(TOOL_ROOT, name)));
    }
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
    const verification = await cli(['verify-report', '--run-dir', run, '--report-dir', run]); assert.ok(Array.isArray(verification.artifacts)); assert.equal(verification.artifacts.length, 4);
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
test('renamed package rejects legacy Skill identity and changed Codex metadata', async t => {
    const root = await temporary(t), bundle = path.join(root, 'ai-autonomous-testing-ego-lite');
    await buildSkill(bundle);
    const skillPath = path.join(bundle, 'SKILL.md'), skill = await fs.readFile(skillPath, 'utf8');
    await fs.writeFile(skillPath, skill.replace('name: ai-autonomous-testing-ego-lite', 'name: ego-lite-test'));
    await assert.rejects(toolInfo(bundle), /version or revision mismatch/);
    await fs.writeFile(skillPath, skill);
    assert.equal((await toolInfo(bundle)).installationIntegrity, 'verified');
    await fs.appendFile(path.join(bundle, 'agents/openai.yaml'), '\n# unexpected local metadata change\n');
    await assert.rejects(toolInfo(bundle), /manifest mismatch/);
});

test('three report formats share four-state goals, preserve first attempts and do not infer missing assessments',async t=>{
    const f=await fixture(t),out=await report(f.run),data=await check(f.run);
    assert.deepEqual(await read(out.reportJson),data);assert.equal(data.schemaVersion,7);
    assert.deepEqual(data.counts,{verified:0,violation:1,inconclusive:0,not_tested:1,unassessed:2});assert.equal(data.assessmentComplete,false);assert.equal(data.goalCount,4);
    assert.equal(Object.hasOwn(at(data.cases,0),'status'),false);assert.equal(at(data.cases,0).entries.length,2);
    assert.equal(at(data.cases,0).assessments.find(a=>a.goalId==='visible')?.diagnosis?.state,'unknown');
    assert.equal(data.execution?.imports.length,0); // Serial results render without an execution import.
    const html=await fs.readFile(out.reportHtml,'utf8'),md=await fs.readFile(out.reportMarkdown,'utf8'),payload=payloadOf(html);
    assert.deepEqual(payload.report,data);
    assert.match(md,/发现违反：1/);assert.match(md,/未登记目标评估：2/);assert.match(md,/Initial uncertainty preserved/);assert.match(JSON.stringify(payload.report),/Initial uncertainty preserved/);
    assert.match(md,/冻结前提与必要业务步骤/);assert.equal(out.browserOpen,'not_checked');assert.equal(out.filesVerified,true);assert.equal(out.artifacts.length,4);
    for(const artifact of out.artifacts){const bytes=await fs.readFile(artifact.path);assert.equal(bytes.length,artifact.bytes);assert.equal(hash(bytes),artifact.sha256)}
    assert.equal((await verifyReport(f.run)).filesVerified,true);
    await fs.appendFile(out.reportHtml,'\nSynthetic alteration');await assert.rejects(verifyReport(f.run),/does not match/);
    await fs.unlink(out.reportMarkdown);await assert.rejects(verifyReport(f.run),{code:'ENOENT'});
});
test('context adds provenance without changing business assessments or plan provenance and preserves original files',async t=>{
    const f=await fixture(t);await report(f.run);const ctx=await context(f);
    const names=['baseline.json','manifest.json','results.json','evidence.json','report.json','report.md','report.html'];const before=await Promise.all(names.map(n=>fs.readFile(path.join(f.run,n))));
    const target=path.join(f.root,'new report');await fs.mkdir(target);const out=await report(f.run,{outputDir:target,contextFile:ctx.filename});
    const data=await check(f.run);data.context=await validateReportContext(ctx.value,data);assert.deepEqual(await read(out.reportJson),data);
    const html=await fs.readFile(out.reportHtml,'utf8'),payload=payloadOf(html);assert.deepEqual(objectValue(payload.report).context,data.context);
    assert.doesNotMatch(html,/<img src=x>/);assert.doesNotMatch(html,/来源计划步骤（不证明执行前冻结）/);assert.match(JSON.stringify(payload.report),/violation/);
    assert.equal((await verifyReport(f.run,target)).filesVerified,true);
    for(const [i,name] of names.entries())assert.deepEqual(await fs.readFile(path.join(f.run,name)),before[i]);
    await assert.rejects(report(f.run,{outputDir:target,contextFile:ctx.filename}),/overwrite/);
});
test('context rejects old format, independent verdicts and bad provenance before writing outputs',async t=>{
    const f=await fixture(t),ctx=await context(f),target=path.join(f.root,'new');await fs.mkdir(target);
    const invalids=[{...ctx.value,schemaVersion:1},{...ctx.value,reviews:[{caseId:'original',status:'verified'}]},{...ctx.value,sources:[{...at(ctx.value.sources),sha256:'0'.repeat(64)}]},{...ctx.value,supplementalCaseIds:['missing']},{...ctx.value,supplementalCaseIds:['extra','extra']},{...ctx.value,capturedAt:'invented'}];
    for(const value of invalids){await write(ctx.filename,value);await assert.rejects(report(f.run,{outputDir:target,contextFile:ctx.filename}));assert.deepEqual(await fs.readdir(target),[])}
});
test('changed sources and later goal assessments invalidate report verification without rewriting reports',async t=>{
    const f=await fixture(t),ctx=await context(f),out=await report(f.run,{contextFile:ctx.filename}),html=await fs.readFile(out.reportHtml);
    await fs.appendFile(f.source,'\nchanged');await assert.rejects(verifyReport(f.run),/source hash mismatch/);assert.deepEqual(await fs.readFile(out.reportHtml),html);await fs.writeFile(f.source,'Synthetic observation, not a screenshot.');
    await recordResult({runDir:f.run,request:{schemaVersion:7,operationId:'later',expectedRevision:2,caseId:'extra',mode:'final',record:{observations:[],assessments:[{goalId:'scope',status:'not_tested',rationale:'Explicitly deferred.',observationIds:[],gaps:['Identity deferred.']}]}}});
    await assert.rejects(verifyReport(f.run),/does not match/);assert.deepEqual(await fs.readFile(out.reportHtml),html);
});
test('evidence references must belong to case, while repeated content is not independent evidence',async t=>{
    const f=await fixture(t);
    await assert.rejects(recordResult({runDir:f.run,request:{schemaVersion:7,operationId:'wrong-evidence',expectedRevision:2,caseId:'extra',mode:'final',record:{observations:[{id:'wrong',summary:'Invalid cross-case evidence reference.',coveredRefs:['step:inspect'],evidenceIds:[f.evidenceId]}],assessments:[{goalId:'visible',status:'verified',rationale:'Synthetic invalid evidence.',observationIds:['wrong'],gaps:[]}]}}}));
    await registerEvidence({runDir:f.run,request:{schemaVersion:7,operationId:'duplicate-text',expectedRevision:1,caseId:'extra',sourceFile:f.source,kind:'other',source:'Synthetic shared index',description:'Second association, not a second observation.'}});
    const data=await check(f.run);assert.equal(data.evidenceIntegrity.hashVerifiedItems,2);assert.equal(data.evidenceCoverage.distinctRetainedContents,1);assert.equal(data.evidenceCoverage.registeredScreenshots,0);
    const out=await report(f.run);assert.deepEqual(await read(out.reportJson),data);
});
test('screenshots stay self-contained and reject active formats without changing business outcome',async t=>{
    const f=await fixture(t),pngFile=path.join(f.root,'sample.png'),svgFile=path.join(f.root,'sample.svg');
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRz0AAAAASUVORK5CYII=','base64');
    await fs.writeFile(pngFile,png);await fs.writeFile(svgFile,'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const shot=await registerEvidence({runDir:f.run,request:{schemaVersion:7,operationId:'shot',expectedRevision:1,caseId:'original',sourceFile:pngFile,kind:'screenshot',source:'Local synthetic fixture',description:'Synthetic screenshot </script><img src=x>'}});
    await registerEvidence({runDir:f.run,request:{schemaVersion:7,operationId:'active-image',expectedRevision:2,caseId:'original',sourceFile:svgFile,kind:'screenshot',source:'Local synthetic fixture',description:'Unsupported active image format'}});
    await recordResult({runDir:f.run,request:{schemaVersion:7,operationId:'shot-observation',expectedRevision:2,caseId:'original',mode:'attempt',record:{observations:[{id:'shot-observation',summary:'Synthetic snapshot registered; no new verdict.',coveredRefs:['step:inspect'],evidenceIds:[shot.evidenceId]}],assessments:[]}}});
    const out=await report(f.run),html=await fs.readFile(out.reportHtml,'utf8'),payload=payloadOf(html);
    assert.match(html,/data:image\/png;base64,/);assert.doesNotMatch(html,/data:image\/svg/);assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);assert.doesNotMatch(html,/<img src=x>/);assert.match(html,/connect-src 'none'/);
    const previews=objectValue(payload.previews),assets=objectValue(payload.assets);
    assert.ok(Object.values(assets).some(value=>objectValue(value).kind==='image'));
    assert.ok(Object.values(previews).some(value=>objectValue(value).contentState==='unsupported'));
    assert.equal(objectValue(objectValue(payload.report).counts).violation,1);
    const saved=await fs.readFile(out.reportHtml);await fs.appendFile(path.join(f.run,shot.path),'changed');await assert.rejects(verifyReport(f.run),/hash or byte count mismatch/);assert.deepEqual(await fs.readFile(out.reportHtml),saved);
});
test('failed multi-file delivery rolls back only files created by that delivery',async t=>{
    const f=await fixture(t),target=path.join(f.root,'failed-delivery');await fs.mkdir(target);await fs.writeFile(path.join(target,'user.txt'),'Keep user-owned content.');
    const before=await fs.readFile(path.join(f.run,'results.json')),open=fs.open;
    const mocked=t.mock.method(fs,'open',async(...args:Parameters<typeof fs.open>)=>{if(String(args[0])===path.join(target,'report.md'))throw new Error('Synthetic second-file write failure');return open(...args)});
    await assert.rejects(report(f.run,{outputDir:target}),/Synthetic second-file write failure/);mocked.mock.restore();
    assert.deepEqual(await fs.readdir(target),['user.txt']);assert.equal(await fs.readFile(path.join(target,'user.txt'),'utf8'),'Keep user-owned content.');assert.deepEqual(await fs.readFile(path.join(f.run,'results.json')),before);
});
test('follow-up references show later conclusion without replacing the original assessment',async t=>{
    const f=await fixture(t),data=await check(f.run),original=at(data.cases,0),later=at(data.cases,1),goal=at(later.goals,0);
    goal.followUpOf={runId:data.runId,caseId:original.id,goalId:'visible',reason:'Requirement scope clarified after the first assessment.'};
    const html=htmlReport(await htmlReportPayload(f.run,data)),payload=payloadOf(html);
    assert.deepEqual(payload.report,data); assert.match(JSON.stringify(payload.report),/followUpOf/);
    assert.match(markdown(data),/后续复核：extra\/visible；未登记目标评估/);
    assert.equal(original.assessments.find(a=>a.goalId==='visible')?.status,'violation');
});
