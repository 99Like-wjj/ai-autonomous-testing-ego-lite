import { uiText as u, uiMarkup, uiHtml, uiTemplate, formatUi } from '../report/ui-text.mjs';
import type { Baseline, Case, CasesRef, Goal } from '../contracts/model.mjs';
import { goalPlan } from '../contracts/case-view.mjs';
import { feedbackFromText, makeReviewFeedback, parseReviewFeedback, type FeedbackDecision, type ReviewFeedback } from '../contracts/review-feedback.mjs';
import { reviewDocuments } from '../report/review-feedback-document.mjs';
import { boundedPosition, filteredNeighbor, type ReadingPosition } from './reading-position.js';
import { saveReviewFile, type ReviewFile, type SaveHost } from './save-file.mjs';

interface Model { kind: 'case_review'; schemaVersion: 9; cases: CasesRef; baseline: Baseline; expectedReviewNumber: number; initialFeedback: ReviewFeedback | null }
interface Row { c: Case; g: Goal }
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => { const el = document.getElementById(id); if (!el) throw Error(u('缺少审阅控件：') + id); return el as T; };
const model = JSON.parse($('case-data').textContent ?? 'null') as Model;
if (model.kind !== 'case_review' || model.schemaVersion !== 9) throw Error(u('不支持的用例审阅页面。'));
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
const expanded = new Set<string>(), approved = new Set<string>();
const readingPositions = new Map<string, ReadingPosition>();
const historyPositions = new Map<string, ReadingPosition>();
const documentSession = Date.now().toString(36) + Math.random().toString(36).slice(2);
let entrySequence = 0, activeEntry = documentSession + '-' + entrySequence++;
let restoringPosition = false;
let filterCollapsed = false, toastTimer: number | undefined;
let exportBusy = false;
let pendingDownload: { file: ReviewFile; request: string } | null = null;

function noteEntries() { return rows.flatMap(r => (notes[r.g.pointId] ?? '').trim() ? [{ pointId: r.g.pointId, text: notes[r.g.pointId]! }] : []); }
function toast(text: string) { $('toast').textContent = text; $('toast').hidden = false; window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { $('toast').hidden = true; }, 5000); }
function persist() {
  try { localStorage.setItem(key, JSON.stringify({ draftVersion: 1, cases: model.cases, notes, globalNote, current, selected: [...selected], openCases: [...openCases], approved: [...approved], decision })); storageOk = true; } catch { storageOk = false; }
  $('storage-status').textContent = storageOk ? u('意见草稿已暂存到当前浏览器') : u('当前浏览器无法暂存草稿，请导出评审结果或复制完整数据');
}
function mergeFeedback(feedback: ReviewFeedback) {
  const incoming: Record<string, string> = Object.create(null) as Record<string, string>; let overall = '';
  for (const comment of feedback.comments) {
    if (comment.pointId === null) overall += (overall ? '\n\n' : '') + comment.text;
    else incoming[comment.pointId] = (incoming[comment.pointId] ? incoming[comment.pointId] + '\n\n' : '') + comment.text;
  }
  let added = 0, conflicts = 0;
  const hadNotes = noteEntries().length > 0 || !!globalNote.trim();
  for (const [id, text] of Object.entries(incoming)) { if (!(notes[id] ?? '').trim()) { notes[id] = text; approved.delete(id); added++; } else if (notes[id] !== text) conflicts++; }
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
    if (Array.isArray(value.approved)) for (const id of value.approved) if (typeof id === 'string' && points.has(id) && !(notes[id] ?? '').trim()) approved.add(id);
    restored = true;
  }
} catch { /* Leave an unreadable stored value intact; a file import can recover it. */ }
if (!restored && model.initialFeedback) mergeFeedback(parseReviewFeedback(model.initialFeedback, identity, { allowEmpty: true }));

