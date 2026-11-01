<p align="center"><img src="docs/images/hero.zh-CN.png" alt="基于 Ego Lite 的 AI 自主测试 Skill" width="100%"></p>

<h1 align="center">基于 Ego Lite 的 AI 自主测试 Skill</h1>

<p align="center"><a href="README.en.md">English</a> · <strong>简体中文</strong><br><a href="#windows-快速开始">快速开始</a> · <a href="docs/architecture.md">架构</a> · <a href="docs/asset-formats.md">格式与命令</a> · <a href="docs/testing.md">验证状态</a></p>

**基于 Ego Lite 的 AI 自主 Web 测试 Skill。** 面向新项目首次上线、新功能交付和已有功能回归，支持接收现成用例或根据需求生成用例。

## 设计理念：AI 主导，工具提供能力

本项目由 AI 主导自动化测试。AI 负责理解需求、设计用例、自主探索页面、选择操作与验证方法，并依据实际证据判断结果。我们提供可按需组合的具体能力工具，以及测试规范和经验参考，帮助 AI 完成工作，而不是用固定流程替它决定每一步。

- **AI 决定怎样测。** 根据目标和现场情况，自主选择工具、组织步骤、补充取证、调整方法，或提出澄清。
- **工具把具体能力做好。** Ego 提供浏览器操作；本项目工具提供测试记录、证据留存、接口观测、回归资料和报告生成等能力，不替 AI 判定业务是否正确。
- **方法开放，要求明确。** 可以灵活选择方法，但不能改变业务目标、降低验收标准、跳过必要依赖或扩大授权；操作成功不等于测试通过。

我们希望随着模型能力提升，让 AI 更好地运用这些能力完成测试；实际效果仍通过验证来判断，不预设升级就一定更好。

![AI 位于中心，按需调用并列能力并根据事实反馈调整方法；不是固定执行顺序。](docs/images/design-philosophy.zh-CN.png)

## 当前版本

