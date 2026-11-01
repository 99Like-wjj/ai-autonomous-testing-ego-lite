# Architecture — v9 / 0.1.8-rc.1

![Architecture responsibilities: AI, Ego and deterministic tools.](images/architecture.png)

Current development contracts use version 9, regressionVersion 2 and networkVersion 1. AI owns interpretation, planning, exploration, action choice and business assessment. Ego owns browser primitives. Local code owns deterministic transactions, integrity, file reading and report presentation, without a business decision tree or automatic retries.

Whole case versions, adjacent actual reviews and separate runs are the persistent units. core/case-versions allocates stable embedded point IDs within publication; case-review validates actual review provenance and necessary-definition hashes. Unchanged reruns reuse the original file. Rules and task semantics stay in cases; issues stay in run findings/assessments.

regression/selection computes points/status/full and declared dependencies. binding freezes scope, applicable review, current conditions, parameters and exact historical references. The complete baseline bytes remain separate from execution-plan references. sources reads exact result prefixes; compare records differences without repair attribution.

core/records and execution packets share immutable observations, action/context facts, findings, original-problem checks and four-state goals. Unselected goals have no current status; missing assessments are record gaps. Hosts own real worker identity and lifecycle, not a local permission sandbox.

ego-helpers/download composes official Ego events and saveAs in the same SDK round. Explicit downloads-manager reconciliation is a version-specific fallback. An existing execution note tracks one active/unknown run capture; clocks do not clear it. files/inspect reads bounded files in a separate process and never decides business success.

report/history retains exact source-run provenance outside current evidence/counts. Delivery uses one JSON/HTML/Markdown model plus referenced attachments. Complete history bundles remain verifiable when source directories move; missing history is explicit. review-ui exports review data without running tests or authenticating a reviewer.

case-reader provides the scene/case overview and three-column review workbench. The optional review-session listens only on a private capability-scoped 127.0.0.1 path, with case input and output directory fixed by the CLI. review-export validates and writes readable HTML/JSON natively, avoiding browser download-zone metadata. It makes no model calls, browser actions or approval registrations. Offline reading and browser drafts remain separate from formal reviews; see [review saving](v0.1.8-case-review.md).

See [contracts](asset-formats.en.md), [regression reuse](regression-reuse.md) and [development validation](v0.1.8-development-validation.md). Historical user data is not migrated or overwritten.
