/** Projection of explicit AI assessments; absence never becomes a verified goal. */
import type { CheckedCase, GoalView, Report } from '../contracts/model.mjs';
import { requiredTargets, targetText } from '../contracts/targets.mjs';
export function caseGoals(report: Report, c: CheckedCase): GoalView[] {
  const imports = report.execution?.imports.filter(imp => imp.phase === 'complete' && imp.originalPacket.caseId === c.id) ?? [];
  const current = imports.find(imp => imp.resultReceipt?.operationId === c.operationId) ?? (c.status === 'not_run' ? imports.at(-1) : undefined);
  const goals = current ? current.review.goalAssessments ?? current.originalPacket.goalAssessments : [];
  const started = c.status !== 'not_run' || c.attempts.length > 0 || report.execution?.assignments.some(a => a.caseId === c.id);
  return requiredTargets(c).map(target => {
    const item = goals.find(goal => goal.targets.includes(target));
    if (!item || !current) return { target, text: targetText(c, target), status: started ? 'inconclusive' : 'not_tested', observed: '', rationale: started ? '已有执行／结果记录，但没有与该目标关联的完整并行评估交付；不能从摘要推断通过。' : '尚无该目标的执行与评估记录。', evidenceIds: [], source: 'No committed goal assessment' };
    const evidenceIds = item.evidenceKeys.flatMap(key => { const receipt = current.evidenceJobs.find(job => job.key === key)?.receipt; return receipt ? [receipt.evidenceId] : []; });
    return { target, text: targetText(c, target), status: item.status, observed: item.observed, rationale: item.rationale, evidenceIds, source: 'AI review of packet ' + current.packetId + (current.resultReceipt?.mode === 'attempt' ? ' (attempt; no final inferred)' : '') };
  });
}
export function goalViews(report: Report): Record<string, GoalView[]> { return Object.fromEntries(report.cases.map(c => [c.id, caseGoals(report, c)])); }