当前源码为 **0.1.8-rc.2 / conversation-review-1**，尚未正式发布。按已确认的轻量设计开发用例版本与人工审阅、稳定编号重测、官方下载取证和文件检查、历次报告对照。新增场景/用例总览、三栏评审、报告同款背景，以及避开浏览器下载区域标记的本机意见保存。主契约 v9、regressionVersion 2、networkVersion 1。最近正式版本仍为 [0.1.7](https://github.com/99Like-wjj/ai-autonomous-testing-ego-lite/releases/tag/v0.1.7)。范围见[开发自测](docs/v0.1.8-development-validation.md)和[审阅修复说明](docs/v0.1.8-case-review.md)，构建不自动更新已安装 Skill。

新增通用对话证据、每步输入/回复摘要和方案2完整对话侧栏；四层质量改进覆盖预期/时机核对、原文取证、可读描述和来源校验，详见[本次设计及验证](docs/v0.1.8-conversation-review.md)。主契约仍为v9，独立对话格式为conversationVersion 1；历史运行与报告不改写。

Skill 标识为 `ai-autonomous-testing-ego-lite`，显式调用 `$ai-autonomous-testing-ego-lite`。完整包提供 Skill、指南、Node ESM 工具、schema、示例和文件清单。源码维护 TypeScript，安装使用 Node.js >=22。

审阅入口与本轮范围见 [0.1.7 云端整合审阅](docs/v0.1.7-cloud-review.md)。四个工作分支均已包含在最新基线中，不重复应用提交；人工审阅已通过，正式收尾与验证边界见[发布验证](docs/v0.1.7-release-validation.md)。

## 版本演变

![最新在前：v0.1.8 开发候选，其后为 v0.1.7、v0.1.6、v0.1.5 正式版。图为能力示意，非测试截图。](docs/images/readme-version-history.zh-CN.png)

README 展示当前版本与前三个历史版本：0.1.8-rc.2 为开发候选，0.1.7–0.1.5 为正式版本。更早版本及完整介绍保留在[完整版本演变](docs/version-history.md)中。头图、流程、架构、并发与报告示意已对齐本版本；图片是能力说明，不是真实测试证据。0.1.8 已进入获准开发与自测，尚未发布。

## 0.1.8 做了什么

- 用例整份版本、内嵌稳定编号及同源 HTML/Markdown 审阅；定义不变复测只增 run。
- points/status/full 三种范围，局部重测保留必要依赖，不继承未选点通过。
- 官方 Ego 下载监听/saveAs、显式管理页补证、原件及只读 JSON/CSV/XLSX 检查。
- 精确父运行、原问题检查及历史原图/附件；当前四态与修复归因分开。

详见[最终设计](docs/v0.1.8-design.md)及[当前契约](docs/asset-formats.md)。

## 0.1.7 做了什么

以下保留上一正式版的能力介绍；其规则/任务写入接口不属于当前 v9 入口。

这一版围绕 **报告更好读、测试资源先沟通、首次成果可回归复用** 三个方向，把报告优化与资源/回归能力整合到同一套记录中。

- **看清问题和复现过程。** 报告方案 B 把问题描述与原预期放在顶部，实际操作步骤与对应证据并排；按场景/目标筛选定位，范围、原始记录与历史按需展开，减少重复阅读。
- **证据就近查看。** 支持截图、接口/日志及资料正文，保留图片上下文、共享材料与缺口说明；支持离线 HTML、JSON、Markdown 和附件交付，八种主题便于阅读。
- **按整轮范围沟通资源。** 首次执行或恢复前核对身份、对象、数据、观察条件及操作授权，集中说明已知缺口；承接部分答复，核实补充条件，独立且获授权的目标可继续。
- **首次测试成果留作回归资料。** 保存规则依据、实际观察、失败及未完成信息，由 AI 整理项目专属任务与规则修订。历史异常不会被固化成正确预期，通用经验指南仍人工维护、运行时只读。
- **支持两种回归范围。** 按历史目标状态命中后重跑整条场景，或对明确的完整测试集执行全量回归；不是按测试点编号单点回测。每次重新核验条件，创建独立运行，不覆盖历史证据。
- **比较结果也保留限制。** 关联本轮任务/规则版本、实际动作及目标结论，展示跨轮变化和条件差异。未知副作用先核对，不自动重放；状态变化不直接等同于某个 Bug 被修复或新版本引入缺陷。

设计与验证依据：[报告方案 B](docs/v0.1.7-step-evidence.md)、[整轮资源澄清](docs/v0.1.7-resource-readiness-validation.md)、[回归复用](docs/v0.1.7-regression-reuse-validation.md)、[云端整合审阅](docs/v0.1.7-cloud-review.md)。0.1.6 的经验指南、目标评估、接口观测等补充说明已归入[完整版本历史](docs/version-history.md)，此处聚焦 0.1.7 的变化。

回归接口与行为边界见[回归资料](docs/regression-reuse.md)和[回归使用指南](skills/ai-autonomous-testing-ego-lite/references/regression-reuse.md)。

当前测试资产 JSON 契约统一为 **schemaVersion 9**，execution read 的 viewVersion 为 9。新版明确拒绝旧格式，不提供兼容读取或转换。旧报告、截图、运行与来源文件保持原样；重新使用来源时创建新的 v9 用例，不只改版本号，也不覆盖历史。具体见[格式说明](docs/asset-formats.md)。

## 用例与证据

![AI 按业务目标自主选择方法，逐目标说明四态与证据。](docs/images/workflow.zh-CN.png)

冻结前，AI 核对每个 goal 的来源、前提、动作和观察方式；不同身份或数据依赖可分别表达，必要连续流程仍保留。验收歧义放在目标 clarificationQuestions，实际资源或授权缺口通过真实问答解决；用户明确暂缓的目标继续保留。不能在执行结束时临时扩大已有目标的验收范围。

工具操作成功不代表业务结果成功。关键 UI 结果与缺陷必须有真实页面截图，AI 自主选择取证时机，DOM/日志/动作回执补充截图。下载、拖动、上下文和提交异常可按需查有区分力的观察，具体 Ego 能力仍须以当次安装版本和实际验证为据；能力名称或一次超时不能证明浏览器缺陷。

默认交付独立 HTML、JSON、Markdown。报告显示目标预期、观察、证据、缺口、根因确认程度和历史；三种格式共享统计。缺图与文件完整性单独展示，哈希一致不证明业务判断正确。文件校验与实际浏览器打开分别验证。

当前报告采用方案 B：场景保留全部目标入口，一次聚焦一个目标；顶部呈现问题描述/验证结果及完整原预期，中间呈现实际步骤，右侧展示所选步骤证据。目录默认/重置收起，筛选保留正文选择；范围说明超过三条时外层折叠，其内精确任务/规则明细仍独立收起。未决动作使用中文业务说明，原始记录和历史保留。可选 readerNotes 只整理有来源的既有事实与问题位置，不能补造步骤、现场或改写四态；共享证据和逐步资料缺口明确说明。业务契约为 v9，旧报告不覆盖。见[最终阅读设计](docs/v0.1.7-step-evidence.md)及[此前阅读修复](docs/v0.1.7-reader-review.md)。开发构建不会自动替换用户安装。

接口观测按最终设计 v3 实现：network start/status/query/stop 通过独立 native 上下文自动记录已授权顶层页面的 Fetch/XHR、SSE 及 WebSocket 正文。AI 按需查询、选择证据并自主判断；不强制每步查询，不重发业务请求。网络格式独立为 networkVersion 1，当前结果契约为 v9，原 v5 运行历史保持原样。内容策略、容量、停止/恢复及来源限制见[接口观测指南](skills/ai-autonomous-testing-ego-lite/references/network-observation.md)。

![方案 B 布局示意：问题和原预期置顶，实际步骤与所选证据并排，范围及历史折叠；不是实际测试报告截图。](docs/images/result-specimen.zh-CN.png)

## Windows 快速开始

本节源码示例针对当前正式版本，使用本仓库构建的 .build/runtime；不会自动替换用户安装。正式安装包按其实际版本和 revision 核对。

完整安装包、SHA-256 校验值与发布说明见 [v0.1.7 Release](https://github.com/99Like-wjj/ai-autonomous-testing-ego-lite/releases/tag/v0.1.7)。GitHub 自动生成的 Source code 压缩包不是完整安装包。

先按 [Ego 官方 Windows 快速开始](https://lite.ego.app/document/en/docs/windows/quick-start)准备 Ego 与官方 ego-browser Skill。本仓库不安装或替代官方浏览器。仅设计用例无需浏览器连接。

源码开发在已确认仓库执行：

```powershell
npm ci
npm run build
$Tool = Join-Path (Get-Location).Path '.build/runtime/scripts/ego.mjs'
node $Tool tool-info --expect-version 0.1.7 --expect-revision report-step-evidence-1
```

独立安装包则使用实际加载 SKILL.md 根目录下 scripts/ego.mjs。核对安装完整性，不混用旧工具根。真实资产保存在源码仓库外：

```powershell
$LocalRoot = Join-Path $env:LOCALAPPDATA 'EgoLiteTest'
New-Item -ItemType Directory -Force -Path $LocalRoot | Out-Null
$Project = Join-Path $LocalRoot ('project-' + [guid]::NewGuid().ToString('N'))
node $Tool init --project-dir $Project
$SaveRequest = Join-Path $Project 'cases-save-request.example.json'
# Edit against trusted requirements before saving and human review.
node $Tool cases save --work-dir $Project --request $SaveRequest
$Cases = Join-Path $Project 'cases/v001.json'
node $Tool cases render --cases $Cases --output-dir (Join-Path $Project 'case-documents')
node $Tool cases serve --cases $Cases --output-dir (Join-Path $Project 'review-files')
```

用Ego打开serve实际返回的本机私有URL，页面保存意见时由本地工具写入可读HTML/JSON；不会登记正式确认或执行业务。原来的离线HTML仍可阅读和恢复意见。需要不经浏览器保存已有意见时，使用 cases export-review；命令和边界见[审阅保存说明](docs/v0.1.8-case-review.md)。

实际人工审阅后登记确认，选择范围并填写本轮条件和绑定请求，再冻结：

```powershell
$Run = Join-Path $LocalRoot ('run-' + [guid]::NewGuid().ToString('N'))
node $Tool validate-cases --cases $Cases
# AI prepares this file from actual review, scope and current conditions.
$Binding = Join-Path $Project 'run-binding-request.json'
node $Tool start --project-dir $Project --cases $Cases --binding $Binding --output-dir $Run
```

start 只创建本地基线与空账本，不自动执行浏览器。按[工具箱指南](skills/ai-autonomous-testing-ego-lite/references/local-toolbox.md)登记真实文件与显式目标评估：

```text
node ABS_TOOL evidence-add --run-dir ABS_RUN --request ABS_EVIDENCE_REQUEST
node ABS_TOOL record --run-dir ABS_RUN --request ABS_RECORD_REQUEST
node ABS_TOOL progress --run-dir ABS_RUN
node ABS_TOOL check --run-dir ABS_RUN
node ABS_TOOL report --run-dir ABS_RUN
node ABS_TOOL verify-report --run-dir ABS_RUN --report-dir ABS_REPORT_DIR
```

请求用唯一 operationId 和当前 expectedRevision。相同请求重放只取回数据回执，不重复业务；冲突拒绝后由 AI 核对现状。report 拒绝覆盖，另存使用新目录。verify-report 的 browserOpen:not_checked 不表示实际已打开，需单独通过 Ego 检查后再说明。示例只含合成数据，不能当真实通过证据。

## 使用边界

Space 不保证账号或后端数据隔离；文件更新不承诺通用多文件事务或断电持久性。证据登记不自动脱敏，真实账号、凭据、站点和截图放在私有工作区，不自动上传报告。接口观测只在授权范围内启用，不重发业务请求。详见[隐私指南](docs/privacy.md)与[完整架构及职责](docs/architecture.md)。

## 并发配置与开发

![独立用例 worker 留证封包，协调者复核后汇总；默认串行，显式配置后安排并发。](docs/images/parallel.zh-CN.svg)

已整合跨宿主修复提交 8e6e2d9，当前保留 v9 目标评估与监控设计。宿主负责真实子 Agent 的创建、上下文、权限、等待和收尾；本工具不提供固定宿主调度器。跨终端执行前参阅[宿主条件与交接](skills/ai-autonomous-testing-ego-lite/references/host-compatibility.md)。Codex 使用 $ai-autonomous-testing-ego-lite，Claude Code 使用 /ai-autonomous-testing-ego-lite；各宿主完整真实链路仍须分别验收。整合验证见[记录](docs/v0.1.6-cross-host-integration.md)。

`maxParallelCases` 默认为 **1（逐条执行）**；用户未要求并发且未明确配置时保持串行。用户可用命令行或项目配置指定任意可准确表示的正整数，无固定产品上限。AI 决定工具调用、批次与 worker 使用，配置不要求跑满。宿主明确提供的限制单独记录，未知则保持未知，不主动探测客户端最大子代理数或修改全局配置。

```text
node ABS_TOOL_ROOT/scripts/ego.mjs start --project-dir ABS_PROJECT --cases ABS_CASES --binding ABS_BINDING --output-dir ABS_NEW_RUN --max-parallel-cases 3
```

AI workers 独立留证、封存包，协调者显式复核并导入。完整调用和恢复语义见[并发指南](skills/ai-autonomous-testing-ego-lite/references/parallel-testing.md)。所有继续维护的 CLI、报告交互、测试、构建／检查、历史验证工具和图片生成程序以 TS 维护；`.build` 是忽略的编译产物。`npm test` 先构建再测试实际 JS；`npm run check:public` 检查源文件，独立包仍使用严格资源清单。本仓库的构建、测试不注册或更新用户级 Skill，也不推送、创建 Tag 或 Release。

## v0.1.8 需求前瞻（测试效果优化）

首次测试、失败范围复测和报告审阅表明：现有回归仍需 AI 重新核对候选任务和当前数据，整场景重跑范围可能大于原问题范围，动作与证据关联也有待更精确。下一版继续以测试效果为目标：

1. **稳定测试点编号：** 每个最小可独立判断目标都有编号，包含全部四态；同一目标跨运行沿用编号，内容修订与执行次数另记。支持用户给出编号后单点回测，保留必要依赖，不只给 Bug 编号。
2. **缺陷与全量回归：** 区分原问题是否复现、新发现及目标四态；全量对照最新已确认需求的完整目标清单，保留新增、受阻、未整理和缺少评估的范围。
3. **精确证据与任务复用：** 在入账时关联具体动作、输入、读回及证据；参数化日期和对象，按需复用有适用条件的稳定 Ego 操作片段，保持 AI 自主方法和业务判断。
4. **测试效果与方案质量：** 通过对等目标与实际证据核对覆盖、有效问题、误判、授权及完成情况，结合能力复用、职责和可维护性评审设计取舍。
5. **下载观察与数据检查：** 调研当前安装版本的相关下载路径，准确关联本次实际文件，分别验证下载完成、文件可读取及数据符合业务预期，明确观察缺口和支持限制。
6. **报告复测历史：** 首次报告保持纯净，后续连贯展示首次、历次和当前结果及证据，区分原问题、新发现、记录修订和本次未重测范围。
7. **用例文档与人工审阅：** 同源交付 HTML/Markdown，生成测试点或用例草案后暂停审阅，记录意见、修订及确认版本；AI 负责设计和判断，代码沉淀文档、校验与记录。

原七项前瞻、三项新增需求及旧前瞻的设计质量、经验适用性合并为十二项，[需求文档已获确认](docs/v0.1.8-requirements.md)。依据[调研](docs/v0.1.8-feasibility-research.md)已形成[最终设计（收敛版）](docs/v0.1.8-design.md)，配套[轻量数据与接口](docs/v0.1.8-contract-design.md)及[下载设计](docs/v0.1.8-download-design.md)。资料仅按用例版本、审阅依据和历次运行保存，不建设通用项目资产库；背景见[需求前瞻](docs/v0.1.8-preview.md)。当前软件与契约不升级，研究原型和设计不写成已交付能力，原[v0.1.7 前瞻](docs/v0.1.7-preview.md)继续保留。

## 继续阅读

- [完整版本演变](docs/version-history.md)、[历史需求与调研](docs/requirements.md)、[v0.1.5 更名历史与升级说明](docs/rename-upgrade.md)
- [用例设计经验入口](skills/ai-autonomous-testing-ego-lite/references/case-design-guide.md)、[执行经验入口](skills/ai-autonomous-testing-ego-lite/references/experience-guide.md)、[接口观测指南](skills/ai-autonomous-testing-ego-lite/references/network-observation.md)

- [Skill](skills/ai-autonomous-testing-ego-lite/SKILL.md)、[用例生成](skills/ai-autonomous-testing-ego-lite/references/case-authoring.md)、[判断与归因](skills/ai-autonomous-testing-ego-lite/references/judgment-and-diagnosis.md)
- [架构](docs/architecture.md)、[格式](docs/asset-formats.md)、[验证状态](docs/testing.md)、[更新记录](CHANGELOG.md)
- [用例示例](examples/cases.example.json)、[证据请求](examples/evidence-request.example.json)、[结果请求](examples/record-request.example.json)

## 问题反馈与联系

欢迎通过 [GitHub Issues](https://github.com/99Like-wjj/ai-autonomous-testing-ego-lite/issues) 或以下联系方式反馈问题、提出建议。请附上版本号、复现步骤和脱敏后的报错或截图，不要提交密码、令牌、密钥或公司内部资料。

- 作者：[99Like-wjj](https://github.com/99Like-wjj)
- 邮箱：[wjj990517@gmail.com](mailto:wjj990517@gmail.com)
- 微信：A2326543144

  <img src="docs/images/wechat-contact-qr.png" alt="作者的微信联系二维码" width="240">
- QQ：2326543144
- X：[@99Like_ovo](https://x.com/99Like_ovo)

## 许可证

本仓库原创代码和文档按 [MIT License](LICENSE) 授权，版权声明为 2026 99Like-wjj。此许可不覆盖 Ego、Ego 官方浏览器或其他第三方软件；它们仍受各自许可和官方条款约束。本项目非 Ego 官方项目，未获其背书。源码按 MIT 许可开放；项目仍在持续开发，具体版本能力与验证范围以对应版本说明为准。
