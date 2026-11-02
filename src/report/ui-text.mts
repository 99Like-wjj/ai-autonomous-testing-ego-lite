/** Localizes source-authored UI fragments only. Interpolated facts are never translated. */
export interface Presentation { language: string; messages: Record<string, string> }
let resolver: (() => Presentation | undefined) | undefined;
export function installUiResolver(value: () => Presentation | undefined): void { resolver = value; }
let browserPresentation: Presentation | undefined;
function current(): Presentation | undefined {
  if (resolver) return resolver();
  const document=(globalThis as unknown as {document?:{getElementById(id:string):{textContent:string|null}|null}}).document;
  if (!document) return undefined;
  if (!browserPresentation) {
    const node = document.getElementById('report-data') ?? document.getElementById('case-data');
    if (node) { const value = JSON.parse(node.textContent ?? '{}'); browserPresentation = value.report?.presentation ?? value.presentation; }
  }
  return browserPresentation;
}
const fragments = /[^<>"'\r\n{}\[\]=`]+/g;
export function uiSegments(value: string): string[] {
  return [...value.matchAll(fragments)].map(m => m[0].trim()).filter(s => /\p{Script=Han}/u.test(s));
}
const escapeHtml = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
function replace(value: string, html: boolean): string {
  const p = current();
  if (!p) return value;
  return value.replace(fragments, raw => {
    const key = raw.trim(); if (!/\p{Script=Han}/u.test(key)) return raw;
    if (!Object.hasOwn(p.messages, key)) {if(isSourceLanguage(p.language))return raw;throw Error('Missing UI message: ' + key);}
    const text = p.messages[key]!;
    return raw.slice(0, raw.indexOf(key)) + (html ? escapeHtml(text) : text) + raw.slice(raw.indexOf(key) + key.length);
  });
}
export function isSourceLanguage(language:string):boolean{return /^(?:zh|zh-CN|zh-Hans|zh-Hans-CN)$/i.test(language);}
export const uiText = (value: string): string => replace(value, false);
export const uiMarkup = (value: string): string => replace(value, true);
export function uiTemplate(parts: TemplateStringsArray, ...values: unknown[]): string { return parts.map((part, i) => uiText(part) + (i < values.length ? String(values[i]) : '')).join(''); }
export function uiHtml(parts: TemplateStringsArray, ...values: unknown[]): string { return parts.map((part, i) => uiMarkup(part) + (i < values.length ? String(values[i]) : '')).join(''); }
export function presentationLanguage(): string { return current()?.language ?? 'zh-CN'; }
export function reportCaveat(): string { return uiText('结构校验和文件哈希不认证观察真实性或业务判断。登记时间是本地事务时间；采集时间只使用已知来源。缺少评估是记录缺口，不是业务结论。'); }
export function formatUi(key: string, values: Record<string, string | number>): string {
  const p=current();
  const template=p&&Object.hasOwn(p.messages,key)?p.messages[key]:!p||isSourceLanguage(p.language)?key:undefined;
  if(template===undefined)throw Error('Missing UI message: '+key);
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g,(_all,name:string)=>{if(!Object.hasOwn(values,name))throw Error('Missing UI parameter: '+name);return String(values[name]);});
}
