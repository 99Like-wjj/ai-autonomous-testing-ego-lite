# 用例接收、版本与人工审阅（v9）

本阶段的人类阅读内容遵循[统一语言与模型来源](report-language-model.md)；记录实际生成者及已知配置，不根据当前模型补造历史来源。

接收外部用例时保留原意、顺序要求及来源。生成用例时明确可信需求、可独立判断的预期和必要条件；不从当前 UI 现状反推验收标准。用例仍为 cases→goals，步骤不机械计成独立测试目标。

只要求测试点时交付测试点；要求完整用例时提供可评审的前提、必要步骤、依赖及预期。AI 完成本次设计后用 cases save 保存、cases render 同源生成 HTML/Markdown，暂停依赖该设计的执行，交团队审阅。一次实际确认可覆盖整个版本，不固定增加两轮审批。

HTML默认先列出全部场景，展开后查看用例，具体用例进入三栏评审工作台。为团队准备审阅时，AI可显式调用 cases serve，并用Ego打开返回的本机私有URL；页面的“保存到本机文件”校验版本和范围后写入可读HTML/JSON，避免依赖浏览器Blob下载的Windows来源标记。cases render仍交付独立离线HTML/Markdown，离线副本可阅读、暂存和恢复意见；需要原生文件保存时使用本机入口，或交回数据由cases export-review保存。保存和展示均不启动测试、不登记人工确认。

意见按当前用例编辑并暂存，切换、返回和刷新保留当前浏览器草稿。导出前核对范围及所有意见；范围外意见必须明确纳入，不能过滤丢弃。恢复文件须核对projectId、版本、指纹和编号，冲突不覆盖当前草稿。浏览器草稿只属于该入口的当前浏览器存储，不保证换浏览器或重新启动不同地址的本机会话后继承；持久交付使用已保存文件。已有意见可通过 --feedback 在生成或本机会话中显式载入，不改用例定义。

## 轻量保存

测试资料位于用户选定的私有工作目录：cases/v001.json、相邻 v001-review-01.json，以及 runs/ 下的独立运行。定义变化才保存 v002；普通复测复用 v001，只增 run。规则直接作为用例依据，任务作为场景计划，问题留在原运行；无需通用资产库、逐点文件或项目运行注册表。

新目标的 pointId 为 null，由 cases save 在整份提交中分配。已发布目标沿用编号，退役/拆分/合并显式说明，编号不复用。expectedVersion 与 previousSha256 拒绝覆盖；回执丢失重用同一请求读取已提交结果。

JSON 原件包含版本、编号计数、来源、覆盖说明、场景及变更原因。条件有稳定 id，steps.dependsOn 只表达明确依赖。goal.requiredRefs 引用 condition:id、step:id 和 requiredPath。每个 goal 有 pointId、id、title、basis、expected、planState、preparationGaps、sourceAlias、clarificationQuestions。

prepared 必须有必要计划与引用；未完整设计保留 unprepared 及缺口，不能从全量目录消失。本轮账号或数据是否就绪另记运行条件，不每轮改用例定义。参数有类型、用途及约束；绑定值独立，不全局替换或放宽预期。

## 审阅与覆盖

cases review 保存实际收到的意见/确认及真实定位，工具计算所审版本的目标及必要计划指纹。离线 HTML 导出只是反馈数据，不能仅凭 approved 字段制造人类确认。用户或明确委托的评审可一次确认所选编号；普通评论不撤销确认，较新的明确修改要求不能靠挑旧确认绕过。

重测不重复审阅未改内容。新版仅改部分目标时，匹配内容指纹的未变目标可复用旧确认；业务标准、共享约束、参数、来源或必要计划变化的影响范围重新审阅。审阅不证明本轮资源与真实操作授权。

