/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export type ResultOrAttemptRequestV3 = {
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
  mode: 'final' | 'attempt';
  record: {
    status: 'pass' | 'fail' | 'inconclusive' | 'blocked' | 'not_run';
    observed: string;
    rationale: string;
    remainingQuestions: string[];
    /**
     * Items: Reserved property names such as __proto__, prototype, and constructor are forbidden.
     */
    evidenceIds: string[];
    cause?: 'product_candidate' | 'agent' | 'environment' | 'spec' | 'unknown';
  };
};
