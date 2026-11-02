/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export type SourceReference = {
  id: string;
  locator: string;
  file: string | null;
  sha256: string | null;
  excerpt: string;
  limitations: string[];
};

export interface CaseReviewV9 {
  schemaVersion: 9;
  cases: CasesReference;
  reviewNumber: number;
  decision: 'comment_only' | 'changes_requested' | 'approved';
  pointIds: string[];
  comments: {
    pointId: string | null;
    text: string;
  }[];
  source: SourceReference;
  sourceKind: 'user_statement' | 'delegated_review' | 'feedback_file';
  delegationSource: SourceReference | null;
  reviewedTargets: {
    pointId: string;
    definitionSha256: string | null;
  }[];
  recordedAt: string;
  writeRequestSha256: string;
}
export interface CasesReference {
  projectId: string;
  caseVersion: number;
  sha256: string;
}
