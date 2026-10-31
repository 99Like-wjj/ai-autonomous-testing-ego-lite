import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { start } from '../src/core/cases.mjs';
import { canonicalHash, hash, json } from '../src/core/common.mjs';
import type { ContextFact, RunContext } from '../src/contracts/model.mjs';
import type { RegressionBinding } from '../src/regression/binding.mjs';
import { compareRuns, parseComparisonRequest, writeComparison } from '../src/regression/compare.mjs';
import type { ComparisonRequest } from '../src/regression/compare.mjs';
import { readSourceRun } from '../src/regression/sources.mjs';
import { selectRegression } from '../src/regression/selection.mjs';
import { commitArtifact } from '../src/regression/store.mjs';
import { addEvidence, observed, record, writeJSON } from './goals-fixture.mjs';
import { at } from './support.mjs';
import { bindingRequest, fullSelectionRequest, regressionFixture, taskDraft } from './regression-fixture.mjs';

test('comparison uses explicit mappings and exact prefixes, preserves four states, and does not infer causation', async t => {
  const f = await regressionFixture(t), ev = await addEvidence(f);
  await record(f, observed(ev.evidenceId));
  const nextRun = path.join(f.root, 'next-run'); await start({ projectDir: f.projectDir, casesFile: f.casesFile, outputDir: nextRun });
  const newer = { ...f, runDir: nextRun }, nextEv = await addEvidence(newer);
  await record(newer, observed(nextEv.evidenceId, 'violation'));
  const left = await readSourceRun(f.runDir), right = await readSourceRun(nextRun);
  const request: ComparisonRequest = { regressionVersion: 1,
    left: { runDir: f.runDir, runId: left.manifest.runId, baselineSha256: left.baselineSha256, resultsRevision: 1, resultsSha256: left.resultsSha256 },
    right: { runDir: nextRun, runId: right.manifest.runId, baselineSha256: right.baselineSha256, resultsRevision: 1, resultsSha256: right.resultsSha256 },
    mappings: [{ id: 'saved-value', left: { caseId: 'one', goalId: 'saved' }, right: { caseId: 'one', goalId: 'saved' }, reason: 'Explicitly map the same original business goal.' }], comparability: [] };
  const comparison = await compareRuns({ request }), row = at(comparison.rows);
  assert.equal(row.left?.status, 'verified'); assert.equal(row.right?.status, 'violation'); assert.equal(row.comparability, null);
  assert.equal(comparison.unmapped.left.length, 3); assert.equal(comparison.unmapped.right.length, 3);
  assert.equal(row.left?.evidence[0]?.sha256, row.right?.evidence[0]?.sha256); assert.notEqual(row.left?.evidence[0]?.runId, row.right?.evidence[0]?.runId);
  assert.ok(row.differences.find(d => d.aspect === 'environment')?.left?.includes('unknown'));
  assert.match(comparison.caveat, /not automatic regression attribution/);
  const missing = await compareRuns({ request: { ...request, mappings: [{ id: 'capacity', left: { caseId: 'one', goalId: 'capacity' }, right: { caseId: 'one', goalId: 'capacity' }, reason: 'No formal assessment exists yet.' }] } });
  assert.equal(at(missing.rows).left?.status, null); assert.equal(at(missing.rows).right?.status, null);
  const frozenHash = comparison.contentSha256;
  await record(newer, observed(nextEv.evidenceId), { operationId: 'later-final', expectedRevision: 1 });
  assert.equal((await compareRuns({ request })).contentSha256, frozenHash);
  await assert.rejects(compareRuns({ request: { ...request, right: { ...request.right, resultsSha256: '0'.repeat(64) } } }), /prefix hash mismatch/);
  await assert.rejects(compareRuns({ request: { ...request, left: { ...request.left, baselineSha256: '0'.repeat(64) } } }), /baseline.*hash mismatch/);
  await assert.rejects(compareRuns({ request: { ...request, mappings: [{ ...at(request.mappings), right: { caseId: 'missing', goalId: 'saved' } }] } }), /unknown goal/);
  assert.throws(() => parseComparisonRequest({ ...request, mappings: [] }), /nonempty/);
  assert.throws(() => parseComparisonRequest({ ...request, left: request.right }), /independent runs/);
});

