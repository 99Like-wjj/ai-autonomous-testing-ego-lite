# Security and privacy / 安全与隐私

This is an independently maintained Skill under continuous optimization, with local data/report tools and optional scoped native network observation.
It is not a browser sandbox, credential manager, or security certification.

- Never commit real requirements containing private information, accounts,
  credentials, browser profiles, cookies, auth headers, screenshots, traces or
  test results. Keep project resources and runs outside this repository.
- Do not post sensitive reports in issues, pull requests or discussions. Use
  GitHub's private vulnerability reporting if the owner has enabled it;
  otherwise contact the maintainer through an already-established private
  channel. No reporting address or private reporting availability is implied.
- Do not include working secrets in a reproduction. Rotate/revoke exposed
  credentials first. Removing a file from the latest commit does not remove
  it from Git history, forks, caches, CI logs or downloaded archives.
- A private repository is not a secret store. Ignore rules and the publication
  checker are defense-in-depth, not a complete secret-detection system.
- Skill instructions guide behavior; enforce access through the real browser,
  account, OS and tool permissions. A helper cannot constrain actions that
  bypass it. Do not run against production without explicit scoped authority.

本项目已提供正式版本，但仍在持续优化，不构成生产可靠性或安全认证。项目私有输入、浏览器状态和真实运行证据必须保存在仓库之外。
不要把 token、key、账号、Cookie、请求头或带隐私的截图发到公开 Issue。
私有仓库也不是密钥库；忽略规则和扫描不保证发现所有泄漏。
若泄漏已经发生，应撤销或轮换凭据，并审查历史及发布产物，而不只是删除当前文件。
Skill 不是安全沙箱，真实权限由运行环境承担。

See [privacy guidance](docs/privacy.md) and [validation scope](docs/testing.md).
