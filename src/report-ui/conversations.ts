import { uiText as u, uiMarkup, presentationLanguage } from '../report/ui-text.mjs';
import type { ConversationMessage, ConversationView, HtmlPayload } from '../contracts/model.mjs';
import { renderMarkdown } from './markdown.js';

export interface StepConversation {viewId:string;messageIds:string[]}
export function stepConversations(payload:HtmlPayload,caseId:string,goalId:string,observationId:string,actionId:string,refs:readonly {evidenceId:string;messageIds:string[]}[]=[]):StepConversation[]{
  const result=new Map<string,Set<string>>();
  const add=(id:string,ids:readonly string[])=>{const v=payload.conversations?.[id];if(!v||v.caseId!==caseId||v.goalId&&v.goalId!==goalId)return;const selected=result.get(id)??new Set<string>();for(const messageId of ids)if(v.artifact.messages.some(m=>m.id===messageId))selected.add(messageId);if(selected.size)result.set(id,selected);};
  for(const r of refs)add(r.evidenceId,r.messageIds);
  for(const v of Object.values(payload.conversations??{}))if(v.caseId===caseId&&v.goalId===goalId)for(const a of v.actions)if(a.observationId===observationId&&a.actionId===actionId)add(v.id,a.messageIds);
  return[...result].map(([viewId,ids])=>({viewId,messageIds:[...ids]}));
}
export function linkedInputs(payload:HtmlPayload,refs:readonly StepConversation[]):{text:string;presentation:ConversationMessage['presentation'];completeness:ConversationMessage['completeness']}[]{
  const result:{text:string;presentation:ConversationMessage['presentation'];completeness:ConversationMessage['completeness']}[]=[],used=new Set<string>();
  for(const r of refs)for(const m of payload.conversations?.[r.viewId]?.artifact.messages??[])if(r.messageIds.includes(m.id)&&m.role==='user'&&m.content&&!used.has(r.viewId+'/'+m.id)){used.add(r.viewId+'/'+m.id);result.push({text:m.content,presentation:m.presentation,completeness:m.completeness});}
  return result;
}
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c));
const roleLabels={user:u('测试输入'),assistant:u('被测AI'),tool:u('工具可见消息'),notice:u('通知 / 记录')};
const fidelityLabels={verbatim:u('逐字原文'),normalized:u('来源整理'),summary:u('仅摘要')};
const completeLabels={complete:u('原文覆盖完整'),partial:u('原文部分留存'),unknown:u('原文覆盖未确定')};
const stateLabels={final:u('本条已结束'),streaming:u('仍在流式返回'),interrupted:u('已中断'),waiting_confirmation:u('等待确认'),unknown:u('结束状态未确定')};
const safeAttachment=(value:string|undefined)=>value&&/^attachments\/[a-f0-9]{64}\.(?:png|jpg|webp|txt|bin)$/.test(value)?value:undefined;
export function renderStepConversationSummary(payload:HtmlPayload,step:{input?:string|undefined;inputSummary?:string|undefined;replySummary?:string|undefined;inputPresentation?:'verbatim'|'summary'|'unknown'|undefined},refs:readonly StepConversation[]):string{
  const inputs=linkedInputs(payload,refs),chat=refs.length>0;
  if(!chat&&!step.input&&!step.inputSummary&&!step.replySummary)return'';
  const input=step.inputSummary??(chat?u('本步未提供输入摘要；可查看下方关联的输入记录。'):undefined),reply=step.replySummary??(chat?u('本步未提供AI回复摘要；请核对完整对话及消息留存状态。'):undefined);
  return uiMarkup('<section class="step-conversation-summary" aria-label="本步输入与回复">')+(input?uiMarkup('<p><strong>输入摘要</strong><span>')+esc(input)+'</span></p>':'')+(reply?uiMarkup('<p><strong>AI回复摘要</strong><span>')+esc(reply)+'</span></p>':'')+(inputs.length?uiMarkup('<details class="step-input-original"><summary>展开本步输入记录 · ')+inputs.length+uiMarkup('条</summary>')+inputs.map(m=>'<p class="meta">'+fidelityLabels[m.presentation]+' · '+completeLabels[m.completeness]+'</p><pre>'+esc(m.text)+'</pre>').join('')+'</details>':step.input?uiMarkup('<details class="step-input-original"><summary>展开输入记录（')+(step.inputPresentation==='verbatim'?u('声明为逐字原文'):step.inputPresentation==='summary'?u('仅摘要'):u('完整性未声明'))+'）</summary><pre>'+esc(step.input)+'</pre></details>':'')+refs.map(r=>'<button class="conversation-entry" data-conversation="'+esc(r.viewId)+'" data-conversation-messages="'+esc(r.messageIds.join(','))+u('">查看完整对话 · 本步关联 ')+r.messageIds.length+uiMarkup(' 条消息</button>')).join('')+'</section>';
}
function messageTime(m:ConversationMessage):string{
  if(m.displayTime)return esc(m.displayTime)+u(' · 来源显示时间');
  if(m.sentAt){const d=new Date(m.sentAt);if(!Number.isNaN(d.valueOf()))return esc(d.toLocaleString(presentationLanguage(),{timeZone:'Asia/Shanghai',hour12:false}))+' UTC+08:00';}
  return u('发送时间未采集');
}
function body(m:ConversationMessage):string{
  if(!m.content)return uiMarkup('<p class="conversation-empty">本消息没有文字内容；实际附件见下方引用。</p>');
  if(m.format==='markdown')return renderMarkdown(m.content);
  if(m.format==='json'){let value=m.content;try{value=JSON.stringify(JSON.parse(value),null,2);}catch{/* original text remains visible */}return'<pre><code>'+esc(value)+'</code></pre>';}
  return m.format==='code'?'<pre><code>'+esc(m.content)+'</code></pre>':'<div class="conversation-plain">'+esc(m.content)+'</div>';
}
function renderedMessage(view:ConversationView,m:ConversationMessage,selected:ReadonlySet<string>):string{
  const isSelected=selected.has(m.id),references=[...new Set([...m.sourceRefs.map(s=>s.sourceId),...(m.attachmentSourceIds??[])])];
  return'<article class="conversation-message role-'+m.role+(isSelected?' is-selected':'')+'" data-conversation-message="'+esc(m.id)+'"><span class="conversation-avatar" aria-hidden="true">'+(m.role==='user'?u('测'):m.role==='assistant'?'AI':'⋯')+'</span><div class="conversation-message-content"><div class="conversation-message-meta"><strong>'+esc(m.displayName??roleLabels[m.role])+'</strong><span>'+messageTime(m)+'</span>'+(isSelected?uiMarkup('<span class="conversation-current-label">本步关联</span>'):uiMarkup('<span class="conversation-context-label">同一对话上下文</span>'))+'</div><div class="conversation-bubble conversation-markdown">'+body(m)+'</div><div class="conversation-message-flags"><span>'+fidelityLabels[m.presentation]+'</span><span>'+completeLabels[m.completeness]+'</span><span>'+stateLabels[m.state]+'</span>'+(m.content?'<button data-conv-action="copy" data-message-id="'+esc(m.id)+'">'+(m.presentation==='verbatim'?u('复制原文'):u('复制显示内容'))+'</button>':'')+'</div>'+((m.completeness!=='complete'||m.state!=='final'||m.presentation==='summary')?'<p class="conversation-message-note">'+esc(m.completionBasis)+'</p>':'')+uiMarkup('<details class="conversation-message-sources"><summary>来源与结束依据</summary><p>')+esc(m.completionBasis)+'</p>'+(m.observedAt?uiMarkup('<p>来源采集时间：')+esc(m.observedAt)+'</p>':'')+(m.limitations.length?'<p>'+esc(m.limitations.join('；'))+'</p>':'')+'<div class="conversation-source-buttons">'+references.map(id=>{const s=view.sources.find(s=>s.sourceId===id);return s?'<button data-conv-action="source" data-source-id="'+esc(id)+'">'+esc(s.label)+'</button>':uiMarkup('<span class="error">来源未取得：')+esc(id)+'</span>';}).join('')+'</div></details>'+(m.attachmentSourceIds?.length?'<div class="conversation-attachments">'+m.attachmentSourceIds.map(id=>{const source=view.sources.find(s=>s.sourceId===id);return source?.evidenceId?'<button data-evidence="'+esc(source.evidenceId)+u('" data-evidence-context="对话附件">附件：')+esc(source.label)+'</button>':uiMarkup('<span class="note">附件原件未在本页取得：')+esc(id)+'</span>';}).join('')+'</div>':'')+'</div></article>';
}

