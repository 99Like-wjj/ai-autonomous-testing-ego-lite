# Validation record and coverage limits

## v0.1.4 development validation (2026-10-23, in progress)

Strict Node/DOM typechecks, generated schema declaration drift checks, compilation and runtime staging passed. All maintained programs are TypeScript; the runtime ships compiled assets without development dependencies. On Windows, Node 24.19.0 and a separate Node 22.23.4 both ran **85 tests: 81 PASS, 0 FAIL, 4 SKIP**. Skips retain existing symlink privilege limitations; new directory-junction rejection tests passed. Coverage includes configuration precedence, safe positive integer limits, draining, host capacity, resource conflicts, in-flight reservations, Space provenance/recovery, complete goal packets, association/hash rejection, partial imports, response-loss replay, explicit conflict rebasing, legacy v3 reports and v4 goal views.

All 8 generated SVGs match the original bytes; historical images remain untouched. Inkscape is unavailable, so PNG export is untested. Three native gpt-6-luna/max workers and separate Ego Spaces completed the synthetic barrier and reviewed packet/report chain: 3/3 cases and 24/24 goals verified, 23 evidence items including 5 screenshots. Three Chrome requests remained pending until all arrived; reservation and sourced-interval peaks were 3. The host accepted the requested model/effort; there is no independent backend model signature or serial speedup comparison. Three report files verified; Ego opened HTML with visually checked screenshots, unique-title search 1/3, failure filter 0/3 and all sourced images decoded. Original agent/QA errors were preserved and resolved by readback without code changes. Owned Spaces 4/5/6 were finished once and independently confirmed absent; installed files/configuration hashes were unchanged. Pre-existing Space 1 disappeared before any finish; attribution awaits the user and complete protection remains inconclusive. Ten separately authorized PRD042 UAT cases follow these self-tests with a frozen bundle and deferred Skill fixes. Logs and screenshots stay outside source. Arbitrary-N stability, this version's Linux run, skipped symlinks, full crash/power-loss recovery, fixed speedups and error-free agents are not established.

## Release verification (2026-10-22, cloud)

Version, Skill metadata and runtime checks are aligned at 0.1.3. The full Linux / Node v24.19.0 regression suite passed 64/64 with zero failures or skips. The four Windows symlink-permission skips remain recorded below; Linux results do not substitute for Windows coverage. The owner accepted local trial results and authorized finalization, merge and release without expanding the scope of verified claims.

## Report delivery repair validation (2026-10-22, Windows)

- Windows / Node v24.19.0: complete `npm test` ran 64 tests, with 60 PASS, 0 FAIL and 4 SKIP due to unavailable synthetic symlink privileges. All 8 new delivery regressions passed, covering standalone assets, revision/integrity refusals, three-file readback, retained originals, retrospective scope/reviews, source hashes, drift and duplicate text registrations.
- The first full run had one failure because its schema inventory omitted the new report-context contract. After updating the contract check, the complete suite passed as above. Skill validation initially failed under default GBK decoding; `python -X utf8` validation passed.
- `check:public` passed for 68 current distribution files; relative links and `git diff --check` passed. Credential scanning is heuristic and excludes Git history and image semantics. Real session assets remain outside the repository.
- Independent Draft 2020-12 validation passed 9 schemas and 16 example/generated/existing v3 assets, with an invalid context capture-time field rejected. The development validator is outside the repository and is not a runtime dependency.
- Ego Lite actually opened the synthetic file:// HTML. Search, filtering, history expansion, PNG decoding, zoom, Escape, close and retained initial failure passed, with a QA screenshot. Initial click/screenshot errors were retained; the window was minimized, then restored within the same TaskSpace before successful verification. There was no file:// access refusal or alternate-channel workaround.
- The retrospective report also opened and showed the 26 original goals, one supplemental finding, 24 current inconclusive reviews, 3 untested goals and zero screenshots. A subsequent change prefixes overview metrics as original records, verified by generated DOM tests. The final installed-tool copy was also opened in Ego: URL, all 27 cases, original-record labels, review scope and search passed. Its final screenshot again failed because the window remained minimized after a restore request; final full visual acceptance remains unverified. DOM checks are not visual acceptance.
- SHA-256 comparison preserved 37 original report/run files. No real business operation was repeated, and no capture time or screenshot was invented. Historical claims and current evidence review are separate.

Not run: four symlink scenarios, full mobile visual acceptance, and new-session acceptance of real business screenshot capture/default delivery. On 2026-10-22, the owner reported no major issues in local trial use, accepted the version, and authorized merging and release. This does not establish that the listed untested scopes passed.

## Historical checks before this repair


On 2026-10-22, Linux / Node v24.19.0: `npm test` passed 56/56 tests (44 helper tests and 12 publication-checker tests), with zero failures or skips. `npm run check:public` passed and printed the current 64-file allowlisted manifest. These checks cover this branch's local helper and synthetic assets; they are not Ego or application tests.

