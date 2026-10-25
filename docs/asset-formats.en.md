# Asset formats (v3 business data, v4 execution)

## Current v0.1.5 format overview

No resource JSON contract is added. Existing observed/rationale/remainingQuestions and explicit goal assessments/evidence retain resource gaps. clarificationQuestions still means unresolved acceptance; pendingClarification does not count all resource gaps. Unintegrated auxiliary notes are outside verify-report inputs.

Cases, results and evidence remain v3; new run manifests and reports use v4; execution ledgers, configuration and worker packets use v1; query views use v2. Existing v3 runs retain their format and remain verifiable. The v0.1.3 sections below explain historical base record semantics, not the format of new runs. See the v0.1.4 section later in this guide for parallel commands and fields.


Current 0.1.5 keeps the v0.1.4 contracts and retains v3 cases/baseline/results/evidence, uses v4 for new manifests/reports and v1 for configuration/execution/worker packets. Root schemas dispatch v3/v4 explicitly. The v3 field semantics below remain valid. Parallel calls are documented with the installed Skill references.

`execution read` now defaults to the viewVersion 2 response in execution-read.schema.json; use `--view assignment --assignment-id ID` for one assignment or `--view full` for the previous complete structure. The internal readExecutionView API remains complete. Views do not change stored run formats. Summary/assignment default to metadata validation, with explicit not_checked result/evidence fields and recovery-marker visibility. Use --integrity full for a strictly checked compact response; the full view always remains strict. Metadata queries do not recover transactions. New report wording distinguishes missing recorded observations from actual execution state; historical v0.1.3 descriptions below retain their context.

This guide defines cases, run directories, evidence-registration requests, result requests, progress, and reports. Schemas live in [`schemas/`](../schemas/) and use JSON Schema Draft 2020-12 with local relative references. The runtime adds checks for evidence ownership, hashes, revisions, and the frozen clarification veto.

## Version policy

v0.1.3 uses `schemaVersion: 3` for cases, run JSON, requests, and `report.json`. `report.html` is an offline presentation generated from validated v3 records; it does not define a new input schema. Compared with v0.1.2 schemaVersion 2, this release adds revisioned result/evidence catalogs, operation receipts, evidence-ID references, and local write commands. Results and evidence are no longer maintained by editing files directly. Old run directories and cases are not converted; there is no migration layer or migration command. To use v3, reconstruct cases from their original requirements and sources, then start a new run. Do not only change the version number or rewrite a historical baseline to make it look like a new run.

All objects are closed: unknown keys are rejected. IDs allow 1–128 ASCII letters, digits, dots, underscores, or hyphens and must start with a letter or digit. Dangerous property names such as `__proto__`, `prototype`, and `constructor` are rejected. The helper has no third-party runtime dependencies and requires Node.js 22 or newer.

## Cases and frozen baseline

The case root contains only `schemaVersion`, nonempty `project`, and a nonempty `cases` array. See [`cases.schema.json`](../schemas/cases.schema.json):

- `id`, `title`: nonempty; case IDs are unique.
- `basis`: exactly `kind`, `source`, and `text`. `kind` is `explicit`, `interpretation`, or `hypothesis`.
- `criticalConditions`: array of nonempty strings; it may be empty, but known prerequisites must not be hidden by omitting them.
- `expected`: required overall acceptance expectation.
- `requiredPath`: required; use `null` when no route is mandated.
- `stepOrder`: `strict` or `adaptive`.
- `steps`: nonempty and ordered. Each step requires `id` and `action`; `expected` is optional. Supply a checkpoint only when supported by a source. Omitting it does not mean the step was skipped or automatically passed.
- `clarificationQuestions`: optional string array. A nonempty list in the frozen case prevents every final result and historical attempt for that case from using `pass` or `fail`. Result requests cannot clear, replace, or override these questions.

