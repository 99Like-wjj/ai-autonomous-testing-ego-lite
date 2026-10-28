# 可配置并发与独立交付

适用：多用例执行、worker 分派、Space 关联、暂停续接和结果汇总。这里描述可组合的数据能力；AI 决定执行路径、批次、重试／补测和结论，不要求按固定业务 DAG 行动。

跨终端使用前读[宿主条件与交接](host-compatibility.md)：本项目记录分派和交付，真实子 Agent 的创建、上下文、工具权限、等待与收尾由宿主提供。不能把 Skill 加载、名额登记或文件校验当成该宿主并行能力已验证。

## 用户配置与宿主限制

`start --max-parallel-cases N` 覆盖 `--execution-config ABS_FILE`，再覆盖项目 `execution-config.json`，最后默认 **1（串行）**。用户未要求并发且未明确配置时按 1 执行，不能因存在多例或可用宿主额度而自行提高。用户明确配置并发的 JSON 示例：`{"schemaVersion":1,"maxParallelCases":6}`。N 为可精确表示的正整数，没有固定的 2／4／8 路产品上限。配置是活动用例上限，不要求跑满，也不预先创建 N 个 Space 或线程。

AI 决定何时调用这些能力、哪些独立用例同时执行、何时补测／暂停，以及由当前会话还是 worker 执行；串行可以由当前 AI 逐例使用相同数据接口，不强制每例创建子代理。文件工具只校验请求、名额、所有权和证据，不调用宿主分派或 Ego，也不自动选择后续业务动作。使用交付包时仍须保留完整目标与显式复核；必要的文件写入顺序不是业务执行路线。

宿主限制只使用其明确提供的信息，不主动探测最大子代理数，不读取或更改全局客户端配置。未知时保持未知，分派被拒绝后记录事实；最大额度与当前可用名额不能混为一谈。模型／推理强度由宿主原生工具按用户要求选择，未指定时继承会话。

例如配置 8、本轮已知可用 3：保留配置 8，实际分批最多 3，并说明原因。若用户明确要求同时 8，不能以分批替代该目标。依赖或共享写冲突由 AI 判断；互不冲突的写用例可以并行。Space 不等于 cookie、账号或后端数据隔离，避免并行登录／退出或修改同一对象。

`capacity.availableWorkers` 保存**本 run 可占用的总活动分派上限，包含它已经占用的名额**。代码将它与配置上限取小，再与当前活动分派数比较；`reserved`、`running`、`lost`、`stop_requested` 都占用名额。它不是“还能再开几个”。例如本 run 已占 2，宿主明确说另有 1 个空闲且三者口径一致，可记录总容量 3；不能直接写 1。还要分清宿主额度是否包含协调者、是否被其他任务共享、观察是否仍有效；无法换算时保持 null，reason 与证据保留原口径及已知限制，不能臆造可用量。

## 协调者：共享事务的唯一写入者

```text
node ABS_TOOL_ROOT/scripts/ego.mjs execution read --run-dir ABS_RUN
node ABS_TOOL_ROOT/scripts/ego.mjs execution read --run-dir ABS_RUN --view assignment --assignment-id ID
node ABS_TOOL_ROOT/scripts/ego.mjs execution read --run-dir ABS_RUN --integrity full
node ABS_TOOL_ROOT/scripts/ego.mjs execution read --run-dir ABS_RUN --view full
node ABS_TOOL_ROOT/scripts/ego.mjs execution ACTION --run-dir ABS_RUN --request ABS_REQUEST_JSON
```

`read` 默认 `summary`，返回身份、revision、配置与计数，以及最多 20 个未完成分派、20 项待导入和最近 5 条 note 的摘要；`total`／`truncated` 明示列表省略，长原因提供带截断标志的预览。显示数量不限制用户并发。按需读 `assignment` 查看一个分派、Space 历史与相关交付引用；`full` 保留原完整输出。摘要的 `viewVersion:2` 与完整执行台账结构不同，不将摘要当作全量记录。

默认 summary／assignment 使用 metadata 检查：核对基线与执行台账，不重读 results／evidence 记录和历史证据文件；`integrity` 明示 `recordedResults/evidenceFiles:not_checked`。有待恢复标记只提示，不自动恢复。需要完整核验后仍只看摘要时加 `--integrity full`；`--view full` 保留原完整输出和严格检查，不能与 `--integrity metadata` 组合。严格路径沿用现有证据事务恢复规则。两种模式都不重新确认业务结论或宿主 worker 实时状态。AI 自主选择查询时机、视图和检查深度，不固定轮询或每次写前强制查询。

ACTION 为 `inventory / capacity / reserve / attach-space / note / set-limit / reconcile / import`。每个写请求包含：

```json
{"schemaVersion":1,"operationId":"unique-request-id","expectedRevision":0,"kind":"inventory","reason":"本次只读初始 Space 清单","spaceIds":[],"evidenceFiles":["coordinator/inventory.json"]}
```

