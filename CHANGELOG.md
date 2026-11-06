# 更新记录 / Changelog

## 0.2.1 / attachments-review-2 — 2026-11-06 · 正式版本

- 人工审核通过后已发布 [v0.2.1](https://github.com/99Like-wjj/ai-testing-ego-lite/releases/tag/v0.2.1)，固定提交为 `5bccc9c8aa0402c7d03f986793050d6617bacc4b`。发布后的文档状态修正仅更新 main，不移动 Tag 或替换安装附件；发布准备与候选阶段记录保留各自历史范围。

- 仓库、包名、Skill 标识及新安装包统一为 `ai-testing-ego-lite`，中文展示名按人工审核更新为“AI 自动化测试 · Ego Lite”。原 GitHub 仓库更名，repository ID 与历史 Tag、Release、附件不变；不提供旧名兼容别名。
- 目标摘要/索引/单点读取、CLI 入账结构反馈和显式用量导出汇总降低重复读取；不承诺模型费用或业务效果的固定改善，不替 AI 选择业务动作或判断四态。
- 测试附件可从步骤、对话及全局入口按原名下载，支持预生成附件 ZIP；用例评审增加通过标记、收起与继续评审，并修复导航/位置恢复。
- 主存储 v9、知识 v3、回归 v2、网络 v1 保持；新增 contextReadVersion 1、recordResponseVersion 1、usageVersion/usageSummaryVersion 1，交付清单为 deliveryVersion 2。CLI 消费者需同步，历史资产不重写或迁移。
- 双语当前文档、图示与安装说明同步；完整新名称包包含编译运行文件、指南、契约、示例和许可证。验证范围与未运行项目见[发布验证](docs/v0.2.1-release-validation.md)。发布不会安装到用户本机或删除旧入口，下列候选条目保留当时状态。

## 0.2.1-rc.1 / attachments-review-2 — 2026-11-06 · 开发候选，未发布

- Skill/包短标识改为`ai-testing-ego-lite`，中文名称保留“AI 自主自动化测试”。构建身份与目录引用同步；本次源码开发不调整GitHub仓库地址、历史Release或现有安装目录。
- 明确独立脚本与模型回合的区别，推荐合并已确定的本地准备、执行和取证，保留需要新观察、授权或未知副作用的判断边界。
- progress和regression context默认有界summary，支持goals索引、单point完整预期/依赖及显式导出。历史full仅导出；新读取输出contextReadVersion 1。
- CLI record返回recordResponseVersion 1，原receipt与提交时结构反馈分开；内部记录事务和并行收据不变。提示不改四态，重放仍绑定原revision。
- usage summarize只读取指定非秘密导出，按唯一请求去重并分列缓存/推理子项；未知不当0，不扫描宿主目录或推测账单。
- 继续主存储v9、知识v3、回归v2，不重写旧资产或提供旧名兼容别名。CLI输出有意变化，调用者需同步；真实模型成本及业务效果另行验证。
- 报告增加本步/对话/全局测试附件入口、原名下载和预生成的测试附件ZIP；v9增加可选testFile、fileUses字段，交付清单改为deliveryVersion 2，缺口与业务结论分开。用例设计阶段不生成附件，不扫描或回填历史。
- 用例评审增加通过标记、收起与继续评审；只导出修改意见和总体意见。修复上一/下一回顶、重复激活回顶、历史位置丢失、辅助操作收起正文及筛选巡览范围混用。保留正式页面原有布局、字号、间距及八主题，未采用独立Demo的全局样式。

## 0.1.9 / project-knowledge-3 — 2026-11-04 · 正式版本

- 按已通过人工审核的分支发布；软件、Skill、双语当前文档与图示统一正式版本 0.1.9，不带 dev 后缀。下列开发条目保留当时身份与验证事实。
- 项目知识格式 v3：结构化地图/规则、轻量项目和账号记录、按需摘要检索与精确读取；Ego 只读使用，创建维护由独立 project-knowledge-maintainer Skill 负责。无知识库时继续已有资料支持的任务。
- 用例评审支持离线 HTML 导出和恢复及可选 JSON，不再依赖审阅 HTTP 服务。保留主契约 v9、regressionVersion 2、networkVersion 1。
- 不兼容旧知识格式，不提供转换器；实际知识、已安装 Skill、历史结果和已有 HTML 不自动更新或改写。
- 安装包仅含当前运行代码、AI 指南、契约、合成示例与许可；设计、开发验收和宣传图留在仓库。验证和限制见[发布验证](docs/v0.1.9-release-validation.md)。

## 0.1.9-dev.1 / project-knowledge-3 — 2026-11-04 · 开发版，未发布

- 项目知识改为格式v3：账号/项目配置采用仅id/title必填的自由记录，按用户提供的内容整理，支持自有字段和嵌套JSON；不要求角色、组织、环境或页面注册表。
- 地图直接记录应用/页面及模块路径，规则以自然语言说明适用范围；移除环境/应用/范围/角色外键筛选，AI按摘要和详情判断实际适用性。
- 保留规则来源、确认状态、版本与文件事务；配置支持保留前版后修正或移除。实际知识库、已安装Skill与历史结果不自动更新；测试主契约仍v9。
- 验证范围见[开发自测](docs/v0.1.9-development-validation.md)。不兼容旧知识格式，不提供转换器。

## 0.1.9-dev.1 / project-knowledge-2 — 2026-11-03 · 开发版，未发布

- 2026-11-03：离线HTML直接导出可阅读、可恢复的评审HTML及可选JSON，支持文件选择器读回、显式下载及完整数据复制；移除审阅HTTP服务和cases serve命令。v9及原用例指纹不变，旧文档与反馈保留。验证见[离线导出自测](docs/v0.1.9-offline-review-export-validation.md)。

- 项目知识升级为独立格式v2：项目环境页面、模块级功能地图、详细规则/角色、非秘密账号四类资料；支持可选来源、摘要/精确读取与显式关联，保留来源、状态、范围和Git边界。旧格式不兼容、不转换，真实知识文件不自动重建。
- 需求分析、资源准备和执行阶段按需主动查知识；无知识库不阻断任务。账号只读声明、凭据引用不解析，功能细则仍在需求中；测试主契约继续v9。
- 创建维护在独立 project-knowledge-maintainer 项目；本仓库不回写知识。验证见[开发自测](docs/v0.1.9-development-validation.md)。

## 0.1.8 / report-language-model-1 — 2026-11-02 · 正式版本

- 用例整份版本、人工审阅与本机保存、稳定编号选点重测、必要依赖与运行绑定。
- 下载原件与只读文件检查、历史报告对照、对话原件和逐消息来源、步骤输入/回复及完整对话阅读。
- 用例报告和测试报告跟随用户语言，两阶段模型与思考等级按来源展示；优化长编号与首次执行范围文案。
- 主契约从上一正式版 v8 升为 v9，regressionVersion 2、networkVersion 1；旧资料不自动迁移、覆盖或删除。既有 HTML 可独立阅读，新版不能仅通过修改版本数字读取旧数据。
- 安装包按显式白名单精简：设计、历史验收、宣传图片和真实报告截图留在仓库；外层附独立安装升级说明。
- 双语当前文档与图示同步正式身份；README 保留经脱敏的真实报告选段，截图不是本版重新执行的业务验收。
- 验证范围与限制见[发布验证](docs/v0.1.8-release-validation.md)。下列 rc 条目保留当时开发事实，不表示当前仍为候选。

## 0.1.8-rc.2 / report-language-model-1 — 2026-11-02 · 开发修订，未发布

- 用例报告和测试报告跟随用户交流语言，显式指定优先；固定文案清单支持当前AI提供完整目标语言，附英语、法语样例，业务与证据原文不被模板替换。
- 两阶段分别显示一处模型及思考等级，保留来源、多配置和未知项；用例生成来源不可被当前模型覆盖，执行判断和报告分析属于同一测试执行阶段。
- v9新增可选aiContext与报告展示参数，贯通串行、工作包、事后整理及同源交付；来源文件指纹、幂等身份和精确用例绑定保持校验。
- 场景标题下方展示可换行完整ID；范围文案依据明确比较基准区分首次执行和回归。
- 历史资产不自动改写；已生成HTML仍可独立阅读，按原样校验旧展示需使用其原工具修订。当前工具生成新展示时另存新目录。

## 0.1.8-rc.2 — 2026-11-01 · 开发候选，未发布

- revision：conversation-review-1。通用conversationVersion 1，保留原件、逐消息保真度/完整性/结束依据，支持串行及并行证据映射。
- 方案2：步骤输入/回复摘要，完整对话侧栏与全屏，安全Markdown、来源查看和浏览器位置恢复。
- 四层改进：预期与观察时机核对、长文本只读取证、具体问题描述、结构/来源校验及提示。工具不判业务四态、不自动补测。
- 主契约v9增加可选字段，旧记录保持原样；只读context可生成新报告，不能补造步骤或改旧结论。详情见[设计与验证](docs/v0.1.8-conversation-review.md)。
- 完整安装同步须由用户明确授权；工程自测不代表真实UAT验收，没有创建正式Release。

## 0.1.8-rc.1 — 2026-11-01 · 开发候选，未发布

- 审阅修复 revision：case-review-native-export-1。新增“场景/用例总览 → 三栏评审”，复用8种报告主题；内部必要引用展开为中文前提、路径与依赖步骤。
- 意见输入按版本暂存和恢复；保存前核对范围，阻止空记录及范围外意见被静默丢弃。新增本机审阅入口和原生HTML/JSON保存，避开Blob下载的Windows区域标记；历史文件及原标记不改。意见文件仍不是正式人工确认。
- 用例整份版本、内嵌稳定编号、实际审阅和同源 HTML/Markdown；普通重测只增 run。
- points/status/full、必要依赖投影、当前条件及类型化参数，串并行使用同一范围/事实校验。
- 官方 Ego 下载辅助、显式管理页补证、未知在途标记、独立原件和只读 JSON/CSV/XLSX 读取；解析器预打包并带许可。
- 精确历史、原问题检查、历史证据隔离与 auto/bundle 交付，状态变化不自动归因为修复。
- 主契约 v9、regressionVersion 2、networkVersion 1；不迁移、重写或删除旧资料，不加旧格式兜底。
- 范围见[开发自测](docs/v0.1.8-development-validation.md)。未自动安装、合并、推送或生成候选安装包。

## 0.1.7 — 2026-10-31 · 正式版本

- 人工审阅通过后正式收尾；软件、Skill 元数据、CLI 校验与完整安装包统一为 0.1.7，名称为 ai-autonomous-testing-ego-lite，不带 dev/rc 后缀。revision 保持 report-step-evidence-1。
- 整合报告方案 B、证据与实际步骤并排、整轮资源澄清、首次成果留存及规则/任务修订、按状态整场景与全量回归、独立运行绑定和逐目标比较。
- 全面核对双语文档与图示，新增 AI 主导设计理念和 AGENTS 源码导航；当前版本信息与正式下载同步，旧阶段验证原样保留。
- 主契约 schemaVersion/viewVersion 为 8，regressionVersion/networkVersion 为 1。相对 0.1.6 的旧业务格式不兼容，不自动迁移或改写旧运行；从可信来源新建 v8 资产并保留历史证据。
- 完整安装包包含编译 JS、Skill、契约、示例、说明与逐文件完整性清单，另附 SHA-256；安装不会自动更新用户环境。验证范围见[发布验证](docs/v0.1.7-release-validation.md)。
- 下列候选记录是开发历史，保留当时版本、验证和授权限制，不代表当前仍未发布。0.1.8 仍只属于需求规划。


## 0.1.8 — 需求与设计阶段历史（后续开发见上）

- 2026-11-01 按用户确认的瘦身方向重写最终设计：只保留用例版本、相邻审阅记录和运行目录；编号在整份用例保存时分配，复测不产生新用例版本，问题直接关联原运行记录。取消上一稿的通用资产库、assetVersion/AssetRef、独立 point/rule/task/issue 管理、项目索引与租约服务。12 项需求保持，既有记录不迁移或删除，本次仍未开发功能。
- 2026-11-01 按用户要求形成[详细设计](docs/v0.1.8-design.md)、[数据/接口契约草案](docs/v0.1.8-contract-design.md)和[下载专项设计](docs/v0.1.8-download-design.md)：明确稳定目标、实际审阅确认、三种范围、拟议 v9/v2、精确历史与证据、官方下载复用及读取依赖的分发。新增隔离只读解析验证摘要；没有修改产品运行契约、依赖、业务实现或已安装 Skill。
- 2026-11-01 用户明确取消 token、费用、用量归属、成本统计和节省比例相关工作；R018-07 调整为测试效果对照与方案质量评估，同步需求、双语前瞻和调研结论。下载明确以 Ego 已开放能力为基础，项目补充文件关联、内容检查、证据记录和受限补证适配；未新增产品实现。
- 根据首次测试、失败范围复测和报告审阅，整理完整问题背景、稳定最小测试点编号与按编号回测需求；编号覆盖全部目标和四态，不仅用于缺陷，跨运行身份与内容修订/执行次数分开。
- 同时规划原问题与新发现区分、最新完整目标清单、逐动作证据、数据参数化、AI 按需操作复用，以及可核验成本和效果对照。详见[需求前瞻](docs/v0.1.8-preview.md)及[English](docs/v0.1.8-preview.en.md)。
- 用户确认下载观察与文件内容校验、报告复测历史、可视化用例文档与人工审阅三项新增需求的整理口径；与原七项及旧前瞻的设计质量、经验适用性合并为十二项。新增[需求确认文档（待整体审阅）](docs/v0.1.8-requirements.md)，列明已有基础、来源承接、验收标准及详细设计问题，同步双语前瞻与 README 入口。
- 后续用户整体确认十二项需求并授权先调研。新增[可行性调研](docs/v0.1.8-feasibility-research.md)与合成摘要：本机 Ego 0.6.2.5 下载及内容检查、临时新页下载管理补证、取消和生命周期限制、历史资料只读核对、审阅/历史离线原型及宿主用量条件。研究结果待审阅，不作为功能实现、真实业务重测或详细设计交付。
- 仅为规划；提出时软件为 0.1.7-rc.1，当前正式版为 0.1.7，契约 v8/regressionVersion 1/networkVersion 1 不变。具体设计须审核；不开发或发布 018 能力，不迁移历史。

## 0.1.7-rc.1 — 云端整合与人工审阅准备，未发布

- 核验四个 0.1.7 分支均已被 `6040a1a` 包含，保留原合并历史，不重复 cherry-pick 或覆盖实现。
- 同步双语 README、头图、流程、架构、并发与方案 B 报告示意；四版图更新为 0.1.4–0.1.7，明确候选未发布，完整历史不删。
- 新增云端审阅说明，区分当前状态与本地历史验证时点；0.1.8 仍为规划，不新增其测试点编号或单点回测功能。
- 保留软件 0.1.7-rc.1、revision report-step-evidence-1 及 v8 契约；人工审核通过前不合入 main，不创建 Tag、Release 或正式版本包。

## 0.1.7-rc.1 — 本地文档与代码收尾审核，未发布

- 中英文README及版本历史补全0.1.6实际交付的经验、目标评估、统一记录、native接口观测和跨宿主修复，区分各阶段验证与全面业务验收。
- 当前能力说明对齐方案B及已整合的资源/回归能力，纠正将017仍称为下一版计划的旧描述；保留原前瞻和历史图，新增018背景与需求入口。
- 文档中的开发机绝对路径改为通用描述；不改私有执行证据或Git历史。核验本地源码、文档引用与敏感信息，云端合并、发布和下载包由维护者处理。

## 0.1.7-rc.1 — 步骤与证据并排，未发布

- 工具revision为report-step-evidence-1：采用已批准的方案B，一次阅读一个目标，实际操作步骤与所选步骤证据并排；问题描述和原预期置顶，完整来源及历史折叠保留。
- 回归范围说明默认只显示前3条；其余说明与精确规则明细为独立的两层折叠，重置后均收起。
- v8报告整理上下文新增可选readerNotes，须引用当前目标的真实观察/动作及已关联证据；不从计划补步骤，不自动推断问题步骤，不更改账本或四态。共同引用单独说明，缺少逐步资料时如实保留。
- 开发构建用于在新目录重新生成既有报告，不自动更新用户级安装、重跑UAT或发布安装包。设计与验证记录见[步骤证据报告](docs/v0.1.7-step-evidence.md)。

## 0.1.7-rc.1 — 报告阅读修复，未发布

- 工具revision为report-reader-review-1：未决动作以中文业务说明展示；目录默认/重置收起，筛选保持正文位置，场景内直接展开目标、现场图和复核资料，移除重复导航按钮。
- 当前目标证据沿显式动作/上下文关联展开；图片与文字证据分区，不从计划补造实际步骤。
- retrospective context可提供有来源的goalNotes，建议复核路线与原始事实分开；原账本和旧报告不覆盖。业务契约仍为v8，交付清单纠正遗留v6标记为v8。
- 开发、自测和生成审阅报告不代表安装或正式发布；不自动打包、重跑UAT、推送或创建Release。

2026-10-30 更正：本功能属于 0.1.7。目录、文件名、文档内容、验证摘要及代码清单中的误用版本标识已统一更正为 0.1.7；开发候选仍为 0.1.7-rc.1。更正不改变既有测试结论、证据哈希或原始运行记录，原提交历史保留。

## 0.1.7-rc.1 — 最终集成候选，未发布

- 合并报告优化、资源澄清和回归复用，保留两侧提交。当前数据契约为v8、regressionVersion 1；旧v6/v7运行不迁移或覆盖。
- 保留八主题、正文/附件、网络证据导出，并整合回归范围和未决动作；验证见 docs/v0.1.7-integration.md。
- 以下两项的独立开发说明保留当时时点，未包含报告优化的表述不代表最终集成状态。

- 方案二：项目规则/任务不可变修订、当次动作事实及未决副作用、按状态整场景重跑/全量范围、独立运行绑定及逐目标比较。AI 负责整理与判断，工具不自动重放业务。
- 该独立阶段主契约 v7、regressionVersion 1，拒绝旧格式，不迁移或覆盖历史；不纳入另一工作区的 v0.1.7 报告改动。规则、任务和证据仍保持分源。
- 方案一先完成工程与受控行为验收，再独立本地提交 7660bc4；下面 v5 说明属于该阶段的交付，该独立方案二阶段以 v7 为准。

- 方案一：首次/恢复实际测试前，对声明整轮范围盘点已知条件、实际沟通缺口并明确允许继续范围；部分答复按对应条件承接，保留对象级授权与纯设计例外。
- 保持 v5 数据契约，复用单一资源依据，不新增资源状态机或业务执行门禁。
- 独立开发基于 main，不包含未提交的 v0.1.7 报告候选；安装、真实 UAT 与发布未执行。
- 方案二按已批准顺序在方案一本地提交之后实施；未自动安装、推送或发布。

## 0.1.7 — 原始版本前瞻（历史规划）

最初计划优化测试效果、评测标准、测试报告格式及 README/示例。保持 AI 自主方法选择、人工维护运行时只读经验和证据驱动判断。原范围保留于 [历史前瞻](docs/v0.1.7-preview.md)；报告及回归候选进展见上方对应记录，未完成的效果评测转入018需求，不将整份原规划写成已实现。

## 0.1.6 — 2026-10-29 · 经验指南、目标评估与接口观测

- 新增按用例设计/执行阶段分离的经验入口、索引和场景正文；人工维护、运行时只读，保留 AI 自主方法选择。
- 统一 v5 业务目标、串并行记录与三格式报告，分别展示目标四态、缺少评估、根因与证据缺口，保留历史尝试。
- 新增独立 native 接口观测及按需查询；补齐链接 CLI 入口和跨宿主协作约定。接口观测不重发业务请求，也不自动判断业务结果。
- 软件、Skill 和完整安装包统一 0.1.6 / native-network-observation-1。JSON 契约统一 v5，网络格式独立 networkVersion 1；拒绝旧格式且不提供转换，不覆盖或删除历史资产。升级须完整替换已确认可更新的安装文件，再依据原始来源新建 v5 资产。
- 用户反馈一次本地需求试跑可用；发布收尾与已有验证分别见 [验证记录](docs/testing.md)。完整跨宿主、所有模型/真实业务与生产可靠性均无全面保证。
- 以下候选记录保留当时版本、事实和限制，不代表当前仍未发布。

## v0.1.6 接口观测 · 开发候选增量（未发布）

- 以最终设计 v3 为基线新增 network start/status/query/stop，独立 native-only 上下文后台记录授权范围内的 Fetch/XHR、SSE 和 WebSocket 双向正文，不重发业务请求、不替 AI 判断。
- 独立 networkVersion 1 配置/存储/查询、内容处理、容量、快照分页、不可变片段导出和正常/交接清理；v5 用例、目标评估及三格式报告保持。未发布的 protocol-query 被新入口取代，旧摘要和历史证据不迁移、不删除。
- 候选标识为 0.1.6-rc.1 / native-network-observation-1。完整包需同步更新工具与指南；本次不自动更新用户安装、不合并 main 或正式发布。
- 自测范围和实际限制见 docs/v0.1.6-network-validation.md；真实 UAT/生产与其他宿主仍需各自授权和验收。

## 0.1.6-rc.1 — 开发候选 · 目标评估、统一报告与跨宿主修复

- 业务预期统一进入 goals；每个目标独立保留依据、预期、必要语义引用、澄清问题和可选后续复核关联。步骤、条件和路径保留业务依赖，不再机械计为独立业务目标。
- 串行 record 与并行交付导入共用 observations/assessments 和 results.entries；final 按 goal 增量更新，attempt 保留历史，消除串行记录与逐目标报告读取通道脱节。
- 报告按业务目标统计四态，父场景显示目标分布；缺少评估单独显示记录缺口，不回落为无法判断。业务结果、根因确认程度、执行状态、截图缺口与文件完整性分开呈现。
- 加强用例生成的前提—动作—观察对应检查和结果/根因分离示例；提交、拖动、AI 上下文和下载提供按需观察建议，具体浏览器能力以当次隔离验证为据，不固化业务路线或自动重试。
- 目标评估阶段的历史 P2 实现（现已由 network query 取代）：normalizeProtocolEvents 立即处理原生 page.events，queryProtocolEvents 查询保存后的摘要；默认不取 body、headers、cookies、query 或原始 console。allowlist 不保证字段值和 URL 路径无敏感内容，调用者仍须审查；助手不控制浏览器或自动判断结果。实际隔离能力观察及临时派生页下载限制见验证记录。
- 当前测试资产 JSON 契约统一 schemaVersion 5，执行查询 viewVersion 5。新版拒绝旧格式，不提供兼容读取或转换；旧报告、截图和运行原样保留，格式变化不授权覆盖或删除历史。使用新格式应按原始来源另建资产，不只改版本号。
- 合并修复提交 8e6e2d9：链接路径正确执行 CLI；补齐跨宿主上下文、权限、实际执行者与 handle 交接，以及总活动容量和全 run packetId 约定。v5 数据契约及原始记录保留，新增指南随完整包分发；真实跨宿主链路仍待验收。
- 软件版本为 0.1.6-rc.1，toolRevision 为 native-network-observation-1。开发构建不替换用户级安装，不代表正式 Tag/Release；验证范围和未完成项见 [验证记录](docs/testing.md)。

English: Development candidate with source-backed business goals, shared serial/parallel observations and assessments, incremental final goal updates and preserved history. Missing assessments remain recording gaps, separate from the four business outcomes and diagnosis. All current contracts are v5; old formats are rejected without conversion, while historical files remain untouched. No installed Skill replacement or formal release is implied.


## 独立修复分支历史：0.1.6-rc.cross-host.1 — 2026-10-28 · 未发布，跨宿主并行修复

- 从测试经验分支已提交的 d350cc5 派生，独立于原目录中的 v5 目标评估与接口监控工作；toolRevision 为 cross-host-parallel-1，不代表正式发布。
- 修复通过目录链接调用 scripts/ego.mjs 时因入口路径比较而静默退出的问题；仅解析可执行入口身份，运行/证据文件的路径保护保持。
- 补齐跨宿主能力边界、可访问上下文与授权交接、真实执行者与在途 handle 关联、等待/异常/收尾，以及各终端真实验证范围。指南加入完整包清单，不引入调度适配层或固定业务流程。
- 明确 availableWorkers 是本 run 总活动名额（含已占用），packetId 在全 run 内唯一；重名交付保留原包，导入错误提供纠正方向。
- 数据格式沿用本分支基线，不新增历史兼容分支，不迁移或覆盖用例、运行和证据。用户级安装不自动更新；完整宿主并行验收仍未验证。验证范围见 docs/testing.md。

English: Unreleased isolated repair candidate. Linked CLI entrypoints execute normally; host handoff, lifecycle, total capacity and run-wide packet naming are clarified. No host dispatcher, data migration, installation update or live-host compatibility claim is introduced.

## 0.1.5 — 2026-10-25 · 资源主动澄清与完整更名

- 正式收尾：package、工具常量、Skill 元数据、调用校验与完整安装包统一为 0.1.5，不带 dev 后缀；Codex 展示/调用配置随包分发。历史开发验证记录保留原版本，版本收尾不扩大其验收范围。
- 更名修订 branding-rename-1：仓库、package 与 Skill 标识统一为 ai-autonomous-testing-ego-lite，新增随完整包校验的 Codex 展示/调用元数据，更新当前链接与迁移说明。README 中文标题“基于 Ego Lite 的 AI 自主测试 Skill”不变；历史版本、报告与数据格式不动，用户安装不自动修改。
- 修订 resource-clarification-3：同一资源事实复用可追溯依据，派生摘要回读该来源并区分历史与当前；已提供但未核验不再写成未提供。复用现有证据、结果和报告，不增加资源状态机或业务判断代码。
- 修订 resource-clarification-2：明确记录缺口不等于实际发问、部分答复只解决所覆盖条件，以及受阻原目标交付前的问答核对。资源指南优先讲行为，字段映射后置；保持 AI 自主判断。
- 补强资源充分性与主动澄清：从目标推导必要条件，授权内先核验，主动询问实质缺口，只暂停依赖动作，补充后核实再恢复，执行中新依赖同样处理。
- 分开处理验收歧义、资源可用性和操作授权。clarificationQuestions 既有含义与 pass/fail 限制保留；资源恢复符合原条件时不因此重新冻结，改变冻结语义仍须修订并保留历史。
- 复用现有结果、证据、worker 包和报告；不新增资源 JSON、固定决策树、自动重试或独立模型服务。新增指南明确加入运行包与安装清单，辅助资源笔记不冒称已被 verify-report 校验。
- 新增面向使用者的双语版本演变页、总览图、README 入口及本地验收步骤；区分正式/预发布/开发中和实际发布时间，历史开发记录保留。
- 升级影响：软件 0.1.5，toolRevision 为 branding-rename-1（资源澄清行为沿用 resource-clarification-3）；cases/results/evidence v3、manifest/report v4、execution/configuration/workerPacket v1、executionRead v2 保持。需完整包以包含新指南；不迁移、删除或覆盖历史。
- 本版工程验证与限制见 [v0.1.5 本地验证记录](docs/v0.1.5-validation.md)。真实对话与业务验收分别记录，不由类型或合成测试代替。旧开发包已按用户授权更新至用户级安装；历史候选安装及逐次验证以回执为准；它们不代表用户电脑已更新到本次正式安装包。

English: Goal-specific resource clarification, dependency-scoped pauses and verified resumption are guided by the AI using existing records and report tools. Added bilingual version history and acceptance instructions. Formal version 0.1.5 with unchanged JSON contracts; scoped behavioral acceptance is recorded; broader reliability remains unverified.

## 0.1.4 — 2026-10-24 · TypeScript 与可配置并发

发布能力：严格 TypeScript 源码与编译后安装包；默认串行、按用户配置并发；原生 worker 分例交付；Space 关联与偏差记录；协调者复核导入；逐目标报告；有明确完整性范围的轻量查询。以下开发阶段记录保留其当时的验证口径，不代表当前未发布。

### 本地试用确认与版本号统一

- 用户在独立 Codex 会话本地试用后反馈无明显问题，按要求将当前源码、工具、安装入口与指南的版本号统一为 `0.1.4`，去掉当前版本号中的开发后缀。功能与数据格式沿用此前验收构建，tool revision 仍为 `ts-parallel-3`。
- 历史开发版的验证记录、报告和证据保持原样；用户本地试用反馈不替代其中的未测试或无法判断项。本次版本同步不操作真实业务，不创建版本 Tag 或 GitHub Release。

## 0.1.4-dev.3 — 开发中 · 公共数据能力与轻量查询

- 集中封装基线／用例解析、文件归属与流式哈希、worker 路径校验；启动、运行检查、封包、导入、报告共用实现，保留原导出入口。
- summary／assignment 默认只检查元数据，不自动恢复或重读历史证据；新增 `--integrity full`，允许完整核验后仍返回摘要。完整视图、共享写入和报告继续严格检查，默认并发仍为 1。
- 查询契约升为 `executionRead:2 / viewVersion:2`，integrity 明示实际检查范围，recovery 提示待恢复标记与导入。调用方如依赖旧完整复核语义，需显式 `--integrity full`；原 full 输出及运行存档格式不变。
- Node 22／24 离线回归各 96 项：92 PASS、0 FAIL、4 权限 SKIP。规模测量与保护范围见[验证记录](docs/v0.1.4-bc-validation.md)，不代表真实业务验收；未推送或发布。

## 0.1.4-dev.2 — 开发中 · 查询摘要与报告措辞

- `execution read` 默认摘要，新增单分派视图与显式 `--view full`；完整读取 API 和运行存档格式不变。摘要保留总数／截断提示、异常 note 计数和交付引用，不复制历史 packet。依赖旧 CLI 默认全量结构的脚本须加 `--view full`。
- 报告改用“尚无结果／尝试记录”“已有尝试记录，尚无最终结论”，移除没有观察入账就断言未开始执行的措辞。执行状态和业务结论继续分开；既有报告与证据不改写。
- 工具 revision 为 `ts-parallel-2`，新增查询视图契约 `executionRead:1`。A 阶段所有视图保留完整文件校验；轻量读取 B、基础模块抽取 C 尚未实施。默认并发继续为 1，工具不自动调度或重试业务。

## 0.1.4-dev.1 — 开发中 · TypeScript 与可配置并发

- 所有维护程序统一为严格 TypeScript：CLI、文件事务、报告及浏览器交互、测试、构建检查和图片生成；安装包交付编译后的 Node ESM，无新增运行依赖。开发需要先构建，Node 基线仍为 22。
- 新增可配置 `maxParallelCases`（默认 1，任意可准确表示的正整数），显式覆盖与配置快照、名额登记、宿主已知容量、Space 关联与偏差、停止／续接记录。2026-10-24 按用户指示将缺省值从 2 改为 1；未提出并发且无明确配置时逐条执行，AI 自主选择工具调用、批次与 worker。宿主额度未知时保留未知，不主动探测客户端上限或修改全局配置。已冻结运行的配置不追溯改写。
- 原生 AI worker 分例执行及独立封包，协调者明确复核后串行导入；保留原包、首次错误、尝试、部分入账与幂等恢复。工具处理数据事务，不自动选择业务路线、重试业务或判定产品通过。
- 新 run manifest／并发 report 为 v4，执行记录／配置／worker 包为 v1；业务 cases、results、evidence 继续 v3。既有 v3 运行原格式核验、记录与报告，历史资产不原地升级；v2 不支持。
- 报告增加逐目标四态、配置／容量、名额与有来源的执行区间、未完成项、Space 偏差及 Skill 问题。Space 不代表账号或后端数据隔离；用户上限不保证宿主能同时跑满。
- 验证进展与限制见 [验证记录](docs/testing.md)。这是开发版；尚未发布，不表示真实业务或所有故障场景验收通过。

English: Strict TypeScript source, compiled dependency-free runtime, configurable case concurrency, native workers, immutable packets and coordinator-reviewed imports. New parallel runs/reports use v4; business records remain v3 and existing v3 runs are retained. Development build only; see validation limits.

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

验证：2026-10-21，Linux / Node v24.19.0，137/137 合成测试通过（辅助工具 125 项、发布检查器 12 项），零失败、零跳过。独立 Draft 2020-12 复核通过 6 份 Schema、18 个示例及生成 JSON 资产；待澄清最终结果与尝试状态反例、独立 Skill 的 9 条相对链接、当前文件隐私扫描和更新图解视觉检查均通过。上述检查仅验证辅助工具和合成资产，不代表 Windows / Ego 环境下的真实业务测试效果。

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
