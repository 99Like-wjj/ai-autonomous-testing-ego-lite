# 数据契约（v9 / 0.2.1-rc.1）

0.2.1-rc.1为未发布开发候选，Skill/包名ai-testing-ego-lite，存储仍v9。progress/context使用contextReadVersion 1；CLI record以recordResponseVersion 1封装原收据及结构反馈；显式usage汇总独立于业务结果。设计与开发自测保留在源码仓库，不进入运行包。


当前开发版主契约 v9、regressionVersion 2、networkVersion 1。源码 Schema 是外部结构定义，运行时同时验证引用、内容指纹与事务语义；类型从 Schema 生成，不直接改生成文件。工程通过不是业务验收。

## 测试资料

只有用例整份版本、相邻实际审阅和各轮运行。cases/v001.json 不为每次测试重建；定义改变才发布下一版本，普通重测仅新增 run。projectId 和稳定 pointId 嵌入文件，不建立通用资产库、独立问题/规则/任务库或运行注册表。

用例顶层包含 schemaVersion、projectId、project、pointPrefix、caseVersion、previous、nextPointNumber、retiredPoints、sources、coverage、cases、changes、writeRequestSha256、savedAt。首次 previous=null；后续精确引用前版字节指纹。保存请求通过 expectedVersion/previousSha256 并发校验，新增 pointId=null 在同次提交中分配，已有及退役编号不复用，发布无覆盖。

每个 case 有 id、title、criticalConditions、requiredPath、stepOrder、steps、parameters、goals。条件为带 id/text 的对象，步骤有 id/action/dependsOn。每个 goal 有 id、title、pointId、basis、expected、requiredRefs、planState、preparationGaps、sourceAlias、clarificationQuestions，可选 followUpOf。basis 含可信来源与 sourceRefIds；来源区分文件/指纹、定位、摘录及局限。

requiredRefs 使用 condition:id、step:id、requiredPath。points 投影保留显式步骤依赖闭包、稳定条件 ID、strict 相对顺序及必经路径，不猜业务依赖。prepared 目标有完整必要计划；unprepared 明确设计缺口，不从全量清单删除。coverage 保存来源到目标的 mapped/pending/out_of_scope/retired 说明。

## 审阅与冻结

用例HTML/Markdown采用documentVersion 2的内部展示模型：场景/用例总览、三栏评审和可选initialFeedback副本；用例定义、编号、v9及原字节指纹不变。新文档写入新目录。离线HTML自行导出可读评审HTML，唯一review-feedback-data惰性JSON区保存完整v9反馈，可选单独JSON；它们不是正式审阅。cases export-review是可选CLI，另附exportVersion 1交付清单；页面不依赖该命令或服务器。范围、恢复及Windows验证边界见[离线评审导出](case-review.md)。

case-review 保存精确 casesRef、reviewNumber、pointIds、工具计算的目标指纹、意见、实际 source/sourceKind、委托来源及记录指纹。离线反馈字段不是人类身份认证。较新的修改要求不能挑旧确认绕过；未改目标可按指纹复用旧确认。

start 必须接收 binding。baseline.json 保存所用用例的完整字节；run-binding.json 保存选择、执行计划引用、暂缓、审阅、参数、当前条件及父运行。manifest 的 regressionBindingFile 指向 run-binding.json，并保存其字节指纹。未选点没有本轮状态；所选但暂缓点仍须 AI 显式记录有据四态或保留缺评估。

parameters 的类型为 string/integer/decimal/date/object_ref/account_ref；decimal 使用十进制字符串，integer 必须安全整数。定义不解释模板，绑定不放宽业务标准。本轮条件声明有来源，工具只核对结构及可验证文件，不认证真实授权或就绪。

## 事实与四态

results.entries 统一保存 contexts、actionEvents、observations、assessments、findings。final 增量更新所提交目标，attempt 仅留历史。四态为 verified、violation、inconclusive、not_tested；unassessed 是缺评估计数，不是业务状态。关键必要语义与观察/证据必须对应，动作成功不证明业务成功。

observations.actions 与 evidenceLinks 保留实际输入、步骤、读回、证据用途及局限；不从计划补造现场。problemChecks 精确引用旧 finding，或原目标评估/现象，记录 reproduced/not_observed/unclear/not_checked。当前四态、原问题复现、新发现、可比性和修复归因分别表达。

evidence 原件及操作不可变留存，元数据可标 artifactRole=download_original/inspection/capture_receipt 与 deliveryRequired。不同采集身份不因字节相同而合并，历史材料不成为本轮 evidenceCatalog。

## 执行与下载

配置 schemaVersion 为 9，maxParallelCases 默认 1。execution read viewVersion 9 默认仅检查元数据，full 才核对当前结果及物理引用。串行与工作包共享目标范围、引用和证据校验。worker 只写自己的目录，协调者审核后写共享账本。

既有 execution note 增加 category=download 和 download={captureId,caseId,pointIds,actionId,state}。active/unknown 保留一个 activeDownload 标记，resolved 需要显式留存对账事实；不按时间解除，也不新增租约或下载服务。该标记不隔离其他对话或用户下载。

