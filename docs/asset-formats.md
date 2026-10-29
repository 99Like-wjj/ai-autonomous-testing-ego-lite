# 本地资产格式与运行约定（schemaVersion 6）

当前开发候选版本为 0.1.7-rc.1 / report-usability-1。用例、基线、运行、结果、证据、请求、执行台账、配置、worker 包与报告统一使用 schemaVersion 6，执行查询 viewVersion 为 6。新版明确拒绝旧格式，不提供兜底读取、转换或原地迁移；旧报告、运行、截图与来源文件保持原样。重新使用来源时新建 v6 用例与运行，不只修改版本号。

容量 availableWorkers 表示本 run 可占用的总活动分派上限，包含已经占用的名额，不是剩余空闲量。packetId 在整个 run 内唯一，按 assignment 划分命名空间；局部封包不证明其他目录没有重名。冲突保留原包并从已有观察纠正交付，不重做业务。并发指南在完整工具根的 references/parallel-testing.md；源码位于 skills/ai-autonomous-testing-ego-lite/references/parallel-testing.md。

Schema 位于 [schemas](../schemas/)，使用 Draft 2020-12 封闭对象；运行时另核对引用、证据归属、必要语义、澄清限制、revision、文件 hash 与操作账本。软件版本与格式版本用途不同。源码先构建，工具位于 .build/runtime/scripts/ego.mjs；完整安装包使用实际 Skill 根 scripts/ego.mjs，Node.js >=22。

## 用例：业务目标与必要语义

根对象是 schemaVersion、非空 project、非空 cases。

| case 字段 | 定义 |
| --- | --- |
| id、title | 稳定 ID 与场景标题 |
| criticalConditions | 所需前提文本数组，可为空但不省略已知要求 |
| requiredPath | 必经业务路径；无明确要求为 null |
| stepOrder | strict 或 adaptive；方法可变，依赖和必要语义不能省略 |
| steps | 非空数组，每步 id、action；步骤不单独带业务状态 |
| goals | 非空、ID 唯一的可独立判断业务目标 |

每个 goal 有 id、title（业务标题）、basis:{kind,source,text}、expected、requiredRefs；basis.kind 是 explicit/interpretation/hypothesis。requiredRefs 可引用 step:步骤ID、condition:从0起的索引、非空 requiredPath。字段引用保持业务依赖；不是每次点击一个目标。

可选 clarificationQuestions 只表示该目标验收标准待澄清，非空时 final 和 attempt 都不能给 verified/violation。资源未具备单独记事实与缺口。可选 followUpOf:{runId,caseId,goalId,reason} 关联澄清或复核目标，runId为self时明确指本运行（目标须存在）；原目标不改写，关联本身不证明旧问题已解决。

新 schema 没有 case.basis/expected/clarificationQuestions 和 step.expected；验收要求统一在 goal。示例见 [cases](../examples/cases.example.json) 与 [generated cases](../examples/generated-cases.example.json)。

## 运行与证据

```text
run/
  baseline.json       # 冻结 v6 用例
  manifest.json       # run 身份、基线 hash 与配置
  results.json        # entries；不存 case 级业务状态
  evidence.json       # catalog、revision、操作回执
  evidence/           # 普通证据文件留存副本
  execution.json      # 分派、容量、Space、导入事务
  workers/            # 分派目录、原始证据及不可变包
```

start 要求项目存在、run 目录不存在，冻结基线并创建空账本；没有评估不是未测试。真实业务资料置于仓库外。该冻结事务不遍历任意项目数据、不调用浏览器或模型；接口观测由独立 network 命令按授权启动。

evidence-add 请求有 schemaVersion:6、operationId、expectedRevision、caseId、sourceFile、kind、source、description，可选 capturedAt。kind 为 screenshot/dom/tool_receipt/log/other。文件必须是获准使用的普通文件，路径和归属检查拒绝符号链接及覆盖；工具按实际留存字节记录 SHA-256、bytes、collectedAt。未知采集时间省略 capturedAt，登记时间不冒充执行时间。登记不自动脱敏，哈希不证明真实性。

