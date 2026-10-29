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

export interface EvidenceRegistrationRequestV6 {
  schemaVersion: 6;
  operationId: string;
  expectedRevision: number;
  caseId: string;
  sourceFile: string;
  kind: 'screenshot' | 'dom' | 'tool_receipt' | 'log' | 'other';
  capturedAt?: string;
  source: string;
  description: string;
  metadata?: EvidenceMetadata;
}