test('rule and task version changes are displayed without overruling AI comparability; HTML is inert and sources untouched', async t => {
  const f = await regressionFixture(t), leftSelection = await selectRegression({ projectDir: f.projectDir, request: f.selectionRequest });
  const leftBindingFile = path.join(f.projectDir, 'left-binding.json'); await writeJSON(leftBindingFile, bindingRequest(leftSelection));
  const leftDir = path.join(f.root, 'bound-left'); await start({ projectDir: f.projectDir, casesFile: f.casesFile, outputDir: leftDir, bindingFile: leftBindingFile });
  const ruleDraft = { ...f.rule, supersedes: f.ruleRef, reason: 'Source version clarified without changing the normative goal.', source: { ...f.rule.source, version: '2' } };
  const ruleReceipt = await commitArtifact({ projectDir: f.projectDir, request: { regressionVersion: 1, operationId: 'rule-second', expectedRevision: 1, artifact: ruleDraft } });
  const nextRuleRef = { ruleId: f.rule.ruleId, revision: 2, contentSha256: ruleReceipt.contentSha256 }, taskRefs = [];
  for (const [index, c] of f.baseline.cases.entries()) {
    const task = { ...taskDraft(c, nextRuleRef), supersedes: at(f.taskRefs, index), reason: 'Bind clarified source version; business obligations remain unchanged.' };
    const receipt = await commitArtifact({ projectDir: f.projectDir, request: { regressionVersion: 1, operationId: 'task-new-' + c.id, expectedRevision: 1, artifact: task } });
    taskRefs.push({ taskId: task.taskId, revision: receipt.revision, contentSha256: receipt.contentSha256 });
  }
  const rightSelection = await selectRegression({ projectDir: f.projectDir, request: fullSelectionRequest(f.baseline, taskRefs) });
  const rightBindingFile = path.join(f.projectDir, 'right-binding.json'), rightBinding = bindingRequest(rightSelection);
  rightBinding.conditions.items.push({ id: 'identity-condition', caseIds: ['one'], aspect: 'identity', state: 'pending', statement: 'Role and tenant still require current observation.', source: { kind: 'ai_declaration', locator: 'Current AI condition review', file: null, sha256: null } });
  await writeJSON(rightBindingFile, rightBinding);
  const rightDir = path.join(f.root, 'bound-right'); await start({ projectDir: f.projectDir, casesFile: f.casesFile, outputDir: rightDir, bindingFile: rightBindingFile });
  const left = await readSourceRun(leftDir), right = await readSourceRun(rightDir), goal = { caseId: 'one', goalId: 'saved' };
  const request: ComparisonRequest = { regressionVersion: 1,
    left: { runDir: leftDir, runId: left.manifest.runId, baselineSha256: left.baselineSha256, resultsRevision: 0, resultsSha256: left.resultsSha256 },
    right: { runDir: rightDir, runId: right.manifest.runId, baselineSha256: right.baselineSha256, resultsRevision: 0, resultsSha256: right.resultsSha256 },
    mappings: [{ id: 'mapped-goal', left: goal, right: goal, reason: '<img src="https://example.invalid/beacon" onerror="alert(1)"> explicit mapping' }],
    comparability: [{ mappingId: 'mapped-goal', state: 'limited', rationale: 'Source revision changed but normative text is equivalent; current identity remains unverified.', sources: [{ side: 'left', kind: 'result', ref: 'one/saved' }, { side: 'right', kind: 'result', ref: 'one/saved' }] }] };
  const comparison = await compareRuns({ request }), row = at(comparison.rows);
  assert.equal(row.comparability?.state, 'limited'); assert.equal(row.differences.find(d => d.aspect === 'rule')?.changed, true); assert.equal(row.differences.find(d => d.aspect === 'task')?.changed, true); assert.equal(row.differences.find(d => d.aspect === 'identity')?.changed, true);
  const filenames = ['manifest.json', 'baseline.json', 'results.json', 'evidence.json', 'regression-binding.json'];
  const before = await Promise.all([leftDir, rightDir].flatMap(dir => filenames.map(async name => hash(await fs.readFile(path.join(dir, name))))));
  const outputDir = path.join(f.root, 'new-comparison'), saved = await writeComparison({ outputDir, comparison });
  const html = await fs.readFile(saved.html, 'utf8'), markdown = await fs.readFile(saved.markdown, 'utf8');
  assert.ok(html.includes('Content-Security-Policy')); assert.ok(html.includes('&lt;img')); assert.ok(!html.includes('<img')); assert.ok(!html.includes('<script')); assert.ok(markdown.includes('&lt;img'));
  assert.deepEqual(await Promise.all([leftDir, rightDir].flatMap(dir => filenames.map(async name => hash(await fs.readFile(path.join(dir, name)))))), before);
  await assert.rejects(writeComparison({ outputDir, comparison }), /EEXIST/);
  await assert.rejects(writeComparison({ outputDir: path.join(leftDir, 'comparison'), comparison }), /outside both source/);
  await assert.rejects(compareRuns({ request: { ...request, comparability: [{ ...at(request.comparability), sources: [{ side: 'right', kind: 'evidence', ref: 'not-collected' }] }] } }), /must be linked/);
});

