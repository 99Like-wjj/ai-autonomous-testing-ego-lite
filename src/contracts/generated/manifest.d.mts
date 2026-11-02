/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export type EgoLiteRunManifestV9 = {
  schemaVersion: 9;
  baselineSchemaVersion: 9;
  runId: string;
  projectDir: string;
  baselineSha256: string;
  executionFile: 'execution.json';
  regressionBindingFile?: 'run-binding.json';
  regressionBindingSha256?: string;
};
