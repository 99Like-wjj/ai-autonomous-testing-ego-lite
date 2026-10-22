# 更新记录 / Changelog

## 0.1.3 — 2026-10-22 · 本地证据与图文报告交付

### 报告交付修复与定版

- 默认交付独立 HTML、JSON、Markdown，不能仅聊天摘要或静默降级。明确测试中需保留的事实、关键 UI 结果/缺陷的真实截图要求，以及取证受限时的证据缺口和结论复核；不强制逐步截图/expected，不改变 AI 的业务决策职责。
- 完整目录安装包增加 scripts、schemas、格式文档、示例及 runtime-manifest；`tool-info` 确认实际根、版本、revision、schema 和指纹，CLI 拒绝安装文件缺失或不一致。只构建新目录，不覆盖不明用户修改，不新建备份或同名重复安装。
- 报告增加截图覆盖与不同留存内容统计，去除“图片不是强制要求”的淡化措辞；`verify-report` 和生成后的读回校验核对三个文件、当前记录、证据及整理来源，回执的 browserOpen 明确为 not_checked。
- 支持在新目录另存报告；可选 retrospective context（schemaVersion 1）标明事后整理、真实来源/限制、补充用例和 AI 逐目标复核，原记录结论单列，不覆盖或删除旧报告，不补造截图、执行步骤或时间，不重跑业务。
- 升级影响：软件定版为 0.1.3，tool revision 为 html-report-delivery-1；case/run/request 仍为 schemaVersion 3，派生 report.json 增加 evidenceCoverage 和可选 context。旧安装须使用完整包更新，不能只复制说明文件；不提供历史迁移或删除。中文/英文 README 与指南同步。
- 本次验证结果见 docs/testing.md 与 docs/testing.en.md；历史 56/56、52 PASS/4 SKIP 等记录保留为历史，不代替本次结果。用户于 2026-10-22 完成本地试用后决定定版，并授权合并 main 与发布；这一决定不替代文档中未完成的专项验证。

English: Default three-format delivery, real screenshots for key UI conclusions, standalone version-checked installation, report readback verification and explicit retrospective provenance/reviews. No fixed business execution route, automatic verdict inference or historical overwrite.


- 明确首要场景为新项目首次上线前、新功能首次交付时的 Web 业务验证；区分 AI 自主规划能力与上线质量保证，同步中英文介绍。
- 重写四组介绍图的中文业务表述与英文说明，更新开发版和验收边界；README 加入流程图与报告内容示意。示意图不代表真实测试截图。

- 增加 `evidence-add`，从本地普通文件安全复制到 run 的 `evidence/`，按留存副本计算 SHA-256 与字节数，并分别记录工具登记时间 `collectedAt` 和可选来源时间 `capturedAt`。
- 增加 revision 化 `record` 与 `progress`。最终状态与历史尝试分开，保留被替换的旧最终观察；进度只统计当前状态并单独列出待澄清用例。
- 使用 run 级单写者锁、expectedRevision、canonical payload hash 与操作回执。相同 operation ID 和内容重试幂等；内容变更和过期 revision 拒绝。证据登记使用恢复 marker；单文件 rename 不声明为多文件事务或断电持久性保证。
- check/report 现在核对 evidence ID、保留文件 hash 与字节数，报告展示 hash、时间和来源。冻结澄清 veto 同时适用于所有最终结果与历史尝试。
- `report` 新增可单独离线打开的 `report.html`，保留 JSON/Markdown。展示冻结目标、当前观察和理由、需求依据、未验证事项、历史尝试及核验后的 PNG/JPEG/WebP 图片；含状态筛选、搜索、展开历史、放大和时间排序对照。缺图单独提示；坏 hash、悬空引用或结构错误阻止报告生成。HTML 不使用外链、网络或占位图。
- HTML 补充展示冻结关键条件、必经路径、步骤顺序、逐条尝试的剩余问题，以及证据来源和 SHA-256 元数据；浏览器无法解码已识别图片头时明确提示。`not_run` 统一表示尚无最终结论，报告分别统计从未尝试与已有尝试但未记录最终结论。
- 报告创建若在文件关闭或目录同步时返回错误，会按文件身份清理本操作生成的输出；如输出路径已被替换则拒绝删除该文件。此错误回滚不构成断电持久性或通用多文件事务保证。
- HTML 报告明确区分业务判断与证据文件完整性。报告不生成 verdict，也不从计划步骤推断完成；截图并非强制每步采集，工具不自动判断截图存在即为业务正确。
- 所有用例、运行 JSON、请求与 `report.json` 使用 schemaVersion 3。这是相对 v0.1.2 schemaVersion 2 的格式断裂；本分支不提供迁移层。保留业务意图步骤、来源依据、可选步骤预期和旧状态语义；`report.html` 是从通过校验的 v3 数据生成的离线呈现文件。
- 新增证据请求、结果请求与 Skill 本地工具箱调用指南，中英文格式/架构/README 同步；示例仅包含合成数据。未实现数据对比、测试数据生成、导入、脱敏或跨次对比。
- 本开发分支新增标准 MIT 许可证（Copyright (c) 2026 99Like-wjj），仅适用于本项目自有代码与文档；不覆盖 Ego、其官方浏览器或其他第三方软件，且不改变仓库私有状态或 v0.1.2 历史发布。
- 版本号、Skill 元数据、工具版本校验与安装包统一为 0.1.3；正式发布绑定精确提交，未混入 v0.1.4 并行实现。
- 另建 [`docs/requirements.md`](docs/requirements.md) 记录 v0.1.4 的 subagent 并行及单用例单 Space 待研究需求；此项没有并入 v0.1.3 工具箱实现。

修复前历史验证：Linux / Node v24.19.0，56/56 合成测试通过（44 项辅助工具、12 项发布检查器），零失败、零跳过；`npm run check:public` 扫描 64 个 allowlist 文件并通过。覆盖 HTML 报告的内嵌截图、冻结上下文、来源/hash 显示、图片解码错误、历史剩余问题、尝试与未尝试区分、close/sync 错误回滚和被替换输出保护、注入文本转义、SVG 安全预览、完整性失败不落盘和悬空引用回归。另在 Windows 对提交 `8af3754` 完成合成验证：52 PASS、0 FAIL、4 SKIP（符号链接权限），64 文件检查和含两份合成 PNG 的报告生成通过；未执行 Ego 或业务环境实测。本地浏览器工具拒绝打开 file://，没有绕过限制。再次尝试 Chromium headless 仍以 timeout exit 124 结束且未生成截图；实际视觉/交互验收为 NOT RUN。

English summary: Added a local-only evidence/result toolbox with retained-copy SHA-256, revisioned idempotent writes, a run lock, history-preserving attempts, progress, and offline image-rich HTML reporting alongside JSON/Markdown. JSON case/run/request/report assets use schemaVersion 3, with no v0.1.2 migration; the HTML view wrapper is version 1. Report cards show frozen preconditions/path/order, per-attempt questions, evidence source/hash, decode errors, and distinguish never-attempted cases from attempts lacking a final outcome. The branch uses the MIT License for original project code and documentation only; it does not license Ego or third-party software. Earlier verification before the delivery repair: Linux synthetic suite 56/56, publication scan 64 files; Windows synthetic validation of commit 8af3754 reported 52 PASS, 0 FAIL, and 4 symlink-permission skips; the 64-file scan and synthetic PNG report generation passed. Chromium/local-browser visual acceptance, Ego, and real business execution remain unverified. The owner accepted local trial results and authorized v0.1.3 finalization on 2026-10-22; unverified scopes remain explicitly documented.

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
