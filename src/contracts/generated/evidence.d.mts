/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

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
