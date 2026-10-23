# 验证记录与覆盖边界

## 定版检查（2026-10-22，云端）

版本号、Skill 元数据与工具版本校验已统一为 0.1.3。Linux / Node v24.19.0 最终完整回归 64/64 PASS、0 FAIL、0 SKIP。Windows 的 4 项符号链接权限跳过仍保留在下方原环境记录，Linux 通过不代替 Windows 验证。用户已反馈本地试用未发现重大问题并授权定版、合并与发布，不据此扩大专项验收范围。

## 本次报告交付修复验证（2026-10-22，Windows）

- Windows / Node v24.19.0，完整 `npm test`：64 项，60 PASS、0 FAIL、4 SKIP；4 项均因当前 Windows 无合成符号链接创建权限。新增 8 项交付回归全部通过，涵盖独立安装、旧/混用 revision 拒绝、安装文件缺失/改动拒绝、三文件读回、原始文件保留、事后复核与补充分区、来源 hash/覆盖/后续变更拒绝，以及重复摘要不当作独立证据。
- 首轮完整回归曾因 schema 文件清单未纳入 report-context 而 1 FAIL，更新契约检查后完整复验为上述结果。Skill quick_validate 首次因默认 GBK 解码失败，改以 `python -X utf8` 复验通过；没有因此改写中文为乱码。
- `check:public` 通过当前 68 个分发文件的 allowlist、相对链接、文本和启发式 credential 检查；`git diff --check` 通过。检查不认证图片内容、历史提交或全部敏感语义。真实会话、报告和截图都在仓库外。
- 独立 Draft 2020-12 校验：9 份 schema 自身、16 份合成示例/生成资产/既有 v3 资产全部通过；未知 capturedAt 上下文字段反例被拒绝。校验器只安装在仓库外本次验证目录，不增加 Skill 的运行依赖。
- 合成 HTML 在 Ego Lite 通过 file:// 实际打开，已验证搜索、状态筛选、历史展开、真实 PNG 解码、图片放大、Escape 和关闭按钮、首次失败保留，并保存合成报告 QA 截图。本次没有发生 file:// 访问限制，也没有用服务器或其他浏览器通道绕过。首次点击超时及截图失败保留；确认窗口最小化并通过同一 Ego TaskSpace 恢复窗口后复验通过。
- 事后报告也实际打开，核对原范围 26、补充发现 1、原记录状态、24 项当前无法判断/3 项未测试及零截图提示。此后为概览加“原记录”前缀并用生成 HTML 的 DOM 回归核对。最终安装工具生成的副本也已在 Ego 实际打开，URL、27 条记录、原记录标签、复核分区和搜索核对通过；最终截图再次因窗口最小化失败，恢复请求读回仍为 minimized，故最终完整视觉验收保持未验证，不以 DOM 成功冒充视觉通过。
- 原报告与源 run 共 37 个文件完成前后 SHA-256 核对，未覆盖、删除或补造原始截图/时间；没有重跑真实业务。原业务结论保留为历史声明，本次证据充分性复核另外记录，不把缺图自动判成产品失败。

仍未执行：4 项符号链接场景、移动视口完整视觉验收、新会话中真实业务关键截图采集及默认交付的能力验收。源码/合成回归不能替代实际业务验收。用户于 2026-10-22 反馈本地试用未发现重大问题并决定定版，随后授权合并和发布；该反馈不是上述未执行专项的通过证明。

## 修复前历史检查（不代表本次结果）


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

本次未执行 Ego、真实应用、账号、真实业务数据或业务写入。没有测 AI 缺陷发现准确率、误报率或模型升级效果。测试结果只能支持本地结构化记录与文件行为的有限结论。该历史检查不代表后续用户本地试用或最终发布验证，后续结果见本文顶部。

## 运行与记录限制

- `pass` / `fail` 是经授权的调用者提供的结果；工具检查字段、证据关联与文件 hash，不独立确认事实。
- SHA-256 匹配不是来源真实性或证据完整性的证明，也不会检测敏感信息。
- 单文件 rename 不等于 catalog + evidence 的一般多文件事务，也不承诺断电持久性。异常锁和不可识别的恢复 marker 可能需要人工检查。
- `check:public` 和其他模式扫描不能代替人工隐私复核，也不会检查历史提交。
- v0.1.2 schemaVersion 2 不被 v3 接受；没有迁移层。按原始来源重新整理后新建 run。

## 历史验证记录

以下为过往版本的验证摘要，不应误读为 v0.1.3 结果：

- **v0.1.2：** 2026-10-21，Linux / Node v24.19.0，137/137 合成测试通过，旧协议为 schemaVersion 2。
- **v0.1.1：** Linux / Node v24.19.0，90 项合成测试通过，资产格式升级至 schemaVersion 2。
- **v0.1.0：** 2026-10-21，Linux / Node v24.19.0，67/67 合成测试通过。

这些历史版本均未声称完成 Windows + Ego + 真实应用端到端测试。更多当前实现细节见[资产格式](asset-formats.md)和[更新记录](../CHANGELOG.md)。
