/** Projection of explicit retained files and actual uses. Never scans folders or infers business success. */
import type { HtmlPayload, Report, TestFileUseView, TestFileView, TestFilesView } from '../contracts/model.mjs';
import { caseGoals } from './execution-view.mjs';
import { uiText as u } from './ui-text.mjs';

export function testFilesView(payload: Pick<HtmlPayload, 'report' | 'previews' | 'conversations'>): TestFilesView | undefined {
  const { report, previews } = payload, items = new Map<string, TestFileView>();
  const evidence = [...report.evidenceCatalog.items.map(item => ({ id: item.id, item })), ...(report.history?.evidence ?? []).map(e => ({ id: e.key, item: e.item }))];
  for (const { id, item } of evidence) {
    const file = item.metadata?.testFile; if (!file) continue;
    const p = previews[id], content = item.metadata?.contentState;
    const status: TestFileView['status'] = content === 'excluded' || content === 'failed' ? content : p?.contentState === 'missing' ? 'unavailable' : content !== 'full' ? 'incomplete' : p?.attachmentPath ? 'retained' : 'not_delivered';
    const mediaType = item.metadata?.mediaType ?? p?.mediaType;
    items.set(id, { id, evidenceId: id, name: file.name, origin: file.origin, sha256: item.sha256, bytes: item.bytes, ...(mediaType ? { mediaType } : {}),
      ...(status === 'retained' && p?.attachmentPath ? { attachmentPath: p.attachmentPath } : {}), status,
      note: [file.note, item.metadata?.omissionReason, status === 'incomplete' ? u('原件完整性未确认为full，不把留存片段冒充原件。') : status === 'not_delivered' ? u('当前HTML没有携带可下载原件，请生成附件包。') : status === 'unavailable' ? u('原件不可用，未提供下载。') : undefined].filter(Boolean).join(' '), uses: [] });
  }
  const add = (id: string, use: TestFileUseView) => { const file = items.get(id); if (file && !file.uses.some(existing => JSON.stringify(existing) === JSON.stringify(use))) file.uses.push(use); };
  const actions = (r: Report, historicalPrefix?: (caseId: string, evidenceId: string) => string | undefined) => {
    for (const c of r.cases) {
      const scoped = caseGoals(r, c);
      for (const o of c.observations) for (const a of o.actions ?? []) for (const [index, f] of (a.fileUses ?? []).entries()) {
        const goals = scoped.filter(g => g.observations.some(o2 => o2.id === o.id));
        const uses: TestFileUseView[] = (goals.length ? goals.map(g => ({ goalId: g.goal.id, pointId: g.goal.pointId })) : [{}]).map(g => ({ caseId: c.id, ...g, observationId: o.id, actionId: a.id, role: f.role }));
        if (f.evidenceId) { const id = historicalPrefix ? historicalPrefix(c.id, f.evidenceId) : f.evidenceId; if (id) uses.forEach(use => add(id, use)); }
        else if (!historicalPrefix) {
          const id = 'unavailable:' + c.id + '/' + o.id + '/' + a.id + '/' + index;
          items.set(id, { id, name: f.name!, status: 'unavailable', note: f.unavailableReason!, uses });
        }
      }
    }
  };
  actions(report);
  // Historical files remain identifiable, without inventing current-step use for another run.
  for (const { id, item } of evidence) if (id !== item.id && items.has(id)) add(id, { caseId: item.caseId });
  for (const view of Object.values(payload.conversations ?? {})) for (const m of view.artifact.messages) for (const sourceId of m.attachmentSourceIds ?? []) {
    const source = view.sources.find(s => s.sourceId === sourceId), role = m.role === 'user' ? 'ai_input' : m.role === 'assistant' ? 'ai_output' : undefined;
    const c = report.cases.find(c => c.id === view.caseId);
    const refs = view.retrospective ? view.actions.filter(a => a.messageIds.includes(m.id)) : (c?.observations ?? []).flatMap(o => (o.actions ?? []).filter(a => a.conversations?.some(ref => ref.evidenceId === view.evidenceId && ref.messageIds.includes(m.id))).map(a => ({ observationId: o.id, actionId: a.id })));
    const uses: TestFileUseView[] = (refs.length ? refs : [{}]).flatMap(ref => {
      const observationId = 'observationId' in ref ? ref.observationId : undefined;
      const goals = (c?.goals ?? []).filter(g => view.goalId ? g.id === view.goalId : observationId && c?.assessments.some(a => a.goalId === g.id && a.observationIds.includes(observationId)));
      return (goals.length ? goals.map(g => ({ goalId: g.id, pointId: g.pointId })) : [{}]).map(g => ({ caseId: view.caseId, ...g, ...ref, ...(role ? { role } : {}), conversationId: view.id, messageId: m.id }));
    });
    if (source?.evidenceId && items.has(source.evidenceId)) uses.forEach(use => add(source.evidenceId!, use));
    else {
      const id = 'unavailable:conversation:' + view.id + '/' + sourceId;
      const prior = items.get(id);
      if (prior) uses.forEach(use => { if (!prior.uses.some(p => JSON.stringify(p) === JSON.stringify(use))) prior.uses.push(use); });
      else items.set(id, { id, name: source?.label ?? sourceId, status: 'unavailable', note: u('消息引用没有可核验的测试文件原件登记。请核对来源，不补造文件。'), uses });
    }
  }
  if (!items.size) return undefined;
  const values = [...items.values()];
  return { items: values, complete: values.every(f => f.status === 'retained' && f.uses.some(use => use.actionId || use.messageId)) };
}
