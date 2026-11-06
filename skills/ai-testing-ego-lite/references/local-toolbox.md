# 本地确定性工具箱（0.2.1-rc.1）

ToolRoot 为实际加载的 Skill 根目录；源码先构建，再使用 .build/runtime。tool-info 核对 0.2.1-rc.1 / execution-efficiency-1、主契约 v9、regressionVersion 2、networkVersion 1 和 installationIntegrity。本地工具不调用模型，不选择业务路线或自动重试。

## 用例与范围

```powershell
node <ToolRoot>/scripts/ego.mjs init --project-dir <WORK>
node <ToolRoot>/scripts/ego.mjs cases save --work-dir <WORK> --request <SAVE_REQUEST>
node <ToolRoot>/scripts/ego.mjs validate-cases --cases <WORK>/cases/v001.json
node <ToolRoot>/scripts/ego.mjs cases render --cases <WORK>/cases/v001.json --output-dir <DOCS>
node <ToolRoot>/scripts/ego.mjs cases verify --cases <WORK>/cases/v001.json --output-dir <DOCS>
node <ToolRoot>/scripts/ego.mjs cases export-review --cases <WORK>/cases/v001.json --request <FEEDBACK_JSON_OR_HTML> --output-dir <REVIEW_FILES>
node <ToolRoot>/scripts/ego.mjs cases review --cases <WORK>/cases/v001.json --request <ACTUAL_REVIEW_REQUEST>
node <ToolRoot>/scripts/ego.mjs regression select --request <SELECTION_REQUEST> --output-file <SELECTION_JSON>
node <ToolRoot>/scripts/ego.mjs start --project-dir <WORK> --cases <WORK>/cases/v001.json --binding <BINDING_REQUEST> --output-dir <NEW_RUN>
node <ToolRoot>/scripts/ego.mjs regression context --run-dir <SOURCE_RUN> --results-revision 1 --output-file <CONTEXT_JSON>
node <ToolRoot>/scripts/ego.mjs regression compare --request <COMPARISON_REQUEST> --output-dir <NEW_COMPARISON_DIR>
```

尖括号替换为实际绝对路径。init 创建合成请求与空 cases/runs 目录，不创建执行结果。保存请求见 examples/cases-save-request.example.json；用 select 的真实输出填写 binding.selection。实际审阅、当前条件、参数、暂缓点及历史引用由 AI 按真实来源填写，不能把合成请求当授权。文档与离线反馈不执行测试或认证人类身份。

cases render可带 --feedback <ABS_JSON_OR_HTML> 载入同版本意见。直接打开生成的本地HTML，核对范围后导出评审HTML，可选JSON或复制完整数据；不启动审阅服务器。支持时用文件选择器保存并读回，否则显式下载，下载提示不证明Windows可打开。浏览器草稿仅属于当前入口和浏览器，切换前保管导出文件。cases export-review只是可选的独立CLI转存；输入视为数据读取，不修改原文件或Windows标记。它与网页导出均不登记正式确认，不启动业务。

## 事实与协调

evidence-add 保管真实普通文件；record 的 observations、contexts、actionEvents、assessments、findings 分别保存事实与 AI 判断。operationId 用于幂等文件提交，不授予业务重试。worker 只写自己的目录，协调者复核 packet 后写公共账本。

```json
{"schemaVersion":9,"operationId":"synthetic-not-tested","expectedRevision":0,"caseId":"export","mode":"final","record":{"observations":[],"assessments":[{"goalId":"content","status":"not_tested","rationale":"Synthetic deferred example; replace with actual facts.","observationIds":[],"gaps":["Synthetic current data is unavailable."]}]}}
```

execution read viewVersion 9 默认 metadata，明确未检查 results 和物理证据；full 才完整读取。下载前用既有 execution note 的 category=download 记录 captureId、caseId、pointIds、actionId、state=active。同轮已有 active/unknown 拒绝第二次观察；超时记 unknown，显式对账并提供留存事实后记 resolved，不按时间清除。

## 按目标读取与执行组合

