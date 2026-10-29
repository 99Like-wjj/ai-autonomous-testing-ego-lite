# 本地工具箱调用指南（0.1.6-rc.1）

工具只做本地数据事务与报告渲染，不联网、不调用模型或 Ego、不选择执行路线、不自动重试业务。业务四态与证据充分性由 AI 判断。完整格式以已确认工具根的 docs/asset-formats.md 和 schemas 为准。

## 工具根与格式

完整安装/独立构建包的 ToolRoot 是实际加载的 SKILL.md 所在目录。源码先在已确认仓库 npm ci、npm run build，再使用 .build/runtime；不要把源码 skills 子目录当安装根或自动替换用户级安装。

```powershell
$ToolRoot = 'ABS_ACTUALLY_LOADED_SKILL_ROOT'
$Tool = Join-Path $ToolRoot 'scripts/ego.mjs'
node $Tool tool-info --expect-version 0.1.6-rc.1 --expect-revision native-network-observation-1
```

核对 toolRoot、skillFile、formatVersions（统一为 5）和 installationIntegrity: verified。未知修改或混用先报告。此开发候选版不接受旧格式，不提供旧 run 读取或自动转换；历史文件保留原样。不要只改 schemaVersion，也不要为升级覆盖旧数据。

链接安装入口先取得非空 tool-info 回执，再使用其返回的真实 toolRoot；退出码 0 不替代回执与产物。各宿主入口、上下文和生命周期条件见[跨宿主指南](host-compatibility.md)。当前整合包使用 v5，不沿用独立修复分支的旧契约。

## 创建运行与保存证据

真实项目和运行放在仓库外私有目录；命令使用绝对路径。先生成/审阅 v5 用例，再校验与冻结：

```text
node ABS_TOOL_ROOT/scripts/ego.mjs validate-cases --cases ABS_CASES_JSON
node ABS_TOOL_ROOT/scripts/ego.mjs start --project-dir ABS_PROJECT_DIR --cases ABS_CASES_JSON --output-dir ABS_NEW_RUN_DIR
node ABS_TOOL_ROOT/scripts/ego.mjs evidence-add --run-dir ABS_RUN_DIR --request ABS_EVIDENCE_REQUEST
```

start 只保存基线与空结果账本，不执行业务，也不自动填 not_tested。并发默认 1；需要分派时读[并发指南](parallel-testing.md)，串行直接 record，不需要 worker 或初始 Space 清单才能记录目标结果。

证据请求使用 schemaVersion 5、唯一 operationId、当前 evidence revision、caseId、sourceFile、kind、source、description；capturedAt 仅在来源已知时提供。工具复制普通文件、核对留存字节并返回 evidenceId。登记前检查敏感内容，工具不自动脱敏；哈希不证明来源真实性。

## 串行目标结果

读取当前 results revision，使用以下结构提交真实观察。合成例只示范格式，不代表已执行：

```json
{
  "schemaVersion":5,
  "operationId":"config-first-observation",
  "expectedRevision":0,
  "caseId":"CONFIG-01",
  "mode":"final",
  "record":{
    "observations":[{
      "id":"page-after-save",
      "summary":"页面显示新名称，但尚未重新读取同一对象。",
      "coveredRefs":["step:create"],
      "evidenceIds":[]
    }],
    "assessments":[{
      "goalId":"saved-content",
      "status":"inconclusive",
      "rationale":"缺少目标要求的独立读回，尚不能判断保存结果。",
      "observationIds":["page-after-save"],
      "gaps":["尚未完成 step:readback。"],
      "diagnosis":{"state":"unknown","category":"unknown","summary":"现有观察不支持归因。","evidenceIds":[]}
    }]
  }
}
```

```text
node ABS_TOOL_ROOT/scripts/ego.mjs record --run-dir ABS_RUN_DIR --request ABS_RECORD_REQUEST
```

observations 记录实际事实、覆盖的必要语义与同用例证据 ID；assessments 引用观察并分别判断目标。verified/violation 必须有足够实际观察与登记证据，verified 不能隐藏 requiredRefs 的缺口。冻结目标待澄清时不能给 verified/violation。工具校验引用和结构，AI 判断事实是否充分。

final 仅更新本次显式提交的目标，其他目标当前评估不变；attempt 留在 entries 历史，不改变当前评估。所有 entries 保留，不覆盖首次异常。缺少 assessment 是入账缺口，不是第五种业务状态，也不能自动填为未测试。根因未知可以与发现违反并存，详见[判断指南](judgment-and-diagnosis.md)。

资源缺口通过 observations、rationale、gaps 和证据记录，不能代替实际向用户提问。用户补充后追加核验事实；不改冻结规则，不由工具自动决定恢复。

## 幂等和冲突

每个数据写请求有唯一 operationId。完全相同 ID 与内容重放只取回回执；内容改变或新操作的过期 revision 拒绝。run 使用单写者锁，不自动排队、修改请求或重试业务。响应丢失时先查状态，必要时原样重放数据请求；不得用新 ID 重做未知业务写入。遗留锁先核实对应进程，不自动删除未知锁。

## 进度和报告

```text
node ABS_TOOL_ROOT/scripts/ego.mjs progress --run-dir ABS_RUN_DIR
node ABS_TOOL_ROOT/scripts/ego.mjs check --run-dir ABS_RUN_DIR
node ABS_TOOL_ROOT/scripts/ego.mjs report --run-dir ABS_RUN_DIR
node ABS_TOOL_ROOT/scripts/ego.mjs verify-report --run-dir ABS_RUN_DIR --report-dir ABS_REPORT_DIR
```

进度与三格式报告按当前业务目标评估统计 verified、violation、inconclusive、not_tested；unassessed 单列为“缺少目标评估记录”。父用例展示目标分布，不用单一 case.status 隐去部分完成。attempt 和旧 final 只出现在历史，不重复计入当前分布。报告不从 entries 为空推断从未执行。

report 校验关联与全部证据字节后生成 HTML、JSON、Markdown，拒绝覆盖。HTML 内嵌可安全预览的真实截图，不依赖网络；缺图与记录缺口明确展示。verify-report 读回核对当前运行与报告，browserOpen: not_checked 不是实际打开证明。实际打开与视觉/交互检查另记，交付三份绝对路径。

另存报告用 --output-dir 指向已准备的新私有目录。事后整理只使用有来源的新 v5 记录，不声称旧运行被兼容读取，不改原文件、不补造采集时间或执行前冻结。报告整理上下文按当前 schema 提供，并与业务评估分开；工具核对文件一致性不证明语义正确。详见[证据与报告](evidence-and-report.md)。


## 接口观测与按需查询

在需覆盖的操作前按授权范围启用 network start，后台自动记录；network status/query/stop 管理状态、离线查询和有序停止。保存反馈不明、报错、数据不一致或异步处理时，AI 可按需查询，不要求每步执行。完整配置、流正文、分页、内容策略、导出和交接语义见[接口观测](network-observation.md)。不读取旧 protocol-summary，也不删除历史。
