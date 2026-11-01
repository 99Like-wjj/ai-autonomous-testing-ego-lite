/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export type ReadingConversationSourceBinding = {
  [k: string]: unknown;
} & {
  sourceId: string;
  evidenceId?: string;
  sourceLabel?: string;
};

export interface RetrospectiveReportContextV9NoBusinessExecution {
  schemaVersion: 9;
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
      inputSummary?: string;
      replySummary?: string;
    }[];
    /**
     * @minItems 1
     */
    sourceLabels: string[];
    /**
     * @minItems 1
     */
    limitations: string[];
    impact?: string;
    dimension?: 'business' | 'interaction' | 'wording' | 'content' | 'presentation';
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
  conversations?: ReadingConversationDeclaration[];
}
export interface ActionRef {
  observationId: string;
  actionId: string;
}
export interface ReadingConversationDeclaration {
  caseId: string;
  goalId: string;
  sourceLabel: string;
  /**
   * @minItems 1
   */
  sourceBindings: ReadingConversationSourceBinding[];
  actions: ReadingConversationActionBinding[];
  /**
   * @minItems 1
   */
  limitations: string[];
}
export interface ReadingConversationActionBinding {
  observationId: string;
  actionId: string;
  /**
   * @minItems 1
   */
  messageIds: string[];
}
