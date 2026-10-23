# 后续版本需求与调研记录

当前需求以文末“2026-10-23 用户澄清后的需求”和“2026-10-23 补充批准：全量 TypeScript 与可配置并发”为准；下面的初步调研保留为历史，不能再将其中的工具硬隔离当作 v0.1.4 的必需前置条件。正式功能尚未实现，已有有限的本机能力验证；本文件不含真实业务数据。统一方案见 [v0.1.4 设计审核稿](v0.1.4-design.md)。

## v0.1.4：并行用例执行与 Ego Space 绑定（历史初步调研）

### 最初记录的需求（历史口径）

- 对相互独立的测试用例评估使用多个 subagent 并行执行，减少单个用例串行等待。
- **一个测试用例从开始到结束绑定一个 Ego Space。** 用户所说的 Space 是 Ego 总览中的独立 Space 卡片；一个浏览器 tab 不算一个 Space。执行同一用例时不得新开或切换到第二个 Space。
- 不能因分配、回收或恢复用例而关闭用户预先打开的其他 Space。任何自动清理只能作用于本次编排明确创建并拥有的 Space；所有权不确定时保留现场并交由用户处理。
- 不将“并行”理解为固定测试 DAG。AI 仍自主分析需求、选择用例与页面路径；仅在用例可独立执行且数据/业务依赖允许时并行。

### 需要独立调研的问题

1. Codex subagent 的创建、等待、停止、结果汇总和并发额度，当前客户端/模型/环境分别如何支持；并行是否能降低实际总耗时，成本与协调开销是什么。
2. 如何定义独立用例：共享账户、租户、后端数据、队列、缓存、限流、同一记录与状态迁移可能造成何种竞争；Cookie/存储隔离是否等于业务数据隔离。
3. 如何把一个用例稳定分配给唯一 Space，并在每次 Ego 调用/续跑时保持绑定；能否从工具暴露面或受控 wrapper 强制禁止 subagent 为同一用例指定第二个 Space，而非只依赖提示词。
4. Space 的分配、续跑、失败、取消、超时、浏览器重启与崩溃恢复；如何记录创建者、所有权与当前用例关联。
5. Space 释放与恢复策略如何保留审计页面并保护预先存在的用户 Space；绝不通过关闭所有 Space、按全局列表清场或猜测名称释放资源。
6. 并发度上限如何按 CPU、内存、页面复杂度、站点限流与业务风险确定；如何处理互相依赖的用例、写操作冲突与不完整结果。
7. “同一用例只能使用一个 Space”可否通过 API/编排层形成可测试、可审计的强约束；异常时如何安全停止，不切换到第二 Space 继续用例。

### 官方资料与源码调研（2026-10-22）

