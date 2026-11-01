/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export interface RegressionSelectionRequestV2 {
  regressionVersion: 2;
  casesFile: string;
  cases: CasesReference;
  mode: 'points' | 'status' | 'full';
  pointIds: string[];
  sourceRun: {
    runDir: string;
    runId: string;
    baselineSha256: string;
    resultsRevision: number;
    resultsSha256: string;
  } | null;
  statuses: ('verified' | 'violation' | 'inconclusive' | 'not_tested')[];
  includeUnassessedCases: boolean;
}
export interface CasesReference {
  projectId: string;
  caseVersion: number;
  sha256: string;
}
