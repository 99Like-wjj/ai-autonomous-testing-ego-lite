/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export type UsageSummaryV1 =
  | {
      usageSummaryVersion: 1;
      sources: {
        total: number;
        truncated: boolean;
        items: {
          id: string;
          kind: 'host_export' | 'provider_export' | 'operator_normalized';
          locator: string;
          sha256?: string | null;
          completeness: 'complete' | 'partial' | 'unknown';
          start?: string | null;
          end?: string | null;
        }[];
      };
      duplicateCount: number;
      modelRequests: number;
      toolEvents: number;
      tokens: {
        inputTokens: {
          knownSum: number | null;
          knownCount: number;
          unknownCount: number;
          complete: boolean;
        };
        cachedInputTokens: {
          knownSum: number | null;
          knownCount: number;
          unknownCount: number;
          complete: boolean;
        };
        cacheWriteInputTokens: {
          knownSum: number | null;
          knownCount: number;
          unknownCount: number;
          complete: boolean;
        };
        outputTokens: {
          knownSum: number | null;
          knownCount: number;
          unknownCount: number;
          complete: boolean;
        };
        reasoningOutputTokens: {
          knownSum: number | null;
          knownCount: number;
          unknownCount: number;
          complete: boolean;
        };
        totalTokens: {
          knownSum: number | null;
          knownCount: number;
          unknownCount: number;
          complete: boolean;
        };
      };
      noncachedInputTokens: {
        knownSum: number | null;
        knownCount: number;
        unknownCount: number;
        complete: boolean;
      };
      durationMs: {
        knownSum: number | null;
        knownCount: number;
        unknownCount: number;
        complete: boolean;
      };
      outputBytes: {
        knownSum: number | null;
        knownCount: number;
        unknownCount: number;
        complete: boolean;
      };
      truncated: {
        knownSum: number | null;
        knownCount: number;
        unknownCount: number;
        complete: boolean;
      };
      inputDistribution: {
        knownCount: number;
        unknownCount: number;
        mean: number | null;
        median: number | null;
        p90: number | null;
        max: number | null;
      };
      purposes: {
        purpose: 'model' | 'compaction' | 'unknown';
        modelRequests: number;
        toolEvents: number;
        tokens: {
          inputTokens: {
            knownSum: number | null;
            knownCount: number;
            unknownCount: number;
            complete: boolean;
          };
          cachedInputTokens: {
            knownSum: number | null;
            knownCount: number;
            unknownCount: number;
            complete: boolean;
          };
          cacheWriteInputTokens: {
            knownSum: number | null;
            knownCount: number;
            unknownCount: number;
            complete: boolean;
          };
          outputTokens: {
            knownSum: number | null;
            knownCount: number;
            unknownCount: number;
            complete: boolean;
          };
          reasoningOutputTokens: {
            knownSum: number | null;
            knownCount: number;
            unknownCount: number;
            complete: boolean;
          };
          totalTokens: {
            knownSum: number | null;
            knownCount: number;
            unknownCount: number;
            complete: boolean;
          };
        };
        noncachedInputTokens: {
          knownSum: number | null;
          knownCount: number;
          unknownCount: number;
          complete: boolean;
        };
        durationMs: {
          knownSum: number | null;
          knownCount: number;
          unknownCount: number;
          complete: boolean;
        };
        outputBytes: {
          knownSum: number | null;
          knownCount: number;
          unknownCount: number;
          complete: boolean;
        };
        truncated: {
          knownSum: number | null;
          knownCount: number;
          unknownCount: number;
          complete: boolean;
        };
      }[];
      attribution: {
        unattributed: number;
        stages: {
          additive: false;
          total: number;
          truncated: boolean;
          items: {
            id: string;
            modelRequests: number;
            toolEvents: number;
            tokens: {
              inputTokens: {
                knownSum: number | null;
                knownCount: number;
                unknownCount: number;
                complete: boolean;
              };
              cachedInputTokens: {
                knownSum: number | null;
                knownCount: number;
                unknownCount: number;
                complete: boolean;
              };
              cacheWriteInputTokens: {
                knownSum: number | null;
                knownCount: number;
                unknownCount: number;
                complete: boolean;
              };
              outputTokens: {
                knownSum: number | null;
                knownCount: number;
                unknownCount: number;
                complete: boolean;
              };
              reasoningOutputTokens: {
                knownSum: number | null;
                knownCount: number;
                unknownCount: number;
                complete: boolean;
              };
              totalTokens: {
                knownSum: number | null;
                knownCount: number;
                unknownCount: number;
                complete: boolean;
              };
            };
            noncachedInputTokens: {
              knownSum: number | null;
              knownCount: number;
              unknownCount: number;
              complete: boolean;
            };
            durationMs: {
              knownSum: number | null;
              knownCount: number;
              unknownCount: number;
              complete: boolean;
            };
            outputBytes: {
              knownSum: number | null;
              knownCount: number;
              unknownCount: number;
              complete: boolean;
            };
            truncated: {
              knownSum: number | null;
              knownCount: number;
              unknownCount: number;
              complete: boolean;
            };
          }[];
        };
        points: {
          additive: false;
          total: number;
          truncated: boolean;
          items: {
            id: string;
            modelRequests: number;
            toolEvents: number;
            tokens: {
              inputTokens: {
                knownSum: number | null;
                knownCount: number;
                unknownCount: number;
                complete: boolean;
              };
              cachedInputTokens: {
                knownSum: number | null;
                knownCount: number;
                unknownCount: number;
                complete: boolean;
              };
              cacheWriteInputTokens: {
                knownSum: number | null;
                knownCount: number;
                unknownCount: number;
                complete: boolean;
              };
              outputTokens: {
                knownSum: number | null;
                knownCount: number;
                unknownCount: number;
                complete: boolean;
              };
              reasoningOutputTokens: {
                knownSum: number | null;
                knownCount: number;
                unknownCount: number;
                complete: boolean;
              };
              totalTokens: {
                knownSum: number | null;
                knownCount: number;
                unknownCount: number;
                complete: boolean;
              };
            };
            noncachedInputTokens: {
              knownSum: number | null;
              knownCount: number;
              unknownCount: number;
              complete: boolean;
            };
            durationMs: {
              knownSum: number | null;
              knownCount: number;
              unknownCount: number;
              complete: boolean;
            };
            outputBytes: {
              knownSum: number | null;
              knownCount: number;
              unknownCount: number;
              complete: boolean;
            };
            truncated: {
              knownSum: number | null;
              knownCount: number;
              unknownCount: number;
              complete: boolean;
            };
          }[];
        };
      };
      limitations: string[];
      coverage: {
        sourceComplete: boolean;
        modelData: 'supplied' | 'not_supplied';
        toolData: 'supplied' | 'not_supplied';
      };
      input?: {
        file: string;
        sha256: string;
        bytes: number;
      };
    }
  | {
      usageSummaryVersion: 1;
      outputFile: string;
      sha256: string;
      bytes: number;
      input: {
        file: string;
        sha256: string;
        bytes: number;
      };
      businessExecuted: false;
    };
