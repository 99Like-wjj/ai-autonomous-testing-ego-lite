import type { Baseline, Case, CasesRef, Goal } from '../contracts/model.mjs';
import { goalPlan } from '../contracts/case-view.mjs';
import { feedbackFromText, makeReviewFeedback, parseReviewFeedback, type FeedbackDecision, type ReviewFeedback } from '../contracts/review-feedback.mjs';

interface Model { kind: 'case_review'; schemaVersion: 9; cases: CasesRef; baseline: Baseline; expectedReviewNumber: number; initialFeedback: ReviewFeedback | null }
interface Row { c: Case; g: Goal }
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => { const el = document.getElementById(id); if (!el) throw Error('缺少审阅控件：' + id); return el as T; };
const model = JSON.parse($('case-data').textContent ?? 'null') as Model;
if (model.kind !== 'case_review' || model.schemaVersion !== 9) throw Error('不支持的用例审阅页面。');
const rows: Row[] = model.baseline.cases.flatMap(c => c.goals.map(g => ({ c, g })));
const points = new Map(rows.map(r => [r.g.pointId, r]));
const identity = { cases: model.cases, pointIds: rows.map(r => r.g.pointId) };
const key = 'ego-case-review-draft-v1-' + model.cases.projectId + '-' + model.cases.sha256;
const esc = (value: unknown): string => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const paragraph = (value: string) => esc(value).replaceAll('\n', '<br>');
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const sameRef = (value: unknown): boolean => isObject(value) && value.projectId === model.cases.projectId && value.caseVersion === model.cases.caseVersion && value.sha256 === model.cases.sha256;
const notes: Record<string, string> = Object.create(null) as Record<string, string>;
let current: string | null = rows[0]?.g.pointId ?? null;
let selected = new Set(identity.pointIds), openCases = new Set<string>();
let globalNote = '', decision: FeedbackDecision = 'comment_only', restored = false, storageOk = true;
let viewMode: 'overview' | 'workbench' = 'overview', overviewReturnY = 0, lastLocation = '';
const expanded = new Set<string>();
let filterCollapsed = false, toastTimer: number | undefined;
let nativeBase: URL | null = null, nativeOutputDir = '', nativeBusy = false;

function noteEntries() { return rows.flatMap(r => (notes[r.g.pointId] ?? '').trim() ? [{ pointId: r.g.pointId, text: notes[r.g.pointId]! }] : []); }
function toast(text: string) { $('toast').textContent = text; $('toast').hidden = false; window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { $('toast').hidden = true; }, 5000); }
function persist() {
  try { localStorage.setItem(key, JSON.stringify({ draftVersion: 1, cases: model.cases, notes, globalNote, current, selected: [...selected], openCases: [...openCases], decision })); storageOk = true; } catch { storageOk = false; }
  $('storage-status').textContent = storageOk ? '意见草稿已暂存到当前浏览器' : '当前浏览器无法保存草稿，请复制或保存到本机文件';
}
function mergeFeedback(feedback: ReviewFeedback) {
  const incoming: Record<string, string> = Object.create(null) as Record<string, string>; let overall = '';
  for (const comment of feedback.comments) {
    if (comment.pointId === null) overall += (overall ? '\n\n' : '') + comment.text;
    else incoming[comment.pointId] = (incoming[comment.pointId] ? incoming[comment.pointId] + '\n\n' : '') + comment.text;
  }
  let added = 0, conflicts = 0;
  const hadNotes = noteEntries().length > 0 || !!globalNote.trim();
  for (const [id, text] of Object.entries(incoming)) { if (!(notes[id] ?? '').trim()) { notes[id] = text; added++; } else if (notes[id] !== text) conflicts++; }
  if (overall && !globalNote.trim()) globalNote = overall; else if (overall && overall !== globalNote) conflicts++;
  if (!hadNotes && feedback.comments.length) { selected = new Set(feedback.pointIds); decision = feedback.decision; }
  else feedback.pointIds.forEach(id => selected.add(id));
  return { added, conflicts };
}
try {
  const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
  if (isObject(value) && value.draftVersion === 1 && sameRef(value.cases) && isObject(value.notes) && Array.isArray(value.selected)) {
    for (const [id, text] of Object.entries(value.notes)) if (points.has(id) && typeof text === 'string') notes[id] = text;
    selected = new Set(value.selected.filter((id): id is string => typeof id === 'string' && points.has(id)));
    if (typeof value.globalNote === 'string') globalNote = value.globalNote;
    if (typeof value.current === 'string' && points.has(value.current)) current = value.current;
    if (Array.isArray(value.openCases)) openCases = new Set(value.openCases.filter((id): id is string => typeof id === 'string' && model.baseline.cases.some(c => c.id === id)));
    if (value.decision === 'comment_only' || value.decision === 'changes_requested' || value.decision === 'approved') decision = value.decision;
    restored = true;
  }
} catch { /* Leave an unreadable stored value intact; a file import can recover it. */ }
if (!restored && model.initialFeedback) mergeFeedback(parseReviewFeedback(model.initialFeedback, identity, { allowEmpty: true }));

