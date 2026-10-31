# 架构与职责（v8）

![架构职责示意：AI、Ego 与本地工具的分工。](images/architecture.zh-CN.png)

当前 AI 负责理解需求、目标拆分、选择方法、执行浏览器操作和判断结果。Ego 提供原生浏览器能力；本地工具负责确定性数据事务、结构校验和报告呈现；接口观测组件还负责启动独立 native 采集上下文、按授权范围记录以及提供本地查询。默认并发 1，用户配置是上限，不是要求跑满；工具不自动调度业务、重试业务或调用模型；纯文件事务的有界重试不代表业务重试。

跨宿主执行时，宿主负责真实执行者、上下文、工具权限和生命周期，本地工具只保存分派与复核交付；不新增宿主调度器或权限沙箱。链接 CLI 入口按真实路径识别，运行/证据路径保护保持。参阅[宿主条件与交接](../skills/ai-autonomous-testing-ego-lite/references/host-compatibility.md)。

```mermaid
flowchart LR
  R[可信需求与授权] --> C[AI 设计 case 与业务 goals]
  C --> B[冻结 v8 基线]
  B --> A[AI 使用 Ego 执行]
  A --> O[真实观察与证据]
  A -. AI 按授权启用 .-> N[独立 native 接口采集]
  N --> Q[本地查询与片段导出]
  Q -. AI 选择并登记 .-> O
  O --> S[串行 record]
  O --> P[worker packet 与协调者复核]
  S --> E[统一 results.entries]
  P --> E
  E --> V[当前目标评估与完整历史]
  V --> H[同源 HTML / JSON / Markdown]
  R --> T[AI 整理不可变规则与任务]
  E --> T
  T --> F[明确状态筛选或全量范围]
  F --> U[本次条件核对与新运行绑定]
  U --> B
  E --> D[有来源的跨运行比较]
```

## 业务目标与必要语义

case 组织相关业务流程；goals 承载有来源、可独立判断的预期。steps、criticalConditions、requiredPath 保留必要语义，goal.requiredRefs 建立依赖。工具不把每个点击变成验收目标，不由父场景状态复制子目标通过。

observations 记录实际事实、coveredRefs 与证据 ID。assessments 引用观察并给出四态、理由、缺口及可选 diagnosis。结果与根因分离：发现违反可以根因未知；缺少目标评估是记录完整性缺口，不自动变成业务无法判断。

## 唯一结果渠道

串行 record 与并行 import 写入同形 record 和同一 entries。final 对本次提交目标增量更新，attempt 仅留历史；当前状态是 final entries 的投影，原始条目不覆写。没有额外的并行专属目标评估来源，串行不依赖 worker 或 Space 分派才能形成报告。

worker 在专属目录封存不可变 packet，协调者复核后将 local evidence key 映射为 catalog ID。分派、容量、Space 所有权、在途调用和导入恢复保留在 execution 台账，属于执行元数据，不能代替业务四态。工具不提供宿主权限沙箱，Space 不保证账号或后端隔离。

## 项目回归资料

v8 在同一结果账本中追加 contexts/actionEvents，区分意图、发出、结果与只读核对/处置。未决动作由明确事实及有证据的处置投影，不自动重试；串并行共用校验与证据引用，显式 reuseEvidenceId 只复用当前 run/case 的原证据，不把同哈希当作同次采集。

AI 从可信规范和首次实际事实整理规则/任务，regressionVersion 1 的资料库只保存不可变修订及来源，不生成正确预期或调用模型。状态筛选使用精确历史结果前缀，任一目标命中即选择整条场景；full保留完整指定范围及缺口。新run冻结选择、任务/规则和本轮条件，未选中没有本次结论。比较展示显式映射、条件差异与AI可比性说明，不自动归因版本。详见[回归资料](regression-reuse.md)。

## 文件与校验

源码维护 TypeScript，完整包提供 Node ESM 与 Skill、schema、示例、文件清单。tool-info 校验实际根、版本、revision 和安装完整性。测试资产 JSON 契约为 v8；接口观测独立使用 networkVersion 1。旧格式明确拒绝，不提供兼容或自动转换，历史文件不改写。

基线指纹保护冻结内容；单写者锁、expectedRevision、operationId 和回执保护数据事务，原请求重放仅恢复回执。证据按普通文件复制、留存字节哈希和归属核验，报告拒绝覆盖。工具不认证证据真实性，也不承诺通用多文件事务或断电持久性。

## 报告与按需观测

三种报告共享当前目标投影：四态分布、unassessed 记录缺口、实际观察、必要语义、截图、历史及后续复核引用。父场景只呈现目标分布；文件完整性、缺图和根因假设单列。followUpOf 关联澄清/复测来源，不自动改变旧结论。

浏览器按需观测仍通过当前 Ego 官方能力。AI 可查询与目标相关的动作、请求/错误或下载文件，不采集全站流量或将工具超时自动判产品失败。具体能力须以当前版本和隔离验证为据，不能因 API 名称存在便宣称支持。参考执行经验（安装包路径：references/experience-execution.md）。

代码能力和合成回归不代替实际业务验收；当前开发验证见[验证记录](testing.md)。用户级已安装 Skill 不自动替换，候选构建不冒充正式发布。

接口观测采用独立 native-only 上下文，经官方 TaskSpace 控制权门禁只附着已登记页面与接口范围。network start/status/query/stop 管理后台记录、已提交事实查询和有序停止；流内容在安全完整单元处理后保存，恢复另建采集段。工具不做业务请求重发、自动业务轮询或业务判断；按需查询及证据选择由 AI 决定。正文、队列、关联表、输出和 Run 磁盘预算均有边界，缺口可见。

## 合并后的报告能力

同一 v8 账本同时保留上下文、观察动作片段、尝试事件、现象、结构化缺口与复核准备。contexts 使用 environment/identity/objects/initialState/authorization，各项为 state/summary/sources；sources 保留类别、定位和证据引用。观察 actions 用于已观察操作片段，actionEvents 用于意图、发出与核对，工具不自动互拷或重放。

报告保留场景与目标两级导航、证据正文、内容去重、附件交付和八种主题。network export 只从已留存的网络片段导出证据，不重发请求。回归范围、任务版本、当次条件及未决动作与原报告能力共同呈现。软件版本为0.1.7，数据契约v8不是软件版本号；详情见[最终整合记录](v0.1.7-integration.md)。
