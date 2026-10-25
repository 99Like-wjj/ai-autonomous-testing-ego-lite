# 本地资产格式与运行约定（v3 业务核心、v4 执行）

## v0.1.5-dev 当前格式总览

本开发版没有新增资源 JSON 契约。资源缺口复用 observed/rationale/remainingQuestions 和显式目标评估/证据，clarificationQuestions 继续只表示验收待澄清。pendingClarification 不统计全部资源缺口；辅助笔记未集成时不属于 verify-report 的核验输入。

用例、结果、证据继续使用 v3；新运行 manifest 与报告使用 v4；执行台账、配置、worker 交付包使用 v1；查询视图使用 v2。既有 v3 运行保留原格式且可继续核验；下方 v0.1.3 段落是基础记录语义的历史背景，不表示新运行仍是 v3。并发字段与命令详见本文后部的 v0.1.4 章节。


当前 `0.1.5-dev`（沿用 v0.1.4 契约）：cases/baseline/results/evidence 仍为 v3；新 manifest/report 为 v4；配置、执行台账、worker 交付包为 v1。`schemas/manifest.schema.json`、`report.schema.json` 显式区分 v3/v4。以下 v3 字段语义继续适用，不代表所有新运行仍为 v3。并行调用见工具根的 `references/parallel-testing.md`，源码位于 `skills/ai-autonomous-testing-ego-lite/references/parallel-testing.md`。

`execution read` 默认返回 `schemas/execution-read.schema.json` 定义的摘要视图（`viewVersion:2`），支持单分派视图及显式 `--view full` 原完整输出；内部 `readExecutionView` 完整读取接口保持不变。摘要不写入 run，也不改变上述存档格式。摘要／单例默认只校验元数据，integrity 对象明示结果与证据未复核；加 `--integrity full` 可完整检查后仍返回紧凑内容，完整视图始终严格检查。轻量查询发现恢复标记只提示，不自动恢复。新报告使用“尚无结果／尝试记录”“已有尝试记录，尚无最终结论”，不从入账情况推断实际是否执行；下文 v0.1.3 展示说明保留其历史语义。

本指南定义用例、运行目录、证据登记请求、结果请求与进度/报告语义。Schema 文件放在 [`schemas/`](../schemas/)，均为 JSON Schema Draft 2020-12，并通过本地相对引用共享定义。运行代码会做额外的业务约束校验，例如证据归属、哈希核验、revision 和冻结澄清 veto。

命令中的 `scripts/ego.mjs` 相对于完整安装包根目录。源码使用者先构建，再从 `.build/runtime` 工具根运行，或使用该脚本的绝对路径。

## 版本策略

v0.1.3 的用例、运行 JSON、请求与 `report.json` 使用 `schemaVersion: 3`。`report.html` 是从通过校验的 v3 记录生成的离线呈现文件，不定义新的输入 schema。相较 v0.1.2 的 schemaVersion 2，本版增加 revision 化结果/证据 catalog、操作回执、证据 ID 关联和本地写入入口；结果及证据资产不再支持直接手工维护。旧运行目录和旧用例文件不会自动转换，也不提供迁移层。要使用 v3，请依据原始需求和来源重新整理用例并创建新运行；不要只改版本号，也不要改写历史基线来伪装新格式。

所有对象均为封闭格式，未知字段会被拒绝。ID 只允许 1–128 个 ASCII 字母、数字、点、下划线或连字符，首字符必须为字母或数字；`__proto__`、`prototype`、`constructor` 等危险属性名禁止使用。工具没有第三方运行依赖，需要 Node.js 22 或更新版本。

## 用例文件与冻结基线

用例根对象只含 `schemaVersion`、非空 `project` 和非空 `cases`。用例字段见 [`cases.schema.json`](../schemas/cases.schema.json)：

- `id`、`title`：非空；用例 ID 全局唯一。
- `basis`：恰好包含 `kind`、`source`、`text`。分类为 `explicit`、`interpretation` 或 `hypothesis`。
- `criticalConditions`：非空字符串数组，可为空；不能借空数组忽略已知前提。
- `expected`：必需的整体验收预期。
- `requiredPath`：必需；未指定时为 `null`。
- `stepOrder`：`strict` 或 `adaptive`。
- `steps`：有序且非空；每步必需 `id` 和 `action`，可选 `expected`。可选检查点有依据时才填写；省略不代表未执行或自动通过。
- `clarificationQuestions`：可选字符串数组。冻结用例中非空的问题阻止该用例所有最终结果及历史尝试使用 `pass` / `fail`。结果请求不能清除、替换或覆盖这些问题。