const basisNames = { explicit: '需求明确规定', interpretation: '需求解释', hypothesis: '探索性假设' };
const parameterTypes: Record<string, string> = { string: '文本', number: '数值', integer: '整数', boolean: '是/否', array: '列表', object: '结构化对象', null: '空值' };
function badges(g: Goal): string { return `<span class="badge${g.planState === 'unprepared' ? ' warn' : ''}">${g.planState === 'prepared' ? '计划已准备' : '计划待补充'}</span>${g.clarificationQuestions.length ? '<span class="badge warn">规则待确认</span>' : ''}`; }
function matches(r: Row, search: string, filter: string): boolean {
  const q = search.trim().toLowerCase(), text = `${r.c.id} ${r.c.title} ${r.g.pointId} ${r.g.title} ${r.g.expected}`.toLowerCase(), note = !!(notes[r.g.pointId] ?? '').trim();
  return (!q || text.includes(q)) && (filter === 'all' || filter === 'prepared' && r.g.planState === 'prepared' || filter === 'unprepared' && r.g.planState === 'unprepared' || filter === 'clarification' && r.g.clarificationQuestions.length > 0 || filter === 'has-note' && note || filter === 'no-note' && !note);
}
function updateCounts() {
  $('notes-count').textContent = String(noteEntries().length); $('scope-total').textContent = String(selected.size);
  $('nav-foot-count').textContent = `已写意见 ${noteEntries().length} 项 · 导出范围 ${selected.size} 项`;
  document.querySelectorAll<HTMLElement>('[data-note-indicator]').forEach(el => { el.hidden = !(notes[el.dataset.noteIndicator ?? ''] ?? '').trim(); });
  const badge = document.querySelector('#review-pane .review-lead .badge'); if (badge) badge.textContent = current && (notes[current] ?? '').trim() ? '已写意见' : '尚无意见';
  renderOverview();
}
function renderOverview() {
  const query = $<HTMLInputElement>('overview-search').value, filter = $<HTMLSelectElement>('overview-filter').value;
  const filtered = !!query.trim() || filter !== 'all'; let scenes = 0, count = 0;
  $('overview-list').innerHTML = model.baseline.cases.map(c => {
    const goals = c.goals.filter(g => matches({ c, g }, query, filter)); if (!goals.length) return '';
    scenes++; count += goals.length;
    const ready = c.goals.filter(g => g.planState === 'prepared').length, questions = c.goals.filter(g => g.clarificationQuestions.length).length;
    const commented = c.goals.filter(g => (notes[g.pointId] ?? '').trim()).length, open = expanded.has(c.id) || filtered && !filterCollapsed;
    return `<section class="ov-scene" data-overview-case="${esc(c.id)}"><button class="ov-scene-toggle" data-ov-toggle="${esc(c.id)}" aria-expanded="${open}" aria-controls="children-${esc(c.id)}"><span class="ov-chevron" aria-hidden="true">›</span><span class="ov-scene-id">${esc(c.id)}</span><span class="ov-scene-title">${esc(c.title)}${goals.length < c.goals.length ? `<span class="ov-scene-sub">当前命中 ${goals.length} 条用例</span>` : ''}</span><span class="ov-count"><b>${c.goals.length}</b>条</span><span class="ov-plan">计划已准备 ${ready}/${c.goals.length}${questions ? `<span class="need">${questions} 条规则待确认</span>` : ready < c.goals.length ? `<span class="need">${c.goals.length - ready} 条计划待补充</span>` : ''}</span><span class="ov-opinion${commented ? ' has-note' : ''}">${commented ? `<span class="ov-note-count">${commented}</span>条意见` : '暂无意见'}</span></button><div id="children-${esc(c.id)}" class="ov-cases" role="group" aria-label="${esc(c.title)}下的用例" ${open ? '' : 'hidden'}><div class="ov-child-head" aria-hidden="true"><span>用例编号</span><span>用例与业务预期</span><span>计划状态</span><span>评审意见</span><span></span></div>${goals.map(g => `<button class="ov-point" data-ov-point="${esc(g.pointId)}" aria-label="查看与评审：${esc(g.title)}"><span class="ov-point-id">${esc(g.pointId)}</span><span class="ov-point-copy"><span class="ov-point-title">${esc(g.title)}</span><span class="ov-point-expected" title="${esc(g.expected)}">${esc(g.expected)}</span></span><span class="ov-point-state">${badges(g)}</span><span class="ov-opinion">${(notes[g.pointId] ?? '').trim() ? '已写意见' : '暂无意见'}</span><span class="ov-point-open">查看与评审 →</span></button>`).join('')}</div></section>`;
  }).join('') || '<div class="overview-empty">没有匹配的场景或用例，可清空搜索或重置筛选。</div>';
  $('overview-result').textContent = filtered ? `命中 ${scenes}/${model.baseline.cases.length} 个场景 · ${count}/${rows.length} 条用例` : `全部 ${scenes} 个场景 · ${count} 条用例`;
  $('overview-opinions').textContent = `已保留 ${noteEntries().length} 条逐条意见`;
}
function renderNav() {
  const query = $<HTMLInputElement>('search').value, filter = $<HTMLSelectElement>('filter').value, visible = rows.filter(r => matches(r, query, filter));
  $('filter-count').textContent = `${visible.length} 项`;
  $('tree').innerHTML = model.baseline.cases.map(c => {
    const items = visible.filter(r => r.c.id === c.id); if (!items.length) return '';
    const open = openCases.has(c.id) || !!query.trim(), active = current ? points.get(current)?.c.id === c.id : false;
    return `<div class="scene"><div class="scene-head${active ? ' current' : ''}"><button class="scene-toggle" data-toggle="${esc(c.id)}" aria-label="${open ? '收起' : '展开'}场景${esc(c.id)}" aria-expanded="${open}">${open ? '▾' : '▸'}</button><button class="scene-pick" data-scene="${esc(c.id)}">${esc(c.title)}<span class="scene-n">${esc(c.id)} · ${c.goals.length} 个测试点</span></button></div>${open ? `<div class="scene-goals">${items.map(({ g }) => `<button class="point-nav" data-point="${esc(g.pointId)}" aria-current="${current === g.pointId}"><span class="point-id"><span>${esc(g.pointId)}</span><i class="note-dot" data-note-indicator="${esc(g.pointId)}" ${(notes[g.pointId] ?? '').trim() ? '' : 'hidden'}></i></span>${esc(g.title)}</button>`).join('')}</div>` : ''}</div>`;
  }).join('') || '<div class="blank">没有匹配项，正文阅读位置保持不变。</div>';
  updateCounts();
}
function renderMain() {
  const row = current ? points.get(current) : undefined;
  if (!row) { $('main-body').innerHTML = '<div class="reader-empty">没有已定义用例，请先补全设计。</div>'; $('review-pane').replaceChildren(); return; }
  const { c, g } = row, plan = goalPlan(c, g);
  $('breadcrumbs').textContent = `测试用例 / ${c.title} / ${g.pointId} · v${model.cases.caseVersion}`;
  const questions = [...g.clarificationQuestions, ...g.preparationGaps];
  $('main-body').innerHTML = `<section class="scene-banner"><span class="eyebrow">业务场景 ${esc(c.id)}</span><h2>${esc(c.title)}</h2><p>${c.goals.length} 个独立目标 · 当前查看 1 项</p></section><article class="point-card"><div class="point-overview"><div class="point-kicker"><span class="target-number">${esc(g.pointId)}</span><div class="badges">${badges(g)}</div></div><h2>${esc(g.title)}</h2><p class="expected"><span class="expected-label">业务预期</span>${paragraph(g.expected)}</p><div class="point-controls"><label><input type="checkbox" data-scope="${esc(g.pointId)}" ${selected.has(g.pointId) ? 'checked' : ''}>纳入导出范围</label><div class="pager"><button data-prev>← 上一用例</button><button data-next>下一用例 →</button></div></div></div><div class="point-body">${questions.length ? `<section class="questions"><h3>${g.clarificationQuestions.length ? '执行前待确认' : '计划仍需补充'}</h3><ul>${questions.map(t => `<li>${paragraph(t)}</li>`).join('')}</ul></section>` : ''}<div class="plan-grid"><section><div class="section-heading"><h3>执行步骤</h3><span class="section-caption">${c.stepOrder === 'strict' ? '按依赖顺序执行' : '方法可调整，依赖须保留'}</span></div>${plan.steps.map(s => `<div class="step"><span class="step-num">${s.number}</span><div class="step-text">${paragraph(s.text)}${s.dependsOn.length ? `<div class="dependency">先完成：步骤 ${s.dependsOn.join('、')}</div>` : ''}<span class="required-tag">${s.required ? '本目标必要步骤' : '前置依赖步骤'}</span></div></div>`).join('') || '<p class="small muted">尚未定义必要步骤。</p>'}</section><section><div class="section-heading"><h3>必要前提与路径</h3></div>${plan.conditions.map(item => `<div class="condition"><strong>${esc(item.label)}</strong><p>${paragraph(item.text)}</p></div>`).join('')}${plan.path ? `<div class="path-block"><strong>必须经过的业务路径</strong>${paragraph(plan.path)}</div>` : ''}</section></div><details class="source-block"><summary>需求依据与完整场景计划</summary><p>${esc(basisNames[g.basis.kind])} · ${esc(g.basis.source)}</p><p>${paragraph(g.basis.text)}</p>${c.steps.map((s, i) => `<p>步骤 ${i + 1}：${paragraph(s.action)}</p>`).join('')}${c.parameters.map(p => `<p>测试数据 ${esc(p.id)}（${esc(parameterTypes[p.type] ?? p.type)}）：${paragraph(p.purpose)}；${paragraph(p.constraints.join('；'))}</p>`).join('')}</details><details class="tech"><summary>技术原文与来源指纹</summary><pre>${esc(JSON.stringify({ pointId: g.pointId, caseId: c.id, goalId: g.id, requiredRefs: g.requiredRefs, resolvedRequiredRefs: plan.refs, casePlan: { criticalConditions: c.criticalConditions, requiredPath: c.requiredPath, stepOrder: c.stepOrder, steps: c.steps, parameters: c.parameters }, sourceRefIds: g.basis.sourceRefIds, cases: model.cases }, null, 2))}</pre></details></div></article>`;
  $('review-pane').innerHTML = `<div class="review-lead"><div><h3>本用例评审意见</h3><p class="review-context">${esc(g.title)}<br>${esc(g.pointId)}</p></div><span class="badge">${(notes[g.pointId] ?? '').trim() ? '已写意见' : '尚无意见'}</span></div><textarea class="review-editor" data-editor="${esc(g.pointId)}" aria-label="本用例评审意见" placeholder="填写业务预期、步骤、依赖或数据条件方面的意见……">${esc(notes[g.pointId] ?? '')}</textarea><div class="review-actions"><span id="editor-save-state">${restored ? '已恢复当前浏览器草稿' : '输入会暂存到当前浏览器'}</span><div><button data-no-change="${esc(g.pointId)}">无修改意见</button> <button class="primary" data-save="${esc(g.pointId)}">保存本条意见</button></div></div><p class="draft-hint">切换与返回总览保留输入。浏览器草稿不会改写原用例文件。</p><details class="global-note"><summary>总体评审意见</summary><textarea id="global-note" aria-label="总体评审意见" placeholder="填写适用于整个范围的建议……">${esc(globalNote)}</textarea></details>`;
}
function setView(mode: 'overview' | 'workbench') {
  viewMode = mode; document.body.dataset.view = mode;
  $('overview-view').hidden = mode !== 'overview'; $('workbench-view').hidden = mode !== 'workbench'; $('overview-back').hidden = mode !== 'workbench';
  $('overview-tab').setAttribute('aria-current', mode === 'overview' ? 'page' : 'false'); $('workbench-tab').setAttribute('aria-current', mode === 'workbench' ? 'page' : 'false');
  $('view-location-text').textContent = mode === 'overview' ? '先展开场景，再选择用例' : (current ? `${points.get(current)?.c.id ?? ''} / ${current}` : '尚无用例');
}
function route(hash: string) { if (location.hash !== hash) history.pushState({ caseReview: true }, '', hash); lastLocation = hash; }
function showOverview(push = true) { setView('overview'); renderOverview(); if (push) route('#overview'); window.scrollTo({ top: overviewReturnY, behavior: 'instant' }); }
function showPoint(id: string, push = true) {
  const row = points.get(id); if (!row) return;
  const resetOpinionPosition = viewMode === 'overview' || current !== id;
  if (viewMode === 'overview') overviewReturnY = window.scrollY;
  current = id; openCases.add(row.c.id); persist(); setView('workbench'); renderMain(); renderNav(); if (push) route('#point=' + encodeURIComponent(id)); window.scrollTo({ top: 0, behavior: 'instant' });
  if (resetOpinionPosition) $('review-pane').scrollTop = 0;
  const target = document.querySelector<HTMLElement>('#tree [data-point="' + CSS.escape(id) + '"]'), tree = $('tree');
  if (target) { const marker = row.c.goals.findIndex(g => g.pointId === id) < 2 ? target.closest('.scene')?.querySelector('.scene-head') ?? target : target; const a = marker.getBoundingClientRect(), b = tree.getBoundingClientRect(); if (a.top < b.top) tree.scrollTop += a.top - b.top; else if (a.bottom > b.bottom) tree.scrollTop += a.bottom - b.bottom; }
}
function restoreLocation() { if (location.hash === lastLocation) return; lastLocation = location.hash; let id = ''; try { id = location.hash.startsWith('#point=') ? decodeURIComponent(location.hash.slice(7)) : ''; } catch { /* An invalid fragment is only navigation. */ } if (points.has(id)) showPoint(id, false); else showOverview(false); }
function saveOpinion(id: string, value: string, explicit = false) {
  if (!points.has(id)) return; notes[id] = value;
  if (explicit && value.trim() && !selected.has(id)) { selected.add(id); toast('本条意见已保存，并纳入导出范围。'); }
  else if (explicit) toast('本条意见已保存到当前浏览器。');
  persist(); updateCounts(); const state = document.getElementById('editor-save-state'); if (state) state.textContent = storageOk ? (explicit ? '本条意见已保存' : '输入已暂存到当前浏览器') : '草稿暂存失败，请保存到本机文件';
}

