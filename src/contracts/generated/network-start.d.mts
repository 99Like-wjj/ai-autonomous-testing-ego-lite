/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export interface NetworkStartV1 {
  networkVersion: 1;
  spaceId: number;
  /**
   * @minItems 1
   * @maxItems 16
   */
  pages: {
    label: string;
    targetId: string;
    /**
     * @minItems 1
     * @maxItems 16
     *
     * Items: Exact authorized HTTP(S) origin, no path, credentials, query or fragment.
     */
    origins: string[];
  }[];
  /**
   * @minItems 1
   * @maxItems 32
   */
  interfaces: {
    origin: string;
    /**
     * @minItems 1
     * @maxItems 32
     *
     * Items: Absolute path prefix with a segment boundary; /api also matches /api/items but not /api2.
     */
    pathPrefixes: string[];
  }[];
  policy?: {
    bodies?: 'redact' | 'omit';
    /**
     * Explicit dotted allowed JSON fields. Non-JSON content is omitted when this list is used. Sensitive and prototype fields are forbidden.
     */
    jsonFields?: null | string[];
    /**
     * Allowed necessary response/request headers; credential headers are always forbidden.
     *
     * @maxItems 32
     */
    headers?: string[];
    /**
     * Opaque binary cannot be generically redacted; use omit for strict content policies.
     */
    wsBinary?: 'include' | 'omit';
  };
  limits?: {
    maxBodyBytes?: number;
    /**
     * Run capture budget including earlier captures. History is never rotated/deleted.
     */
    maxDiskBytes?: number;
    maxQueueEvents?: number;
    maxQueueBytes?: number;
    maxTrackedRequests?: number;
    maxQueryBytes?: number;
    pollMs?: number;
    commandTimeoutMs?: number;
    startupTimeoutMs?: number;
  };
}
