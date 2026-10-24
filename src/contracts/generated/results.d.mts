/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export type ResultV3 = {
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  id: string;
  basis: Basis;
  /**
   * Current final outcome. not_run means no final outcome is recorded and may coexist with historical attempts.
   */
  status: 'pass' | 'fail' | 'inconclusive' | 'blocked' | 'not_run';
  observed: string;
  rationale: string;
  remainingQuestions: string[];
  /**
   * Items: Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  evidenceIds: string[];
  cause?: 'product_candidate' | 'agent' | 'environment' | 'spec' | 'unknown';
  attempts: AttemptV3[];
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  operationId?: string;
  revision?: number;
  recordedAt?: string;
};
export type AttemptV3 = {
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  attemptId: string;
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  operationId: string;
  revision: number;
  recordedAt: string;
  kind: 'attempt' | 'superseded_final';
  status: 'pass' | 'fail' | 'inconclusive' | 'blocked';
  observed: string;
  rationale: string;
  remainingQuestions: string[];
  /**
   * Items: Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  evidenceIds: string[];
  cause?: 'product_candidate' | 'agent' | 'environment' | 'spec' | 'unknown';
};

/**
 * Revisioned final results, explicit attempts, and idempotency receipts. Runtime validation also enforces evidence ownership and the frozen-baseline clarification veto.
 */
export interface EgoLiteRecordedResultsV3 {
  schemaVersion: 3;
  revision: number;
  /**
   * @minItems 1
   */
  cases: ResultV3[];
  operations: ResultOperationV3[];
}
export interface Basis {
  kind: 'explicit' | 'interpretation' | 'hypothesis';
  source: string;
  text: string;
}
export interface ResultOperationV3 {
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
  mode: 'final' | 'attempt';
  /**
   * Current final outcome. not_run means no final outcome is recorded and may coexist with historical attempts.
   */
  status: 'pass' | 'fail' | 'inconclusive' | 'blocked' | 'not_run';
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  attemptId?: string;
  noOp?: boolean;
}
