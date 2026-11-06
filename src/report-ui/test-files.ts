/** File cards share portable links and provenance in steps, chat and the file index. */
import type { HtmlPayload, TestFileUseView, TestFileView } from '../contracts/model.mjs';
import { safeAttachmentPath } from '../contracts/attachment-path.mjs';
import { uiText as u } from '../report/ui-text.mjs';
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const origins = { generated: u('本轮生成'), user_provided: u('用户提供'), system_download: u('来自被测系统'), ai_output: u('AI返回产物'), other: u('其他来源') };
const roles = { upload_input: u('上传输入'), download_output: u('下载输出'), ai_input: u('AI输入附件'), ai_output: u('AI输出附件') };
const states = { retained: u('原件已保管'), not_delivered: u('原件未随报告交付'), incomplete: u('原件完整性未确认'), excluded: u('已排除交付'), failed: u('获取失败'), unavailable: u('未取得可下载原件') };
export function testFileDownloadControl(payload: HtmlPayload, file: TestFileView): string {
  if (file.status !== 'retained' || !safeAttachmentPath(file.attachmentPath)) return '';
  if (file.sha256 && payload.testFileDownloads?.[file.sha256] !== undefined) return '<button class="attachment" data-file-download="' + esc(file.id) + '">' + u('下载原件') + '</button>';
  return payload.testFiles?.archive?.path === 'test-attachments.zip' ? '<a class="attachment" href="test-attachments.zip" download="test-attachments.zip">' + u('从合集下载原件') + '</a>' : '';
}
export function fileRole(role: TestFileUseView['role']): string { return role ? roles[role] : u('用途未声明'); }
export function testFileCard(payload: HtmlPayload, file: TestFileView, use?: TestFileUseView): string {
  const path = file.status === 'retained' ? safeAttachmentPath(file.attachmentPath) : undefined;
  const p = file.evidenceId ? payload.previews[file.evidenceId] : undefined, asset = p?.assetId ? payload.assets[p.assetId] : undefined;
  return '<article class="test-file-card" data-test-file="' + esc(file.id) + '"><div class="test-file-heading"><strong>' + esc(file.name) + '</strong><span class="test-file-state' + (file.status === 'retained' ? '' : ' has-gap') + '">' + states[file.status] + '</span></div><p class="meta">' + [file.bytes !== undefined ? file.bytes + ' B' : u('大小未知'), file.mediaType, use?.role ? roles[use.role] : [...new Set(file.uses.flatMap(u => u.role ? [roles[u.role]] : []))].join(' / '), file.origin ? origins[file.origin] : u('来源未明确')].filter(Boolean).map(esc).join(' · ') + '</p>' + (file.note ? '<p class="hint">' + esc(file.note) + '</p>' : '') + '<div class="test-file-actions">' + testFileDownloadControl(payload, file) + (file.evidenceId && asset ? '<button data-evidence="' + esc(file.evidenceId) + '" data-evidence-context="' + esc(u('测试文件预览')) + '">' + u('预览') + '</button>' : '') + '</div><details class="test-file-info"><summary>' + u('文件信息') + '</summary>' + (file.sha256 ? '<p class="mono">SHA256: ' + esc(file.sha256) + '</p>' : '') + (file.evidenceId ? '<p class="mono">' + esc(file.evidenceId) + '</p>' : '') + (path ? '<p class="mono">' + u('附件相对路径：') + esc(path) + '</p>' : '') + (!file.uses.some(u => u.actionId || u.messageId) ? '<p class="hint">' + u('尚未关联具体步骤；不自动认定已被哪个目标使用。') + '</p>' : '') + '</details></article>';
}
export function stepTestFiles(payload: HtmlPayload, caseId: string, goalId: string, observationId: string, actionId: string): string {
  const items = (payload.testFiles?.items ?? []).flatMap(file => {
    const use = file.uses.find(u => u.caseId === caseId && (!u.goalId || u.goalId === goalId) && u.observationId === observationId && u.actionId === actionId);
    return use ? [{ file, use }] : [];
  });
  return items.length ? '<section class="step-test-files"><h4>' + u('本步测试附件') + ' · ' + items.length + '</h4>' + items.map(({ file, use }) => testFileCard(payload, file, use)).join('') + '</section>' : '';
}
export function conversationTestFile(payload: HtmlPayload, conversationId: string, messageId: string, sourceId: string, evidenceId?: string): string {
  const file = payload.testFiles?.items.find(f => (evidenceId ? f.evidenceId === evidenceId : f.id === 'unavailable:conversation:' + conversationId + '/' + sourceId) && f.uses.some(u => u.conversationId === conversationId && u.messageId === messageId));
  return file ? testFileCard(payload, file, file.uses.find(u => u.conversationId === conversationId && u.messageId === messageId)) : '';
}
export function filteredTestFiles(payload: HtmlPayload, query: string, caseId: string, pointId: string, direction: string): TestFileView[] {
  const q = query.trim().toLocaleLowerCase();
  return (payload.testFiles?.items ?? []).filter(f => (!q || (f.name + ' ' + f.note).toLocaleLowerCase().includes(q))
    && (!caseId || f.uses.some(u => u.caseId === caseId)) && (!pointId || f.uses.some(u => u.pointId === pointId))
    && (direction === 'all' || direction === 'input' && f.uses.some(u => u.role === 'upload_input' || u.role === 'ai_input') || direction === 'output' && f.uses.some(u => u.role === 'download_output' || u.role === 'ai_output')));
}
export function testFileIndex(payload: HtmlPayload, query: string, caseId: string, pointId: string, direction: string): string {
  const files = payload.testFiles, all = files?.items ?? [], shown = filteredTestFiles(payload, query, caseId, pointId, direction);
  const cases = [...new Set(all.flatMap(f => f.uses.map(u => u.caseId)))];
  const points = [...new Set(all.flatMap(f => f.uses.flatMap(u => u.pointId ? [u.pointId] : [])))];
  const options = (values: string[], selected: string, label: (id: string) => string) => values.map(id => '<option value="' + esc(id) + '" ' + (selected === id ? 'selected' : '') + '>' + esc(label(id)) + '</option>').join('');
  const controls = '<div class="library-controls"><label>' + u('文件名') + '<input type="search" id="test-file-query" value="' + esc(query) + '"></label>'
    + '<label>' + u('场景') + '<select id="test-file-case"><option value="">' + u('全部场景') + '</option>' + options(cases, caseId, id => payload.report.cases.find(c => c.id === id)?.title ?? id) + '</select></label>'
    + '<label>' + u('业务目标') + '<select id="test-file-goal"><option value="">' + u('全部目标') + '</option>' + options(points, pointId, id => id + ' · ' + (payload.report.cases.flatMap(c => c.goals).find(g => g.pointId === id)?.title ?? id)) + '</select></label>'
    + '<label>' + u('用途') + '<select id="test-file-direction">' + options(['all','input','output'], direction, id => ({all:u('全部用途'),input:u('输入'),output:u('输出')})[id]!) + '</select></label>'
    + '<button id="test-file-search">' + u('筛选附件') + '</button></div>';
  const links = (file: TestFileView) => [...new Map(file.uses.map(use => [[use.caseId,use.goalId,use.observationId,use.actionId,use.role].join('/'),use])).values()].map(use =>
    use.goalId && use.observationId && use.actionId ? '<button data-test-file-case="' + esc(use.caseId) + '" data-test-file-goal="' + esc(use.goalId) + '" data-test-file-step="' + esc(use.observationId + '/' + use.actionId) + '">' + esc(use.pointId ?? use.caseId) + ' · ' + esc(fileRole(use.role)) + ' · ' + u('查看对应步骤') + '</button>'
      : '<span class="meta">' + esc(use.pointId ?? use.caseId) + ' · ' + esc(fileRole(use.role)) + '</span>').join('');
  return '<section class="panel test-file-index"><h2>' + u('测试附件') + '</h2><p class="hint">' + u('实际留存的复测文件及缺口。文件可用性不代表业务目标已验证。移动报告时请保留完整附件目录。') + '</p>'
    + (files?.archive?.path === 'test-attachments.zip' ? '<a class="attachment test-file-archive" href="test-attachments.zip" download="test-attachments.zip">' + u('下载全部测试附件.zip') + ' · ' + files.archive.fileCount + u(' 个原件') + '</a>' : '')
    + (files && !files.complete ? '<p class="note">' + u('复测附件存在缺口或未关联材料，详见下方说明；合集只含实际保管的原件。') + '</p>' : '') + controls
    + '<p class="meta">' + shown.length + ' / ' + all.length + '</p><div class="test-file-list">'
    + shown.map(file => testFileCard(payload, file) + '<div class="test-file-uses">' + links(file) + '</div>').join('')
    + (!shown.length ? '<p class="empty">' + u('没有匹配的测试附件。') + '</p>' : '') + '</div></section>';
}
