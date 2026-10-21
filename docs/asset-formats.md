# Test asset contracts (v1)

[中文](asset-formats.zh-CN.md)

These formats stabilize AI input and output without prescribing test steps, a fixed DAG, business-specific behavior, or a hidden acceptance benchmark. AI still chooses actions and evaluates observations against the actual requirements. The local helper only records and checks structure; it does not run the browser or decide whether the product works.

## Human source material and normalized exchange

Users can supply requirements as Markdown, CSV, text, tickets, or other readable business documents. They do not need to hand-author JSON. The AI reads those sources, identifies ambiguities, and normalizes the agreed scope into the case contract. Preserve a meaningful source locator and the actual requirement text. Conflicting or missing requirements are questions, not permission to invent acceptance criteria.

JSON is the machine exchange format. Files use UTF-8 JSON and schemaVersion: 1. The JSON Schema files in ../schemas use draft 2020-12 and local relative references; load the full directory together. The helper implements its checks directly, without loading these schemas. Do not add a $schema property to asset instances: the closed contracts reject unknown keys. Configure the schema in your editor or validator instead.

## Assets and ownership

- cases.json: prepared case input, validated by cases.schema.json. The name is conventional; start accepts any explicit input file path.
- baseline.json: normalized, frozen cases written by start, with the same schema. Do not edit it to fit observed behavior.
- manifest.json: generated run identity, absolute projectDir, and baselineSha256, validated by manifest.schema.json. The digest covers the exact baseline file bytes, including whitespace. It detects accidental changes, not adversarial tampering.
- results.json: operator-recorded observations and outcomes, validated by results.schema.json. start creates one not_run entry for every baseline case.
- evidence.json: evidence catalog, validated by evidence.schema.json. start creates an empty catalog.
- evidence/: actual run-local evidence files. A catalog entry is not itself proof of the recorded behavior.
- report.json and report.md: generated review artifacts. report.json follows report.schema.json; Markdown is the human-readable rendering, not another source of verdicts. report refuses to overwrite existing reports.
- common.schema.json: reusable schema definitions, not a standalone run asset.

Store real project inputs, runs, reports and evidence outside the distributable skill repository. Use synthetic .example assets in the repository, placeholder domains such as app.example, and no real secrets, identities, account data or sensitive screenshots. Examples illustrate syntax only; their text is not a normative test requirement.

## Cases: preserve intent, not a click script

Each case requires:

- id: nonblank stable identifier, unique within the case list.
- title: nonblank short description.
- basis: exactly kind, source, text. kind is explicit, interpretation or hypothesis; source and text are nonblank. explicit means a cited actual requirement, not merely confident AI phrasing.
- criticalConditions: an array of nonblank strings describing material roles, inputs, initial state or other prerequisites; an empty array is allowed.
- expected: nonblank observable expected behavior, not a claim that it already happened.
- requiredPath: null when no path is mandated, or nonblank text describing a genuinely required route. It is not a filesystem path and must not be invented just to constrain the agent.

The root requires schemaVersion, project (nonblank), and a nonempty cases array. Unknown fields at root, case and basis levels are rejected, rather than silently dropped. Keep optional background in the original source document, or deliberately revise the contract if a new field is needed.

## Results and attempts

Every result requires id and an unchanged copy of its baseline basis, plus status, observed, rationale, remainingQuestions and evidence. Only cause and attempts are optional. Unknown fields are rejected.

- status: pass, fail, inconclusive, blocked or not_run.
- observed: actual observed behavior, separately from expected behavior.
- rationale: why those observations support this recorded status and what they do not establish.
- remainingQuestions: array of nonblank questions; use [] when none are recorded. An empty array is not proof that uncertainty was resolved.
- evidence: array of relative evidence file paths, not catalog IDs or external URLs.
- cause: product_candidate, agent, environment, spec or unknown. A candidate product issue is not a confirmed root cause. Omitted cause is displayed as unknown.
- attempts: chronological records preserving prior observations, including initial failures. Each attempt has status, observed, rationale, remainingQuestions and evidence, with optional cause. It has no id, basis or nested attempts.

pass and fail require nonblank observed and rationale and at least one evidence reference. inconclusive and blocked require nonblank rationale. not_run may retain empty observed/rationale and empty arrays. These requirements apply equally to attempts. A structurally valid run can remain incomplete.

All original baseline cases must appear exactly once, including blocked and not_run cases. No unknown or duplicate result IDs are allowed. Do not overwrite failed attempts with a later success, change requirements, or quietly drop incomplete cases. The helper validates supplied attempts; it cannot discover an attempt that was never recorded or prove chronological completeness.

Interpretation and hypothesis outcomes remain explicitly unconfirmed acceptance findings, even if their recorded status is pass or fail. Only explicit outcomes enter recordedExplicitOutcomes, and those are still operator-supplied outcomes, not independently proven verdicts.

## Evidence catalog

The catalog requires schemaVersion and items, with no extra properties. Each item requires exactly:

- id: nonblank catalog identifier, unique in the catalog.
- path: unique slash-separated relative path under evidence/, such as evidence/example.txt.
- kind: screenshot, dom, tool_receipt, log or other.
- capturedAt: valid UTC ISO timestamp, YYYY-MM-DDTHH:mm:ssZ or YYYY-MM-DDTHH:mm:ss.sssZ. Offsets and other fractional precision are not accepted.
- source: nonblank description of the capture source, such as the tool or view used. Do not include credentials or private session tokens.
- description: nonblank explanation of what the evidence shows and any material limits or redaction.

All catalog paths and all result/attempt references must resolve to existing regular files within the run's evidence directory. The helper rejects symlink components, absolute paths, traversal, empty path segments, backslashes, colons and NUL characters. Every result reference must match a catalog path. Unreferenced catalog items are allowed but must still exist; an empty catalog is valid for a pending run.

Timestamps, sources and descriptions are supplied by the operator. No signature, trusted capture attestation, file-content digest or cryptographic authenticity is implied. Keep original observations where safe; use redaction without misleading the reviewer about what remains visible.

## Validation and evolution

Schema validation checks JSON shape, field types, allowed values and conditional per-record requirements. A validator must support draft 2020-12 and resolve the local references; date-time format assertion may need explicit enabling. The helper additionally validates actual calendar timestamps, unique case/catalog IDs, unique catalog paths, full baseline coverage, unchanged basis, baseline byte hash, reference membership, file existence, symlinks and platform-specific absolute path semantics. JSON Schema alone cannot establish these cross-file and filesystem guarantees.

Run check before generating the report. structurallyValid: true means structural checks passed, not that all tests ran, all required conditions were verified, or the product passed. hasUnexecutedCases and counts expose recorded coverage; inspect the individual evidence and reasoning.

Current readers accept only schemaVersion: 1. Do not add arbitrary metadata keys or reinterpret existing field meanings. A future incompatible contract needs an explicit version and a supported migration; no automatic migration exists today. Keep the original run for review rather than editing its baseline. These checks are not a security boundary against changes made outside the helper.
