import type { Baseline, Manifest, Results, Report } from '../contracts/model.mjs';
export interface RunRef { runDir:string;runId:string;baselineSha256:string;resultsRevision:number;resultsSha256:string }
export interface SourceRun { runDir:string;manifest:Manifest;baseline:Baseline;results:Results;checked:Report;baselineSha256:string;resultsSha256:string;evidenceScope:{kind:'complete_current_catalog'|'results_prefix_references';catalogRevision:number;note:string} }
export interface HistoryBinding { parents:RunRef[];primaryBaseline:RunRef|null;reason:string }
