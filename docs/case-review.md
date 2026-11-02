# 用例审阅与本机意见保存

本指南说明用例审阅的展示和文件保存；用例、运行和实际审阅主契约仍为v9，不重写既有用例版本、意见、运行、报告或证据。

## 总览和逐条评审

HTML先列出当前版本的全部场景。点击场景展开用例，点击具体用例进入左侧目录、中央正文、右侧意见栏的工作台。返回总览保留搜索、展开和滚动位置。场景、用例、规则待确认、计划缺口和已有意见分别展示，不把计划准备或意见数量当作测试通过。

必要引用解析为可读的前提、必经路径和步骤，保留显式依赖；界面固定文案跟随所选展示语言，原始事实与证据不翻译或改写；原编号、原始引用、完整计划及来源指纹在折叠区保留。背景复用报告的8种主题。页面不修改业务目标或实际结果。

## 先交付文档，再提供本机审阅入口

```powershell
node <ToolRoot>/scripts/ego.mjs cases render --cases <ABS_CASES> --output-dir <NEW_DOCUMENTS>
node <ToolRoot>/scripts/ego.mjs cases serve --cases <ABS_CASES> --output-dir <REVIEW_FILES>
```

AI用Ego打开serve返回的实际URL，不猜路径，不接管其他任务Space。本机入口只绑定127.0.0.1和系统分配端口，使用随机会话路径；URL是私有能力地址，不公开。输出目录由命令显式指定且必须在源码仓库外。默认空闲480分钟结束，可用 `--idle-minutes` 设置1至1440分钟。

页面“保存到本机文件”把意见提交给该本机入口，工具核对用例版本、指纹、编号和范围，再以原生文件写入新HTML、JSON和交付清单，读回后才回报成功。请求不能另行指定任意文件或输出目录；来源、Host和会话路径必须匹配，跨来源请求被拒绝。服务不读取意见数据里声明的任意source.file。

重复内容按完整请求指纹核对已有文件，不覆盖历史，不产生另一个正式审阅。不同内容生成新文件，已有文件损坏则拒绝冒充成功。保存结果不明时保留浏览器草稿；再次显式保存会核对同一内容的已有文件。

## Windows文件限制的处理范围

浏览器从本地HTML发起的Blob下载可能附带Windows区域标记，导致JSON虽可解析却被系统阻止双击打开。把扩展名改为HTML不是可靠修复。

主保存改由本地工具新建文件，不经过浏览器下载标记路径，不调整Windows安全设置，也不移除旧文件的Zone.Identifier。JSON和可读HTML保留同一份意见内容；可读HTML内嵌可恢复的v9意见数据。

已有意见可直接用原生写入器保存：

```powershell
node <ToolRoot>/scripts/ego.mjs cases export-review --cases <ABS_CASES> --request <FEEDBACK_JSON_OR_HTML> --output-dir <REVIEW_FILES>
```

该命令把输入作为有大小限制的数据读取，不启动其Windows关联程序。它不解除原文件标记、不修改原文件、不登记正式确认。

独立离线HTML仍可阅读、暂存和恢复意见。离线副本没有本机写入权限，可复制意见交回当前对话，或选择兼容JSON备份再由本地工具保存。兼容浏览器下载仍可能带区域标记，不当作原生保存成功的证明。

## 意见和正式确认分开

输入按当前用例暂存到当前浏览器。导出前检查所有意见：无范围或无意见时提示补充；有意见的用例不在范围内时必须明确纳入，不能静默过滤。导入JSON/可读HTML会核对项目、版本、用例指纹和编号，已有不同意见保持当前内容。HTML只提取惰性JSON，不把导入文件放进DOM，不加载其中资源。

浏览器草稿属于当前入口和浏览器存储。换浏览器或本机会话重新分配地址后，应从已保存文件恢复，不能承诺自动继承另一个入口的存储。

`cases render` 和 `cases serve` 可带 `--feedback <ABS_JSON_OR_HTML>` 载入已有意见副本。HTML/Markdown内部文档模型为documentVersion 2，原始用例仍是原v9及原字节指纹；新文档写入新目录，不原地升级旧HTML。导出副本的拟提交approved仍是反馈意图，实际人工确认必须由当前对话核对来源，再通过既有cases review登记。

## English summary

The reader now opens with an expandable scene/case overview and a three-column review workbench. Shared report themes and resolved human-readable plan references are presentation only.

`cases serve` supplies a private, capability-scoped IPv4 loopback page. Native saves validate feedback and create verified HTML/JSON files in the CLI-selected directory. `cases export-review` uses the same writer for received JSON or readable HTML. Neither command authenticates a reviewer, registers approval, starts tests, changes Windows security settings or alters historical files. Browser-managed backup downloads may still carry zone metadata; use the native writer for directly usable files. Offline HTML remains usable for reading and browser drafts. Saved feedback restores opinions after changing browsers or session URLs. Case data remains v9; documentVersion 2 identifies the new presentation model.