files inspect 的输入是实际文件、读取方式与边界，输出有类型事实/范围/局限，不输出业务通过。默认单文件 32MiB、输出 4MiB、100000 单元格、60 秒；超限/窗口为 partial，失败明确记录。XLSX 不执行宏或重算公式，缓存与空值仍有局限。

## 报告与历史

Report/HTML payload 使用 v9。报告仅统计本轮选中点，另列源清单总数、执行/暂缓及缺口。首次无 history；后续 history 保存精确父运行图、原评估与证据包装引用，保留原 run/证据 ID，与当前结果隔离。丢失/损坏历史形成明确缺口，当前已登记证据仍严格核验。

HTML、Markdown、JSON 同源。delivery=auto 需要下载原件或历史附件时使用 bundle；其他为 inline。附件按实际引用收集，交付清单保存路径、字节、指纹与历史摘要指纹。完整 bundle 可使用已保管历史附件校验，无需旧目录仍在原位置；摘要不能代替缺失原件。

## 格式影响

0.1.8-rc.2 在主v9中增加可选字段：Observation.phase记录预期/实际阶段及依据；Assessment.display记录可读标题、实际现象、影响和维度；ActionFact.inputSummary/replySummary/inputPresentation/conversations记录真实步骤输入、回复及消息引用。旧字段和业务四态不变，未填写的新信息显示缺口，不从计划推断。

独立conversationVersion 1见schemas/conversation.schema.json和examples/conversation.example.json。每条消息声明role、format、content、presentation、completeness、state、completionBasis、sourceRefs、limitations。kind=conversation的metadata.conversationSources将局部sourceId映射到同用例原件evidenceId；contextEvidenceIds自动包含这些原件。消息逐字内容及引文校验不等于AI语义校验。源文件上限8MiB；单条正文上限262144个UTF-16代码单元；大对话由AI按明确范围拆分，不静默截断。

report --context 的可选conversations引用带SHA的规范化文件，以sourceBindings指定原件、actions指定当前目标既有实际动作和消息。不能覆盖业务状态或从计划补造动作。HTML payload提供经过来源核验的对话视图，report.conversationEvidence包含本轮已登记规范化内容。auto在含对话时使用bundle，交付包含原始文件；单独搬走HTML会失去原件附件。verify-report增加reviewPrompts，只提示缺描述、重复文案、阶段不一致和缺输入/回复摘要，不改变业务结论。详见Skill中的“通用对话证据”指南。

旧用例、规则/任务、run 和报告不自动迁移、重写或删除；新版不提供旧格式兜底。需要复用时显式从原始来源整理并说明映射。网络格式保持 1。源 Schema 见 schemas/，可用输入见 examples/cases-save-request.example.json、regression-selection.example.json、regression-binding-request.example.json、file-inspection-request.example.json。

## 报告语言与两阶段模型来源（report-language-model-1）

v9在用例、RecordPayload及report-context中增加可选aiContext，uses项保存model、reasoningEffort、sourceKind、SourceRef和scope。来源为unknown时模型与等级必须为null；有文件来源时验证指纹。工作包保留同一字段，canonicalRecord的幂等判断包括模型来源；AI元数据不进入业务目标定义指纹，业务定义未改时保留原生成来源。

两类文档可传--presentation JSON，包含language与messages；固定文案键见report/ui-catalog.mjs，其他语言必须提供完整映射，不能静默回退。HTML、Markdown与JSON同源保存展示参数；模板只替换明确标记的固定片段，插值中的原始事实不翻译。Node使用异步上下文隔离不同报告语言。

用例文档读取已保存生成来源；可用--ai-context传入精确casesRef绑定的事后补充，并保留其指纹。执行报告仅汇总本轮入账和本次阅读整理的来源，形成一处test_execution展示，不混入用例生成或历史父运行配置。两阶段及展示规则见ToolRoot/references/report-language-model.md 使用指南。

新增字段和展示需配套当前工具修订；旧工具可能拒绝新增字段。已有文件不自动改写，旧HTML可独立阅读，精确校验旧展示应使用原工具修订。补充或换语言时另存新文件。

## 项目知识格式 v3

知识独立使用knowledgeFormatVersion 3，读取结果为knowledgeReadVersion 3，不改变测试主契约v9。knowledge.json只标识项目；project.json与accounts.json都是{"items":[]}，每条仅id/title必填，summary/tags/description/properties可选。自定义属性原样保留，不绑定环境、角色或组织档案。

feature-map.json直接写模块所属应用/页面和入口；rules保留完整规则/角色正文、来源与确认状态，appliesTo自然语言说明适用范围。配置是用户声明，不套规则确认状态。Source版本与SHA独立保留。

知识是可选上下文。缺账号/配置不自动生成全项目准备任务；query先读摘要，read再展开详情，实际适用性由AI判断。JSON损坏与合法空集合分别说明。旧格式不兼容、不转换或自动覆盖；历史资料保留。