`expectedRevision` 可取最近查询或已确认写回执的 `revision`；可复用回执，减少重复查询。遇到冲突后由 AI 按需读取并判断，不自动重试业务操作。先保留请求文件，响应丢失时原样重放，不修改同一 ID 的内容。`evidenceFiles` 必须位于本 run 内且已完整写入；空列表仅用于没有文件事实的普通数据记录，不能冒充实机保护证据。

| ACTION | 额外参数与语义 |
| --- | --- |
| inventory | `spaceIds` 是创建前全部现存 ID，仅首次登记，之后不清空／改写。只读列表，不读取既有 Space 页面内容。 |
| capacity | `availableWorkers: 数字或null`、reason 和可用证据；数字是本 run 可占用的总活动分派上限（含已占用），不是剩余空闲量。未知保持 null，不假设常数，不探测。 |
| reserve | `caseId`、当前 `baselineSha256`；可选 `resources`（AI 声明的互斥键）、`workerId/model/reasoning`。返回 assignment ID、独立目录，名额先登记再分派。 |
| attach-space | `assignmentId/spaceId/name/receiptFile/created:true`；创建回执须在该分派目录内。不能 claim 初始 Space 或其他分派 Space。恢复更换默认 Space 须 `replaceDefault:true` 与原因，保留历史。 |
| set-limit | `maxParallelCases`；提高不自动启动，降低停止新增并等待既有执行结束，不强杀。 |
| reconcile | `assignmentId/state/inFlight` 和事实原因，可附 worker/model/reasoning。`running/stop_requested/lost` 用 `inFlight:true` 保留名额；确认无在途后才可 paused/stopped/completed/failed。completed 只表示 worker 结束，不等于业务通过。 |
| note | `category: observation/space-deviation/skill-bug/external-change/cleanup`；可含 assignmentId、实际 spaceIds（null 表未知）、证据。记录偏差与 Skill 问题，不自动改产品结论。 |
| import | `packetFile` 与显式 AI `review`，见下文。 |

`reserved` 也占名额；超时不自动回收。继续暂停任务要重新检查容量与资源。一个 case 同时只保留一个活动分派；上一分派结束后可新建执行尝试，不删除旧失败。可复用空闲 worker，重新传入完整用例、权限、目录和新的 Space 关联；不要继承旧 case 上下文。

## Worker：只负责当前用例与自己的目录

接收冻结用例、run ID／基线 hash、assignment／attempt ID、默认 numeric Space ID、权限与目录。操作前读当前官方 Ego 指南，每轮脚本使用该 ID；脚本和截图使用新文件名。只执行被分派用例，不自行修改其他 case、不递归创建测试 worker、不写公共 results/evidence/execution 文件。

按[跨宿主交接约定](host-compatibility.md)补足当前 ToolRoot/版本、可读材料与实际用户答复，核对宿主实例及后台调用 handle；不能默认子 Agent 已继承父会话。assignment.json 是分派标记，不包含这些全部上下文。

单用例默认一个 Space；允许 Agent 出错或在授权内恢复。保留实际 ID、错误、尝试和证据，未知写入先独立只读对账，不盲目重放。原 Space 不可用时，协调者可在已有授权内评估恢复，并记录前后关联；用户接管或权限未知时停下，不强行 claim。仅改变 Space 不自动构成产品缺陷，身份、数据、必要语义和证据影响须由 AI 复核。

每个关键 UI 结论／缺陷保留真实截图；截图失败也保存错误，按实际证据决定无法判断，不伪造图。Windows 自有窗口出现零视口／最小化时，可依据当前官方 API 和授权检查并恢复自己的窗口；先读回副作用，保留首错。不要操作用户原有窗口、清全局 cookie 或换 profile。

### 创建草稿并封存

在 `workers/<assignmentId>/` 内写 UTF-8 草稿，结构见 `schemas/worker-draft.schema.json`：

`packetId` 必须在**整个 run** 内唯一，不能仅在 worker 目录内唯一。协调者可把 assignment ID 作为命名空间交给 worker，例如 `<assignmentId>-observation-1`；具体命名由 AI 选择，但不同交付不得重名。封包是局部事务，其他 worker 重名可能直到导入才被发现。冲突时保留两份原包，从已有观察另存唯一 ID 的新草稿和包，说明关联；不覆盖已封存文件，也不为改包名重跑业务。

```json
{
  "packetId":"asg-example-one-observation-1",
  "mode":"final",
  "record":{"status":"inconclusive","observed":"实际观察","rationale":"尚有目标证据不足","remainingQuestions":["具体未验证项"],"evidenceKeys":["shot"],"cause":"unknown"},
  "evidence":[{"key":"shot","path":"captures/observation-1.png","kind":"screenshot","source":"本次 Ego 截图","description":"该用例的实际页面"}],
  "goalAssessments":[{"targets":["expected","step:open"],"status":"inconclusive","observed":"实际观察","rationale":"逐项说明已知事实与缺口","evidenceKeys":["shot"]}],
  "spaceUsage":[{"spaceId":123,"reason":"实际回执对应本次默认 Space","evidenceKeys":["shot"]}]
}
```