来源覆盖区分 mapped、pending、out_of_scope、retired。新需求未形成目标时保留覆盖缺口，不编造编号或四态填平统计。方法与边界参阅[设计经验](case-design-guide.md)、[资源准备](resource-readiness.md)、[回归复用](regression-reuse.md)。

## 完整合成原件

以下仅说明 v9 结构，不是真实需求、审阅或执行证据。首次保存使用 examples/cases-save-request.example.json；下面是已保存原件的合成形态。

```json
{
  "schemaVersion": 9,
  "projectId": "example-export-project",
  "project": "Synthetic export example",
  "pointPrefix": "SAMPLE",
  "caseVersion": 1,
  "previous": null,
  "nextPointNumber": 3,
  "retiredPoints": [],
  "sources": [
    {
      "id": "synthetic-requirement",
      "locator": "Explicitly synthetic example; replace with an actual requirement.",
      "file": null,
      "sha256": null,
      "excerpt": "An authorized synthetic export preserves exact identifiers and values.",
      "limitations": [
        "Synthetic specification, not any deployed application requirement."
      ]
    }
  ],
  "coverage": [
    {
      "id": "export-values",
      "sourceRefId": "synthetic-requirement",
      "statement": "An authorized synthetic export preserves exact identifiers and values.",
      "state": "mapped",
      "pointIds": [
        "SAMPLE-TP-000001",
        "SAMPLE-TP-000002"
      ],
      "reason": "Two independent targets cover completion and content."
    }
  ],
  "cases": [
    {
      "id": "export",
      "title": "Authorized synthetic export",
      "criticalConditions": [
        {
          "id": "authorized",
          "text": "Use only an authorized synthetic environment and object."
        }
      ],
      "requiredPath": "Use the application export control and retain its real downloaded artifact.",
      "stepOrder": "strict",
      "steps": [
        {
          "id": "request",
          "action": "Use the authorized application export control once.",
          "dependsOn": []
        },
        {
          "id": "save",
          "action": "Observe the download and save its actual bytes.",
          "dependsOn": [
            "request"
          ]
        },
        {
          "id": "inspect",
          "action": "Read the exported values and compare them with the current authorized inputs.",
          "dependsOn": [
            "save"
          ]
        }
      ],
      "parameters": [
        {
          "id": "expectedId",
          "type": "string",
          "purpose": "Exact synthetic exported identifier",
          "constraints": [
            "Preserve leading zeros; do not relax the business criterion."
          ]
        }
      ],
      "goals": [
        {
          "id": "completion",
          "pointId": "SAMPLE-TP-000001",
          "title": "Download completion",
          "basis": {
            "kind": "explicit",
            "source": "Synthetic requirement",
            "text": "The application export produces an actual readable downloaded artifact.",
            "sourceRefIds": [
              "synthetic-requirement"
            ]
          },
          "expected": "Actual download completion and the preserved file can be checked.",
          "requiredRefs": [
            "condition:authorized",
            "requiredPath",
            "step:save"
          ],
          "clarificationQuestions": [],
          "planState": "prepared",
          "preparationGaps": [],
          "sourceAlias": null
        },
        {
          "id": "content",
          "pointId": "SAMPLE-TP-000002",
          "title": "Exported data integrity",
          "basis": {
            "kind": "explicit",
            "source": "Synthetic requirement",
            "text": "The export preserves the exact current input identifier and values.",
            "sourceRefIds": [
              "synthetic-requirement"
            ]
          },
          "expected": "The exported identifier equals expectedId, including leading zeros; required values and records match.",
          "requiredRefs": [
            "condition:authorized",
            "requiredPath",
            "step:inspect"
          ],
          "clarificationQuestions": [],
          "planState": "prepared",
          "preparationGaps": [],
          "sourceAlias": null
        }
      ]
    }
  ],
  "changes": [],
  "writeRequestSha256": "0000000000000000000000000000000000000000000000000000000000000000",
  "savedAt": "2026-11-01T00:00:00.000Z"
}
```
