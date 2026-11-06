import { uiText as u } from './ui-text.mjs';
/** Structural review prompts only. This never changes a business status or decides what to execute. */
import type { Report } from '../contracts/model.mjs';
import { reviewHints } from '../core/review-hints.mjs';
export interface ReviewPrompt {caseId:string;goalId:string;code:'missing_reading'|'repeated_reading'|'phase_mismatch'|'missing_input_summary'|'missing_reply_summary';detail:string}
export function reviewPrompts(report:Report):ReviewPrompt[]{
  const phaseLabels={before:u('操作前'),during:u('操作中'),after:u('操作后'),static:u('静态检查'),unknown:u('未确定')};
  return reviewHints(report).map(h=>{
    let detail:string;
    if(h.code==='missing_reading')detail=u('原记录缺少独立的可读标题或实际现象；原判断摘要保留，不能从计划补造。');
    else if(h.code==='repeated_reading')detail=u('标题与实际现象完全相同；建议明确实际值、触发条件和影响。');
    else if(h.code==='phase_mismatch'){
      const phase=report.cases.find(c=>c.id===h.caseId)!.observations.find(o=>o.id===h.observationId)!.phase!;
      detail=u('声明的预期检查阶段与实际观察阶段不同：')+phaseLabels[phase.expected]+' / '+phaseLabels[phase.observed]+u('。依据：')+phase.basis+u('。此提示不自动改变原结论。');
    }else detail=u('对话步骤 ')+h.actionId+(h.code==='missing_input_summary'?u(' 未提供输入摘要；完整消息关联仍保留。'):u(' 未提供回复摘要或尚无最终回复的说明。'));
    return{caseId:h.caseId,goalId:h.goalId,code:h.code,detail};
  });
}
