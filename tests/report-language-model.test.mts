import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fixture, record, untested, readJSON, writeJSON } from './goals-fixture.mjs';
import { saveCases, readCasesFile, goalDefinitionHash } from '../src/core/case-versions.mjs';
import { parseAiContext, mergeAiContexts } from '../src/core/ai-context.mjs';
import { check } from '../src/core/records.mjs';
import { mapRecordEvidence } from '../src/core/action-events.mjs';
import { report, verifyReport } from '../src/report/delivery.mjs';
import { renderCases, verifyCaseDocuments } from '../src/report/case-reader.mjs';
import { parsePresentation, withPresentation } from '../src/report/presentation.mjs';
import { uiText, uiHtml, uiMarkup, formatUi } from '../src/report/ui-text.mjs';
import { modelDisplay, modelHeader } from '../src/report/model-display.mjs';
import { scopeLabel } from '../src/report/scope-label.mjs';
import { startReviewSession } from '../src/report/review-session.mjs';
import { makeReviewFeedback } from '../src/contracts/review-feedback.mjs';
import { SOURCE_ROOT, hash } from '../src/core/common.mjs';
import type { AiContext } from '../src/contracts/model.mjs';

const ai = (model = 'synthetic-model-a', reasoningEffort: string | null = 'max'): AiContext => ({ uses: [{ model, reasoningEffort, sourceKind: 'host_metadata', scope: 'Synthetic author metadata only; no real model execution.', source: { id: 'synthetic-model-source', locator: 'Synthetic host metadata fixture', file: null, sha256: null, excerpt: 'Synthetic fixture, not a real host receipt.', limitations: ['Engineering fixture only.'] } }] });
const presentation = async (language: string) => parsePresentation(await readJSON(path.join(SOURCE_ROOT, 'examples/presentation-' + language + '.json')));

test('model metadata remains sourced, partial and independent from business verdicts', async () => {
  assert.throws(() => parseAiContext({ uses: [{ ...ai().uses[0], sourceKind: 'unknown' }] }), /Unknown AI source/);
  assert.throws(() => parseAiContext({ uses: [] }), /explicit unknown/);
  const mixed = mergeAiContexts([ai(), ai('synthetic-model-a', 'high'), undefined]);
  const view = modelDisplay(mixed, 'test_execution');
  assert.equal(view.partial, true); assert.match(view.summary, /2/);
  assert.equal(mixed?.uses.length, 3);
  assert.equal(modelDisplay(ai(), 'case_generation').detail[0]?.sourceKind, '宿主元数据');
  assert.equal(modelDisplay(ai('synthetic-known-model',null),'test_execution').partial,false);
  assert.match(modelDisplay(ai('synthetic-known-model',null),'test_execution').summary,/未记录/);
  const malicious = ai('<script>model</script>');
  assert.ok(!modelHeader(malicious, 'test_execution').includes('<script>model'));
});

test('metadata affects transaction identity and survives shared worker evidence mapping', async t => {
  const f = await fixture(t), payload = { ...untested(), aiContext: ai() };
  assert.deepEqual(mapRecordEvidence(payload, id => id).aiContext, payload.aiContext);
  await record(f, payload);
  assert.equal((await record(f, payload)).replayed, true);
  await assert.rejects(record(f, { ...payload, aiContext: ai('synthetic-model-b') }), /different|conflict|idempot/i);
  const result = await check(f.runDir);
  assert.equal(result.aiContext?.uses[0]?.model, 'synthetic-model-a');
  assert.equal(result.counts.not_tested, 1);
});

