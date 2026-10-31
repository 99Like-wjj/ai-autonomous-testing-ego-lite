/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

/**
 * Exact task and rule snapshots plus current-run AI declarations. Current declarations do not inherit historical readiness or authorization. Compiled cases must preserve every original goal and necessary obligation.
 */
export type FrozenRegressionRunBindingV1 = Request | Binding;

export interface Request {
  regressionVersion: 1;
  selection: Selection;
  caseMappings: {
    scopeCaseId: string;
    runCaseId: string;
  }[];
  deferredCases: {
    caseId: string;
    reason: string;
  }[];
  conditions: Conditions;
}
export interface Selection {
  regressionVersion: 1;
  request: Request1;
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
export interface Request1 {
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
export interface Conditions {
  declaredBy: string;
  /**
   * Use the original declaration time normalized to UTC with Z, at seconds or exactly three millisecond digits. Offset ISO strings and microseconds are not accepted by the current runtime.
   */
  declaredAt: string;
  forCurrentRun: true;
  items: Condition[];
}
export interface Condition {
  id: string;
  /**
   * @minItems 1
   */
  caseIds: string[];
  aspect: 'identity' | 'environment' | 'data' | 'authorization' | 'path' | 'other';
  state: 'verified' | 'pending' | 'deferred';
  statement: string;
  /**
   * Only current_evidence carries a retained local file and SHA-256. ai_declaration and current_user_statement use the locator to identify their source and must set file and sha256 to null. Structure does not authenticate a declaration or prove file contents.
   */
  source: {
    kind: 'ai_declaration' | 'current_user_statement' | 'current_evidence';
    locator: string;
    file: string | null;
    sha256: string | null;
  };
}
export interface Binding {
  regressionVersion: 1;
  selection: Selection;
  caseMappings: {
    scopeCaseId: string;
    runCaseId: string;
  }[];
  deferredCases: {
    caseId: string;
    reason: string;
  }[];
  conditions: Conditions;
  runId: string;
  baselineSha256: string;
  tasks: StoredTask[];
  rules: StoredRule[];
  coverage: {
    requestedCases: number;
    requestedGoals: number;
    selectedCases: number;
    selectedGoals: number;
    compiledCases: number;
    compiledGoals: number;
    notSelectedCases: number;
    gaps: Gap[];
  };
  caveat: string;
  contentSha256: string;
}
export interface StoredTask {
  kind: 'task';
  taskId: string;
  title: string;
  maturity: 'candidate' | 'incomplete' | 'defined';
  review: {
    author: string;
    basis: string;
    gaps: string[];
  };
  applicability: {
    state: 'applicable' | 'uncertain' | 'inapplicable';
    conditions: string[];
    reason: string;
    replacedBy: TaskRef | null;
  };
  casePlan: Case | null;
  ruleBindings: {
    goalId: string;
    ruleRefs: RuleRef[];
  }[];
  sourceRefs: SourceRef[];
  goalMappings: {
    sourceRefId: string;
    taskGoalId: string | null;
    reason: string;
  }[];
  pathKnowledge: {
    planRef: string;
    state: 'observed' | 'required_unreached' | 'unknown';
    sourceRefIds: string[];
    detail: string;
    gaps: string[];
  }[];
  dataConstraints: {
    requiredRelationships: string[];
    allowedSubstitutions: string[];
    equivalenceRequirements: string[];
  };
  risks: {
    unresolvedSideEffects: string[];
    idempotencyBasis: string[];
    authorizationToRecheck: string[];
  };
  auxiliaryActions: {
    purpose: 'preparation' | 'exploration' | 'recovery' | 'cleanup';
    intent: string;
    conditions: string[];
    limits: string[];
  }[];
  supersedes: TaskRef | null;
  reason: string;
  regressionVersion: 1;
  revision: number;
  operationId: string;
  expectedRevision: number;
  payloadSha256: string;
  contentSha256: string;
  recordedAt: string;
  timeSource: 'local_transaction_clock';
}
export interface RuleRef {
  ruleId: string;
  revision: number;
  contentSha256: string;
}
export interface SourceRef {
  id: string;
  runDir: string;
  runId: string;
  baselineSha256: string;
  resultsRevision: number;
  resultsSha256: string;
  caseId: string;
  goalId: string;
  observationIds: string[];
  actionIds: string[];
  evidence: {
    evidenceId: string;
    sha256: string;
  }[];
}
export interface StoredRule {
  kind: 'rule';
  ruleId: string;
  statement: string;
  scope: string[];
  source: {
    kind: 'requirement' | 'user_confirmation' | 'approved_specification';
    contentFile: string;
    locator: string;
    excerpt: string;
    version: string | null;
    contentSha256: string;
  };
  confirmation: {
    state: 'explicit' | 'confirmed' | 'pending' | 'conflict';
    /**
     * @minItems 1
     */
    basis: string[];
  };
  supersedes: RuleRef | null;
  reason: string;
  regressionVersion: 1;
  revision: number;
  operationId: string;
  expectedRevision: number;
  payloadSha256: string;
  contentSha256: string;
  recordedAt: string;
  timeSource: 'local_transaction_clock';
}
