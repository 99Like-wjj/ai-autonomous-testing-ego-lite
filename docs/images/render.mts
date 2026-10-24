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
function start(title: string, h = 600): string[] { return [`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${h}" viewBox="0 0 1200 ${h}" role="img" aria-label="${escapeXml(title)}"><title>${escapeXml(title)}</title><defs><linearGradient id="g"><stop stop-color="#61e6ed"/><stop offset="1" stop-color="#ae91ff"/></linearGradient><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#61e6ed"/></marker></defs><g font-family="DejaVu Sans, Noto Sans CJK SC, sans-serif">`, rect(0, 0, 1200, h, "bg", "bg", 0), "<path d=\"M0,2 H1200\" stroke=\"url(#g)\" stroke-width=\"4\"/>"]; }
async function save(outputDir: string, name: string, parts: readonly string[], png: boolean) {
  const svg = path.join(outputDir, name + '.svg');
  await fs.writeFile(svg, parts.join('') + '</g></svg>', { flag: 'wx' });
  if (png) await exec('inkscape', [svg, '--export-type=png', '--export-filename=' + path.join(outputDir, name + '.png')], { windowsHide: true });
}
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
    let p = start("Ego Lite Test Skill", 540);
    p.push(...[text(54, 64, t("AI TESTING / BUILT ON EGO LITE", "AI 自主测试 / 基于 EGO LITE"), 19, "cyan", 700), text(54, 136, t("Test new features.", "新功能首次交付，"), 48, "text", 700), text(54, 198, t("Let AI plan the checks.", "让 AI 自主规划测试。"), 48, "text", 700), text(56, 246, t("New web projects and feature launches. Rules, actions, and evidence.", "面向新项目上线前、新功能交付时的 Web 业务验证"), 20, "muted")]);
    p.push(...[rect(56, 294, 1088, 150), text(82, 332, t("01  PREPARE", "01  准备测试依据"), 16, "cyan", 700), text(82, 370, t("Goals + acceptance", "目标与验收条件"), 23), text(82, 403, t("Requirements and cases", "需求、业务规则与用例"), 17, "muted"), text(455, 332, t("02  EXPLORE", "02  AI 自主执行"), 16, "violet", 700), text(455, 370, t("Plan → explore → test", "规划 → 探索 → 测试"), 23), text(455, 403, t("Current AI session + Ego", "当前 AI 会话 + Ego"), 17, "muted"), text(835, 332, t("03  REVIEW", "03  核验与交付"), 16, "cyan", 700), text(835, 370, t("Evidence + verdict", "证据与结论"), 23), text(835, 403, t("Show gaps and evidence", "说明证据与未验证项"), 17, "muted"), line(355, 370, 420, 370), line(735, 370, 800, 370), text(56, 498, t("0.1.4  /  INDEPENDENT PROJECT  /  SEE VALIDATION SCOPE", "版本 0.1.4  /  独立项目  /  验证范围见文档"), 16, "muted")]);
    await save(outputDir, ("hero" + suffix), p, png);
    p = start(t("Who owns what?", "谁负责什么？"), 650);
    p.push(...[text(50, 65, t("AI decides. Ego operates. Tools keep records.", "AI 做判断，Ego 做操作，工具管记录。"), 35, "text", 700), text(50, 103, t("Use the current AI session and Ego. No extra model API service.", "复用当前 AI 会话和 Ego 浏览器，不另建模型 API 服务。"), 20, "muted")]);
    const cards: [number, string, string, string[], string][] = [[430, "02", t("Current AI session", "当前 AI 会话"), [t("Interprets the requirement", "理解测试需求"), t("Plans and adapts tests", "规划测试并调整操作"), t("Evaluates evidence", "判断证据是否充分")], "cyan"], [50, "01", t("Our Skill + test inputs", "本项目 Skill + 测试资料"), [t("Boundaries and acceptance", "授权边界与验收条件"), t("Requirements, rules, cases", "需求、业务规则与用例"), t("Flexible workflow guidance", "可灵活调整的流程指南")], "violet"], [810, "03", t("Ego native tools", "Ego 原生浏览器能力"), [t("Reads the current page", "读取当前页面"), t("Performs browser actions", "执行浏览器操作"), t("Returns page state", "返回页面信息与截图")], "cyan"]];
    for (const [x, n, head, rows, col] of cards) {
      p.push(...[rect(x, 150, 340, 268), text((x + 24), 192, n, 20, col, 700), text((x + 24), 236, head, 22, "text", 700)]);
      p.push(...rows.map((r, i) => text((x + 24), (284 + (i * 38)), r, 19, "muted")));
    }
    p.push(...[line(390, 276, 428, 276), line(770, 260, 808, 260), line(808, 302, 770, 302), text(78, 444, t("Supplies rules and goals →", "提供规则与测试目标 →"), 16, "violet"), text(454, 444, t("Choose actions ↔ inspect results", "选择操作 ↔ 读取结果"), 16, "cyan"), rect(50, 462, 1100, 130), text(78, 503, t("Our local toolbox records evidence and builds reports.", "本项目工具箱：登记证据、保存结果、生成报告。"), 23, "cyan", 700), text(78, 543, t("File checks do not decide whether a business feature is correct.", "工具校验文件和记录，不替 AI 判定业务是否正确。"), 21), text(78, 574, t("A successful click is not proof that the requirement was met.", "操作成功不等于测试通过，仍需对照预期核验结果。"), 18, "muted")]);
    await save(outputDir, ("architecture" + suffix), p, png);
    p = start(t("Adaptive test workflow", "自适应测试流程"), 780);
    p.push(...[text(50, 65, t("Stable goals. Flexible execution.", "目标和规则不变，操作方法灵活调整。"), 34, "text", 700), text(50, 103, t("Two input sources. One case format. New features and regression.", "两种用例来源，一套格式；共同用于新功能与回归验证。"), 20, "muted")]);
    p.push(...[rect(50, 130, 535, 84), text(70, 162, t("External cases → validate format", "接收已有用例 → 校验格式"), 21, "cyan", 700), text(70, 193, t("Business steps + overall acceptance", "业务步骤 + 整体验收目标"), 17, "muted"), rect(615, 130, 535, 84), text(635, 162, t("AI drafts cases → validate format", "AI 根据需求生成用例 → 校验格式"), 21, "violet", 700), text(635, 193, t("Business steps, not invented buttons", "描述业务步骤，不编造按钮和页面细节"), 17, "muted"), "<g transform=\"translate(0 120)\">"]);
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
    p.push(...[rect(50, 443, 1100, 172), text(78, 484, t("Account for every test goal", "每个测试目标，都要有交代"), 24, "cyan", 700), text(78, 524, t("Report passed, failed, blocked, uncertain, and untested items separately.", "分别说明通过、失败、执行受阻、无法判断和未测试的内容。"), 20), text(78, 558, t("Pause actions that need permission; do not expand the test scope silently.", "涉及未获授权的操作时，先暂停并确认，不擅自扩大测试范围。"), 18, "muted"), text(78, 590, t("If acceptance criteria are missing, ask or mark the outcome as uncertain.", "缺少明确预期时，先澄清或标记无法判断，不能凭现状判通过。"), 18, "muted")]);
    p.push(...["</g>"]);
    await save(outputDir, ("workflow" + suffix), p, png);
    p = start(t("Illustrative evidence specimen, not a real run", "证据展示示意，非真实运行结果"), 620);
    p.push(...[text(50, 59, t("ILLUSTRATION / NOT A REAL TEST", "报告内容示意 / 非真实测试结果"), 18, "violet", 700), text(50, 109, t("Show why the result is supported.", "不只告诉你结果，还要说清判断依据。"), 33, "text", 700), rect(50, 145, 1100, 395), text(78, 190, t("CASE  /  Filter products by category", "用例 / 按分类筛选商品"), 24, "text", 700), text(78, 228, t("Expected: visible results belong to the selected category.", "预期：当前展示的商品都属于所选分类。"), 20, "muted")]);
    p.push(...[rect(78, 261, 500, 188, "bg"), text(100, 300, t("OBSERVED", "实际观察"), 15, "cyan", 700), text(100, 342, t("The result list is visible.", "结果列表已显示。"), 23), text(100, 381, t("Visible categories match the selection.", "当前商品分类与筛选条件一致。"), 20, "muted"), text(100, 418, t("Evidence: saved page capture, if available", "证据：对应页面截图（如已保存）"), 17, "muted"), rect(602, 261, 520, 188, "bg"), text(624, 300, t("NOT COVERED", "本次未覆盖"), 15, "violet", 700), text(624, 342, t("Database consistency.", "数据库内容是否一致。"), 23), text(624, 381, t("Results on other pages.", "其他分页中的商品。"), 20, "muted"), text(624, 418, t("No evidence → no wider claim", "没有证据，不扩大结论"), 17, "muted"), text(78, 496, t("Scope: visible results only; do not infer untested behavior.", "结论范围：仅针对当前可见结果，不推断未测试部分。"), 22, "cyan"), text(50, 583, t("Synthetic design specimen only. No product execution, screenshot, or benchmark is represented.", "仅为人工设计示意，不代表产品实测、真实截图或基准测试。"), 17, "muted")]);
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
    p.push(text(50, 542, t("v0.1.4  /  Design illustration, not execution evidence", "v0.1.4  /  设计示意，非实际测试证据"), 16, "muted"));
    await save(outputDir, ("parallel" + suffix), p, png);

  }
  return { outputDir, svgFiles: 10, pngFiles: png ? 10 : 0, pngExport: png ? 'exported' : 'not_available_inkscape_missing' };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4 || process.argv[2] !== '--output-dir' || !process.argv[3]) throw new Error('Use --output-dir ABS_NEW_IMAGE_DIRECTORY.');
  process.stdout.write(JSON.stringify(await generateImages(path.resolve(process.argv[3])), null, 2) + '\n');
}
