# Contracts — v9 / 0.1.8-rc.1

Development contracts use version 9, regressionVersion 2 and networkVersion 1. JSON Schema owns structure; runtime validation additionally checks references, exact bytes, integrity and transactional semantics. Generated declarations are not edited manually.

Only whole case versions, adjacent actual reviews and separate runs persist. Definitions change a case version; unchanged reruns create only a run. Stable point IDs and the allocation counter live inside the case file, with explicit non-reusable retirement/replacement relations. There is no generic asset store, per-point revision service, issue registry or project run registry.

Each goal has id, title, pointId, basis, expected, requiredRefs, planState, preparationGaps, sourceAlias and clarificationQuestions. Conditions have stable id/text; steps carry explicit dependsOn. References use condition:id, step:id and requiredPath. Prepared definitions need their necessary plan; unprepared points and source coverage gaps remain visible in full scope.

cases save atomically allocates new IDs and publishes a new immutable whole file, guarded by expectedVersion and previousSha256. Replaying the exact committed request recovers its receipt without reallocating IDs. cases review records exact scope, derived definition hashes and actual human/delegated provenance. Offline approved flags do not authenticate human review. Changed necessary semantics require review; unchanged hashes can reuse it.

Case HTML/Markdown use internal documentVersion 2 for the overview, three-column review and optional initialFeedback snapshot. This does not change v9 case definitions or fingerprints. New documents use new output directories. Native feedback HTML/JSON and their exportVersion 1 delivery manifest are opinion copies, not adjacent formal reviews. See [review save details](v0.1.8-case-review.md) for the private loopback writer and Windows zone-metadata boundary.

start requires a binding. baseline.json preserves the complete original case-file bytes, while run-binding.json freezes scope, plan references, deferrals, reviews, current conditions, parameter values and exact parent-run references. Parameter binding never weakens a criterion. points selects exact goals with declared dependency closure; status reruns whole matching scenarios; full retains all in-scope definitions and gaps.

record and worker import share the same four-state goals and immutable facts. Unselected points have no current verdict; unassessed means missing records. Problem recurrence, new findings, comparability and code-repair attribution stay separate.

The existing execution download note coordinates one active/unknown capture within this run, with explicit evidence-backed reconciliation rather than an expiring lease. The Ego helper composes official download events and saveAs; timeout does not prove cancellation. File inspection returns bounded byte/text/JSON/CSV/XLSX facts and limitations, never business success.

Reports use v9. First runs have no history panel. Historical observations and attachments retain their exact run/revision/evidence identities, outside current evidence/counts. auto delivery chooses bundle for needed history or required originals. Complete retained history attachments support later verification even if old source directories move; missing history remains explicit and cannot change current states.

Historical user data is preserved. There is no automatic migration, legacy reader or overwrite authority. Network contracts remain version 1.
