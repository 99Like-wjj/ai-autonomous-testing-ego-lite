# 验证范围与限制

[README](../README.md) · [更新记录](../CHANGELOG.md)

## 当前版本：0.1.1

2026-10-21，本次本地自动检查结果：Node 测试共 90 项通过，0 失败、0 跳过（辅助工具 78 项，发布检查器 12 项）。环境为 Linux / Node v24.19.0，输入为合成数据。这是文件逻辑与发布检查器验证，不是 AI 缺陷发现能力基准。

`npm test` 覆盖输入规范化、v2 步骤契约、只读用例预检、基线完整性、结果与证据结构、输出路径、不覆盖行为及报告逻辑。`npm run check:public` 检查当前发布文件清单、常见秘密模式、禁止的私有产物路径、文本与相对链接；启发式检查不是安全保证。

本次最终交付的 schema、独立 Skill 链接、图解与发布扫描结果见[更新记录](../CHANGELOG.md)，不要将过去版本的检查记录误作当前验证。v2 是不兼容格式更新，不支持 v1 或自动迁移。

## 未验证的范围

- 没有用本次开发流程测试真实应用。
- 尚未完成 Windows + Codex + Ego 端到端实机运行。
- 没有测量或承诺缺陷发现准确率、误报率或模型升级收益。
- Linux 单测不认证 Windows 文件系统、PowerShell、Ego 连接或 Skill 发现。
- 格式合法、文件存在或报告生成不证明业务结果正确。
- 用例生成指南与合成示例不是已验证的模型效果，也不是能力验收数据集。

## 安全的首次试用

使用专用非生产环境与合成数据，按 Ego 官方说明安装并读取安装版本的官方 Skill。核验实际角色、环境、允许副作用与资源预算。

可选择外部用例或 Skill 从需求生成用例，两者都可用于新功能或回归。先检查每步动作/预期、顺序策略和来源，再校验、冻结、执行；也可以仅生成用例，此时无需浏览器，不报告执行结果。推断与明确要求分开；不能用生成报告直接代替人工复核发布条件。

提交结果未知时先只读核对实际状态，再决定能否重试。版本未部署或环境不可达应记录阻塞，不编造产品缺陷。真实用例、截图、日志和报告留在 Git 之外。

## English summary

Version 0.1.1 local Node tests on 2026-10-21: 90 passed, 0 failed, 0 skipped (78 helper and 12 publication-checker tests), Linux / Node v24.19.0, synthetic inputs only. These verify file logic, not AI testing effectiveness. See the changelog for final revision-specific schema, isolated Skill, artwork, and publication checks.

Both external and Skill-generated cases support features and regression, with the same v2 contract. Generation-only needs no browser and is not execution. v1 and automatic migration are unsupported. No Windows + Codex + Ego end-to-end run or real application test is claimed. No accuracy, false-positive rate, or model-upgrade improvement is measured. Use authorized non-production fixtures, preserve uncertainty and original attempts, inspect unknown write outcomes before retrying, and review evidence rather than treating a structurally valid report as a release gate.
