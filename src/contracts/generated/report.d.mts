/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export type EgoLiteExecutionRequestV5 =
  | {
      schemaVersion: 5;
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'inventory';
      spaceIds: number[];
      evidenceFiles?: string[];
    }
  | {
      schemaVersion: 5;
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'capacity';
      availableWorkers: number | null;
      evidenceFiles?: string[];
    }
  | {
      schemaVersion: 5;
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'reserve';
      caseId: string;
      baselineSha256: string;
      resources?: string[];
      workerId?: string;
      model?: string;
      reasoning?: string;
    }
  | {
      schemaVersion: 5;
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'attach-space';
      assignmentId: string;
      spaceId: number;
      name: string;
      receiptFile: string;
      created: true;
      replaceDefault?: boolean;
    }
  | {
      schemaVersion: 5;
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'note';
      assignmentId?: string;
      category: 'observation' | 'space-deviation' | 'skill-bug' | 'external-change' | 'cleanup';
      spaceIds?: (number | null)[];
      remainingSpaceIds?: number[];
      evidenceFiles?: string[];
    }
  | {
      schemaVersion: 5;
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'set-limit';
      maxParallelCases: number;
    }
  | {
      schemaVersion: 5;
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'reconcile';
      assignmentId: string;
      state: 'running' | 'paused' | 'stop_requested' | 'stopped' | 'completed' | 'failed' | 'lost';
      inFlight: boolean;
      workerId?: string;
      model?: string;
      reasoning?: string;
      evidenceFiles?: string[];
    }
  | {
      schemaVersion: 5;
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'import';
      packetFile: string;
      review: PacketReview1;
      rebaseOf?: string;
    };