`start --project-dir ABS --cases ABS --output-dir ABS` requires an existing project directory and a run directory that does not exist. It validates cases, writes the normalized case data to `baseline.json`, and stores its SHA-256 in `manifest.json`. Results and evidence start at revision 0. A hash can detect ordinary edits; it is not a tamper-proof signature. Direct local file edits outside the helper are outside its security boundary.

New run directory:

```text
run/
  baseline.json       # frozen schemaVersion 3 cases
  manifest.json       # runId, baseline hash, schema version
  results.json        # current final status, attempts, result operation ledger
  evidence.json       # evidence catalog and evidence operation ledger
  evidence/           # files retained by evidence-add / import
  execution.json      # schema v1 ledger for v4 runs: configuration, assignments, events, imports
  workers/            # isolated assignment receipts, raw evidence and sealed packets
```

Keep real projects, source files, runs, screenshots, and reports outside the source repository. The project root is used for its explicit execution-config.json; other project materials are not traversed. Explicit case and evidence inputs are read within their authorization.

## Evidence registration

Do not put files in `evidence/` and edit the catalog manually. Prepare a UTF-8 JSON request, then run:

```powershell
node .\scripts\ego.mjs evidence-add --run-dir $Run --request $EvidenceRequest
```

Request format is defined by [`evidence-request.schema.json`](../schemas/evidence-request.schema.json):

```json
{
  "schemaVersion": 3,
  "operationId": "evidence-config-01-first",
  "expectedRevision": 0,
  "caseId": "CONFIG-01",
  "sourceFile": "C:\\Users\\example\\AppData\\Local\\EgoLiteTest\\capture.png",
  "kind": "screenshot",
  "source": "Local page capture saved during this test",
  "description": "Observation of the synthetic configuration page"
}
```

Fields:

- `operationId`: idempotency ID for this registration; it cannot be reused across evidence and result operations in the run.
- `expectedRevision`: current evidence-catalog revision; a new successful registration increments it by one.
- `caseId`: must identify a case in the frozen baseline.
- `sourceFile`: absolute path to a local regular file. Symlink path components are rejected. The source file is not deleted or changed.
- `kind`: `screenshot`, `dom`, `tool_receipt`, `log`, or `other`.
- `source`, `description`: nonempty caller-supplied provenance and explanation.
- `capturedAt`: optional source-provided capture time in UTC ISO 8601. Omit it when unknown; the helper does not guess it from file timestamps.

Under the run lock, the helper checks the revision and source, copies the source into a unique staging file, and hashes the copied bytes. It installs the complete staged file at a unique final name with an exclusive same-volume hard link, so a partially copied file is not exposed as final evidence. Registration fails and cleans up its own files if the target filesystem does not support hard links. It verifies the retained file again. The catalog entry contains a unique `id`, relative `path`, `caseId`, metadata, `sha256`, `bytes`, helper-set `collectedAt`, and operation ID. The returned receipt can be used by `record`. If the response is lost, retry the same ID and payload to get the original receipt.

SHA-256 only indicates that current retained bytes match the catalog hash. It does not prove the file is genuine, the source is trusted, or the conclusion is correct. The helper does not redact content; review evidence before copying it.

## Final outcomes and historical attempts

Result requests follow [`record-request.schema.json`](../schemas/record-request.schema.json):

```json
{
  "schemaVersion": 3,
  "operationId": "CONFIG-01-observation-1",
  "expectedRevision": 0,
  "caseId": "CONFIG-01",
  "mode": "attempt",
  "record": {
    "status": "inconclusive",
    "observed": "The page showed the synthetic name, but refresh persistence was not observed.",
    "rationale": "This observation is insufficient to judge the overall expectation.",
    "remainingQuestions": ["Must the value remain after refresh?"],
    "evidenceIds": ["replace-with-evidenceId-from-receipt"],
    "cause": "unknown"
  }
}
```

`record --run-dir ABS --request ABS_JSON` accepts `mode: "final"` and `mode: "attempt"`:

