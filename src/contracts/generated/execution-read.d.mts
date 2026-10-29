/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export interface EgoLiteExecutionReadViewV6 {
  viewVersion: 6;
  view: 'summary' | 'assignment';
  runId: string;
  baselineSha256: string;
  revision: number;
  project: string;
  configuration: ExecutionConfigurationSnapshot;
  knownAvailableWorkers: number | null;
  capacityReason: ExecutionTextPreview;
  integrity: ExecutionMetadataIntegrity | ExecutionFullIntegrity;
  counts: {
    activeReservations: number;
    peakReservations: number;
    reportedExecutionPeak: number | null;
    draining: boolean;
    totalAssignments: number;
    unfinishedAssignments: number;
    failedAssignments: number;
    pendingImports: number;
    operations: number;
    events: number;
    protectedSpaces: number | null;
  };
  assignments: {
    total: number;
    truncated: boolean;
    /**
     * @maxItems 20
     */
    items: ExecutionAssignmentSummary[];
  };
  assignment: null | ExecutionAssignment;
  imports: {
    total: number;
    truncated: boolean;
    /**
     * @maxItems 20
     */
    items: ExecutionImportReference[];
  };
  noteCounts: {
    [k: string]: number;
  };
  notes: {
    total: number;
    truncated: boolean;
    /**
     * @maxItems 5
     */
    items: ExecutionNotePreview[];
  };
  caveat: string;
  recovery: {
    evidenceMarker: 'present' | 'absent';
    pendingImports: number;
  };
}
export interface ExecutionConfigurationSnapshot {
  kind: 'default' | 'project' | 'file' | 'override';
  initialMaxParallelCases: number;
  requestedMaxParallelCases: number;
  configuration: {
    schemaVersion: 6;
    maxParallelCases: number;
  };
  configFile?: string;
  configSha256?: string;
}
export interface ExecutionTextPreview {
  text: string;
  truncated: boolean;
}
export interface ExecutionMetadataIntegrity {
  scope: 'metadata';
  baselineHash: 'matched';
  executionLedger: 'validated';
  recordedResults: 'not_checked';
  evidenceFiles: 'not_checked';
}
export interface ExecutionFullIntegrity {
  scope: 'full';
  baselineHash: 'matched';
  executionLedger: 'validated';
  recordedResults: 'checked';
  evidenceFiles: 'verified';
}
export interface ExecutionAssignmentSummary {
  id: string;
  caseId: string;
  state: 'reserved' | 'running' | 'paused' | 'stop_requested' | 'stopped' | 'completed' | 'failed' | 'lost';
  workerDirectory: string;
  workerId: string | null;
  model: string | null;
  reasoning: string | null;
  defaultSpaceId: number | null;
  updatedAt: string;
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
export interface ExecutionImportReference {
  operationId: string;
  assignmentId: string;
  packetId: string;
  packetFile: string;
  packetSha256: string;
  phase: 'prepared' | 'evidence' | 'result' | 'complete' | 'superseded';
  resultOperationId: string | null;
}
export interface ExecutionNotePreview {
  operationId: string;
  kind: string;
  assignmentId: string | null;
  at: string;
  reason: ExecutionTextPreview;
}
