<p align="center"><img src="docs/images/hero.zh-CN.png" alt="基于 Ego Lite 的 AI 自主测试 Skill：面向新项目上线前和新功能首次交付的 Web 测试。由 AI 自主规划，按业务规则验证。" width="100%"></p>

# 基于 Ego Lite 的 AI 自主测试 Skill

<p align="center"><a href="README.en.md">English</a> · <strong>简体中文</strong><br><a href="#windows-快速开始">快速开始</a> · <a href="docs/architecture.md">架构</a> · <a href="docs/asset-formats.md">格式与命令</a> · <a href="docs/privacy.md">隐私保护</a> · <a href="docs/testing.md">验证状态</a></p>

**面向新项目首次上线前、新功能首次交付时的 Web 自动化测试 Skill。** 由当前 AI 会话自主分析需求、规划测试，并通过 Ego Lite 浏览器探索页面、执行用例，对照业务规则和预期结果完成验证。保留实际观察与证据，让测试结论可以复核，而不只是给出“成功 / 失败”。

不要求项目已经积累自动化测试脚本。你可以提供现成用例，也可以提供需求、业务规则和验收预期，由 AI 按本 Skill 的格式整理用例。AI 可以灵活选择操作方法、补充验证和调整执行顺序，但不能改写测试目标、降低预期或越过授权边界。

这里的“首次上线”是重点使用场景，不代表可以从空白信息推断全部业务规则，也不承诺测试通过就能安全上线；缺失的要求需要澄清，证据不足的结论必须保留不确定性。它也可用于已有功能的回归验证。

**版本 0.1.3。** 本项目独立开发，非 Ego 官方项目，未获 Ego 背书。v0.1.3 使用 schemaVersion 3，替代 v0.1.2 的 schemaVersion 2；这是有意的格式变更，不提供迁移命令。历史合成验证与本次修复验证分开记录；工具文件校验不代表真实业务能力验收。详见[验证记录](docs/testing.md)。


## 0.1.3 报告交付修复

执行测试后的默认交付包含独立离线 HTML、JSON 和 Markdown，除非用户明确要求其他格式；聊天摘要不能替代文件。关键 UI 结果及缺陷须留存真实截图，DOM / 日志 / 摘要作补充；不要求每次点击截图。缺图必须展示并由 AI 复核结论，不能自动当产品失败，也不能继续宣称证据完整。

独立安装须使用完整目录包，不能只复制 `skills/ego-lite-test` 的说明文件。以下命令从源码仓库构建**新的、仓库外**安装目录，携带 Skill、指南、脚本、schema、示例和文件校验清单，不创建 Tag 或 Release：

```powershell
$InstallPackage = Join-Path $env:TEMP ('ego-lite-test-' + [guid]::NewGuid().ToString('N'))
npm run build:skill -- --output-dir $InstallPackage
node (Join-Path $InstallPackage 'scripts/ego.mjs') tool-info --expect-version 0.1.3 --expect-revision html-report-delivery-1
```

将完整目录内容安装到现有 Skill 根目录。更新前核对旧文件是否来自已知版本，出现不明修改先报告，不能覆盖用户文件、创建同名重复安装或自动增加旧版备份。运行时以**实际加载的 SKILL.md 所在目录**为工具根；源码模式只用已确认的源码绝对根。`tool-info` 输出版本、revision、schemaVersion、实际路径和指纹；安装清单缺失、文件修改或版本混用会拒绝执行。指纹不认证发布者，构建清单只包含指定分发资源，不打包真实运行目录。

`report` 生成后会读回三种文件，`verify-report --run-dir ABS_RUN --report-dir ABS_REPORT_DIR` 可再次核对内容与当前运行、证据及整理来源的一致性。回执给出路径、大小和 SHA-256，`browserOpen: not_checked` 表示浏览器尚未检查；文件校验不能冒充实际打开。访问受限时记录具体阻塞，不换通道绕过。

已有报告不得覆盖。准备一个新的仓库外目录，使用 `report --run-dir ABS_RUN --output-dir ABS_EXISTING_NEW_DIR` 另存；事后补报告再传 `--context ABS_CONTEXT_JSON`，格式见 [报告整理上下文](schemas/report-context.schema.json)。它明确整理性质、限制、现有来源与 hash、补充用例及 AI 逐目标复核，原记录结论保留单独展示，不冒充执行前冻结。工具不补造截图、采集时间、步骤或业务结论，也不为了补报告重跑业务。

本版本为 `0.1.3`，工具 revision 为 `html-report-delivery-1`。输入用例和 run 仍为 schemaVersion 3；报告 JSON 增加截图覆盖与可选事后上下文，context 自身版本为 1。不迁移、不删除既有数据。验证范围和未执行项见[验证记录](docs/testing.md)。

