/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export type ContextFact = {
  state: 'known' | 'unknown' | 'not_applicable';
  summary: string;
  sources: FactSource[];
};
export type FactSource = {
  kind: 'evidence' | 'requirement' | 'user_confirmation' | 'resource' | 'other';
  reference: string;
  evidenceIds: string[];
};
/**
 * One immutable fact event of an action attempt. The kind-specific fields below are conditional requirements, not a fixed execution route. Dispatch acceptance is separate from business result; unknown facts may be recorded without inventing evidence. IDs, source ownership, previous-event references and timestamp ordering are checked by the runtime.
 */
export type ActionEvent = {
  id: string;
  actionId: string;
  kind: 'intent' | 'dispatch' | 'result' | 'reconciliation' | 'disposition';
  purpose: 'prepare' | 'test' | 'reproduce' | 'recover' | 'cleanup' | 'explore';
  contextId: string;
  actor: string;
  summary: string;
  sideEffectRisk: 'none' | 'possible' | 'unknown';
  evidenceIds: string[];
  occurredAt?: string;
  timeSource?: string;
  planRef?: string;
  target?: string;
  inputs?: string[];
  sideEffects?: string[];
  dispatchState?: 'issued' | 'not_issued' | 'unknown';
  acceptanceState?: 'accepted' | 'rejected' | 'unknown' | 'not_applicable';
  resultState?: 'known' | 'processing' | 'window_incomplete' | 'failed' | 'unknown';
  readOnly?: true;
  observationWindow?: ActionObservationWindow;
  disposition?: ActionDisposition;
  conflictsWithEventIds?: string[];
  retry?: ActionRetry;
};
export type SourceReference = {
  id: string;
  locator: string;
  file: string | null;
  sha256: string | null;
  excerpt: string;
  limitations: string[];
};
export type ParameterBindings = {
  caseId: string;
  parameterId: string;
  value:
    | string
    | number
    | {
        id: string;
        label: string | null;
      };
  source: SourceReference;
}[];
export type EvidenceMetadata = {
  mediaType?: string;
  encoding?: string;
  scope?: 'page' | 'viewport' | 'element' | 'document' | 'unknown';
  page?: string;
  object?: string;
  purpose?: string;
  limitations?: string[];
  contextEvidenceIds?: string[];
  contentState?: 'full' | 'selected_fields' | 'summary' | 'truncated' | 'excluded' | 'failed' | 'unknown';
  redaction?: string;
  omissionReason?: string;
  width?: number;
  height?: number;
  artifactRole?: 'download_original' | 'inspection' | 'capture_receipt';
  deliveryRequired?: boolean;
};

