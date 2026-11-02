import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs/promises';
import { assertClosed, fail, object, safePath } from '../core/common.mjs';
import { uiMessageKeys } from './ui-catalog.mjs';
import { installUiResolver, isSourceLanguage, type Presentation } from './ui-text.mjs';
export type { Presentation } from './ui-text.mjs';
const storage = new AsyncLocalStorage<Presentation | undefined>();
installUiResolver(() => storage.getStore());
export function withPresentation<T>(presentation: Presentation | undefined, fn: () => T): T { return storage.run(presentation, fn); }
export function parsePresentation(value: unknown): Presentation {
  assertClosed(value, ['language', 'messages'], 'report presentation');
  if (typeof value.language !== 'string' || value.language.length > 100) fail('A valid output language is required.');
  let language: string; try { language = Intl.getCanonicalLocales(value.language)[0]!; } catch { return fail('Invalid output language tag.'); }
  if (!language || !object(value.messages)) fail('Presentation requires a language and UI messages.');
  const messages: Record<string, string> = {};
  for (const [key, text] of Object.entries(value.messages)) {
    if (!uiMessageKeys.includes(key) || typeof text !== 'string' || text.length > 16000 || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) fail('Invalid UI message key or plain-text value.');
    const parameters=(s:string)=>[...s.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map(m=>m[1]).sort().join(',');
    if(parameters(key)!==parameters(text))fail('UI message placeholders must match the source key.');
    messages[key] = text;
  }
  if (!isSourceLanguage(language)) for (const key of uiMessageKeys) if (!Object.hasOwn(messages, key)) fail('Missing target-language UI message: ' + key);
  return { language, messages };
}
export async function readPresentation(filename: unknown): Promise<Presentation | undefined> {
  return filename === undefined ? undefined : parsePresentation(JSON.parse(await fs.readFile(await safePath(filename, { existing: true }), 'utf8')));
}
