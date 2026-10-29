/** Explicit shipped assets; test tools and real run data never enter this list. */
export const TOOL_VERSION = '0.1.7-rc.1';
export const TOOL_REVISION = 'report-usability-1';
export const FORMAT_VERSIONS = { cases: 7, manifest: 7, results: 7, evidence: 7, report: 7, execution: 7, configuration: 7, workerPacket: 7, executionRead: 7 } as const;
export const runtimeFiles = [
  'scripts/ego.mjs', 'scripts/toolchain.mjs', 'contracts/layout.mjs', 'contracts/ids.mjs', 'contracts/execution-model.mjs', 'contracts/targets.mjs',
  'execution/config.mjs', 'execution/parse.mjs', 'execution/ledger.mjs', 'execution/packets.mjs', 'execution/commands.mjs', 'execution/commit.mjs', 'execution/views.mjs', 'execution/read-context.mjs',
  'core/common.mjs', 'core/baseline.mjs', 'core/file-integrity.mjs', 'core/cases.mjs', 'core/records.mjs', 'core/validation.mjs',
  'observation/model.mjs', 'observation/policy.mjs', 'observation/stream.mjs', 'observation/store.mjs',
  'observation/native.mjs', 'observation/recorder.mjs', 'observation/collector.mjs', 'observation/query.mjs', 'observation/commands.mjs', 'observation/evidence-export.mjs', 'scripts/network-launcher.mjs',
  'report/render.mjs', 'report/assets.mjs', 'report/delivery.mjs', 'report/execution-view.mjs', 'report/shell.mjs', 'report/themes.mjs', 'report-ui/main.js', 'LICENSE',
  'schemas/common.schema.json', 'schemas/cases.schema.json', 'schemas/manifest.schema.json',
  'schemas/evidence.schema.json', 'schemas/evidence-request.schema.json',
  'schemas/results.schema.json', 'schemas/record-request.schema.json',
  'schemas/network-start.schema.json', 'schemas/network-query.schema.json', 'schemas/network-evidence-export.schema.json',
  'schemas/report.schema.json', 'schemas/report-context.schema.json',
  'schemas/execution-config.schema.json', 'schemas/execution-request.schema.json', 'schemas/execution.schema.json', 'schemas/worker-packet.schema.json', 'schemas/worker-draft.schema.json', 'schemas/execution-read.schema.json',
  'docs/rename-upgrade.md', 'docs/asset-formats.md', 'docs/asset-formats.en.md',
  'docs/v0.1.6-goal-assessment-validation.md', 'docs/v0.1.6-release-validation.md', 'docs/v0.1.7-preview.md', 'docs/v0.1.7-report-design.md', 'docs/v0.1.7-validation.md',
  'docs/version-history.md', 'docs/version-history.en.md', 'docs/v0.1.5-local-acceptance.md',
  'docs/images/readme-version-history.svg', 'docs/images/readme-version-history.zh-CN.svg',
  'docs/images/readme-version-history.png', 'docs/images/readme-version-history.zh-CN.png',
  'docs/images/version-history.svg', 'docs/images/version-history.zh-CN.svg',
  'docs/images/version-history.png', 'docs/images/version-history.zh-CN.png',
  'examples/cases.example.json', 'examples/generated-cases.example.json',
  'examples/evidence-request.example.json', 'examples/record-request.example.json',
  'examples/project.example/brief.md', 'examples/project.example/feature-request.md', 'examples/project.example/usage.md'
];
export const referenceNames = ['case-authoring', 'case-design-guide', 'case-design-methods', 'experience-guide', 'experience-data-safety', 'experience-execution', 'ego-usage-boundaries', 'evidence-and-report', 'judgment-and-diagnosis', 'local-toolbox', 'local-toolbox.en', 'test-strategy', 'parallel-testing', 'host-compatibility', 'resource-readiness', 'network-observation'];