示例不能原样套用目标列表。目标引用须完整覆盖：`expected`、每个 `step:<冻结步骤id>`、每个 `condition:<从0起的索引>`，以及非空的 `requiredPath`。共用事实可放在同一 assessment 的 `targets` 数组中；不同结论分别列。状态为 `verified / violation / inconclusive / not_tested`，分别表示已验证、发现违反、无法判断、未测试。不得省略必要语义以通过结构校验，也不能把未知目标报已验证。

记录 pass 要所有目标已验证；fail 要有明确违反目标。结构校验不替 AI 解释业务。剩余问题不允许用改写原预期解决。日志可补充截图；如果无法支持关键 UI 结果，应调整为有事实支持的状态并说明缺口。

可提供 `executionWindow:{startedAt,endedAt,evidenceKeys}`，时间来自实际执行记录，UTC ISO 格式；仅用于报告有来源的区间重叠，不能伪造为实机测量。未知 capture 时间不填写 capturedAt。

```text
node ABS_TOOL_ROOT/scripts/ego.mjs packet-seal --run-dir ABS_RUN --assignment-id ASSIGNMENT_ID --draft ABS_WORKER_DRAFT
```

工具从不可变分派回执和基线补齐身份，计算当前普通文件的 SHA-256／字节数，生成该 worker 目录的 `packet-<packetId>.json`；不占共享锁、不提交结论。相同内容可取回原封存回执，内容变化不覆盖原文件。补测用新草稿／packet ID，保留首次错误。向协调者交付 packet 绝对路径、未完成项、实际 Space 与在途调用状态；未结束的 exec/session 必须继续观察同一 handle，不能把观察超时当退出或重启业务。

## 协调者复核与导入

先看冻结目标、真实截图和观察，再明确接受或修订；不能只因 worker 返回成功就通过。

```json
{"schemaVersion":1,"operationId":"case-one-import-1","expectedRevision":5,"kind":"import","reason":"按冻结目标复核交付","packetFile":"ABS_WORKER_PACKET","review":{"decision":"accept","reviewer":"当前协调 AI","rationale":"说明目标、事实和证据是否对应"}}
```

修订用 `decision: revise`，提供明确的 `record`、`goalAssessments` 或 `mode` 替换及理由；原始 packet 不变。迟到观察若不能替代较新 final，可明确 `mode: attempt` 保存为历史。工具先入账证据再记录结果，并保留准备好的原始请求，响应丢失时重放数据事务，不重做页面业务。

部分导入显示 pending。确认另一写入导致尚未执行的请求 revision 冲突时，可读取当前事实、创建**新的 operationId**，显式 `rebaseOf: 原导入operationId`。它保留原事务、复用已确认入账证据，创建新的未执行数据请求；若旧结果已提交，应先恢复原回执。不得修改旧 expectedRevision 后沿用旧 ID。

## 资源缺口的协作

按[资源充分性指南](resource-readiness.md)判断依赖和可继续范围。worker 发现新缺口时暂停依赖动作，通过现有 record/goalAssessments/证据包交回事实和问题；协调者合并重复提问并分发实际答复。不得让多个 worker 并发覆盖共享资源笔记，或各自扩权、代答。

资源齐备不代表可并发，reserve 的 resources 只是互斥键。恢复前核实条件、在途调用和副作用；满足原条件才继续，改变冻结语义则修订基线。缺口不自动回收活动名额，也不自动重放业务。串行需要显式逐目标报告时可由当前 AI 使用既有封包/复核导入，无须创建子代理；未开展 UI 的包如实说明没有使用 Space（现有未知 ID 记录附原因），不为提问创建 Space。

## 报告、保护与清理

协调者统一查询进度并生成 HTML／JSON／Markdown；worker 不高频轮询公共进度。报告分开呈现配置、已知容量、名额峰值、worker 提供的执行区间、逐目标状态、首次失败／尝试、Space 偏差、未完成／待导入项和 Skill 问题。文件校验与业务结论分别说明。

关键证据和可交付报告保存后，仅在 Ego 当前所有权仍匹配时对本次拥有的精确 ID 执行一次 finish 并等待返回，再独立读回。测试出产品异常仍可作为已完成观察交付；因浏览器错误／用户控制而停止时保留现场，不能借清理强行接管。`note category:cleanup` 需要 inactive 分派、精确 spaceIds、独立读取的 remainingSpaceIds 与证据文件，不执行实际关闭。缺失原有 Space 或安装变化单独归因，不恢复／接管用户资产。

真实测试遇到 Skill 问题时，保留复现步骤、输入、错误、源码／工具指纹、影响和证据，与产品候选缺陷分开；若用户要求先讨论修复，不在该轮真实测试中改代码或换工具版本。
