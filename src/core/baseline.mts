/** Frozen business goals and necessary plan obligations. No execution is inferred from a plan. */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Baseline, Case, Goal, Manifest } from '../contracts/model.mjs';
import { assertClosed, fail, hash, nonempty, object, safeIdentifier } from './common.mjs';
import { arrayValue, oneOf, parseBasis, strings, textValue } from './validation.mjs';
import { regularFilePath } from './file-integrity.mjs';
import { requiredRefs } from '../contracts/targets.mjs';

export function newSafeCases(baseline: Baseline) {
  for (const c of baseline.cases) {
    safeIdentifier(c.id, 'case id');
    for (const step of c.steps) safeIdentifier(step.id, 'step id');
    for (const goal of c.goals) safeIdentifier(goal.id, 'goal id');
  }
}
export function normalizeCases(input: unknown): Baseline {
  if (!object(input) || Object.keys(input).some(k => !['schemaVersion', 'project', 'cases'].includes(k)) || input.schemaVersion !== 5 || !nonempty(input.project) || !Array.isArray(input.cases) || !input.cases.length) fail('Cases require schemaVersion 5, project, and a nonempty cases array. Older files are not migrated.');
  const ids = new Set<string>();
  const cases: Case[] = arrayValue(input.cases, 'cases').map(c => {
    assertClosed(c, ['id', 'title', 'criticalConditions', 'requiredPath', 'stepOrder', 'steps', 'goals'], 'case');
    const id = safeIdentifier(c.id, 'case id'), title = textValue(c.title, 'title');
    if (ids.has(id)) fail('Duplicate case id: ' + id); ids.add(id);
    const rawSteps = arrayValue(c.steps, 'steps');
    if (!rawSteps.length) fail('A nonempty steps array is required: ' + id);
    const stepIds = new Set<string>();
    const steps = rawSteps.map(step => {
      assertClosed(step, ['id', 'action'], 'step');
      const stepId = safeIdentifier(step.id, 'step id');
      if (stepIds.has(stepId)) fail('Duplicate step id: ' + id + '/' + stepId); stepIds.add(stepId);
      return { id: stepId, action: textValue(step.action, 'step action') };
    });
    const plan = { id, title, criticalConditions: strings(c.criticalConditions, 'criticalConditions'),
      requiredPath: c.requiredPath === null ? null : textValue(c.requiredPath, 'requiredPath'),
      stepOrder: oneOf(c.stepOrder, ['strict', 'adaptive'], 'stepOrder'), steps };
    const refs = requiredRefs(plan), usedRefs = new Set<string>(), goalIds = new Set<string>();
    const goals: Goal[] = arrayValue(c.goals, 'goals').map(g => {
      assertClosed(g, ['id', 'basis', 'expected', 'requiredRefs', 'clarificationQuestions', 'followUpOf'], 'goal');
      const goalId = safeIdentifier(g.id, 'goal id');
      if (goalIds.has(goalId)) fail('Duplicate goal id: ' + id + '/' + goalId); goalIds.add(goalId);
      const required = strings(g.requiredRefs, 'requiredRefs');
      if (new Set(required).size !== required.length) fail('Duplicate goal required reference: ' + goalId);
      for (const ref of required) { if (!refs.includes(ref)) fail('Unknown plan reference: ' + ref); usedRefs.add(ref); }
      let followUpOf: Goal['followUpOf'];
      if (Object.hasOwn(g, 'followUpOf')) {
        assertClosed(g.followUpOf, ['runId', 'caseId', 'goalId', 'reason'], 'follow-up source');
        followUpOf = { runId: textValue(g.followUpOf.runId, 'follow-up run ID'), caseId: safeIdentifier(g.followUpOf.caseId), goalId: safeIdentifier(g.followUpOf.goalId), reason: textValue(g.followUpOf.reason, 'follow-up reason') };
      }
      return { id: goalId, basis: parseBasis(g.basis), expected: textValue(g.expected, 'expected'), requiredRefs: required,
        ...(Object.hasOwn(g, 'clarificationQuestions') ? { clarificationQuestions: strings(g.clarificationQuestions, 'clarificationQuestions') } : {}),
        ...(followUpOf ? { followUpOf } : {}) };
    });
    if (!goals.length) fail('A nonempty goals array is required: ' + id);
    if (refs.some(ref => !usedRefs.has(ref))) fail('Necessary plan reference is not linked to any goal: ' + refs.filter(ref => !usedRefs.has(ref)).join(', '));
    return { ...plan, goals };
  });
  return { schemaVersion: 5, project: input.project, cases };
}
export async function readAndValidateBaseline(root: string, manifest: Manifest) {
  const bytes = await fs.readFile(await regularFilePath(path.join(root, 'baseline.json')));
  if (hash(bytes) !== manifest.baselineSha256) fail('Baseline hash mismatch. This integrity check is not tamper-proof.');
  return { baseline: normalizeCases(JSON.parse(bytes.toString('utf8'))), bytes };
}
