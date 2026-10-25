# 本地工具箱调用指南（v0.1.5-dev）

`execution read` 默认只给摘要；单分派用 `--view assignment --assignment-id ID`，需要完整结构时显式 `--view full`。默认摘要／单例只检查元数据并明示历史证据未复核；`--integrity full` 可完整检查后仍返回摘要，完整视图始终严格检查，详见[并发指南](parallel-testing.md)。报告“尚无结果／尝试记录”只描述入账情况，不能由此断言用例未执行；执行状态和业务结论分别查看。

工具只做本地数据事务与报告渲染。默认测试交付需要 HTML、JSON、Markdown；工具不可用应报告阻塞，不能以 Markdown 退回冒充完成。

## 确认实际根目录与版本

独立安装／测试编译包的 `ToolRoot` 是本次实际加载的 `SKILL.md` 所在绝对目录，包含 `scripts/`、`schemas/`、`docs/`、`examples/` 和 `runtime-manifest.json`。源码采用 TS；先在已确认仓库执行 `npm ci`、`npm run build`，工具根为该仓库的 `.build/runtime`。安装用户只需 Node.js >=22，无需编译器。不要把源码 `skills/ego-lite-test` 子目录当作工具根，不向上猜目录，也不自动更新用户安装。

```powershell
$ToolRoot = 'ABS_ACTUALLY_LOADED_SKILL_ROOT'
$Tool = Join-Path $ToolRoot 'scripts/ego.mjs'
node $Tool tool-info --expect-version 0.1.5-dev --expect-revision resource-clarification-3
```

核对 toolRoot、skillFile、版本、revision 与 `formatVersions`（cases/results/evidence 为 3，manifest/report 为 4，execution/configuration/workerPacket 为 1）。构建包与独立安装均须 `installationIntegrity: verified`。指纹对应实际交付的编译 JS 与资源，不认证发布者。每次 CLI 也检查安装清单，缺失、混用或改动先报告，不覆盖不明用户修改。读取此根目录的格式指南和所需 Schema，命令始终指向同一绝对脚本路径。

## 边界

- 工具只读取/写入用户给定的本地文件；不联网、不调用模型或 Ego、不操作浏览器、不生成测试数据、不自动判断 bug、不选择执行路径、不重试业务动作。
- 工具将指定普通文件复制到 run 的 `evidence/`。登记前先按用户要求缩小范围并检查敏感内容；工具不会脱敏。
- `capturedAt` 仅来自来源提供的采集时间。未知时省略；`collectedAt` 由工具独立登记。
- SHA-256 只校验留存字节与 catalog 值一致，不能证明真实性、来源身份或结论正确。
- 业务用例／结果／证据沿用 v3，新建执行的 manifest/report 为 v4，新增配置／执行台账／交付包为 v1。已有 v3 run 不原地升级，可继续核验／记录并另存报告；v0.1.2 的 v2 仍不支持，不改版本号冒充兼容。

## 复用工具记录资源缺口

按[资源充分性指南](resource-readiness.md)由 AI 判断前提、缺口及可继续范围。用现有 `observed/rationale/remainingQuestions` 记录事实和问题，`evidence-add` 保存必要脱敏依据，或通过既有 worker 包和显式目标评估导入；不改冻结的验收问题。`progress` 只给状态与用例 ID，`pendingClarification` 只统计冻结验收疑问；要看当前缺口详情按需用 `check` 读完整 case 记录。

辅助资源笔记不自动受 `verify-report` 校验，必要依据进入现有结果/目标评估/证据链。资源恢复后新增观察，保留原受阻记录；只有原冻结语义保持时才继续同一基线。工具不因收到回答自动判就绪或重试业务。

同一问答或核验事实按需用 `evidence-add` 登记普通文本/JSON 副本，后续结果引用回执中的证据 ID；准备摘要复用相同来源或注明截至时点，不复制成另一份当前事实。沿用现有证据和结果修订保存变化，工具不解析文字来决定资源齐备或下一动作。

## 创建和检查运行

项目用例须符合 `schemas/cases.schema.json`。在源码仓库外保存项目和 run，使用绝对路径；run 目标目录须不存在。

```text
node "ABS_TOOL_ROOT/scripts/ego.mjs" validate-cases --cases ABS_CASES_JSON
node "ABS_TOOL_ROOT/scripts/ego.mjs" start --project-dir ABS_PROJECT_DIR --cases ABS_CASES_JSON --output-dir ABS_RUN_DIR --max-parallel-cases 3
```

`start` 只冻结基线、创建初始 `not_run`、证据索引和执行台账，不执行浏览器操作。并发配置和 worker 交付见 [并发指南](parallel-testing.md)；新运行优先用独立交付和协调者导入，workers 不并发调用下述共享写命令。

## 登记证据

1. 读取 run 当前 `evidence.json` 的 `revision`，用作新请求的 `expectedRevision`。读取仅用于确定版本，不要手工改写 catalog。
2. 为请求分配新的安全 `operationId`，指定基线 `caseId`、已有本地普通文件 `sourceFile`、`kind`、`source` 和 `description`。未知的 `capturedAt` 不要填写。
3. 保存 UTF-8 JSON 请求，然后运行：

```text
node "ABS_TOOL_ROOT/scripts/ego.mjs" evidence-add --run-dir ABS_RUN_DIR --request ABS_REQUEST_JSON
```