`start --project-dir ABS --cases ABS --output-dir ABS` 要求项目目录已存在而运行目录不存在。它校验用例，将规范化后的内容写入 `baseline.json`，并在 `manifest.json` 记录基线 SHA-256。结果与证据文件都从 revision 0 开始。哈希能发现普通更改，不是防篡改签名；绕过工具直接改本地文件不在其安全边界内。

新运行目录：

```text
run/
  baseline.json       # 冻结的 schemaVersion 3 用例
  manifest.json       # runId、基线 hash 与 schema 版本
  results.json        # 当前最终状态、历史尝试、结果操作账本
  evidence.json       # 证据 catalog 与证据操作账本
  evidence/           # evidence-add / import 留存文件
  execution.json      # v4 run 使用的 v1 台账：配置、分派、事件与导入进度
  workers/            # 分派回执、独立原始证据和封存包
```

真实项目、来源文件、运行、截图与报告应放在源码仓库之外。项目根用于读取明确的 execution-config.json；不遍历其他项目资料，显式传入的用例／证据按各自授权读取。

## 证据登记

不要直接往 `evidence/` 放文件并手工修改 catalog。先准备一个 UTF-8 JSON 请求文件，再运行：

```powershell
node .\scripts\ego.mjs evidence-add --run-dir $Run --request $EvidenceRequest
```

请求格式见 [`evidence-request.schema.json`](../schemas/evidence-request.schema.json)：

```json
{
  "schemaVersion": 3,
  "operationId": "evidence-config-01-first",
  "expectedRevision": 0,
  "caseId": "CONFIG-01",
  "sourceFile": "C:\\Users\\example\\AppData\\Local\\EgoLiteTest\\capture.png",
  "kind": "screenshot",
  "source": "测试期间保存的本地页面截图",
  "description": "合成配置页面的观察"
}
```

字段约定：

- `operationId`：本次登记的幂等 ID，在该运行的 evidence / result 操作空间内不可复用。
- `expectedRevision`：证据 catalog 的当前 `revision`；成功新登记后递增 1。
- `caseId`：必须关联冻结基线中的一个用例。
- `sourceFile`：绝对路径；来源必须是本地普通文件。逐级拒绝符号链接路径，并且不会删除或修改来源文件。
- `kind`：`screenshot`、`dom`、`tool_receipt`、`log` 或 `other`。
- `source`、`description`：由调用者提供的非空来源与说明。
- `capturedAt`：可选的来源提供采集时间，格式为 UTC ISO 8601。本字段未知时应省略，工具不从文件时间猜测。

工具先在运行目录独占锁下检查 revision 和源文件，将来源复制到唯一暂存文件，hash 与字节数基于实际复制的字节计算。它通过同卷独占硬链接将完整暂存文件安装到唯一最终名称，避免把部分复制文件暴露为最终证据；目标文件系统若不支持硬链接，登记会失败并清理本操作的文件。最终留存文件再独立核对。catalog 项包含唯一 `id`、相对 `path`、`caseId`、元数据、`sha256`、`bytes`、工具登记的 `collectedAt` 及操作 ID。返回值是后续 `record` 可使用的凭据；同一请求响应丢失后，用同一 ID 和相同 payload 重试会返回原回执。

SHA-256 只说明当前留存字节与 catalog 中的 hash 一致，不能证明文件真实、来源可信或结论正确。工具不自动脱敏，调用者需在复制前审查内容。

## 最终结果与历史尝试

结果请求格式见 [`record-request.schema.json`](../schemas/record-request.schema.json)：

```json
{
  "schemaVersion": 3,
  "operationId": "CONFIG-01-observation-1",
  "expectedRevision": 0,
  "caseId": "CONFIG-01",
  "mode": "attempt",
  "record": {
    "status": "inconclusive",
    "observed": "页面显示了合成配置名称，但刷新后的状态未观察。",
    "rationale": "这次观察不足以判断整体预期。",
    "remainingQuestions": ["是否要求刷新后仍能读取？"],
    "evidenceIds": ["替换为登记回执的 evidenceId"],
    "cause": "unknown"
  }
}
```

`record --run-dir ABS --request ABS_JSON` 支持 `mode: "final"` 和 `mode: "attempt"`：

