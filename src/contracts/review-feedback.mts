/** Portable feedback parsing. Data export/import never authenticates or registers a review. */
import type { CasesRef, SourceRef } from './model.mjs';

export type FeedbackDecision = 'comment_only' | 'changes_requested' | 'approved';
export interface FeedbackComment { pointId: string | null; text: string }
export interface ReviewFeedback {
  schemaVersion: 9;
  cases: CasesRef;
  expectedReviewNumber: number;
  decision: FeedbackDecision;
  pointIds: string[];
  comments: FeedbackComment[];
  source: SourceRef;
  sourceKind: 'feedback_file';
  delegationSource: null;
}
export interface FeedbackIdentity { cases: CasesRef; pointIds: readonly string[] }
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
function record(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(label + '格式无效。');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(result, key))) throw Error(label + '字段不完整或含未知字段。');
  return result;
}
function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw Error(label + '不能为空。');
  return value;
}
function id(value: unknown): string {
  const result = text(value, '编号');
  if (!idPattern.test(result) || ['__proto__', 'prototype', 'constructor', '.', '..'].includes(result)) throw Error('评审编号无效。');
  return result;
}
function integer(value: unknown, minimum: number, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) throw Error(label + '无效。');
  return value;
}
function sha(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw Error('来源指纹无效。');
  return value;
}
function source(value: unknown): SourceRef {
  const r = record(value, ['id', 'locator', 'file', 'sha256', 'excerpt', 'limitations'], '评审来源');
  if (typeof r.excerpt !== 'string' || !Array.isArray(r.limitations)) throw Error('评审来源内容无效。');
  const file = r.file === null ? null : text(r.file, '来源文件');
  const fingerprint = r.sha256 === null ? null : sha(r.sha256);
  if ((file === null) !== (fingerprint === null)) throw Error('来源文件和指纹必须同时提供。');
  return { id: id(r.id), locator: text(r.locator, '来源位置'), file, sha256: fingerprint, excerpt: r.excerpt, limitations: r.limitations.map(v => text(v, '来源局限')) };
}
export function parseReviewFeedback(value: unknown, identity: FeedbackIdentity, { allowEmpty = false }: { allowEmpty?: boolean } = {}): ReviewFeedback {
  const r = record(value, ['schemaVersion', 'cases', 'expectedReviewNumber', 'decision', 'pointIds', 'comments', 'source', 'sourceKind', 'delegationSource'], '审阅意见');
  if (r.schemaVersion !== 9) throw Error('审阅意见需要 schemaVersion 9。');
  const ref = record(r.cases, ['projectId', 'caseVersion', 'sha256'], '用例版本');
  const cases: CasesRef = { projectId: id(ref.projectId), caseVersion: integer(ref.caseVersion, 1, '用例版本'), sha256: sha(ref.sha256) };
  if (cases.projectId !== identity.cases.projectId || cases.caseVersion !== identity.cases.caseVersion || cases.sha256 !== identity.cases.sha256) throw Error('记录不属于当前用例版本，已有意见保持原样。');
  if (typeof r.decision !== 'string' || !['comment_only', 'changes_requested', 'approved'].includes(r.decision)) throw Error('拟提交结论无效。');
  if (r.sourceKind !== 'feedback_file' || r.delegationSource !== null) throw Error('这里只读取意见文件；正式确认需在当前对话另行登记。');
  if (!Array.isArray(r.pointIds) || !Array.isArray(r.comments)) throw Error('意见范围或内容无效。');
  const known = new Set(identity.pointIds), pointIds = r.pointIds.map(id), selected = new Set(pointIds);
  if (selected.size !== pointIds.length || pointIds.some(point => !known.has(point))) throw Error('意见范围包含重复或未知用例。');
  const comments = r.comments.map(value => {
    const c = record(value, ['pointId', 'text'], '逐条意见');
    const pointId = c.pointId === null ? null : id(c.pointId);
    if (pointId !== null && (!known.has(pointId) || !selected.has(pointId))) throw Error('有意见的用例尚未纳入导出范围，不能静默丢弃。');
    return { pointId, text: text(c.text, '评审意见') };
  });
  if (!allowEmpty && !comments.length) throw Error('请先填写意见；评审通过标记不作为修改意见导出。');
  return { schemaVersion: 9, cases, expectedReviewNumber: integer(r.expectedReviewNumber, 0, '审阅序号'), decision: r.decision as FeedbackDecision, pointIds, comments, source: source(r.source), sourceKind: 'feedback_file', delegationSource: null };
}
/** Extract inert JSON only: parsing an imported HTML must not load images, frames or scripts. */
export function feedbackFromText(input: string): unknown {
  const text = input.replace(/^\uFEFF/, '').trim();
  if (!text.startsWith('<')) return JSON.parse(text) as unknown;
  const pattern = /<script\b(?=[^>]*\bid=["']review-feedback-data["'])(?=[^>]*\btype=["']application\/json["'])[^>]*>([\s\S]*?)<\/script\s*>/gi;
  const matches = [...text.matchAll(pattern)];
  if (matches.length !== 1) throw Error('HTML中没有唯一的审阅意见数据区。');
  return JSON.parse(matches[0]![1]!) as unknown;
}
export function makeReviewFeedback(identity: FeedbackIdentity, expectedReviewNumber: number, decision: FeedbackDecision, pointIds: string[], comments: FeedbackComment[]): ReviewFeedback {
  return parseReviewFeedback({ schemaVersion: 9, cases: identity.cases, expectedReviewNumber, decision, pointIds, comments,
    source: { id: 'review-file', locator: '离线用例审阅页导出；实际收到的来源由当前对话另行登记。', file: null, sha256: null, excerpt: '', limitations: ['文件只保存意见与拟提交结论，不认证人工身份，不启动测试。'] }, sourceKind: 'feedback_file', delegationSource: null }, identity);
}