export function createConversationReader(payload:HtmlPayload,host:{beforeOpen:()=>void;allowed:(viewId:string,messageIds:readonly string[])=>boolean;openEvidence:(id:string)=>void}){
  const dialog=document.querySelector<HTMLDialogElement>('#conversation-dialog')!,sourceDialog=document.querySelector<HTMLDialogElement>('#conversation-source-dialog')!;
  let active:ConversationView|undefined,selected=new Set<string>(),savedY=0,closing=false;
  const current=(key:string)=>new URLSearchParams(location.hash.slice(1)).get(key);
  function populate(view:ConversationView,messageIds:readonly string[]){active=view;selected=new Set(messageIds.filter(id=>view.artifact.messages.some(m=>m.id===id)));
    dialog.classList.remove('conversation-full');
    dialog.innerHTML='<header class="conversation-head"><div><h2 id="conversation-title">'+esc(view.artifact.title)+'</h2><p>'+view.artifact.messages.length+u('条已留存消息 · ')+(view.retrospective?u('事后来源整理'):u('本轮登记对话'))+'</p>'+(safeAttachment(view.artifactSource?.attachmentPath)?'<a class="conversation-artifact-link" href="'+esc(safeAttachment(view.artifactSource?.attachmentPath))+uiMarkup('" download>规范化对话原件</a>'):'')+uiMarkup('</div><div class="conversation-controls"><button data-conv-action="full">全屏阅读</button><button data-conv-action="close">关闭</button></div></header><nav class="conversation-toolbar"><button data-conv-action="focus-input">定位本步输入</button><button data-conv-action="focus-reply">定位本步AI回复</button><button data-conv-action="top">从首条消息开始</button></nav><div class="conversation-scroll"><p class="conversation-scope">高亮消息与当前步骤明确关联；其余消息仅作同一对话上下文。摘要和未完整留存的消息单独标识，不补写缺失内容。</p>')+view.artifact.messages.map(m=>renderedMessage(view,m,selected)).join('')+(view.limitations.length?'<footer class="conversation-limitations">'+esc(view.limitations.join('；'))+'</footer>':'')+'</div><div id="conversation-copy-status" class="sronly" aria-live="polite"></div>';
  }
  function focus(role:'user'|'assistant'){
    if(!active)return;const chosen=active.artifact.messages.find(m=>selected.has(m.id)&&m.role===role)??active.artifact.messages.find(m=>selected.has(m.id));
    if(chosen)dialog.querySelector<HTMLElement>('[data-conversation-message="'+chosen.id+'"]')?.scrollIntoView({block:'start'});
  }
  function restore(){
    const id=current('conversation'),view=id?payload.conversations?.[id]:undefined;
    const ids=(current('messages')??'').split(',').filter(Boolean);
    if(!view||!host.allowed(view.id,ids)){if(dialog.open)dialog.close();if(sourceDialog.open)sourceDialog.close();active=undefined;closing=false;return;}
    if(!dialog.open||active?.id!==view.id||ids.join(',')!==[...selected].join(',')){populate(view,ids);if(!dialog.open)dialog.showModal();requestAnimationFrame(()=>focus('user'));}
    closing=false;
  }
  function open(id:string,messageIds:readonly string[]=[]){
    const view=payload.conversations?.[id];if(!view||!host.allowed(id,messageIds))return;
    if(messageIds.some(id=>!view.artifact.messages.some(m=>m.id===id)))return;
    if(dialog.open){populate(view,messageIds);requestAnimationFrame(()=>focus('user'));return;}
    savedY=scrollY;host.beforeOpen();const h=new URLSearchParams(location.hash.slice(1));h.set('conversation',id);if(messageIds.length)h.set('messages',messageIds.join(','));else h.delete('messages');
    history.pushState({...history.state,conversationOpen:true},'','#'+h.toString());populate(view,messageIds);dialog.showModal();requestAnimationFrame(()=>focus('user'));
  }
  function close(){if(closing)return;closing=true;if(current('conversation')===active?.id&&history.state?.conversationOpen)history.back();else{const h=new URLSearchParams(location.hash.slice(1));h.delete('conversation');h.delete('messages');history.replaceState(history.state,'','#'+h.toString());dialog.close();active=undefined;closing=false;window.scrollTo(0,savedY);}}
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('click',async e=>{
    const button=(e.target as Element).closest<HTMLElement>('[data-conv-action]');if(!button||!active)return;
    switch(button.dataset.convAction){
      case'close':close();break;
      case'full':{const full=dialog.classList.toggle('conversation-full');button.textContent=full?u('返回侧栏'):u('全屏阅读');break;}
      case'focus-input':focus('user');break;
      case'focus-reply':focus('assistant');break;
      case'top':dialog.querySelector('.conversation-scroll')!.scrollTop=0;break;
      case'copy':{const m=active.artifact.messages.find(m=>m.id===button.dataset.messageId);if(!m)break;let text=u('已复制');try{await navigator.clipboard.writeText(m.content);}catch{text=u('浏览器未允许复制，可在正文选中文字。');}dialog.querySelector('#conversation-copy-status')!.textContent=text;break;}
      case'source':{const source=active.sources.find(s=>s.sourceId===button.dataset.sourceId);if(!source)break;if(source.evidenceId){host.openEvidence(source.evidenceId);break;}sourceDialog.querySelector('#conversation-source-title')!.textContent=source.label;sourceDialog.querySelector('#conversation-source-meta')!.textContent=u('来源文件SHA256：')+source.sha256+(source.truncated?u('；下方为明确截断的来源片段。'):u('；下方为该对话引用的来源内容。'));sourceDialog.querySelector('#conversation-source-text')!.textContent=source.text??u('此来源没有可显示的文字片段。');const link=sourceDialog.querySelector<HTMLAnchorElement>('#conversation-source-download')!,attachment=safeAttachment(source.attachmentPath);link.hidden=!attachment;if(attachment)link.href=attachment;else link.removeAttribute('href');sourceDialog.showModal();break;}
    }
  });
  sourceDialog.querySelector('button')!.addEventListener('click',()=>sourceDialog.close());
  window.addEventListener('popstate',()=>requestAnimationFrame(()=>restore()));
  return{open,close,restore,current:()=>dialog.open&&active?{id:active.id,messageIds:[...selected]}:undefined};
}
