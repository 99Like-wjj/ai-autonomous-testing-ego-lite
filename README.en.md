<p align="center"><img src="docs/images/hero.png" alt="AI autonomous Web testing with Ego Lite" width="100%"></p>

<h1 align="center">AI Autonomous Testing with Ego Lite</h1>

<p align="center"><strong>English</strong> · <a href="README.md">简体中文</a></p>

**An AI-led Web testing Skill for first delivery and regression.** The current AI session interprets trusted requirements, designs independently assessable business goals, explores through Ego Lite and judges actual outcomes using evidence. Users may provide existing cases or requirements. Methods remain flexible; goals, necessary semantics and authorization do not.

## Current release

The development candidate is **0.1.7-rc.1 / report-step-evidence-1**, in cloud integration and human-review preparation, still unreleased. It integrates whole-scope resource clarification, first-run records, immutable task/rule revisions, whole-scenario status reruns, full declared scope and scheme-B report reading. Main contracts are v8, regressionVersion 1 and networkVersion 1. Scheme B places the issue/result and original expectation above actual steps and selected evidence, with independent nested scope disclosures. See [scheme B](docs/v0.1.7-step-evidence.md), [resource-readiness validation](docs/v0.1.7-resource-readiness-validation.md), [regression-reuse validation](docs/v0.1.7-regression-reuse-validation.md) and [local closeout (Chinese)](docs/v0.1.7-local-closeout.md).

