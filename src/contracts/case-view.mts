/** Presentation resolves authored references; it never infers a business path. */
import type { Case, Goal } from './model.mjs';
import { goalRequiredRefs, targetText } from './targets.mjs';
export function conditionLabel(id: string, index: number): string {
  if (id === 'identity') return '身份与权限';
  if (id === 'scope') return '测试数据与操作范围';
  if (id === 'empty') return '数据初态';
  return '前提条件 ' + (index + 1);
}
export function goalPlan(c: Case, g: Goal) {
  const refs = goalRequiredRefs(c, g), authored = new Set(g.requiredRefs);
  return {
    conditions: c.criticalConditions.flatMap((item, index) => refs.includes('condition:' + item.id) ? [{ ref: 'condition:' + item.id, label: conditionLabel(item.id, index), text: item.text }] : []),
    steps: c.steps.flatMap((step, index) => refs.includes('step:' + step.id) ? [{ ref: 'step:' + step.id, number: index + 1, text: step.action, required: authored.has('step:' + step.id), dependsOn: step.dependsOn.map(id => c.steps.findIndex(s => s.id === id) + 1) }] : []),
    path: refs.includes('requiredPath') ? c.requiredPath : null,
    refs,
  };
}
export function referenceLabel(c: Case, ref: string): string {
  if (ref === 'requiredPath') return '必须经过的业务路径';
  if (ref.startsWith('step:')) return '步骤 ' + (c.steps.findIndex(s => 'step:' + s.id === ref) + 1);
  const index = c.criticalConditions.findIndex(x => 'condition:' + x.id === ref);
  return index >= 0 ? conditionLabel(c.criticalConditions[index]!.id, index) : targetText(c, ref);
}