const basisNames = { explicit: u('需求明确规定'), interpretation: u('需求解释'), hypothesis: u('探索性假设') };
const parameterTypes: Record<string, string> = { string: u('文本'), number: u('数值'), integer: u('整数'), boolean: u('是/否'), array: u('列表'), object: u('结构化对象'), null: u('空值') };
function badges(g: Goal): string { return `<span class="badge${g.planState === 'unprepared' ? ' warn' : ''}">${g.planState === 'prepared' ? u('计划已准备') : u('计划待补充')}</span>${g.clarificationQuestions.length ? uiMarkup('<span class="badge warn">规则待确认</span>') : ''}`; }
function matches(r: Row, search: string, filter: string): boolean {
  const q = search.trim().toLowerCase(), text = `${r.c.id} ${r.c.title} ${r.g.pointId} ${r.g.title} ${r.g.expected}`.toLowerCase(), note = !!(notes[r.g.pointId] ?? '').trim();
  return (!q || text.includes(q)) && (filter === 'all' || filter === 'prepared' && r.g.planState === 'prepared' || filter === 'unprepared' && r.g.planState === 'unprepared' || filter === 'clarification' && r.g.clarificationQuestions.length > 0 || filter === 'has-note' && note || filter === 'no-note' && !note && !approved.has(r.g.pointId) || filter === 'approved' && approved.has(r.g.pointId));
}
function updateCounts() {
  $('notes-count').textContent = String(noteEntries().length); $('scope-total').textContent = String(selected.size);
  $('nav-foot-count').textContent = uiTemplate`已写意见 ${noteEntries().length} 项 · 导出范围 ${selected.size} 项`;
  document.querySelectorAll<HTMLElement>('[data-note-indicator]').forEach(el => { el.hidden = !(notes[el.dataset.noteIndicator ?? ''] ?? '').trim(); });
  document.querySelectorAll<HTMLElement>('[data-review-mark]').forEach(el => { const id = el.dataset.reviewMark!; el.classList.toggle('review-approved', approved.has(id)); el.textContent = approved.has(id) ? u('✓ 评审通过') : (notes[id] ?? '').trim() ? u('已写意见') : u('待评审'); });
  updatePager();
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
    return uiHtml`<section class="ov-scene" data-overview-case="${esc(c.id)}"><button class="ov-scene-toggle" data-ov-toggle="${esc(c.id)}" aria-expanded="${open}" aria-controls="children-${esc(c.id)}"><span class="ov-chevron" aria-hidden="true">›</span><span class="ov-scene-title">${esc(c.title)}<span class="ov-scene-id">${esc(c.id)}</span>${goals.length < c.goals.length ? uiHtml`<span class="ov-scene-sub">当前命中 ${goals.length} 条用例</span>` : ''}</span><span class="ov-count"><b>${c.goals.length}</b>条</span><span class="ov-plan">计划已准备 ${ready}/${c.goals.length}${questions ? uiHtml`<span class="need">${questions} 条规则待确认</span>` : ready < c.goals.length ? uiHtml`<span class="need">${c.goals.length - ready} 条计划待补充</span>` : ''}</span><span class="ov-opinion${commented ? ' has-note' : ''}">${commented ? uiHtml`<span class="ov-note-count">${commented}</span>条意见` : u('暂无意见')}</span></button><div id="children-${esc(c.id)}" class="ov-cases" role="group" aria-label="${esc(c.title)}下的用例" ${open ? '' : 'hidden'}><div class="ov-child-head" aria-hidden="true"><span>用例编号</span><span>用例与业务预期</span><span>计划状态</span><span>评审意见</span><span></span></div>${goals.map(g => uiHtml`<button class="ov-point" data-ov-point="${esc(g.pointId)}" aria-label="查看与评审：${esc(g.title)}"><span class="ov-point-id">${esc(g.pointId)}</span><span class="ov-point-copy"><span class="ov-point-title">${esc(g.title)}</span><span class="ov-point-expected" title="${esc(g.expected)}">${esc(g.expected)}</span></span><span class="ov-point-state">${badges(g)}</span><span class="ov-opinion">${reviewMark(g.pointId)}</span><span class="ov-point-open">查看与评审 →</span></button>`).join('')}</div></section>`;
  }).join('') || uiMarkup('<div class="overview-empty">没有匹配的场景或用例，可清空搜索或重置筛选。</div>');
  $('overview-result').textContent = filtered ? formatUi('命中 {scenes}/{totalScenes} 个场景 · {cases}/{totalCases} 条用例',{scenes,totalScenes:model.baseline.cases.length,cases:count,totalCases:rows.length}) : formatUi('全部 {scenes} 个场景 · {cases} 条用例',{scenes,cases:count});
  $('overview-opinions').textContent = uiTemplate`已保留 ${noteEntries().length} 条逐条意见`;
}
function renderNav() {
  const treeY = $('tree').scrollTop;
  const query = $<HTMLInputElement>('search').value, filter = $<HTMLSelectElement>('filter').value, visible = rows.filter(r => matches(r, query, filter));
  $('filter-count').textContent = uiTemplate`${visible.length} 项`;
  $('tree').innerHTML = model.baseline.cases.map(c => {
    const items = visible.filter(r => r.c.id === c.id); if (!items.length) return '';
    const open = openCases.has(c.id) || !!query.trim(), active = current ? points.get(current)?.c.id === c.id : false;
    return uiHtml`<div class="scene"><div class="scene-head${active ? ' current' : ''}"><button class="scene-toggle" data-toggle="${esc(c.id)}" aria-label="${esc(open ? u('收起') : u('展开'))}场景${esc(c.id)}" aria-expanded="${open}">${open ? '▾' : '▸'}</button><button class="scene-pick" data-scene="${esc(c.id)}">${esc(c.title)}<span class="scene-n">${esc(c.id)} · ${c.goals.length} 个测试点</span></button></div>${open ? `<div class="scene-goals">${items.map(({ g }) => `<button class="point-nav" data-point="${esc(g.pointId)}" aria-current="${current === g.pointId}"><span class="point-id"><span>${esc(g.pointId)}</span><i class="note-dot" data-note-indicator="${esc(g.pointId)}" ${(notes[g.pointId] ?? '').trim() ? '' : 'hidden'}></i></span>${esc(g.title)}${approved.has(g.pointId) ? reviewMark(g.pointId) : ''}</button>`).join('')}</div>` : ''}</div>`;
  }).join('') || uiMarkup('<div class="blank">没有匹配项，正文阅读位置保持不变。</div>');
  updateCounts(); $('tree').scrollTop = treeY;
}
function renderMain() {
  const row = current ? points.get(current) : undefined;
  if (!row) { $('main-body').innerHTML = uiMarkup('<div class="reader-empty">没有已定义用例，请先补全设计。</div>'); $('review-pane').replaceChildren(); return; }
  const { c, g } = row, plan = goalPlan(c, g);
  $('breadcrumbs').textContent = uiTemplate`测试用例 / ${c.title} / ${g.pointId} · v${model.cases.caseVersion}`;
  const questions = [...g.clarificationQuestions, ...g.preparationGaps];
  $('main-body').innerHTML = uiHtml`<section class="scene-banner"><span class="eyebrow">业务场景 ${esc(c.id)}</span><h2>${esc(c.title)}</h2><p>${c.goals.length} 个独立目标 · 当前查看 1 项</p></section><article class="point-card"><div class="point-overview"><div class="point-kicker"><span class="target-number">${esc(g.pointId)}</span><div class="badges">${badges(g)}${reviewMark(g.pointId)}</div></div><h2>${esc(g.title)}</h2><p class="expected"><span class="expected-label">业务预期</span>${paragraph(g.expected)}</p><div class="point-controls"><label><input type="checkbox" data-scope="${esc(g.pointId)}" ${selected.has(g.pointId) ? 'checked' : ''}>纳入导出范围</label><div class="pager"><button data-prev>← 上一用例</button><button data-next>下一用例 →</button></div></div></div><div class="point-body">${questions.length ? `<section class="questions"><h3>${g.clarificationQuestions.length ? u('执行前待确认') : u('计划仍需补充')}</h3><ul>${questions.map(t => `<li>${paragraph(t)}</li>`).join('')}</ul></section>` : ''}<div class="plan-grid"><section><div class="section-heading"><h3>执行步骤</h3><span class="section-caption">${c.stepOrder === 'strict' ? u('按依赖顺序执行') : u('方法可调整，依赖须保留')}</span></div>${plan.steps.map(s => `<div class="step"><span class="step-num">${s.number}</span><div class="step-text">${paragraph(s.text)}${s.dependsOn.length ? uiHtml`<div class="dependency">先完成：步骤 ${s.dependsOn.join('、')}</div>` : ''}<span class="required-tag">${s.required ? u('本目标必要步骤') : u('前置依赖步骤')}</span></div></div>`).join('') || uiMarkup('<p class="small muted">尚未定义必要步骤。</p>')}</section><section><div class="section-heading"><h3>必要前提与路径</h3></div>${plan.conditions.map(item => `<div class="condition"><strong>${esc(item.label)}</strong><p>${paragraph(item.text)}</p></div>`).join('')}${plan.path ? uiHtml`<div class="path-block"><strong>必须经过的业务路径</strong>${paragraph(plan.path)}</div>` : ''}</section></div><details class="source-block"><summary>需求依据与完整场景计划</summary><p>${esc(basisNames[g.basis.kind])} · ${esc(g.basis.source)}</p><p>${paragraph(g.basis.text)}</p>${c.steps.map((s, i) => uiHtml`<p>步骤 ${i + 1}：${paragraph(s.action)}</p>`).join('')}${c.parameters.map(p => uiHtml`<p>测试数据 ${esc(p.id)}（${esc(parameterTypes[p.type] ?? p.type)}）：${paragraph(p.purpose)}；${paragraph(p.constraints.join('；'))}</p>`).join('')}</details><details class="tech"><summary>技术原文与来源指纹</summary><pre>${esc(JSON.stringify({ pointId: g.pointId, caseId: c.id, goalId: g.id, requiredRefs: g.requiredRefs, resolvedRequiredRefs: plan.refs, casePlan: { criticalConditions: c.criticalConditions, requiredPath: c.requiredPath, stepOrder: c.stepOrder, steps: c.steps, parameters: c.parameters }, sourceRefIds: g.basis.sourceRefIds, cases: model.cases }, null, 2))}</pre></details></div></article>`;
  renderReview(g);
  updatePager();
}
function setView(mode: 'overview' | 'workbench') {
  viewMode = mode; document.body.dataset.view = mode;
  $('overview-view').hidden = mode !== 'overview'; $('workbench-view').hidden = mode !== 'workbench'; $('overview-back').hidden = mode !== 'workbench';
  $('overview-tab').setAttribute('aria-current', mode === 'overview' ? 'page' : 'false'); $('workbench-tab').setAttribute('aria-current', mode === 'workbench' ? 'page' : 'false');
  $('view-location-text').textContent = mode === 'overview' ? u('先展开场景，再选择用例') : (current ? `${points.get(current)?.c.id ?? ''} / ${current}` : u('尚无用例'));
}
function positionKey() { return viewMode === 'overview' ? '#overview' : current ?? ''; }
function capturePosition(): ReadingPosition {
  const editor = document.querySelector<HTMLTextAreaElement>('[data-editor]');
  return { pageY: scrollY, treeY: $('tree').scrollTop, reviewY: $('review-pane').scrollTop,
    editorY: editor?.scrollTop ?? 0, editorStart: editor?.selectionStart ?? 0, editorEnd: editor?.selectionEnd ?? 0, globalEditorY: document.querySelector<HTMLTextAreaElement>('#global-note')?.scrollTop ?? 0,
    details: [...document.querySelectorAll<HTMLDetailsElement>('#main-body details')].map(d => d.open), reviewDetails: [...document.querySelectorAll<HTMLDetailsElement>('#review-pane details')].map(d => d.open),
    search: $<HTMLInputElement>('search').value, filter: $<HTMLSelectElement>('filter').value, openCases: [...openCases],
    overviewSearch: $<HTMLInputElement>('overview-search').value, overviewFilter: $<HTMLSelectElement>('overview-filter').value, expanded: [...expanded], filterCollapsed };
}
function rememberPosition(updateHistory = true) {
  if (restoringPosition) return;
  const reading = capturePosition(); readingPositions.set(positionKey(), reading); historyPositions.set(activeEntry, reading);
  if (updateHistory) try { history.replaceState({ caseReview: true, casesSha: model.cases.sha256, documentSession, entryKey: activeEntry, route: location.hash, reading }, '', location.hash || '#overview'); } catch { /* The current page remains readable. */ }
}
function restorePosition(p: ReadingPosition) {
  const editor = document.querySelector<HTMLTextAreaElement>('[data-editor]');
  if (editor) { editor.setSelectionRange(p.editorStart, p.editorEnd); editor.scrollTop = boundedPosition(p.editorY, editor.scrollHeight - editor.clientHeight); }
  const global = document.querySelector<HTMLTextAreaElement>('#global-note'); if (global) global.scrollTop = boundedPosition(p.globalEditorY, global.scrollHeight - global.clientHeight);
  document.querySelectorAll<HTMLDetailsElement>('#main-body details').forEach((d, i) => d.open = p.details[i] ?? false);
  document.querySelectorAll<HTMLDetailsElement>('#review-pane details').forEach((d, i) => d.open = p.reviewDetails[i] ?? d.open);
  $('tree').scrollTop = boundedPosition(p.treeY, $('tree').scrollHeight - $('tree').clientHeight);
  $('review-pane').scrollTop = boundedPosition(p.reviewY, $('review-pane').scrollHeight - $('review-pane').clientHeight);
  window.scrollTo({ top: boundedPosition(p.pageY, document.documentElement.scrollHeight - innerHeight), behavior: 'instant' });
}
function restoreFilters(p: ReadingPosition) {
  $<HTMLInputElement>('search').value = p.search; $<HTMLSelectElement>('filter').value = p.filter;
  $<HTMLInputElement>('overview-search').value = p.overviewSearch; $<HTMLSelectElement>('overview-filter').value = p.overviewFilter;
  openCases = new Set(p.openCases); expanded.clear(); p.expanded.forEach(id => expanded.add(id)); filterCollapsed = p.filterCollapsed;
}
function route(hash: string) { if (location.hash !== hash) { activeEntry = documentSession + '-' + entrySequence++; history.pushState({ caseReview: true, casesSha: model.cases.sha256, documentSession, entryKey: activeEntry, route: hash }, '', hash); } lastLocation = hash; }
function showOverview(push = true, saved?: ReadingPosition) {
  if (push && viewMode === 'overview') return;
  if (push) rememberPosition(); else rememberPosition(false);
  restoringPosition = true; if (saved) restoreFilters(saved); setView('overview'); renderOverview(); if (push) route('#overview');
  const position = saved ?? readingPositions.get('#overview'); if (position) restorePosition(position); else window.scrollTo({ top: overviewReturnY, behavior: 'instant' });
  restoringPosition = false; rememberPosition();
}
function showPoint(id: string, push = true, saved?: ReadingPosition) {
  const row = points.get(id); if (!row || push && viewMode === 'workbench' && current === id) return;
  if (viewMode === 'overview') overviewReturnY = scrollY;
  if (push) rememberPosition(); else rememberPosition(false);
  restoringPosition = true; if (saved) restoreFilters(saved);
  current = id; openCases.add(row.c.id); persist(); setView('workbench'); renderMain(); renderNav(); if (push) route('#point=' + encodeURIComponent(id));
  const position = saved ?? readingPositions.get(id);
  if (position) restorePosition(position);
  else {
    $('review-pane').scrollTop = 0;
    const top = $('workbench-view').getBoundingClientRect().top + scrollY - (document.querySelector('.view-nav')?.getBoundingClientRect().height ?? 0) - 12;
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
    const target = document.querySelector<HTMLElement>('#tree [data-point="' + CSS.escape(id) + '"]'), tree = $('tree');
    if (target) { const a = target.getBoundingClientRect(), b = tree.getBoundingClientRect(); if (a.top < b.top) tree.scrollTop += a.top - b.top; else if (a.bottom > b.bottom) tree.scrollTop += a.bottom - b.bottom; }
  }
  restoringPosition = false; rememberPosition();
}
function restoreLocation() {
  if (location.hash === lastLocation) return; lastLocation = location.hash;
  let id = ''; try { id = location.hash.startsWith('#point=') ? decodeURIComponent(location.hash.slice(7)) : ''; } catch { /* An invalid fragment is only navigation. */ }
  const h = history.state as { casesSha?: string; route?: string; documentSession?: string; entryKey?: string; reading?: ReadingPosition } | null;
  const ownEntry = h?.casesSha === model.cases.sha256 && h.route === location.hash && h.documentSession === documentSession;
  // popstate already selected the destination entry; cache the departing position without replacing that entry.
  rememberPosition(false);
  const saved = ownEntry && h?.entryKey ? historyPositions.get(h.entryKey) ?? h.reading : undefined;
  activeEntry = ownEntry && h?.entryKey ? h.entryKey : documentSession + '-' + entrySequence++;
  restoringPosition = true;
  if (points.has(id)) showPoint(id, false, saved); else showOverview(false, saved);
}
function reviewMark(id: string) { return '<span class="badge' + (approved.has(id) ? ' review-approved' : '') + '" data-review-mark="' + esc(id) + '">' + (approved.has(id) ? u('✓ 评审通过') : (notes[id] ?? '').trim() ? u('已写意见') : u('待评审')) + '</span>'; }
function renderReview(g: Goal) {
  const pane = $('review-pane');
  if (!document.getElementById('current-review')) pane.innerHTML = uiHtml`<div id="current-review"></div><details class="global-note" open><summary>总体评审意见</summary><textarea id="global-note" aria-label="总体评审意见" placeholder="填写适用于整个范围的建议……">${esc(globalNote)}</textarea></details>`;
  const overall = $<HTMLTextAreaElement>('global-note'); if (overall.value !== globalNote) overall.value = globalNote;
  const lead = '<div class="review-lead"><div><h3>' + (approved.has(g.pointId) ? u('本用例评审通过') : u('本用例评审意见')) + '</h3><p class="review-context">' + esc(g.title) + '<br>' + esc(g.pointId) + '</p></div>' + reviewMark(g.pointId) + '</div>';
  $('current-review').innerHTML = approved.has(g.pointId)
    ? lead + '<div class="review-pass-summary"><p>' + u('已收起本条意见编辑区，可继续评审并补充意见。') + '</p><button data-resume-review="' + esc(g.pointId) + '">' + u('继续评审') + '</button></div>'
    : lead + uiHtml`<textarea class="review-editor" data-editor="${esc(g.pointId)}" aria-label="本用例评审意见" placeholder="填写业务预期、步骤、依赖或数据条件方面的意见……">${esc(notes[g.pointId] ?? '')}</textarea><div class="review-actions"><span id="editor-save-state">${restored ? u('已恢复当前浏览器草稿') : u('输入会暂存到当前浏览器')}</span><div><button class="review-pass-button" data-approve-review="${esc(g.pointId)}">✓ 评审通过</button> <button class="primary" data-save="${esc(g.pointId)}">保存本条意见</button></div></div><p class="draft-hint">切换与返回总览保留输入。评审通过标记不进入修改意见导出。</p>`;
}
function passReview(id: string) {
  if (id !== current) return;
  notes[id] = ''; approved.add(id); persist(); renderReview(points.get(id)!.g); renderNav();
  document.querySelector<HTMLElement>('[data-resume-review]')?.focus({ preventScroll: true }); toast(u('本用例已评审通过，编辑区已收起。'));
}
function approveReview(id: string) {
  if (!(notes[id] ?? '').trim()) { passReview(id); return; }
  let dialog = document.getElementById('approve-review-dialog') as HTMLDialogElement | null;
  if (!dialog) { dialog = document.createElement('dialog'); dialog.id = 'approve-review-dialog'; dialog.setAttribute('aria-labelledby', 'approve-review-title'); dialog.innerHTML = uiMarkup('<header class="dialog-head"><h2 id="approve-review-title">本条已有修改意见</h2></header><div class="dialog-body"><p>评审通过表示当前无需修改。确认后将清空本条意见，总体意见保留。</p><pre id="approve-review-text" class="review-confirm-text"></pre></div><footer class="dialog-footer"><button data-cancel-approve>保留意见，继续编辑</button><button class="review-pass-button" data-confirm-approve>清空本条意见并评审通过</button></footer>'); document.body.append(dialog); }
  dialog.dataset.pointId = id; $('approve-review-text').textContent = notes[id]!; dialog.showModal();
}
function visibleRows() { return rows.filter(r => matches(r, $<HTMLInputElement>('search').value, $<HTMLSelectElement>('filter').value)); }
function updatePager() {
  const visible = visibleRows(), index = visible.findIndex(r => r.g.pointId === current);
  document.querySelectorAll<HTMLButtonElement>('[data-prev]').forEach(b => b.disabled = index <= 0);
  document.querySelectorAll<HTMLButtonElement>('[data-next]').forEach(b => b.disabled = index < 0 || index >= visible.length - 1);
  const controls = document.querySelector('.pager');
  if (controls) { let note = controls.querySelector('.pager-position'); if (!note) { note = document.createElement('span'); note.className = 'pager-position'; controls.prepend(note); } note.textContent = index < 0 ? u('当前用例未命中筛选') : (index + 1) + ' / ' + visible.length; }
}
function updateScopeControl() { const input = document.querySelector<HTMLInputElement>('[data-scope]'); if (input && current) input.checked = selected.has(current); }
function saveOpinion(id: string, value: string, explicit = false) {
  if (!points.has(id)) return; notes[id] = value; approved.delete(id);
  if (explicit && value.trim() && !selected.has(id)) { selected.add(id); toast(u('本条意见已保存，并纳入导出范围。')); }
  else if (explicit) toast(u('本条意见已保存到当前浏览器。'));
  persist(); updateCounts(); const state = document.getElementById('editor-save-state'); if (state) state.textContent = storageOk ? (explicit ? u('本条意见已保存') : u('输入已暂存到当前浏览器')) : u('草稿暂存失败，请导出评审结果');
}