**0.1.6 / native-network-observation-1**. Download the complete package and checksums from [v0.1.6](https://github.com/99Like-wjj/ai-autonomous-testing-ego-lite/releases/tag/v0.1.6). The maintainer reported a usable local trial with one requirements document; this is not broad acceptance across products, models or hosts. See [validation](docs/testing.en.md). Builds do not update installed Skills.


Invoke `$ai-autonomous-testing-ego-lite`. Complete packages include Skill guidance, compiled Node ESM tools, schemas, examples and an integrity manifest. Source is TypeScript; installed use requires Node.js >=22.

See the [cloud integration review](docs/v0.1.7-cloud-review.md) for branch ancestry and review scope. All four branch heads are already included in the latest baseline; no duplicate merge is needed. Main, Tags and Releases remain unchanged until explicit human approval.

## Version evolution

![Latest four versions: v0.1.4–v0.1.6 released; v0.1.7 is an unreleased candidate. Capability illustration only.](docs/images/readme-version-history.png)

README shows the current version plus three previous versions. v0.1.7 is explicitly marked as a candidate; v0.1.4–v0.1.6 are released. [Full version history](docs/version-history.en.md) retains older releases. Hero, workflow, architecture, concurrency and report illustrations now describe the candidate, not real test evidence. v0.1.8 remains requirements planning.

## First-run records and two regression modes

The AI preserves normative sources, actual observations, failures and incomplete work, then authors project-specific reusable tasks. Select one or more formal goal statuses from a fixed source run to rerun each matching whole scenario, or select the complete declared scope. Missing tasks and blocked goals remain visible.

Task definition, current resources/authorization and business verdicts are separate. Every regression creates an independent run with frozen task/rule revisions and selection. Unknown side effects require read-only reconciliation, not automatic replay. Comparisons expose conditions and AI comparability reasoning without automatically blaming a newer release.

Local tools only perform data transactions and explicit selection; the current AI owns task authoring and execution. See [regression assets and binding](docs/regression-reuse.md). Main contracts are v8 and regressionVersion is 1. Existing v5/v6/v7 data remains untouched and is not automatically migrated. The report enhancements are included.

## Capabilities delivered in v0.1.6

v0.1.6 delivered more than experience documentation: goal assessment, unified serial/parallel records, native network observation and the linked CLI/host handoff fix. The current candidate continues these capabilities. v0.1.6 used schema v5; the current v0.1.7 v8 contract is not attributed retroactively to that release.

- Stage-specific design and execution experience: concise stable indexes and concrete scenarios for prerequisites, data relationships, boundaries/roles, unknown submissions, drag/download, asynchronous observations and recovery risks. Navigation checks and semantic exercises support human-maintained, read-only guidance; there is no RAG, automatic learning or fixed business route.

- Cases group related workflows; source-backed goals hold independently assessable expectations. Steps, conditions and paths retain necessary semantics without becoming extra business goals.
- Serial record and reviewed worker import write the same observations/assessments/entries. Serial reporting does not require fabricated assignments or packets.
- Four explicit outcomes are verified, violation, inconclusive and not_tested. Missing assessments are visibly separate recording gaps, never defaulted to inconclusive.
- Outcomes and causes are separate. Sufficient evidence of a violation can coexist with an unknown cause; uncertainty about the actual action or result is stated specifically.
- Parent scenarios show goal distributions. final updates submitted goals incrementally; attempt preserves history. Follow-up links do not overwrite original anomalies or old conclusions.
- Scoped native network observation records authorized Fetch/XHR, SSE and WebSocket content in a separate Ego context, with queries, content/capacity handling, stop and handoff. It never replays business requests or treats HTTP success as business acceptance.
- The linked CLI entrypoint executes correctly. Host guidance covers real workers, accessible context, permissions, in-flight handles, total active capacity and run-wide packet identifiers. No fixed host dispatcher or general live-host acceptance is implied.

See the source-backed records for [experience development and expansion](docs/v0.1.6-development-validation.md), [goal assessment](docs/v0.1.6-goal-assessment-validation.md), [network observation](docs/v0.1.6-network-validation.md), [host-fix integration](docs/v0.1.6-cross-host-integration.md) and [release closeout](docs/v0.1.6-release-validation.md). Engineering checks, synthetic exercises, isolated browser observations and the owner's single local trial keep their separate validation limits.

All current test-asset JSON contracts use **schemaVersion 8**, and execution query viewVersion is 8. Older formats are explicitly rejected, without readers or converters. Keep historical reports, files and runs unchanged; prepare new v8 assets from original sources instead of changing only version fields. See [formats](docs/asset-formats.en.md).

## Cases, evidence and delivery

![AI adapts the method while preserving business goals and four explicit outcomes.](docs/images/workflow.png)

Before freezing, the AI maps each expectation to sources, prerequisites, actions and observation methods. Different role/data dependencies can be assessed separately without dropping workflow dependencies. Acceptance ambiguity belongs to goal.clarificationQuestions; actual resource and authorization gaps require real clarification. User-deferred goals remain visible. Do not expand acceptance scope after execution to justify a result.

Successful tool calls do not prove business success. Key UI findings require real screenshots, with AI-selected capture timing. DOM, logs and action receipts supplement images. Submission, drag, context and download uncertainty can benefit from targeted observations; capabilities must be verified against the current Ego version. A method name or timeout is not proof of a browser defect.

Default deliverables are standalone HTML, JSON and Markdown from one result projection. Reports expose expectations, observations, evidence, gaps, diagnosis and history. Screenshot gaps, record completeness and file integrity remain distinct. Hash consistency does not establish business correctness; file verification and actual browser opening are separate.

Scheme B retains every goal entrance in a scene and focuses on one goal at a time. The issue/result and full original expectation lead, actual steps occupy the middle and selected evidence appears alongside them. The directory starts/resets collapsed and filters preserve the selection. Scope notes show three items before an outer disclosure; exact task/rule details stay independently collapsed inside. Pending actions use Chinese business descriptions. Sourced readerNotes organize existing actions and evidence without inventing execution or overriding verdicts; shared material and missing step evidence are explicit. Original records/history and old reports remain intact under v8. See [the current reader design](docs/v0.1.7-step-evidence.md) and [the preceding reader revision](docs/v0.1.7-reader-review.md). Builds do not update the installed Skill.

Network observation implements the v3 design through network start/status/query/stop: a dedicated native context records scoped Fetch/XHR, SSE and WebSocket evidence; the AI chooses queries, evidence and business judgments. It never replays business requests. Network data uses independent networkVersion 1, while current business contracts use v8 and v5 historical runs remain untouched. See [observation guidance (Chinese)](skills/ai-autonomous-testing-ego-lite/references/network-observation.md).

![Illustrative evidence presentation, not a real test report.](docs/images/result-specimen.png)

## Quick start on Windows

This source example targets the current development candidate in .build/runtime, without replacing the user installation. Verify a released installation against its actual version and revision.

Prepare Ego and the official ego-browser Skill using the [official guide](https://lite.ego.app/document/en/docs/windows/quick-start). This project does not install or replace Ego. Case design alone requires no browser connection.

From the confirmed source root:

```powershell
npm ci
npm run build
$Tool = Join-Path (Get-Location).Path '.build/runtime/scripts/ego.mjs'
node $Tool tool-info --expect-version 0.1.7-rc.1 --expect-revision report-step-evidence-1
$LocalRoot = Join-Path $env:LOCALAPPDATA 'EgoLiteTest'
New-Item -ItemType Directory -Force -Path $LocalRoot | Out-Null
$Project = Join-Path $LocalRoot ('project-' + [guid]::NewGuid().ToString('N'))
node $Tool init --project-dir $Project
```

For a complete installed package, use scripts/ego.mjs under the actual loaded Skill root. Keep real assets outside source control. Review the generated example against trusted requirements before freezing:

```powershell
$Cases = Join-Path $Project 'cases.example.json'
$Run = Join-Path $LocalRoot ('run-' + [guid]::NewGuid().ToString('N'))
node $Tool validate-cases --cases $Cases
node $Tool start --project-dir $Project --cases $Cases --output-dir $Run
```

start creates local assets, not browser actions. Use the [toolbox guide](skills/ai-autonomous-testing-ego-lite/references/local-toolbox.en.md) and [synthetic requests](examples/record-request.example.json) to register evidence and goal assessments. Unique operation IDs and revisions protect data transactions; replaying a request recovers its receipt, not a business action.

```text
node ABS_TOOL evidence-add --run-dir ABS_RUN --request ABS_EVIDENCE_REQUEST
node ABS_TOOL record --run-dir ABS_RUN --request ABS_RECORD_REQUEST
node ABS_TOOL progress --run-dir ABS_RUN
node ABS_TOOL check --run-dir ABS_RUN
node ABS_TOOL report --run-dir ABS_RUN
node ABS_TOOL verify-report --run-dir ABS_RUN --report-dir ABS_REPORT_DIR
```

Reports refuse overwrite; use a new directory for later reports. browserOpen:not_checked is not a browser validation claim. Open and inspect the actual HTML through Ego before claiming that validation. Examples contain fictional data only.

## Responsibilities and limits

![AI decides, Ego operates, and the toolbox records evidence and generates reports.](docs/images/architecture.png)

The diagram summarizes responsibilities; v0.1.6 also includes the scoped native network collector described below.

AI owns planning, authorized operation and judgment. Ego supplies supported browser primitives. Local tools own freezing, records, references, revisions, evidence-file checks and reports; they do not call models, decide bugs or retry business writes. Network observation starts a scoped Ego native collector; business UI actions remain AI-driven. Space separation is not account/backend isolation. File transactions are not a general multi-file or power-loss guarantee. Registration does not redact evidence. Keep credentials, real sites, screenshots and run data private and outside the repository; do not auto-upload reports. See [privacy](docs/privacy.md).

## Further reading

- [Full version history](docs/version-history.en.md), [historical requirements](docs/requirements.md), [v0.1.5 naming and upgrade history (Chinese)](docs/rename-upgrade.md)
- [Design experience](skills/ai-autonomous-testing-ego-lite/references/case-design-guide.md), [execution experience](skills/ai-autonomous-testing-ego-lite/references/experience-guide.md), [network observation](skills/ai-autonomous-testing-ego-lite/references/network-observation.md) (Chinese)

- [Skill](skills/ai-autonomous-testing-ego-lite/SKILL.md), [case design](skills/ai-autonomous-testing-ego-lite/references/case-authoring.md), [judgment](skills/ai-autonomous-testing-ego-lite/references/judgment-and-diagnosis.md)
- [Architecture](docs/architecture.en.md), [formats](docs/asset-formats.en.md), [validation](docs/testing.en.md), [changelog](CHANGELOG.md)
- [Cases](examples/cases.example.json), [evidence requests](examples/evidence-request.example.json), [result requests](examples/record-request.example.json)

## Feedback and contact

Report bugs or suggest improvements through [GitHub Issues](https://github.com/99Like-wjj/ai-autonomous-testing-ego-lite/issues) or the contacts below. Include the version, reproduction steps, and redacted errors or screenshots. Do not submit passwords, tokens, keys, or confidential company information.

- Author: [99Like-wjj](https://github.com/99Like-wjj)
- Email: [wjj990517@gmail.com](mailto:wjj990517@gmail.com)
- WeChat: A2326543144

  <img src="docs/images/wechat-contact-qr.png" alt="Author's WeChat contact QR code" width="240">
- QQ: 2326543144
- X: [@99Like_ovo](https://x.com/99Like_ovo)

## License

Original code and documentation in this repository are licensed under the [MIT License](LICENSE), copyright 2026 99Like-wjj. This license does not cover Ego, Ego's official browser, or other third-party software; their own licenses and official terms continue to apply. This is an independent project, not affiliated with or endorsed by Ego. The source is available under the MIT License. Development is ongoing; refer to each release's notes for its capabilities and validation scope.

## Configurable concurrency

![Independent workers capture evidence; the coordinator reviews and imports their packets.](docs/images/parallel.svg)

Repair commit 8e6e2d9 is integrated while retaining v8 goal assessment and the API-monitoring design. Hosts own real workers, context, permissions, waiting and cleanup; this package adds no fixed host dispatcher. Read [host conditions and handoff (Chinese)](skills/ai-autonomous-testing-ego-lite/references/host-compatibility.md). Codex uses $ai-autonomous-testing-ego-lite; Claude Code uses /ai-autonomous-testing-ego-lite. Complete live host workflows still need separate acceptance. See the [integration record](docs/v0.1.6-cross-host-integration.md).

The default is **1 (serial)**. Without a user request for concurrency or an explicit setting, execute cases one at a time. Set `start --max-parallel-cases N` or project execution-config.json to opt in; N is a positive safe integer with no fixed 2/4/8 product ceiling. The AI chooses tool calls, batches and worker use within that limit; it need not fill all slots. Host limits are recorded only when explicitly available, otherwise unknown. No automatic host probing or global configuration changes occur. Workers seal local packets; the coordinator reviews and imports them. See the [parallel guide](skills/ai-autonomous-testing-ego-lite/references/parallel-testing.md). npm test builds and tests emitted JS; npm run check:public checks publishable source assets.

## v0.1.8 requirements preview: testing quality, not implemented

First-run testing, failed-scope reruns and report review exposed candidate-task/data review costs, wider whole-scenario selection and imprecise step/evidence associations. The next requirements target those testing-quality gaps:

- Stable IDs for every minimum independently assessable test point across all four outcomes. IDs persist across runs, separately from revisions and attempts; users can request a point rerun by ID while retaining required dependencies. IDs are not reserved for bugs.
- Separate original-defect recurrence, new findings and goal outcomes. Full regression checks a current confirmed target inventory, retaining new, blocked, unorganized and unassessed scope.
- Precise action/input/readback/evidence links at record time, explicit data parameters and reusable Ego operation fragments selected by AI under stated conditions.
- Auditable available usage and time by run/point/phase, with unavailable tokens marked missing. Do not infer savings from target counts. Preserve coverage, judgment, evidence, authorization and completion evaluation work.

See the [v0.1.8 requirements and background](docs/v0.1.8-preview.en.md). Identifier, dependency, parameter and usage designs require review before development. Software/contracts remain unchanged; the [v0.1.7 preview](docs/v0.1.7-preview.md) remains historical rather than a claim that all quality-evaluation work shipped.

The existing diagrams retain the last released capability overview. Development candidates are not included in the four-release timeline; current v8 action facts and regression contracts are described in the documentation.

The earlier integrated baseline is `feat/v0.1.7-report-resource-regression`; see [its validation](docs/v0.1.7-integration.md). Local reader closeout is on `fix/v0.1.7-report-reader-review`, retaining that baseline and scheme B. Software remains 0.1.7-rc.1, not merged into main or released. Phase-specific validation and original evidence stay intact. This review does not merge/release branches or produce a downloadable package.

The report reader retains eight themes, readable evidence bodies, inline/bundle delivery, image context and explicit content gaps.