test('unchanged case definitions preserve the original generator and goal-review fingerprint', async t => {
  const f = await fixture(t), original = await readCasesFile(f.casesFile);
  const input = { schemaVersion: 9, expectedVersion: 0, previousSha256: null, project: original.baseline.project, pointPrefix: 'LANG', reason: 'Synthetic generator metadata check', sources: [], coverage: [], retiredPoints: [], changes: [], aiContext: ai(), cases: original.baseline.cases.map(c => ({ ...c, goals: c.goals.map(g => ({ ...g, pointId: null })) })) };
  const saved = await saveCases({ workDir: path.join(f.root, 'generation'), request: input });
  const one = await readCasesFile(saved.file), c = one.baseline.cases[0]!, g = c.goals[0]!;
  const changedAuthor = { ...one.baseline, aiContext: ai('synthetic-model-b') };
  assert.equal(goalDefinitionHash(one.baseline, c, g), goalDefinitionHash(changedAuthor, c, g));
  const unchanged = await saveCases({ workDir: path.join(f.root, 'generation'), request: { ...input, expectedVersion: 1, previousSha256: one.ref.sha256, cases: one.baseline.cases, aiContext: ai('synthetic-model-b') } });
  assert.equal(unchanged.unchanged, true);
  assert.equal((await readCasesFile(saved.file)).baseline.aiContext?.uses[0]?.model, 'synthetic-model-a');
  const supplement=path.join(f.root,'additional-author.json');
  await writeJSON(supplement,{cases:one.ref,aiContext:ai('synthetic-model-b')});
  const documents=await renderCases({casesFile:one.file,outputDir:path.join(f.root,'supplemented-documents'),aiContextFile:supplement});
  const header=(await fs.readFile(documents.html,'utf8')).match(/<section class="model-info"[\s\S]*?<\/section>/)?.[0];
  assert.ok(header);assert.match(header,/synthetic-model-a/);assert.match(header,/synthetic-model-b/);
  assert.deepEqual((await readCasesFile(one.file)).ref,one.ref);
});

test('source fingerprint failures reject metadata before result commit or case supplement delivery', async t => {
  const f = await fixture(t), context = ai();
  context.uses[0]!.source.file = f.sourceFile;
  context.uses[0]!.source.sha256 = '0'.repeat(64);
  await assert.rejects(record(f, { ...untested(), aiContext: context }), /metadata source hash/);
  assert.equal((await check(f.runDir)).revision, 0);
  const cases = await readCasesFile(f.casesFile), supplement = path.join(f.root, 'model.json');
  await writeJSON(supplement, { cases: { ...cases.ref, sha256: '0'.repeat(64) }, aiContext: ai() });
  await assert.rejects(renderCases({ casesFile: cases.file, outputDir: path.join(f.root, 'bad'), aiContextFile: supplement }), /exact case version/);
});

test('language maps are complete, explicit and cannot translate interpolated source facts', async () => {
  const en = await presentation('en'), fr = await presentation('fr');
  assert.throws(() => parsePresentation({ language: 'en', messages: {} }), /Missing target-language/);
  assert.throws(() => parsePresentation({ language: 'fr', messages: { ...fr.messages, '关闭': '<script>bad</script>' } }), /plain-text/);
  assert.throws(() => parsePresentation({ language: 'zh-TW', messages: {} }), /Missing target-language/);
  assert.throws(() => parsePresentation({language:'en',messages:{...en.messages,'{scenes} 场景':'Scenarios'}}), /placeholders/);
  assert.equal(withPresentation(en,()=>formatUi('{scenes} 个场景 · {goals} 个业务目标',{scenes:1,goals:2})),'Scenarios: 1 · Business goals: 2');
  const actual = '已验证 — product original must remain unchanged';
  assert.equal(withPresentation(en, () => uiHtml`<p>已验证${actual}</p>`), '<p>Verified' + actual + '</p>');
  assert.deepEqual(await Promise.all([
    withPresentation(en, async () => { await delay(8); return uiText('证据'); }),
    withPresentation(fr, async () => { await delay(2); return uiText('证据'); })
  ]), ['Evidence', 'Preuve']);
  const quoted = { ...en, messages: { ...en.messages, '关闭': 'Close "quoted" & safe' } };
  assert.equal(withPresentation(quoted, () => uiMarkup('<button title="关闭">关闭</button>')), '<button title="Close &quot;quoted&quot; &amp; safe">Close &quot;quoted&quot; &amp; safe</button>');
});

test('scope labels depend on explicit comparison baselines, not selection alone', async () => {
  const en = await presentation('en');
  withPresentation(en, () => {
    assert.equal(scopeLabel({ selection: { request: { mode: 'full' } }, history: { primaryBaseline: null } }), 'Full-scope execution of the current case version');
    assert.equal(scopeLabel({ selection: { request: { mode: 'full' } }, history: { primaryBaseline: {} } }), 'Full regression (current case version)');
    assert.equal(scopeLabel({ selection: { request: { mode: 'points' } } }), 'Execution by ID');
    assert.equal(scopeLabel({ selection: { request: { mode: 'status' } } }), 'Select by historical status; rerun each matching scenario');
  });
});

