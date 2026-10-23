import type { Baseline, Case } from '../contracts/model.mjs';
import { arrayValue, oneOf, parseBasis, strings, textValue } from './validation.mjs';
import { errorInfo } from './common.mjs';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SOURCE_ROOT, statuses, causes, evidenceKinds, reservedIds, idPattern, fail, hash, json, inside, object, nonempty, timestampPattern, now, randomId, assertClosed, safeIdentifier, validTimestamp, assertTimestamp, canonical, canonicalHash, canonicalRecord, sameRecord, safePath, directory, readJSON, syncDirectory, writeNew, removeOwnedFileIfPresent, removeRegularIfPresent, atomicReplace, acquireLock, withRunLock } from './common.mjs';
export function newSafeCases(baseline: Baseline) {
  for (const c of baseline.cases) {
    safeIdentifier(c.id, 'case id');
    for (const step of c.steps) safeIdentifier(step.id, 'step id');
  }
}
export function normalizeCases(input: unknown): Baseline {
  if (!object(input) || Object.keys(input).some(k => !['schemaVersion', 'project', 'cases'].includes(k)) || input.schemaVersion !== 3 || !nonempty(input.project) || !Array.isArray(input.cases) || !input.cases.length) fail('Cases require schemaVersion 3, project, and a nonempty cases array.');
  const ids = new Set<string>();
  const cases: Case[] = arrayValue(input.cases, 'cases').map(c => {
    assertClosed(c, ['id', 'title', 'basis', 'criticalConditions', 'expected', 'requiredPath', 'stepOrder', 'steps', 'clarificationQuestions'], 'case');
    const id = safeIdentifier(c.id, 'case id'), title = textValue(c.title, 'title'), expected = textValue(c.expected, 'expected');
    if (ids.has(id)) fail('Duplicate case id: ' + id); ids.add(id);
    const rawSteps = arrayValue(c.steps, 'steps');
    if (!rawSteps.length) fail('A nonempty steps array is required: ' + id);
    const stepIds = new Set<string>();
    const steps = rawSteps.map(step => {
      assertClosed(step, ['id', 'action', 'expected'], 'step');
      const stepId = safeIdentifier(step.id, 'step id');
      if (stepIds.has(stepId)) fail('Duplicate step id: ' + id + '/' + stepId); stepIds.add(stepId);
      return { id: stepId, action: textValue(step.action, 'step action'), ...(Object.hasOwn(step, 'expected') ? { expected: textValue(step.expected, 'step expected') } : {}) };
    });
    return { id, title, basis: parseBasis(c.basis), criticalConditions: strings(c.criticalConditions, 'criticalConditions'), expected,
      requiredPath: c.requiredPath === null ? null : textValue(c.requiredPath, 'requiredPath'), stepOrder: oneOf(c.stepOrder, ['strict', 'adaptive'], 'stepOrder'), steps,
      ...(Object.hasOwn(c, 'clarificationQuestions') ? { clarificationQuestions: strings(c.clarificationQuestions, 'clarificationQuestions') } : {}) };
  });
  return { schemaVersion: 3, project: input.project, cases };
}
export async function validateCases(casesFile: unknown) {
  const baseline = normalizeCases(await readJSON(await safePath(casesFile, { existing: true })));
  newSafeCases(baseline);
  return { schemaVersion: 3, structurallyValid: true, project: baseline.project, caseCount: baseline.cases.length, stepCount: baseline.cases.reduce((sum, c) => sum + c.steps.length, 0), stepOrderCounts: { strict: baseline.cases.filter(c => c.stepOrder === 'strict').length, adaptive: baseline.cases.filter(c => c.stepOrder === 'adaptive').length } };
}
export async function init(projectDir: unknown) {
  const target = await safePath(projectDir, { external: true });
  await fs.mkdir(target, { mode: 0o700 });
  try {
    await writeNew(path.join(target, 'cases.example.json'), json({ schemaVersion: 3, project: 'Synthetic example', cases: [{ id: 'example-1', title: 'Create a synthetic configuration (replace before use)', basis: { kind: 'hypothesis', source: 'Example only, not an acceptance requirement', text: 'Synthetic requirement only: a configuration created with an approved name and value can be retrieved with those values. Replace with an actual source-backed requirement before use.' }, criticalConditions: [], expected: 'The configuration can be retrieved with name synthetic-example and value example-value.', requiredPath: null, stepOrder: 'strict', steps: [{ id: 'step-1', action: 'In the approved test environment, find the configuration center’s example configuration feature.' }, { id: 'step-2', action: 'Create an example configuration named synthetic-example with value example-value, using the user-approved test data.' }] }] }));
  } catch (caughterror) { const error = errorInfo(caughterror); try { await fs.rmdir(target); } catch {} throw error; }
  return { projectDir: target };
}
export async function start({ projectDir, casesFile, outputDir }: { projectDir: unknown; casesFile: unknown; outputDir: unknown }) {
  const project = await directory(projectDir);
  const target = await safePath(outputDir, { external: true });
  const baseline = normalizeCases(await readJSON(await safePath(casesFile, { existing: true })));
  newSafeCases(baseline);
  const bytes = json(baseline);
  await fs.mkdir(target, { mode: 0o700 });
  const createdFiles = [];
  let evidenceDirectoryCreated = false;
  try {
    const baselinePath = path.join(target, 'baseline.json');
    await writeNew(baselinePath, bytes); createdFiles.push(baselinePath);
    const manifestPath = path.join(target, 'manifest.json');
    await writeNew(manifestPath, json({ schemaVersion: 3, baselineSchemaVersion: 3, runId: crypto.randomUUID(), projectDir: project, baselineSha256: hash(bytes) })); createdFiles.push(manifestPath);
    const resultsPath = path.join(target, 'results.json');
    await writeNew(resultsPath, json({ schemaVersion: 3, revision: 0, cases: baseline.cases.map(c => ({ id: c.id, basis: c.basis, status: 'not_run', observed: '', rationale: '', remainingQuestions: [], evidenceIds: [], cause: 'unknown', attempts: [] })), operations: [] })); createdFiles.push(resultsPath);
    const evidencePath = path.join(target, 'evidence.json');
    await writeNew(evidencePath, json({ schemaVersion: 3, revision: 0, items: [], operations: [] })); createdFiles.push(evidencePath);
    await fs.mkdir(path.join(target, 'evidence'), { mode: 0o700 });
    evidenceDirectoryCreated = true;
  } catch (caughterror) { const error = errorInfo(caughterror);
    for (const filename of createdFiles.reverse()) { try { await removeRegularIfPresent(filename); } catch {} }
    if (evidenceDirectoryCreated) { try { await fs.rmdir(path.join(target, 'evidence')); } catch {} }
    try { await fs.rmdir(target); } catch {}
    throw error;
  }
  return { runDir: target, cases: baseline.cases.length, runSchemaVersion: 3, baselineSchemaVersion: 3 };
}