function requestFeedback(): ReviewFeedback { return makeReviewFeedback(identity, model.expectedReviewNumber, decision === 'approved' || !noteEntries().length ? 'comment_only' : decision, noteEntries().map(c => c.pointId), [...(globalNote.trim() ? [{ pointId: null, text: globalNote }] : []), ...noteEntries()]); }
function exportBlocked() { return { empty: !noteEntries().length && !globalNote.trim(), noScope: noteEntries().length > 0 && !selected.size, outside: noteEntries().filter(c => !selected.has(c.pointId)) }; }
function saveHost(): SaveHost {
  const pick = (window as unknown as { showSaveFilePicker?: SaveHost['pick'] }).showSaveFilePicker;
  return {
    ...(typeof pick === 'function' && window.isSecureContext ? { pick: (options: Parameters<NonNullable<SaveHost['pick']>>[0]) => pick.call(window, options) } : {}),
    download(file) {
      const url = URL.createObjectURL(new Blob([file.content], { type: file.mime }));
      const link = document.createElement('a'); link.href = url; link.download = file.name; document.body.append(link);
      try { link.click(); } finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 15000); }
    }
  };
}
function updateExportControls() {
  const b = exportBlocked(), blocked = exportBusy || b.empty || b.noScope || b.outside.length > 0;
  for (const id of ['save-html', 'save-json', 'download-html', 'download-json', 'copy-review']) $<HTMLButtonElement>(id).disabled = !!blocked;
  $<HTMLButtonElement>('save-html').textContent = saveHost().pick ? u('保存评审结果 HTML') : u('下载评审结果 HTML');
  $<HTMLButtonElement>('download-export').disabled = exportBusy;
  $('export-fallback').hidden = !pendingDownload;
}
function renderExport() {
  const b = exportBlocked(), valid = !b.empty && !b.noScope && !b.outside.length;
  const commentCount = noteEntries().length;
  $('export-body').innerHTML = uiHtml`<div class="export-metrics"><span><b>${commentCount}</b>导出用例</span><span><b>${noteEntries().length}</b>逐条意见</span><span><b>${globalNote.trim() ? 1 : 0}</b>总体意见</span></div>${b.empty ? uiMarkup('<div class="export-warn">尚无修改意见。评审通过和未填写意见的用例不会导出。</div>') : ''}${b.noScope ? uiMarkup('<div class="export-warn">尚未选择导出范围。</div>') : ''}${b.outside.length ? uiHtml`<div class="export-warn">有 ${b.outside.length} 条意见未纳入范围，不会静默丢弃。<br><button id="include-noted">把这些用例纳入导出范围</button></div>` : ''}${globalNote.trim() ? uiHtml`<div class="export-row"><strong>总体意见</strong><pre>${esc(globalNote)}</pre></div>` : ''}${noteEntries().map(c => `<div class="export-row"><span class="small muted">${esc(c.pointId)}</span><strong>${esc(points.get(c.pointId)!.g.title)}</strong><pre>${esc(c.text)}</pre></div>`).join('')}<div class="decision-row"><label for="export-decision">拟提交结论</label><select id="export-decision" ${exportBusy ? 'disabled' : ''}><option value="comment_only" ${decision === 'comment_only' ? 'selected' : ''}>仅记录意见</option><option value="changes_requested" ${decision === 'changes_requested' ? 'selected' : ''}>需要修改</option></select></div><p class="small muted">文件保存不会登记正式确认，也不会开始测试。</p><details class="advanced"><summary>更多导出方式与完整数据</summary><button id="download-html">直接下载 HTML</button> <button id="save-json">导出 JSON 数据</button> <button id="download-json">直接下载 JSON</button><p class="small muted">HTML 可独立阅读并恢复意见；JSON 用于数据交换。下载后请核对实际文件，浏览器提示不代表已通过 Windows 打开验证。</p>${valid ? `<textarea id="export-data" aria-label="${esc(u('完整评审数据'))}" class="export-json" readonly rows="8" style="width:100%">${esc(JSON.stringify(requestFeedback(), null, 2))}</textarea>` : ''}</details>`;
  pendingDownload = null;
  $('export-status').textContent = u('直接从此离线页面导出，无需启动服务。浏览器草稿不能替代已导出的文件。');
  updateExportControls();
}
async function writeExport(file: ReviewFile, request: string, downloadOnly = false) {
  exportBusy = true; pendingDownload = null; updateExportControls();
  $('export-status').textContent = u('正在导出评审结果，草稿仍保留……');
  try {
    const result = await saveReviewFile(file, saveHost(), downloadOnly);
    let changed = true; try { changed = JSON.stringify(requestFeedback()) !== request; } catch { /* Current edits are independent from the exported snapshot. */ }
    const suffix = changed ? u(' 当前内容已有新修改，导出的是点击时的版本。') : '';
    if (result.status === 'saved') $('export-status').textContent = u('已保存并读回核对：') + file.name + suffix;
    else if (result.status === 'download_requested') $('export-status').textContent = u('已发起下载，请核对实际文件：') + file.name + suffix;
    else if (result.status === 'cancelled') $('export-status').textContent = u('已取消保存，评审草稿保持原样。');
    else { pendingDownload = { file, request }; $('export-status').textContent = u('未确认保存成功，草稿仍保留。可下载本次快照或复制完整数据。') + ' ' + result.message; }
  } finally { exportBusy = false; updateExportControls(); }
}
function exportFile(format: 'html' | 'json', downloadOnly = false) {
  const b = exportBlocked(); if (exportBusy || b.empty || b.noScope || b.outside.length) return;
  try {
    const request = requestFeedback(), titles = new Map(rows.map(r => [r.g.pointId, r.g.title]));
    const documents = reviewDocuments(request, identity, model.baseline.project, titles);
    const stamp = new Date().toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', '');
    const file: ReviewFile = { name: 'v' + String(model.cases.caseVersion).padStart(3, '0') + '-review-' + stamp + '.' + format,
      content: documents[format], extension: format === 'html' ? '.html' : '.json', mime: format === 'html' ? 'text/html;charset=utf-8' : 'application/json;charset=utf-8', description: format === 'html' ? u('评审结果 HTML') : u('评审 JSON 数据') };
    void writeExport(file, JSON.stringify(request), downloadOnly);
  } catch (error) { $('export-status').textContent = u('无法导出，草稿仍保留：') + (error instanceof Error ? error.message : String(error)); }
}
async function importFile(file: File | undefined) {
  if (!file) return;
  try {
    if (file.size > 8 * 1024 * 1024) throw Error(u('文件超过8MiB读取限制。'));
    const feedback = parseReviewFeedback(feedbackFromText(await file.text()), identity, { allowEmpty: true });
    if (!feedback.comments.length) { toast(u('文件可正常解析，但含0条意见；当前草稿保持原样。')); return; }
    const result = mergeFeedback(feedback); persist(); if (current) renderReview(points.get(current)!.g); updateScopeControl(); renderNav();
    toast(uiTemplate`已恢复 ${result.added} 条意见${result.conflicts ? uiTemplate`；${result.conflicts} 处不同内容保留当前草稿` : ''}。未登记正式确认。`);
  } catch (error) { toast(u('无法导入：') + (error instanceof Error ? error.message : String(error))); }
  finally { $<HTMLInputElement>('import-file').value = ''; }
}
function showSources() {
  const names = { mapped: u('已映射'), pending: u('覆盖待补'), out_of_scope: u('范围外'), retired: u('已退役') };
  $('sources-content').innerHTML = uiHtml`<p>用例版本 v${model.cases.caseVersion} · ${model.baseline.cases.length} 个场景 / ${rows.length} 条用例</p>${model.baseline.coverage.map(c => `<article><strong>${esc(names[c.state])} · ${esc(c.statement)}</strong><p>${paragraph(c.reason)}</p><p class="mono">${esc(c.pointIds.join('、'))}</p></article>`).join('')}${model.baseline.sources.map(s => `<article><strong>${esc(s.id)}</strong><p>${paragraph(s.locator)}</p><p>${paragraph(s.excerpt)}</p>${s.limitations.map(t => `<p>${paragraph(t)}</p>`).join('')}<p class="mono">${esc(s.sha256 ?? u('未提供文件指纹'))}</p></article>`).join('')}${model.baseline.retiredPoints.length ? uiHtml`<article>退役编号：${esc(model.baseline.retiredPoints.map(p => p.pointId).join('、'))}</article>` : ''}<p class="mono">用例指纹：${model.cases.sha256}</p>`;
  $<HTMLDialogElement>('sources-dialog').showModal();
}
const themeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-theme-id]')];
function applyTheme(id: string, remember = true) {
  const button = themeButtons.find(b => b.dataset.themeId === id) ?? themeButtons[0]; if (!button) return;
  document.documentElement.dataset.theme = button.dataset.themeId; $('theme-button').textContent = u('背景 · ') + button.textContent?.trim();
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
  else if (data.scene) { const first = visibleRows().find(r => r.c.id === data.scene); if (first) showPoint(first.g.pointId); }
  else if ((button.hasAttribute('data-prev') || button.hasAttribute('data-next')) && current) { const visible = visibleRows(), next = filteredNeighbor(visible, visible.findIndex(r => r.g.pointId === current), button.hasAttribute('data-prev') ? -1 : 1); if (next) showPoint(next.g.pointId); }
  else if (data.save) { const field = document.querySelector<HTMLTextAreaElement>('[data-editor="' + CSS.escape(data.save) + '"]'); saveOpinion(data.save, field?.value ?? '', true); }
  else if (data.approveReview) approveReview(data.approveReview);
  else if (data.resumeReview) { approved.delete(data.resumeReview); persist(); renderReview(points.get(data.resumeReview)!.g); renderNav(); document.querySelector<HTMLTextAreaElement>('[data-editor]')?.focus({ preventScroll: true }); }
  else if (button.hasAttribute('data-cancel-approve')) $<HTMLDialogElement>('approve-review-dialog').close();
  else if (button.hasAttribute('data-confirm-approve')) { const dialog = $<HTMLDialogElement>('approve-review-dialog'); dialog.close(); passReview(dialog.dataset.pointId!); }
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
    case 'all-scope': selected = new Set(identity.pointIds); persist(); renderNav(); updateScopeControl(); toast(uiTemplate`已将全部 ${rows.length} 条用例纳入导出范围。`); break;
    case 'clear-scope': selected.clear(); persist(); renderNav(); updateScopeControl(); toast(u('范围已清空，已有意见仍然保留。')); break;
    case 'import-review': $<HTMLInputElement>('import-file').click(); break;
    case 'export-review': renderExport(); $<HTMLDialogElement>('export-dialog').showModal(); break;
    case 'close-export': $<HTMLDialogElement>('export-dialog').close(); updateScopeControl(); renderNav(); break;
    case 'include-noted': noteEntries().forEach(c => selected.add(c.pointId)); persist(); updateCounts(); renderExport(); break;
    case 'save-html': exportFile('html'); break;
    case 'save-json': exportFile('json'); break;
    case 'download-html': exportFile('html', true); break;
    case 'download-json': exportFile('json', true); break;
    case 'download-export': { const snapshot = pendingDownload; if (snapshot && !exportBusy) void writeExport(snapshot.file, snapshot.request, true); break; }
    case 'copy-review': {
      const b = exportBlocked(); if (b.empty || b.noScope || b.outside.length) break;
      const text = JSON.stringify(requestFeedback(), null, 2);
      if (!navigator.clipboard) { toast(u('当前浏览器未提供复制接口，请在完整评审数据框中选中复制。')); break; }
      void navigator.clipboard.writeText(text).then(() => toast(u('已复制完整评审数据。'))).catch(() => toast(u('复制未获允许，请在完整评审数据框中选中复制。'))); break;
    }
    case 'theme-button': { const index = themeButtons.findIndex(b => b.dataset.themeId === document.documentElement.dataset.theme); applyTheme(themeButtons[(index + 1) % themeButtons.length]?.dataset.themeId ?? 'A'); break; }
    case 'theme-options-button': $('theme-menu').hidden = !$('theme-menu').hidden; break;
    case 'show-sources': showSources(); break;
    case 'close-sources': $<HTMLDialogElement>('sources-dialog').close(); break;
  }
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') $('theme-menu').hidden = true; });
document.addEventListener('scroll', () => rememberPosition(), { capture: true, passive: true });
document.addEventListener('toggle', () => rememberPosition(), true);
window.addEventListener('popstate', restoreLocation); window.addEventListener('hashchange', restoreLocation);
$('project-title').textContent = model.baseline.project + u(' · 用例审阅'); $('variant-label').textContent = u('用例总览与逐条评审');
$('case-count').textContent = String(model.baseline.cases.length); $('point-count').textContent = String(rows.length); $('gap-count').textContent = String(rows.filter(r => r.g.planState === 'unprepared').length);
document.querySelector('.tab-count')!.textContent = formatUi('{scenes} 场景',{scenes:model.baseline.cases.length});
$<HTMLButtonElement>('workbench-tab').disabled = !rows.length;
let theme = 'A'; try { theme = localStorage.getItem('ego-report-theme-v1') ?? 'A'; } catch { /* Theme storage is optional. */ } applyTheme(theme, false);
renderMain(); renderNav(); persist();
try { history.scrollRestoration = 'manual'; } catch { /* Manual return position remains usable. */ }
if (!location.hash) history.replaceState({ caseReview: true }, '', '#overview'); restoreLocation();

if(typeof ResizeObserver!=='undefined'){const resize=new ResizeObserver(()=>{for(const [selector,key]of [['.view-nav','--case-nav-height'],['.overview-toolbar','--case-filter-height']]){const e=document.querySelector(selector!);if(e)document.documentElement.style.setProperty(key!,e.getBoundingClientRect().height+'px');}});for(const selector of ['.view-nav','.overview-toolbar']){const e=document.querySelector(selector);if(e)resize.observe(e);}}
