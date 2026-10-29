/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export interface NetworkQueryV1 {
  networkVersion: 1;
  /**
   * @maxItems 128
   */
  captureIds?: string[];
  page?: string;
  path?: string;
  urlContains?: string;
  method?: string;
  status?: number;
  errorsOnly?: boolean;
  requestKey?: string;
  kind?: string;
  direction?: 'sent' | 'received';
  /**
   * UTC receivedAt inclusive lower bound.
   */
  after?: string;
  /**
   * UTC receivedAt inclusive upper bound.
   */
  before?: string;
  limit?: number;
  scanLimit?: number;
  includeBodies?: boolean;
  /**
   * Position in the stored encoded JavaScript string.
   */
  bodyOffset?: number;
  bodyLimit?: number;
  /**
   * Opaque snapshot continuation, with identical query parameters.
   */
  cursor?: string;
}
