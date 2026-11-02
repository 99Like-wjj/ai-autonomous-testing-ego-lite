/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export type ConversationMessage = (
  | {
      content?: string;
    }
  | {
      /**
       * @minItems 1
       */
      attachmentSourceIds: string[];
    }
) & {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'notice';
  displayName?: string;
  format: 'text' | 'markdown' | 'json' | 'code';
  content: string;
  language?: string;
  presentation: 'verbatim' | 'normalized' | 'summary';
  completeness: 'complete' | 'partial' | 'unknown';
  state: 'final' | 'streaming' | 'interrupted' | 'waiting_confirmation' | 'unknown';
  completionBasis: string;
  /**
   * @minItems 1
   * @maxItems 32
   */
  sourceRefs: ConversationSourceReference[];
  attachmentSourceIds?: string[];
  sentAt?: string;
  observedAt?: string;
  displayTime?: string;
  limitations: string[];
};

export interface ConversationEvidenceV1 {
  conversationVersion: 1;
  id: string;
  title: string;
  /**
   * @minItems 1
   * @maxItems 1000
   */
  messages: ConversationMessage[];
  limitations: string[];
}
export interface ConversationSourceReference {
  sourceId: string;
  jsonPointer?: string;
  quote?: string;
}
