# Contracts — v9 / 0.2.1

0.2.1 is the release version. The Skill/package is ai-testing-ego-lite; storage remains v9. Bounded progress/context outputs use contextReadVersion 1; CLI record wraps the unchanged receipt in recordResponseVersion 1. Explicit usage exports are independent of business results. Source design and development validation stay in the source repository, outside the runtime package.


Retained from 0.1.8: optional Observation.phase, Assessment.display and ActionFact inputSummary/replySummary/inputPresentation/conversations. Facts and four-state judgments remain separate. Missing data is not inferred from plans. conversationVersion 1 records provider-neutral messages, source references, fidelity, coverage and completion basis; see schemas/conversation.schema.json and examples/conversation.example.json. Local source IDs map to retained same-case originals through metadata.conversationSources; parallel imports remap external IDs without changing artifact bytes. Limits: 8MiB per artifact and 262144 UTF-16 code units per message. Explicitly scoped parts are authored by AI rather than silently truncated.

Retrospective context.conversations binds SHA-verified files to actual current-goal actions, without changing original results. HTML offers the selected drawer/fullscreen conversation layout, step summaries and source inspection. Auto delivery includes original registered conversation files in a bundle. verify-report reviewPrompts identify structural readability/phase/summary gaps without choosing a verdict or a follow-up action. No site-specific protocol adapter is included.

Development contracts use version 9, regressionVersion 2 and networkVersion 1. JSON Schema owns structure; runtime validation additionally checks references, exact bytes, integrity and transactional semantics. Generated declarations are not edited manually.

Only whole case versions, adjacent actual reviews and separate runs persist. Definitions change a case version; unchanged reruns create only a run. Stable point IDs and the allocation counter live inside the case file, with explicit non-reusable retirement/replacement relations. There is no generic asset store, per-point revision service, issue registry or project run registry.

Each goal has id, title, pointId, basis, expected, requiredRefs, planState, preparationGaps, sourceAlias and clarificationQuestions. Conditions have stable id/text; steps carry explicit dependsOn. References use condition:id, step:id and requiredPath. Prepared definitions need their necessary plan; unprepared points and source coverage gaps remain visible in full scope.

cases save atomically allocates new IDs and publishes a new immutable whole file, guarded by expectedVersion and previousSha256. Replaying the exact committed request recovers its receipt without reallocating IDs. cases review records exact scope, derived definition hashes and actual human/delegated provenance. Offline approved flags do not authenticate human review. Changed necessary semantics require review; unchanged hashes can reuse it.

Case HTML/Markdown retain internal documentVersion 2, case v9 and exact case fingerprints. New documents use new directories. The offline page directly exports readable HTML with one inert review-feedback-data JSON block holding complete v9 feedback, and optional standalone JSON. These are feedback copies, not formal reviews. cases export-review is an optional CLI with an exportVersion 1 delivery manifest, never a page or server dependency. See [offline review export](case-review.md) for scope, restoration and Windows verification boundaries.

start requires a binding. baseline.json preserves the complete original case-file bytes, while run-binding.json freezes scope, plan references, deferrals, reviews, current conditions, parameter values and exact parent-run references. Parameter binding never weakens a criterion. points selects exact goals with declared dependency closure; status reruns whole matching scenarios; full retains all in-scope definitions and gaps.

record and worker import share the same four-state goals and immutable facts. Unselected points have no current verdict; unassessed means missing records. Problem recurrence, new findings, comparability and code-repair attribution stay separate.

The existing execution download note coordinates one active/unknown capture within this run, with explicit evidence-backed reconciliation rather than an expiring lease. The Ego helper composes official download events and saveAs; timeout does not prove cancellation. File inspection returns bounded byte/text/JSON/CSV/XLSX facts and limitations, never business success.

Reports use v9. First runs have no history panel. Historical observations and attachments retain their exact run/revision/evidence identities, outside current evidence/counts. auto delivery chooses bundle for needed history or required originals. Complete retained history attachments support later verification even if old source directories move; missing history remains explicit and cannot change current states.

Historical user data is preserved. There is no automatic migration, legacy reader or overwrite authority. Network contracts remain version 1.

## Report language and model provenance (report-language-model-1)

Optional v9 aiContext is accepted in cases, RecordPayload and report-context. Each uses entry records model, reasoningEffort, sourceKind, a SourceRef and scope. Unknown sources cannot assert model or effort. File sources are hash-checked; packet mapping and canonical transaction identity preserve authorship. Model metadata does not enter the necessary-goal definition hash, and unchanged definitions retain their original generator.

Both document types accept --presentation JSON with language and a complete messages map for the selected target language. The current AI selects the user's communication language unless explicitly overridden. Built-in source-language calls are distinct from that user choice; a requested target never silently falls back. HTML, Markdown and JSON retain one presentation snapshot. Named message parameters are checked and cannot be dropped or changed by a translation.

Case documents can accept a retrospective --ai-context file bound to the exact casesRef, without modifying published cases or approval. Test reports combine this run's committed contributions and the supplied reading context into one test_execution header, excluding generators, historical parent runs and pure rendering callers.

New fields require the matching tool revision. Existing files are never rewritten; old standalone HTML stays readable, while byte-for-byte verification of old presentation requires its original renderer revision. Regenerate into a new directory for a new presentation.

## Project knowledge format v3

knowledgeFormatVersion 3 and knowledgeReadVersion 3 are independent of test contracts v9. knowledge.json identifies the project. project.json and accounts.json use {"items":[]}; records require only id/title, with optional summary/tags/description/properties. Custom JSON remains opaque and does not require environment or role registries.

Maps directly describe applications/pages and module entries. Rules retain full text, sources and confirmation state, with natural-language appliesTo. User configuration is a declaration, not a verified rule. Sources retain independent versions/hashes.

Knowledge remains optional. Missing configuration does not create a full-project readiness task. Query returns summaries; read expands details for AI interpretation. Malformed files differ from valid empty collections. Old formats are not read, converted or overwritten; history remains intact.
