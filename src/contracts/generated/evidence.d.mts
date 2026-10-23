/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

/**
 * New entries bind a local file copy to its associated case, source metadata, collectedAt, optional source-provided capturedAt, byte count, and SHA-256 of the retained bytes. A matching hash is not proof of authenticity.
 */
export interface EgoLiteEvidenceCatalogV3 {
  schemaVersion: 3;
  revision: number;
  items: EvidenceItemV3[];
  operations: EvidenceOperationV3[];
}
export interface EvidenceItemV3 {
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  id: string;
  path: string;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  caseId: string;
  kind: 'screenshot' | 'dom' | 'tool_receipt' | 'log' | 'other';
  /**
   * Optional UTC capture time supplied by the source/operator. It is not inferred.
   */
  capturedAt?: string;
  collectedAt: string;
  source: string;
  description: string;
  sha256: string;
  bytes: number;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  operationId: string;
}
export interface EvidenceOperationV3 {
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  operationId: string;
  payloadSha256: string;
  revision: number;
  committedAt: string;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  caseId: string;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  evidenceId: string;
  path: string;
  sha256: string;
  bytes: number;
}
