/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

/**
 * No status is inferred from missing assessments. Runtime validation re-reads exact source revisions, verifies hashes and recomputes the selection; full scope includes uncompiled coverage gaps.
 */
export type ExplicitWholeCaseRegressionSelectionV1 = Request | Selection;

export interface Request {
  regressionVersion: 1;
  mode: 'status' | 'full';
  scope: Scope;
  source: Source | null;
  statuses: ('verified' | 'violation' | 'inconclusive' | 'not_tested')[];
  includeUnassessedCases: boolean;
}
export interface Scope {
  scopeId: string;
  version: string;
  baseline: EgoLiteCaseInputAndNormalizedBaselineV8;
  taskBindings: {
    caseId: string;
    taskRef: TaskRef | null;
  }[];
  gaps: {
    caseId: string;
    goalId: string | null;
    reason: string;
  }[];
}
export interface EgoLiteCaseInputAndNormalizedBaselineV8 {
  schemaVersion: 8;
  project: string;
  /**
   * @minItems 1
   */
  cases: Case[];
}
export interface Case {
  id: string;
  title: string;
  criticalConditions: string[];
  requiredPath: string | null;
  stepOrder: 'strict' | 'adaptive';
  /**
   * @minItems 1
   */
  steps: Step[];
  /**
   * @minItems 1
   */
  goals: Goal[];
}
export interface Step {
  id: string;
  action: string;
}
export interface Goal {
  id: string;
  basis: Basis;
  expected: string;
  requiredRefs: string[];
  clarificationQuestions?: string[];
  followUpOf?: {
    /**
     * Use self for a goal in the same frozen run; otherwise use the explicit source run ID. A relation never resolves or replaces the source verdict.
     */
    runId: string;
    caseId: string;
    goalId: string;
    reason: string;
  };
  title: string;
}
export interface Basis {
  kind: 'explicit' | 'interpretation' | 'hypothesis';
  source: string;
  text: string;
}
export interface TaskRef {
  taskId: string;
  revision: number;
  contentSha256: string;
}
export interface Source {
  runDir: string;
  runId: string;
  resultsRevision: number;
  resultsSha256: string;
  goalMappings: {
    caseId: string;
    goalId: string;
    sourceCaseId: string;
    sourceGoalId: string;
  }[];
  baselineSha256: string;
}
export interface Selection {
  regressionVersion: 1;
  request: Request;
  scopeSha256: string;
  matchPolicy: 'any_goal';
  sourceStates: {
    caseId: string;
    goalId: string;
    status: ('verified' | 'violation' | 'inconclusive' | 'not_tested') | null;
    sourceMapped: boolean;
  }[];
  assetGaps: Gap[];
  selectedCaseIds: string[];
  matchedGoalRefs: GoalRef[];
  plannedGoalRefs: GoalRef[];
  caseMatches: {
    caseId: string;
    matchedGoalRefs: GoalRef[];
    unassessedGoalRefs: GoalRef[];
    reason: 'full_scope' | 'status_match' | 'explicit_unassessed';
  }[];
  notSelected: {
    caseId: string;
    goalRefs: GoalRef[];
    reason: string;
  }[];
  gaps: Gap[];
  selectionSha256: string;
}
export interface Gap {
  caseId: string;
  goalId: string | null;
  code: string;
  reason: string;
}
export interface GoalRef {
  caseId: string;
  goalId: string;
}
