# Local toolbox calling guide (schemaVersion 3)

The helper performs local data transactions and rendering. Unless the user explicitly requests another format, delivery after test execution includes standalone HTML, JSON, and Markdown. Missing tools block delivery; Markdown notes alone do not complete it.

## Confirm the loaded installation

Use the absolute directory containing the actually loaded `SKILL.md` as the installed tool root. A complete installation includes scripts, schemas, docs, examples, and `runtime-manifest.json`. In source mode use the explicitly confirmed repository root; never infer it by walking up from an installed Skill or choosing a similarly named preview directory.

Run `node ABS_TOOL_ROOT/scripts/ego.mjs tool-info --expect-version 0.1.3-dev --expect-revision html-report-delivery-1`. Check toolRoot, skillFile, schemaVersion 3 and installationIntegrity (`verified` for installations, `source-layout` for source). Every CLI command also checks the installed manifest. Report unknown edits rather than overwriting them. Read `docs/asset-formats.en.md` and schemas inside that verified root. A fingerprint proves byte consistency, not publisher identity.

## Boundaries

- The helper only reads and writes user-specified local files. It does not use a network, model, or Ego; operate a browser; generate test data; decide bugs; choose execution routes; or retry business actions.
- The helper copies a selected regular file into the run's `evidence/` directory. Narrow the scope and review sensitive content first; the helper does not redact.
- `capturedAt` must come from a source-provided capture time. Omit it when unknown. The helper records `collectedAt` separately.
- SHA-256 only checks whether retained bytes match the catalog value. It does not prove authenticity, source identity, or correctness.
- Use the v3 format. v0.1.2 schemaVersion 2 files cannot be used directly. Rebuild cases from original requirements and create a new run; do not change only the version number.

## Create and validate a run

Cases must satisfy `schemas/cases.schema.json`. Keep project data and runs outside the source repository, and use absolute paths. The run destination must not exist.

```text
node "ABS_TOOL_ROOT/scripts/ego.mjs" validate-cases --cases ABS_CASES_JSON
node "ABS_TOOL_ROOT/scripts/ego.mjs" start --project-dir ABS_PROJECT_DIR --cases ABS_CASES_JSON --output-dir ABS_RUN_DIR
```

`start` freezes the baseline and creates an initial `not_run` results file and empty evidence catalog. Browser actions still require user authorization and the installed official Ego Skill.

## Register evidence

1. Read the current `revision` from the run's `evidence.json`; use it as `expectedRevision`. This is read-only. Do not edit the catalog manually.
2. Choose a new safe `operationId`. Specify a baseline `caseId`, a local regular `sourceFile`, `kind`, `source`, and `description`. Leave `capturedAt` out if unknown.
3. Save a UTF-8 JSON request and run:

```text
node "ABS_TOOL_ROOT/scripts/ego.mjs" evidence-add --run-dir ABS_RUN_DIR --request ABS_REQUEST_JSON
```

4. Use the returned `evidenceId` with a result or attempt for the same case. The receipt includes operation ID, revision, path, SHA-256, byte count, and collection time.

Evidence requests are validated under a single-writer lock. Symlink paths, non-regular files, overwrites, mismatched case associations, invalid times, stale revisions, and ID conflicts are rejected. Do not put source paths, keys, or real business data in public examples.

## Record a final outcome or attempt

Read the current results `revision` from `results.json`. Example:

```json
{
  "schemaVersion": 3,
  "operationId": "CONFIG-01-final-observation",
  "expectedRevision": 0,
  "caseId": "CONFIG-01",
  "mode": "final",
  "record": {
    "status": "inconclusive",
    "observed": "Synthetic observation: the page does not establish the overall expectation.",
    "rationale": "Available evidence does not confirm that the expectation was met or violated.",
    "remainingQuestions": ["Must the value persist after refresh?"],
    "evidenceIds": [],
    "cause": "unknown"
  }
}
```

