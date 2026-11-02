/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export type SourceReference = {
  id: string;
  locator: string;
  file: string | null;
  sha256: string | null;
  excerpt: string;
  limitations: string[];
};

export interface EgoLiteCaseInputAndNormalizedBaselineV9 {
  schemaVersion: 9;
  project: string;
  cases: Case[];
  projectId: string;
  pointPrefix: string;
  caseVersion: number;
  previous: {
    caseVersion: number;
    sha256: string;
  } | null;
  nextPointNumber: number;
  retiredPoints: {
    pointId: string;
    reason: string;
    replacements: string[];
  }[];
  sources: SourceReference[];
  coverage: {
    id: string;
    sourceRefId: string;
    statement: string;
    state: 'mapped' | 'pending' | 'out_of_scope' | 'retired';
    pointIds: string[];
    reason: string;
  }[];
  changes: {
    pointId: string;
    kind: 'added' | 'modified' | 'moved' | 'split' | 'merged' | 'retired';
    relatedPointIds: string[];
    reason: string;
  }[];
  writeRequestSha256: string;
  savedAt: string;
  aiContext?: AiContext;
}
export interface Case {
  id: string;
  title: string;
  criticalConditions: CriticalCondition[];
  requiredPath: string | null;
  stepOrder: 'strict' | 'adaptive';
  steps: Step[];
  /**
   * @minItems 1
   */
  goals: Goal[];
  parameters: ParameterDefinition[];
}
export interface CriticalCondition {
  id: string;
  text: string;
}
export interface Step {
  id: string;
  action: string;
  dependsOn: string[];
}
export interface Goal {
  id: string;
  basis: Basis;
  expected: string;
  requiredRefs: string[];
  clarificationQuestions: string[];
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
  pointId: string;
  planState: 'prepared' | 'unprepared';
  preparationGaps: string[];
  sourceAlias: string | null;
}
export interface Basis {
  kind: 'explicit' | 'interpretation' | 'hypothesis';
  source: string;
  text: string;
  sourceRefIds: string[];
}
export interface ParameterDefinition {
  id: string;
  type: 'string' | 'integer' | 'decimal' | 'date' | 'object_ref' | 'account_ref';
  purpose: string;
  constraints: string[];
}
export interface AiContext {
  /**
   * @minItems 1
   */
  uses: {
    model: string | null;
    reasoningEffort: string | null;
    sourceKind: 'host_metadata' | 'user_statement' | 'unknown';
    source: SourceReference;
    scope: string;
  }[];
}