## 统一结果请求

```json
{
  "schemaVersion":6,
  "operationId":"result-r01-first",
  "expectedRevision":0,
  "caseId":"R-01-empty-title",
  "mode":"final",
  "record":{
    "observations":[{"id":"form-feedback","summary":"已看到必填提示，尚未读回对象集合。","coveredRefs":["step:submit"],"evidenceIds":[]}],
    "assessments":[{"goalId":"no-object-created","status":"inconclusive","rationale":"缺少是否新增对象的证据。","observationIds":["form-feedback"],"gaps":["未完成独立读回。"],"diagnosis":{"state":"unknown","category":"unknown","summary":"现有观察不能说明原因。","evidenceIds":[]}}]
  }
}
```

此为格式示例，不是实际执行记录。observations 的 id 在条目内唯一，summary 是实际事实，coveredRefs 只列实际观察涉及的必要语义，evidenceIds 引用同用例登记证据。assessments 引用同条目观察，不由工具生成结论。

| assessment 字段 | 含义 |
| --- | --- |
| goalId | 冻结 goal ID |
| status | verified / violation / inconclusive / not_tested |
| rationale | 与原预期对照后的判断理由 |
| observationIds | 支撑该判断的 observations ID |
| gaps | 未核验部分、资源/证据缺口；不能替代实际提问 |
| diagnosis（可选） | state: unknown/hypothesis/confirmed；category: product/agent/environment/spec/unknown；summary 与 evidenceIds |

verified/violation 需要实际观察及证据；verified 要覆盖目标 requiredRefs，不能隐藏必要语义缺口。violation 可以与 diagnosis.state:unknown 并存。未开展目标检查由 AI 显式给 not_tested 并解释原因；缺 assessment 不自动填任何四态。

record 的 final 按本次显式 goal 增量更新当前评估，其余目标不变；attempt 只加入 entries 历史。原 entries 不覆盖，包含 operationId、expectedRevision、revision、recordedAt 以追溯。工具提供的 current assessments 是 final 条目的派生视图，不是另一条可手改结果渠道。相同观察可以由多个目标引用，不能把一次 UI 反馈扩大为无关目标的证据。

## 串行与并行

串行直接 record，无需 worker、Space 分派或 goalAssessments。并行 packet 的 record 使用完全相同字段；观察、动作、现象、诊断、上下文来源、发现关系和上下文图中的证据引用使用包中 evidence 声明的 local key，导入统一映射为 catalog ID。spaceUsage/executionWindow 保留 evidenceKeys。协调者显式 review 后导入同一 results.entries，原包与修订理由保留。

配置 schemaVersion 为 5、maxParallelCases 默认 1，用户未明确要求或配置时不提高。执行查询支持 summary/assignment/full 与 metadata/full integrity，viewVersion 为 6；轻量查询明示未检查部分，不自动恢复或代表 worker 实时状态。完整操作参数见安装包 references/parallel-testing.md，源码对应 并发指南（安装包路径：references/parallel-testing.md）。

## revision、幂等与文件保护

v6可选事实字段：record.contexts（environment/actor/object/initialState/authorization，各项state/value或reason/sourceEvidenceIds）、record.findings（主题、目标及证据引用、关系理由、scope/reviewState）；observation.contextId/actual/occurredAt/actions/evidenceLinks；assessment.summary/phenomena/gapDetails/reproduction/revisionReason/previousOperationId。这些字段随同一结果事务提交，已有context/observation/finding不得同ID改事实。结构化缺口非空时也不能给verified。worker包中这些对象的所有证据键统一映射，contextEvidenceIds需无环并按依赖导入。

