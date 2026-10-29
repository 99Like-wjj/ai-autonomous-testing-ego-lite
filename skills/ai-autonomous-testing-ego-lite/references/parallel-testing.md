# 可配置并发与独立交付（v6）

v6新增上下文、实际动作、现象、复现准备与发现关系。worker record与串行record同形；context.sourceEvidenceIds、action.evidenceIds、evidenceLinks、phenomena、findings及metadata.contextEvidenceIds中的本地键全部在导入时映射。上下文图依赖须在包内可解析且无环；不能通过跨case引用绕过归属检查。缺口、图像尺寸及操作回执都不自动决定业务状态。

AI 自主选择批次、路线、补测与结论；本地工具仅保存分派、文件和显式评估。串行直接 record 即可得到完整目标报告，不需要虚构 worker、初始 Space 清单或封包。

跨终端使用前读[宿主条件与交接](host-compatibility.md)：真实执行者的创建、上下文、权限、等待与收尾由宿主提供，不能把 Skill 加载、名额登记或文件校验当成并行链路已验证。

## 并发与共享写入

maxParallelCases 默认 1。用户未要求并发且没有明确配置时逐条执行。配置正整数只规定上限，不要求跑满；宿主容量只使用明确已知信息，不主动探测或改全局设置。配置文件为 {"schemaVersion":6,"maxParallelCases":6}，优先级为 start 显式数值、指定配置文件、项目配置、默认值。

协调者是 run 共享文件唯一写入者，worker 只写分派目录。AI 判断身份、数据、共享对象和互斥资源；Space 不保证 Cookie、账号或后端数据隔离。模型与推理强度继承用户选择，不自行创建独立模型服务。

capacity.availableWorkers 是本 run 可占用的总活动分派上限，含 reserved/running/lost/stop_requested 已占名额，不是还能新增的数量。例如本 run 已占 2，宿主另有 1 个空闲且口径一致，可记录总量 3，不能写 1。还需核对是否含协调者、是否与其他任务共享及观察时效；无法换算保持 null，reason 和证据保留原口径，不臆造容量。

## 执行台账

```text
node ABS_TOOL_ROOT/scripts/ego.mjs execution read --run-dir ABS_RUN
node ABS_TOOL_ROOT/scripts/ego.mjs execution read --run-dir ABS_RUN --view assignment --assignment-id ID
node ABS_TOOL_ROOT/scripts/ego.mjs execution read --run-dir ABS_RUN --integrity full
node ABS_TOOL_ROOT/scripts/ego.mjs execution read --run-dir ABS_RUN --view full
node ABS_TOOL_ROOT/scripts/ego.mjs execution ACTION --run-dir ABS_RUN --request ABS_REQUEST
```

摘要与单例视图默认检查 metadata，明示 results/历史证据未复核；full integrity 可完整检查后仍只返回摘要，full view 严格核验。viewVersion 为 6。total/truncated 显示省略，不能把摘要当全量。工具不证明 worker 实时状态或业务完成，不固定轮询。

ACTION 包含 inventory、capacity、reserve、attach-space、note、set-limit、reconcile、import。请求统一 schemaVersion 6、唯一 operationId、expectedRevision、kind、reason；具体必填字段读当前 schemas/execution-request.schema.json。对初始 Space、分派、所有权、证据路径和在途状态的结构保护仍有效。

- inventory 记录创建前实际全部 Space ID，不补造、不追溯伪装；不读取用户原有页面。
- reserve 声明 caseId、baselineSha256 和必要互斥资源，先登记名额再分派；reserved 也占名额，超时不自动释放。
- attach-space 使用当前分派目录内真实创建回执，记录精确 numeric ID。恢复更换保留旧关联与原因；不能 claim 初始或其他分派 Space。
- reconcile 如实记录 running/stop_requested/lost 的在途状态；确认无在途才可结束或暂停。completed 是 worker 结束，不代表业务通过。
- note 保留偏差、外部变化、Skill 问题或清理证据；产品结论由对应业务评估另记。

响应丢失使用同一请求取回数据回执；冲突由 AI 读取现状并决定，不自动改 revision 重试业务。未知写入先读回，不能借换 Space 重做。默认单例一个 Space，偏差保留而非自动判产品失败。

## Worker 草稿与封包

worker 接收冻结 case、run/基线 hash、assignment ID、权限与专属目录，读取当前 Ego 官方指南。保存新文件名的截图与原始观察，不修改公共文件，不执行其他用例或递归创建测试 worker。

