# 固定要求，开放方法

本项目由 AI 主导测试规划、执行、页面探索、路径选择和业务判断。AI 可以根据观察调整方法，但必须遵守以下固定要求。

## 项目导航

本节帮助定位源码，不是固定开发步骤；先明确修改目标，再按需读取模块和测试。整体职责与数据流见[架构说明](docs/architecture.md)，数据格式见[契约说明](docs/asset-formats.md)。

```text
skills/ai-autonomous-testing-ego-lite/  Skill 入口和 AI 使用指南
src/scripts/       CLI 参数、命令分发和工具身份
src/core/          用例/目标、冻结基线、结果与证据记录
src/execution/     名额、任务分配、Space 关联、工作包复核导入
src/observation/   授权范围内接口采集、查询与证据导出
src/regression/    项目回归资料、范围选择、运行绑定与比较
src/report/        报告投影、布局、主题、证据和文件交付
src/report-ui/     HTML 报告的浏览器交互
src/contracts/     版本/分发清单、类型、标识及引用规则
schemas/           外部 JSON 契约源文件
examples/          合成用例和请求示例，不是真实业务证据
tests/             工程回归及合成夹具
tools/             构建、生成、检查和验证辅助，不是第二套业务入口
docs/              当前说明、历史验证及图片生成源
```

### 改什么 → 从哪里看 → 对应检查

| 修改目标 | 首看入口 | 相关测试 |
| --- | --- | --- |
| CLI 命令与参数 | [ego.mts](src/scripts/ego.mts)、[toolchain.mts](src/scripts/toolchain.mts) | [CLI 入口](tests/cli-entrypoint.test.mts)、[基础命令](tests/ego.test.mts) |
| 用例、业务目标与冻结 | [cases.mts](src/core/cases.mts)、[baseline.mts](src/core/baseline.mts)、[schemas](schemas/) | [目标评估](tests/goals.test.mts) |
| 结果、证据与动作事实 | [records.mts](src/core/records.mts)、[action-events.mts](src/core/action-events.mts)、[file-integrity.mts](src/core/file-integrity.mts) | [动作事件](tests/action-events.test.mts)、[事实记录](tests/facts-v6.test.mts) |
| 并发与任务分配、工作包 | [commands.mts](src/execution/commands.mts)、[ledger.mts](src/execution/ledger.mts)、[packets.mts](src/execution/packets.mts)、[commit.mts](src/execution/commit.mts) | [执行协调](tests/execution.test.mts) |
| 接口观测与导出 | [commands.mts](src/observation/commands.mts)、[collector.mts](src/observation/collector.mts)、[evidence-export.mts](src/observation/evidence-export.mts) | [接口观测](tests/network.test.mts) |
| 回归资料、范围与比较 | [store.mts](src/regression/store.mts)、[selection.mts](src/regression/selection.mts)、[run-binding.mts](src/regression/run-binding.mts)、[compare.mts](src/regression/compare.mts) | [范围选择](tests/regression-selection.test.mts)、[跨轮比较](tests/regression-compare.test.mts)、[CLI/报告](tests/regression-cli-report.test.mts) |
| 报告生成、布局与交互 | [delivery.mts](src/report/delivery.mts)、[render.mts](src/report/render.mts)、[reader-layout.mts](src/report/reader-layout.mts)、[main.ts](src/report-ui/main.ts)、[themes.mts](src/report/themes.mts) | [交付](tests/report-delivery.test.mts)、[阅读器](tests/report-reader-model.test.mts)、[组合回归](tests/combined-report-regression.test.mts) |
| Skill、文档与图示 | [SKILL.md](skills/ai-autonomous-testing-ego-lite/SKILL.md)、[references](skills/ai-autonomous-testing-ego-lite/references/)、[render.mts](docs/images/render.mts) | [经验](tests/experience.test.mts)、[文档契约](tests/current-document-contracts.test.mts)、[图文](tests/readme-visuals.test.mts) |

### 源文件、生成产物与验证

- `schemas/*.schema.json` 是契约源文件；`src/contracts/generated/*.d.mts` 由 [generate-contracts.mts](tools/generate-contracts.mts) 生成，不直接编辑。改契约后运行 `npm run contracts:write`，再核对生成差异与运行时语义校验。
- `.build/node/`、`.build/browser/`、`.build/bootstrap/`、`.build/runtime/` 是构建/暂存产物，不在其中修补功能。源码维护 `.mts/.ts`，运行时使用编译后的 `.mjs/.js`。
- 版本和运行分发清单看 [layout.mts](src/contracts/layout.mts)；暂存与打包分别看 [stage-runtime.mts](tools/stage-runtime.mts)、[build-skill.mts](tools/build-skill.mts)。导航不授予生成或交付安装包的权限，仍遵守下方发布要求。
- 文档示意图优先修改 `docs/images/render.mts` 后同步 SVG/PNG；真实运行、截图、证据不是源码，不因重构覆盖或删除。
- 按修改范围先跑相关测试；提交前核对 `npm run typecheck`、`npm test`、`npm run check:public` 和 `git diff --check`。`npm test` 会先构建再测试实际 JS；工程通过不代表真实业务验收。
- 目录或职责变化时同步更新本导航。只列稳定入口，不维护易失效的行号、全函数清单或固定测试数量；读取当前实现后再决定修改范围。

