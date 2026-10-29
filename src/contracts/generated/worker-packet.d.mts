/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export type ContextFact = {
  state: 'known' | 'unknown' | 'not_applicable';
  value?: string;
  reason?: string;
  sourceEvidenceIds: string[];
};
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
};

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
  executionWindow?: ExecutionWindow;
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
export interface PacketEvidence {
  key: string;
  path: string;
  kind: 'screenshot' | 'dom' | 'tool_receipt' | 'log' | 'other';
  source: string;
  description: string;
  sha256: string;
  bytes: number;
  capturedAt?: string;
  metadata?: EvidenceMetadata;
}
export interface ExecutionWindow {
  startedAt: string;
  endedAt: string;
  /**
   * @minItems 1
   */
  evidenceKeys: string[];
}
