/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export interface PointComparisonRequestV2 {
  regressionVersion: 2;
  left: {
    runDir: string;
    runId: string;
    baselineSha256: string;
    resultsRevision: number;
    resultsSha256: string;
  };
  right: {
    runDir: string;
    runId: string;
    baselineSha256: string;
    resultsRevision: number;
    resultsSha256: string;
  };
  pointIds?: string[];
  comparability?: {
    pointId: string;
    state: 'comparable' | 'limited' | 'not_directly_comparable';
    rationale: string;
    sources: {
      side: 'left' | 'right';
      kind: 'result' | 'evidence' | 'binding';
      ref: string;
    }[];
  }[];
}