- `final` updates the current final status used for progress. Status is `pass`, `fail`, `inconclusive`, `blocked`, or `not_run`. `not_run` means no final outcome is recorded; it can coexist with exploratory attempts. When a final record replaces an existing final observation, the old observation is retained as a `superseded_final` snapshot unless already preserved in history.
- `attempt` appends an observation and leaves the current final status unchanged. Attempts have their own `attemptId`, revision, time, and operation ID.
- **The attempts array excludes the current final observation itself.** It contains explicit `mode: attempt` observations and replaced final observations not previously preserved. Progress counts current status once; history counts both kinds of entries.
- `pass` and `fail` require nonempty `observed`, nonempty `rationale`, and at least one registered `evidenceId` associated with the same case. `blocked` and `inconclusive` require a rationale. `not_run` is valid only in final mode; it is not an observed attempt.
- If the frozen baseline has nonempty `clarificationQuestions`, the helper rejects `pass` and `fail` for final results and attempts alike. Requests only change result fields; they cannot rewrite the frozen basis, expected outcome, steps, or clarification questions.
- `remainingQuestions` describes questions about this result or attempt. It cannot replace or clear frozen `clarificationQuestions`.

The helper verifies evidence IDs exist, belong to the case, and are not duplicated. Result operations are written by atomic replacement of one file, then return an operation ID and revision receipt. If the process exits after commit but before returning the receipt, retrying the same request returns the ledger receipt without appending twice.

## IDs, revisions, and concurrency

- Every write uses a safe unique `operationId`. The same ID with the same canonical JSON payload (object-key order is ignored) is an idempotent retry; changed content is rejected.
- Evidence and result operations share one ID namespace within the run to prevent cross-type reuse.
- A new operation's `expectedRevision` must equal the current revision for its catalog or results file. Stale requests are rejected; read the latest revision before deciding whether to construct a new operation.
- Every run write obtains an exclusive `.run.lock` with create-exclusive semantics before reading or validating revisions. Concurrent calls do not queue: one may acquire the lock and others receive a conflict error.
- A leftover lock blocks writes. An operator should verify the associated process exited before inspecting and handling the lock. Do not delete unknown locks automatically.
- `init`, `start`, reports, and evidence destinations refuse overwrites. Evidence uses unique names. Cleanup targets only staging, marker, or unique evidence-ID files owned by the current operation.

The helper uses same-directory temporary files, `fsync` when supported, and single-file rename. It does not provide a general multi-file transaction across catalog, marker, and evidence files or guarantee power-loss durability. Evidence markers identify known uncommitted/committed work for recovery; `check` still verifies file hashes. The run directory must not be edited concurrently by external programs.

## Progress, check, and report

```powershell
node .\scripts\ego.mjs progress --run-dir $Run
node .\scripts\ego.mjs check --run-dir $Run
node .\scripts\ego.mjs report --run-dir $Run
```

`progress` returns current-status counts per frozen case, completed (`pass` / `fail`), uncompleted (`not_run` / `blocked` / `inconclusive`), pending clarifications, and attempt counts. `not_run` means no final result and may have recorded attempts. A case is never attempted only when its status is `not_run` and its attempts array is empty. `hasUnexecutedCases` is true only if at least one such case exists. `blocked` and `inconclusive` remain distinct. `check` validates frozen hashes, closed fields, associations, operation ledgers, paths, and every evidence file's hash and byte count.

`report` writes `report.json`, `report.md`, and a standalone `report.html`; all three destinations refuse overwrites. The HTML is a single file with inline styles, script, report data, and hash/byte-verified PNG, JPEG, or WebP screenshots. Its internal wrapper uses `htmlPayloadVersion: 1`; the `report` field remains the checked schemaVersion 3 object and image data lives in a separate `previews` map. This wrapper is not a new case-input protocol. It opens directly offline and can be copied alone for an authorized reviewer. It does not load resources from run paths, a CDN, external scripts, or network APIs. Diagnostic metadata may contain local paths; review before authorized sharing. The overview separately counts all cases, pass/fail/inconclusive/blocked/not_run statuses, never-attempted cases, attempted cases without a final outcome, pending clarifications, and historical attempts. Each case shows frozen goals, critical conditions, required path and order policy, basis, optional step expectations, current observations and rationale, clarifications and remaining questions, each attempt's remaining questions, linked evidence source/hash metadata, and a useful registered-time image comparison. Search, current-status filters, expandable history, and image enlargement are available. If a raster header is recognized but the browser cannot decode the image, the report displays an explicit failure message without substituting an image. Per-step verdicts are not stored, so the report does not infer that planned steps were completed and calls out this limitation.

