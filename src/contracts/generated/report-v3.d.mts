/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export type ReportCaseV3 = {
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  id: string;
  title: string;
  basis: Basis;
  criticalConditions: string[];
  expected: string;
  requiredPath: null | string;
  status: 'pass' | 'fail' | 'inconclusive' | 'blocked' | 'not_run';
  observed: string;
  rationale: string;
  remainingQuestions: string[];
  /**
   * Items: Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  evidenceIds: string[];
  cause: 'product_candidate' | 'agent' | 'environment' | 'spec' | 'unknown';
  attempts: AttemptV3[];
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  operationId?: string;
  revision?: number;
  recordedAt?: string;
  stepOrder: 'strict' | 'adaptive';
  /**
   * @minItems 1
   */
  steps: Step[];
  clarificationQuestions?: string[];
};
export type AttemptV3 = {
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  attemptId: string;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  operationId: string;
  revision: number;
  recordedAt: string;
  kind: 'attempt' | 'superseded_final';
  status: 'pass' | 'fail' | 'inconclusive' | 'blocked';
  observed: string;
  rationale: string;
  remainingQuestions: string[];
  /**
   * Items: Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  evidenceIds: string[];
  cause?: 'product_candidate' | 'agent' | 'environment' | 'spec' | 'unknown';
};

/**
 * The report summarizes current final statuses; historical attempts are preserved on each case and are not recounted as current outcomes.
 */
export interface EgoLiteGeneratedReportV3 {
  schemaVersion: 3;
  runId: string;
  project: string;
  structurallyValid: true;
  revision: number;
  evidenceRevision: number;
  /**
   * True only when at least one case has no final result and no recorded attempt. A not_run final status may coexist with attempts.
   */
  hasUnexecutedCases: boolean;
  counts: Counts;
  progress: Progress;
  recordedExplicitOutcomes: {
    pass: number;
    fail: number;
  };
  evidenceIntegrity: {
    hashVerifiedItems: number;
  };
  evidenceCoverage?: {
    registeredScreenshots: number;
    distinctRetainedContents: number;
    finalCasesWithoutScreenshots: string[];
  };
  context?: RetrospectiveReportContextV1NoBusinessExecution;
  caveat: string;
  evidenceCatalog: EgoLiteEvidenceCatalogV3;
  /**
   * @minItems 1
   */
  cases: ReportCaseV3[];
}
export interface Counts {
  pass: number;
  fail: number;
  inconclusive: number;
  blocked: number;
  not_run: number;
}
export interface Progress {
  completed: {
    count: number;
    /**
     * Items: Reserved property names such as __proto__, prototype, and constructor are forbidden.
     */
    caseIds: string[];
    statusCounts: {
      pass: number;
      fail: number;
    };
  };
  uncompleted: {
    count: number;
    /**
     * Items: Reserved property names such as __proto__, prototype, and constructor are forbidden.
     */
    caseIds: string[];
    statusCounts: {
      not_run: number;
      blocked: number;
      inconclusive: number;
    };
  };
  pendingClarification: {
    count: number;
    /**
     * Items: Reserved property names such as __proto__, prototype, and constructor are forbidden.
     */
    caseIds: string[];
  };
  attemptedCases: {
    count: number;
    totalAttempts: number;
  };
}
export interface RetrospectiveReportContextV1NoBusinessExecution {
  schemaVersion: 1;
  kind: 'retrospective';
  summary: string;
  /**
   * @minItems 1
   */
  limitations: string[];
  /**
   * @minItems 1
   */
  sources: {
    label: string;
    file: string;
    sha256: string;
  }[];
  supplementalCaseIds: string[];
  /**
   * @minItems 1
   */
  reviews: {
    caseId: string;
    status: 'verified' | 'violation' | 'inconclusive' | 'not_tested';
    rationale: string;
  }[];
}
/**
 * New entries bind a local file copy to its associated case, source metadata, collectedAt, optional source-provided capturedAt, byte count, and SHA-256 of the retained bytes. A matching hash is not proof of authenticity.
 */
export interface EgoLiteEvidenceCatalogV3 {
  schemaVersion: 3;
  revision: number;
  items: EvidenceItemV3[];
  operations: EvidenceOperationV3[];
}
export interface EvidenceItemV3 {
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  id: string;
  path: string;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  caseId: string;
  kind: 'screenshot' | 'dom' | 'tool_receipt' | 'log' | 'other';
  /**
   * Optional UTC capture time supplied by the source/operator. It is not inferred.
   */
  capturedAt?: string;
  collectedAt: string;
  source: string;
  description: string;
  sha256: string;
  bytes: number;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  operationId: string;
}
export interface EvidenceOperationV3 {
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  operationId: string;
  payloadSha256: string;
  revision: number;
  committedAt: string;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  caseId: string;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  evidenceId: string;
  path: string;
  sha256: string;
  bytes: number;
}
export interface Basis {
  kind: 'explicit' | 'interpretation' | 'hypothesis';
  source: string;
  text: string;
}
export interface Step {
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  id: string;
  /**
   * Business-intent guidance and necessary test data, not executable code or compulsory UI click details.
   */
  action: string;
  /**
   * Optional source-backed checkpoint. Omission means no checkpoint verdict is supplied.
   */
  expected?: string;
}
