/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export type EgoLiteRunManifestV8 = {
  schemaVersion: 8;
  baselineSchemaVersion: 8;
  runId: string;
  projectDir: string;
  baselineSha256: string;
  executionFile: 'execution.json';
  regressionBindingFile?: 'regression-binding.json';
  regressionBindingSha256?: string;
};
