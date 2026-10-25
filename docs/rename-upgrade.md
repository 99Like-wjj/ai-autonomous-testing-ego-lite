# v0.1.5 名称变更与升级 / Naming and upgrade

此变更属于 **0.1.5 / branding-rename-1**，正式包中的软件与 Skill 版本统一为 0.1.5；版本号收尾不增加业务验收范围。资源澄清能力沿用 resource-clarification-3；数据格式、Ego 命令/API 与官方 ego-browser Skill 不变。

## 名称对应

| 位置 | 新值 |
| --- | --- |
| GitHub 仓库、package name | ai-autonomous-testing-ego-lite |
| Skill frontmatter name、源码目录、安装目录 | ai-autonomous-testing-ego-lite |
| 显式调用 | `$ai-autonomous-testing-ego-lite` |
| Codex 展示名 | AI 自主自动化测试 · Ego Lite |
| README 中文标题 | 基于 Ego Lite 的 AI 自主测试 Skill（保持不变） |

旧仓库名为 ego-lite-test-skill，旧 Skill 名为 ego-lite-test。新仓库为 [ai-autonomous-testing-ego-lite](https://github.com/99Like-wjj/ai-autonomous-testing-ego-lite)。原仓库更名，不另建项目；不要重新占用旧仓库名，以免影响旧链接重定向。历史 Tag、Release、已发布安装包和已生成报告不改写。

## 现有源码目录

保留现有本地源码目录及工作分支，无需重新 clone 或重命名本地文件夹。在确认的原仓库中更新 remote，然后 fetch 并检查差异；有未提交或未推送工作时先协调，不 reset、强推、覆盖或自动 stash。

```sh
git remote set-url origin https://github.com/99Like-wjj/ai-autonomous-testing-ego-lite.git
git fetch origin
git status --short --branch
```

只在工作区安全且核对当前分支后快进到对应远端分支；不要把这一步当作合并 main 或发布授权。

## 安装与发现

1. 从当前源码构建完整的仓库外目录包，目录名使用 ai-autonomous-testing-ego-lite。不能只复制源码 Skill 说明子目录。包必须包含 agents/openai.yaml、references、scripts、schemas、运行依赖资源与 runtime-manifest.json。
2. 在独立包运行 `node ABS_PACKAGE/scripts/ego.mjs tool-info --expect-version 0.1.5 --expect-revision branding-rename-1`，确认 name 为 ai-autonomous-testing-ego-lite、installationIntegrity 为 verified，并检查实际路径。
3. 更新用户安装须单独获得授权。先检查实际使用的 Skill 搜索路径（包括项目级和用户级）以及旧 ego-lite-test 与新目录是否存在，比较已知文件哈希，保护不明修改、报告和证据。新目录已存在时先比对，不直接覆盖。
4. 迁移已确认的旧安装到同一 Skill 根下的新目录，并更新为完整新包；校验新入口后再完成旧入口退役。不要长期留下两个可被发现的同功能入口，不自动创建旧版备份或删除不明内容。无法安全完成时保留现状并报告，不静默加载旧版。
5. 在新的 Codex 会话检查展示名及 `$ai-autonomous-testing-ego-lite`，再从实际加载的 SKILL.md 目录运行 tool-info。旧调用名不作为兼容别名保留；官方 `$ego-browser` 仍按既有方式使用。

旧运行及报告仍保留原数据格式和历史 tool identity，不全局替换其中的名字、路径、hash 或 revision。package 中 egoLiteTest 元数据键以及内部 CLI 文件名 scripts/ego.mjs 保留，避免把品牌更名扩大为无关格式迁移。

## English summary

The repository, package and Skill identifier are now **ai-autonomous-testing-ego-lite**. Invoke `$ai-autonomous-testing-ego-lite`; Codex displays **AI 自主自动化测试 · Ego Lite**. The Chinese README heading stays unchanged. Update the remote in the existing checkout; do not clone a second local version or reset local work. Build and verify the full standalone package, including agents/openai.yaml. User-level installation migration requires separate authorization and checks for unknown changes and duplicate discoverable entries. Historical releases, reports, hashes, JSON formats and the official Ego API/Skill remain unchanged. The formal package reports version 0.1.5, without a dev suffix; the naming and version update does not add live-business acceptance evidence.
