# 更新记录 / Changelog

## 0.1.2 — 业务意图级步骤与可选检查点

- 操作步骤描述业务意图和必要输入，AI 使用 Ego 根据当前界面选择具体操作路径；不要求生成需求文档未提供的按钮、弹窗或提示。
- `steps[].expected` 改为可选；填写时仍须是非空且有依据的检查点。省略不代表自动通过，也不免除用例整体验收。
- 用例级 `expected` 和 `basis` 保持必需；可选 `clarificationQuestions` 明确标记待澄清的验收条件。存在未解决问题时，辅助工具拒绝该用例及其尝试记录的 `pass` / `fail`，允许记录探索、阻塞或不确定结果。
- 基线与报告保留检查点是否存在、待澄清问题及原始业务步骤；实际执行路径应记入观察、尝试及证据，不能把计划步骤冒充已执行证据。
- 中文优先文档、英文说明、Skill 生成指南、两类合成用例和架构插图同步更新。

资产仍使用 `schemaVersion: 2`。这是结构放宽和可选元数据扩展，不另建迁移层；v0.1.1 中有效且完整的步骤仍可使用。软件版本与资产版本独立编号。

验证：2026-10-21，Linux / Node v24.19.0，137/137 合成测试通过（辅助工具 125 项、发布检查器 12 项），零失败、零跳过。独立 Draft 2020-12 复核通过 6 份 Schema、18 个示例及生成 JSON 资产；待澄清最终结果与尝试状态反例、独立 Skill 的 9 条相对链接、当前文件隐私扫描和更新图解视觉检查均通过。上述检查仅验证辅助工具和合成资产，不代表 Windows / Ego / yiliai 的真实业务测试效果。

English summary: Business-intent steps with optional source-backed checkpoints;
required case-level acceptance remains. Optional clarification questions are
preserved and prevent terminal pass/fail claims until resolved in a new baseline.
Asset schema version stays 2. No browser execution or model accuracy is claimed.

## 0.1.1 — 中文优先与统一操作步骤

- README 首页和默认设计文档以简体中文为主，英文另设切换入口。
- 澄清两类输入是“接收外部用例”和“Skill 自行生成用例”，不是把新功能与旧用例划成互斥场景；两者均可验证新功能或执行回归。
- 用例必需包含 `steps`，每步有 `id`、`action`、`expected`；`stepOrder` 区分必须保持业务顺序的 `strict` 与可在既定意图和前提内调整的 `adaptive`。
- 增加只读 `validate-cases --cases ABS`，两类来源共享同一结构校验入口。工具不生成用例、不调用模型，也不执行浏览器操作。
- Skill 增加用例生成方法，输出包含来源、前提、业务动作与预期的统一格式；保留模型自主选择页面定位方式的空间。
- 基线和报告保留操作步骤；结果不得覆盖原始步骤或顺序约束。

**格式不兼容：** 按当前设计要求，所有 JSON 测试资产升级为 `schemaVersion: 2`。
新版明确拒绝 v1，不提供兼容分支或自动迁移。旧用例和运行记录不能直接交给新版助手处理；
如需重新使用，请依据原始需求重新整理为 v2，并核对语义，不要只改版本号。

验证：Linux / Node v24.19.0，90 项合成测试通过，无失败、无跳过；
生成的 v2 资产经 Draft 2020-12 Schema 和本地引用验证。Windows / Ego / 真实项目链路仍未实测。

English summary: Chinese-first documentation; one version-2 case contract for
external and Skill-authored cases; required semantic steps and order policy;
read-only case validation. This is an intentional asset-format break, without
v1 compatibility or automatic migration. Package version is 0.1.1; asset version
is independently numbered 2. No Windows/Ego application execution is claimed.

## 0.1.0 — Experimental development version

- AI-led new-feature and existing-case testing Skill for installed Ego Lite.
- Separate reusable guidance, private project resources and local run evidence.
- Optional dependency-free Node helpers; no browser driver or model API wrapper.
- Versioned test asset contracts, synthetic examples and bilingual visual docs.
- Privacy-oriented publication boundary and local structural checks.

Validation on 2026-10-21 (Linux, Node v24.19.0):
- 67/67 synthetic local tests passed; no failures or skipped tests.
- Current publication allowlist, relative links and heuristic privacy check passed.
- Five generated artifact types validated with Draft 2020-12 schemas using the
  already-available development validator, including local references and formats.
- Skill metadata validated; isolated Skill-copy reference links checked.
- Eight original bilingual PNG diagrams visually inspected; metadata reviewed.

Review fixes include rejecting result fields that shadow the baseline, accurate
operator-supplied outcome labels, pre-rendering reports, and suppressing possible
credential values in publication-check diagnostics.

No Windows/Ego application run or AI testing accuracy is claimed. Python's
development validator and optional image renderer are not helper runtime dependencies.
