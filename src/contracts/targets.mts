import type { Case, Goal } from './model.mjs';
/** Plan obligations are not business goals and never increase business result counts. */
export function requiredRefs(c: Pick<Case, 'steps' | 'criticalConditions' | 'requiredPath'>): string[] {
  return [...c.steps.map(step => 'step:' + step.id), ...c.criticalConditions.map(condition => 'condition:' + condition.id), ...(c.requiredPath === null ? [] : ['requiredPath'])];
}
/** Traverse only explicitly authored dependencies; no business route is inferred. */
export function goalRequiredRefs(c: Case, goal: Goal): string[] {
  const refs = new Set(goal.requiredRefs);
  const visit = (id: string) => { const step = c.steps.find(s => s.id === id); for (const dependency of step?.dependsOn ?? []) if (!refs.has('step:' + dependency)) { refs.add('step:' + dependency); visit(dependency); } };
  for (const ref of [...refs]) if (ref.startsWith('step:')) visit(ref.slice(5));
  if (c.requiredPath !== null) refs.add('requiredPath');
  return requiredRefs(c).filter(ref => refs.has(ref));
}
export function targetText(c: Case, ref: string): string {
  if (ref === 'requiredPath') return c.requiredPath ?? '(not specified)';
  if (ref.startsWith('step:')) { const step = c.steps.find(step => step.id === ref.slice(5)); return step?.action ?? ref; }
  if (ref.startsWith('condition:')) return c.criticalConditions.find(condition => condition.id === ref.slice(10))?.text ?? ref;
  return c.goals.find(goal => goal.id === ref)?.expected ?? ref;
}
