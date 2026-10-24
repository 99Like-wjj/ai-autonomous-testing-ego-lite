/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

/**
 * Canonical v3 case input and normalized baseline for external and Skill-authored cases. Unknown fields are rejected. Runtime additionally enforces safe, unique case and step IDs.
 */
export interface EgoLiteCaseInputAndNormalizedBaselineV3 {
  schemaVersion: 3;
  project: string;
  /**
   * @minItems 1
   */
  cases: Case[];
}
export interface Case {
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  id: string;
  title: string;
  basis: Basis;
  criticalConditions: string[];
  /**
   * Required overall observable expectation; the helper validates structure, not source truth.
   */
  expected: string;
  requiredPath: null | string;
  /**
   * strict preserves business-step sequence; adaptive may adjust route/order only within intent and prerequisites.
   */
  stepOrder: 'strict' | 'adaptive';
  /**
   * @minItems 1
   */
  steps: Step[];
  /**
   * When nonempty, both the final result and every attempt are prohibited from using pass or fail.
   */
  clarificationQuestions?: string[];
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
