# 项目回归资料与运行绑定

当前为 0.1.7-rc.1 / report-step-evidence-1 开发候选；主契约 v8，回归契约 regressionVersion 1，接口观测仍为 networkVersion 1。尚未正式发布，构建不会更新用户安装。

本版按状态选择仍以整条场景为重跑单位，尚无稳定测试点编号或按编号单点回测入口。后续需求及其背景见 [v0.1.8 前瞻](v0.1.8-preview.md)，不将规划当作当前执行能力。

## 能力与边界

AI 在首次实际测试时及时记录上下文、动作、观察、评估和证据，并依据可信规则整理项目任务。工具没有模型调用、浏览器重放或业务决策引擎：它接收 AI 提交的事实/任务，校验引用、保存不可变版本，并按明确条件计算选择集。

任务定义、当前资源/授权、目标四态是不同维度。失败、未实现、部分完成、工具失败、结果未知和暂缓都可留存；规则与历史实际结果分源。项目资料放在源码仓库外，不回写通用经验。

用户可通过自然语言要求“按上次发现违反和无法判断的场景重跑”或“对这个测试集全量回归”。AI 明确基准与范围后准备资产，按授权执行。HTML 的筛选器仅浏览报告，不会执行测试。

## 数据位置与修订

| 内容 | 位置与版本语义 |
| --- | --- |
| 规则 | 项目目录的 regression/rules/<ruleId>/<revision>.json；保存可信原文位置、文件指纹、确认状态及修订理由 |
| 任务 | regression/tasks/<taskId>/<revision>.json；保存场景计划、目标规则引用、来源事实、适用条件、路径知识及缺口 |
| 本轮运行 | 独立 run，原 baseline/results/evidence/execution 体系继续使用 v8 |
| 运行绑定 | run 内 regression-binding.json；包含精确选择、任务/规则快照、本次条件、编入/暂缓映射及覆盖缺口，manifest 保存文件哈希 |
| 比较 | 独立新目录下 comparison.json、comparison.md、comparison.html；不改任何源运行 |

规则/任务的 expectedRevision 是对应规则或任务自身的当前修订；operationId 在项目资料库中唯一。数据相同的原操作可恢复已提交回执，改变内容必须使用新操作和新修订。新增版本填写 supersedes 精确引用；已存在文件不覆盖。

原子发布采用同一目录中的临时普通文件和硬链接，不支持时明确失败，不以覆盖旧文件作降级。检查只证明数据结构、来源引用和字节一致性，不认证原文权威、事实真实性或 AI 判断正确。历史 JSON 整体无法解析时不能读取其前缀，不猜测恢复。

## 命令入口

以下 ABS 值应由 AI 替换为已核实的绝对路径。请求 JSON 的结构见随工具提供的 schemas 与合成 examples；示例中的占位路径、零哈希和示例授权不可用于真实执行。

```text
node ABS_TOOL_ROOT/scripts/ego.mjs regression read --project-dir ABS_PROJECT
node ABS_TOOL_ROOT/scripts/ego.mjs regression read --project-dir ABS_PROJECT --kind task --artifact-id TASK_ID --revision N --sha256 CONTENT_HASH
node ABS_TOOL_ROOT/scripts/ego.mjs regression context --project-dir ABS_PROJECT --run-dir ABS_SOURCE_RUN --results-revision N --output-file ABS_NEW_CONTEXT_JSON
node ABS_TOOL_ROOT/scripts/ego.mjs regression validate --project-dir ABS_PROJECT --request ABS_COMMIT_REQUEST
node ABS_TOOL_ROOT/scripts/ego.mjs regression commit --project-dir ABS_PROJECT --request ABS_COMMIT_REQUEST
node ABS_TOOL_ROOT/scripts/ego.mjs regression select --project-dir ABS_PROJECT --request ABS_SELECTION_REQUEST --output-file ABS_NEW_SELECTION_JSON
node ABS_TOOL_ROOT/scripts/ego.mjs start --project-dir ABS_PROJECT --cases ABS_CASES --output-dir ABS_NEW_RUN --binding ABS_BINDING_REQUEST
node ABS_TOOL_ROOT/scripts/ego.mjs regression compare --request ABS_COMPARISON_REQUEST --output-dir ABS_NEW_COMPARISON_DIRECTORY
```

`read` 返回快照及其修订。`context` 将规范与实际事实分栏，保留全部来源目标、未整理映射和来源可用性；返回的 checked 仅表示结构/引用检查范围，不是业务通过。指定 resultsRevision 时只核验该结果前缀实际涉及的证据，不把后续动作处置混入历史；后续无关证据损坏不改变前缀结果，整体 JSON 损坏则明确报错。

