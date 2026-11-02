/** Explicit read-only DOM text capture. The caller chooses nodes and interprets completion. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertClosed, fail, safeIdentifier, safePath } from '../core/common.mjs';

export interface CaptureTextPage {
  readonly spaceId: number; readonly label: string;
  url(): Promise<string>;
  evaluate<T,A>(fn: (arg: A) => T, arg: A): Promise<T>;
}
export interface CaptureTextRequest {
  page: CaptureTextPage; outputFile: string;
  selectors: { id: string; selector: string }[];
  completion: { state: 'final'|'streaming'|'interrupted'|'waiting_confirmation'|'unknown'; basis: string };
}
export async function captureDomText(request: CaptureTextRequest) {
  const {page}=request;
  if(!Number.isSafeInteger(page.spaceId)||typeof page.label!=='string')fail('Capture requires the actual Ego Page handle.');
  if(!path.isAbsolute(request.outputFile))fail('Capture output must be an absolute new file.');
  const ids=new Set<string>();
  if(!Array.isArray(request.selectors)||!request.selectors.length||request.selectors.length>32)fail('Capture requires 1-32 explicitly selected nodes.');
  const selectors=request.selectors.map(s=>{assertClosed(s,['id','selector'],'text capture selector');const id=safeIdentifier(s.id);if(ids.has(id)||typeof s.selector!=='string'||!s.selector.trim()||s.selector.length>4096)fail('Invalid or duplicate capture selector.');ids.add(id);return{id,selector:s.selector};});
  assertClosed(request.completion,['state','basis'],'declared capture completion');
  if(!['final','streaming','interrupted','waiting_confirmation','unknown'].includes(request.completion.state)||typeof request.completion.basis!=='string'||!request.completion.basis.trim())fail('Capture completion needs an explicit state and AI-authored basis.');
  const output=await safePath(request.outputFile);await fs.mkdir(path.dirname(output),{recursive:true});await safePath(output);
  const urlBefore=await page.url(),startedAt=new Date().toISOString();
  // No waits, clicks, protocol decoding or business decisions. innerText avoids accessibility-label truncation.
  const elements=await page.evaluate(selectors=>selectors.map(s=>{
    interface TextElement { innerText: string; tagName: string; checkVisibility?: () => boolean; getClientRects(): {length:number} }
    const doc=(globalThis as unknown as {document:{querySelectorAll(selector:string):ArrayLike<TextElement>}}).document;
    const nodes=Array.from(doc.querySelectorAll(s.selector));
    const node=nodes.length===1?nodes[0]:undefined;
    const visible=!!node&&(typeof node.checkVisibility==='function'?node.checkVisibility():!!node.getClientRects().length);
    return{id:s.id,selector:s.selector,matches:nodes.length,visible,text:visible?node!.innerText:null,tagName:visible?node!.tagName:null};
  }),selectors);
  const urlAfter=await page.url(),observedAt=new Date().toISOString();
  const result={captureVersion:1,kind:'dom_text_capture' as const,spaceId:page.spaceId,page:page.label,urlBefore,urlAfter,startedAt,observedAt,navigationChanged:urlBefore!==urlAfter,
    scope:'explicit_current_dom_nodes',elements,completion:{...request.completion,source:'AI declaration; not independently inferred from page text'},
    limitations:['Only explicitly selected, currently rendered top-document nodes are captured; unloaded history, frames and hidden content are outside this scope.','Retained text, transport completion and business success are separate facts. Missing or ambiguous nodes are not retried or treated as product failures.']};
  await fs.writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  return{outputFile:output,spaceId:page.spaceId,page:page.label,observedAt,selectedNodes:elements.length,retainedNodes:elements.filter(e=>e.text!==null).length,navigationChanged:result.navigationChanged};
}
