/** A single model display for each of the two report stages. */
import type { AiContext } from '../contracts/model.mjs';
import { uiText as u } from './ui-text.mjs';
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function modelDisplay(context: AiContext | undefined, stage: 'case_generation' | 'test_execution') {
  const title = stage === 'case_generation' ? u('用例生成模型') : u('测试执行模型');
  const uses = context?.uses ?? [];
  const configurations = [...new Map(uses.filter(v => v.model !== null || v.reasoningEffort !== null).map(v => [JSON.stringify([v.model, v.reasoningEffort]), v])).values()];
  const missing = !uses.length || uses.some(v => v.sourceKind === 'unknown');
  const summary = configurations.length > 1 ? u('多模型配置') + ' · ' + configurations.length : configurations.length ? (configurations[0]!.model ?? u('未记录')) + ' · ' + u('思考等级') + ': ' + (configurations[0]!.reasoningEffort ?? u('未记录')) : u('未记录') + ' · ' + u('思考等级') + ': ' + u('未记录');
  const detail = uses.map(v => ({ model: v.model ?? u('未记录'), reasoningEffort: v.reasoningEffort ?? u('未记录'), sourceKind: ({ host_metadata: u('宿主元数据'), user_statement: u('用户声明'), unknown: u('未记录') })[v.sourceKind], source: v.source, scope: v.scope }));
  return { title, summary, partial: missing && configurations.length > 0, detail };
}
export function modelHeader(context: AiContext | undefined, stage: 'case_generation' | 'test_execution', retrospective = false): string {
  const view = modelDisplay(context, stage);
  return '<section class="model-info" data-model-stage="' + stage + '"><strong>' + esc(view.title) + '</strong>: ' + esc(view.summary) + (view.partial ? ' · ' + esc(u('部分来源未记录')) : '') + (retrospective ? ' · ' + esc(u('事后补充')) : '') + (view.detail.length ? '<details><summary>' + esc(u('模型来源明细')) + '</summary>' + view.detail.map(v => '<p>' + esc(v.model) + ' · ' + esc(v.reasoningEffort) + ' · ' + esc(v.sourceKind) + '</p><p>' + esc(v.scope) + '</p><p>' + esc(v.source.locator) + '</p>' + (v.source.sha256 ? '<p>SHA-256: ' + esc(v.source.sha256) + '</p>' : '')).join('') + '</details>' : '') + '</section>';
}