Business outcomes, step coverage, and file integrity are shown separately. Matching hashes mean only that the stored bytes matched the catalog during report generation; they do not prove authenticity or correctness. A missing screenshot is called out but does not automatically mean failure; the AI decides capture timing, whether more testing is needed, and the business outcome. Only PNG/JPEG/WebP recognized by file signature are previewed; active formats such as SVG and HTML are not opened as images. Hash mismatches, dangling references, invalid frozen data, or structural errors block report generation; the tool does not downgrade them into a seemingly trusted pass report, and writes no output on a validation failure. Missing images and not-run/blocked/inconclusive cases are visible coverage gaps, not file-integrity errors. The three outputs are not a power-loss-durable multi-file transaction: a process or host crash can leave a subset behind; inspect and move/remove existing report files before retrying.

Valid structure means only that the record format is valid. It does not independently verify operator-supplied outcomes. Reports and hashes do not prove business correctness or defect attribution.

## Command reference

```text
node scripts/ego.mjs init --project-dir ABS
node scripts/ego.mjs validate-cases --cases ABS
node scripts/ego.mjs start --project-dir ABS --cases ABS --output-dir ABS
node scripts/ego.mjs evidence-add --run-dir ABS --request ABS_JSON
node scripts/ego.mjs record --run-dir ABS --request ABS_JSON
node scripts/ego.mjs progress --run-dir ABS
node scripts/ego.mjs check --run-dir ABS
node scripts/ego.mjs report --run-dir ABS
```

All paths must be absolute. Commands only organize local facts; they do not call a network, model, Ego, or browser, and they do not select a test route or retry business operations. v0.1.2 v2 files must be rebuilt from their original sources and placed in a new run; migration is unsupported.

## Report delivery extension (html-report-delivery-1)

Default delivery includes HTML, JSON and Markdown. Key UI conclusions require real screenshots. `evidenceCoverage` counts registered screenshots, distinct retained contents and final case records without screenshot links; it does not infer business judgments. Preview counts reflect safely embedded image headers, not browser decode acceptance.

`report --run-dir ABS [--output-dir ABS_EXISTING_DIR] [--context ABS_JSON]` can save new files in an existing external directory, refusing any overwrite. Generation reads all three files back and returns absolute paths, sizes, hashes and browserOpen=not_checked. `verify-report --run-dir ABS --report-dir ABS` compares them against current records and evidence; drift refuses verification without rewriting reports.

Optional retrospective context follows [report-context.schema.json](../schemas/report-context.schema.json), version 1, with summary, limitations, existing source file paths/hashes, supplemental case IDs and one AI-supplied review per goal (verified/violation/inconclusive/not_tested plus rationale). Original claims, supplemental scope and current reviews stay separate. Post-execution assembly never proves a pre-execution freeze. Cases, runs and requests keep schemaVersion 3; no historical data is migrated or removed.

## v4 execution and goal assessments

execution.json records user settings, explicitly known host capacity, protected initial Space IDs, reservations, assignments, Space history, original packets, AI reviews and durable import checkpoints. Drafts are sealed locally; a coordinator review imports evidence and results without business retries. Unapplied revision conflicts require an explicit new rebase transaction. Reports distinguish reservation peaks from worker-reported intervals and show explicit per-goal assessments. Existing v3 reports can verify against the frozen v0.1.3 frame without rewriting historical files.
