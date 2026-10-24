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
export type ResultOrAttemptRequestV3 = {
  schemaVersion: 3;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  operationId: string;
  expectedRevision: number;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  caseId: string;
  mode: 'final' | 'attempt';
  record: {
    status: 'pass' | 'fail' | 'inconclusive' | 'blocked' | 'not_run';
    observed: string;
    rationale: string;
    remainingQuestions: string[];
    /**
     * Items: Reserved property names such as __proto__, prototype, and constructor are forbidden.
     */
    evidenceIds: string[];
    cause?: 'product_candidate' | 'agent' | 'environment' | 'spec' | 'unknown';
  };
};
export type EgoLiteExecutionRequestV1 =
  | {
      schemaVersion: 1;
      /**
       * Reserved property names such as __proto__, prototype, and constructor are forbidden.
       */
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'inventory';
      spaceIds: number[];
      evidenceFiles?: string[];
    }
  | {
      schemaVersion: 1;
      /**
       * Reserved property names such as __proto__, prototype, and constructor are forbidden.
       */
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'capacity';
      availableWorkers: number | null;
      evidenceFiles?: string[];
    }
  | {
      schemaVersion: 1;
      /**
       * Reserved property names such as __proto__, prototype, and constructor are forbidden.
       */
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'reserve';
      /**
       * Reserved property names such as __proto__, prototype, and constructor are forbidden.
       */
      caseId: string;
      baselineSha256: string;
      resources?: string[];
      workerId?: string;
      model?: string;
      reasoning?: string;
    }
  | {
      schemaVersion: 1;
      /**
       * Reserved property names such as __proto__, prototype, and constructor are forbidden.
       */
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'attach-space';
      /**
       * Reserved property names such as __proto__, prototype, and constructor are forbidden.
       */
      assignmentId: string;
      spaceId: number;
      name: string;
      receiptFile: string;
      created: true;
      replaceDefault?: boolean;
    }
  | {
      schemaVersion: 1;
      /**
       * Reserved property names such as __proto__, prototype, and constructor are forbidden.
       */
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'note';
      /**
       * Reserved property names such as __proto__, prototype, and constructor are forbidden.
       */
      assignmentId?: string;
      category: 'observation' | 'space-deviation' | 'skill-bug' | 'external-change' | 'cleanup';
      spaceIds?: (number | null)[];
      remainingSpaceIds?: number[];
      evidenceFiles?: string[];
    }
  | {
      schemaVersion: 1;
      /**
       * Reserved property names such as __proto__, prototype, and constructor are forbidden.
       */
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'set-limit';
      maxParallelCases: number;
    }
  | {
      schemaVersion: 1;
      /**
       * Reserved property names such as __proto__, prototype, and constructor are forbidden.
       */
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'reconcile';
      /**
       * Reserved property names such as __proto__, prototype, and constructor are forbidden.
       */
      assignmentId: string;
      state: 'running' | 'paused' | 'stop_requested' | 'stopped' | 'completed' | 'failed' | 'lost';
      inFlight: boolean;
      workerId?: string;
      model?: string;
      reasoning?: string;
      evidenceFiles?: string[];
    }
  | {
      schemaVersion: 1;
      /**
       * Reserved property names such as __proto__, prototype, and constructor are forbidden.
       */
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'import';
      packetFile: string;
      review: PacketReview1;
      /**
       * Reserved property names such as __proto__, prototype, and constructor are forbidden.
       */
      rebaseOf?: string;
    };

