# 本地工具箱调用指南（schemaVersion 3）

本指南只适用于仓库中的可选 Node.js 文件工具。使用前确认工具包根目录，并读取其 [`docs/asset-formats.md`](../../../docs/asset-formats.md)。若仓库不可用，继续使用 Ego 与私有 Markdown 记录，不声称工具已运行。

## 边界

- 工具只读取/写入用户给定的本地文件；不联网、不调用模型或 Ego、不操作浏览器、不生成测试数据、不自动判断 bug、不选择执行路径、不重试业务动作。
- 工具将指定普通文件复制到 run 的 `evidence/`。登记前先按用户要求缩小范围并检查敏感内容；工具不会脱敏。
- `capturedAt` 仅来自来源提供的采集时间。未知时省略；`collectedAt` 由工具独立登记。
- SHA-256 只校验留存字节与 catalog 值一致，不能证明真实性、来源身份或结论正确。
- 使用 v3 新格式。v0.1.2 schemaVersion 2 文件不能直接使用；依据原始需求重建用例并新建 run，不改版本号冒充兼容。

## 创建和检查运行

项目用例须符合 `schemas/cases.schema.json`。在源码仓库外保存项目和 run，使用绝对路径；run 目标目录须不存在。

```text
node scripts/ego.mjs validate-cases --cases ABS_CASES_JSON
node scripts/ego.mjs start --project-dir ABS_PROJECT_DIR --cases ABS_CASES_JSON --output-dir ABS_RUN_DIR
```

`start` 只冻结基线并创建初始 `not_run` 结果和空 evidence catalog。执行浏览器操作仍需用户授权及本机 Ego 官方 Skill。

## 登记证据

1. 读取 run 当前 `evidence.json` 的 `revision`，用作新请求的 `expectedRevision`。读取仅用于确定版本，不要手工改写 catalog。
2. 为请求分配新的安全 `operationId`，指定基线 `caseId`、已有本地普通文件 `sourceFile`、`kind`、`source` 和 `description`。未知的 `capturedAt` 不要填写。
3. 保存 UTF-8 JSON 请求，然后运行：

```text
node scripts/ego.mjs evidence-add --run-dir ABS_RUN_DIR --request ABS_REQUEST_JSON
```

4. 将返回的 `evidenceId` 用于同一 `caseId` 的结果或 attempt。返回值包含 operation ID、revision、path、SHA-256、字节数和 collectedAt。

证据请求由 helper 按单 writer 锁下的 revision 校验。符号链接路径、非普通文件、目标覆盖、错误关联、非法时间、过期 revision 和 ID 冲突都会拒绝。不要将源路径、密钥或真实业务数据放进公开示例。

## 记录最终状态与 attempt

从当前 `results.json` 的 `revision` 读取结果 revision。请求示例：

```json
{
  "schemaVersion": 3,
  "operationId": "CONFIG-01-final-observation",
  "expectedRevision": 0,
  "caseId": "CONFIG-01",
  "mode": "final",
  "record": {
    "status": "inconclusive",
    "observed": "合成观察：页面状态无法确定整体预期。",
    "rationale": "现有证据不足以确认已满足或违反预期。",
    "remainingQuestions": ["是否要求刷新后仍能读取？"],
    "evidenceIds": [],
    "cause": "unknown"
  }
}
```

`mode: final` 更新当前最终状态。`mode: attempt` 追加一次观察但保持当前最终状态不变。attempts 数组不含当前最终观察；包含显式 attempt 与尚未在历史中出现的旧 final 快照。相同状态如果是有意的新一次观察，使用新的 operation ID；相同请求重试必须使用原 operation ID 和原始 payload。

`pass` / `fail` 必须包含实际观察、判断理由及同一用例关联的已登记证据 ID；`inconclusive` / `blocked` 必须提供理由；`not_run` 只适用于 final。冻结基线存在未解 `clarificationQuestions` 时，final 与 attempt 都禁止 `pass` / `fail`。请求不能更改需求 basis、步骤、预期或冻结问题。

## 幂等、冲突和响应丢失

- 每个写请求有唯一 `operationId`，证据与结果操作共用此 ID 空间。
- 同一 ID 和相同 JSON 内容（对象 key 顺序不敏感）重试时返回原回执，不重复追加。
- 同一 ID 的 payload 变化会拒绝；新 ID 使用过期 revision 也会拒绝。
- helper 在读 revision 前先获取 run 级独占锁。并发写者不会自动排队。
- 若提交后响应丢失，先用 `check` 或 `progress` 查看当前状态；按原请求同 ID、同内容重试可取回原回执。不要用新 ID 重做未知结果的操作。
- 遗留锁会阻止写入；先确认没有对应运行进程，再检查锁文件。不要自动删除未知锁。

## 查进度和报告

```text
node scripts/ego.mjs progress --run-dir ABS_RUN_DIR
node scripts/ego.mjs check --run-dir ABS_RUN_DIR
node scripts/ego.mjs report --run-dir ABS_RUN_DIR
```

进度只按每个基线用例的当前 final 状态统计；历史失败不重复计入当前失败。`not_run`、`blocked`、`inconclusive` 和待澄清分别保留。`report` 不覆盖已有文件。报告是结构有效的本地记录摘要，不是独立验证的测试结论。
