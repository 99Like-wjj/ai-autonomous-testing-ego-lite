/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export type EgoLiteExecutionRequestV1 =
  | {
      schemaVersion: 1;
      /**
       * Reserved property names such as __proto__, prototype, and constructor are forbidden.
       */
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'inventory';
      spaceIds: number[];
      evidenceFiles?: string[];
    }
  | {
      schemaVersion: 1;
      /**
       * Reserved property names such as __proto__, prototype, and constructor are forbidden.
       */
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'capacity';
      availableWorkers: number | null;
      evidenceFiles?: string[];
    }
  | {
      schemaVersion: 1;
      /**
       * Reserved property names such as __proto__, prototype, and constructor are forbidden.
       */
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'reserve';
      /**
       * Reserved property names such as __proto__, prototype, and constructor are forbidden.
       */
      caseId: string;
      baselineSha256: string;
      resources?: string[];
      workerId?: string;
      model?: string;
      reasoning?: string;
    }
  | {
      schemaVersion: 1;
      /**
       * Reserved property names such as __proto__, prototype, and constructor are forbidden.
       */
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'attach-space';
      /**
       * Reserved property names such as __proto__, prototype, and constructor are forbidden.
       */
      assignmentId: string;
      spaceId: number;
      name: string;
      receiptFile: string;
      created: true;
      replaceDefault?: boolean;
    }
  | {
      schemaVersion: 1;
      /**
       * Reserved property names such as __proto__, prototype, and constructor are forbidden.
       */
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'note';
      /**
       * Reserved property names such as __proto__, prototype, and constructor are forbidden.
       */
      assignmentId?: string;
      category: 'observation' | 'space-deviation' | 'skill-bug' | 'external-change' | 'cleanup';
      spaceIds?: (number | null)[];
      remainingSpaceIds?: number[];
      evidenceFiles?: string[];
    }
  | {
      schemaVersion: 1;
      /**
       * Reserved property names such as __proto__, prototype, and constructor are forbidden.
       */
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'set-limit';
      maxParallelCases: number;
    }
  | {
      schemaVersion: 1;
      /**
       * Reserved property names such as __proto__, prototype, and constructor are forbidden.
       */
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'reconcile';
      /**
       * Reserved property names such as __proto__, prototype, and constructor are forbidden.
       */
      assignmentId: string;
      state: 'running' | 'paused' | 'stop_requested' | 'stopped' | 'completed' | 'failed' | 'lost';
      inFlight: boolean;
      workerId?: string;
      model?: string;
      reasoning?: string;
      evidenceFiles?: string[];
    }
  | {
      schemaVersion: 1;
      /**
       * Reserved property names such as __proto__, prototype, and constructor are forbidden.
       */
      operationId: string;
      expectedRevision: number;
      reason: string;
      kind: 'import';
      packetFile: string;
      review: PacketReview;
      /**
       * Reserved property names such as __proto__, prototype, and constructor are forbidden.
       */
      rebaseOf?: string;
    };

export interface PacketReview {
  decision: 'accept' | 'revise';
  reviewer: string;
  rationale: string;
  record?: PacketRecord;
  /**
   * @minItems 1
   */
  goalAssessments?: GoalAssessment[];
  mode?: 'attempt' | 'final';
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
