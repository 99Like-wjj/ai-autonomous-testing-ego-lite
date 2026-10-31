# 版本演变

[English](version-history.en.md) · [本地验收步骤](v0.1.5-local-acceptance.md)

基于 Ego Lite 的 AI 自主测试 Skill：AI 理解目标、选择方法并判断业务，Ego 操作浏览器，本地工具保存证据和交付报告。

![版本演变：0.1.7 候选、0.1.6、0.1.5、0.1.4、0.1.3、0.1.2，按最新在前展示；图为能力示意。](images/version-history.zh-CN.png)

## v0.1.7 · 云端整合审阅，尚未发布

当前为 `0.1.7-rc.1 / report-step-evidence-1`，主契约 v8。整合整轮资源沟通、首次成果与回归任务/规则、独立运行绑定及逐目标比较；报告采用[实际步骤与证据并排](v0.1.7-step-evidence.md)，保留全部目标、原预期和历史，不补造执行或改写四态。此前 [v0.1.7 前瞻](v0.1.7-preview.md)保留为历史，不能把更广的效果评测规划写成全部完成。

分支核验、文档图片变更及审阅关口见[云端审阅说明](v0.1.7-cloud-review.md)。main 与正式发布保持不变。

## v0.1.6 · 经验指南、目标评估与接口观测

