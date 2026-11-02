import { uiText as u } from './ui-text.mjs';
export function scopeLabel(binding: { selection: { request: { mode: string } }; history?: { primaryBaseline: unknown } }): string {
  const comparison = binding.history?.primaryBaseline != null;
  if (binding.selection.request.mode === 'status') return u('按历史状态选择，命中场景整体重跑');
  if (binding.selection.request.mode === 'points') return comparison ? u('按编号回归') : u('按编号执行');
  return comparison ? u('全量回归（当前用例版本）') : u('当前用例版本全范围执行');
}
