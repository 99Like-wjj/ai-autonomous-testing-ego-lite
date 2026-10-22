# 隐私与发布边界 / Privacy and publication boundary

## 简体中文

仓库只包含通用 Skill、原创辅助工具、格式规范和虚构示例。
真实需求、账号说明、用例与运行结果放到仓库外，例如 `%LOCALAPPDATA%` 下的独立目录。
这种分离降低误提交概率，不等于加密或操作系统级隔离。

辅助脚本不联网、不调用模型、不读取浏览器登录信息，也不需要 API key。
但 AI 宿主和 Ego 仍有各自的数据处理方式；让模型读取资料可能涉及宿主向模型服务传输资料，
请先确认项目允许使用的环境和数据范围。

业务输入、截图、工具回执、报告和证据元数据都可能包含隐私。脚本不会自动完成可靠脱敏。
凭据应通过宿主支持的安全方式提供，不写入 Markdown、JSON 或证据描述。
分享前生成并人工检查脱敏副本，不要把原始证据直接放进仓库。

提交前检查实际文件清单和差异，运行 `npm run check:public`，并逐张查看图片。
未来公开前还需检查完整 Git 历史、提交信息、附件、发布包、CI 日志和产物。
当前检查器不扫描历史、图片像素或外部平台，不能承诺没有任何泄漏。
当前版本尚未选择开源许可证，不会自动公开或上传 npm。

哈希和格式检查只校验记录结构与部分完整性，不证明证据真实或业务结论正确。

分别保管通用仓库、私有输入和私有运行产物；真实业务资料不作为公共示例。证据 source/description 不包含签名链接或秘密。优先合成账号与数据，最小化采集，仅保留授权目的所需时长。发布前选择许可证，另行审查未来 CI、遥测、依赖与安装钩子；当前版本不注册持久服务。

## English

The repository contains only reusable instructions, original helper code,
public documentation and synthetic examples. The default helper workflow
refuses project/run directories inside its source checkout. Store real project
resources under a separate local directory, for example a dedicated directory
under `%LOCALAPPDATA%`. This separation reduces accidental commits; it is not
encryption, an ACL guarantee, or protection against another program.

The helpers use no network or model API and do not read browser profiles.
They do not need an API key. The AI host and Ego still have their own data
handling and permissions: material you ask an AI to inspect can be transmitted
by that host. Review those settings before testing sensitive applications.

### Separate three things

1. **Repository:** generic Skill, scripts, schemas and fictional `.example` data.
2. **Private project input:** requirements, cases, roles, authorized effects and
   environment references. Keep secrets in the host's supported secure storage,
   not in project Markdown or cases JSON.
3. **Private run output:** copied expectations, observations, evidence catalog,
   screenshots and reports. These may contain business or personal information.
   The helpers do not automatically redact them. Do not upload them unreviewed.
   The standalone `report.html` embeds any previewable registered screenshots,
   so a copy of that file contains the associated image bytes even without the
   run directory. Review the complete report before sharing it.

Catalog `source` and `description` fields should describe how evidence was
obtained without tokens, signed URLs, credentials, or sensitive payloads.
Record a secure credential reference, not a password. Prefer synthetic accounts
and data. Minimize collected areas. Use a sanitized copy for sharing, and retain
local originals only as long as the authorized purpose requires.

### Before any GitHub push or public release

- Review the exact tracked file list and diff, not the whole working directory.
- Run `npm run check:public` and inspect every graphic manually.
- Inspect Git history and any attachments, releases, Actions artifacts/logs or
  generated archives. This version's checker scans current allowlisted files,
  not history, image pixels or external systems.
- Ensure no original/private project data appears in filenames, metadata,
  examples, commit messages or links. Do not copy the developer's research notes.
- Choose an open-source license before public redistribution. Current package
  is deliberately private/UNLICENSED; no registry publishing is configured.
- Review future CI, telemetry, installation hooks and dependencies separately.
  This version installs no hook and registers no persistent service.

The baseline hash detects some accidental changes, not forgery. The same local
operator can edit a baseline and its manifest. A screenshot or valid schema
also does not prove a business claim. The reporter labels outcomes as recorded
operator judgments, not independently certified results.

