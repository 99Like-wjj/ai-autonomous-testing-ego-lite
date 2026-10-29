# Asset formats and runtime contract (schemaVersion 7)

Current independent candidate: 0.1.7-rc.1 / regression-reuse-1, unreleased. All JSON contracts use schemaVersion 7; execution query viewVersion is 7. Older formats are explicitly rejected. There is no legacy reader, converter or in-place migration. Keep historical runs, reports, source files and screenshots unchanged; prepare new v7 assets from original sources instead of changing only a version field.

availableWorkers caps all active assignments for this run, including existing reservations; it is not the free-slot count. packetId is unique across the entire run; use assignment-scoped namespaces. Local sealing cannot detect duplicates in another worker directory. Preserve original packets and correct delivery from retained observations without repeating business actions. The complete tool root provides references/parallel-testing.md; its source is skills/ai-autonomous-testing-ego-lite/references/parallel-testing.md.

Schemas are closed Draft 2020-12 objects in [schemas](../schemas/). Runtime checks additionally enforce references, evidence ownership, required semantics, clarification restrictions, revisions and retained-file hashes. Source users build first and use .build/runtime/scripts/ego.mjs; installed users use scripts/ego.mjs from the actual Skill root. Node.js >=22 is required.

## Cases and goals

The root contains schemaVersion, project and nonempty cases. A case has id, title, criticalConditions, requiredPath (null if unspecified), stepOrder (strict/adaptive), nonempty steps and nonempty goals. Each step has id/action only. Each goal has id, basis:{kind,source,text}, expected and requiredRefs. Basis kinds are explicit, interpretation and hypothesis.

Business goals are independently assessable outcomes. Steps, conditions and paths retain necessary semantics; they are not counted as additional business goals. requiredRefs accepts step:ID, condition:zero-based-index and requiredPath when present. A workflow can share preparation across goals without dropping required dependencies.

Optional goal.clarificationQuestions blocks verified/violation for that goal in both final and attempt records. Resource availability is a separate concern. Optional followUpOf:{runId,caseId,goalId,reason} links a revised or follow-up goal without modifying old claims or proving resolution. Case-level basis/expected/clarificationQuestions and step.expected are no longer part of the contract. See [external case examples](../examples/cases.example.json) and [generated examples](../examples/generated-cases.example.json).

## Evidence and records

A run contains baseline.json, manifest.json, results.json, evidence.json, execution.json, evidence/ and workers/. start freezes the baseline and creates an empty result ledger; missing assessments do not establish that testing never happened. Keep real assets outside the source repository.

Evidence requests contain schemaVersion:7, operationId, expectedRevision, caseId, sourceFile, kind, source, description and optional capturedAt. Kinds are screenshot/dom/tool_receipt/log/other. The tool copies permitted regular files, verifies retained bytes and records hash, size and collectedAt. Unknown capture times are omitted; collection/recording time is not execution time. Registration does not redact data and hashes do not prove authenticity.

Result requests contain schemaVersion:7, operationId, expectedRevision, caseId, mode (final/attempt) and record:{observations,assessments}.

- Observation: id, summary, coveredRefs, evidenceIds. References describe actually observed necessary semantics; evidence must belong to the same case.
- Assessment: goalId, status, rationale, observationIds, gaps; optional diagnosis.
- Status: verified, violation, inconclusive or not_tested. The AI supplies the judgment.
- Diagnosis: state unknown/hypothesis/confirmed; category product/agent/environment/spec/unknown; summary and evidenceIds. A violation may have an unknown cause.

verified/violation require actual observations and evidence. verified must cover the goal's requiredRefs; missing prerequisites cannot be hidden. Missing assessments are recording gaps, not a fifth business state. final incrementally updates only the submitted goals; attempt is historical only. All entries remain, including original anomalies and replaced final assessments. Current assessments are a projection of final entries, not a second writable result channel.

## Serial and parallel execution

Serial record and reviewed worker import use the same record structure and results.entries. Serial reporting does not require a worker, assignment or fabricated Space inventory. Packet observations.evidenceIds and diagnosis.evidenceIds use packet-local evidence keys, mapped to catalog IDs during import. spaceUsage/executionWindow retain evidenceKeys. The coordinator explicitly accepts or revises; original packets remain immutable.

Configuration uses schemaVersion 7 with maxParallelCases defaulting to 1. Do not raise it without user direction or explicit configuration. Execution reads support summary/assignment/full and metadata/full integrity; partial checking is declared. Tools do not choose business routes, retry writes, infer host capacity or decide outcomes. See the parallel guide at references/parallel-testing.md in a complete package.

## Transactions and reporting

Unique operationId plus expectedRevision protects data writes. An identical request may recover its receipt; changed payloads and stale new requests are rejected. Run-level single-writer locking does not automatically queue writes or clear unknown locks. Data transaction recovery never authorizes repeating a browser write. File staging and checks do not promise arbitrary multi-file atomicity or power-loss durability.

HTML, JSON and Markdown share one projection. caseCount counts scenarios, goalCount counts business goals, counts contains four outcome counts plus unassessed for recording gaps. assessmentComplete means each goal has a current assessment, not that all goals were tested or passed. There is no case.status; scenario cards show goal distributions, individual observations, evidence, gaps, diagnosis and history.

Missing assessment records are visibly distinct from inconclusive and not_tested. Steps/conditions/paths do not inflate the goal denominator. Execution state, screenshot coverage and evidence-file integrity are separate. Real screenshots are required for key UI findings; their presence does not automatically prove correctness, and absence does not automatically prove a product failure.

report validates references and every retained evidence file before writing standalone report.html, report.json and report.md, refusing overwrite. The HTML embeds verified PNG/JPEG/WebP images without network dependencies; unsupported or undecodable images are reported, never replaced with fabricated images. verify-report compares all artifacts to the current run; later changes require a new report directory. browserOpen:not_checked is not proof of browser validation.

Retrospective work creates separate, explicitly sourced v7 records; it never presents reconstruction as a pre-execution freeze or invents actions, timestamps or screenshots. New tools cannot verify legacy runs. See [the Chinese reference](asset-formats.md) for fuller guidance and the current validation record in the source repository (docs/testing.en.md).

Network observation has independent networkVersion 1 and leaves the v7 contracts above unchanged. See schemas/network-start.schema.json, schemas/network-query.schema.json and the complete package references/network-observation.md. Committed event/byte cutoffs, chained row hashes and processed body hashes bound local queries. Body states distinguish saved/empty/in_progress/not_collected/excluded/truncated/failed. Hashes do not authenticate evidence. Experimental protocol-summary files are preserved without a reader or migration.
