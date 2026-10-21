# Validation scope / 验证范围

## What this repository tests

`npm test` runs synthetic Node unit and local integration tests of the optional
file helpers. It covers normalized inputs, baseline integrity checks, result
and evidence structure, output boundaries, non-overwrite behavior and reporting.
These are software tests, not a benchmark of AI defect-finding ability.

`npm run check:public` checks the current publication file list, common secret
patterns, disallowed private artifact paths, text integrity and relative links.
It is a heuristic pre-publication aid, not a security guarantee.

## What has not been established

- No real application has been tested by this release's development process.
- No Windows + Codex + Ego end-to-end run is claimed.
- No defect-detection accuracy, false-positive rate or model-upgrade improvement
  is measured or promised.
- Node tests in Linux do not certify Windows filesystem behavior or Ego setup.
- A structurally valid report is not a verified business result.

## Safe first local trial

Use a dedicated non-production project and synthetic data. Install Ego through
its official documentation and use its installed Skill as the API authority.
Confirm the actual role, environment, permitted side effects and resource limits.
Begin with a small feature requirement or existing cases with clear expectations.
Let the AI describe inferred expectations separately. Do not use a generated
report as a release gate without reviewing its evidence and limitations.

If a submission's outcome is uncertain, inspect the actual application state
before attempting it again. If the app/build/feature is unavailable, report a
blocker rather than inventing a product defect. Keep real trial files out of Git.

## 中文

`npm test` 仅使用虚构数据测试辅助脚本的结构、路径、基线、证据引用和报告逻辑，
不是 AI 测试能力验收样本集，也不衡量真实缺陷发现率。
Linux 下测试通过不等于 Windows、Codex 与 Ego 的整条链路已验证。

首轮本地试用请使用非生产环境和合成数据，按 Ego 官方文档安装，并核对实际账号角色。
可以从一项新功能需求或已有用例开始。明确预期和模型推断要分开，证据不足不能默认通过。
遇到提交结果不明先对账，功能未部署或环境不可用应记录阻塞。
真实用例、截图、日志和报告不要提交到 GitHub。

Exact automated check results for the delivered revision are listed in
[the changelog](../CHANGELOG.md). / 实际交付版本的检查结果见更新记录。

## Development verification snapshot — 2026-10-21

| Check | Result | Limit |
| --- | --- | --- |
| Node helper + publication-checker tests | 67 passed, 0 failed, 0 skipped | Linux / Node v24.19.0, synthetic inputs only |
| Generated cases, manifest, results, evidence and report schemas | Valid with Draft 2020-12, local references and format checks | Schema conformance, not business truth |
| Skill metadata and isolated-copy links | Passed | Does not measure model behavior |
| Eight bilingual original PNG diagrams | Visually reviewed | Illustrations, not product execution evidence |
| Publication file scan | Passed | Current allowlisted tree, heuristic patterns; manual review still required |
| Windows + Codex + Ego + real application | Not run | User pilot remains necessary |

开发验证采用合成数据。上述检查不包括真实业务系统、模型效果基准或 Windows 实机链路。
