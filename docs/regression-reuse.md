# 用例版本与回归复用（0.1.8）

当前正式版本格式：主契约 v9、regressionVersion 2、networkVersion 1。完整方法与命令见Skill 的 references/regression-reuse.md 与 references/local-toolbox.md。

资料只有 cases/ 用例整份版本、相邻审阅记录及 runs/ 历次运行。定义不变不增版本，普通复测只增运行。规则属于用例依据，任务属于场景计划，问题属于原运行，不建通用项目资产库。

points 保留指定点和必要依赖；status 命中整条场景；full 保留全部在期点和来源缺口。未选点无本次结果，缺评估是记录缺口，准备步骤不扩张判断范围。

串行 record 与 worker packet 使用同一事实和范围校验。父运行显式关联精确结果；历史附件保留原来源，状态变化、原问题、可比性和修复归因分开。本轮证据严格校验，历史缺失显示局限，auto 按需交付附件包。

0.1.7 规则/任务样例属于旧格式历史参考；新版输入以[当前契约](asset-formats.md)为准。格式变化不授权迁移或删除用户资料。