## 固定要求

- 用户指定的业务目标、验收要求、事实依据和授权边界保持不变。不能为了得到通过结论而改写目标、降低预期或扩大授权。
- 需求要求的关键依赖、业务步骤和操作语义不能以“自主探索”为由跳过。具体操作方法可以替换，目标和必要语义不能省略。
- 每个目标都要分别说明为**已验证、发现违反、无法判断、未测试**之一，并给出相应事实依据。没有测试的目标不能报通过。
- 操作成功不等于验证成功。点击、提交、命令返回成功都只是观察；还要核对业务结果是否符合要求。
- 新发现的问题与原用例结论分开记录。不能用额外探索掩盖未测试项，也不能通过弱化原预期让失败变成通过。
- 不因模型升级就假定测试效果必然改善；效果要由实际验证结果支持。
- 必要时可以改进不合理的数据格式，不必为旧格式增加复杂兼容层；格式变化本身不代表获准删除用户数据或历史记录。
- 本项目当前处于持续优化阶段。进行设计优化、开发或代码/数据结构变更时，优先依据当前目标选择最优设计；默认无需为历史数据或旧格式保留兜底读取、兼容分支或迁就性设计，除非当前任务明确提出兼容要求。此原则不授权删除或覆盖用户数据及历史记录；涉及格式或结构变化时，仍应说明对现有数据的影响。

## 方法保持开放

- Skill 提供能力工具箱和整体流程提示；流程指南是可迭代建议，不是固定决策树或强制阶段节点。关键阶段的抉择由 AI 结合目标、事实和授权自主进行。
- 工具内部可以用固定事务步骤保证数据处理准确。AI 自主决定何时调用工具、传入什么参数、如何组合能力，以及是否补测或重试、调整路径、暂停澄清、继续其他用例、结束测试和如何判断结果。
- 结构、完整性和授权安全校验可以拒绝非法调用并说明原因；拒绝只说明该调用未执行，不替 AI 决定下一业务动作。证据不足时，AI 可选择补充取证、继续其他用例或记录无法判断。
- 本地工具不替代 AI 作业务判断，不自动选择业务执行路径或重试业务操作。任何自主选择仍须满足原目标、依赖关系、必要业务语义和授权边界。

## 开发自检

- 是否遗漏或改写了任何目标、必要语义、预期或授权边界？
- 每个目标的状态是否都有足够事实依据？是否把操作成功误当成验证成功？
- 是否把未测试、无法判断或额外发现错误地并入原用例的通过/失败结论？
- 新工具是否只处理确定性数据事务，没有固化业务判断或执行路线？
- 格式变更是否影响既有数据？是否把格式调整误当成删除数据或历史记录的授权？

## 正式版本发布

- 未经用户明确要求，不得自主生成或交付候选安装包（包括 ZIP 和用于分发的独立安装目录），也不得将打包作为每次开发、修复或自测完成后的默认步骤。常规构建与测试所必需的临时打包验证可以按需执行，但不因此额外生成或交付候选安装包。正式发布时的完整安装包要求，不构成日常开发自动打包的授权。
- 正式版本须由不可移动的版本 Tag 指向精确提交，并对应 GitHub Release；发布说明以中文为主，写明新增/修复、格式变化及升级影响、验证范围和已知限制。
- 发布或重写文档时，对照上一正式版检查正文、导航和图片引用；README 的版本演变图只展示最新版本与前三个历史版本，完整历史不删。中英文同步核对图片内的版本、发布状态和契约术语；仍适用的流程、架构、并发和报告示意不得无说明丢失。
- 同步核对版本号、CHANGELOG、README 和实际产物。提供包含所需 Skill、脚本、模板与说明的可用安装包及校验值；源码 ZIP 不等同于已配置好的安装包。发布包交付前检查不含 token、key 或真实项目资产。
- v0.1.3 只有在用户本地能力验收通过后才可创建 Release；云端分支验证不替代本地验收。
- 开发版不能冒充正式版；必要时使用 rc 预发布标识。不得移动既有版本 Tag 来替换其内容。
- 发布规范不构成合并 main、公开仓库或创建 Tag/Release 的授权；正式发布前遵从用户当次审核与授权。

## 分支命名与本地工作目录

- 从 v0.1.4 起，新建工作分支统一使用 `类型/v目标版本-简短英文主题`，例如 `feat/v0.1.4-parallel-testing`、`fix/v0.1.4-report-filter`、`docs/v0.1.4-usage-guide`。
- 类型按实际用途选择 `feat`、`fix`、`docs`、`chore` 等；版本号是目标软件版本，主题使用小写英文和连字符，说明该分支的具体范围。不要只写版本号或含义不明的名称。
- `main` 保持主分支名称不变。分支表示开发工作，不表示版本已发布；正式版本由精确提交对应的 Tag 与 GitHub Release 标识。
- 新版本工作从确认的主分支基线开始。已有分支不为统一命名而自动改名，尤其不改变他人正在使用的远端关联。
- 本项目默认在同一源码工作目录中更新代码或切换分支，不为每个版本另建 preview、backup 或 legacy 源码目录。切换前核对未提交、未推送与未跟踪内容，不覆盖用户修改或运行证据。
