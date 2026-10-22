# 后续版本需求记录

本文件记录尚未实现的需求和调研状态。下列 v0.1.4 项目不属于 v0.1.3 本地证据/结果工具箱范围，未实现、未集成、未实机验证。此记录不含用户截图、实际页面内容或业务数据。

## v0.1.4：并行用例执行与 Ego Space 绑定（已完成初步源码调研；设计未验证）

### 已确认用户需求

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
