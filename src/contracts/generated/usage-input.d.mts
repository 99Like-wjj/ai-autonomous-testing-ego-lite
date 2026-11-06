/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export interface ExplicitLocalUsageExportV1 {
  usageVersion: 1;
  /**
   * @maxItems 1000
   */
  sources: {
    id: string;
    kind: 'host_export' | 'provider_export' | 'operator_normalized';
    locator: string;
    sha256?: string | null;
    completeness: 'complete' | 'partial' | 'unknown';
    start?: string | null;
    end?: string | null;
  }[];
  /**
   * @maxItems 100000
   */
  records: (
    | {
        kind: 'model';
        responseId: string;
        purpose?: 'model' | 'compaction' | 'unknown';
        sourceId: string;
        timestamp?: string | null;
        attribution?: {
          runId?: string | null;
          pointIds?: string[];
          stage?: string | null;
          operationId?: string | null;
          basis?: string | null;
        };
        inputTokens?: number | null;
        cachedInputTokens?: number | null;
        cacheWriteInputTokens?: number | null;
        outputTokens?: number | null;
        reasoningOutputTokens?: number | null;
        totalTokens?: number | null;
      }
    | {
        kind: 'tool';
        eventId: string;
        toolName: string;
        sourceId: string;
        timestamp?: string | null;
        attribution?: {
          runId?: string | null;
          pointIds?: string[];
          stage?: string | null;
          operationId?: string | null;
          basis?: string | null;
        };
        durationMs?: number | null;
        outputBytes?: number | null;
        truncated?: boolean | null;
      }
  )[];
}
