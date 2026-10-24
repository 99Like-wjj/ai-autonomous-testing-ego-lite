/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export interface EvidenceRegistrationRequestV3 {
  schemaVersion: 3;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  operationId: string;
  expectedRevision: number;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  caseId: string;
  /**
   * Absolute local regular file path on the current operating system.
   */
  sourceFile: string;
  kind: 'screenshot' | 'dom' | 'tool_receipt' | 'log' | 'other';
  /**
   * Optional source-provided capture time. Omit when unknown; collectedAt is recorded independently.
   */
  capturedAt?: string;
  source: string;
  description: string;
}