`npm test` covers schemaVersion 3 case validation and freezing, evidence copies and retained-file hashes, source/capture timestamp distinction, paths and symlinks, reserved IDs, overwrite prevention, the single-writer lock, revision conflicts, idempotency and key ordering, receipt recovery after a lost response, final and attempt history, clarification vetoes, current-status progress, HTML/Markdown escaping, safe raster embedding, frozen conditions/required path/order display, each attempt's remaining questions, evidence source/hash metadata, image decode-error handling, the distinction between `not_run` and no recorded attempt, rollback after close/directory-sync errors, protection of a replaced output, bad-hash and dangling-reference report refusal, active-format non-preview, CLI entry points, and publication-checker cases. HTML source checks cover the offline policy, no external links, and safe static-data binding; a minimal DOM shim simulates filtering, lightbox buttons, a cancel-close event, and image errors, but the simulated cancel is not a real keyboard or visual browser check.

Chromium headless was retried against a synthetic report in an isolated temporary directory with its own profile/cache, background networking disabled, and a 20-second timeout. The browser process did not exit (timeout exit 124) and produced no reviewable screenshot. Desktop/mobile visual review and real-browser interaction checks are **NOT RUN**. Node regressions and the DOM shim are not UI acceptance; the browser launch block was not bypassed.

Independent format review checked all 8 JSON Schema Draft 2020-12 schemas, local `$ref` resolution, and 4 synthetic case/request examples. Case, evidence-request, and result-request examples use schemaVersion 3.

The publication check scans only the current allowlisted tree for file names and extensions, text, relative links, common credential patterns, forbidden private-output paths, and symlinks. It is heuristic. It does not scan Git history, remote attachments, image contents, or semantic privacy issues.

For local Windows acceptance, PowerShell can create a separate synthetic run under `$env:TEMP`, exercise the CLI, then copy and open the offline report. This does not access Ego or a business site and does not overwrite an existing directory:

```powershell
$ReviewRoot = Join-Path $env:TEMP ('ego-lite-synthetic-' + [guid]::NewGuid().ToString('N'))
$Project = Join-Path $ReviewRoot 'project'
$Run = Join-Path $ReviewRoot 'run'
New-Item -ItemType Directory -Path $ReviewRoot | Out-Null
node .\scripts\ego.mjs init --project-dir $Project
$Cases = Join-Path $Project 'cases.example.json'
node .\scripts\ego.mjs validate-cases --cases $Cases
node .\scripts\ego.mjs start --project-dir $Project --cases $Cases --output-dir $Run
node .\scripts\ego.mjs check --run-dir $Run
node .\scripts\ego.mjs report --run-dir $Run
$Copy = Join-Path $ReviewRoot 'report-copy.html'
Copy-Item (Join-Path $Run 'report.html') $Copy
Invoke-Item $Copy
```

This only checks local synthetic files and the ability to open the report. Continue with a visual and interaction review of content, image decoding, filters, enlargement, and Escape-to-close. Report outputs refuse overwrites; use a new GUID directory for another run. The operator can remove the temporary folder after retaining any needed acceptance notes.

## Windows and external systems

The implementation uses Node.js built-ins and platform path APIs; it does not depend on shell commands or third-party runtime packages. On 2026-10-22, commit `8af375474352442428190af21a0318fdadf9f3ce` was exercised on Windows: `npm test` reported 52 PASS, 0 FAIL, and 4 SKIP because synthetic symlink creation was not permitted. The 64-file publication check passed. A fresh temporary run exercised case validation, run creation, two synthetic PNG evidence registrations, attempt/status recording, integrity checking, and HTML generation. This does not cover the skipped symlink cases or all Windows filesystem, locking, and permission combinations.

The local browser tool refused to open the `file://` report; no local server or alternate browser channel was used to bypass that restriction. Real-browser search, status filtering, image enlargement, and decode-error notices remain **NOT RUN** and require user acceptance. The synthetic report statuses are UI fixtures, not business outcomes.

No Ego, real application, account, yiliai data, or business write operation was used. AI defect-finding accuracy, false positives, and model-upgrade effects were not measured. Tests support only limited claims about local structured-record and file behavior. This historical check does not represent later owner trial use or final release verification; see the newer sections above.

## Runtime and record limitations

- `pass` / `fail` are caller-provided outcomes. The helper checks fields, evidence associations, and file hashes; it does not independently confirm observed facts.
- Matching SHA-256 values do not prove source authenticity or evidence completeness and do not detect sensitive information.
- A single-file rename is not a general multi-file transaction across catalog and evidence, and does not promise power-loss durability. A stale lock or unknown recovery marker may require manual inspection.
- Publication heuristics do not replace human privacy review and do not inspect history.
- v0.1.2 schemaVersion 2 is rejected by v3; no migration layer exists. Rebuild cases from original sources and start a new run.

## Historical versions

The following are earlier version records, not v0.1.3 results:

- **v0.1.2:** 2026-10-21, Linux / Node v24.19.0, 137/137 synthetic tests passed; schemaVersion 2.
- **v0.1.1:** Linux / Node v24.19.0, 90 synthetic tests passed; asset schemaVersion 2.
- **v0.1.0:** 2026-10-21, Linux / Node v24.19.0, 67/67 synthetic tests passed.

None of these versions claims a Windows + Ego + real application end-to-end run. See the [format contract](asset-formats.en.md) and [changelog](../CHANGELOG.md).