test('action-referenced contexts retain identity and environment differences without an observation contextId', async t => {
  const f = await regressionFixture(t), nextRun = path.join(f.root, 'context-next');
  await start({ projectDir: f.projectDir, casesFile: f.casesFile, outputDir: nextRun });
  for (const [runDir, role, environment] of [[f.runDir, 'Synthetic reviewer in tenant A', 'Synthetic deployment A'], [nextRun, 'Synthetic owner in tenant B', 'Synthetic deployment B']] as const) {
    const current = { ...f, runDir }, ev = await addEvidence(current);
    const fact = (summary: string): ContextFact => ({ state: 'known', summary, sources: [{ kind: 'evidence', reference: 'Synthetic independently recorded context', evidenceIds: [ev.evidenceId] }] });
    const context: RunContext = { id: 'action-context', identity: fact(role), environment: fact(environment), objects: fact('Synthetic object'), initialState: fact('Synthetic initial state'), authorization: fact('Synthetic-only authorization') };
    // The context precedes the action and observation in the append-only ledger.
    await record(current, { observations: [], assessments: [], contexts: [context] }, { mode: 'attempt' });
    const payload = observed(ev.evidenceId);
    at(payload.observations).actionEventIds = ['readback-event'];
    payload.actionEvents = [{ id: 'readback-event', actionId: 'readback-action', kind: 'result', purpose: 'test', contextId: context.id, actor: 'synthetic-reviewer', summary: 'Read-only synthetic readback result', sideEffectRisk: 'none', resultState: 'known', evidenceIds: [ev.evidenceId] }];
    await record(current, payload, { operationId: 'observed-after-context', expectedRevision: 1 });
  }
  const left = await readSourceRun(f.runDir), right = await readSourceRun(nextRun);
  const comparison = await compareRuns({ request: { regressionVersion: 1,
    left: { runDir: f.runDir, runId: left.manifest.runId, baselineSha256: left.baselineSha256, resultsRevision: left.results.revision, resultsSha256: left.resultsSha256 },
    right: { runDir: nextRun, runId: right.manifest.runId, baselineSha256: right.baselineSha256, resultsRevision: right.results.revision, resultsSha256: right.resultsSha256 },
    mappings: [{ id: 'readback-contexts', left: { caseId: 'one', goalId: 'saved' }, right: { caseId: 'one', goalId: 'saved' }, reason: 'Compare conditions reached through the observed action.' }], comparability: [] } });
  const row = at(comparison.rows), identity = row.differences.find(d => d.aspect === 'identity')!, environment = row.differences.find(d => d.aspect === 'environment')!;
  assert.equal(identity.changed, true); assert.equal(environment.changed, true);
  assert.match(identity.left!, /reviewer in tenant A/); assert.match(identity.right!, /owner in tenant B/);
  assert.match(environment.left!, /deployment A/); assert.match(environment.right!, /deployment B/);
  assert.equal(JSON.parse(identity.left!).availability, 'recorded'); assert.equal(JSON.parse(identity.right!).recordedContexts.length, 1);
});