evidence.metadata可说明mediaType、encoding、scope、page、object、purpose、limitations、contextEvidenceIds、contentState、redaction、omissionReason及来源声明尺寸。报告按文件读取实际像素尺寸，不把元数据声明当作已核验现场。contentState完整枚举见当前schema，正文不可执行。

写操作使用唯一安全 operationId 和当前 expectedRevision；同 ID 同规范化内容重放取回回执，改内容或过期的新请求拒绝。证据与结果共享操作 ID 空间。run 单写者锁保护事务，不自动排队、回收未知锁或重试业务。数据回执恢复不代表可以再执行页面写操作。

工具以暂存、文件校验与独占安装/rename 处理确定性数据；不会承诺通用多文件事务或任意断电恢复。报告拒绝覆盖，原文件与首次观察不删除。报告生成失败与业务判断分别说明。

## 报告与进度

除三种报告外，v6交付 `report-delivery.json`，保存交付模式、正文预算、缺图草稿选项及附件清单。`report --delivery inline` 默认离线单文件HTML；文本预览预算256KiB，超出明确显示字节范围和交付缺口。`--delivery bundle` 增加按内容去重的attachments，必须一起交付。`--allow-missing-screenshots true` 仅显式生成缺图草稿，默认仍严格拒绝；缺文本、非法引用和hash不匹配不放行。verify-report核对全部主文件、清单及附件，不能证明业务结论或浏览器显示质量。

`network export --run-dir ABS --request ABS_JSON --output-file ABS_NEW_JSON` 从已提交本地查询页按captureId/seq选择事件；请求格式见network-evidence-export.schema.json。可选bodyFields只取完整留存JSON窗口的安全标量字段；部分窗口不作根字段解释。导出返回evidence-add登记草案，不自动登记、不重放接口。

HTML、JSON、Markdown 从同一数据投影生成。报告的 caseCount 是场景数，goalCount 是业务目标数；counts 统计当前四态，unassessed 单列记录缺口。assessmentComplete 表示是否每个目标都有当前评估，不等于目标全部完成或通过。父 case 不再有单一 status，展开可看每个目标的预期、必要语义、观察、证据、缺口、诊断和 entries 历史。

缺少目标评估显示“缺少目标评估记录”，不混入 inconclusive 或 not_tested。步骤、条件和路径不计入业务目标分母，也不从 observation 缺失推断从未执行。执行台账的暂停、完成、Space 偏差和导入状态单列，不赋予业务结论。

evidenceCoverage 报告登记截图、不同留存内容和缺少关联截图的目标；evidenceIntegrity 显示字节核验范围。真实 UI 结果仍需真实页面截图，工具不因图存在判正确、不因图缺失判产品违反。

report 校验结构、引用和全部证据 hash/bytes 后写 report.html/json/md，任一目标已存在则拒绝覆盖。HTML 自包含内嵌核验的 PNG/JPEG/WebP，无外链或网络依赖，格式未知或解码失败明示，不造替代图。verify-report 读回并对照当前 run；后续 run 变化时另存新报告。browserOpen:not_checked 不证明实际打开，Ego 视觉/交互验证另记。

历史 run 新工具明确拒绝。事后整理需另建有来源的新 v6 资产，不能假称执行前冻结，不补造动作、时间、截图。原文件与旧报告不覆盖。工具只验证格式和文件一致性，业务真实性、证据充分性与归因仍由 AI 负责。

接口观测独立使用 networkVersion 1，不改变上述 v6 契约。network start 配置见 schemas/network-start.schema.json，network query 请求见 schemas/network-query.schema.json；完整包 references/network-observation.md 说明启停、范围、内容策略、快照分页和不可变证据导出。正文状态区分 saved/empty/in_progress/not_collected/excluded/truncated/failed。session.json 固定身份及策略，runtime.json 发布已提交序号和字节上界；events/gaps 是带顺序哈希的追加记录，正文文件先提交后引用。哈希不证明来源真实或防恶意篡改。旧 protocol-summary 文件保持，不再读取或迁移。
