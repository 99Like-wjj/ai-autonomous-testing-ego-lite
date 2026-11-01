/** Structural review prompts only. This never changes a business status or decides what to execute. */
import type { Report } from '../contracts/model.mjs';
export interface ReviewPrompt {caseId:string;goalId:string;code:'missing_reading'|'repeated_reading'|'phase_mismatch'|'missing_input_summary'|'missing_reply_summary';detail:string}
export function reviewPrompts(report:Report):ReviewPrompt[]{
  const prompts:ReviewPrompt[]=[];
  const phaseLabels={before:'操作前',during:'操作中',after:'操作后',static:'静态检查',unknown:'未确定'};
  for(const c of report.cases)for(const a of c.assessments){
    const push=(code:ReviewPrompt['code'],detail:string)=>prompts.push({caseId:c.id,goalId:a.goalId,code,detail});
    const reading=report.context?.readerNotes?.find(n=>n.caseId===c.id&&n.goalId===a.goalId),title=reading?.title??a.display?.title,actual=reading?.description??a.display?.actual;
    if(a.status!=='not_tested'&&(!title||!actual))push('missing_reading','原记录缺少独立的可读标题或实际现象；原判断摘要保留，不能从计划补造。');
    if(title&&actual&&title.trim()===actual.trim())push('repeated_reading','标题与实际现象完全相同；建议明确实际值、触发条件和影响。');
    for(const o of c.observations.filter(o=>a.observationIds.includes(o.id))){
      if(o.phase&&o.phase.expected!=='unknown'&&o.phase.observed!=='unknown'&&o.phase.expected!==o.phase.observed)push('phase_mismatch','声明的预期检查阶段与实际观察阶段不同：'+phaseLabels[o.phase.expected]+' / '+phaseLabels[o.phase.observed]+'。依据：'+o.phase.basis+'。此提示不自动改变原结论。');
      for(const action of o.actions??[]){
        const contextual=report.context?.conversations?.some(v=>v.caseId===c.id&&v.goalId===a.goalId&&v.actions.some(x=>x.observationId===o.id&&x.actionId===action.id));
        if(!action.conversations?.length&&!contextual)continue;
        const note=reading?.actions.find(x=>x.observationId===o.id&&x.actionId===action.id);
        if(!action.inputSummary&&!note?.inputSummary)push('missing_input_summary','对话步骤 '+action.id+' 未提供输入摘要；完整消息关联仍保留。');
        if(!action.replySummary&&!note?.replySummary)push('missing_reply_summary','对话步骤 '+action.id+' 未提供回复摘要或尚无最终回复的说明。');
      }
    }
  }
  return prompts;
}