test('comparison parses the same binding bytes it hashed even if the file changes immediately after that read', async t => {
  const f = await regressionFixture(t), selection = await selectRegression({ projectDir: f.projectDir, request: f.selectionRequest });
  const request = bindingRequest(selection);
  request.conditions.items.push({ id: 'identity', caseIds: ['one'], aspect: 'identity', state: 'verified', statement: 'Original verified synthetic identity', source: { kind: 'ai_declaration', locator: 'Synthetic current identity review', file: null, sha256: null } });
  const bindingFile = path.join(f.projectDir, 'race-binding-request.json'); await writeJSON(bindingFile, request);
  const leftDir = path.join(f.root, 'race-left'), rightDir = path.join(f.root, 'race-right');
  await start({ projectDir: f.projectDir, casesFile: f.casesFile, outputDir: leftDir, bindingFile });
  await start({ projectDir: f.projectDir, casesFile: f.casesFile, outputDir: rightDir, bindingFile });
  const left = await readSourceRun(leftDir), right = await readSourceRun(rightDir), target = path.join(leftDir, 'regression-binding.json');
  const changed: RegressionBinding = JSON.parse(await fs.readFile(target, 'utf8'));
  changed.conditions.items.find(item => item.id === 'identity')!.statement = 'Substituted after hash read';
  const { contentSha256: _oldHash, ...body } = changed; changed.contentSha256 = canonicalHash(body);
  const readFile = fs.readFile; let reads = 0;
  const mocked = t.mock.method(fs, 'readFile', (async (...args: Parameters<typeof fs.readFile>) => {
    const bytes = await readFile(...args);
    if (String(args[0]) === target && ++reads === 2) await fs.writeFile(target, json(changed));
    return bytes;
  }) as typeof fs.readFile);
  try {
    const comparison = await compareRuns({ request: { regressionVersion: 1,
      left: { runDir: leftDir, runId: left.manifest.runId, baselineSha256: left.baselineSha256, resultsRevision: 0, resultsSha256: left.resultsSha256 },
      right: { runDir: rightDir, runId: right.manifest.runId, baselineSha256: right.baselineSha256, resultsRevision: 0, resultsSha256: right.resultsSha256 },
      mappings: [{ id: 'binding-race', left: { caseId: 'one', goalId: 'saved' }, right: { caseId: 'one', goalId: 'saved' }, reason: 'Validate the frozen binding under a controlled file replacement.' }], comparability: [] } });
    const identity = at(comparison.rows).differences.find(d => d.aspect === 'identity')!;
    assert.equal(reads, 2); assert.match(identity.left!, /Original verified synthetic identity/); assert.doesNotMatch(identity.left!, /Substituted after hash read/); assert.equal(identity.changed, false);
  } finally { mocked.mock.restore(); }
  assert.match(await fs.readFile(target, 'utf8'), /Substituted after hash read/);
});

