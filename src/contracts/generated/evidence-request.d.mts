/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

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
