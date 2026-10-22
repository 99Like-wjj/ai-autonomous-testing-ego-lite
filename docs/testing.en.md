# Validation record and coverage limits

## v0.1.3-dev checks

On 2026-10-22, Linux / Node v24.19.0: `npm test` passed 55/55 tests (43 helper tests and 12 publication-checker tests), with zero failures or skips. `npm run check:public` passed and printed the current allowlisted release file manifest. These checks cover this branch's local helper and synthetic assets; they are not Ego or application tests.

`npm test` covers schemaVersion 3 case validation and freezing, evidence copies and retained-file hashes, source/capture timestamp distinction, paths and symlinks, reserved IDs, overwrite prevention, the single-writer lock, revision conflicts, idempotency and key ordering, receipt recovery after a lost response, final and attempt history, clarification vetoes, current-status progress, HTML/Markdown escaping, safe raster embedding, bad-hash and dangling-reference report refusal, active-format non-preview, CLI entry points, and publication-checker cases. HTML source checks cover the offline policy, no external links, and safe static-data binding; a minimal DOM shim simulates filtering and lightbox button handlers, but does not replace a real browser.

Chromium headless was attempted to open a synthetic report and capture a screenshot. In this container Chromium could not initialize its user-data directory; a second launch attempt timed out under renderer/cache restrictions. The report passed Node synthetic regression, the DOM shim, and source/protocol checks, but there was no completed desktop or mobile visual check and no real-browser interaction acceptance, including Escape-key lightbox close.

Independent format review checked all 8 JSON Schema Draft 2020-12 schemas, local `$ref` resolution, and 4 synthetic case/request examples. Case, evidence-request, and result-request examples use schemaVersion 3.

The publication check scans only the current allowlisted tree for file names and extensions, text, relative links, common credential patterns, forbidden private-output paths, and symlinks. It is heuristic. It does not scan Git history, remote attachments, image contents, or semantic privacy issues.

## Windows and external systems

The implementation uses Node.js built-ins and platform path APIs; it does not depend on shell commands or third-party runtime packages. Windows compatibility was reviewed at source level: absolute paths, built-in `path`, Node file operations, PowerShell command examples, and unique file naming. **No real Windows execution test was run.** Linux Node 24 checks do not verify Windows lock, rename, permission, hard-link, or filesystem behavior.

No Ego, browser, real application, account, yiliai data, or business write operation was used. AI defect-finding accuracy, false positives, and model-upgrade effects were not measured. Tests support only limited claims about local structured-record and file behavior.

## Runtime and record limitations

- `pass` / `fail` are caller-provided outcomes. The helper checks fields, evidence associations, and file hashes; it does not independently confirm observed facts.
- Matching SHA-256 values do not prove source authenticity or evidence completeness and do not detect sensitive information.
- A single-file rename is not a general multi-file transaction across catalog and evidence, and does not promise power-loss durability. A stale lock or unknown recovery marker may require manual inspection.
- Publication heuristics do not replace human privacy review and do not inspect history.
- v0.1.2 schemaVersion 2 is rejected by v3; no migration layer exists. Rebuild cases from original sources and start a new run.

## Historical versions

The following are earlier version records, not v0.1.3-dev results:

- **v0.1.2:** 2026-10-21, Linux / Node v24.19.0, 137/137 synthetic tests passed; schemaVersion 2.
- **v0.1.1:** Linux / Node v24.19.0, 90 synthetic tests passed; asset schemaVersion 2.
- **v0.1.0:** 2026-10-21, Linux / Node v24.19.0, 67/67 synthetic tests passed.

None of these versions claims a Windows + Ego + real application end-to-end run. See the [format contract](asset-formats.en.md) and [changelog](../CHANGELOG.md).
