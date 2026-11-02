/** Recorded authorship, never a model detector or a business-quality evaluator. */
import fs from 'node:fs/promises';
import type { AiContext } from '../contracts/model.mjs';
import { assertClosed, fail, safePath } from './common.mjs';
import { arrayValue, oneOf, parseSourceRef, textValue } from './validation.mjs';
import { hashFile, regularFilePath } from './file-integrity.mjs';

export function parseAiContext(value: unknown): AiContext {
  assertClosed(value, ['uses'], 'AI context');
  const uses = arrayValue(value.uses, 'AI uses').map(v => {
    assertClosed(v, ['model', 'reasoningEffort', 'sourceKind', 'source', 'scope'], 'AI use');
    const sourceKind = oneOf(v.sourceKind, ['host_metadata', 'user_statement', 'unknown'], 'AI source kind');
    const model = v.model === null ? null : textValue(v.model, 'model', { limit: 300 });
    const reasoningEffort = v.reasoningEffort === null ? null : textValue(v.reasoningEffort, 'reasoning effort', { limit: 100 });
    if (sourceKind === 'unknown' && (model !== null || reasoningEffort !== null)) fail('Unknown AI source cannot assert a model or reasoning effort.');
    return { model, reasoningEffort, sourceKind, source: parseSourceRef(v.source), scope: textValue(v.scope, 'AI use scope') };
  });
  if (!uses.length) fail('AI context must contain a use or an explicit unknown source.');
  return { uses };
}

export async function verifyAiContext(context: AiContext | undefined): Promise<void> {
  if (!context) return;
  for (const use of context.uses) if (use.source.file !== null) {
    const file = await regularFilePath(await safePath(use.source.file, { existing: true }));
    if ((await hashFile(file)).sha256 !== use.source.sha256) fail('AI metadata source hash mismatch.');
  }
}

export function mergeAiContexts(contexts: readonly (AiContext | undefined)[]): AiContext | undefined {
  if (!contexts.some(Boolean)) return undefined;
  const uses: AiContext['uses'] = [];
  for (const context of contexts) {
    if (context) uses.push(...context.uses);
    else uses.push({ model: null, reasoningEffort: null, sourceKind: 'unknown', scope: 'Unrecorded contribution', source: { id: 'unrecorded-contribution', locator: 'No AI metadata was supplied for this contribution.', file: null, sha256: null, excerpt: '', limitations: ['The model and reasoning effort are unknown.'] } });
  }
  return { uses: [...new Map(uses.map(use => [JSON.stringify(use), use])).values()] };
}

export async function readCaseAiSupplement(filename: unknown, cases: { projectId: string; caseVersion: number; sha256: string }): Promise<AiContext> {
  const file = await regularFilePath(await safePath(filename, { existing: true }));
  const value: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
  assertClosed(value, ['cases', 'aiContext'], 'case AI supplement');
  assertClosed(value.cases, ['projectId', 'caseVersion', 'sha256'], 'case AI supplement identity');
  if (value.cases.projectId !== cases.projectId || value.cases.caseVersion !== cases.caseVersion || value.cases.sha256 !== cases.sha256) fail('Case AI supplement does not match the exact case version.');
  const context = parseAiContext(value.aiContext);
  await verifyAiContext(context);
  return context;
}
