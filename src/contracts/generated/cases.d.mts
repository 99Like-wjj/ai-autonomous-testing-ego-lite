/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export interface EgoLiteCaseInputAndNormalizedBaselineV6 {
  schemaVersion: 6;
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