交接同时明确实际 ToolRoot/版本、worker 可读材料、用户真实答复、宿主实例和后台命令 handle；assignment.json 不包含全部父上下文。按[交接约定](host-compatibility.md)核对共享读取、专属写入和在途状态，不能把 worker 结束当成其命令已停止。

单用例默认一个 Space；出错或在已有授权内恢复时保留精确 ID、原始错误和前后关联，未知写入先只读对账。用户接管或权限未知时停止后续动作，不强行 claim；更换 Space 不自动证明产品缺陷，身份、数据、必要语义和证据影响由 AI 复核。

草稿中的 record 与串行完全同形，仅 evidenceIds 使用本包 evidence 声明的 local key；import 会映射为已登记 catalog ID。没有单独 goalAssessments，也不把步骤/条件赋予四态。

`packetId` 必须在**整个 run** 内唯一，不能仅在 worker 目录内唯一。协调者可把 assignment ID 作为命名空间交给 worker，例如 `<assignmentId>-observation-1`；具体命名由 AI 选择，但不同交付不得重名。封包是局部事务，其他 worker 重名可能直到导入才被发现。冲突时保留两份原包，从已有观察另存唯一 ID 的新草稿和包，说明关联；不覆盖已封存文件，也不为改包名重跑业务。

```json
{
  "schemaVersion":6,
  "packetId":"asg-example-one-observation-1",
  "mode":"final",
  "record":{
    "observations":[{"id":"visible-state","summary":"实际页面已显示目标对象，但尚未独立读回。","coveredRefs":["step:create"],"evidenceIds":["shot"]}],
    "assessments":[{"goalId":"saved-content","status":"inconclusive","rationale":"缺少要求的持久化读回。","observationIds":["visible-state"],"gaps":["未完成 step:readback。"]}]
  },
  "evidence":[{"key":"shot","path":"captures/observation-1.png","kind":"screenshot","source":"本次 Ego 截图","description":"本次实际页面"}],
  "spaceUsage":[{"spaceId":123,"reason":"实际回执对应本次 Space","evidenceKeys":["shot"]}]
}
```

示例不是执行事实。diagnosis.evidenceIds 同样使用 local key，spaceUsage 和可选 executionWindow 继续使用 evidenceKeys。实际执行区间时间须有来源，未知不补造；没有使用 Space 的观察如实描述，不能为提交评估新建无用页面。

```text
node ABS_TOOL_ROOT/scripts/ego.mjs packet-seal --run-dir ABS_RUN --assignment-id ID --draft ABS_DRAFT
```

工具核对本目录普通文件、计算 hash/大小并补齐不可变分派身份，封存 packet，不提交业务结果。相同内容可取回原回执，新观察用新 packet ID，不覆盖首次异常。交回 packet 路径、缺口和真实在途状态；尚未结束的调用继续观察原 handle，超时不等于退出。

## 协调者复核与统一入账

复核冻结目标、观察、关键截图及必要语义，显式 accept 或 revise。accept 不等于业务通过；修订提供 record 或 mode 及理由，原包保留。请求例如：

```json
{"schemaVersion":6,"operationId":"case-one-import-1","expectedRevision":5,"kind":"import","reason":"按冻结目标复核交付","packetFile":"ABS_WORKER_PACKET","review":{"decision":"accept","reviewer":"当前协调 AI","rationale":"目标与事实已逐项对照，保留未完成部分。"}}
```

import 先登记证据，再按同一 record 契约写 results.entries。final 按 goal 增量更新，attempt 仅留历史；迟到观察不应覆盖较新结果时由协调者显式选择 attempt。partial import 显示 pending；数据事务恢复复用已登记证据，原请求和历史不改。仅在确认未提交请求发生 revision 冲突时，使用新 operationId 和 rebaseOf 指向旧导入，不修改同 ID 内容。

worker 发现资源缺口时只暂停依赖动作，交回 observations/assessments/gaps；协调者合并实际提问并传回答复，核实后恢复，不让多个 worker 覆盖同一资源笔记或自行扩权。

## 报告和清理

串并行均从同一 results 读取目标四态，执行台账另呈现分派、容量、Space 偏差、导入状态与 Skill 问题。文件校验不是业务验证。关键 UI 结论需真实截图，缺失按[证据指南](evidence-and-report.md)复核。

保存证据与可交付报告后，仅在所有权仍匹配时关闭本次精确 Space ID，等待 finish 回执并独立读回。cleanup note 保存 inactive 分派、精确 spaceIds、remainingSpaceIds 和证据，工具不执行关闭。用户/其他任务 Space、Cookie 和安装不擅自处理。若用户要求先讨论修复，不在真实测试中改代码或切换工具版本。
