/** Commit receipt and bounded, revision-pinned structural feedback. Never retries business actions. */
import { withRunLock, json, fail } from './common.mjs';
import { projectCases, recordResultUnlocked } from './records.mjs';
import { reviewHints } from './review-hints.mjs';
import type { ReviewHint } from './review-hints.mjs';
import type { ResultReceipt, TestHooks } from '../contracts/model.mjs';
export interface RecordFeedback {
  status:'available'|'unavailable'|'disabled';asOfResultsRevision:number;
  scope:'commit_prefix_without_retrospective_notes';affectedPointIds:string[];
  caseUnassessedCount:number|null;hints:ReviewHint[];total:number|null;truncated:boolean;
  reasonCode?:'FEEDBACK_UNAVAILABLE';
}
export interface RecordResponse {recordResponseVersion:1;committed:true;receipt:ResultReceipt;feedback:RecordFeedback}
export async function recordWithFeedback({runDir,request,feedback='summary'}:{runDir:unknown;request:unknown;feedback?:string|undefined},hooks:TestHooks={},hints=reviewHints):Promise<RecordResponse>{
  if(!['summary','none'].includes(feedback))fail('Unknown record feedback mode.');
  return withRunLock(runDir,async root=>{
    let detail:RecordFeedback|undefined;
    const receipt=await recordResultUnlocked(root,request,hooks,(receipt,checked,results)=>{
      const base:RecordFeedback={status:feedback==='none'?'disabled':'unavailable',asOfResultsRevision:receipt.revision,scope:'commit_prefix_without_retrospective_notes',affectedPointIds:[],caseUnassessedCount:null,hints:[],total:null,truncated:false};
      detail=base;
      if(feedback==='none')return;
      try{
        const entries=results.entries.slice(0,receipt.revision),entry=entries[receipt.revision-1]!;
        const cases=projectCases({cases:checked.cases},entries),c=cases.find(c=>c.id===receipt.caseId)!;
        const goals=new Set(entry.record.assessments.map(a=>a.goalId));
        const affectedPointIds=c.goals.filter(g=>goals.has(g.id)).map(g=>g.pointId);
        const all=hints({cases:[{...c,assessments:c.assessments.filter(a=>goals.has(a.goalId))}]});
        detail={...base,status:'available',affectedPointIds,caseUnassessedCount:c.missingGoalIds.length,hints:all.slice(0,20),total:all.length,truncated:all.length>20};
        while(Buffer.byteLength(json(detail))>8192&&detail.hints.length){detail.hints.pop();detail.truncated=true;}
        // Large affected-ID sets are not silently truncated into an apparently complete receipt.
        if(Buffer.byteLength(json(detail))>8192)detail={...base,reasonCode:'FEEDBACK_UNAVAILABLE'};
      }catch{detail={...base,reasonCode:'FEEDBACK_UNAVAILABLE'};}
    });
    return{recordResponseVersion:1,committed:true,receipt,feedback:detail!};
  });
}