2026-10-29：[完整安装包与发布说明](https://github.com/99Like-wjj/ai-autonomous-testing-ego-lite/releases/tag/v0.1.6)。分离设计/执行经验，统一 v5 目标评估与报告，新增独立接口观测和跨宿主交接约定。旧格式拒绝读取、不自动转换，历史数据保持。验证边界见 [发布验证](https://github.com/99Like-wjj/ai-autonomous-testing-ego-lite/blob/v0.1.6/docs/v0.1.6-release-validation.md)。

0.1.6 的变化还包括设计/执行主题及具体误判场景、串行与并行共用 observations/assessments、按目标增量更新并保留 attempt、结果与根因分离、接口正文/容量/停止交接，以及链接 CLI 入口修复。它们分别有工程、合成和隔离浏览器验证；一次用户试用不代表全部业务或宿主验收，详见上述发布验证。

### 0.1.6 能力补充与验证依据

0.1.6 不仅增加经验文档，还完成逐目标评估、串并行统一记录、接口观测和跨宿主入口修复。以下能力由当前候选继续使用；0.1.6 当时采用 v5，当前 v0.1.7 的 v8 契约不应倒算为旧版格式。

- **按阶段使用测试经验。** 用例设计与执行经验分别提供简短入口、稳定主题索引和具体场景，覆盖前提与数据关系、边界/权限、提交未知、拖动/下载、异步观察及恢复时的误判风险。增加导航与语义走查；经验由人工维护、运行时只读，AI 根据目标与授权选择方法，不引入 RAG、自动学习或固定业务路线。

- **业务目标可分别判断。** case 保留相关流程，goals 保存有来源的独立预期；步骤、条件、必经路径是必要语义，不按点击次数扩充目标数。
- **串并行统一入账。** 串行 record 和协调者复核后的 worker import 写同一 observations/assessments/entries，串行无需虚构分派或封包才能生成目标报告。
- **业务四态与记录缺口分开。** 已验证、发现违反、无法判断、未测试由 AI 显式评估；缺少 assessment 显示为“缺少目标评估记录”，不会自动变成无法判断。
- **结果与原因分开。** 已足以证明违反时可同时记录根因未知。关键动作或结果本身尚不能确认时，具体说明证据缺口；不要求每个 UI 异常都查明后端根因。
- **保留部分完成与历史。** 父场景展示目标分布；final 按目标更新，attempt 保留历史。后续澄清/复核可关联原目标，但不覆盖首次异常或旧结论。
- **按范围观察真实接口。** 独立 Ego native 上下文采集已授权页面的 Fetch/XHR、SSE 与 WebSocket 内容，支持查询、容量控制、内容处理、停止及交接；不重发业务请求，接口成功也不自动等于业务通过。
- **修复链接入口并明确跨宿主交接。** CLI 通过目录链接启动时能够执行；补齐真实 worker、上下文、权限、在途 handle、总活动容量及全 run 包标识约定。没有固定宿主调度器，完整跨宿主链路仍需分别验收。

真实改动与验证依据见[经验开发及正文扩写](https://github.com/99Like-wjj/ai-autonomous-testing-ego-lite/blob/v0.1.6/docs/v0.1.6-development-validation.md)、[目标评估](https://github.com/99Like-wjj/ai-autonomous-testing-ego-lite/blob/v0.1.6/docs/v0.1.6-goal-assessment-validation.md)、[接口观测](https://github.com/99Like-wjj/ai-autonomous-testing-ego-lite/blob/v0.1.6/docs/v0.1.6-network-validation.md)、[跨宿主修复整合](https://github.com/99Like-wjj/ai-autonomous-testing-ego-lite/blob/v0.1.6/docs/v0.1.6-cross-host-integration.md)及[0.1.6 发布收尾](https://github.com/99Like-wjj/ai-autonomous-testing-ego-lite/blob/v0.1.6/docs/v0.1.6-release-validation.md)。工程检查、合成演练、隔离浏览器观察及用户单次试用的范围分别保留，不合并成全面业务验收。

## v0.1.5 · 资源不足时主动澄清

**正式版本：2026-10-25。** [Release、安装包与校验值](https://github.com/99Like-wjj/ai-autonomous-testing-ego-lite/releases/tag/v0.1.5)。已完成限定场景专项验收。 当前源码包含以下规范与文档；专项结果不代表所有模型和业务场景均已验证。

- **解决的问题：** 测试目标需要的身份、权限、项目、数据或观察条件不足时，AI 可能继续执行，却没有主动说明缺口。
- **变化：** Skill 入口明确加载资源指南，按目标判断前提，先在授权内核验；无法自行确认的实质缺口主动询问，只暂停依赖动作。用户补充后核实，再决定恢复；执行中有新依赖也适用。
- **使用收益：** 用户知道缺什么、影响哪些目标、怎样补充；独立且获授权的目标可以继续，缺资源不算通过或产品缺陷。
- **工具与升级：** 复用现有记录、证据和报告，区分验收歧义、资源可用性和操作授权；不新增资源台账 JSON 或固定业务流程。用例/结果/证据 v3、manifest/report v4 等既有格式保持。
- **本版同时新增：** 本演变页、README 入口和双语版本总览图。
- **限制：** 是否资源充分、提问内容及恢复仍由 AI 判断；辅助笔记不自动受报告校验。工程回归不能替代真实使用验收。

需要 Node.js 22+，更新时使用完整包并核对实际加载版本。完整安装包版本与 Codex Skill 元数据统一为 0.1.5，不带 dev；仓库和 Skill 更名为 ai-autonomous-testing-ego-lite。升级先核对不明安装修改与历史资产，参阅[更名与升级说明](rename-upgrade.md)。正式版本不等于所有场景已验证。

## 已发布

以下较早版本的发布时间来自各 Release 的 published_at，统一为北京时间；v0.1.5 的精确发布时间以 Release 为准。CHANGELOG 内开发/归档日期保持其原含义。

### v0.1.4 · 可配置并发与协调复核

**正式发布：2026-10-24 19:56。** [Release、安装包与校验值](https://github.com/99Like-wjj/ai-autonomous-testing-ego-lite/releases/tag/v0.1.4)

- **解决的问题：** 多用例测试需要在用户设置的并发范围内分工，同时保留各用例证据、共享资源限制与复核责任。
- **主要变化：** 默认串行，用户可配置并发；原生 worker 独立封包，由协调者按原目标复核后导入。增加执行台账、Space 关联/偏差、逐目标四态和轻量查询。维护源码迁为 TypeScript，用户使用编译后的 JavaScript。
- **使用收益：** 允许独立用例并发执行；报告说明哪些目标已验证、违反、无法判断或未测试，并保留首次错误和未完成项。
- **升级影响：** 新 manifest/report 为 v4，cases/results/evidence 仍 v3；execution/configuration/workerPacket 为 v1，executionRead 为 v2。已有 v3 run 保持原格式。
- **限制：** 默认并发 1；用户上限不保证宿主跑满。Space 不保证账号或后端隔离；文件一致性不证明结论正确，历史实测限制见对应 Release。

### v0.1.3 · 图文证据与完整交付

**正式发布：2026-10-23 00:05。** [Release、安装包与校验值](https://github.com/99Like-wjj/ai-autonomous-testing-ego-lite/releases/tag/v0.1.3)

- **解决的问题：** 聊天摘要和零散文件不便复核，单独复制说明文件也可能漏掉实际工具。
- **主要变化：** 增加证据登记、revision 化结果、历史尝试、进度及完整性检查。默认交付离线 HTML、JSON、Markdown；关键 UI 结果/缺陷要求真实截图。完整安装包附工具、schema 和文件清单；支持报告读回及明确标识的事后整理。
- **使用收益：** 可查看观察、理由、截图、来源与历史；缺图和未验证项保留，旧报告不被补写覆盖。
- **升级影响：** 资产改为 v3，v0.1.2 的 v2 不能直接使用；从原始需求重新整理后新建运行，不只改版本号，不自动迁移或删除。
- **限制：** hash 证明留存字节一致，不认证截图或业务结论；本地试用和合成回归不代表所有真实业务场景已验收。

### v0.1.2 · 业务意图步骤与验收澄清

**实验性预发布：2026-10-22 17:11。** [预发布说明、完整工具包与校验值](https://github.com/99Like-wjj/ai-autonomous-testing-ego-lite/releases/tag/v0.1.2)

- **解决的问题：** 不完整需求不应被编造成按钮级操作和无依据的逐步预期。
- **主要变化：** 步骤表达业务意图与必要输入；步骤检查点可选，整体 expected 和 basis 保留。clarificationQuestions 表示验收待澄清，未解决时不判 pass/fail。
- **使用收益：** AI 可按实际界面选择方法，同时保留业务目标；外部用例和 AI 生成用例均支持，也可只生成草案。
- **升级影响：** 资产仍为 v2，软件版本和资产格式独立编号。
- **限制：** 该版主要交付 JSON/Markdown，没有 v0.1.3 的图文证据交付链路，也不含 v0.1.4 并发能力。历史合成测试不代表 Windows/Ego 业务实测。

## 更早的开发历史

v0.1.0/v0.1.1 在仓库 CHANGELOG 中记录了初始工具、中文优先说明、统一步骤及用例校验。本轮历史核对未发现对应远端 Tag/Release，因此仅作为早期开发介绍，不标为已核验的正式发布。

能力归属以对应 Tag 源码、Release 和 CHANGELOG 共同核对。验收澄清在 v0.1.2 已有，v0.1.5 是补强资源充分性与主动询问。图中内容是能力示意，不能代替真实测试截图。