export interface EgoLiteGeneratedReportV5 {
  schemaVersion: 5;
  runId: string;
  project: string;
  structurallyValid: true;
  revision: number;
  evidenceRevision: number;
  counts: {
    verified: number;
    violation: number;
    inconclusive: number;
    not_tested: number;
    unassessed: number;
  };
  evidenceIntegrity: {
    hashVerifiedItems: number;
  };
  evidenceCoverage: {
    registeredScreenshots: number;
    distinctRetainedContents: number;
    goalsWithoutScreenshots: {
      caseId: string;
      goalId: string;
    }[];
  };
  context?: RetrospectiveReportContextV5NoBusinessExecution;
  caveat: string;
  evidenceCatalog: EgoLiteEvidenceCatalogV5;
  /**
   * @minItems 1
   */
  cases: CheckedCase[];
  execution?: EgoLiteExecutionLedgerV5;
  executionSummary?: ExecutionSummary;
  caseCount: number;
  goalCount: number;
  assessmentComplete: boolean;
}
export interface RetrospectiveReportContextV5NoBusinessExecution {
  schemaVersion: 5;
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
}
export interface EgoLiteEvidenceCatalogV5 {
  schemaVersion: 5;
  revision: number;
  items: EvidenceItem[];
  operations: EvidenceOperation[];
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
}
export interface EvidenceOperation {
  operationId: string;
  payloadSha256: string;
  revision: number;
  committedAt: string;
  caseId: string;
  evidenceId: string;
  path: string;
  sha256: string;
  bytes: number;
}
export interface CheckedCase {
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
  assessments: CommittedAssessment[];
  observations: Observation[];
  entries: ResultEntry[];
  missingGoalIds: string[];
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
}
export interface Diagnosis {
  state: 'unknown' | 'hypothesis' | 'confirmed';
  category: 'product' | 'agent' | 'environment' | 'spec' | 'unknown';
  summary: string;
  evidenceIds: string[];
}
export interface Observation {
  id: string;
  summary: string;
  coveredRefs: string[];
  evidenceIds: string[];
}
export interface ResultEntry {
  operationId: string;
  payloadSha256: string;
  expectedRevision: number;
  revision: number;
  recordedAt: string;
  caseId: string;
  mode: 'final' | 'attempt';
  record: RecordPayload;
}
export interface RecordPayload {
  observations: Observation[];
  assessments: Assessment[];
}
export interface Assessment {
  goalId: string;
  status: 'verified' | 'violation' | 'inconclusive' | 'not_tested';
  rationale: string;
  observationIds: string[];
  gaps: string[];
  diagnosis?: Diagnosis;
}
export interface EgoLiteExecutionLedgerV5 {
  schemaVersion: 5;
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
    schemaVersion: 5;
    maxParallelCases: number;
  };
  configFile?: string;
  configSha256?: string;
}
export interface ExecutionAssignment {
  id: string;
  caseId: string;
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
export interface ExecutionWindow {
  startedAt: string;
  endedAt: string;
  /**
   * @minItems 1
   */
  evidenceKeys: string[];
}
export interface PacketImport {
  operationId: string;
  assignmentId: string;
  packetId: string;
  packetSha256: string;
  packetFile: string;
  originalPacket: EgoLiteWorkerPacketV5;
  review: PacketReview;
  evidenceJobs: EvidenceImportJob[];
  resultRequest?: ResultOrAttemptRequestV5;
  resultReceipt?: ImportedResultReceipt;
  phase: 'prepared' | 'evidence' | 'result' | 'complete' | 'superseded';
  startedAt: string;
  completedAt?: string;
  supersededBy?: string;
}
export interface EgoLiteWorkerPacketV5 {
  schemaVersion: 5;
  runId: string;
  baselineSha256: string;
  caseId: string;
  assignmentId: string;
  attemptId: string;
  packetId: string;
  mode: 'attempt' | 'final';
  record: RecordPayload;
  evidence: PacketEvidence[];
  executionWindow?: ExecutionWindow1;
  /**
   * @minItems 1
   */
  spaceUsage: {
    spaceId: number | null;
    reason: string;
    evidenceKeys: string[];
  }[];
}
export interface PacketEvidence {
  key: string;
  path: string;
  kind: 'screenshot' | 'dom' | 'tool_receipt' | 'log' | 'other';
  source: string;
  description: string;
  sha256: string;
  bytes: number;
  capturedAt?: string;
}
export interface ExecutionWindow1 {
  startedAt: string;
  endedAt: string;
  /**
   * @minItems 1
   */
  evidenceKeys: string[];
}
export interface PacketReview {
  decision: 'accept' | 'revise';
  reviewer: string;
  rationale: string;
  record?: RecordPayload;
  mode?: 'attempt' | 'final';
}
export interface EvidenceImportJob {
  key: string;
  request?: EvidenceRegistrationRequestV5;
  receipt?: ImportedEvidenceReceipt;
}
export interface EvidenceRegistrationRequestV5 {
  schemaVersion: 5;
  operationId: string;
  expectedRevision: number;
  caseId: string;
  sourceFile: string;
  kind: 'screenshot' | 'dom' | 'tool_receipt' | 'log' | 'other';
  capturedAt?: string;
  source: string;
  description: string;
}
export interface ImportedEvidenceReceipt {
  operationId: string;
  revision: number;
  caseId: string;
  evidenceId: string;
  path: string;
  sha256: string;
  bytes: number;
  collectedAt: string;
  replayed: boolean;
}
export interface ResultOrAttemptRequestV5 {
  schemaVersion: 5;
  operationId: string;
  expectedRevision: number;
  caseId: string;
  mode: 'final' | 'attempt';
  record: RecordPayload;
}
export interface ImportedResultReceipt {
  operationId: string;
  revision: number;
  caseId: string;
  mode: 'attempt' | 'final';
  replayed: boolean;
}
export interface ExecutionOperation {
  operationId: string;
  payloadSha256: string;
  request: EgoLiteExecutionRequestV5;
  startedAt: string;
  receipt?: ExecutionReceipt;
}
export interface PacketReview1 {
  decision: 'accept' | 'revise';
  reviewer: string;
  rationale: string;
  record?: RecordPayload;
  mode?: 'attempt' | 'final';
}
export interface ExecutionReceipt {
  operationId: string;
  kind: string;
  revision: number;
  assignmentId?: string;
  caseId?: string;
  packetId?: string;
  workerDirectory?: string;
  evidenceIds?: string[];
  state?: string;
  maxParallelCases?: number;
  availableWorkers?: number | null;
  resultOperationId?: string;
}
export interface ExecutionEvent {
  revision: number;
  operationId: string;
  at: string;
  kind: string;
  reason: string;
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
  unfinishedAssignmentIds: string[];
  pendingImportIds: string[];
}
