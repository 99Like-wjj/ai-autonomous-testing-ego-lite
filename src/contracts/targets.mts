import type { Case } from './model.mjs';
/** Plan obligations are not business goals and never increase business result counts. */
export function requiredRefs(c: Pick<Case, 'steps' | 'criticalConditions' | 'requiredPath'>): string[] {
  return [...c.steps.map(step => 'step:' + step.id), ...c.criticalConditions.map((_, i) => 'condition:' + i), ...(c.requiredPath === null ? [] : ['requiredPath'])];
}
export function targetText(c: Case, ref: string): string {
  if (ref === 'requiredPath') return c.requiredPath ?? '(not specified)';
  if (ref.startsWith('step:')) { const step = c.steps.find(step => step.id === ref.slice(5)); return step?.action ?? ref; }
  if (ref.startsWith('condition:')) return c.criticalConditions[Number(ref.slice(10))] ?? ref;
  return c.goals.find(goal => goal.id === ref)?.expected ?? ref;
}