- `final` 更新用例的当前最终状态，进度按此状态计数。状态可为 `pass`、`fail`、`inconclusive`、`blocked` 或 `not_run`。若替换已有最终观察，旧状态会保留为 `superseded_final` 历史快照，除非该相同观察已在历史中保存。
- `attempt` 追加一条操作观察，不改变当前最终状态。尝试需要自己的 `attemptId`、revision、时间与操作 ID。
- **历史尝试数组不含当前最终观察本身。** 它包含明确用 `mode: attempt` 写入的观察，以及被替换且此前没有保留的最终观察快照。progress 的当前状态计数不重复统计历史状态；历史尝试数包含这两类记录。
- `pass` / `fail` 必须有非空 `observed`、`rationale` 和至少一个已登记且属于同一用例的 `evidenceId`。`blocked` / `inconclusive` 必须给出 rationale。`not_run` 只适用于 final，不是已发生的 attempt。
- 冻结基线有非空 `clarificationQuestions` 时，工具同时拒绝最终结果及尝试的 `pass` / `fail`。请求只记录结果字段，不能更改 frozen basis、expected、steps 或澄清问题。
- `remainingQuestions` 描述结果/尝试仍有的问题；它不能代替或清除冻结用例中的 `clarificationQuestions`。

工具验证证据 ID 存在、属于该用例，并拒绝重复引用。结果操作在单文件原子替换后返回操作 ID 与 revision 回执。进程在提交成功后、回执返回前失败时，同一请求重试会从账本读取原回执，不会重复追加。

## ID、revision 与并发规则

- 每个写操作使用安全的唯一 `operationId`；同一个 ID、同一规范化 JSON payload（对象 key 顺序不影响）是幂等重试；内容不同则拒绝。
- 同一 run 的 evidence 和 result 操作 ID 共用唯一空间，避免跨类型误复用。
- 新操作的 `expectedRevision` 必须等于相应 catalog 或 results 的当前 revision。过期请求拒绝，调用者先查询最新 revision 再决定如何构造新操作。
- 每次 run 写入先以 `wx` 获取 `.run.lock` 独占锁，再读取和校验当前 revision。并发调用有一个获得锁，其他调用收到冲突错误；不会后台排队或自动重试。
- 遗留锁会拒绝写入。确认其 PID 对应进程已退出后，操作者可检查锁文件并处理。不要自动删除未知锁。
- `init`、`start`、报告和证据路径均拒绝目标覆盖；证据使用唯一名称。清理只针对由当前 operation 的暂存、marker 或唯一 evidence ID 生成的文件。

工具使用同目录临时文件、`fsync`（系统支持时）和单文件 rename 更新 JSON。证据先完整复制到暂存文件，再用同卷独占硬链接安装为唯一最终文件；不支持硬链接的文件系统会拒绝该次登记。它不提供跨 catalog、marker 与 evidence 文件的通用多文件事务或断电持久性保证。evidence 登记 marker 用于识别和恢复已知未提交/已提交操作状态；任何恢复结果仍会在 `check` 中核验文件 hash。运行目录不能被外部程序并发编辑。

## 进度、check 与报告

```powershell
node .\scripts\ego.mjs progress --run-dir $Run
node .\scripts\ego.mjs check --run-dir $Run
node .\scripts\ego.mjs report --run-dir $Run
```

`progress` 返回每个冻结用例的当前 status 计数、完成（`pass` / `fail`）、未完成（`not_run` / `blocked` / `inconclusive`）、待澄清用例，以及尝试数。`not_run` 表示尚未记录最终结论，不保证没有实际尝试；只有 `not_run` 且 attempts 为空的用例才算从未尝试。`hasUnexecutedCases` 只在至少存在一个从未尝试的用例时为 true；blocked 与 inconclusive 保持独立。`check` 会校验冻结 hash、封闭字段、关联、操作账本、路径和每条证据文件的 hash / 字节数。

`report` 写出 `report.json`、`report.md` 和独立文件 `report.html`，三个目标都拒绝覆盖。HTML 单文件内嵌页面样式、脚本、报告数据及通过 hash / 字节数核验的 PNG、JPEG、WebP 截图；可以直接双击离线打开，也可以只复制该 HTML 给获准查看者。HTML 内部包装格式为 `htmlPayloadVersion: 1`，其中 `report` 字段仍是经过校验的 schemaVersion 3 报告对象，图片数据放在独立 `previews` 映射中；该包装不是新的用例输入协议。它不引用 Run 目录、用户机器绝对路径、CDN、外部脚本或网络接口。概览分别统计用例总量、pass/fail/inconclusive/blocked/not_run、从未尝试数、已尝试但无最终结论数、待澄清数和历史尝试数。报告按用例展示冻结目标、关键前提、必经路径、顺序策略、依据、可选步骤预期、当前观察/理由、澄清与剩余问题、每条 attempt 历史及其剩余问题、已关联证据的来源/hash 元数据及必要的登记时间对照；可搜索、按当前状态筛选、展开历史并点图放大。工具不记录每步独立 verdict，因此报告不会推断步骤已完成，会明确标注这项限制。

