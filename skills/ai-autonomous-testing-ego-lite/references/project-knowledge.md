# 项目知识v3：按需检索与读取

任务提供本地知识库根目录时保留在上下文；未提供时继续已有资料支持的工作。Ego直接读取同一规范，不要求先调用维护Skill、不读取HTML、不自动发现或绑定项目。

## 四类资料

| category | 用途 |
| --- | --- |
| project | 用户提供的地址、登录说明和自由项目配置；每条是轻量记录，不要求环境/应用/页面表 |
| modules | 模块用途、所属应用/页面、模块级路径及明确关联规则/角色 |
| rules | 完整公共规则/角色正文、自然语言适用范围、确认状态和来源 |
| accounts | 用户声明的账号身份、用途与限制；不要求正式角色或环境档案 |

账号和项目配置共用items记录，仅id/title必填，可有summary/tags/description/properties。自定义属性保留原名称与结构，不映射成固定权限字段。配置不是规则确认结论；信息不足时先看详细说明，不按账号标题推定实际权限。

## 工具

~~~text
node ABS_TOOL_ROOT/scripts/ego.mjs knowledge inspect [--knowledge-root ABS]
node ABS_TOOL_ROOT/scripts/ego.mjs knowledge query [--knowledge-root ABS] [--request ABS_JSON]
node ABS_TOOL_ROOT/scripts/ego.mjs knowledge read [--knowledge-root ABS] [--request ABS_JSON] [--output-file ABS_NEW_JSON]
~~~

无根目录返回not_configured且不读取请求；有根目录时query/read需要合法请求。参数由AI准备，用户不用手写JSON。

完全合成请求：

~~~json
{"expectedProject":{"id":"synthetic-project-a"},"category":"accounts","query":"测试环境 馆甲","limit":10}
~~~

query/recordIds用于查关键词或精确记录。配置只搜索id/title/summary/tags；query不给description/properties、登录标识或命中原文，read再展开全部非秘密详情。摘要不足时列出短摘要或读取候选，不能把搜索未命中当作账号不存在。

规则/地图可用kinds、moduleIds、domainIds筛选，includeRelated沿显式引用展开；不反向列全部账号、不推导权限并集或固定路线。environmentId、applicationIds、scopeIds、roleIds筛选已移除，传入要修正调用，不能静默忽略。

独立期望项目身份来自用户任务，按ID/名称核对；只有路径时保留not_checked，不能从库里抄ID假装完成独立核验。环境和范围在用户说明、appliesTo及入口记录中表达，AI结合任务判断；未说明不代表全局适用，不自动选第一个地址或账号。

## 在任务中使用

需求分析遇到公共权限、共享或数据规则时主动考虑查规则完整正文和例外。摘要不代替完整权限；功能细则仍查本次需求，未入库也不等于不用测。

准备身份或入口时读取用户已登记内容；只在当前目标缺关键条件时询问。不因字段不齐要求补整套矩阵或环境表，不默认生成全项目准备清单，用户暂缓账号时不反复催促。分析需要准备哪些账号是另行明确的测试准备任务，不把画像视为已存在的身份。

执行按地图所属应用、页面和模块路径减少探索；project配置缺省也能读地图。URL未知不拼路由，UI进入要求仍遵守。历史入口失效时可在原授权内探索，不跳过必要业务语义或换高权限身份凑通过。

登录成功、用户声明、规则已确认与当前业务验证分别判断。工具不解析凭据引用、不读取秘密文件、不自动登录或执行配置值；资料本身不授予本轮操作权限。普通测试只读，维护另按用户明确要求执行。

## 可选来源与回执

knowledgeReadVersion=3；not_configured/available/partial/unavailable仅表达知识来源，不是业务四态。无可选文件或合法空集合可继续；损坏类别不当作空集合，也不拖垮独立有效资料。错项目、头损坏、格式不支持或写事务在途不返回不可信业务内容。

规则保留confirmed/observed/pending及active/superseded/retired，配置不套这些状态。appliesTo原样说明适用范围；历史Check仅覆盖当时明确的入口/页面，未知捕获时间不补造。

保留snapshotSha256、usedFiles哈希、来源、Git/草案及截断信息，不声称远端最新。固定commit需完整本地提交，草案用allowDraft:true明确选择，不自动checkout/pull/合并。

默认limit=10、maxBytes=24000，最大50条/200000字节；关联深度默认1、最多5。pagination说明省略与nextOffset；单条过长时精确缩小范围或增加预算，不按同一offset无目的重试。

显式output-file只为有效/局部有效上下文生成库外新摘录及既有v9 SourceRef，不覆盖历史。当前只支持v3，不兼容或转换旧知识，知识变更不倒改冻结用例或旧结果。
