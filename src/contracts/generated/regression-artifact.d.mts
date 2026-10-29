/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

/**
 * Normative sources and historical facts remain separate. Structural validity is not current readiness or product quality. Runtime checks verify exact references, hashes and revision history.
 */
export type ImmutableRegressionArtifactAndCommitRequestV1 = Request | StoredRule | StoredTask;

export interface Request {
  regressionVersion: 1;
  operationId: string;
  expectedRevision: number;
  artifact: Rule | Task;
}
export interface Rule {
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
}
export interface RuleRef {
  ruleId: string;
  revision: number;
  contentSha256: string;
}
export interface Task {
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
}
export interface TaskRef {
  taskId: string;
  revision: number;
  contentSha256: string;
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
