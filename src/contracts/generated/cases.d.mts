/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export interface EgoLiteCaseInputAndNormalizedBaselineV5 {
  schemaVersion: 5;
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
    runId: string;
    caseId: string;
    goalId: string;
    reason: string;
  };
}
export interface Basis {
  kind: 'explicit' | 'interpretation' | 'hypothesis';
  source: string;
  text: string;
}
