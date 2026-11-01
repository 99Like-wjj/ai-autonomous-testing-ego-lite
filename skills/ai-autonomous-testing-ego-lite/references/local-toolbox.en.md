# Local toolbox — 0.1.8-rc.1

Verify tool-info: 0.1.8-rc.1 / case-review-native-export-1, contracts v9, regressionVersion 2, networkVersion 1. Source development uses .build/runtime; parsers are bundled without runtime npm installation.

cases save publishes whole immutable case versions and allocates point IDs within that transaction. cases render/verify generate same-source offline HTML/Markdown without runs. cases review retains actual review provenance; offline approved flags are not human authentication.

cases serve --cases ABS --output-dir ABS starts a capability-scoped 127.0.0.1 review page. Open its actual private URL in Ego. The default view is the scene/case overview, followed by the three-column review workbench. Native saves write and read back immutable HTML/JSON exports in the named directory, avoiding browser Blob-download zone metadata. cases export-review --cases ABS --request ABS_JSON_OR_HTML --output-dir ABS provides the same native writer without a browser. render/serve accept --feedback ABS_JSON_OR_HTML for matching received opinions. Neither operation registers approval or runs tests. The listener expires after 480 idle minutes by default; --idle-minutes accepts 1–1440. Browser drafts are scoped to their current entry, so restore saved files after changing browsers or session URLs. Existing files and Windows zone metadata remain intact; browser backup downloads can still carry zone metadata.

regression select supports points with dependency closure, status with whole matching scenarios, and full including unprepared/deferred scope. start requires exact source, review, scope, current conditions, parameter and history binding. Unchanged reruns create only a new run.

record/evidence-add/execution/packet-seal retain unified facts and four-state assessments. execution query viewVersion 9 defaults to metadata, explicitly excluding results/evidence checks; full checks the complete current run.

The Ego helper arms the official listener before the chosen UI action, then saves within that SDK round. Timeouts stay unknown and do not prove cancellation. One execution download note coordinates active/unknown capture within this run; explicit reconciliation clears it.

files inspect reads bounded bytes/text/JSON/CSV/XLSX with scope, types and limitations, never a business verdict. report auto chooses bundle for referenced history or required originals. verify-report checks formats/attachments; a real browser check is separate.

See the [Chinese command reference](local-toolbox.md) and [regression guide](regression-reuse.md). Historical user data stays unchanged; no automatic migration or legacy fallback.
