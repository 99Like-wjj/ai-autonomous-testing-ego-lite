/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

/**
 * AI comparability is separate from deterministic differences and business outcome. Null status is absence of an assessment, never a fifth business verdict. Evidence retains its original run identity.
 */
export type ExplicitCrossRunRegressionComparisonV1 = Request | Comparison;

export interface Request {
  regressionVersion: 1;
  left: RunRef;
  right: RunRef;
  /**
   * @minItems 1
   */
  mappings: Mapping[];
  comparability: Comparability[];
}
export interface RunRef {
  runDir: string;
  runId: string;
  resultsRevision: number;
  resultsSha256: string;
  baselineSha256: string;
}
export interface Mapping {
  id: string;
  left: GoalRef | null;
  right: GoalRef | null;
  reason: string;
}
export interface GoalRef {
  caseId: string;
  goalId: string;
}
export interface Comparability {
  mappingId: string;
  state: 'comparable' | 'limited' | 'not_directly_comparable';
  rationale: string;
  /**
   * @minItems 1
   */
  sources: {
    side: 'left' | 'right';
    kind: 'result' | 'evidence' | 'binding';
    ref: string;
  }[];
}
export interface Comparison {
  regressionVersion: 1;
  left: {
    runDir: string;
    runId: string;
    resultsRevision: number;
    resultsSha256: string;
    baselineSha256: string;
  };
  right: {
    runDir: string;
    runId: string;
    resultsRevision: number;
    resultsSha256: string;
    baselineSha256: string;
  };
  rows: {
    mapping: Mapping;
    left: ComparedGoal | null;
    right: ComparedGoal | null;
    differences: Difference[];
    comparability: Comparability | null;
  }[];
  unmapped: {
    left: GoalRef[];
    right: GoalRef[];
  };
  caveat: string;
  contentSha256: string;
}
export interface ComparedGoal {
  caseId: string;
  goalId: string;
  status: ('verified' | 'violation' | 'inconclusive' | 'not_tested') | null;
  rationale: string | null;
  resultRevision: number | null;
  gaps: string[];
  evidence: {
    runId: string;
    evidenceId: string;
    sha256: string;
    kind: string;
    source: string;
    collectedAt: string;
  }[];
  evidenceLimitations: string[];
}
export interface Difference {
  aspect: 'rule' | 'task' | 'identity' | 'environment' | 'data' | 'authorization' | 'scope' | 'path';
  changed: boolean;
  left: string | null;
  right: string | null;
}