function requestFeedback(): ReviewFeedback { return makeReviewFeedback(identity, model.expectedReviewNumber, decision, rows.filter(r => selected.has(r.g.pointId)).map(r => r.g.pointId), [...(globalNote.trim() ? [{ pointId: null, text: globalNote }] : []), ...noteEntries()]); }
function exportBlocked() { return { empty: !noteEntries().length && !globalNote.trim(), noScope: !selected.size, outside: noteEntries().filter(c => !selected.has(c.pointId)) }; }
function updateNativeStatus() {
  const b = exportBlocked(); $<HTMLButtonElement>('save-native').disabled = !nativeBase || nativeBusy || b.empty || b.noScope || b.outside.length > 0;
  if (nativeBusy) $('native-status').textContent = '正在写入并核对本机文件……';
  else if (nativeBase) $('native-status').textContent = '本机保存入口已连接。文件写入：' + nativeOutputDir;
  else $('native-status').textContent = '当前是离线副本，意见会暂存到浏览器。从本地审阅入口打开可直接保存文件；也可复制意见交回当前对话保存。';
}
function renderExport() {
  const b = exportBlocked(), valid = !b.empty && !b.noScope && !b.outside.length;
  $('export-body').innerHTML = `<div class="export-metrics"><span><b>${selected.size}</b>导出用例</span><span><b>${noteEntries().length}</b>逐条意见</span><span><b>${globalNote.trim() ? 1 : 0}</b>总体意见</span></div>${b.empty ? '<div class="export-warn">尚无意见。请填写意见，或明确点击“无修改意见”，避免生成空记录。</div>' : ''}${b.noScope ? '<div class="export-warn">尚未选择导出范围。</div>' : ''}${b.outside.length ? `<div class="export-warn">有 ${b.outside.length} 条意见未纳入范围，不会静默丢弃。<br><button id="include-noted">把这些用例纳入导出范围</button></div>` : ''}${globalNote.trim() ? `<div class="export-row"><strong>总体意见</strong><pre>${esc(globalNote)}</pre></div>` : ''}${noteEntries().map(c => `<div class="export-row"><span class="small muted">${esc(c.pointId)}</span><strong>${esc(points.get(c.pointId)!.g.title)}</strong><pre>${esc(c.text)}</pre></div>`).join('')}<div class="decision-row"><label for="export-decision">拟提交结论</label><select id="export-decision" ${nativeBusy ? 'disabled' : ''}><option value="comment_only" ${decision === 'comment_only' ? 'selected' : ''}>仅记录意见</option><option value="changes_requested" ${decision === 'changes_requested' ? 'selected' : ''}>需要修改</option><option value="approved" ${decision === 'approved' ? 'selected' : ''}>拟确认所选范围</option></select></div><p class="small muted">文件保存不会登记正式确认，也不会开始测试。</p><details class="advanced"><summary>浏览器数据备份</summary><button id="download-json" ${valid ? '' : 'disabled'}>下载 JSON 备份</button><p class="small muted">此兼容下载可能带 Windows 来源区域标记。可在本页恢复读取；需要可直接打开的文件时，请使用本机保存。</p>${valid ? `<pre class="export-json">${esc(JSON.stringify(requestFeedback(), null, 2))}</pre>` : ''}</details>`;
  $('saved-links').replaceChildren(); updateNativeStatus();
}
async function connectNative() {
  if (location.protocol !== 'http:' || location.hostname !== '127.0.0.1' || !/^\/review\/[a-f0-9]{48}\/$/.test(location.pathname)) return;
  try {
    const response = await fetch(new URL('capabilities', location.href), { credentials: 'omit', cache: 'no-store' });
    const value: unknown = await response.json();
    if (!response.ok || !isObject(value) || value.kind !== 'case-review-session' || !sameRef(value.cases) || typeof value.outputDir !== 'string') throw Error('本机入口与当前用例不匹配。');
    nativeBase = new URL(location.href); nativeOutputDir = value.outputDir;
    if ($<HTMLDialogElement>('export-dialog').open) updateNativeStatus();
  } catch (error) { nativeBase = null; if ($<HTMLDialogElement>('export-dialog').open) { updateNativeStatus(); $('native-status').textContent = '本机保存未连接：' + (error instanceof Error ? error.message : String(error)); } }
}
async function saveNative() {
  const b = exportBlocked(); if (!nativeBase || nativeBusy || b.empty || b.noScope || b.outside.length) return;
  const request = requestFeedback(), base = nativeBase, controller = new AbortController(); nativeBusy = true; updateNativeStatus();
  const timer = window.setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(new URL('save', base), { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: controller.signal });
    const value: unknown = await response.json();
    if (!response.ok) throw Error(isObject(value) && typeof value.error === 'string' ? value.error : '本机保存失败。');
    if (!isObject(value) || value.nativeWrite !== true || value.reviewRegistered !== false || typeof value.outputDir !== 'string' || !Array.isArray(value.files) || value.files.length !== 2) throw Error('本机保存回执无效。');
    $('saved-links').replaceChildren();
    for (const item of value.files) {
      if (!isObject(item) || typeof item.name !== 'string' || !/^[A-Za-z0-9.-]+\.(?:html|json)$/.test(item.name)) throw Error('本机保存文件名无效。');
      const link = document.createElement('a'); link.href = new URL('files/' + encodeURIComponent(item.name), base).href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = item.name.endsWith('.html') ? '打开可读评审记录' : '查看 JSON 数据'; $('saved-links').append(link);
    }
    let changed = true; try { changed = JSON.stringify(requestFeedback()) !== JSON.stringify(request); } catch { /* A changed scope must not be mistaken for the saved snapshot. */ }
    $('native-status').textContent = (value.replayed === true ? '已核对本次意见的已有文件。' : '已写入并读回核对 HTML 和 JSON。') + '目录：' + value.outputDir + (changed ? ' 当前意见已有新修改，请再次保存。' : '');
  } catch (error) { $('native-status').textContent = '未确认保存成功，浏览器草稿仍保留。可再次保存以核对已有文件。' + (error instanceof Error ? error.message : String(error)); }
  finally { window.clearTimeout(timer); nativeBusy = false; const block = exportBlocked(); $<HTMLButtonElement>('save-native').disabled = !nativeBase || block.empty || block.noScope || !!block.outside.length; }
}
async function importFile(file: File | undefined) {
  if (!file) return;
  try {
    if (file.size > 8 * 1024 * 1024) throw Error('文件超过8MiB读取限制。');
    const feedback = parseReviewFeedback(feedbackFromText(await file.text()), identity, { allowEmpty: true });
    if (!feedback.comments.length) { toast('文件可正常解析，但含0条意见；当前草稿保持原样。'); return; }
    const result = mergeFeedback(feedback); persist(); renderMain(); renderNav();
    toast(`已恢复 ${result.added} 条意见${result.conflicts ? `；${result.conflicts} 处不同内容保留当前草稿` : ''}。未登记正式确认。`);
  } catch (error) { toast('无法导入：' + (error instanceof Error ? error.message : String(error))); }
  finally { $<HTMLInputElement>('import-file').value = ''; }
}
function showSources() {
  const names = { mapped: '已映射', pending: '覆盖待补', out_of_scope: '范围外', retired: '已退役' };
  $('sources-content').innerHTML = `<p>用例版本 v${model.cases.caseVersion} · ${model.baseline.cases.length} 个场景 / ${rows.length} 条用例</p>${model.baseline.coverage.map(c => `<article><strong>${esc(names[c.state])} · ${esc(c.statement)}</strong><p>${paragraph(c.reason)}</p><p class="mono">${esc(c.pointIds.join('、'))}</p></article>`).join('')}${model.baseline.sources.map(s => `<article><strong>${esc(s.id)}</strong><p>${paragraph(s.locator)}</p><p>${paragraph(s.excerpt)}</p>${s.limitations.map(t => `<p>${paragraph(t)}</p>`).join('')}<p class="mono">${esc(s.sha256 ?? '未提供文件指纹')}</p></article>`).join('')}${model.baseline.retiredPoints.length ? `<article>退役编号：${esc(model.baseline.retiredPoints.map(p => p.pointId).join('、'))}</article>` : ''}<p class="mono">用例指纹：${model.cases.sha256}</p>`;
  $<HTMLDialogElement>('sources-dialog').showModal();
}
const themeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-theme-id]')];
function applyTheme(id: string, remember = true) {
  const button = themeButtons.find(b => b.dataset.themeId === id) ?? themeButtons[0]; if (!button) return;
  document.documentElement.dataset.theme = button.dataset.themeId; $('theme-button').textContent = '背景 · ' + button.textContent?.trim();
  themeButtons.forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  if (remember) try { localStorage.setItem('ego-report-theme-v1', button.dataset.themeId ?? 'A'); } catch { /* The current theme still applies. */ }
}
document.addEventListener('input', event => {
  const target = event.target;
  if (target instanceof HTMLTextAreaElement && target.dataset.editor) saveOpinion(target.dataset.editor, target.value);
  else if (target instanceof HTMLTextAreaElement && target.id === 'global-note') { globalNote = target.value; persist(); }
  else if (target instanceof HTMLInputElement && target.id === 'search') renderNav();
  else if (target instanceof HTMLInputElement && target.id === 'overview-search') { filterCollapsed = false; renderOverview(); }
});
document.addEventListener('change', event => {
  const target = event.target;
  if (target instanceof HTMLSelectElement && target.id === 'filter') renderNav();
  else if (target instanceof HTMLSelectElement && target.id === 'overview-filter') { filterCollapsed = false; renderOverview(); }
  else if (target instanceof HTMLInputElement && target.dataset.scope && points.has(target.dataset.scope)) { if (target.checked) selected.add(target.dataset.scope); else selected.delete(target.dataset.scope); persist(); updateCounts(); }
  else if (target instanceof HTMLSelectElement && target.id === 'export-decision' && ['comment_only', 'changes_requested', 'approved'].includes(target.value)) { decision = target.value as FeedbackDecision; persist(); renderExport(); }
  else if (target instanceof HTMLInputElement && target.id === 'import-file') void importFile(target.files?.[0]);
});
document.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return; const button = event.target.closest('button'); if (!button) return;
  const data = button.dataset;
  if (data.ovToggle) { if (expanded.has(data.ovToggle)) expanded.delete(data.ovToggle); else expanded.add(data.ovToggle); renderOverview(); }
  else if (data.ovPoint) showPoint(data.ovPoint);
  else if (data.point) showPoint(data.point);
  else if (data.toggle) { if (openCases.has(data.toggle)) openCases.delete(data.toggle); else openCases.add(data.toggle); persist(); renderNav(); }
  else if (data.scene) { const c = model.baseline.cases.find(c => c.id === data.scene); if (c?.goals[0]) showPoint(c.goals[0].pointId); }
  else if ((button.hasAttribute('data-prev') || button.hasAttribute('data-next')) && current && rows.length) { const index = rows.findIndex(r => r.g.pointId === current), next = (index + (button.hasAttribute('data-prev') ? -1 : 1) + rows.length) % rows.length; showPoint(rows[next]!.g.pointId); }
  else if (data.save) { const field = document.querySelector<HTMLTextAreaElement>('[data-editor="' + CSS.escape(data.save) + '"]'); saveOpinion(data.save, field?.value ?? '', true); }
  else if (data.noChange) { saveOpinion(data.noChange, '无修改意见。', true); renderMain(); }
  else if (data.themeId) { applyTheme(data.themeId); $('theme-menu').hidden = true; }
  else switch (button.id) {
    case 'overview-tab': case 'overview-back': showOverview(); break;
    case 'workbench-tab': if (current) showPoint(current); break;
    case 'overview-expand-all': filterCollapsed = false; model.baseline.cases.forEach(c => expanded.add(c.id)); renderOverview(); break;
    case 'overview-collapse-all': filterCollapsed = true; expanded.clear(); renderOverview(); break;
    case 'overview-reset': $<HTMLInputElement>('overview-search').value = ''; $<HTMLSelectElement>('overview-filter').value = 'all'; filterCollapsed = false; renderOverview(); break;
    case 'collapse-all': openCases.clear(); persist(); renderNav(); break;
    case 'locate-current': if (current) { openCases.add(points.get(current)!.c.id); renderNav(); document.querySelector('[data-point="' + CSS.escape(current) + '"]')?.scrollIntoView({ block: 'nearest' }); } break;
    case 'reset-filters': $<HTMLInputElement>('search').value = ''; $<HTMLSelectElement>('filter').value = 'all'; openCases.clear(); persist(); renderNav(); break;
    case 'all-scope': selected = new Set(identity.pointIds); persist(); renderNav(); renderMain(); toast(`已将全部 ${rows.length} 条用例纳入导出范围。`); break;
    case 'clear-scope': selected.clear(); persist(); renderNav(); renderMain(); toast('范围已清空，已有意见仍然保留。'); break;
    case 'import-review': $<HTMLInputElement>('import-file').click(); break;
    case 'export-review': renderExport(); $<HTMLDialogElement>('export-dialog').showModal(); break;
    case 'close-export': $<HTMLDialogElement>('export-dialog').close(); renderMain(); renderNav(); break;
    case 'include-noted': noteEntries().forEach(c => selected.add(c.pointId)); persist(); updateCounts(); renderExport(); break;
    case 'save-native': void saveNative(); break;
    case 'download-json': {
      const b = exportBlocked(); if (b.empty || b.noScope || b.outside.length) break;
      const url = URL.createObjectURL(new Blob([JSON.stringify(requestFeedback(), null, 2) + '\n'], { type: 'application/json;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = 'v' + String(model.cases.caseVersion).padStart(3, '0') + '-review-feedback.json'; document.body.append(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 15000); toast('已发起浏览器备份下载；可在本页恢复读取。'); break;
    }
    case 'copy-review': {
      const text = `${model.baseline.project} · 用例 v${model.cases.caseVersion} 评审意见\n\n` + (globalNote.trim() ? `总体意见\n${globalNote}\n\n` : '') + noteEntries().map(c => `${c.pointId} · ${points.get(c.pointId)!.g.title}\n${c.text}`).join('\n\n');
      if (!navigator.clipboard) { toast('当前浏览器未提供复制接口，可直接选中预览文字复制。'); break; }
      void navigator.clipboard.writeText(text).then(() => toast('已复制评审文字。')).catch(() => toast('复制未获允许，可直接选中预览文字复制。')); break;
    }
    case 'theme-button': { const index = themeButtons.findIndex(b => b.dataset.themeId === document.documentElement.dataset.theme); applyTheme(themeButtons[(index + 1) % themeButtons.length]?.dataset.themeId ?? 'A'); break; }
    case 'theme-options-button': $('theme-menu').hidden = !$('theme-menu').hidden; break;
    case 'show-sources': showSources(); break;
    case 'close-sources': $<HTMLDialogElement>('sources-dialog').close(); break;
  }
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') $('theme-menu').hidden = true; });
window.addEventListener('popstate', restoreLocation); window.addEventListener('hashchange', restoreLocation);
$('project-title').textContent = model.baseline.project + ' · 用例审阅'; $('variant-label').textContent = '用例总览与逐条评审';
$('case-count').textContent = String(model.baseline.cases.length); $('point-count').textContent = String(rows.length); $('gap-count').textContent = String(rows.filter(r => r.g.planState === 'unprepared').length);
document.querySelector('.tab-count')!.textContent = model.baseline.cases.length + ' 场景';
$<HTMLButtonElement>('workbench-tab').disabled = !rows.length;
let theme = 'A'; try { theme = localStorage.getItem('ego-report-theme-v1') ?? 'A'; } catch { /* Theme storage is optional. */ } applyTheme(theme, false);
renderMain(); renderNav(); persist();
try { history.scrollRestoration = 'manual'; } catch { /* Manual return position remains usable. */ }
if (!location.hash) history.replaceState({ caseReview: true }, '', '#overview'); restoreLocation();
void connectNative();