4. 将返回的 `evidenceId` 用于同一 `caseId` 的结果或 attempt。返回值包含 operation ID、revision、path、SHA-256、字节数和 collectedAt。

证据请求由 helper 按单 writer 锁下的 revision 校验。符号链接路径、非普通文件、目标覆盖、错误关联、非法时间、过期 revision 和 ID 冲突都会拒绝。不要将源路径、密钥或真实业务数据放进公开示例。

## 记录最终状态与 attempt

从当前 `results.json` 的 `revision` 读取结果 revision。请求示例：

```json
{
  "schemaVersion": 3,
  "operationId": "CONFIG-01-final-observation",
  "expectedRevision": 0,
  "caseId": "CONFIG-01",
  "mode": "final",
  "record": {
    "status": "inconclusive",
    "observed": "合成观察：页面状态无法确定整体预期。",
    "rationale": "现有证据不足以确认已满足或违反预期。",
    "remainingQuestions": ["是否要求刷新后仍能读取？"],
    "evidenceIds": [],
    "cause": "unknown"
  }
}
```

`mode: final` 更新当前最终状态。`mode: attempt` 追加一次观察但保持当前最终状态不变。attempts 数组不含当前最终观察；包含显式 attempt 与尚未在历史中出现的旧 final 快照。相同状态如果是有意的新一次观察，使用新的 operation ID；相同请求重试必须使用原 operation ID 和原始 payload。

`pass` / `fail` 必须包含实际观察、判断理由及同一用例关联的已登记证据 ID；`inconclusive` / `blocked` 必须提供理由；`not_run` 只适用于 final。冻结基线存在未解 `clarificationQuestions` 时，final 与 attempt 都禁止 `pass` / `fail`。请求不能更改需求 basis、步骤、预期或冻结问题。

## 幂等、冲突和响应丢失

- 每个写请求有唯一 `operationId`，证据与结果操作共用此 ID 空间。
- 同一 ID 和相同 JSON 内容（对象 key 顺序不敏感）重试时返回原回执，不重复追加。
- 同一 ID 的 payload 变化会拒绝；新 ID 使用过期 revision 也会拒绝。
- helper 在读 revision 前先获取 run 级独占锁。并发写者不会自动排队。
- 若提交后响应丢失，先用 `check` 或 `progress` 查看当前状态；按原请求同 ID、同内容重试可取回原回执。不要用新 ID 重做未知结果的操作。
- 遗留锁会阻止写入；先确认没有对应运行进程，再检查锁文件。不要自动删除未知锁。

## 查进度和报告

```text
node "ABS_TOOL_ROOT/scripts/ego.mjs" progress --run-dir ABS_RUN_DIR
node "ABS_TOOL_ROOT/scripts/ego.mjs" check --run-dir ABS_RUN_DIR
node "ABS_TOOL_ROOT/scripts/ego.mjs" report --run-dir ABS_RUN_DIR
node "ABS_TOOL_ROOT/scripts/ego.mjs" verify-report --run-dir ABS_RUN_DIR --report-dir ABS_RUN_DIR
```

进度只按每个基线用例的当前 final 状态统计；历史失败不重复计入当前失败。`not_run` 表示尚无最终结论，可与 attempt 并存；`not_run` 且没有 attempt 表示尚无结果／尝试记录，不能据此断言实际未执行。`blocked`、`inconclusive` 和待澄清分别保留。`report` 会创建 `report.json`、`report.md` 和自包含 `report.html`；任一目标已存在就拒绝覆盖。可单独复制 `report.html` 并在无网络的浏览器中打开，不引用 Run 路径或外链。HTML 显示冻结目标、关键条件、必经路径、顺序策略、观察、理由、依据、未验证项、逐条历史尝试剩余问题和证据来源/hash 元数据；只预览 hash / 大小校验通过的 PNG/JPEG/WebP。缺图会说明但不自动判失败；可识别图片头但浏览器无法解码时会显示错误提示，不使用替代图。哈希错误、悬空引用或结构无效时会拒绝生成报告，不生成带缺口的可信通过外观。

报告只是结构有效的 AI 记录与文件一致性结果，不是独立验证的结论。v4 展示显式逐目标评估、并发配置／区间、分派、Space 历史和执行异常；计划步骤本身不证明已执行，缺少评估不能从摘要倒推通过。旧 v3 只保留原有用例／attempt 口径。已有 v0.1.3 报告可用冻结框架指纹和当前数据核验，不改写历史文件；未知框架或内容变更会拒绝。不要自动上传原始报告。


默认交付三个文件的实际绝对路径。生成回执包含文件读回校验、字节数与 SHA-256；`browserOpen: not_checked` 表示尚未验证浏览器打开，不能改称已验证打开。关键 UI 结果及缺陷须有关联真实截图；取证节点由 AI 决定，不强制逐步截图。摘要不能替代截图，缺图须复核结论并展示缺口。

已有报告不得覆盖。另存报告时先准备新的仓库外目录，传 `report --run-dir ABS_RUN --output-dir ABS_EXISTING_NEW_DIR`；事后整理再传 `--context ABS_CONTEXT_JSON`。context 的 v1 格式见工具根 `schemas/report-context.schema.json`，仅扩展报告展示，不修改源 run。它要求说明整理性质/限制、现有来源文件与 hash、补充用例和 AI 提供的逐目标复核；不捏造执行前基线或采集时间。文件存在、引用校验和实际浏览器打开是独立事实。