`validate` 接受与 commit 相同请求，只读检查结构、修订和来源，既不创建资料库修订，也不返回“可以执行业务”。`commit` 不生成内容，保存当前 AI 已整理的规则或任务。来源原件失效不删除旧资产；新引用校验失败时说明具体缺口，由 AI 决定补证、修订或继续独立部分。

`select` 在 `status` 模式读取指定 runId、baselineSha256、resultsRevision、resultsSha256 的正式评估；多个状态按任一命中，去重整条场景并包含全部目标。源映射必须明确，不能从标题或同名对象猜测。`full` 模式覆盖指定 scope 全部目标，不按历史成败或任务成熟度过滤。缺任务、未整理和未知来源都显式保留。

缺评估不是第五种业务状态；`includeUnassessedCases` 是单独的范围选项。零命中返回空选择，不能自动变全量或测试通过。selection 保存命中原因、计划重跑目标、未选中范围与缺口，并有内容指纹。

`start --binding` 接收完整选择快照、本轮条件、caseMappings 与 deferredCases。每个选中场景必须编入新基线或明确暂缓；编入的场景不能删目标、改预期、换必要步骤或路径。任务/规则变化时先明确修订及新 scope。保存的条件是 AI 本轮核验/声明与来源，工具不代替判断真实身份和授权。

条件来源的 current_evidence 必须有 file/sha256；ai_declaration/current_user_statement 使用 locator 且 file/sha256 为 null。declaredAt 要求实际 UTC 时刻的秒或三位毫秒 Z 表示，不接受偏移时区/微秒表示；先按同一实际时刻规范化，不造时间。

引用哈希含义不同：规范原件 contentSha256 是原件字节哈希；rule/task 引用的 contentSha256 来自 commit 回执；source.resultsSha256 是 context 返回的规范化结果前缀指纹，不能拿整个 results.json 的文件哈希代替。运行绑定同时有内容指纹和 manifest 所记的文件字节哈希，均由工具处理。

## 动作事实、恢复与并行

record 可追加 contexts 与 actionEvents，亦允许没有目标评估的纯事实记录。观察通过 contextId/actionEventIds 引用事实；单次尝试的 actionId 与各个事件 ID 分开。意图、发出、接受、结果知识和处置分别表达。可能有重复副作用的动作先记录意图；恢复时意图无回执仍可能已发出，不自动重试。

意图、未发出/发出未知及结果未知不能单独证明步骤已执行；调用已发出不单独证明业务目标通过。已知失败、处理中或窗口未完成的实际观察仍保留，由 AI 按明确目标判断。未知、暂缓和冲突通过未决动作投影可见，确认处置需要证据、范围、限制及所处理的事件。工具不创建 SLA，不以最后一条记录自动判业务成功。

worker 首次封包可以自包含事实；已导入后可以用新 packet 追加事实，或引用本 run 中已导入的上下文/动作。显式 `evidence[].reuseEvidenceId` 仅复用同 run、同 case 的原证据，并核对 kind/source/description/capturedAt、文件哈希和字节；原时间与 evidenceId 保留。未导入、跨 case 或其他 run 的引用拒绝。相同文件哈希不触发自动合并。协调者仍是公共账本及回归资料的唯一写入者，工具不调度下一业务动作。

## 报告与比较

登记证据要按文件保留真实来源：AI 资源/授权说明用 other 并明确 AI 编写，不能以 tool_receipt 或“原始接口输出”标记。历史误标通过独立更正说明及新注释版报告解释，不改原始文件或业务结果。

运行报告列出原范围、选中范围、实际冻结范围、未编入缺口、本次条件和精确任务/规则版本，显示动作事实及未决动作。四态只统计本次冻结范围；未选中没有本次结果，不被记成未测试，也不沿用历史通过。记录完整不等于完整回归完成。

比较使用显式目标映射，展示规则、任务、身份、环境、数据、授权、范围和路径的差异。上下文证据沿同一目标的观察/动作引用收集，不因同属一个场景就引入无关证据。AI 可比性说明独立保存并引用来源；没有说明时显示尚未提供，不自动给出新版回归归因。

旧错误消失不等于修复完成，仍要验证原目标、必要路径及相关影响。旧证据只属于旧 run；同字节的新截图也必须有本轮采集事实。关键截图不足、首次取证失败及路径未核实都要如实保留限制。

## 升级影响

新运行及请求要求 v8；旧 v5/v6 明确拒绝，不原地迁移、不仅修改版本号。已有运行、报告、截图与原资料原样保留；需要复用时由 AI 基于原始来源新建资料，并注明事后整理范围和缺口。regressionVersion 与主契约独立版本化。

本最终分支同时包含 0.1.7 报告优化、资源澄清与回归复用。开发构建和自测不会自动安装、推送、合并 main、创建 Tag/Release 或交付候选安装包。