`mode: final` updates the current outcome. `mode: attempt` appends an observation while leaving the current final outcome unchanged. The attempts array excludes the current final observation; it includes explicit attempts and prior final snapshots not already preserved in history. For a deliberate new observation with the same status and content, use a new operation ID. To retry a request, reuse the original ID and payload.

`pass` / `fail` require actual observations, rationale, and registered evidence IDs associated with the same case. `inconclusive` / `blocked` require rationale. `not_run` is valid only in final mode and means no final outcome; it can coexist with attempts. Only `not_run` with an empty attempts array means never attempted. A frozen baseline with pending `clarificationQuestions` prohibits `pass` / `fail` for both final outcomes and attempts. Requests cannot change basis, steps, expectations, or frozen questions.

## Idempotency, conflicts, and lost responses

- Every write request has a unique `operationId`; evidence and result writes share the same ID space.
- Retrying the same ID with the same JSON content (object-key order does not matter) returns the original receipt without appending again.
- Changed payload under the same ID is rejected. A new ID with an old revision is also rejected.
- The helper obtains a run-level exclusive lock before reading revisions. Concurrent writers are not queued automatically.
- If a response is lost after commit, check with `check` or `progress`; retrying the exact original ID and payload returns its receipt. Do not use a new ID to repeat an operation with an unknown outcome.
- A stale lock blocks writes. Verify no associated process is running before inspecting a lock. Do not automatically remove an unknown lock.

## Progress and reports

```text
node "ABS_TOOL_ROOT/scripts/ego.mjs" progress --run-dir ABS_RUN_DIR
node "ABS_TOOL_ROOT/scripts/ego.mjs" check --run-dir ABS_RUN_DIR
node "ABS_TOOL_ROOT/scripts/ego.mjs" report --run-dir ABS_RUN_DIR
```

Progress counts only each baseline case's current final status; historical failures are not counted again as current failures. `not_run`, `blocked`, `inconclusive`, and pending clarification remain separate. `report` creates `report.json`, `report.md`, and a self-contained `report.html`; it refuses to overwrite any existing output. You can copy `report.html` alone and open it in a browser without network access; it has no run-directory references or external links. The HTML shows frozen goals, critical conditions, required path and order policy, observations, rationale, basis, unverified items, each attempt's remaining questions, and evidence source/SHA-256 metadata. It previews only PNG/JPEG/WebP files whose hash and size match. Missing images are called out without automatically failing the case; if a browser cannot decode an otherwise recognized raster image, a clear error appears without a replacement image. Hash mismatches, dangling references, or invalid structure refuse report generation.

The report summarizes caller-provided results and local file integrity; it is not an independently verified test conclusion. Business status and file integrity are shown separately. SHA-256 does not prove authenticity or business correctness. Reports have case-level outcomes, not per-step verdicts, and do not claim that planned steps were executed. Do not upload a raw report automatically; review its sensitive content and use only an authorized sharing path.


Use `verify-report --run-dir ABS_RUN --report-dir ABS_REPORT_DIR` to read back all three artifacts and compare them with the current records, retained evidence and context sources. Receipts include absolute paths, byte counts, hashes and `browserOpen: not_checked`; actual browser opening remains separate. Deliver all three paths. Key UI outcomes and defects require real screenshots, selected by the AI rather than one screenshot per step. Missing screenshots are evidence gaps that need conclusion review, not automatic product failures.

For a new report without overwriting an old one, prepare a new external directory and pass `report --output-dir ABS_EXISTING_NEW_DIR`. Retrospective assembly additionally uses `--context ABS_CONTEXT_JSON`, defined by `schemas/report-context.schema.json`. This report-only v1 context records limitations, existing source files and hashes, supplemental case IDs, and AI-supplied reviews for every goal. Original recorded statuses remain separate. Never present post-execution assembly as a pre-execution freeze, invent capture times, or rerun business actions just to fill a report.
