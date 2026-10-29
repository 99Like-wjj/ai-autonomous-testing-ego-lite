# Local toolbox guide (0.1.7-rc.1)

The toolbox performs deterministic local data transactions, validation and report rendering. The network commands also start a scoped native collector through the local Ego installation. Business UI actions and judgments remain AI-driven; the collector does not issue or replay business requests. Read docs/asset-formats.md from the actual complete tool root; in source, build first and use .build/runtime.

For linked installations, obtain a nonempty tool-info receipt and use its resolved toolRoot. Exit code zero alone does not prove execution. See [host conditions and handoff (Chinese)](host-compatibility.md) for host entrypoints, context and lifecycle. This release uses v8 rather than the isolated repair branch formats.

```text
node ABS_TOOL_ROOT/scripts/ego.mjs tool-info --expect-version 0.1.7-rc.1 --expect-revision report-resource-regression-1
node ABS_TOOL_ROOT/scripts/ego.mjs validate-cases --cases ABS_CASES
node ABS_TOOL_ROOT/scripts/ego.mjs start --project-dir ABS_PROJECT --cases ABS_CASES --output-dir ABS_NEW_RUN
node ABS_TOOL_ROOT/scripts/ego.mjs evidence-add --run-dir ABS_RUN --request ABS_EVIDENCE_REQUEST
node ABS_TOOL_ROOT/scripts/ego.mjs record --run-dir ABS_RUN --request ABS_RECORD_REQUEST
node ABS_TOOL_ROOT/scripts/ego.mjs progress --run-dir ABS_RUN
node ABS_TOOL_ROOT/scripts/ego.mjs check --run-dir ABS_RUN
node ABS_TOOL_ROOT/scripts/ego.mjs report --run-dir ABS_RUN
node ABS_TOOL_ROOT/scripts/ego.mjs verify-report --run-dir ABS_RUN --report-dir ABS_REPORT_DIR
```

All test-asset JSON contracts use schemaVersion 8 and execution query viewVersion 7. Old formats are explicitly rejected; no conversion or in-place update is provided. Preserve old files and prepare separate v8 assets from original sources. Do not auto-update the user's installed Skill.

start creates a frozen baseline and an empty result ledger, not synthetic not_tested results. Evidence requests register permitted regular files, return catalog IDs and verify retained bytes. Unknown capture times are omitted; registration time is not execution time. Files are not automatically redacted and hashes do not establish authenticity.

record contains observations and assessments. Observations have id/summary/coveredRefs/evidenceIds; assessments have goalId/status/rationale/observationIds/gaps and optional diagnosis. Four statuses are verified/violation/inconclusive/not_tested. A missing assessment is a recording gap. final updates only explicitly submitted goals; attempt remains in history without changing current results. Current assessments are derived from entries, and original anomalies are preserved.

Serial record needs no worker or Space assignment. Reviewed worker import writes the same structure, mapping packet-local evidence keys to catalog IDs. Default concurrency is 1; see [parallel guidance](parallel-testing.md) when needed. Resource facts and gaps never replace actual user clarification; see [resource readiness](resource-readiness.md).

Use unique operation IDs and current revisions. Identical request replay recovers a receipt, not a browser action. Changed payloads or stale new requests are rejected. Do not clear unknown locks or repeat unknown writes. Full format examples and rules are in the [Chinese toolbox guide](local-toolbox.md).

Reports count business goals, show parent scenario distributions, and distinguish recording gaps from four-state outcomes. Key UI findings require real screenshots; timestamps, actions and screenshots are never invented. HTML/JSON/Markdown are the default deliverables. report refuses overwrite; use a new --output-dir to retain earlier artifacts. verify-report checks current files and records, while browserOpen:not_checked leaves actual opening unverified. Deliver absolute paths and known limitations. Source reconstruction must be explicitly retrospective; it is not a pre-execution freeze.


## Network observation

Use network start/status/query/stop for scoped background recording, committed local queries and orderly shutdown. The AI decides when to query and how to assess UI plus interface evidence. Fetch/XHR, SSE and bidirectional text/binary WebSockets are included. See [configuration and lifecycle (Chinese)](network-observation.md). Network data uses independent version 1; experimental protocol-summary files are not read, converted or deleted.


## Regression assets

Use `regression read/context/validate/commit/select/compare` for project-local data and `start --binding` for exact task/rule snapshots. See [behavior boundaries](regression-reuse.md) and CLI `--help`. Regression examples are synthetic placeholders; replace references and hashes with actual context/select/commit receipts before execution. These commands do not launch browser actions.
