# 验证记录与覆盖边界

## v0.1.3-dev 当前检查

2026-10-22，Linux / Node v24.19.0：`npm test` 为 56/56 通过（44 项辅助工具测试、12 项发布检查器测试），零失败、零跳过。`npm run check:public` 通过并输出 64 项当前 allowlist 文件清单。本文件只记录本分支实际检查结果，不代表 Ego 或业务产品实测。

`npm test` 执行完整 Node.js 套件，覆盖 schemaVersion 3 用例、启动与冻结、证据复制和留存文件 hash、capturedAt / collectedAt 区分、路径与符号链接、危险 ID、文件覆盖、单 writer 锁、revision 冲突、幂等与 key 顺序、响应丢失后的原回执、final/attempt 历史、clarification veto、当前状态进度、HTML / Markdown 转义、安全图片内嵌、冻结前提/必经路径/顺序展示、每次尝试剩余问题、证据来源与 SHA-256 元数据、图片解码错误提示、not_run 与是否尝试的区分、close/sync 错误回滚和被替换文件保护、坏 hash 与悬空引用阻断报告、活动格式不预览、CLI 入口和发布检查器。HTML 源码检查离线策略、无外链、安全静态数据绑定，并用最小 DOM shim 验证筛选、灯箱按钮、cancel 关闭事件和图片错误处理；cancel 事件是受控模拟，不是真实键盘或浏览器视觉验收。

再次尝试以 Chromium headless 打开独立临时目录中的合成报告并生成屏幕截图，使用独立 profile/cache、`--no-sandbox`、禁用后台网络及 20 秒 timeout；浏览器进程仍未正常结束（timeout exit 124），没有生成可检查截图。因此桌面/手机视口视觉验收和真实浏览器交互验收均为 **NOT RUN**。Node 回归和最小 DOM shim 不能替代 UI 验收；浏览器启动阻塞未绕过。

`npm run check:public` 检查当前分支 allowlist 内的文件清单、扩展名、文本、相对链接、常见 credential 模式、禁止的私有产物目录与符号链接。成功时输出当前发布文件清单。该检查为启发式，不检查 Git 历史、远端附件、图片内容或语义上的敏感信息。

Windows 本地可用 PowerShell 在 `$env:TEMP` 下生成一个独立合成 Run，核对 CLI 命令和离线报告复制。此步骤不访问 Ego 或业务站点，也不覆盖已存在的目录：

```powershell
$ReviewRoot = Join-Path $env:TEMP ('ego-lite-synthetic-' + [guid]::NewGuid().ToString('N'))
$Project = Join-Path $ReviewRoot 'project'
$Run = Join-Path $ReviewRoot 'run'
New-Item -ItemType Directory -Path $ReviewRoot | Out-Null
node .\scripts\ego.mjs init --project-dir $Project
$Cases = Join-Path $Project 'cases.example.json'
node .\scripts\ego.mjs validate-cases --cases $Cases
node .\scripts\ego.mjs start --project-dir $Project --cases $Cases --output-dir $Run
node .\scripts\ego.mjs check --run-dir $Run
node .\scripts\ego.mjs report --run-dir $Run
$Copy = Join-Path $ReviewRoot 'report-copy.html'
Copy-Item (Join-Path $Run 'report.html') $Copy
Invoke-Item $Copy
```

这验证的是本机合成文件与浏览器打开能力；需继续检查页面展示、图片解码、筛选、放大和 Escape 关闭等交互。报告输出禁止覆盖，重复试验应使用新 GUID 目录；验收完成并留存必要结果后，再由操作者清理该临时目录。

JSON 格式独立复核包含 8 份 JSON Schema Draft 2020-12 自身检查、相对 `$ref` 解析，以及 4 个合成用例/请求示例验证。当前案例、证据请求、结果请求示例统一使用 schemaVersion 3。

## Windows 与外部系统

代码只使用 Node.js 内置模块与平台路径接口，不依赖 shell 命令或第三方运行包。2026-10-22 已在 Windows 对提交 `8af375474352442428190af21a0318fdadf9f3ce` 执行合成验证：`npm test` 52 PASS、0 FAIL、4 SKIP（合成符号链接创建权限不足）；`npm run check:public` 的 64 个文件通过。独立临时目录中完成用例校验、Run 创建、两份合成 PNG 登记、历史尝试/状态记录、完整性检查和 HTML 报告生成。此结果不覆盖跳过的符号链接场景，也不代表所有 Windows 文件系统、锁和权限组合均已验证。

本地浏览器工具拒绝打开 `file://` 报告，未通过本地服务器或其他浏览器通道绕过。因此真实浏览器的搜索、状态筛选、图片放大、解码错误提示仍为 **NOT RUN**，须由用户本地验收。合成报告中的状态只是 UI 测试夹具，不是真实业务结论。

本次未执行 Ego、真实应用、账号、yiliai 数据或业务写入。没有测 AI 缺陷发现准确率、误报率或模型升级效果。测试结果只能支持本地结构化记录与文件行为的有限结论。v0.1.3 Release 必须等待用户本地能力验收通过；本次仅更新开发分支，不创建 tag 或 release。

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