业务状态、步骤覆盖与文件完整性分开展示；匹配 hash 仅说明生成时保存字节与 catalog 匹配，不能证明真实性或结论正确。证据卡会折叠展示来源、SHA-256 和登记时间；此 hash 只说明当前字节一致。没有截图会在对应记录下提示，但不会因此自动失败；AI 决定证据时机、是否补测及业务结论。若 PNG/JPEG/WebP 文件头符合类型但浏览器无法解码，报告显著提示图片无法显示，不伪造替代图。截图只接受 magic bytes 可识别的 PNG/JPEG/WebP 预览；SVG、HTML 等主动内容不作图片预览。哈希错误、悬空引用、冻结数据或结构无效会阻止报告生成；不会降级为看似可信的业务通过报告，校验失败时不创建输出。缺图或存在未执行/阻塞/待判断项目属于可显示的覆盖缺口，不是文件完整性错误。三份输出不是断电持久的多文件事务；发生进程/主机崩溃时可能只留下其中一部分，修复后需检查并移除或改名已存在的报告文件再重试。

合法结构只是记录格式合法，不代表操作者提供的结果经独立证实。报告和哈希不会自动证明业务正确性或缺陷归因。

## 命令速查

```text
node scripts/ego.mjs init --project-dir ABS
node scripts/ego.mjs validate-cases --cases ABS
node scripts/ego.mjs start --project-dir ABS --cases ABS --output-dir ABS
node scripts/ego.mjs evidence-add --run-dir ABS --request ABS_JSON
node scripts/ego.mjs record --run-dir ABS --request ABS_JSON
node scripts/ego.mjs progress --run-dir ABS
node scripts/ego.mjs check --run-dir ABS
node scripts/ego.mjs report --run-dir ABS
```

所有路径必须为绝对路径。命令仅对本地文件执行事实整理，不调用网络、模型、Ego 或浏览器，不自动选择测试路径或重试业务操作。v0.1.2 的 v2 文件需按原始来源重新准备并新建运行；不支持迁移。

## 报告交付扩展（html-report-delivery-1）

默认交付 HTML、JSON、Markdown；关键 UI 结论须有真实截图。`check` / `report` 增加 `evidenceCoverage`：登记截图数、不同留存内容数、最终结果未关联截图的用例 ID。它是机械统计，不判断证据是否充分，也不推导业务结论。可预览数由 HTML 实际内嵌的安全图片决定，浏览器解码仍须实际验证。

`report --run-dir ABS [--output-dir ABS_EXISTING_DIR] [--context ABS_JSON]` 默认写入 run，可指定已存在的仓库外新目录另存；三个目标任一存在即拒绝覆盖。生成后读回校验，返回文件绝对路径、大小、hash 和 browserOpen=not_checked。`verify-report --run-dir ABS --report-dir ABS` 可再核对；若当前 run、证据或整理来源变化会拒绝，不修改旧报告。

可选 `context` 遵循 [report-context.schema.json](../schemas/report-context.schema.json)，自身 schemaVersion=1、kind=retrospective，包含 summary、非空 limitations、sources（label/file/sha256）、supplementalCaseIds 与逐目标 reviews（caseId/status/rationale）。来源必须是当前存在的普通文件且 hash 匹配；reviews 必须覆盖每个源用例一次，状态为 verified/violation/inconclusive/not_tested。状态及理由由 AI 提供，工具只校验结构与引用。原用例与新增发现、原记录与本次复核分别展示；事后保存基线不能证明执行前冻结。

以上只扩展派生报告，不改变 cases / run / requests 的 schemaVersion 3，不自动迁移或删除历史。使用已确认根下的绝对脚本路径；`tool-info` 核对 0.1.3、revision、schema、路径和安装清单，独立安装资源不依赖仓库外相对链接。

## v4 执行与逐目标评估

新运行的 execution.json 按独占锁和 revision 保存用户配置、显式宿主信息、不可变初始 Space 清单、名额、分派、实际 Space 历史、原始 packet、AI review 和导入检查点。worker-draft/worker-packet/execution-request/execution Schema 定义新增对象；封存只计算与核对文件，不提交结论。导入保留原请求进行幂等恢复；未执行的 revision 冲突须显式新事务 rebase，不重试业务动作。

v4 report 保留业务结果与证据，另展示执行台账、配置与区间统计。逐目标评估来自明确的 AI 交付和复核，不从计划或工具成功倒推通过。名额峰值与 worker 提供、引用证据的区间峰值分别标注。既有 v3 报告通过当前内容或冻结 v0.1.3 框架指纹验证，历史文件不改写。