test('comparability accepts goal-linked action and context evidence but rejects another goal evidence in the same case', async t => {
  const f = await regressionFixture(t), rightDir = path.join(f.root, 'evidence-closure-right');
  await start({ projectDir: f.projectDir, casesFile: f.casesFile, outputDir: rightDir });
  const imageFile = path.join(f.root, 'synthetic-pixel.png');
  await fs.writeFile(imageFile, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=', 'base64'));
  const evidenceBySide: { screenshot: string; action: string; unrelated: string }[] = [];
  for (const [index, runDir] of [f.runDir, rightDir].entries()) {
    const current = { ...f, runDir }, base = await addEvidence(current);
    const screenshot = await addEvidence(current, { operationId: 'context-image', expectedRevision: 1, sourceFile: imageFile, kind: 'screenshot', source: 'Synthetic image fixture; not a live browser capture' });
    const action = await addEvidence(current, { operationId: 'action-log', expectedRevision: 2 });
    const unrelated = await addEvidence(current, { operationId: 'unrelated-image', expectedRevision: 3, sourceFile: imageFile, kind: 'screenshot', source: 'Synthetic image for another goal in the same case' });
    evidenceBySide.push({ screenshot: screenshot.evidenceId, action: action.evidenceId, unrelated: unrelated.evidenceId });
    const unknown: ContextFact = { state: 'unknown', summary: 'No condition is inferred by this synthetic fixture.', sources: [] };
    const context: RunContext = { id: 'identity-context', identity: { state: 'known', summary: 'Synthetic identity fact', sources: [{ kind: 'evidence', reference: 'Identity screenshot retained only in context', evidenceIds: [screenshot.evidenceId] }] }, environment: unknown, objects: unknown, initialState: unknown, authorization: unknown };
    const payload = observed(base.evidenceId); payload.contexts = [context];
    if (index === 0) {
      at(payload.observations).actionEventIds = ['linked-action-event'];
      payload.actionEvents = [{ id: 'linked-action-event', actionId: 'linked-action', kind: 'result', purpose: 'test', contextId: context.id, actor: 'synthetic-reviewer', summary: 'Synthetic action with separately retained evidence', sideEffectRisk: 'none', resultState: 'known', evidenceIds: [base.evidenceId, action.evidenceId] }];
    } else at(payload.observations).contextId = context.id;
    payload.observations.push({ id: 'other-goal-readback', summary: 'Separate capacity result, unrelated to saved-value comparability.', coveredRefs: ['condition:0', 'step:capacity'], evidenceIds: [unrelated.evidenceId] });
    payload.assessments.push({ goalId: 'capacity', status: 'verified', rationale: 'Separate synthetic goal assessment.', observationIds: ['other-goal-readback'], gaps: [] });
    await record(current, payload);
  }
  const left = await readSourceRun(f.runDir), right = await readSourceRun(rightDir), leftEvidence = at(evidenceBySide), rightEvidence = at(evidenceBySide, 1);
  assert.ok(left.checked.evidenceCatalog.items.some(e => e.id === leftEvidence.unrelated));
  const request: ComparisonRequest = { regressionVersion: 1,
    left: { runDir: f.runDir, runId: left.manifest.runId, baselineSha256: left.baselineSha256, resultsRevision: left.results.revision, resultsSha256: left.resultsSha256 },
    right: { runDir: rightDir, runId: right.manifest.runId, baselineSha256: right.baselineSha256, resultsRevision: right.results.revision, resultsSha256: right.resultsSha256 },
    mappings: [{ id: 'saved-conditions', left: { caseId: 'one', goalId: 'saved' }, right: { caseId: 'one', goalId: 'saved' }, reason: 'Explicitly compare the saved-value goal and its identity context.' }],
    comparability: [{ mappingId: 'saved-conditions', state: 'limited', rationale: 'Identity is retained in the mapped goal context; other conditions remain unknown.', sources: [{ side: 'left', kind: 'evidence', ref: leftEvidence.screenshot }, { side: 'right', kind: 'evidence', ref: rightEvidence.screenshot }, { side: 'left', kind: 'evidence', ref: leftEvidence.action }] }] };
  const result = await compareRuns({ request }), row = at(result.rows);
  assert.equal(row.comparability?.state, 'limited'); assert.equal(row.left?.evidence.length, 3); assert.equal(row.right?.evidence.length, 2);
  assert.ok(row.left?.evidence.some(e => e.evidenceId === leftEvidence.screenshot && e.runId === left.manifest.runId));
  assert.ok(row.right?.evidence.some(e => e.evidenceId === rightEvidence.screenshot && e.runId === right.manifest.runId));
  assert.ok(!row.left?.evidenceLimitations.some(gap => gap.includes('No retained screenshot')));
  assert.ok(!row.right?.evidenceLimitations.some(gap => gap.includes('No retained screenshot')));
  assert.ok(!row.left?.evidence.some(e => e.evidenceId === leftEvidence.unrelated));
  await assert.rejects(compareRuns({ request: { ...request, comparability: [{ ...at(request.comparability), sources: [{ side: 'left', kind: 'evidence', ref: leftEvidence.unrelated }] }] } }), /must be linked to the mapped goal/);
});

test('readable comparisons show changes to valid comparability sources even when outcomes and rationale stay the same', async t => {
  const f = await regressionFixture(t), rightDir = path.join(f.root, 'source-declaration-right');
  await start({ projectDir: f.projectDir, casesFile: f.casesFile, outputDir: rightDir });
  const rightFixture = { ...f, runDir: rightDir }, leftEvidence = await addEvidence(f), rightEvidence = await addEvidence(rightFixture);
  await record(f, observed(leftEvidence.evidenceId)); await record(rightFixture, observed(rightEvidence.evidenceId));
  const left = await readSourceRun(f.runDir), right = await readSourceRun(rightDir);
  const request: ComparisonRequest = { regressionVersion: 1,
    left: { runDir: f.runDir, runId: left.manifest.runId, baselineSha256: left.baselineSha256, resultsRevision: 1, resultsSha256: left.resultsSha256 },
    right: { runDir: rightDir, runId: right.manifest.runId, baselineSha256: right.baselineSha256, resultsRevision: 1, resultsSha256: right.resultsSha256 },
    mappings: [{ id: 'source-change', left: { caseId: 'one', goalId: 'saved' }, right: { caseId: 'one', goalId: 'saved' }, reason: 'Same mapped business goal.' }],
    comparability: [{ mappingId: 'source-change', state: 'limited', rationale: 'Same assessment of the available synthetic readback.', sources: [{ side: 'left', kind: 'evidence', ref: leftEvidence.evidenceId }] }] };
  const first = await compareRuns({ request }), second = await compareRuns({ request: { ...request,
    comparability: [{ ...at(request.comparability), sources: [{ side: 'right', kind: 'evidence', ref: rightEvidence.evidenceId }] }] } });
  const firstRow = at(first.rows), secondRow = at(second.rows);
  assert.deepEqual(firstRow.left, secondRow.left); assert.deepEqual(firstRow.right, secondRow.right); assert.deepEqual(firstRow.differences, secondRow.differences);
  assert.equal(firstRow.comparability?.rationale, secondRow.comparability?.rationale);
  const firstFiles = await writeComparison({ outputDir: path.join(f.root, 'source-declaration-a'), comparison: first });
  const secondFiles = await writeComparison({ outputDir: path.join(f.root, 'source-declaration-b'), comparison: second });
  const markdownA = await fs.readFile(firstFiles.markdown, 'utf8'), markdownB = await fs.readFile(secondFiles.markdown, 'utf8');
  const htmlA = await fs.readFile(firstFiles.html, 'utf8'), htmlB = await fs.readFile(secondFiles.html, 'utf8');
  assert.notEqual(markdownA, markdownB); assert.notEqual(htmlA, htmlB);
  const mdSources = (document: string) => document.split('### AI 可比性依据\n')[1]!.split('\n### ')[0]!;
  const htmlSources = (document: string) => document.split('<table class="comparability-sources">')[1]!.split('</table>')[0]!;
  assert.ok(mdSources(markdownA).includes('基准运行：' + left.manifest.runId.replaceAll('-', '\\-')));
  assert.ok(mdSources(markdownA).includes(leftEvidence.evidenceId.replaceAll('-', '\\-')));
  assert.ok(!mdSources(markdownA).includes(rightEvidence.evidenceId.replaceAll('-', '\\-')));
  assert.ok(mdSources(markdownB).includes('本次运行：' + right.manifest.runId.replaceAll('-', '\\-')));
  assert.ok(mdSources(markdownB).includes(rightEvidence.evidenceId.replaceAll('-', '\\-')));
  assert.ok(!mdSources(markdownB).includes(leftEvidence.evidenceId.replaceAll('-', '\\-')));
  assert.ok(htmlSources(htmlA).includes(leftEvidence.evidenceId)); assert.ok(!htmlSources(htmlA).includes(rightEvidence.evidenceId));
  assert.ok(htmlSources(htmlB).includes(rightEvidence.evidenceId)); assert.ok(!htmlSources(htmlB).includes(leftEvidence.evidenceId));
  assert.ok(htmlSources(htmlB).includes('本次运行：' + right.manifest.runId)); assert.ok(htmlSources(htmlB).includes('证据 (evidence)'));
  const undeclared = await compareRuns({ request: { ...request, comparability: [] } });
  const undeclaredFiles = await writeComparison({ outputDir: path.join(f.root, 'source-declaration-none'), comparison: undeclared });
  assert.ok(mdSources(await fs.readFile(undeclaredFiles.markdown, 'utf8')).includes('尚未提供'));
  assert.ok((await fs.readFile(undeclaredFiles.html, 'utf8')).includes('<h3>AI 可比性依据</h3><p>尚未提供</p>'));
});
