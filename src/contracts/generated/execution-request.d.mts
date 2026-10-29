/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

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
      review: PacketReview;
      rebaseOf?: string;
    };
export type ContextFact = {
  state: 'known' | 'unknown' | 'not_applicable';
  value?: string;
  reason?: string;
  sourceEvidenceIds: string[];
};

export interface PacketReview {
  decision: 'accept' | 'revise';
  reviewer: string;
  rationale: string;
  record?: RecordPayload;
  mode?: 'attempt' | 'final';
}
export interface RecordPayload {
  observations: Observation[];
  assessments: Assessment[];
  contexts?: ExecutionContext[];
  findings?: Finding[];
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
export interface Assessment {
  goalId: string;
  status: 'verified' | 'violation' | 'inconclusive' | 'not_tested';
  rationale: string;
  observationIds: string[];
  gaps: string[];
  diagnosis?: Diagnosis;
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
export interface ExecutionContext {
  id: string;
  environment: ContextFact;
  actor: ContextFact;
  object: ContextFact;
  initialState: ContextFact;
  authorization: ContextFact;
  notes?: string;
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
