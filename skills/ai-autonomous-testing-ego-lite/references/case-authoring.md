# 用例接收与生成（schemaVersion 8）

## 目标是判断单位

外部用例与 AI 生成用例使用同一契约，均可用于新功能或回归。AI 设计业务目标和预期，CLI 仅校验与冻结。只生成用例不需要浏览器连接，不创建虚假执行结果。

一个 case 表达有业务联系的场景或流程；其中 goals 是可独立判断的验收目标。拆分依据是不同的前提、身份、数据或可观察结果，而不是点击数量。保持必要连续动作和顺序，不能把“创建—刷新—读回”拆成互不相干的操作成功检查。

例如“前后事项日期差正确”和“未知容量不显示为空闲”需要不同数据与观察，宜分目标或分用例；它们都应保留。表单错误提示与未创建对象也可分别判断，共享同一次提交事实；不能用提示出现代替未创建对象的核验。

## 从来源到可执行目标

接收外部资料时保留原文件、原文依据、关键输入、顺序和授权；规范表达不等于获准改预期。旧 JSON 不能直接输入新版工具，从原始来源重新整理为 v8 新文件，不覆盖历史或只改版本号。

AI 从可信需求和用户范围定位每个验收目标，标明 basis.kind：explicit 为明确要求，interpretation 为有来源的待确认解释，hypothesis 为探索假设。当前 UI 和模型信心不能充当需求依据。明确的“本期不做”不进入本期执行。

界面名称和能力举例不自动给出完整判据。例如“周视图”不能直接推导每个刻度按周；“支持 TXT/MD”若没有限定为允许清单，也不能直接把 PDF 定为非法。只固定来源明确的部分，将影响结论的单位、范围或排他性作为待确认解释，避免把常见实现习惯写成明确要求。

冻结前逐个目标核对：

- 预期是否有可定位来源，是否保留全部必要语义？
- 是否有适用的初态、身份、数据、动作与可观察结果？没有时说明缺口，不能只写预期而没有对应设计。
- 用例细化新识别的前提是否已带回整轮资源依据？当前任务含实际测试时，已有实质缺口是否已向用户沟通，剩余范围是否清楚？
- requiredRefs 是否覆盖该目标所需步骤、条件与必经路径？共享条件可以被多个目标引用。
- 是否把不同身份或数据依赖混成一个无法分别判断的目标？拆分后仍须保留业务流程依赖。
- 执行范围是否与判断范围一致？未覆盖的需求作为独立目标或覆盖缺口，不能在收尾时突然加入已执行目标的通过门槛。

实际资源和操作授权按[资源指南](resource-readiness.md)核验，初期已知缺口不等全部用例写完才开始问。纯设计可以保留待补前提；首次或恢复实际测试前，须说明整轮已知条件和允许继续范围。未决验收规则才使用目标的 clarificationQuestions，资源不足不改变原规则；用户暂缓时保留目标和实际已完成范围，执行报告按真实观察给出状态及原因。

## v8 字段

根对象为 schemaVersion: 8、非空 project、非空 cases。每个 case 包含：

| 字段 | 含义 |
| --- | --- |
| id、title | 稳定用例 ID 与场景标题 |
| criticalConditions | 所需前提字符串数组，不能借空数组省略已知条件 |
| requiredPath | 必经业务路线；没有明确要求时为 null |
| stepOrder | strict 保留业务依赖顺序；adaptive 允许在语义、前提与依赖不变时调整方法 |
| steps | 非空有序数组，每步 id、action；表达业务意图与必要输入，不编造选择器 |
| goals | 非空业务目标数组，ID 在本用例中唯一 |

每个 goal 包含 id、title（业务标题）、basis（kind/source/text）、非空 expected、requiredRefs；可选 clarificationQuestions 和 followUpOf。requiredRefs 使用 step:步骤ID、condition:从0开始的索引，以及有值时的 requiredPath。步骤、前提和路径是必须履行的语义，不分别填写四态，也不机械计为目标数量。

clarificationQuestions 非空的目标，在 final 和 attempt 中都不得给出 verified 或 violation；其他不依赖该歧义的目标可分别判断。澄清后新建修订基线，通过 followUpOf:{runId,caseId,goalId,reason} 关联原目标；保持原观察与旧口径，不在旧基线清空问题。

## 合成示例

```json
{
  "schemaVersion": 8,
  "project": "synthetic-config",
  "cases": [
    {
      "id": "CONFIG-01",
      "title": "创建模板并读取保存结果",
      "criticalConditions": [
        "实际身份已核验且允许创建",
        "获授权的独立合成数据环境"
      ],
      "requiredPath": "通过配置中心的模板功能创建",
      "stepOrder": "strict",
      "steps": [
        {
          "id": "create",
          "action": "新建名称为演示模板A、字段为演示字段甲的模板"
        },
        {
          "id": "readback",
          "action": "重新读取同一模板并核对名称与字段"
        }
      ],
      "goals": [
        {
          "id": "saved-content",
          "basis": {
            "kind": "explicit",
            "source": "合成需求 CONFIG-01",
            "text": "保存后重新读取仍保持模板名称与字段。"
          },
          "expected": "重新读取的模板名称为演示模板A，包含演示字段甲。",
          "requiredRefs": [
            "condition:0",
            "condition:1",
            "requiredPath",
            "step:create",
            "step:readback"
          ],
          "title": "重新读取的模板名称为演示模板A，包含演示字段甲。"
        }
      ]
    }
  ]
}
```

示例没有真实权限或执行结果。设计时考虑[相关经验](case-design-guide.md)，不要求填经验 ID 或套满通用方法。步骤不再承载独立 expected；需要独立判定的要求放入有来源的 goal。

## 校验、冻结与执行

validate-cases 只读检查结构，start 冻结基线并创建空结果账本；缺少 assessment 表示尚未入账，不能由此断言没有执行。结构合法或冻结成功不证明资源已齐备、实际沟通充分或业务覆盖完整，AI 仍审查来源、依赖和授权。整轮盘点不是所有目标同时就绪的要求，独立且条件充分、获授权的目标可继续。

冻结后保留 goals、步骤、条件、路径和顺序。实际观察进入 observations，覆盖的必要语义用 coveredRefs 引用；assessment 引用观察、记录四态与缺口，不从计划推断已完成。同一观察可支撑多个相关目标，不强制每步单独 trace 或截图。关键 UI 结果需要真实截图，详见[证据与报告](evidence-and-report.md)。
