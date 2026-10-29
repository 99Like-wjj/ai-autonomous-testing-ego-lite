/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export interface LocalNetworkEvidenceExportRequestV1 {
  networkVersion: 1;
  query: NetworkQueryV1;
  purpose: string;
  /**
   * @minItems 1
   * @maxItems 200
   */
  selection: {
    captureId: string;
    seq: number;
  }[];
  /**
   * Explicit dot-separated scalar JSON leaf fields. Object/array values and sensitive/unsafe path segments are rejected at runtime.
   *
   * @minItems 1
   * @maxItems 64
   */
  bodyFields?: string[];
}
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
