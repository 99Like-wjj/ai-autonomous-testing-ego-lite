/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export interface EgoLiteWorkerDraftV5 {
  schemaVersion: 5;
  packetId: string;
  mode: 'attempt' | 'final';
  record: RecordPayload;
  evidence: PacketEvidence[];
  /**
   * @minItems 1
   */
  spaceUsage: {
    spaceId: number | null;
    reason: string;
    evidenceKeys: string[];
  }[];
  executionWindow?: ExecutionWindow;
}
export interface RecordPayload {
  observations: Observation[];
  assessments: Assessment[];
}
export interface Observation {
  id: string;
  summary: string;
  coveredRefs: string[];
  evidenceIds: string[];
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
export interface PacketEvidence {
  key: string;
  path: string;
  kind: 'screenshot' | 'dom' | 'tool_receipt' | 'log' | 'other';
  source: string;
  description: string;
  capturedAt?: string;
}
export interface ExecutionWindow {
  startedAt: string;
  endedAt: string;
  /**
   * @minItems 1
   */
  evidenceKeys: string[];
}
