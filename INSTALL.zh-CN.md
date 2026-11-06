# Skill 安装与更新

适用于 `ai-testing-ego-lite` 的完整编译安装包。具体版本、revision、环境要求、格式变化和验证范围，以该次 GitHub Release 说明及包内 `package.json` 为准。本说明不表示当前开发分支已经正式发布。

## 安装前准备

- 从项目的 [GitHub Releases](https://github.com/99Like-wjj/ai-testing-ego-lite/releases) 下载对应版本的完整 Skill ZIP 和 `SHA256SUMS`。自动生成的 **Source code ZIP 不是编译安装包**。
- 按所选版本要求准备 Node.js、Ego 和官方 ego-browser Skill。它们不由本安装包自动安装或替换。
- 在 PowerShell 中对实际下载文件运行 `Get-FileHash <ZIP路径> -Algorithm SHA256`，将结果与同次 Release 的 `SHA256SUMS` 比较；不一致时停止安装。
- 解压到独立临时目录，保留完整的 `ai-testing-ego-lite` 文件夹，不能只复制 `SKILL.md`。

## 首次安装

1. 确认客户端实际使用的 Skill 目录。Codex 常见用户目录是 `$env:USERPROFILE\.codex\skills`；若配置了 `CODEX_HOME`，以实际配置为准。也要检查项目级或其他已注册的同名 Skill，避免重复加载。不要仅凭源码仓库路径推断安装位置。
2. 先在解压的 Skill 根目录验证版本和完整性。将下面命令中的占位符替换成该次 Release 公布的版本和 revision：

   ```powershell
   node .\scripts\ego.mjs tool-info --expect-version <版本> --expect-revision <revision>
   ```

   核对 `toolRoot`、版本与 `installationIntegrity`。若不一致或校验失败，停止并检查，不修改 manifest 来绕过校验。
3. 确认目标没有同名旧安装后，将完整 Skill 文件夹放入客户端的 Skill 目录；有旧安装时，执行下面的更新流程。
4. 从**实际安装根目录**再次运行上述命令。开启新客户端会话，确认实际加载目录，并调用 `$ai-testing-ego-lite` 验证入口可用。

## 从旧版更新

### 0.2.1 名称替换

仓库、包名和新 Skill 目录已统一为 `ai-testing-ego-lite`；下载附件为 `ai-testing-ego-lite-0.2.1.zip`，版本为 `0.2.1`，revision 为 `attachments-review-2`。旧 `ai-autonomous-testing-ego-lite` 名称不提供调用兼容入口。中文展示名为“AI 自动化测试 · Ego Lite”。

先校验并试运行完整新包，再在获得本机安装/清理授权后将已核实的旧 Skill 退出扫描范围，保护用户修改和真实资产；新会话确认实际加载 `$ai-testing-ego-lite`。发布动作本身不会操作已安装目录，也不会删除历史报告或旧 Release 附件。新 CLI 摘要/record 响应与 deliveryVersion 2 需要调用方同步，不能把新输出直接当作旧结构处理。

目前没有内置自动更新器。GitHub 发版、源码目录 `git pull`、`npm run build` 或构建独立安装目录，都不会自动更新客户端已经安装的 Skill。

1. 先核验新包，在独立目录解压并完成上面的版本和完整性检查，暂不覆盖旧安装。
2. 结束正在使用旧 Skill 的测试任务，确认客户端实际加载的旧安装路径，避免更新错目录。
3. 检查旧安装的 `runtime-manifest.json` 和实际文件哈希，区分：旧包原文件、用户改过的文件、未知文件，以及真实用例、运行记录、截图、报告和证据。后几类需要逐项确认并保留，不能直接按“旧版本文件”删除。用户定制内容不能不经审查原样覆盖到新版代码或指南中。
4. **使用干净的新版完整目录，不叠加覆盖旧目录。** 确认上述数据和修改已妥善保留后，将旧安装移出客户端扫描的 Skill 目录，再放入新目录。需暂留旧版时放在扫描目录外，不在其中简单改名为 backup 后继续保留。清理旧副本需要另行确认，不自动删除。
5. 枚举新版实际文件并与新版 manifest 的文件列表比较（加上 manifest 自身），确认没有旧设计文档等多余文件。`tool-info` 的完整性通过不能单独证明没有额外残留。
6. 从最终安装目录重新验证版本、revision、完整性和加载路径，开新会话确认新版生效。不要复用仍加载旧 Skill 的会话作为更新成功的依据。

如果无法确认某个文件是否为用户数据，先停下清理并询问。不要将“升级”解释为删除真实运行、历史报告、截图和来源文件的授权。版本切换不会自动迁移业务数据；按该次 Release 的格式说明处理，不能只修改数据中的版本数字。

## 旧版设计文档与故障处理

- 不要为精简目录而直接手删正在使用的旧版文件。旧 manifest 仍可能要求这些文档，手删会导致完整性校验失败。应安装按新白名单构建的完整新版。
- 若校验失败、客户端仍加载旧路径或存在多个同名 Skill，先停止使用并检查路径、文件差异与会话状态，不盲目反复覆盖。
- 若需要退回旧版，先确认业务数据格式是否支持，再使用已保留的完整旧版安装；恢复旧程序不会把新版数据自动变成旧格式。
- 运行依赖、宿主权限和真实业务环境仍需分别验证。文件哈希和工程测试不能证明所有业务场景都通过。
