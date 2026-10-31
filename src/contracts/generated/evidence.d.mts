/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

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

export interface EgoLiteEvidenceCatalogV8 {
  schemaVersion: 8;
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
  metadata?: EvidenceMetadata;
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