```text
node <ToolRoot>/scripts/ego.mjs progress --run-dir <RUN> --view goals --limit 20
node <ToolRoot>/scripts/ego.mjs progress --run-dir <RUN> --view point --point-id <POINT> --output-file <NEW_JSON>
node <ToolRoot>/scripts/ego.mjs regression context --run-dir <RUN> --results-revision <N> --view full --output-file <NEW_JSON>
node <ToolRoot>/scripts/ego.mjs usage summarize --request <USAGE_REQUEST> --output-file <NEW_JSON>
```

record的CLI回执为`{recordResponseVersion:1,committed:true,receipt,feedback}`；内部提交收据不变。feedback仅提示提交时点的缺项，重放绑定原revision，失败标unavailable，不把成功入账伪装失败。`--feedback none`关闭提示但保留同一封装。

progress/context默认summary；goals只列索引，未入账状态为null；pointId精确定位，保留预期和必要依赖。大目标导出，不静默截断语义。`--case-id`只用于goals，`--expected-results-revision`核对读前条件；分页/`--max-bytes`明示省略，未决动作单独分页。输出新文件须在原run外；历史full须导出。当前progress沿用严格检查及本地证据事务恢复，历史读取不修复原run。

当前事实足够时，可在同一次宿主工具编排中顺序完成“保存新脚本→检查保存成功→运行→最终快照”。宿主用异常报告保存失败时，可在一个工具调用中await保存，再await运行；失败立即返回事实。中间结果决定下一动作、身份或授权时，先返回观察供AI判断。不要将此例变成所有业务操作强制批量。

长DOM/完整回复用captureDomText保存原件和小回执，再精确补读必要正文，避免反复打印整个聊天。保留关键截图与必要语义。usage request为`{"inputFile":"C:/example/usage-export.json","groupLimit":20}`；规范见schemas/usage-input.schema.json。由AI/宿主准备非秘密导出，不要求用户手写JSON，不扫描配置/会话目录。sourceId+responseId去重，input包含cached、output包含reasoning，不重复相加；缺失不写0，工具事件数不当模型请求数，重叠分组不求和，无账单来源不报金额。

## 下载与文件工具

ego-helpers/download.mjs 由 AI 的同轮 Ego 脚本导入，await armNativeDownload 后再点击，collect 在同轮 saveAs。工具不创建 Space 或选择按钮。临时页漏收时显式调用 listDownloadCandidates/retainDownloadCandidate，按动作前后新 ID 和精确授权 URL 关联，不选最新同名文件，不自动 fetch。能力与限制详见[下载与只读文件检查](download-files.md)。

```json
{"schemaVersion":9,"file":"C:/example/testing/runs/run-001/captures/export/original.bin","format":"csv","maxBytes":33554432,"maxOutputBytes":4194304,"maxCells":100000,"timeoutMs":60000}
```

files inspect 从独立 Node CLI 调用；Ego 脚本的 process.execPath 是 ego.exe，不能当成解析器 Node 子进程。files inspect --request <FILE_REQUEST> --output-file <NEW_JSON> 输出读取范围、类型、大小/指纹、局限或失败，不输出业务通过。CSV 保留前导零和重复表头；XLSX 仅值与缓存，不重算公式；JSON 数值使用原文，不支持时明确精度局限。停止解析不取消浏览器下载。

## 交付

report --run-dir <RUN> --output-dir <EXISTING_EMPTY_REPORT_DIR> --delivery auto 输出 HTML/Markdown/JSON 与清单。先显式创建新的空输出目录；report要求目录已存在，且拒绝覆盖已有目标文件。auto 需要下载原件、对话原件或历史附件时使用 bundle，移动时保留 attachments。显式 inline 未携带必需原件时交付不完整。

verify-report --run-dir <RUN> --report-dir <REPORT_DIR> 校验三格式和附件；不是浏览器打开证明。实际打开检查正文、原图、筛选、阅读位置及历史来源。当前证据严格校验，历史缺失明确标示，不补造现场。

目录移动时可显式传 report --history-locations <ABS_MAP_JSON>；格式见 schemas/history-locations.schema.json，按 runId 指定绝对目录并核对原版本/指纹。原引用保留，不自动扫描。下载 captureRoot 使用本轮 run/captures 或 note 所属 workers/<assignment>/captures，不换目录重启未知监听。
