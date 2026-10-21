# 测试资产格式规范（v2）

[English](asset-formats.en.md)

规范的目标是让 AI 稳定地读取、交换和输出信息，规定业务步骤及每步预期，但不是固定点击脚本、固定 DAG、特定业务行为或隐藏的验收基准数据集。AI 仍需根据真实需求选择动作、观察和判断；本地助手只整理记录、检查结构，不运行浏览器，也不替 AI 判定产品是否正确。

## 业务材料与内部交换格式

用户可以提供 Markdown、CSV、普通文本、工单或其他可读取的业务文档，不需要手写 JSON。AI 读取原文、识别歧义后，把约定范围规范化为用例。应保留可定位的来源和真实需求文本；需求冲突或缺失意味着需要澄清，不能自动补成验收标准。

内部交换使用 UTF-8 JSON，版本字段为 schemaVersion: 2。../schemas 中的 JSON Schema 使用 draft 2020-12 和本地相对引用，应一起加载整个目录。助手直接实现检查，不会自动加载这些 Schema。不要在资产 JSON 中添加 $schema 字段，封闭格式会拒绝未知字段；请在编辑器或验证器中关联 Schema。

## 资产及其职责

- cases.json：准备好的用例输入，对应 cases.schema.json。文件名只是约定，start 接受显式指定的输入文件路径。
- baseline.json：start 生成的规范化、冻结用例，使用同一 Schema。不能为了适配实际结果而改写。
- manifest.json：生成的运行标识、绝对路径 projectDir 和 baselineSha256，对应 manifest.schema.json。哈希覆盖基线文件的原始字节，包括空白；可发现意外变化，但不防恶意篡改。
- results.json：操作者记录的观察与结论，对应 results.schema.json。start 为每个基线用例创建一条 not_run 记录。
- evidence.json：证据目录，对应 evidence.schema.json。初始 items 为空。
- evidence/：本次运行的实际证据文件。登记一条目录元数据并不等于证明行为发生。
- report.json 与 report.md：生成的复核材料。JSON 对应 report.schema.json；Markdown 是便于阅读的呈现，不是另一套判定来源。report 不会覆盖已有报告。
- common.schema.json：共享定义，不是独立的运行资产。

真实项目输入、运行记录、报告与证据应放在可分发 Skill 仓库之外。仓库内只放合成的 .example 示例，域名使用 app.example 等占位符，不放真实秘密、身份、账号数据或敏感截图。示例仅说明语法，其中的描述不构成规范性测试要求。

## 用例：保留意图，不写死动作脚本

每条用例必须包含：

- id：非空白、稳定的标识，在用例列表中唯一。
- title：非空白简述。
- basis：仅包含 kind、source、text。kind 为 explicit、interpretation 或 hypothesis；source 和 text 不得为空白。explicit 必须有真实明确需求支撑，不能只因为 AI 很有把握就这样标记。
- criticalConditions：非空白字符串数组，描述重要角色、输入、初始状态或其他前提，可以为空数组。
- expected：非空白的可观察预期行为，不表示行为已经发生。
- requiredPath：没有规定路径时为 null；否则是描述真实必经路径的非空白文本。这不是文件系统路径，也不应凭空增加以限制 Agent。

- stepOrder：必需，strict 或 adaptive。strict 保持步骤的业务语义顺序；adaptive 仅在意图、前提、依赖及必经路径不变时允许调整方法或顺序。两者都不能跳过关键步骤或降低覆盖。
- steps：必需的非空有序数组。每步恰好包含 id、action、expected 三个非空白字符串；id 在本用例内唯一，不要求跨用例唯一。action 是业务动作，expected 是该步可观察预期；不是已经执行的事实，不放坐标、选择器或未经授权的操作。最终 expected 仍保留整体验收条件。

例如：打开搜索界面（预期可输入分类）→ 输入合成类别（预期显示该值）→ 执行查询（预期请求完成或明确提示）→ 核对当前可见列表（预期符合已确认分类规则）。模型依据当前 UI 自主定位，不把“列表出现”当作后端正确性证明。

外部提供和 Skill 生成的用例走相同校验、冻结与执行流程，均可用于新功能或回归。可选命令 `node scripts/ego.mjs validate-cases --cases ABS` 只读校验并打印摘要，不创建运行。结构校验不判断步骤是否合理、需求是否真实或授权是否充分；模型仍须语义复核。生成规则见[独立安装的生成参考](../skills/ego-lite-test/references/case-authoring.md)。

