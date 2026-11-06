/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export interface CLIRecordResponseV1 {
  recordResponseVersion: 1;
  committed: true;
  receipt: {
    operationId: string;
    revision: number;
    caseId: string;
    mode: 'attempt' | 'final';
    replayed: boolean;
  };
  feedback: {
    status: 'available' | 'unavailable' | 'disabled';
    asOfResultsRevision: number;
    scope: 'commit_prefix_without_retrospective_notes';
    affectedPointIds: string[];
    caseUnassessedCount: number | null;
    hints: {
      caseId: string;
      goalId: string;
      pointId: string;
      code:
        'missing_reading' | 'repeated_reading' | 'phase_mismatch' | 'missing_input_summary' | 'missing_reply_summary';
      observationId: string | null;
      actionId: string | null;
    }[];
    total: number | null;
    truncated: boolean;
    reasonCode?: 'FEEDBACK_UNAVAILABLE';
  };
}
