/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

/**
 * All new cases and run files use schemaVersion 3. This is a breaking format update with no v0.1.2 migration.
 */
export interface EgoLiteRunManifestV3 {
  schemaVersion: 3;
  baselineSchemaVersion: 3;
  runId: string;
  projectDir: string;
  baselineSha256: string;
}
