# Architecture and responsibilities (v8)

The current AI session owns requirement analysis, goal design, browser exploration, evidence selection and business judgment. Ego supplies native browser operations. Local tools freeze records, validate references, retain files and render reports. The network component also starts a scoped native collector and provides local queries; they do not call models, choose routes, retry business operations or infer verdicts.

Hosts own real workers, context, permissions and lifecycle; local tools retain assignments and reviewed deliveries without adding a host dispatcher or permission sandbox. Linked CLI identity uses real paths while run/evidence path protection stays intact. See [host guidance (Chinese)](../skills/ai-autonomous-testing-ego-lite/references/host-compatibility.md).

The data flow is: trusted requirements and authorization → frozen cases/goals → actual browser observations/evidence → serial record or coordinator-reviewed worker import → one results.entries ledger → current goal assessments and preserved history → HTML/JSON/Markdown.

Cases organize related workflows. Goals hold source-backed expectations. Steps, critical conditions and required paths retain necessary semantics via requiredRefs; they are not separate business verdicts. Observations record facts, coveredRefs and evidence IDs. Assessments provide four-state outcomes, reasons, gaps and optional diagnosis. A known violation may have an unknown cause; absent assessments are recording gaps.

Serial and parallel execution share record:{observations,assessments}. final incrementally updates submitted goals; attempt is historical only. Current assessments are a projection of immutable entries. Worker evidence keys become catalog IDs on reviewed import; no parallel-only goal-assessment channel remains. Assignments, capacity, Space ownership and in-flight operations stay in the execution ledger, separate from business results. Default concurrency is 1, and Space separation does not guarantee account or backend isolation.

Test-asset JSON contracts use version 7; network observation has independent networkVersion 1. Legacy formats are rejected, without readers or converters, while historical files remain untouched. TypeScript source builds into Node ESM with Skill guidance, schemas, examples and an integrity manifest. tool-info verifies the actual root/version/revision. Revisioned idempotent writes and run locking protect data transactions; hashes establish byte consistency, not truth. There is no general multi-file or power-loss guarantee.

Reports use one goal projection and expose outcome counts, recording gaps, source-backed observations, screenshots, diagnosis, history and followUpOf links. Parent scenarios show distributions, not an aggregate verdict that conceals partial coverage. Optional diagnostics use the current Ego capabilities within authorized scope; API names alone do not establish availability. Isolated capability validation does not substitute for business acceptance.

See [asset formats](asset-formats.en.md), [validation limits](testing.en.md), and the installed SKILL.md. Development builds neither update the user's installed Skill nor constitute a formal release.

Network observation uses a dedicated native-only context, explicit page/interface scope, bounded content processing and committed local evidence. network start/status/query/stop never replay business requests, choose routes or infer verdicts. The AI chooses queries/evidence; handoff stops collection and explicit recovery opens a new segment.


## Project regression assets

V7 appends contexts/actionEvents to the same result ledger, separating intent, dispatch, outcomes and read-only reconciliation/disposition. Unknown actions remain visible; no business retry is automatic. Worker continuation can explicitly reuse verified evidence in the same run/case without pretending it was newly captured.

The AI authors immutable rule/task revisions from trusted sources and real observations. regressionVersion 1 tools store and validate them, compute explicit status-based whole-case selection or full declared scope, and freeze exact snapshots with current-run conditions. Unselected goals receive no new outcome. Comparisons expose mappings, conditions and AI comparability, without automatic attribution. See [regression assets](regression-reuse.md).

## Combined reporting capabilities

The v8 ledger retains contexts, observation action excerpts, attempt lifecycle events, phenomena, structured gaps and reproduction preparation. Contexts use environment/identity/objects/initialState/authorization with state/summary/sources. Observation actions and attempt events have distinct purposes and are not automatically copied or replayed.

The integrated reader keeps scene/goal navigation, retained text bodies, content deduplication, attachment delivery and eight themes. Network export reads retained data without replay. Regression scope, exact task revisions and unresolved actions remain visible. Software is 0.1.7-rc.1; data contract v8 is not a software version. See [integration record](v0.1.7-integration.md).