export interface EgoLiteGeneratedReportV4 {
  schemaVersion: 4;
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
  execution: EgoLiteExecutionLedgerV1;
  executionSummary: ExecutionSummary;
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
export interface EgoLiteExecutionLedgerV1 {
  schemaVersion: 1;
  runId: string;
  baselineSha256: string;
  revision: number;
  configuration: ExecutionConfigurationSnapshot;
  knownAvailableWorkers: number | null;
  capacityReason: string;
  protectedSpaceIds: number[] | null;
  peakReservations: number;
  assignments: ExecutionAssignment[];
  imports: PacketImport[];
  operations: ExecutionOperation[];
  events: ExecutionEvent[];
}
export interface ExecutionConfigurationSnapshot {
  kind: 'default' | 'project' | 'file' | 'override';
  initialMaxParallelCases: number;
  requestedMaxParallelCases: number;
  configuration: {
    schemaVersion: 1;
    maxParallelCases: number;
  };
  configFile?: string;
  configSha256?: string;
}
export interface ExecutionAssignment {
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  id: string;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  caseId: string;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  attemptId: string;
  state: 'reserved' | 'running' | 'paused' | 'stop_requested' | 'stopped' | 'completed' | 'failed' | 'lost';
  workerDirectory: string;
  resources: string[];
  createdAt: string;
  updatedAt: string;
  workerId?: string;
  model?: string;
  reasoning?: string;
  defaultSpaceId: number | null;
  spaceHistory: SpaceUse[];
  ownedSpaces: OwnedSpace[];
  goalAssessments: CommittedGoalAssessment[];
  executionWindow?: ExecutionWindow;
}
export interface SpaceUse {
  spaceId: number | null;
  kind: 'default' | 'recovery' | 'deviation' | 'cleaned';
  at: string;
  reason: string;
}
export interface OwnedSpace {
  spaceId: number;
  name: string;
  createdAt: string;
  receipt: RetainedFileReference;
  closedAt?: string;
}
export interface RetainedFileReference {
  path: string;
  sha256: string;
  bytes: number;
}
export interface CommittedGoalAssessment {
  /**
   * @minItems 1
   */
  targets: string[];
  status: 'verified' | 'violation' | 'inconclusive' | 'not_tested';
  observed: string;
  rationale: string;
  /**
   * Items: Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  evidenceIds: string[];
}
export interface ExecutionWindow {
  startedAt: string;
  endedAt: string;
  /**
   * @minItems 1
   *
   * Items: Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  evidenceKeys: string[];
}
export interface PacketImport {
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  operationId: string;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  assignmentId: string;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  packetId: string;
  packetSha256: string;
  packetFile: string;
  originalPacket: EgoLiteWorkerPacketV1;
  review: PacketReview;
  evidenceJobs: EvidenceImportJob[];
  resultRequest?: ResultOrAttemptRequestV3;
  resultReceipt?: ImportedResultReceipt;
  phase: 'prepared' | 'evidence' | 'result' | 'complete' | 'superseded';
  startedAt: string;
  completedAt?: string;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  supersededBy?: string;
}
export interface EgoLiteWorkerPacketV1 {
  schemaVersion: 1;
  runId: string;
  baselineSha256: string;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  caseId: string;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  assignmentId: string;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  attemptId: string;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  packetId: string;
  mode: 'attempt' | 'final';
  record: PacketRecord;
  evidence: PacketEvidence[];
  /**
   * @minItems 1
   */
  goalAssessments: GoalAssessment[];
  executionWindow?: ExecutionWindow1;
  /**
   * @minItems 1
   */
  spaceUsage: {
    spaceId: number | null;
    reason: string;
    /**
     * Items: Reserved property names such as __proto__, prototype, and constructor are forbidden.
     */
    evidenceKeys: string[];
  }[];
}
export interface PacketRecord {
  status: 'pass' | 'fail' | 'inconclusive' | 'blocked' | 'not_run';
  observed: string;
  rationale: string;
  remainingQuestions: string[];
  /**
   * Items: Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  evidenceKeys: string[];
  cause?: 'product_candidate' | 'agent' | 'environment' | 'spec' | 'unknown';
}
export interface PacketEvidence {
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  key: string;
  path: string;
  kind: 'screenshot' | 'dom' | 'tool_receipt' | 'log' | 'other';
  source: string;
  description: string;
  sha256: string;
  bytes: number;
  capturedAt?: string;
}
export interface GoalAssessment {
  /**
   * @minItems 1
   */
  targets: string[];
  status: 'verified' | 'violation' | 'inconclusive' | 'not_tested';
  observed: string;
  rationale: string;
  /**
   * Items: Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  evidenceKeys: string[];
}
export interface ExecutionWindow1 {
  startedAt: string;
  endedAt: string;
  /**
   * @minItems 1
   *
   * Items: Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  evidenceKeys: string[];
}
export interface PacketReview {
  decision: 'accept' | 'revise';
  reviewer: string;
  rationale: string;
  record?: PacketRecord;
  /**
   * @minItems 1
   */
  goalAssessments?: GoalAssessment[];
  mode?: 'attempt' | 'final';
}
export interface EvidenceImportJob {
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  key: string;
  request?: EvidenceRegistrationRequestV3;
  receipt?: ImportedEvidenceReceipt;
}
export interface EvidenceRegistrationRequestV3 {
  schemaVersion: 3;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  operationId: string;
  expectedRevision: number;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  caseId: string;
  /**
   * Absolute local regular file path on the current operating system.
   */
  sourceFile: string;
  kind: 'screenshot' | 'dom' | 'tool_receipt' | 'log' | 'other';
  /**
   * Optional source-provided capture time. Omit when unknown; collectedAt is recorded independently.
   */
  capturedAt?: string;
  source: string;
  description: string;
}
export interface ImportedEvidenceReceipt {
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  operationId: string;
  revision: number;
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
  collectedAt: string;
  replayed: boolean;
}
export interface ImportedResultReceipt {
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  operationId: string;
  revision: number;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  caseId: string;
  mode: 'attempt' | 'final';
  status: 'pass' | 'fail' | 'inconclusive' | 'blocked' | 'not_run';
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  attemptId?: string;
  noOp?: boolean;
  replayed: boolean;
}
export interface ExecutionOperation {
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  operationId: string;
  payloadSha256: string;
  request: EgoLiteExecutionRequestV1;
  startedAt: string;
  receipt?: ExecutionReceipt;
}
export interface PacketReview1 {
  decision: 'accept' | 'revise';
  reviewer: string;
  rationale: string;
  record?: PacketRecord;
  /**
   * @minItems 1
   */
  goalAssessments?: GoalAssessment[];
  mode?: 'attempt' | 'final';
}
export interface ExecutionReceipt {
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  operationId: string;
  kind: string;
  revision: number;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  assignmentId?: string;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  caseId?: string;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  packetId?: string;
  workerDirectory?: string;
  /**
   * Items: Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  evidenceIds?: string[];
  state?: string;
  maxParallelCases?: number;
  availableWorkers?: number | null;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  resultOperationId?: string;
}
export interface ExecutionEvent {
  revision: number;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  operationId: string;
  at: string;
  kind: string;
  reason: string;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  assignmentId?: string;
  evidenceFiles?: RetainedFileReference1[];
}
export interface RetainedFileReference1 {
  path: string;
  sha256: string;
  bytes: number;
}
export interface ExecutionSummary {
  configuredMaxParallelCases: number;
  knownAvailableWorkers: number | null;
  activeReservations: number;
  peakReservations: number;
  reportedExecutionPeak: number | null;
  executionWindowSource: string;
  draining: boolean;
  /**
   * Items: Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  unfinishedAssignmentIds: string[];
  /**
   * Items: Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  pendingImportIds: string[];
  /**
   * Items: Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  unassessedCaseIds: string[];
}
