<p align="center"><img src="docs/images/hero.zh-CN.png" alt="基于 Ego Lite 的 AI 自主测试 Skill" width="100%"></p>

<h1 align="center">基于 Ego Lite 的 AI 自主测试 Skill</h1>

<p align="center"><a href="README.en.md">English</a> · <strong>简体中文</strong><br><a href="#windows-快速开始">快速开始</a> · <a href="docs/architecture.md">架构</a> · <a href="docs/asset-formats.md">格式与命令</a> · <a href="docs/testing.md">验证状态</a></p>

**由当前 AI 会话分析需求、设计业务目标，通过 Ego Lite 执行并用真实证据判断结果的 Web 测试 Skill。** 面向新项目首次上线前、新功能交付和已有功能回归，可接收现成用例，也可由 AI 根据可信需求生成用例。方法由 AI 选择，目标、必要业务语义与授权边界保持不变。

## 当前版本

当前正式版本为 **0.1.6 / native-network-observation-1**。完整安装包与校验值见 [v0.1.6 Release](https://github.com/99Like-wjj/ai-autonomous-testing-ego-lite/releases/tag/v0.1.6)。用户已反馈本地按一份需求试跑可用；这不代表所有业务、模型和宿主均已验收。发布收尾与已有验证分别见[验证记录](docs/testing.md)。构建与测试不会自动替换用户级 Skill。

Skill 标识为 `ai-autonomous-testing-ego-lite`，显式调用 `$ai-autonomous-testing-ego-lite`。完整包提供 Skill、指南、Node ESM 工具、schema、示例和文件清单。源码维护 TypeScript，安装使用 Node.js >=22。

## 本次改进

- **按阶段使用测试经验。** 用例设计与执行经验分别提供简短入口、主题索引和具体场景，帮助 AI 核对覆盖、前提、证据和误判风险。经验由人工维护、运行时只读，AI 根据目标与授权选择方法。

- **业务目标可分别判断。** case 保留相关流程，goals 保存有来源的独立预期；步骤、条件、必经路径是必要语义，不按点击次数扩充目标数。
- **串并行统一入账。** 串行 record 和协调者复核后的 worker import 写同一 observations/assessments/entries，串行无需虚构分派或封包才能生成目标报告。
- **业务四态与记录缺口分开。** 已验证、发现违反、无法判断、未测试由 AI 显式评估；缺少 assessment 显示为“缺少目标评估记录”，不会自动变成无法判断。
- **结果与原因分开。** 已足以证明违反时可同时记录根因未知。关键动作或结果本身尚不能确认时，具体说明证据缺口；不要求每个 UI 异常都查明后端根因。
- **保留部分完成与历史。** 父场景展示目标分布；final 按目标更新，attempt 保留历史。后续澄清/复核可关联原目标，但不覆盖首次异常或旧结论。

当前测试资产 JSON 契约统一为 **schemaVersion 5**，execution read 的 viewVersion 为 5。新版明确拒绝旧格式，不提供兼容读取或转换。旧报告、截图、运行与来源文件保持原样；重新使用来源时创建新的 v5 资产，不只改版本号，也不覆盖历史。具体见[格式说明](docs/asset-formats.md)。

## 用例与证据

冻结前，AI 核对每个 goal 的来源、前提、动作和观察方式；不同身份或数据依赖可分别表达，必要连续流程仍保留。验收歧义放在目标 clarificationQuestions，实际资源或授权缺口通过真实问答解决；用户明确暂缓的目标继续保留。不能在执行结束时临时扩大已有目标的验收范围。

工具操作成功不代表业务结果成功。关键 UI 结果与缺陷必须有真实页面截图，AI 自主选择取证时机，DOM/日志/动作回执补充截图。下载、拖动、上下文和提交异常可按需查有区分力的观察，具体 Ego 能力仍须以当次安装版本和实际验证为据；能力名称或一次超时不能证明浏览器缺陷。

默认交付独立 HTML、JSON、Markdown。报告显示目标预期、观察、证据、缺口、根因确认程度和历史；三种格式共享统计。缺图与文件完整性单独展示，哈希一致不证明业务判断正确。文件校验与实际浏览器打开分别验证。

接口观测按最终设计 v3 实现：network start/status/query/stop 通过独立 native 上下文自动记录已授权顶层页面的 Fetch/XHR、SSE 及 WebSocket 正文。AI 按需查询、选择证据并自主判断；不强制每步查询，不重发业务请求。网络格式独立为 networkVersion 1，v5 结果契约保持。内容策略、容量、停止/恢复及来源限制见[接口观测指南](skills/ai-autonomous-testing-ego-lite/references/network-observation.md)。

## Windows 快速开始

先按 [Ego 官方 Windows 快速开始](https://lite.ego.app/document/en/docs/windows/quick-start)准备 Ego 与官方 ego-browser Skill。本仓库不安装或替代官方浏览器。仅设计用例无需浏览器连接。

源码开发在已确认仓库执行：

```powershell
npm ci
npm run build
$Tool = Join-Path (Get-Location).Path '.build/runtime/scripts/ego.mjs'
node $Tool tool-info --expect-version 0.1.6 --expect-revision native-network-observation-1
```

独立安装包则使用实际加载 SKILL.md 根目录下 scripts/ego.mjs。核对安装完整性，不混用旧工具根。真实资产保存在源码仓库外：

```powershell
$LocalRoot = Join-Path $env:LOCALAPPDATA 'EgoLiteTest'
New-Item -ItemType Directory -Force -Path $LocalRoot | Out-Null
$Project = Join-Path $LocalRoot ('project-' + [guid]::NewGuid().ToString('N'))
node $Tool init --project-dir $Project
$Cases = Join-Path $Project 'cases.example.json'
```

将示例改成已核对来源和授权的 v5 用例，再冻结：

```powershell
$Run = Join-Path $LocalRoot ('run-' + [guid]::NewGuid().ToString('N'))
node $Tool validate-cases --cases $Cases
node $Tool start --project-dir $Project --cases $Cases --output-dir $Run
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

## 责任与限制

| 部分 | 负责 |
| --- | --- |
| 当前 AI | 理解目标、选择测试与观察、操作获授权浏览器、审阅业务结论 |
| Ego 浏览器 | 提供当前安装版本支持的浏览器原语 |
| 本地工具 | 冻结与入账、引用/revision/文件校验、幂等数据事务、同源报告 |

工具不调用模型，不自动判 bug、选择业务路线或重试业务。接口观测命令会启动独立 Ego native 采集上下文，仅在授权范围内观察；业务 UI 操作仍由 AI 通过 Ego 执行。Space 不保证账号或后端数据隔离；单文件更新不承诺通用多文件事务或断电持久性。证据登记不自动脱敏，真实账号、凭据、站点和截图放在私有工作区，不自动上传报告。详见[隐私指南](docs/privacy.md)。

## v0.1.7 版本前瞻（计划中）

下一版聚焦 **测试效果、评测标准和报告可读性**，不把规划写成已实现能力：

1. **测试效果优化：** 结合实际试跑与复盘，改进需求分析、用例覆盖、经验引用、执行观察和异常恢复；减少漏测、误判与缺乏证据的结论，保留 AI 自主选择方法。
2. **评测标准完善：** 建立可复核的代表性场景与判断依据，分别评估需求覆盖、结论准确性、证据充分性、授权遵守及完成成本；区分工程测试通过和 AI 测试效果，不只统计通过率。
3. **测试报告优化：** 优化摘要、目标结果、缺陷、关键步骤截图与接口证据的关联展示；突出未测试、无法判断和证据缺口，保持 HTML、JSON、Markdown 的结论与统计一致。
4. **文档同步：** 随已验收能力更新 README、使用示例、评测说明和报告示例，明确适用条件与已知限制。

详细范围及验收方向见 [v0.1.7 版本前瞻](docs/v0.1.7-preview.md)。具体实现、阈值和排期仍待设计与审核；本轮不发布 v0.1.7。

## 继续阅读

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

## 并发配置与开发

已整合跨宿主修复提交 8e6e2d9，当前保留 v5 目标评估与监控设计。宿主负责真实子 Agent 的创建、上下文、权限、等待和收尾；本工具不提供固定宿主调度器。跨终端执行前参阅[宿主条件与交接](skills/ai-autonomous-testing-ego-lite/references/host-compatibility.md)。Codex 使用 $ai-autonomous-testing-ego-lite，Claude Code 使用 /ai-autonomous-testing-ego-lite；各宿主完整真实链路仍须分别验收。整合验证见[记录](docs/v0.1.6-cross-host-integration.md)。

`maxParallelCases` 默认为 **1（逐条执行）**；用户未要求并发且未明确配置时保持串行。用户可用命令行或项目配置指定任意可准确表示的正整数，无固定产品上限。AI 决定工具调用、批次与 worker 使用，配置不要求跑满。宿主明确提供的限制单独记录，未知则保持未知，不主动探测客户端最大子代理数或修改全局配置。

```text
node ABS_TOOL_ROOT/scripts/ego.mjs start --project-dir ABS_PROJECT --cases ABS_CASES --output-dir ABS_NEW_RUN --max-parallel-cases 3
```

AI workers 独立留证、封存包，协调者显式复核并导入。完整调用和恢复语义见[并发指南](skills/ai-autonomous-testing-ego-lite/references/parallel-testing.md)。所有继续维护的 CLI、报告交互、测试、构建／检查、历史验证工具和图片生成程序以 TS 维护；`.build` 是忽略的编译产物。`npm test` 先构建再测试实际 JS；`npm run check:public` 检查源文件，独立包仍使用严格资源清单。本仓库的构建、测试不注册或更新用户级 Skill，也不推送、创建 Tag 或 Release。
