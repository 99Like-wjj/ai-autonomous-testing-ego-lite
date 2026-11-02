/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export type SourceReference = {
  id: string;
  locator: string;
  file: string | null;
  sha256: string | null;
  excerpt: string;
  limitations: string[];
};

export interface WholeCaseFileSaveRequestV9 {
  schemaVersion: 9;
  expectedVersion: number;
  previousSha256: string | null;
  project: string;
  pointPrefix: string;
  cases: DraftCase[];
  sources?: SourceReference[];
  coverage?: {
    id: string;
    sourceRefId: string;
    statement: string;
    state: 'mapped' | 'pending' | 'out_of_scope' | 'retired';
    pointIds: (
      | string
      | {
          caseId: string;
          goalId: string;
        }
    )[];
    reason: string;
  }[];
  retiredPoints?: {
    pointId:
      | string
      | {
          caseId: string;
          goalId: string;
        };
    reason: string;
    replacements: (
      | string
      | {
          caseId: string;
          goalId: string;
        }
    )[];
  }[];
  changes?: {
    pointId:
      | string
      | {
          caseId: string;
          goalId: string;
        };
    kind: 'added' | 'modified' | 'moved' | 'split' | 'merged' | 'retired';
    relatedPointIds: (
      | string
      | {
          caseId: string;
          goalId: string;
        }
    )[];
    reason: string;
  }[];
  reason: string;
  aiContext?: AiContext;
}
export interface DraftCase {
  id: string;
  title: string;
  criticalConditions: CriticalCondition[];
  requiredPath: string | null;
  stepOrder: 'strict' | 'adaptive';
  steps: Step[];
  goals: DraftGoal[];
  parameters?: ParameterDefinition[];
}
export interface CriticalCondition {
  id: string;
  text: string;
}
export interface Step {
  id: string;
  action: string;
  dependsOn?: string[];
}
export interface DraftGoal {
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
  title?: string;
  pointId?: string | null;
  planState?: 'prepared' | 'unprepared';
  preparationGaps?: string[];
  sourceAlias?: string | null;
}
export interface Basis {
  kind: 'explicit' | 'interpretation' | 'hypothesis';
  source: string;
  text: string;
  sourceRefIds?: string[];
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
