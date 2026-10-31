/** Original diagrams, generated with TypeScript. No external images/fonts/network. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
const C: Record<string, string> = {"bg": "#080e20", "panel": "#101b32", "line": "#293957", "text": "#f1f5ff", "muted": "#9cacc8", "cyan": "#61e6ed", "violet": "#ae91ff"};
function pick<T>(values: readonly T[], index: number): T { const value = values[index]; if (value === undefined) throw new Error('Missing diagram label.'); return value; }
function escapeXml(value: string): string { return value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;'} as Record<string,string>)[c] ?? c); }
function text(x: number, y: number, s: string, size = 24, color = 'text', weight = 400): string { return `<text x="${x}" y="${y}" font-size="${size}" fill="${(C[color] ?? color)}" font-weight="${weight}">${escapeXml(s)}</text>`; }
function rect(x: number, y: number, w: number, h: number, fill = 'panel', stroke = 'line', r = 18): string { return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${(C[fill] ?? fill)}" stroke="${(C[stroke] ?? stroke)}"/>`; }
function line(x1: number, y1: number, x2: number, y2: number, color = 'cyan'): string { return `<path d="M${x1},${y1} L${x2},${y2}" stroke="${(C[color] ?? color)}" stroke-width="2" fill="none" marker-end="url(#arrow)"/>`; }
function start(title: string, h = 600, w = 1200): string[] { return [`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeXml(title)}"><title>${escapeXml(title)}</title><defs><linearGradient id="g"><stop stop-color="#61e6ed"/><stop offset="1" stop-color="#ae91ff"/></linearGradient><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#61e6ed"/></marker></defs><g font-family="DejaVu Sans, Noto Sans CJK SC, sans-serif">`, rect(0, 0, w, h, "bg", "bg", 0), `<path d="M0,2 H${w}" stroke="url(#g)" stroke-width="4"/>`]; }
async function save(outputDir: string, name: string, parts: readonly string[], png: boolean) {
  const svg = path.join(outputDir, name + '.svg');
  await fs.writeFile(svg, parts.join('') + '</g></svg>', { flag: 'wx' });
  if (png) await exec('inkscape', [svg, '--export-type=png', '--export-filename=' + path.join(outputDir, name + '.png')], { windowsHide: true });
}
/** README-only rolling window. Full history illustrations and documents are untouched. */
export function readmeVersionWindow<T>(versions: readonly T[]): T[] { return versions.slice(-4); }
export async function generateImages(outputDir: string) {
  if (!path.isAbsolute(outputDir)) throw new Error('Use an absolute new output directory. Existing illustrations are never overwritten.');
  let cursor = path.parse(outputDir).root;
  for (const part of outputDir.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    try { if ((await fs.lstat(cursor)).isSymbolicLink()) throw new Error('Symlink output refused.'); }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
  }
  await fs.mkdir(outputDir);
  let png = false;
  try { await exec('inkscape', ['--version'], { windowsHide: true }); png = true; }
  catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
  for (const zh of [false, true]) {
    const suffix = (zh ? ".zh-CN" : "");
    const t = (en: string, cn: string): string => zh ? cn : en;
    let p = start(t("AI Autonomous Testing · Ego Lite", "AI 自主自动化测试 · Ego Lite"), 540);
    p.push(...[text(54, 64, t("AI AUTONOMOUS TESTING / EGO LITE", "AI 自主自动化测试 / EGO LITE"), 19, "cyan", 700), text(54, 136, t("Test. Review. Reuse.", "从首次测试，"), 48, "text", 700), text(54, 198, t("Let AI choose the method.", "到有依据的回归。"), 48, "text", 700), text(56, 246, t("New features and regression. Fixed goals, adaptive AI execution.", "AI 自主规划与执行，保留规则、事实和每轮证据"), 20, "muted")]);
    p.push(...[rect(56, 294, 1088, 150), text(82, 332, t("01  PREPARE", "01  准备测试依据"), 16, "cyan", 700), text(82, 370, t("Goals + acceptance", "目标与验收条件"), 23), text(82, 403, t("Requirements and cases", "需求、业务规则与用例"), 17, "muted"), text(455, 332, t("02  EXPLORE", "02  AI 自主执行"), 16, "violet", 700), text(455, 370, t("Plan → explore → test", "规划 → 探索 → 测试"), 23), text(455, 403, t("Current AI session + Ego", "当前 AI 会话 + Ego"), 17, "muted"), text(835, 332, t("03  REVIEW + REUSE", "03  审阅与复用"), 16, "cyan", 700), text(835, 370, t("Evidence + regression", "证据与回归资料"), 23), text(835, 403, t("New run, fresh evidence", "独立新运行，重新核验"), 17, "muted"), line(355, 370, 420, 370), line(735, 370, 800, 370), text(56, 498, t("0.1.7-rc.1  /  REVIEW CANDIDATE · NOT RELEASED", "版本 0.1.7-rc.1  /  待人工审阅，尚未发布"), 16, "muted")]);
    await save(outputDir, ("hero" + suffix), p, png);
    p = start(t("Who owns what?", "谁负责什么？"), 650);
    p.push(...[text(50, 65, t("AI decides. Ego operates. Tools keep records.", "AI 做判断，Ego 做操作，工具管记录。"), 35, "text", 700), text(50, 103, t("Use the current AI session and Ego. No extra model API service.", "复用当前 AI 会话和 Ego 浏览器，不另建模型 API 服务。"), 20, "muted")]);
    const cards: [number, string, string, string[], string][] = [[430, "02", t("Current AI session", "当前 AI 会话"), [t("Interprets the requirement", "理解测试需求"), t("Plans and adapts tests", "规划测试并调整操作"), t("Evaluates evidence", "判断证据是否充分")], "cyan"], [50, "01", t("Our Skill + test inputs", "本项目 Skill + 测试资料"), [t("Boundaries and acceptance", "授权边界与验收条件"), t("Requirements, rules, cases", "需求、业务规则与用例"), t("Task/rule revisions + guidance", "任务 / 规则修订与流程指南")], "violet"], [810, "03", t("Ego native tools", "Ego 原生浏览器能力"), [t("Reads the current page", "读取当前页面"), t("Performs browser actions", "执行浏览器操作"), t("Returns page state", "返回页面信息与截图")], "cyan"]];
    for (const [x, n, head, rows, col] of cards) {
      p.push(...[rect(x, 150, 340, 268), text((x + 24), 192, n, 20, col, 700), text((x + 24), 236, head, 22, "text", 700)]);
      p.push(...rows.map((r, i) => text((x + 24), (284 + (i * 38)), r, 19, "muted")));
    }
    p.push(...[line(390, 276, 428, 276), line(770, 260, 808, 260), line(808, 302, 770, 302), text(78, 444, t("Supplies rules and goals →", "提供规则与测试目标 →"), 16, "violet"), text(454, 444, t("Choose actions ↔ inspect results", "选择操作 ↔ 读取结果"), 16, "cyan"), rect(50, 462, 1100, 130), text(78, 503, t("Local tools: evidence, task revisions, comparisons and reports.", "工具箱：证据与事实、回归资料、比较及报告。"), 23, "cyan", 700), text(78, 543, t("File checks do not decide whether a business feature is correct.", "工具校验文件和记录，不替 AI 判定业务是否正确。"), 21), text(78, 574, t("A successful click is not proof that the requirement was met.", "操作成功不等于测试通过，仍需对照预期核验结果。"), 18, "muted")]);
    await save(outputDir, ("architecture" + suffix), p, png);
    p = start(t("Adaptive test workflow", "自适应测试流程"), 1000);
    p.push(...[text(50, 65, t("Stable goals. Flexible execution.", "目标和规则不变，操作方法灵活调整。"), 34, "text", 700), text(50, 103, t("Two input sources. One case format. New features and regression.", "两种用例来源，一套格式；共同用于新功能与回归验证。"), 20, "muted")]);
    p.push(...[rect(50, 130, 535, 84), text(70, 162, t("External cases → validate format", "接收已有用例 → 校验格式"), 21, "cyan", 700), text(70, 193, t("Business steps + source-backed goals", "业务步骤 + 有依据的独立目标"), 17, "muted"), rect(615, 130, 535, 84), text(635, 162, t("AI drafts cases → validate format", "AI 根据需求生成用例 → 校验格式"), 21, "violet", 700), text(635, 193, t("Business steps, not invented buttons", "描述业务步骤，不编造按钮和页面细节"), 17, "muted"), "<g transform=\"translate(0 120)\">"]);
    const heads = [t("Observe", "观察"), t("Decide", "判断"), t("Act", "行动"), t("Verify", "验证")];
    const subs = [t("Read current state", "读取当前状态"), t("Choose next step", "选择下一步"), t("Use native Ego", "使用 Ego 原生操作"), t("Compare with criteria", "对照验收条件")];
    for (let i = 0; i < 4; i++) {
      const x = (50 + (i * 285));
      p.push(...[rect(x, 160, 245, 160), text((x + 24), 201, ("0" + String((i + 1))), 17, "cyan"), text((x + 24), 244, pick(heads, i), 30, "text", 700), text((x + 24), 285, pick(subs, i), 18, "muted")]);
      if (i < 3) {
        p.push(...[line((x + 247), 240, (x + 282), 240)]);
      }
    }
    p.push(...["<path d=\"M1027,324 V368 H173 V324\" fill=\"none\" stroke=\"#ae91ff\" stroke-width=\"2\"/>", text(345, 400, t("AI may gather more evidence or report uncertainty.", "证据不足时，由 AI 决定补充验证或说明无法判断。"), 21, "violet")]);
    p.push(...[rect(50, 443, 1100, 172), text(78, 484, t("Account for every test goal", "每个测试目标，都要有交代"), 24, "cyan", 700), text(78, 524, t("Separate verified, violation, inconclusive and not tested.", "分别说明已验证、发现违反、无法判断和未测试。"), 20), text(78, 558, t("Clarify missing accounts, data or permission; independent goals may continue.", "缺少账号、数据或授权，主动澄清；独立目标可继续。"), 18, "muted"), text(78, 590, t("Verify supplied resources before resuming; keep acceptance questions separate.", "补充后核验再恢复；验收和资源问题分别处理。"), 18, "muted")]);
    p.push(...["</g>"]);
    p.push(rect(50, 770, 1100, 165, 'panel', 'violet'));
    p.push(text(78, 807, t('Reuse facts, never freeze defects as expectations.', '复用事实，不把缺陷固化成正确预期。'), 25, 'violet', 700));
    p.push(text(78, 847, t('Status selection → whole scenarios  |  Full → declared complete set', '按历史状态选整条场景  |  全量选择明确测试集，保留受阻与缺口'), 22));
    p.push(text(78, 883, t('Verify current conditions → new run → fresh evidence → compare', '核验本轮条件与授权 → 独立新运行 → 新证据 → 有依据地比较'), 21, 'muted'));
    p.push(text(78, 915, t('AI chooses actions. Unknown side effects are not automatically replayed.', 'AI 自主选择方法；未知副作用先核对，不自动重放。'), 19, 'muted'));
    p.push(text(50, 974, t('0.1.7-rc.1 / Capability guide, not a mandatory execution sequence.', '0.1.7-rc.1 / 能力示意，非强制执行顺序。'), 17, 'muted'));
    await save(outputDir, ("workflow" + suffix), p, png);
    p = start(t('Scheme B report reading — illustration', '方案 B 报告阅读 — 能力示意'), 760);
    p.push(text(50, 52, t('0.1.7-rc.1 / SCHEMATIC, NOT A REAL REPORT SCREENSHOT', '0.1.7-rc.1 / 布局示意，非真实报告截图'), 18, 'violet', 700));
    p.push(text(50, 103, t('Start with the issue. Read steps beside evidence.', '先看问题与预期，再对照实际步骤和证据。'), 32, 'text', 700));
    p.push(rect(50, 134, 1100, 120));
    p.push(text(76, 174, t('Issue: a result belongs to another category.', '问题：筛选结果中出现了其他分类的商品。'), 25, 'text', 700));
    p.push(text(76, 215, t('Expected: all visible results match the selected category.', '原预期：当前可见商品均属于所选分类。'), 21, 'muted'));
    p.push(rect(50, 278, 530, 280), rect(602, 278, 548, 280));
    p.push(text(76, 318, t('ACTUAL STEPS / ONE SELECTED GOAL', '实际步骤 / 当前选中目标'), 20, 'cyan', 700));
    p.push(text(76, 364, t('1. Select category A.', '1. 选择分类 A。'), 23));
    p.push(rect(70, 385, 490, 85, 'bg', 'violet'));
    p.push(text(88, 419, t('2. Inspect visible results.', '2. 读取当前结果。'), 23, 'violet', 700));
    p.push(text(88, 451, t('One item is category B.', '发现一条分类 B 的商品。'), 20));
    p.push(text(76, 514, t('No plan is invented as an actual step.', '不把计划步骤补成实际经过。'), 19, 'muted'));
    p.push(text(628, 318, t('EVIDENCE FOR THE SELECTED STEP', '所选步骤的证据'), 20, 'cyan', 700));
    p.push(rect(628, 342, 496, 128, 'bg'));
    p.push(text(650, 388, t('Page capture / supporting text', '页面截图 / 支持材料'), 23));
    p.push(text(650, 428, t('Illustrative placeholder — not evidence', '示意占位，不是真实证据'), 20, 'muted'));
    p.push(text(628, 514, t('Shared material and gaps stay explicit.', '共享资料、关联范围及缺口明确说明。'), 19, 'muted'));
    p.push(rect(50, 582, 1100, 104));
    p.push(text(76, 622, t('Scope disclosures ▸ task/rule details ▸ original records and history', '范围说明 ▸ 任务 / 规则明细 ▸ 原始记录与历史'), 22, 'cyan'));
    p.push(text(76, 660, t('Reader notes organize sourced facts; they never rewrite business outcomes.', '阅读整理仅组织有来源的事实，不改写业务四态。'), 20, 'muted'));
    p.push(text(50, 733, t('Synthetic illustration only. No real product execution or benchmark is claimed.', '纯合成示意；不代表真实产品执行、缺陷或基准测试。'), 18, 'muted'));
    await save(outputDir, ("result-specimen" + suffix), p, png);
    p = start(t("Configurable parallel testing", "可配置的并行测试"), 580);
    p.push(text(50, 62, t("AI coordinates. Workers deliver evidence.", "AI 自主协调，分例执行，证据汇总。"), 34, "text", 700));
    p.push(text(50, 104, t("Default: one case at a time. Parallelism requires explicit configuration.", "默认逐条执行；用户明确配置后，AI 按独立性与资源条件安排并发。"), 20, "muted"));
    const labels = [t("Coordinator AI", "协调 AI"), t("Case workers + Ego", "用例 worker + Ego"), t("Review + report", "复核与报告")];
    const rows = [
      [t("Goals and user limits", "目标与用户并发上限"), t("Judge independence", "判断独立性与共享状态"), t("Reserve resources", "登记名额与资源关联")],
      [t("One Space per case", "单用例关联一个 Space"), t("Record deviations", "保留偏差、错误与证据"), t("Seal evidence packets", "封存各自的交付包")],
      [t("AI reviews evidence", "AI 按目标复核证据"), t("Serial data imports", "串行导入公共记录"), t("HTML / JSON / Markdown", "HTML / JSON / Markdown")]
    ];
    for (let i = 0; i < 3; i++) {
      const x = 50 + i * 380;
      p.push(rect(x, 160, 340, 240), text(x + 22, 206, pick(labels, i), 23, i === 1 ? "violet" : "cyan", 700));
      pick(rows, i).forEach((row, j) => p.push(text(x + 22, 259 + j * 43, row, 19)));
      if (i < 2) p.push(line(x + 343, 282, x + 378, 282));
    }
    p.push(text(50, 454, t("Toolbox records state; it does not schedule business actions or decide bugs.", "工具记录状态与文件，不替 AI 调度业务动作或判断缺陷。"), 20, "cyan"));
    p.push(text(50, 498, t("Spaces do not guarantee separate accounts or backend data.", "Space 不等于账号隔离或后端数据隔离；并发上限不保证跑满。"), 19, "muted"));
    p.push(text(50, 542, t("0.1.7-rc.1  /  Retained concurrency model · Illustration only", "0.1.7-rc.1  /  沿用并发模型；能力示意，非实测证据"), 16, "muted"));
    await save(outputDir, ("parallel" + suffix), p, png);

    p = start(t("Version history — capability illustration", "版本演变 — 能力示意，非测试截图"), 1110, 840);
    p.push(text(48, 72, t("How the Skill evolves", "每次更新，解决什么问题？"), 38, "text", 700));
    p.push(text(48, 111, t("Released history · Times in Asia/Shanghai", "已发布历史 · 发布时间为北京时间"), 23, "muted"));
    const versions = [
      { y: 148, version: "v0.1.2", state: t("PRERELEASE · 10-22", "预发布 · 10-22"), title: t("Business-intent steps", "业务步骤与验收澄清"), rows: [t("Actions describe the business goal.", "步骤表达业务意图"), t("Unclear acceptance stays unresolved.", "验收不清，保留待确认")] },
      { y: 357, version: "v0.1.3", state: t("RELEASED · 10-23", "正式版 · 10-23"), title: t("Evidence-rich delivery", "证据与报告完整交付"), rows: [t("Keep evidence and earlier attempts.", "留存证据与历史观察"), t("HTML / JSON / Markdown", "HTML / JSON / Markdown")] },
      { y: 566, version: "v0.1.4", state: t("RELEASED · 10-24", "正式版 · 10-24"), title: t("Configurable concurrency", "可配置并发与协调复核"), rows: [t("Workers deliver; AI reviews goals.", "分例交付，逐目标复核"), t("Serial by default. Spaces are not isolation.", "默认串行，Space 不保证隔离")] }
    ];
    p.push(line(67, 186, 67, 735));
    for (const v of versions) {
      p.push(`<circle cx="67" cy="${v.y + 37}" r="9" fill="#61e6ed"/>`, rect(100, v.y, 692, 186));
      p.push(text(126, v.y + 38, v.version, 29, "cyan", 700), text(446, v.y + 36, v.state, 21, "muted"));
      p.push(text(126, v.y + 82, v.title, 31, "text", 700));
      p.push(...v.rows.map((row, i) => text(126, v.y + 123 + i * 34, row, 25, "muted")));
    }
    p.push(text(48, 805, t("v0.1.5 · RELEASE", "v0.1.5 · 正式版本"), 24, "violet", 700));
    p.push(rect(48, 830, 744, 200, "panel", "violet").replace("/>", ' stroke-dasharray="8 6"/>'));
    p.push(text(74, 874, "v0.1.5", 32, "violet", 700));
    p.push(text(74, 918, t("Clarify missing resources", "资源不足，主动澄清"), 32, "text", 700));
    p.push(text(74, 960, t("Pause affected actions; verify before resuming.", "暂停依赖动作，补充后核验"), 25, "muted"));
    p.push(text(74, 997, t("Scoped checks verified; broader use untested.", "限定场景已验证，广泛场景待验证"), 25, "muted"));
    p.push(text(48, 1075, t("Illustration only. See version cards for limits.", "仅为能力示意；升级影响和验证限制见版本介绍"), 23, "muted"));
    await save(outputDir, ("version-history" + suffix), p, png);

    // Chronological source; append future versions here, never trim the full history.
    const readmeVersions = readmeVersionWindow([
      { version: 'v0.1.2', state: t('PRERELEASE', '预发布'), title: t('Business-intent steps', '业务步骤与验收澄清') },
      { version: 'v0.1.3', state: t('RELEASED', '正式版'), title: t('Evidence-rich delivery', '证据与报告完整交付') },
      { version: 'v0.1.4', state: t('RELEASED', '正式版'), title: t('Configurable concurrency', '可配置并发与协调复核') },
      { version: 'v0.1.5', state: t('RELEASED', '正式版'), title: t('Clarify missing resources', '资源不足，主动澄清') },
      { version: 'v0.1.6', state: t('RELEASED', '正式版'), title: t('Experience + network observation', '测试经验、目标评估与接口观测') },
      { version: 'v0.1.7', state: t('RC.1 · NOT RELEASED', '候选 rc.1 · 未发布'), title: t('Report reading + reusable regression', '报告阅读、资源澄清与回归复用') }
    ]);
    p = start(t('Latest four versions — README overview', '最近四个版本 — README 概览'), 650, 840);
    p.push(text(48, 65, t('Current candidate + three releases', '当前候选与前三个正式版本'), 32, 'text', 700));
    for (const [i, v] of readmeVersions.entries()) {
      const y = 100 + i * 122, color = i === readmeVersions.length - 1 ? 'violet' : 'cyan';
      p.push(rect(48, y, 744, 106, 'panel', color));
      p.push(text(72, y + 34, v.version, 25, color, 700), text(430, y + 33, v.state, 19, 'muted'));
      p.push(text(72, y + 78, v.title, 27, 'text', 700));
    }
    p.push(text(48, 623, t('Full history is preserved in the version-history documents.', '完整历史保留在版本演变文档中；图为能力示意。'), 19, 'muted'));
    await save(outputDir, ('readme-version-history' + suffix), p, png);


  }
  return { outputDir, svgFiles: 14, pngFiles: png ? 14 : 0, pngExport: png ? 'exported' : 'not_available_inkscape_missing' };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4 || process.argv[2] !== '--output-dir' || !process.argv[3]) throw new Error('Use --output-dir ABS_NEW_IMAGE_DIRECTORY.');
  process.stdout.write(JSON.stringify(await generateImages(path.resolve(process.argv[3])), null, 2) + '\n');
}
