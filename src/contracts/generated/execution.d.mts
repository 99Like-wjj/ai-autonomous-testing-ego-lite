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
export type EgoLiteExecutionRequestV7 =
  | {
      schemaVersion: 7;
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'inventory';
      spaceIds: number[];
      evidenceFiles?: string[];
    }
  | {
      schemaVersion: 7;
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'capacity';
      availableWorkers: number | null;
      evidenceFiles?: string[];
    }
  | {
      schemaVersion: 7;
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
      schemaVersion: 7;
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
      schemaVersion: 7;
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
      schemaVersion: 7;
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'set-limit';
      maxParallelCases: number;
    }
  | {
      schemaVersion: 7;
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
      schemaVersion: 7;
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'import';
      packetFile: string;
      review: PacketReview1;
      rebaseOf?: string;
    };

export interface EgoLiteExecutionLedgerV7 {
  schemaVersion: 7;
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
    schemaVersion: 7;
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
  originalPacket: EgoLiteWorkerPacketV7;
  review: PacketReview;
  evidenceJobs: EvidenceImportJob[];
  resultRequest?: ResultOrAttemptRequestV7;
  resultReceipt?: ImportedResultReceipt;
  phase: 'prepared' | 'evidence' | 'result' | 'complete' | 'superseded';
  startedAt: string;
  completedAt?: string;
  supersededBy?: string;
}
export interface EgoLiteWorkerPacketV7 {
  schemaVersion: 7;
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
export interface RecordPayload {
  observations: Observation[];
  assessments: Assessment[];
  contexts?: RunContext[];
  actionEvents?: ActionEvent[];
}
export interface Observation {
  id: string;
  summary: string;
  coveredRefs: string[];
  evidenceIds: string[];
  contextId?: string;
  actionEventIds?: string[];
}
export interface Assessment {
  goalId: string;
  status: 'verified' | 'violation' | 'inconclusive' | 'not_tested';
  rationale: string;
  observationIds: string[];
  gaps: string[];
  diagnosis?: Diagnosis;
}
export interface Diagnosis {
  state: 'unknown' | 'hypothesis' | 'confirmed';
  category: 'product' | 'agent' | 'environment' | 'spec' | 'unknown';
  summary: string;
  evidenceIds: string[];
}
export interface RunContext {
  id: string;
  environment: ContextFact;
  identity: ContextFact;
  objects: ContextFact;
  initialState: ContextFact;
  authorization: ContextFact;
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
export interface PacketEvidence {
  key: string;
  path: string;
  kind: 'screenshot' | 'dom' | 'tool_receipt' | 'log' | 'other';
  source: string;
  description: string;
  sha256: string;
  bytes: number;
  capturedAt?: string;
  /**
   * Explicitly reuse this current-run, same-case registered evidence ID after matching the retained file and all source metadata. This is not new collection.
   */
  reuseEvidenceId?: string;
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
  request?: EvidenceRegistrationRequestV7;
  receipt?: ImportedEvidenceReceipt;
}
export interface EvidenceRegistrationRequestV7 {
  schemaVersion: 7;
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
export interface ResultOrAttemptRequestV7 {
  schemaVersion: 7;
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
  request: EgoLiteExecutionRequestV7;
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