export interface RetainedReportHistoryV1 {
  historyVersion: 1;
  roots: Run[];
  primaryBaseline: Run | null;
  nodes: {
    ref: Run;
    resolvedRunDir: string;
    caseVersion: number;
    parents: Run[];
    points: {
      pointId: string;
      /**
       * @minItems 1
       */
      forPointIds: string[];
      caseId: string;
      goalId: string;
      title: string;
      expected: string;
      selected: boolean;
      status: ('verified' | 'violation' | 'inconclusive' | 'not_tested') | null;
      rationale: string | null;
      gaps: string[];
      definitionSha256: string | null;
      assessment: CommittedAssessment | null;
      observations: Observation[];
      contexts: ExecutionContext[];
      actions: ActionEvent[];
      findings: Finding[];
      evidenceKeys: string[];
      definition: Goal;
      plan: {
        conditions: CriticalCondition[];
        path: string | null;
        order: 'strict' | 'adaptive';
        steps: Step[];
        parameters: ParameterDefinition[];
      };
      sourceDefinitions: SourceReference[];
      declaredConditions: CurrentConditions;
      parameterBindings: ParameterBindings;
    }[];
  }[];
  evidence: {
    key: string;
    sourceRun: Run;
    resolvedRunDir: string;
    item: EvidenceItem;
  }[];
  gaps: {
    run: Run;
    reason: string;
  }[];
  complete: boolean;
  caveat: string;
  contentSha256: string;
}
export interface Run {
  runDir: string;
  runId: string;
  baselineSha256: string;
  resultsRevision: number;
  resultsSha256: string;
}
export interface CommittedAssessment {
  goalId: string;
  status: 'verified' | 'violation' | 'inconclusive' | 'not_tested';
  rationale: string;
  observationIds: string[];
  gaps: string[];
  diagnosis?: Diagnosis;
  operationId: string;
  revision: number;
  recordedAt: string;
  summary?: string;
  phenomena?: Phenomenon[];
  gapDetails?: GapDetail[];
  revisionReason?: string;
  previousOperationId?: string;
  reproduction?: ReproductionPreparation;
}
export interface Diagnosis {
  state: 'unknown' | 'hypothesis' | 'confirmed';
  category: 'product' | 'agent' | 'environment' | 'spec' | 'unknown';
  summary: string;
  evidenceIds: string[];
}
export interface Phenomenon {
  id: string;
  title: string;
  actual: string;
  observationIds: string[];
  evidenceIds: string[];
  limitations: string[];
}
export interface GapDetail {
  kind: 'record' | 'evidence' | 'environment' | 'authorization' | 'requirement';
  missing: string;
  impact: string;
  nextStep?: string;
}
export interface ReproductionPreparation {
  preparation: string[];
  limitations: string[];
  objectState: string;
  repeatability: string;
}
export interface Observation {
  id: string;
  summary: string;
  coveredRefs: string[];
  evidenceIds: string[];
  contextId?: string;
  actual?: string;
  occurredAt?: string;
  actions?: ActionFact[];
  evidenceLinks?: EvidenceLink[];
  actionEventIds?: string[];
}
export interface ActionFact {
  id: string;
  description: string;
  input?: string;
  result?: string;
  planRefs: string[];
  evidenceIds: string[];
  occurredAt?: string;
}
export interface EvidenceLink {
  evidenceId: string;
  purpose: string;
  fact: string;
  actionId?: string;
  limitations: string[];
}
export interface ExecutionContext {
  id: string;
  environment: ContextFact;
  identity: ContextFact;
  objects: ContextFact;
  initialState: ContextFact;
  authorization: ContextFact;
  notes?: string;
}
/**
 * Actual observation bounds and their source. Runtime validation additionally checks that endedAt is not earlier than startedAt; this window does not create a product SLA.
 */
export interface ActionObservationWindow {
  startedAt: string;
  endedAt: string;
  source: string;
  limitation: string;
}
export interface ActionDisposition {
  state: 'confirmed_occurred' | 'confirmed_not_occurred' | 'unknown' | 'deferred' | 'conflicting';
  rationale: string;
  scope: string;
  limitations: string[];
  /**
   * @minItems 1
   */
  resolvesEventIds: string[];
}
export interface ActionRetry {
  actionId: string;
  rationale: string;
  /**
   * @minItems 1
   */
  authorizationSources: FactSource[];
  idempotencyBasis?: ContextFact;
}
export interface Finding {
  id: string;
  title: string;
  goalIds: string[];
  observationIds: string[];
  evidenceIds: string[];
  relationReason: string;
  reviewState: 'proposed' | 'reviewed';
  scope: 'original' | 'additional';
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
export interface CriticalCondition {
  id: string;
  text: string;
}
export interface Step {
  id: string;
  action: string;
  dependsOn: string[];
}
export interface ParameterDefinition {
  id: string;
  type: 'string' | 'integer' | 'decimal' | 'date' | 'object_ref' | 'account_ref';
  purpose: string;
  constraints: string[];
}
export interface CurrentConditions {
  declaredBy: string;
  declaredAt: string;
  forCurrentRun: true;
  items: {
    id: string;
    caseIds: string[];
    aspect: 'identity' | 'environment' | 'data' | 'authorization' | 'path' | 'other';
    state: 'verified' | 'pending' | 'deferred';
    statement: string;
    source: {
      kind: 'ai_declaration' | 'current_user_statement' | 'current_evidence';
      locator: string;
      file: string | null;
      sha256: string | null;
    };
  }[];
}
export interface EvidenceItem {
  id: string;
  path: string;
  caseId: string;
  kind: 'screenshot' | 'dom' | 'tool_receipt' | 'log' | 'other';
  capturedAt?: string;
  collectedAt: string;
  source: string;
  description: string;
  sha256: string;
  bytes: number;
  operationId: string;
  metadata?: EvidenceMetadata;
}
