# 验证记录与覆盖边界

## v0.1.3-dev 当前检查

2026-10-22，Linux / Node v24.19.0：`npm test` 为 55/55 通过（43 项辅助工具测试、12 项发布检查器测试），零失败、零跳过。`npm run check:public` 通过并输出当前 allowlist 发布文件清单。本文件只记录本分支实际检查结果，不代表 Ego 或业务产品实测。

`npm test` 执行完整 Node.js 套件，覆盖 schemaVersion 3 用例、启动与冻结、证据复制和留存文件 hash、capturedAt / collectedAt 区分、路径与符号链接、危险 ID、文件覆盖、单 writer 锁、revision 冲突、幂等与 key 顺序、响应丢失后的原回执、final/attempt 历史、clarification veto、当前状态进度、HTML / Markdown 转义、安全图片内嵌、坏 hash 与悬空引用阻断报告、活动格式不预览、CLI 入口和发布检查器。HTML 源码检查离线策略、无外链、安全静态数据绑定，并用最小 DOM shim 验证筛选与灯箱按钮事件；这不等同真实浏览器事件或视觉检查。

尝试以 Chromium headless 打开合成报告并生成屏幕截图。当前容器中 Chromium 无法初始化用户数据目录，替代启动尝试也因渲染进程/缓存环境限制超时；所以报告通过 Node 合成回归、最小 DOM shim 和源码/协议检查，但没有完成实际桌面、手机视口视觉检查，也未在真实浏览器验收 Escape 键关闭灯箱。

`npm run check:public` 检查当前分支 allowlist 内的文件清单、扩展名、文本、相对链接、常见 credential 模式、禁止的私有产物目录与符号链接。成功时输出当前发布文件清单。该检查为启发式，不检查 Git 历史、远端附件、图片内容或语义上的敏感信息。

JSON 格式独立复核包含 8 份 JSON Schema Draft 2020-12 自身检查、相对 `$ref` 解析，以及 4 个合成用例/请求示例验证。当前案例、证据请求、结果请求示例统一使用 schemaVersion 3。

## Windows 与外部系统

代码只使用 Node.js 内置模块与平台路径接口，不依赖 shell 命令或第三方运行包。Windows 兼容性目前是源码层检查：确认绝对路径、`path` API、Node 文件操作、PowerShell 调用示例与唯一文件名逻辑；**没有真实 Windows 执行实测**。Linux 的 Node 24 测试不能替代 Windows 上文件锁、rename、权限和文件系统行为验证。

本次未执行 Ego、浏览器、真实应用、账号、yiliai 数据或业务写入。没有测 AI 缺陷发现准确率、误报率或模型升级效果。测试结果只能支持本地结构化记录与文件行为的有限结论。

## 运行与记录限制

- `pass` / `fail` 是经授权的调用者提供的结果；工具检查字段、证据关联与文件 hash，不独立确认事实。
- SHA-256 匹配不是来源真实性或证据完整性的证明，也不会检测敏感信息。
- 单文件 rename 不等于 catalog + evidence 的一般多文件事务，也不承诺断电持久性。异常锁和不可识别的恢复 marker 可能需要人工检查。
- `check:public` 和其他模式扫描不能代替人工隐私复核，也不会检查历史提交。
- v0.1.2 schemaVersion 2 不被 v3 接受；没有迁移层。按原始来源重新整理后新建 run。

## 历史验证记录

以下为过往版本的验证摘要，不应误读为 v0.1.3-dev 结果：

- **v0.1.2：** 2026-10-21，Linux / Node v24.19.0，137/137 合成测试通过，旧协议为 schemaVersion 2。
- **v0.1.1：** Linux / Node v24.19.0，90 项合成测试通过，资产格式升级至 schemaVersion 2。
- **v0.1.0：** 2026-10-21，Linux / Node v24.19.0，67/67 合成测试通过。

这些历史版本均未声称完成 Windows + Ego + 真实应用端到端测试。更多当前实现细节见[资产格式](asset-formats.md)和[更新记录](../CHANGELOG.md)。
