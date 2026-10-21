<p align="center"><img src="docs/images/hero.png" alt="Ego Lite Test Skill: intent stays stable, the path can adapt. Experimental and unofficial; Windows and Ego validation pending." width="100%"></p>

# Ego Lite Test Skill

<p align="center"><strong>English</strong> · <a href="README.md">简体中文</a><br><a href="#quick-start-on-windows">Quick start</a> · <a href="docs/architecture.en.md">Architecture</a> · <a href="docs/asset-formats.en.md">Resource contract</a> · <a href="docs/privacy.md">Privacy</a> · <a href="docs/testing.md">Validation status</a></p>

**Validate new requirements and features, then regress existing behavior, with the current Codex model and Ego's native browser capabilities.** Describe the outcome you need, supply project-specific acceptance criteria, and let the model choose its next step from the page it actually observes. Keep evidence and uncertainty visible instead of turning a successful click into an automatic pass.

**Experimental 0.1.1.** This is an independent, unofficial project, not affiliated with or endorsed by Ego. Cloud validation covers local helper behavior only. Windows + Ego end-to-end validation is still pending; this is not a certified Windows integration. No production readiness or benchmark result is claimed. See the [current validation record](docs/testing.md).

## Two case sources. One contract and execution path.

New-feature validation and regression are test purposes, not input categories. **Both sources support both purposes.**

- **External cases:** accept schemaVersion 2 cases with prerequisites, business steps, per-step expectations, and final expectations. Validate structure and provenance without silently rewriting intent. If supplied as prose, normalize it while preserving the source and clarify material ambiguities.
- **Skill-generated cases:** the current model follows the bundled [case-authoring guide](skills/ego-lite-test/references/case-authoring.md) to derive positive, negative, boundary, role, state, and affected-regression coverage and produce the same JSON format. Keep explicit requirements, interpretations, and hypotheses separate.

Both sources are validated and frozen before AI drives Ego through the business steps. Steps guide business actions, not coordinates or fixed selectors. strict preserves semantic step order; adaptive can change methods or ordering only while intent, prerequisites, and dependencies remain intact. Neither permits skipping key steps or coverage.

**Generation-only** needs no browser or deployed environment: deliver cases and unresolved questions, not a claim of execution. Actual execution requires an authorized, reachable deployment. See the [synthetic requirement](examples/project.example/feature-request.md) and [matching generated cases](examples/generated-cases.example.json).

## Why a skill, not another testing engine?

- **Reuse the model you're already working with.** No second model service is built into this repository.
- **Keep the requirement stable, not every click.** The model can adapt navigation while preserving acceptance criteria, critical conditions, and any explicitly required path.
- **Keep the browser native.** Ego performs page reading and browser actions. This project does not replace it with another browser driver.
- **Make outcomes inspectable.** Separate `pass`, `fail`, `inconclusive`, `blocked`, and `not_run`; preserve evidence, requirement provenance, and attempts.
- **Keep the machinery small.** The optional Node.js CLI creates and checks local record files. It does not run the model, run the browser, or prove a business claim.

A better underlying model may improve planning or judgment, but improvement is not guaranteed. Outcome quality also depends on the requirements, available evidence, application state, and operator review.

## Who owns what?

![Ownership: current Codex model makes decisions; skill and project resources define context; Ego performs browser reads and actions. The optional helper only manages files.](docs/images/architecture.png)

| Layer | Responsibility | Not its job |
| --- | --- | --- |
| Current Codex model | Interpret goals, plan, inspect evidence, diagnose uncertainty | Invent missing product requirements |
| This skill + project resources | Define workflow, boundaries, cases, acceptance and evidence expectations | Hardcode a universal business oracle |
| Ego native browser | Read and interact with the application | Decide whether the product fulfills your business rules |
| Optional local helper | Scaffold, validate structure, format reports | Launch browser/model execution or independently verify verdicts |

The installed official `ego-browser` skill is the authority for Ego setup and commands. Read [the architecture](docs/architecture.en.md) for the boundary details.