- OpenAI 的 Codex 文档说明可将有界、相互独立的工作委派给并行 subagent；这类工作会增加 token 消耗，写密集或相互依赖的任务要谨慎处理。[Codex subagents](https://developers.openai.com/codex/agent-configuration/subagents)
- Ego 官方 Space 文档将 Space 描述为任务工作区，并提供 task-space helpers 供任务复用或创建 Space；Windows 文档说明一个 Space 可包含多个 tabs。[Ego Space](https://lite.ego.app/document/en/docs/space)
- Ego Windows 文档说明多个任务可放在各自 Space 并行，实际并发受本机 CPU 与内存限制；Space 保留自己的 tabs 供任务结束后审阅。[Ego Windows Space](https://lite.ego.app/document/en/docs/windows/space) · [Ego Windows 介绍](https://lite.ego.app/document/en/docs/windows/product-introduce)

固定源码基线 `citrolabs/ego-lite@d392204d1ea1a8027a591ab2b0129c2e11d85f26` 的 `native-gate.ts` 显示：同一 Node 进程中的 native Space 操作经过一个进程级 FIFO gate，异步操作执行期间会持有 gate；这意味着单进程内并发调用不会并行操作多个 Space。`ego.useTaskSpace(id)` 只选择**当前 Node invocation** 的 task context；选择丢失/不存在的 Space 会报错，不会自动创建替代 Space。[固定版本 `native-gate.ts`](https://github.com/citrolabs/ego-lite/blob/d392204d1ea1a8027a591ab2b0129c2e11d85f26/package/ego-browser/src/native-gate.ts) · [Native Bindings API](https://github.com/citrolabs/ego-lite/blob/main/docs/native-bindings-api.md)

同一固定源码基线中的 `PageLedgerStore` 为每个 Space 写独立 JSON 文件，以临时文件加 rename 避免读到半份文件；但更新仍是各进程分别 read-modify-write，没有跨进程锁或 compare-and-swap。因此建议同一 Space 同时只由一个 worker 操作；不同 Space 可由独立 subagent/CLI 进程尝试并行。实际是否能通过 SDK/宿主正确路由多个进程仍待验证。[固定版本 `page-ledger.ts`](https://github.com/citrolabs/ego-lite/blob/d392204d1ea1a8027a591ab2b0129c2e11d85f26/package/ego-browser/src/page-ledger.ts)

当前 main 分支的官方 Native Bindings 文档与上述 API 行为交叉吻合；但本次没有确认该文档对应当前仓库最新 HEAD。以 Ego 文档及 `skills/ego-browser/references/clearing-state.md` 为准，同一 browser profile 下的 Space 与用户 tab 共享 cookies 和 HTTP cache。独立 Space / BrowserContext 不代表身份会话或后端业务数据隔离；使用相同账号、租户或记录的登录、退出与写操作应串行，或由另行设计的互斥机制保护。[Ego clearing-state guide](https://github.com/citrolabs/ego-lite/blob/main/skills/ego-browser/references/clearing-state.md)

**初步设计建议（未实现、未实机验证）：** 每个 case 在分派时绑定一个 numeric `spaceId`，重试或替换 worker 必须沿用该 ID；如果找不到原 Space，则将 case 记为 blocked 并停止，不能自动创建第二个 Space。需要并行时，使用多个 subagent/独立 CLI 进程，而非在一个 Node 进程内 `Promise.all` 操作 Ego。Space 是 Ego 总览中的独立空间卡片，一个 Space 内可以保留多个 tab。不得 claim 或关闭用户预先存在的 Space；只清理本次明确创建且所有权仍可证明的 Space，无法确认所有权时保留现场。

上述候选方案仍有重要限制：Skill-only 或可绕过的 wrapper 不能硬性禁止直接调用原生 Ego CLI 创建第二个 Space。若要形成强约束，需要宿主权限隔离并只提供 case-scoped 工具入口；该能力尚未验证。推荐先评估 `maxParallelCases=2` 的小规模合成验证，并可退回 1；这不是已经确定的默认并发度。

### 尚待验证

- Windows 原生多客户端下的 Space 路由、CDP 分发、焦点/后台行为、popup 处理和崩溃恢复；本次未做真实 Windows 实测。
- subagent 是否能稳定运行独立 CLI 进程，以及宿主能否限制它只能使用分配给当前 case 的 Space。
- Space 创建者/所有权、numeric ID 持久性、取消/超时/worker 替换和重启恢复的完整生命周期。
- 多进程下并行写入同一 run 的结果/证据时，工具箱锁和操作幂等策略是否足以避免冲突。
- 后端数据、账号/租户、副作用与并发配额如何识别；profile 的 cookie、缓存共享范围也要按目标 Ego 安装版本复验。

本节是调研记录和候选设计，不属于 v0.1.3 实现，也不是 v0.1.4 完整设计或发布承诺。源码调研基于固定 SHA；文档 main 仅作交叉核验，未确认最新 HEAD。后续应在不访问真实业务数据的合成环境完成验证，再决定是否进入实现。

### 后续验收方向（待调研确认）

- 每个执行中的用例都有唯一、可审计的 Space 绑定；所有续跑仍回到该 Space。
- 单个用例尝试创建或选择第二 Space 时会被编排层拒绝或安全停止；不能靠关闭用户 Space 消除冲突。
- 独立用例只有在共享状态和副作用检查通过后才可并行；并行度可限制，依赖用例自动保持串行，但不改变 AI 的用例选择权。
- 取消、超时、崩溃和恢复不会误关预先存在的 Space；Space 所有权不明时不自动清理。
- 并行结果保留每例观察、证据、首次失败、尝试和未完成状态；不会把并行成功数当作准确性或业务通过率。

以上是待研究方向，不是 v0.1.4 完整设计或实现承诺。后续调研结论应先补入本文件，再决定是否进入设计与实现。

## 2026-10-23 用户澄清后的需求（当前）

本节来自用户本次重新评估请求，取代历史记录中将单例单 Space 解释为不可绕过强约束的部分。旧方案与旧测试结果保留原结论，不追溯改判。

### 必须实现的能力与执行原则

- **用例并发是 v0.1.4 必需能力。** 对具备独立执行条件的用例，使用多个 subagent 并行驱动不同 Ego Space，降低整批串行等待；不能以只能串行的实现声称已完成此需求。实际耗时收益须实测，不预先承诺固定加速倍数。
- **单用例默认尽量复用一个 Ego Space，是执行原则，不要求宿主硬性禁止所有偏差。** 允许 Agent 误开、误切或执行失败；不能因无法建立不可绕过的权限边界而阻塞并发功能。
- 发生 Space 偏差时保留实际关联、原始错误、尝试和证据，并复核对业务结论的影响。多开 Space 本身不自动等于产品缺陷；身份、数据、必要步骤或证据受到影响时，不能继续冒报通过。
- 纠正偏差、重试或需要换 Space 恢复时，由 AI 在已有授权内判断；先核对前提与已发生副作用，记录原因、前后 Space 和尝试关联，不静默重放未知写操作。
- 预先存在的用户／其他任务 Space 仍须保护。清理只针对本次明确创建并拥有的精确 ID，所有权不明时保留现场；允许执行出错不等于授权越界操作或删除用户资产。
- AI 自主判断独立性、选择用例、路径、并发批次及是否补测；有依赖或共享写冲突的部分可串行，不引入固定业务 DAG，也不把所有写用例一律排除并发。
- 保留每例目标、预期、真实观察、证据、首次失败、尝试、未完成项和独立状态；并发任务完成数量不能替代业务通过率。

### 当前证据与待验证项

- 本机双 CLI／双 Space 的有限合成路由有实际重叠、页面读回及截图证据；常规创建、续跑和精确清理的 Space 保护子目标已验证，见[首轮能力验证](v0.1.4-capability-validation.md)与[保护补测](v0.1.4-space-protection-retest.md)。这些不是完整 v0.1.4 验收。
- 两名 AI subagent 实际并发执行冻结用例、提交独立证据并汇总成报告的产品链路尚未验证；正式验收必须包含这条链路。
- 错 Space／执行失败的记录、结果复核、部分完成、停止与续接需要验证；不要求证明 Agent 永远不会出错。
- 账号／profile／后端数据竞争、Windows 视口与截图稳定性、并发额度及实际耗时收益仍需针对场景验证。Space 的操作路由隔离不代表所有业务共享状态都隔离。

### 架构评估建议（不是额外硬需求）

推荐沿用 Node.js 运行时，使用宿主原生 subagents 与 Ego 原生接口，补充轻量执行台账、分例证据目录和单一结果写入者。**语言方向已由用户补充批准为全量 TypeScript，属于本次版本需求**；不增加独立 Agent 服务、浏览器 broker 或权限沙箱作为必需前提。此前将 TypeScript 作为可选项的分析只保留为决策历史；当前实现建议以 [v0.1.4 设计审核稿](v0.1.4-design.md)为准。

## 2026-10-23 补充批准：全量 TypeScript 与可配置并发（当前）

本节来自用户“批准全量切换 ts 语言，列入本次版本需求”及“并发数允许用户自由设计，做成可配置项”的直接指示，与上一节执行原则共同构成当前需求。

- **R-TS：全量 TypeScript 重构纳入 v0.1.4。** 所有继续维护的程序源码统一使用 TS，包括本地 CLI、校验／证据／报告逻辑、报告浏览器交互、构建与检查工具、测试、开发验证工具和现有 Python 图片生成工具。Node ESM 源码可使用 TypeScript 的 `.mts` 扩展名。Markdown、JSON Schema、用例数据和图片继续使用适合各自内容的格式；历史验证包、截图、报告和原始证据保留原样。
- **R-CONFIG：用例并发上限由用户配置。** 提供明确的 `maxParallelCases` 配置和本次执行覆盖入口，允许用户设置任意可准确表示的正整数；不把此前合成验证的 2 路限制变成产品固定上限。设置 1 表示用户选择串行。默认值及配置优先级由设计说明。
- **R-CAPACITY：区分配置、宿主能力和实际执行。** 记录用户设置值、宿主已知可用额度、实际并发及不能达到设置值的原因；不能把较低实际并发静默改报成用户配置值。宿主不支持并发时，应明确标注需求未满足，不能仅靠配置字段宣称并发能力已实现。
- **R-PRESERVE：重构不弱化目标与数据保护。** 保留必要业务语义、AI 自主判断、每例结论和失败历史；保护原有 Space、用户级已安装 Skill、本地修复与历史运行资产。类型检查不能替代运行时校验或业务验证。
- **R-DELIVERY：安装包交付可执行产物。** 开发阶段使用 TS；安装包提供编译后的 Node.js 程序与所需资源，不要求最终用户安装 TS 编译器。构建完整性、离线报告及版本一致性须纳入验收。

本轮交付为需求更新与包含语言重构的设计审核稿。语言迁移方向已获批准，具体实现按方案审核后的范围推进；本轮不实施功能、不操作真实业务、不修改用户级已安装 Skill、不推送、不创建 Tag 或 Release。
