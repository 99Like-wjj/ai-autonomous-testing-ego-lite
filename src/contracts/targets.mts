import type { Case } from './model.mjs';
export function requiredTargets(c: Case): string[] { return ['expected', ...c.steps.map(step => 'step:' + step.id), ...c.criticalConditions.map((_, i) => 'condition:' + i), ...(c.requiredPath === null ? [] : ['requiredPath'])]; }
export function targetText(c: Case, target: string): string {
  if (target === 'expected') return c.expected;
  if (target === 'requiredPath') return c.requiredPath ?? '(not specified)';
  if (target.startsWith('step:')) { const step = c.steps.find(step => step.id === target.slice(5)); return step ? step.action + (step.expected ? ' / ' + step.expected : '') : target; }
  if (target.startsWith('condition:')) return c.criticalConditions[Number(target.slice(10))] ?? target;
  return target;
}