## Quick start on Windows

### 1. Prepare the official runtime

Install and configure Ego following the [official Windows quick start](https://lite.ego.app/document/en/docs/windows/quick-start). Ensure your Codex environment can discover the installed official `ego-browser` skill and connect to Ego. This repository does not install Ego or replace its setup instructions.

For the optional helper, install **Node.js 22 or newer** from the [official Node.js site](https://nodejs.org/). Use PowerShell below. No third-party npm dependencies are required for the helper.

### 2. Install this skill without overwriting another copy

Download or clone this repository, then open PowerShell in its root directory:

```powershell
$Source = (Get-Location).Path
$SkillRoot = Join-Path $HOME '.agents\skills'
$SkillTarget = Join-Path $SkillRoot 'ego-lite-test'
if (Test-Path $SkillTarget) {
    throw 'Skill destination already exists. Review or back it up before updating.'
}
New-Item -ItemType Directory -Force -Path $SkillRoot | Out-Null
Copy-Item -Recurse -Path (Join-Path $Source 'skills\ego-lite-test') -Destination $SkillTarget
```

Start a fresh Codex session if needed for skill discovery. Ask it to use both `ego-lite-test` and the installed official `ego-browser` skill. Copying this folder installs instructions, not a model or browser service.

### 3. Keep private project resources outside the checkout

The following optional helper commands use absolute paths. `$LocalRoot` must be outside `$Source`. `init` and `start` require **new destination directories with existing parents**, and will not overwrite an existing run.

```powershell
$LocalRoot = Join-Path $env:LOCALAPPDATA 'EgoLiteTest'
New-Item -ItemType Directory -Force -Path $LocalRoot | Out-Null
$Project = Join-Path $LocalRoot 'demo-project'
node .\scripts\ego.mjs init --project-dir $Project
```

Edit the generated `$Project\cases.example.json` with real, approved requirements before execution. Use the [case example](examples/cases.example.json), [resource contract](docs/asset-formats.en.md), and [skill](skills/ego-lite-test/SKILL.md) as references. Do not put passwords, tokens, session cookies, or personal records into the case file.

### 4. Ask the model to test

Generate cases from requirements, then test (or request generation-only):

```text
Use ego-lite-test and the installed official ego-browser skill.
Read my new-feature requirement and identify acceptance points, negative
and boundary cases, and affected existing behavior. Label uncertainties;
do not turn your assumptions into confirmed requirements.
Generate schemaVersion 2 cases with criticalConditions, stepOrder,
steps (id/action/expected), and final expected. Validate and freeze them,
then validate the deployed feature in the
explicitly authorized test environment. Ask if the environment, required
business oracle, or permission is missing. Keep observed behavior,
remaining questions, evidence, and original attempts in the result.
Do not purchase, delete, send messages, or change permissions.
```

Or start from existing cases, with synthetic names only:

```text
Use ego-lite-test and the installed official ego-browser skill.
Read my local project resources from the absolute path I provide.
In the authorized test environment, verify that searching the catalog
shows only items matching the requested category.

Keep the acceptance condition and critical conditions fixed; choose the
navigation from the current page. Do not purchase, delete, send messages,
change permissions, or cross the approved environment boundary.

Separate explicit requirements from interpretations and hypotheses.
Keep evidence and original attempts. If a requirement, permission, or
business oracle is missing, stop and ask or mark the result inconclusive.
Do not call a visible result list proof of backend correctness.
```

Supply the actual authorized URL, local project path, test account context, scope, and execution budget separately. Prefer a dedicated test environment and synthetic data. Sign in through the supported secure flow, not by placing credentials into a prompt or repository.

## How an adaptive run works

![Adaptive workflow: observe, decide, act, verify, then re-observe within the budget. Stop for uncertainty, missing authority, or insufficient evidence.](docs/images/workflow.png)

The model checks the current page, decides the next permitted action, uses Ego, and compares observations with the stable acceptance condition. A required route remains required: adaptability is not permission to skip the part under test, silently weaken criteria, or erase a failed attempt.

A failure is first a finding to diagnose, not automatically a confirmed product defect. The cause may be the product, agent, environment, specification, or unknown.

## Reusable assets, one explicit contract

Requirement documents remain human-readable context. External and Skill-generated cases use the same schemaVersion 2 contract; old formats are not supported. Cases preserve the requirement source; results separate expected from observed behavior, rationale, remaining questions, and attempts; the evidence catalog describes each referenced file. The report summarizes those supplied records without turning them into independently proven verdicts.

Use the [asset formats](docs/asset-formats.en.md) and [JSON Schemas](schemas/) as the shared contract rather than inventing project-specific field names. Keep private project instances outside this public-ready source tree.

## Optional evidence bookkeeping

From the repository root, using the variables above and a reviewed case file:

```powershell
$Cases = Join-Path $Project 'cases.example.json'
$Run = Join-Path $LocalRoot ('run-' + [guid]::NewGuid().ToString('N'))
node .\scripts\ego.mjs validate-cases --cases $Cases
node .\scripts\ego.mjs start --project-dir $Project --cases $Cases --output-dir $Run
```

`validate-cases` is an optional read-only preflight that prints a validation summary without writing files. `start` also validates its input.

**`start` only creates files. It does not execute tests.** It snapshots the baseline and initializes every case as `not_run`. The model/operator must then perform authorized browser work, place sanitized evidence under the run directory, and populate `results.json` and the `evidence.json` catalog according to the [contract](docs/asset-formats.en.md).

```powershell
node .\scripts\ego.mjs check --run-dir $Run
node .\scripts\ego.mjs report --run-dir $Run
```

- `check` checks record structure, baseline consistency, case coverage, and referenced evidence-file existence. A structurally valid run may still contain `not_run` cases.
- `report` creates `report.json` and `report.md`. It refuses to overwrite existing reports.
- A `pass` or `fail` record requires observed behavior, a rationale, and an evidence reference. The helper does **not** judge whether that evidence supports the verdict.
- Baseline hashing detects ordinary changes; it is not tamper-proof. These helpers are not a security boundary for actions that bypass them.

![Illustrative result specimen, not a real run: distinguish observed UI facts from backend or unseen-data claims that have not been established.](docs/images/result-specimen.png)

This image is an original explanatory illustration, **not a screenshot, real run, or measured result**. The actual helper currently produces JSON and Markdown, not the pictured visual interface.

## Privacy before publication

A private repository is **not** a safe place to store secrets. Ignored artifacts are **not** credential protection. Keep private project resources and runs outside the checkout; review screenshots, page text, URLs, reports, and git history before sharing. A screenshot can expose data even when no credential file is committed.

The helper has no network/model/browser execution, but your model host and Ego have their own data flows and policies. This repository does not promise local-only inference or automatic redaction. See [privacy and publication guidance](docs/privacy.md).

## Explore the project

- [Skill instructions](skills/ego-lite-test/SKILL.md): the model's testing workflow.
- [Architecture](docs/architecture.en.md): decisions, execution, evidence, and trust boundaries.
- [Resource contract](docs/asset-formats.en.md): project resources, provenance, result fields, and helper semantics.
- [Case example](examples/cases.example.json): synthetic schema example, not product requirements.
- [Testing and limitations](docs/testing.md): what has and has not been validated.
- [Privacy](docs/privacy.md): handling local data and preparing for publication.

## Inspiration, not affiliation

README presentation was informed by [Midscene](https://github.com/web-infra-dev/midscene)'s visual explanation and example-first onboarding, and [Stagehand](https://github.com/browserbase/stagehand)'s concise introduction and quick-start organization. The diagrams and copy here are original; their branding, code, claims, and results are not reused. [Ego Lite](https://github.com/citrolabs/ego-lite) is the native browser dependency, not an endorsement of this project.

**License:** not selected for public release yet. The current private draft is `UNLICENSED`; do not assume an open-source license.