test('two report stages retain their own producers and language across generation and readback', async t => {
  const f = await fixture(t), cases = await readCasesFile(f.casesFile), supplement = path.join(f.root, 'generation-model.json');
  const enFile = path.join(SOURCE_ROOT, 'examples/presentation-en.json'), frFile = path.join(SOURCE_ROOT, 'examples/presentation-fr.json');
  await writeJSON(supplement, { cases: cases.ref, aiContext: ai('synthetic-generator') });
  const docs = await renderCases({ casesFile: f.casesFile, outputDir: path.join(f.root, 'cases-en'), presentationFile: enFile, aiContextFile: supplement });
  const caseHtml = await fs.readFile(docs.html, 'utf8');
  assert.match(caseHtml, /lang="en"/); assert.match(caseHtml, /Case generation model/);
  assert.ok(caseHtml.includes('data-model-stage="case_generation"'));
  assert.ok(!caseHtml.includes('data-model-stage="test_execution"'));
  await verifyCaseDocuments({ casesFile: f.casesFile, outputDir: path.dirname(docs.html) });
  await record(f, { ...untested(), aiContext: ai('synthetic-executor') });
  const resultFile = path.join(f.runDir, 'results.json'), bytes = await fs.readFile(resultFile);
  const ctx = path.join(f.root, 'reader.json');
  await writeJSON(ctx, { schemaVersion: 9, kind: 'retrospective', summary: 'Synthèse de test synthétique', limitations: ['Aucune exécution réelle.'], supplementalCaseIds: [], sources: [{ label: 'Synthetic results', file: resultFile, sha256: hash(bytes) }], aiContext: ai('synthetic-reader') });
  const out = path.join(f.root, 'report-fr'); await fs.mkdir(out);
  const delivered = await report(f.runDir, { outputDir: out, contextFile: ctx, presentationFile: frFile });
  const output = JSON.parse(await fs.readFile(delivered.reportJson, 'utf8'));
  assert.equal(output.presentation.language, 'fr');
  assert.deepEqual(output.aiContext.uses.map((v: { model: string }) => v.model).sort(), ['synthetic-executor', 'synthetic-reader']);
  assert.deepEqual(output.counts, (await check(f.runDir)).counts);
  const html = await fs.readFile(delivered.reportHtml, 'utf8'), md = await fs.readFile(delivered.reportMarkdown, 'utf8');
  assert.match(html, /lang="fr"/); assert.match(html, /Modèle d&#39;exécution des tests/);
  assert.ok(html.includes('data-model-stage="test_execution"'));
  assert.ok(!html.includes('data-model-stage="case_generation"'));
  assert.match(md, /Modèle d'exécution des tests/);
  await verifyReport(f.runDir, out);
  assert.deepEqual(await fs.readFile(resultFile), bytes);
});

test('native review keeps its selected language through page delivery and saved feedback', async t => {
  const f=await fixture(t),saved=await readCasesFile(f.casesFile),pointIds=saved.baseline.cases.flatMap(c=>c.goals.map(g=>g.pointId));
  const session=await startReviewSession({casesFile:f.casesFile,outputDir:path.join(f.root,'native-fr'),presentationFile:path.join(SOURCE_ROOT,'examples/presentation-fr.json')});
  try{
    const page=await(await fetch(session.info.url)).text();
    assert.match(page,/lang="fr"/);assert.match(page,/Modèle de génération des cas/);
    const feedback=makeReviewFeedback({cases:saved.ref,pointIds},0,'comment_only',pointIds,[{pointId:pointIds[0]!,text:'Avis synthétique uniquement.'}]);
    const response=await fetch(new URL('save',session.info.url),{method:'POST',headers:{'content-type':'application/json',origin:new URL(session.info.url).origin},body:JSON.stringify(feedback)});
    assert.equal(response.status,200);
    const files=await fs.readdir(path.join(f.root,'native-fr')),htmlFile=files.find(n=>n.endsWith('.html'));
    assert.ok(htmlFile);const html=await fs.readFile(path.join(f.root,'native-fr',htmlFile),'utf8');
    assert.match(html,/lang="fr"/);assert.match(html,/Avis synthétique uniquement/);assert.match(html,/Avis de relecture/);
    assert.deepEqual((await readCasesFile(f.casesFile)).ref,saved.ref);
  }finally{await session.close();}
});