根对象必须包含 schemaVersion、非空白 project 和非空 cases 数组。根对象、用例、步骤和 basis 中的未知字段会被拒绝，而不是悄悄丢弃。额外背景保留在原始文档；确实需要新字段时，应明确修订协议。

## 结果与尝试记录

每条结果必须包含 id、与基线完全一致的 basis，以及 status、observed、rationale、remainingQuestions、evidence。仅 cause 和 attempts 可省略。未知字段会被拒绝。

- status：pass、fail、inconclusive、blocked 或 not_run。
- observed：实际观察到的行为，与 expected 分开记录。
- rationale：为什么这些观察支持当前状态，以及哪些事情尚不能证明。
- remainingQuestions：非空白问题字符串数组；没有已记录问题时用 []。空数组不证明所有不确定性已经消除。
- evidence：证据文件的相对路径数组，不是目录条目 ID，也不是外部 URL。
- cause：product_candidate、agent、environment、spec 或 unknown。产品问题候选不等于已确认根因；省略时报告显示 unknown。
- attempts：按发生顺序保留的尝试，包括首次失败。每条尝试包含 status、observed、rationale、remainingQuestions、evidence，可选 cause；不包含 id、basis 或嵌套 attempts。

pass/fail 必须有非空白 observed、rationale 和至少一个证据引用。inconclusive/blocked 必须有非空白 rationale。not_run 可以保留空 observed/rationale 和空数组。相同规则也适用于 attempts。结构有效的运行仍然可能尚未完成。

所有原始基线用例必须恰好出现一次，包括 blocked 与 not_run；不得出现未知或重复的结果 ID。不能用后来的成功覆盖失败尝试，不能更换需求，也不能悄悄删除未完成用例。助手只能检查已提供的尝试，无法发现从未记录的尝试，也不能证明历史记录完整。

interpretation 和 hypothesis 即使状态为 pass/fail，也仍是未确认的验收发现。只有 explicit 结果计入 recordedExplicitOutcomes，但这些数字仍是操作者记录的结果，不是独立证明的判定。

## 证据目录

根对象只能包含必需的 schemaVersion 和 items。每条条目恰好包含以下必需字段：

- id：非空白目录标识，目录内唯一。
- path：在目录中唯一、位于 evidence/ 下的斜杠分隔相对路径，例如 evidence/example.txt。
- kind：screenshot、dom、tool_receipt、log 或 other。
- capturedAt：有效 UTC ISO 时间，格式为 YYYY-MM-DDTHH:mm:ssZ 或 YYYY-MM-DDTHH:mm:ss.sssZ；不接受时区偏移或其他小数位数。
- source：非空白的采集来源说明，例如使用的工具或页面视图；不能包含凭据或私有会话令牌。
- description：非空白说明，描述证据展示了什么，以及重要限制或脱敏情况。

所有目录路径和结果/尝试引用必须指向本次运行 evidence 目录内已存在的普通文件。助手拒绝路径中的符号链接、绝对路径、目录穿越、空路径段、反斜杠、冒号和 NUL 字符。每个结果引用必须匹配目录中的 path。允许没有被引用的目录条目，但其文件仍必须存在；待执行运行可以使用空目录。

时间、来源与描述均由操作者提供，不代表可信采集认证、签名、文件内容哈希或密码学真实性。安全允许时保留原始观察；脱敏不能误导复核者，使其误以为仍能看到已移除的内容。

## 校验边界与版本演进

Schema 检查 JSON 结构、字段类型、枚举和单条记录的条件要求。验证器须支持 draft 2020-12 并解析本地引用；date-time 格式断言可能需要显式启用。助手另外检查真实日历时间、用例/目录 ID 唯一、单用例内步骤 ID 唯一、目录路径唯一、完整基线覆盖、basis 不变、基线字节哈希、引用归属、文件存在、符号链接和平台相关的绝对路径语义。单靠 JSON Schema 不能保证这些跨文件及文件系统规则。

生成报告前运行 check。structurallyValid: true 只表示结构检查通过，不意味着全部用例已执行、全部关键前提已核实或产品通过。hasUnexecutedCases 与 counts 展示已记录覆盖情况，仍应审阅逐条证据和推理。

当前全部 JSON 资产只接受 schemaVersion: 2，不兼容 v1，也没有自动迁移。旧文件必须按当前契约重新准备；不要修改历史运行基线来伪装新版记录。不要随意增加元数据或改变字段含义。检查不构成绕过工具直接修改文件等行为的安全边界。
