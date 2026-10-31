/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export interface RetrospectiveReportContextV8NoBusinessExecution {
  schemaVersion: 8;
  kind: 'retrospective';
  summary: string;
  /**
   * @minItems 1
   */
  limitations: string[];
  /**
   * @minItems 1
   */
  sources: {
    label: string;
    file: string;
    sha256: string;
  }[];
  /**
   * AI-authored display notes bound to existing goal observations and actual actions. Never new execution, verdicts or plan-derived steps.
   */
  readerNotes?: {
    caseId: string;
    goalId: string;
    title: string;
    description: string;
    focusAction?: ActionRef;
    actions: {
      observationId: string;
      actionId: string;
      title: string;
      result?: string;
      note?: string;
      evidenceIds: string[];
    }[];
    /**
     * @minItems 1
     */
    sourceLabels: string[];
    /**
     * @minItems 1
     */
    limitations: string[];
  }[];
  /**
   * AI-authored retrospective reading notes. They cannot override verdicts or claim new execution.
   */
  goalNotes?: {
    caseId: string;
    goalId: string;
    summary: string;
    preparation: string[];
    reviewSteps: string[];
    /**
     * @minItems 1
     */
    limitations: string[];
    /**
     * @minItems 1
     */
    sourceLabels: string[];
    primaryEvidenceIds: string[];
    evidenceUses: {
      evidenceId: string;
      purpose: string;
      fact: string;
      limitations: string[];
    }[];
  }[];
  supplementalCaseIds: string[];
}
export interface ActionRef {
  observationId: string;
  actionId: string;
}
