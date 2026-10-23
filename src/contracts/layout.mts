/** Explicit shipped assets; test tools and real run data never enter this list. */
export const TOOL_VERSION = '0.1.4-dev.1';
export const TOOL_REVISION = 'ts-parallel-1';
export const FORMAT_VERSIONS = { cases: 3, manifest: 4, results: 3, evidence: 3, report: 4, execution: 1, configuration: 1, workerPacket: 1 } as const;
export const runtimeFiles = [
  'scripts/ego.mjs', 'scripts/toolchain.mjs', 'contracts/layout.mjs', 'contracts/ids.mjs', 'contracts/execution-model.mjs', 'contracts/targets.mjs',
  'execution/config.mjs', 'execution/parse.mjs', 'execution/ledger.mjs', 'execution/packets.mjs', 'execution/commands.mjs', 'execution/commit.mjs',
  'core/common.mjs', 'core/cases.mjs', 'core/records.mjs', 'core/validation.mjs',
  'report/render.mjs', 'report/delivery.mjs', 'report/execution-view.mjs', 'report/legacy.mjs', 'report-ui/main.js', 'LICENSE',
  'schemas/common.schema.json', 'schemas/cases.schema.json', 'schemas/manifest.schema.json',
  'schemas/evidence.schema.json', 'schemas/evidence-request.schema.json',
  'schemas/results.schema.json', 'schemas/record-request.schema.json',
  'schemas/report.schema.json', 'schemas/report-context.schema.json',
  'schemas/execution-config.schema.json', 'schemas/execution-request.schema.json', 'schemas/execution.schema.json', 'schemas/worker-packet.schema.json', 'schemas/worker-draft.schema.json',
  'schemas/manifest-v3.schema.json', 'schemas/manifest-v4.schema.json', 'schemas/report-v3.schema.json', 'schemas/report-v4.schema.json',
  'docs/asset-formats.md', 'docs/asset-formats.en.md',
  'examples/cases.example.json', 'examples/generated-cases.example.json',
  'examples/evidence-request.example.json', 'examples/record-request.example.json',
  'examples/project.example/brief.md', 'examples/project.example/feature-request.md', 'examples/project.example/usage.md'
];
export const referenceNames = ['case-authoring', 'ego-usage-boundaries', 'evidence-and-report', 'judgment-and-diagnosis', 'local-toolbox', 'local-toolbox.en', 'test-strategy', 'parallel-testing'];
