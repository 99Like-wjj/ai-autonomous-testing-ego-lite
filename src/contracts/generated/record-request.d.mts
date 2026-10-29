/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export interface ResultOrAttemptRequestV5 {
  schemaVersion: 5;
  operationId: string;
  expectedRevision: number;
  caseId: string;
  mode: 'final' | 'attempt';
  record: RecordPayload;
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
