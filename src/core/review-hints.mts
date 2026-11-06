/** Pure structural hints. No business verdicts, repairs, language or I/O. */
import type { Report } from '../contracts/model.mjs';
export type HintCode = 'missing_reading'|'repeated_reading'|'phase_mismatch'|'missing_input_summary'|'missing_reply_summary';
export interface ReviewHint {
  caseId:string;goalId:string;pointId:string;code:HintCode;
  observationId:string|null;actionId:string|null;
}
export function reviewHints(report:Pick<Report,'cases'|'context'>):ReviewHint[]{
  const hints:ReviewHint[]=[];
  for(const c of report.cases)for(const a of c.assessments){
    const push=(code:HintCode,observationId:string|null=null,actionId:string|null=null)=>hints.push({caseId:c.id,goalId:a.goalId,pointId:c.goals.find(g=>g.id===a.goalId)!.pointId,code,observationId,actionId});
    const reading=report.context?.readerNotes?.find(n=>n.caseId===c.id&&n.goalId===a.goalId),title=reading?.title??a.display?.title,actual=reading?.description??a.display?.actual;
    if(a.status!=='not_tested'&&(!title||!actual))push('missing_reading');
    if(title&&actual&&title.trim()===actual.trim())push('repeated_reading');
    for(const o of c.observations.filter(o=>a.observationIds.includes(o.id))){
      if(o.phase&&o.phase.expected!=='unknown'&&o.phase.observed!=='unknown'&&o.phase.expected!==o.phase.observed)push('phase_mismatch',o.id);
      for(const action of o.actions??[]){
        const contextual=report.context?.conversations?.some(v=>v.caseId===c.id&&v.goalId===a.goalId&&v.actions.some(x=>x.observationId===o.id&&x.actionId===action.id));
        if(!action.conversations?.length&&!contextual)continue;
        const note=reading?.actions.find(x=>x.observationId===o.id&&x.actionId===action.id);
        if(!action.inputSummary&&!note?.inputSummary)push('missing_input_summary',o.id,action.id);
        if(!action.replySummary&&!note?.replySummary)push('missing_reply_summary',o.id,action.id);
      }
    }
  }
  return hints;
}
