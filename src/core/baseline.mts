/** Shared case parsing and frozen-baseline validation; no run initialization or result transactions. */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Baseline, Case, Manifest } from '../contracts/model.mjs';
import { assertClosed, fail, hash, nonempty, object, safeIdentifier } from './common.mjs';
import { arrayValue, oneOf, parseBasis, strings, textValue } from './validation.mjs';
import { regularFilePath } from './file-integrity.mjs';

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
export async function readAndValidateBaseline(root: string, manifest: Manifest) {
  const baselinePath = path.join(root, 'baseline.json');
  const bytes = await fs.readFile(await regularFilePath(baselinePath));
  if (hash(bytes) !== manifest.baselineSha256) fail('Baseline hash mismatch. This integrity check is not tamper-proof.');
  return { baseline: normalizeCases(JSON.parse(bytes.toString('utf8'))), bytes };
}
