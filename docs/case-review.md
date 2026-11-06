# 用例审阅与离线评审导出

直接打开 `cases render` 生成的本地 HTML，即可浏览场景、逐条填写意见、核对范围并导出评审结果。页面不连接服务器，不需要命令行或其他进程保持运行。当前用例和反馈仍为 v9；用例文档模型仍为 documentVersion 2。

## 导出与恢复

无需修改时点击“评审通过”：目录、正文和本条评审区显示绿色勾选，收起本条编辑区，总体意见保留。“继续评审”重新打开编辑区并恢复待评审。本条已有意见时，先确认是否清空本条再通过；取消保留原文，总体意见不受影响。

点击“导出评审结果”检查总体意见与逐条修改意见。只导出有修改意见的用例，不附带通过标记、通过用例编号或未填意见的用例；只有总体意见也可导出。全部无意见时不生成空文件。有意见的点不在范围内时，须明确纳入后再导出，不会被静默丢弃。评审通过标记暂存于当前浏览器，不作为发给AI的修改建议或正式执行授权。

上一/下一只遍历当前目录筛选的结果，到边界禁用，不首尾循环。首次进入用例定位到工作区，回到已访问用例恢复其阅读位置；重复激活当前评审页不回顶。浏览器前进/后退按对应历史条目恢复整页、目录、意见区及正文展开状态；保存意见、更新导出范围或关闭导出窗口不重建无关正文。本轮不增加刷新后的阅读位置持久化。

默认导出一份可独立阅读并恢复意见的 HTML，正文包含项目、版本、范围和完整意见，唯一的 `review-feedback-data` 惰性 JSON 区保存相同的结构化反馈。可选导出独立 JSON 或复制完整数据。导出文件不登记正式人工确认，不启动测试。

浏览器支持文件选择器时，由用户选择位置，写入关闭后读回逐字节核对。取消不触发其他导出；失败保留草稿并提供下载该次快照的操作。也可从“更多导出方式与完整数据”直接下载。下载只回报“已发起下载”，实际落盘和 Windows 打开情况需另行验证；文件选择器同样不能保证绕过宿主或操作系统安全策略。

保存期间的新编辑不会变成已保存内容，页面会提示该文件对应点击时的快照。默认建议独立新文件名；旧用例、意见和历史文件不因生成新文档被覆盖。

“恢复评审记录”接受同版本 HTML/JSON，检查项目、版本、指纹、编号及范围。它只提取并解析惰性数据，不执行导入文件中的脚本或加载资源；已有不同意见保留并报告冲突。

浏览器草稿仅属于当前入口和当前浏览器。切换页面、浏览器或重生成文档前保管完整反馈，不保证自动继承存储。浏览器无法暂存或复制时，仍可导出，或从完整数据文本框手动选中复制。

## 可选 CLI

```powershell
node <ToolRoot>/scripts/ego.mjs cases render --cases <ABS_CASES> --output-dir <NEW_DOCUMENTS>
node <ToolRoot>/scripts/ego.mjs cases export-review --cases <ABS_CASES> --request <FEEDBACK_JSON_OR_HTML> --output-dir <REVIEW_FILES>
```

`cases export-review` 是 AI 收到反馈文件后的可选文件事务，不是页面导出的前提。它校验输入后另存 HTML/JSON 和交付清单，核对重复内容且不覆盖历史；不调用 Windows 关联程序、不修改输入标记，不登记正式确认。审阅 HTTP 服务和 `cases serve` 已从当前版本移除。

原用例指纹及正式审阅规则不变。实际收到的意见或确认仍需当前对话核对来源，再用 `cases review` 登记；文件内的 approved 只是拟提交结论。

## English summary

The generated local HTML provides the complete offline review/export/restore workflow without a server. Export readable HTML with embedded v9 feedback, optional JSON or complete copied data. Supported file-picker saves are closed and read back; explicit downloads only report a download request. Cancellation and errors retain drafts. Verify actual files and Windows opening separately for each host. Imports validate exact case identity and preserve conflicting drafts. The optional cases export-review CLI is not a page dependency. Exporting never authenticates human approval or starts testing; historical files and Windows metadata remain intact.
