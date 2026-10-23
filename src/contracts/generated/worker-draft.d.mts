/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export interface EgoLiteWorkerDraftV1 {
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  packetId: string;
  mode: 'attempt' | 'final';
  record: PacketRecord;
  evidence: PacketEvidence[];
  /**
   * @minItems 1
   */
  goalAssessments: GoalAssessment[];
  /**
   * @minItems 1
   */
  spaceUsage: {
    spaceId: number | null;
    reason: string;
    /**
     * Items: Reserved property names such as __proto__, prototype, and constructor are forbidden.
     */
    evidenceKeys: string[];
  }[];
  executionWindow?: ExecutionWindow;
}
export interface PacketRecord {
  status: 'pass' | 'fail' | 'inconclusive' | 'blocked' | 'not_run';
  observed: string;
  rationale: string;
  remainingQuestions: string[];
  /**
   * Items: Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  evidenceKeys: string[];
  cause?: 'product_candidate' | 'agent' | 'environment' | 'spec' | 'unknown';
}
export interface PacketEvidence {
  /**
   * Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  key: string;
  path: string;
  kind: 'screenshot' | 'dom' | 'tool_receipt' | 'log' | 'other';
  source: string;
  description: string;
  capturedAt?: string;
}
export interface GoalAssessment {
  /**
   * @minItems 1
   */
  targets: string[];
  status: 'verified' | 'violation' | 'inconclusive' | 'not_tested';
  observed: string;
  rationale: string;
  /**
   * Items: Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  evidenceKeys: string[];
}
export interface ExecutionWindow {
  startedAt: string;
  endedAt: string;
  /**
   * @minItems 1
   *
   * Items: Reserved property names such as __proto__, prototype, and constructor are forbidden.
   */
  evidenceKeys: string[];
}
