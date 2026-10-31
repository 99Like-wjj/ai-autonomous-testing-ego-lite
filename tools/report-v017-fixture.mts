/** Synthetic report display fixture. No network, live users or business actions. Not shipped. */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Assessment, Baseline, Case, EvidenceMetadata, ExecutionContext, Observation, RecordPayload } from '../src/contracts/model.mjs';
import { init, start } from '../src/core/cases.mjs';
import { check, registerEvidence, recordResult } from '../src/core/records.mjs';
import { report } from '../src/report/delivery.mjs';
import { safePath, json } from '../src/core/common.mjs';

const flags = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i], value = process.argv[i + 1];
  if (!key || !['--output', '--screenshot'].includes(key) || !value || flags.has(key)) throw Error('Use --output ABS_NEW_DIR [--screenshot ABS_SYNTHETIC_PNG].');
  flags.set(key, value);
}
const output = flags.get('--output'); if (!output) throw Error('--output ABS_NEW_DIR is required.');
const root = await safePath(output, { external: true }); await fs.mkdir(root);
const sources = path.join(root, 'sources'); await fs.mkdir(sources);
const projectDir = path.join(root, 'project'), runDir = path.join(root, 'run'), reportDir = path.join(root, 'report');
await init(projectDir); await fs.mkdir(reportDir);
const scene = (id: string, title: string, titles: string[], strict = false): Case => ({ id, title, criticalConditions: ['所有内容均为明确合成数据，不代表业务验证。'], requiredPath: null, stepOrder: strict ? 'strict' : 'adaptive', steps: [{ id: 'inspect', action: '读取本地合成样本并记录显示用事实。' }], goals: titles.map((name, i) => ({ id: 'goal-' + (i + 1), title: name, basis: { kind: i === 2 ? 'interpretation' : 'explicit', source: '本地合成报告展示规范', text: '仅用于检查报告分支、事实表达和证据阅读，不是任何真实系统的验收要求。' }, expected: name + '；以合成夹具定义的预期为准。', requiredRefs: ['condition:0', 'step:inspect'] })) });
const cases = [
  scene('SC-01', '保存与读回：混合结果', ['保存后应显示新标题', '原对象应保持不变', '缺少响应不能确认根因'], true),
  scene('SC-02', '权限与成员：同目标多个现象', ['撤权后各入口应按范围拒绝', '审计记录待准备', '尚未登记的验收目标']),
  scene('SC-03', '接口、日志与资料正文', ['长正文和摘要应标明范围', '被策略排除的正文应说明原因', '包含特殊字符的正文应安全展示']),
  scene('SC-04', '截图与内容异常', ['有效合成图片可以查看', '损坏图片应提示解码失败', '非栅格图片应提示不支持']),
  scene('SC-05', '历史、修订和后续复核', ['后续结果不能抹掉首次异常', '后续目标可以链接原目标', '仅有尝试不形成当前评估']),
  scene('SC-06', '资料型目标与明确未知', ['资料事实可以使用文本证据', '无证据的观察应保持未知', '暂缓执行应明确未测试'])
];
cases[4]!.goals[1]!.followUpOf = { runId: 'self', caseId: 'SC-01', goalId: 'goal-1', reason: '独立合成复核关系；不自动替换原目标结论。' };
cases[5]!.goals[2]!.basis.kind = 'hypothesis'; cases[5]!.goals[2]!.clarificationQuestions = ['此合成分支的范围尚待澄清。'];
const baseline: Baseline = { schemaVersion: 8, project: 'v0.1.7 合成报告展示矩阵（不是业务测试）', cases };
const casesFile = path.join(projectDir, 'cases.json'); await fs.writeFile(casesFile, json(baseline)); await start({ projectDir, casesFile, outputDir: runDir });
const files: Record<string, string> = {};
async function source(name: string, bytes: string | Buffer) { const file = path.join(sources, name); await fs.writeFile(file, bytes); files[name] = file; return file; }
const provided = flags.get('--screenshot');
const png = provided ? await fs.readFile(await safePath(provided, { existing: true })) : Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY9sAAAAASUVORK5CYII=', 'base64');
await source('synthetic.png', png);
await source('broken.png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3]));
await source('unsupported.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="50"><text x="5" y="30">SYNTHETIC ONLY</text></svg>');
await source('summary.json', json({ synthetic: true, method: 'GET', path: '/synthetic/record', status: 403, code: 'SYNTHETIC_DENIED', bodyState: 'selected_fields', scope: 'One retained synthetic response, not all access paths.' }));
await source('note.md', '# 合成资料\n\n仅用于报告阅读和文本证据展示。对象：synthetic-object。实际业务和身份均未访问。\n');
await source('event.log', '2026-10-29T04:00:00.000Z SYNTHETIC readback title=old\n');
await source('escaped.txt', '合成安全文本：<script>not executable</script> & <img src=x onerror=alert(1)>；这里只是证据正文。\n');
await source('long.txt', '合成超长文本：范围必须标明，文件不能被静默截断。\n'.repeat(9000) + '\nSYNTHETIC_END_MARKER\n');
await source('excluded.json', json({ synthetic: true, bodyState: 'excluded', reason: 'The synthetic capture policy excluded body content.' }));
let evidenceRevision = 0, revision = 0, op = 0;
async function evidence(caseId: string, filename: string, kind: 'screenshot' | 'log' | 'tool_receipt' | 'other', description: string, metadata?: EvidenceMetadata) {
  const receipt = await registerEvidence({ runDir, request: { schemaVersion: 8, operationId: 'fixture-ev-' + ++op, expectedRevision: evidenceRevision, caseId, sourceFile: files[filename]!, kind, description, source: '明确合成本地展示夹具', capturedAt: '2026-10-29T04:00:00.000Z', ...(metadata ? { metadata } : {}) } }); evidenceRevision = receipt.revision; return receipt.evidenceId;
}
async function record(caseId: string, payload: RecordPayload, mode: 'final' | 'attempt' = 'final') {
  const operationId = 'fixture-record-' + ++op;
  const receipt = await recordResult({ runDir, request: { schemaVersion: 8, operationId, expectedRevision: revision, caseId, mode, record: payload } }); revision = receipt.revision; return operationId;
}
const obs = (id: string, summary: string, evidenceIds: string[]): Observation => ({ id, summary, coveredRefs: ['condition:0', 'step:inspect'], evidenceIds });
const assessment = (goalId: string, status: Assessment['status'], observationIds: string[], rationale: string, gaps: string[] = []): Assessment => ({ goalId, status, rationale, observationIds, gaps });

const screenshot = await evidence('SC-01', 'synthetic.png', 'screenshot', provided ? '提供的本地合成页面截图；不是被测业务页面。' : '1×1合成占位PNG；验证解码，不证明真实页面。', { scope: 'viewport', page: '本地合成页', object: 'synthetic-object', purpose: '演示图片入口与元数据', limitations: ['不是业务系统截图。'] });
const log = await evidence('SC-01', 'event.log', 'log', '合成保存后读回日志', { contentState: 'full', mediaType: 'text/plain' });
const context: ExecutionContext = { id: 'context-1', environment: { state: 'known', summary: '离线合成环境', sources: [{kind:'other',reference:'Synthetic fixture source',evidenceIds:[log]}] }, identity: { state: 'unknown', summary: '夹具没有登录真实身份。', sources: [{kind:'other',reference:'Synthetic fixture source',evidenceIds:[]}] }, objects: { state: 'known', summary: 'synthetic-object', sources: [{kind:'other',reference:'Synthetic fixture source',evidenceIds:[log]}] }, initialState: { state: 'known', summary: 'title=old', sources: [{kind:'other',reference:'Synthetic fixture source',evidenceIds:[log]}] }, authorization: { state: 'not_applicable', summary: '只读本地合成数据。', sources: [{kind:'other',reference:'Synthetic fixture source',evidenceIds:[]}] } };
const rename: Observation = { ...obs('rename-first', '合成首次保存后标题仍为old。', [screenshot, log]), actual: 'title=old；预期title=new。', contextId: context.id, occurredAt: '2026-10-29T04:00:00.000Z', actions: [{ id: 'save', description: '夹具记录保存输入。', input: 'title=new', result: '读回title=old', planRefs: ['step:inspect'], evidenceIds: [log] }], evidenceLinks: [{ evidenceId: log, actionId: 'save', purpose: '支持实际读回差异', fact: '标题仍为old', limitations: ['合成行为，不是实际产品缺陷。'] }] };
await record('SC-01', { contexts: [context], observations: [rename], assessments: [assessment('goal-1', 'violation', [rename.id], '合成预期与合成实际不同。'), assessment('goal-2', 'verified', [rename.id], '合成原对象标识没有变化。'), assessment('goal-3', 'inconclusive', [], '没有响应观察，保留无法判断。', ['后台响应未记录。'])] });
await record('SC-01', { observations: [obs('rename-attempt', '合成后续尝试，仅留历史。', [log])], assessments: [assessment('goal-1', 'verified', ['rename-attempt'], '尝试记录不覆盖当前目标结论。')] }, 'attempt');

const response = await evidence('SC-02', 'summary.json', 'tool_receipt', '合成字段筛选后的接口正文', { contentState: 'selected_fields', mediaType: 'application/json', redaction: '全部内容合成，无真实凭证。' });
const permissionShot = await evidence('SC-02', 'synthetic.png', 'screenshot', '合成权限页面占位图', { scope: 'element', purpose: '展示小图边界说明', limitations: ['截图上下文不足，需结合文字。'] });
const permission = obs('permission', '合成接口拒绝，另一路合成页面仍展示入口；未提交重新指派。', [response, permissionShot]);
await record('SC-02', { observations: [permission], assessments: [{ ...assessment('goal-1', 'violation', [permission.id], '同目标包含不同访问路径现象。', ['未提交候选选择，不能声称服务端接受。']), summary: '合成撤权结果在不同入口不一致。', phenomena: [{ id: 'api-deny', title: '接口拒绝', actual: '403 / SYNTHETIC_DENIED', observationIds: [permission.id], evidenceIds: [response], limitations: ['只覆盖一个合成端点。'] }, { id: 'ui-entry', title: '页面入口仍显示', actual: '合成入口仍存在。', observationIds: [permission.id], evidenceIds: [permissionShot], limitations: ['未提交后续操作。'] }], gapDetails: [{ kind: 'evidence', missing: '后续提交事实', impact: '不能推断后台接受重新指派。', nextStep: '若有授权，另行设计复核。' }], reproduction: { preparation: ['准备隔离合成身份及对象。'], limitations: ['本夹具不能当真实复现。'], objectState: '只有本地文件。', repeatability: '未做独立业务重复。' }, diagnosis: { state: 'hypothesis', category: 'unknown', summary: '仅有合成假设，未证明根因。', evidenceIds: [response] } }, assessment('goal-2', 'not_tested', [], '合成审计资料尚未准备。', ['没有审计资料。'])], findings: [{ id: 'related-access', title: '两个合成访问入口的关联现象', goalIds: ['goal-1'], observationIds: [permission.id], evidenceIds: [response], relationReason: '明确同一合成对象；不认定同根因。', reviewState: 'reviewed', scope: 'original' }, { id: 'extra', title: '额外合成观察单列', goalIds: [], observationIds: [permission.id], evidenceIds: [permissionShot], relationReason: '额外观察不并入原目标通过/失败。', reviewState: 'proposed', scope: 'additional' }] });

const long = await evidence('SC-03', 'long.txt', 'other', '超过256KiB的合成正文，末尾含标记', { contentState: 'full', mediaType: 'text/plain' });
const excluded = await evidence('SC-03', 'excluded.json', 'log', '正文被合成策略排除', { contentState: 'excluded', omissionReason: '合成策略未采集正文。', mediaType: 'application/json' });
const escaped = await evidence('SC-03', 'escaped.txt', 'other', '必须作为文本而不执行的合成字符', { contentState: 'full', mediaType: 'text/plain' });
await record('SC-03', { observations: [obs('long', '只核对合成正文交付范围。', [long]), obs('excluded', '合成正文未被采集。', [excluded]), obs('escaped', '特殊字符串应原样作为证据文本显示。', [escaped])], assessments: [assessment('goal-1', 'inconclusive', ['long'], '此目标演示超长正文边界。', ['需要全文核对。']), assessment('goal-2', 'not_tested', ['excluded'], '策略排除正文，未开展该检查。', ['正文未取得。']), assessment('goal-3', 'verified', ['escaped'], '合成文本被保存，浏览器展示另行实际检查。')] });

const good = await evidence('SC-04', 'synthetic.png', 'screenshot', '可解码合成PNG', { scope: 'viewport' });
const broken = await evidence('SC-04', 'broken.png', 'screenshot', '故意损坏的合成PNG，检验错误提示');
const unsupported = await evidence('SC-04', 'unsupported.svg', 'screenshot', '不作为图片执行的合成SVG');
await evidence('SC-04', 'note.md', 'other', '已登记但未被引用的合成资料');
await record('SC-04', { observations: [obs('good', '合成图存在。', [good]), obs('broken', '合成坏图，不能支持页面判断。', [broken]), obs('unsupported', '此合成格式不作栅格预览。', [unsupported])], assessments: [assessment('goal-1', 'verified', ['good'], '该状态是夹具输入，只验证展示分支。'), assessment('goal-2', 'inconclusive', ['broken'], '原图不可解码。', ['缺少可读图像。']), assessment('goal-3', 'inconclusive', ['unsupported'], '缺少支持的栅格预览。', ['格式未支持。'])] });

const historyLog = await evidence('SC-05', 'event.log', 'log', '历史专用合成日志');
const first = await record('SC-05', { observations: [obs('first', '首次合成异常。', [historyLog])], assessments: [assessment('goal-1', 'violation', ['first'], '保留首次合成异常。')] });
await record('SC-05', { observations: [obs('later', '后续独立合成观察。', [historyLog])], assessments: [{ ...assessment('goal-1', 'verified', ['later'], '后续合成结果符合预期，首次异常仍可查。'), previousOperationId: first, revisionReason: '后续独立合成观察；不删除旧记录。' }, assessment('goal-2', 'verified', ['later'], '复核目标单独记录，关联不改写源目标。')] });
await record('SC-05', { observations: [obs('attempt-only', '仅为历史尝试的合成观察。', [historyLog])], assessments: [assessment('goal-3', 'inconclusive', ['attempt-only'], '尝试未提交当前结论。', ['仍需确认。'])] }, 'attempt');

const document = await evidence('SC-06', 'note.md', 'other', '合成验收资料正文', { contentState: 'full', mediaType: 'text/markdown', scope: 'document' });
await record('SC-06', { observations: [obs('document', '本地合成资料已读取。', [document]), obs('no-evidence', '仅文字观察没有证据。', [])], assessments: [assessment('goal-1', 'verified', ['document'], '资料型目标不机械要求UI截图。'), assessment('goal-2', 'inconclusive', ['no-evidence'], '观察缺少支撑材料。', ['没有关联证据。']), assessment('goal-3', 'not_tested', [], '合成范围尚待澄清。', ['目标前提未确认。'])] });
const result = await report(runDir, { outputDir: reportDir });
const bundleDir = path.join(root, 'report-bundle'); await fs.mkdir(bundleDir);
const bundle = await report(runDir, { outputDir: bundleDir, deliveryMode: 'bundle' });
const checked = await check(runDir);
await fs.writeFile(path.join(root, 'fixture-manifest.json'), json({ synthetic: true, noBusinessExecution: true, runDir, reportDir, bundleDir, counts: checked.counts, caseCount: checked.caseCount, goalCount: checked.goalCount, capturedAtMeaning: 'Fixed synthetic fixture timestamp; not a real operation time.', usedProvidedScreenshot: Boolean(provided), unsupportedAndBrokenImagesAreIntentional: true }));
console.log(json({ synthetic: true, runDir, reportDir, ...result, bundleReportHtml: bundle.reportHtml, counts: checked.counts, caseCount: checked.caseCount, goalCount: checked.goalCount }));
