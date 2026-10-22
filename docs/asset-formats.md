# 本地资产格式与运行约定（schemaVersion 3）

本指南定义用例、运行目录、证据登记请求、结果请求与进度/报告语义。Schema 文件放在 [`schemas/`](../schemas/)，均为 JSON Schema Draft 2020-12，并通过本地相对引用共享定义。运行代码会做额外的业务约束校验，例如证据归属、哈希核验、revision 和冻结澄清 veto。

## 版本策略

v0.1.3-dev 的所有用例、运行资产、请求和报告使用 `schemaVersion: 3`。相较 v0.1.2 的 schemaVersion 2，本版增加 revision 化结果/证据 catalog、操作回执、证据 ID 关联和本地写入入口；结果及证据资产不再支持直接手工维护。旧运行目录和旧用例文件不会自动转换，也不提供迁移层。要使用 v3，请依据原始需求和来源重新整理用例并创建新运行；不要只改版本号，也不要改写历史基线来伪装新格式。

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
  evidence/           # evidence-add 复制进来的文件
```

真实项目、来源文件、运行、截图与报告应放在源码仓库之外。目录中的绝对项目路径只作为上下文元数据，不会被工具访问。

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

`progress` 返回每个冻结用例的当前 status 计数、完成（`pass` / `fail`）、未完成（`not_run` / `blocked` / `inconclusive`）、待澄清用例，以及尝试数。`hasUnexecutedCases` 只在当前最终状态为 `not_run` 时为 true；blocked 与 inconclusive 保持独立。`check` 会校验冻结 hash、封闭字段、关联、操作账本、路径和每条证据文件的 hash / 字节数。`report` 生成 `report.json` 和 `report.md`，转义 Markdown 文本并拒绝覆盖。

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