## 用例与判断

![测试方式：接收或生成用例，由 AI 按业务目标自主执行，并如实说明所有测试结果。](docs/images/workflow.zh-CN.png)

外部用例和 AI 按 Skill 指南整理的用例均可用于新功能与回归。用例以业务意图和必要输入描述步骤；当前 AI 根据实际页面选择被授权的执行路径。`strict` 保留业务步骤顺序，`adaptive` 只允许在不改变意图、前提与覆盖时调整路径或顺序。

整体预期与需求依据必须保留。每步 `expected` 可省略；提供时必须有独立依据，省略不会被当作未执行或自动通过。验收存在未决问题时，在冻结基线中填写 `clarificationQuestions`；只要问题非空，该用例的最终结果和每条尝试都不得为 `pass` 或 `fail`。澄清后用修订用例重新开始，不改写旧基线。

状态区分 `pass`、`fail`、`inconclusive`、`blocked`、`not_run`。`not_run` 表示尚未记录最终结论，可能已有探索尝试；报告会单独区分从未尝试和尝试过但无最终结论。工具只校验本地数据结构、revision 和证据文件哈希，不自动诊断缺陷、选择路径、重试业务操作或判断证据是否支持结论。

## Windows 快速开始

### 准备运行环境

按 [Ego 官方 Windows 快速开始](https://lite.ego.app/document/en/docs/windows/quick-start)配置 Ego 与官方 `ego-browser` Skill。本仓库不安装 Ego，也不替代官方使用指南。本地报告工具使用 Node.js 22 或更新版本，不依赖第三方运行包。

### 将私有资源放在源码目录之外

在仓库根目录打开 PowerShell。以下目录应位于仓库之外；`init` 和 `start` 要求目标尚不存在，且不会覆盖已有目录。

```powershell
$Source = (Get-Location).Path
$LocalRoot = Join-Path $env:LOCALAPPDATA 'EgoLiteTest'
New-Item -ItemType Directory -Force -Path $LocalRoot | Out-Null
$Project = Join-Path $LocalRoot 'demo-project'
node .\scripts\ego.mjs init --project-dir $Project
```

将 `$Project\cases.example.json` 改成经来源核对的用例。准备后可先只校验，然后冻结新运行：

```powershell
$Cases = Join-Path $Project 'cases.example.json'
$Run = Join-Path $LocalRoot ('run-' + [guid]::NewGuid().ToString('N'))
node .\scripts\ego.mjs validate-cases --cases $Cases
node .\scripts\ego.mjs start --project-dir $Project --cases $Cases --output-dir $Run
```

`start` 只创建本地文件，不执行浏览器或业务操作。Skill 的工作流和边界见 [SKILL.md](skills/ego-lite-test/SKILL.md)；辅助工具调用步骤见[本地工具箱指南](skills/ego-lite-test/references/local-toolbox.md)。

### 登记证据与记录结果

将确需留存的本地文件作为证据来源，并编写 UTF-8 JSON 请求文件。请求需要唯一 `operationId` 和当前 `expectedRevision`；不要为未知来源时间填写 `capturedAt`。例如：

```json
{
  "schemaVersion": 3,
  "operationId": "evidence-first-observation",
  "expectedRevision": 0,
  "caseId": "CONFIG-01",
  "sourceFile": "C:\\Users\\example\\AppData\\Local\\EgoLiteTest\\capture.png",
  "kind": "screenshot",
  "source": "本次测试中保存的本地页面截图",
  "description": "合成环境中的设置页面观察"
}
```

运行 `evidence-add --run-dir $Run --request <绝对请求文件路径>`。工具会把普通本地文件复制到运行的 `evidence/`，从实际留存副本计算 SHA-256 和字节数，返回证据 ID 与 catalog revision。`collectedAt` 由工具登记；仅当来源明确提供采集时间时才填写 `capturedAt`。

将返回的证据 ID 放入 `record` 请求的 `evidenceIds`。`mode: "final"` 更新当前最终状态；`mode: "attempt"` 追加一条历史观察，不改变最终状态。结果请求示例：

```json
{
  "schemaVersion": 3,
  "operationId": "CONFIG-01-first-attempt",
  "expectedRevision": 0,
  "caseId": "CONFIG-01",
  "mode": "attempt",
  "record": {
    "status": "inconclusive",
    "observed": "合成观察：保存后的页面没有显示明确结果。",
    "rationale": "仅凭当前页面无法确认冻结的整体预期。",
    "remainingQuestions": ["是否要求刷新后持久化？"],
    "evidenceIds": ["替换为 evidence-add 返回的 ID"],
    "cause": "unknown"
  }
}
```

请求中的 `operationId` 是幂等操作标识：同一 ID 与相同内容重试会返回原回执，不会重复追加；同一 ID 改了内容会被拒绝。新请求若 `expectedRevision` 过期会冲突拒绝。并发写入采用运行目录独占锁，冲突直接拒绝，不自动重试。响应丢失后，可用完全相同的请求重试并读取原回执。

### 查询进度并生成报告

```powershell
node .\scripts\ego.mjs progress --run-dir $Run
node .\scripts\ego.mjs check --run-dir $Run
node .\scripts\ego.mjs report --run-dir $Run
Invoke-Item (Join-Path $Run 'report.html')
```

进度按冻结用例的**当前最终状态**统计；`blocked`、`inconclusive`、`not_run` 分开列出，pending clarification 单独列出。历史尝试不重复计入当前 pass/fail。`report` 会在 Run 目录写出 `report.json`、`report.md` 和可独立离线打开的 `report.html`；任一目标已存在都会拒绝覆盖。HTML 展示冻结目标、关键条件、必经路径、顺序策略、实际观察、判断理由、依据、未验证项、逐条尝试及其未决问题、证据来源和 SHA-256。经过 hash / 大小核验的 PNG、JPEG、WebP 截图内嵌显示；缺图、不支持格式或浏览器无法解码会明确提示，不生成替代图片。可把 `report.html` 单独复制给获准查看报告的人，不需要连同 Run 或联网打开。完整内容见[格式与运行约定](docs/asset-formats.md)。

报告会分开显示业务结论和文件完整性；SHA-256 匹配不证明截图真实或结果正确。HTML 生成前会完整校验 run 与所有登记证据；若校验失败，不写出任何报告。没有图片不会自动变成失败；业务覆盖、判断以及是否需要补证仍由 AI 根据授权与事实决定。点击成功或按钮变为 enabled 不足以证明提交成功，需观察实际后果和必要的持久化状态。

![报告内容示意：说明预期、实际观察、证据与未覆盖范围；不是实际测试报告截图。](docs/images/result-specimen.zh-CN.png)

## 责任与限制

![职责分工：当前 AI 会话负责理解与决策；Ego 执行授权浏览器读写；本地工具只管理记录。](docs/images/architecture.zh-CN.png)

| 部分 | 负责 | 不负责 |
| --- | --- | --- |
| 当前 AI 会话 | 理解目标、选择测试、操作授权的浏览器、审阅观察 | 臆造缺失需求或超出授权 |
| Ego 原生浏览器 | 页面读取与用户授权的浏览器操作 | 判断业务规则是否正确 |
| 本地工具箱 | 登记文件、验证记录、计算当前哈希、报告进度并展示离线证据报告 | 访问网络/模型/Ego、自动判 bug、重试业务动作 |

SHA-256 用于检测留存文件是否与 catalog 一致，不证明证据真实性、来源身份或业务结论。工具不是绕过直接文件修改或本地并发程序的安全隔离边界。单个 JSON 文件通过临时文件和 rename 更新；证据文件与 catalog 不是支持任意崩溃恢复的多文件事务，也不承诺断电持久性。遗留 `.run.lock` 会拒绝写入；确认无对应进程后才由操作者检查并处理。

证据登记不会自动脱敏。截图、日志、URL 与说明可能含个人或业务数据；保存前限制范围并人工检查。真实案例、站点、凭据和运行产物留在仓库外的私有目录。私有仓库、哈希、忽略规则与启发式扫描均不构成秘密保险箱。详见[隐私指南](docs/privacy.md)。

## 继续阅读

- [Skill 工作流](skills/ego-lite-test/SKILL.md) 与[本地工具箱调用指南](skills/ego-lite-test/references/local-toolbox.md)
- [架构](docs/architecture.md)、[schema v3 格式与命令](docs/asset-formats.md)
- [后续版本需求与调研记录](docs/requirements.md)：v0.1.4 并行用例/Space 绑定（未实现）
- [合成用例](examples/cases.example.json)、[合成证据请求](examples/evidence-request.example.json)、[合成结果请求](examples/record-request.example.json)
- [验证状态](docs/testing.md)、[隐私保护](docs/privacy.md)、[变更记录](CHANGELOG.md)

## 许可证

本仓库原创代码和文档按 [MIT License](LICENSE) 授权，版权声明为 2026 99Like-wjj。此许可不覆盖 Ego、Ego 官方浏览器或其他第三方软件；它们仍受各自许可和官方条款约束。本项目非 Ego 官方项目，未获其背书。仓库仍为私有开发仓库；许可证声明不会改变仓库可见性，也不代表已创建公开发布。
