import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { main, check, recordResult, report, verifyReport } from '../src/scripts/ego.mjs';
import { htmlReportPayload } from '../src/report/render.mjs';
import { TOOL_ROOT } from '../src/scripts/toolchain.mjs';
import { hash } from '../src/core/common.mjs';
import { regressionFixture, bindingRequest } from './regression-fixture.mjs';
import { parseSelection } from '../src/regression/selection.mjs';
import { FakeElement, objectValue } from './support.mjs';
import type { ContextFact } from '../src/contracts/model.mjs';

test('CLI selection, bound new run, unknown intent and all report formats preserve scope and old files', async t => {
  const f = await regressionFixture(t);
  const original = await fs.readFile(path.join(f.runDir, 'results.json'));
  const selectRequest = path.join(f.root, 'selection-request.json'), selectionFile = path.join(f.root, 'selection.json');
  await fs.writeFile(selectRequest, JSON.stringify(f.selectionRequest));
  const selected = objectValue(await main(['regression', 'select', '--project-dir', f.projectDir, '--request', selectRequest, '--output-file', selectionFile]));
  assert.equal(selected.businessExecuted, false);
  const selection = parseSelection(JSON.parse(await fs.readFile(selectionFile, 'utf8')));
  assert.deepEqual(selection.selectedCaseIds, ['one', 'two']);
  const requestFile = path.join(f.root, 'binding-request.json'), nextRun = path.join(f.root, 'next-run');
  await fs.writeFile(requestFile, JSON.stringify(bindingRequest(selection)));
  await main(['start', '--project-dir', f.projectDir, '--cases', f.casesFile, '--output-dir', nextRun, '--binding', requestFile]);
  assert.notEqual((await check(nextRun)).runId, (await check(f.runDir)).runId);
  const fact: ContextFact = { state: 'known', summary: 'Synthetic current-run condition', sources: [{ kind: 'user_confirmation', reference: 'Synthetic fixture authorization only', evidenceIds: [] }] };
  await recordResult({ runDir: nextRun, request: { schemaVersion: 8, operationId: 'intent', expectedRevision: 0, caseId: 'one', mode: 'attempt', record: {
    observations: [], assessments: [], contexts: [{ id: 'current-context', environment: fact, identity: fact, objects: fact, initialState: fact, authorization: fact }],
    actionEvents: [{ id: 'intent-event', actionId: 'create-attempt', kind: 'intent', purpose: 'test', contextId: 'current-context', actor: 'Synthetic AI', summary: 'Create was intended; no dispatch receipt exists.', sideEffectRisk: 'possible', evidenceIds: [], target: '<script>untrusted-object</script>', inputs: ['Synthetic value'], sideEffects: ['May create one synthetic object'], planRef: 'step:create' }]
  } } });
  const progress = objectValue(await main(['progress', '--run-dir', nextRun]));
  assert.ok(JSON.stringify(progress).includes('create-attempt'));
  const current = await check(nextRun);
  assert.equal(current.counts.verified, 0);
  assert.equal(current.counts.unassessed, 4);
  assert.equal(current.actionAttempts?.[0]?.unresolved, true);
  assert.equal(current.actionAttempts?.[0]?.issuedEventIds.length, 0);
  const delivery = path.join(f.root, 'delivery'); await fs.mkdir(delivery);
  await report(nextRun, { outputDir: delivery });
  assert.equal((await verifyReport(nextRun, delivery)).filesVerified, true);
  const md = await fs.readFile(path.join(delivery, 'report.md'), 'utf8'), html = await fs.readFile(path.join(delivery, 'report.html'), 'utf8');
  assert.match(md, /全量选择不等于全量执行完成/); assert.match(md, /尚待核对的动作/);
  assert.ok(!html.includes('<script>untrusted-object</script>'));
  const payload = await htmlReportPayload(nextRun, current);
  assert.deepEqual(payload.report.regressionBinding, current.regressionBinding);
  assert.equal(payload.report.actionAttempts?.[0]?.unresolved, true);
  assert.ok(Object.hasOwn(payload, 'assets')); // Rich report assets and regression facts coexist.
  const browser = await fs.readFile(path.join(TOOL_ROOT, 'report-ui/main.js'), 'utf8');
  const sandbox=vm.createContext({}); vm.runInContext(browser,sandbox);
  const reader=vm.runInContext('reportViewModel',sandbox) as {historical:(c:typeof current.cases[number],e:typeof current.evidenceCatalog.items)=>string[]};
  assert.deepEqual(Array.from(reader.historical(current.cases[0]!,current.evidenceCatalog.items)),[]);
  assert.deepEqual(await fs.readFile(path.join(f.runDir, 'results.json')), original);
  // The embedded binding is independent of the mutable project library, but cannot be rewritten unnoticed.
  const bindingPath = path.join(nextRun, 'regression-binding.json'), bytes = await fs.readFile(bindingPath);
  await fs.writeFile(bindingPath, Buffer.concat([bytes, Buffer.from(' ')]));
  await assert.rejects(check(nextRun), /binding file hash mismatch/);
});

test('CLI context keeps every source goal and commit validation is read-only', async t => {
  const f = await regressionFixture(t);
  const contextFile = path.join(f.root, 'context.json');
  await main(['regression', 'context', '--project-dir', f.projectDir, '--run-dir', f.runDir, '--results-revision', '0', '--output-file', contextFile]);
  const context = JSON.parse(await fs.readFile(contextFile, 'utf8')) as { facts: { assessment: unknown; gap: string | null }[]; sourceAvailability: unknown[] };
  assert.equal(context.facts.length, 4); assert.ok(context.facts.every(f => f.assessment === null && f.gap !== null));
  assert.ok(context.sourceAvailability.length > 0);
  const norm = path.join(f.projectDir, 'new-rule.txt'); await fs.writeFile(norm, 'A new explicitly retained rule.');
  const request = { regressionVersion: 1, operationId: 'validate-only', expectedRevision: 0, artifact: { ...f.rule, ruleId: 'validate-only', statement: 'A new explicitly retained rule.', source: { ...f.rule.source, contentFile: norm, excerpt: 'A new explicitly retained rule.', contentSha256: hash(await fs.readFile(norm)) } } };
  const requestFile = path.join(f.root, 'validate-request.json'); await fs.writeFile(requestFile, JSON.stringify(request));
  const before = objectValue(await main(['regression', 'read', '--project-dir', f.projectDir]));
  const validated = objectValue(await main(['regression', 'validate', '--project-dir', f.projectDir, '--request', requestFile]));
  assert.equal(validated.referencesChecked, true);
  const after = objectValue(await main(['regression', 'read', '--project-dir', f.projectDir]));
  assert.deepEqual(after, before);
});
