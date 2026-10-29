/** Views project committed assessments only; execution ledgers never supply business results. */
import type { CheckedCase, Observation, Report } from '../contracts/model.mjs';
export const labels = { verified: '已验证', violation: '发现违反', inconclusive: '无法判断', not_tested: '未测试', unassessed: '未登记目标评估' } as const;
export function observationEvidenceIds(item: Observation): string[] {
  return [...new Set([...item.evidenceIds, ...(item.actions ?? []).flatMap(action => action.evidenceIds), ...(item.evidenceLinks ?? []).map(link => link.evidenceId)])];
}
export function caseGoals(_report: Report, c: CheckedCase) {
  return c.goals.map(goal => {
    const assessment = c.assessments.find(item => item.goalId === goal.id);
    const observations = assessment ? c.observations.filter(item => assessment.observationIds.includes(item.id)) : [];
    const contexts = c.contexts.filter(context => observations.some(item => item.contextId === context.id));
    return { goal, assessment, observations, contexts, status: assessment?.status ?? 'unassessed' as const,
      evidenceIds: [...new Set([...observations.flatMap(observationEvidenceIds), ...(assessment?.diagnosis?.evidenceIds ?? []),
        ...(assessment?.phenomena ?? []).flatMap(item => item.evidenceIds),
        ...contexts.flatMap(context => [context.environment, context.actor, context.object, context.initialState, context.authorization].flatMap(fact => fact.sourceEvidenceIds))])] };
  });
}
export function goalDistribution(report: Report, c: CheckedCase): string {
  const counts = { verified: 0, violation: 0, inconclusive: 0, not_tested: 0, unassessed: 0 };
  for (const item of caseGoals(report, c)) counts[item.status]++;
  return Object.entries(counts).filter(([, count]) => count > 0).map(([status, count]) => labels[status as keyof typeof labels] + ' ' + count).join('，');
}
