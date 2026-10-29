/** Pure reader projection is shared by the real browser and non-DOM model regression tests. */
const reportViewModel = (() => {
  type CaseData = import('../contracts/model.mjs').CheckedCase;
  type Evidence = import('../contracts/model.mjs').EvidenceItem;
  type Observation = import('../contracts/model.mjs').Observation;
  type Context = import('../contracts/model.mjs').ExecutionContext;
  type Entry = import('../contracts/model.mjs').ResultEntry;
  const observationIds=(o:Observation)=>[...o.evidenceIds,...(o.actions??[]).flatMap(a=>a.evidenceIds),...(o.evidenceLinks??[]).map(l=>l.evidenceId)];
  const contextIds=(c:Context)=>[c.environment,c.actor,c.object,c.initialState,c.authorization].flatMap(f=>f.sourceEvidenceIds);
  function closure(ids:readonly string[],evidence:readonly Evidence[]):string[]{
    const map=new Map(evidence.map(e=>[e.id,e])),seen=new Set<string>(),queue=[...ids];
    for(let i=0;i<queue.length;i++){const id=queue[i];if(!id||seen.has(id))continue;seen.add(id);queue.push(...(map.get(id)?.metadata?.contextEvidenceIds??[]));}
    return [...seen];
  }
  function history(c:CaseData,entry:Entry,goalId:string){
    const assessment=entry.record.assessments.find(a=>a.goalId===goalId);
    const observations=(assessment?.observationIds??[]).map(id=>entry.record.observations.find(o=>o.id===id)??c.observations.find(o=>o.id===id)).filter((o):o is Observation=>!!o);
    const contexts=[...new Set(observations.map(o=>o.contextId).filter((id):id is string=>!!id))].map(id=>entry.record.contexts?.find(c=>c.id===id)??c.contexts.find(c=>c.id===id)).filter((c):c is Context=>!!c);
    const evidenceIds=[...observations.flatMap(observationIds),...contexts.flatMap(contextIds),...(assessment?.diagnosis?.evidenceIds??[]),...(assessment?.phenomena??[]).flatMap(p=>p.evidenceIds)];
    return {assessment,observations,contexts,evidenceIds};
  }
  function current(c:CaseData,evidence:readonly Evidence[]):string[]{
    const observedIds=new Set(c.assessments.flatMap(a=>a.observationIds));
    const observations=c.observations.filter(o=>observedIds.has(o.id)),contexts=c.contexts.filter(ctx=>observations.some(o=>o.contextId===ctx.id));
    return closure([...observations.flatMap(observationIds),...contexts.flatMap(contextIds),...c.assessments.flatMap(a=>[...(a.diagnosis?.evidenceIds??[]),...(a.phenomena??[]).flatMap(p=>p.evidenceIds)])],evidence);
  }
  function findingRefs(c:CaseData,evidence:readonly Evidence[]):string[]{
    const ids=new Set(c.findings.flatMap(f=>f.observationIds)),observations=c.observations.filter(o=>ids.has(o.id)),contexts=c.contexts.filter(ctx=>observations.some(o=>o.contextId===ctx.id));
    return closure([...c.findings.flatMap(f=>f.evidenceIds),...observations.flatMap(observationIds),...contexts.flatMap(contextIds)],evidence);
  }
  function historical(c:CaseData,evidence:readonly Evidence[]):string[]{
    return closure(c.entries.flatMap(entry=>[...entry.record.observations.flatMap(observationIds),...(entry.record.contexts??[]).flatMap(contextIds),...entry.record.assessments.flatMap(a=>history(c,entry,a.goalId).evidenceIds),...(entry.record.findings??[]).flatMap(f=>f.evidenceIds)]),evidence);
  }
  function sceneFindings(c:CaseData){return {items:[...c.findings],additional:c.findings.filter(f=>f.scope==='additional'),unbound:c.findings.filter(f=>f.goalIds.length===0)};}
  return {closure,history,current,historical,findingRefs,sceneFindings};
})();

/** Offline reader: presentation never changes verdicts, source evidence or business behavior. */
(() => {
  'use strict';
  if(typeof document==='undefined')return;
  type Payload = import('../contracts/model.mjs').HtmlPayload;
  type CaseData = import('../contracts/model.mjs').CheckedCase;
  type Goal = import('../contracts/model.mjs').Goal;
  type Assessment = import('../contracts/model.mjs').CommittedAssessment;
  type Observation = import('../contracts/model.mjs').Observation;
  type Evidence = import('../contracts/model.mjs').EvidenceItem;
  type Context = import('../contracts/model.mjs').ExecutionContext;
  type ContextFact = import('../contracts/model.mjs').ContextFact;
  type Status = import('../contracts/model.mjs').Status | 'unassessed';
  const labels: Record<Status,string> = { verified:'已验证', violation:'发现违反', inconclusive:'无法判断', not_tested:'未测试', unassessed:'未登记目标评估' };
  const order: Status[] = ['violation','inconclusive','not_tested','verified','unassessed'];
  const bodyLabels: Record<string,string> = {full:'来源声明完整留存',selected_fields:'按字段筛选的正文',summary:'检查摘要',truncated:'来源正文截断',excluded:'采集策略排除',failed:'采集失败',unknown:'来源完整程度未知',missing:'文件缺失',unsupported:'格式不支持预览'};
  const kindLabels: Record<string,string> = {screenshot:'截图',tool_receipt:'接口 / 工具回执',log:'日志',dom:'DOM文本',other:'资料'};
  const $ = <T extends HTMLElement = HTMLElement>(s:string):T => { const e=document.querySelector(s);if(!e)throw new Error('Missing report element: '+s);return e as T; };
  const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c));
  const unique=(v:string[])=>[...new Set(v)];
  const badge=(s:Status)=>Object.hasOwn(labels,s)?`<span class="badge status-${s}">${labels[s]}</span>`:'<span class="error">无效状态</span>';
  const list=(items:string[])=>`<ul>${items.map(x=>`<li class="text">${esc(x)}</li>`).join('')}</ul>`;
  function time(value?:string):string {if(!value)return '未记录';const d=new Date(value);return Number.isNaN(d.valueOf())?esc(value):esc(d.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}))+' UTC+08:00';}
  function object(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}
  function assertPayload(v:unknown):asserts v is Payload {
    if(!object(v)||v.htmlPayloadVersion!==6||!object(v.report)||v.report.schemaVersion!==6||!Array.isArray(v.report.cases)||!object(v.report.evidenceCatalog)||!Array.isArray(v.report.evidenceCatalog.items)||!object(v.previews)||!object(v.assets)||!object(v.delivery))throw new Error('报告格式不受支持；需要 v6。历史文件不会被修改。');
    const number=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0,r=v.report;
    if(typeof r.project!=='string'||typeof r.runId!=='string'||!object(r.counts)||!['caseCount','goalCount','revision','evidenceRevision'].every(k=>number(r[k]))||!Object.values(r.counts).every(number))throw new Error('报告统计结构无效。');
    for(const c of v.report.cases){
      if(!object(c)||typeof c.id!=='string'||typeof c.title!=='string'||!Array.isArray(c.goals)||!Array.isArray(c.assessments)||!Array.isArray(c.observations)||!Array.isArray(c.contexts)||!Array.isArray(c.findings)||!Array.isArray(c.entries))throw new Error('报告场景结构无效。');
      for(const g of c.goals)if(!object(g)||typeof g.id!=='string'||typeof g.title!=='string'||typeof g.expected!=='string')throw new Error('报告目标结构无效。');
      for(const a of c.assessments)if(!object(a)||typeof a.status!=='string'||!Object.hasOwn(labels,a.status)||a.status==='unassessed')throw new Error('报告目标状态无效。');
      for(const e of c.entries)if(!object(e)||!number(e.revision))throw new Error('报告历史结构无效。');
    }
    for(const e of v.report.evidenceCatalog.items)if(!object(e)||!number(e.bytes)||typeof e.id!=='string'||typeof e.description!=='string')throw new Error('报告证据结构无效。');
    for(const p of Object.values(v.previews))if(!object(p)||(p.width!==undefined&&!number(p.width))||(p.height!==undefined&&!number(p.height)))throw new Error('报告预览结构无效。');
    for(const a of Object.values(v.assets))if(!object(a)||!number(a.bytes)||!number(a.retainedBytes)||(a.kind==='text'&&typeof a.text!=='string'))throw new Error('报告内容结构无效。');
  }
  let payload:Payload;
  try {const v:unknown=JSON.parse($('#report-data').textContent??'');assertPayload(v);payload=v;}
  catch(e){$('#detail').innerHTML=`<section class="panel error">${esc(e instanceof Error?e.message:'无法读取报告。')}</section>`;return;}
  const report=payload.report;
  const evidenceMap=new Map(report.evidenceCatalog.items.map(e=>[e.id,e]));
  function observationEvidence(o:Observation):string[]{return [...o.evidenceIds,...(o.actions??[]).flatMap(a=>a.evidenceIds),...(o.evidenceLinks??[]).map(l=>l.evidenceId)];}
  function contextEvidence(c:Context):string[]{return [c.environment,c.actor,c.object,c.initialState,c.authorization].flatMap(f=>f.sourceEvidenceIds);}
  function evidenceText(id:string):string {const e=evidenceMap.get(id),p=payload.previews[id],a=p?.assetId?payload.assets[p.assetId]:undefined;return e?[e.description,e.source,e.metadata?.purpose,e.metadata?.page,e.metadata?.object,a?.kind==='text'?a.text:''].filter(Boolean).join('\n'):'';}
  interface Row {c:CaseData;g:Goal;a:Assessment|undefined;observations:Observation[];evidenceIds:string[];status:Status;search:[string,string][]}
  const rows:Row[]=report.cases.flatMap(c=>c.goals.map(g=>{
    const a=c.assessments.find(a=>a.goalId===g.id),observations=c.observations.filter(o=>a?.observationIds.includes(o.id));
    const contexts=c.contexts.filter(ctx=>observations.some(o=>o.contextId===ctx.id));
    const evidenceIds=reportViewModel.closure([...observations.flatMap(observationEvidence),...contexts.flatMap(contextEvidence),...(a?.diagnosis?.evidenceIds??[]),...(a?.phenomena??[]).flatMap(p=>p.evidenceIds)],report.evidenceCatalog.items);
    const history=c.entries.filter(e=>e.record.assessments.some(a=>a.goalId===g.id)).map(e=>{const view=reportViewModel.history(c,e,g.id);return JSON.stringify(view)+'\n'+reportViewModel.closure(view.evidenceIds,report.evidenceCatalog.items).map(evidenceText).join('\n');}).join('\n');
    return {c,g,a,observations,evidenceIds,status:a?.status??'unassessed',search:[['目标',[c.id,c.title,g.id,g.title,g.expected].join('\n')],['当前观察',[a?.summary,a?.rationale,JSON.stringify(a?.phenomena??[]),...observations.map(o=>[o.actual,o.summary,JSON.stringify(o.actions??[])].join('\n'))].join('\n')],['缺口与复核准备',JSON.stringify({gaps:a?.gaps,gapDetails:a?.gapDetails,reproduction:a?.reproduction})],['关联现象',JSON.stringify(c.findings.filter(f=>f.goalIds.includes(g.id)))],['上下文',JSON.stringify(contexts)],['证据正文',evidenceIds.map(evidenceText).join('\n')],['历史记录',history],['共享规则',[g.basis.source,g.basis.text].join('\n')]] as [string,string][]};
  }));
  interface State {view:'overview'|'scene'|'goal'|'evidence';sceneFilter:string;selectedCase:string;goalId:string;status:Status|'all';query:string;evidenceKind:string;evidenceUse:string}
  const initial:State={view:'overview',sceneFilter:'',selectedCase:'',goalId:'',status:'all',query:'',evidenceKind:'all',evidenceUse:'all'};
  let state:State={...initial};let linkedNotice='';
  const backStack:{state:State;pageY:number;listY:number;details:number[];scenes:string[]}[]=[];const sceneOpen=new Set<string>();
  function hi(v:unknown):string{const text=String(v??''),q=state.query;if(!q)return esc(text);const i=text.toLocaleLowerCase().indexOf(q.toLocaleLowerCase());return i<0?esc(text):esc(text.slice(0,i))+'<mark>'+esc(text.slice(i,i+q.length))+'</mark>'+esc(text.slice(i+q.length));}
  function match(r:Row):string[]{const q=state.query.toLocaleLowerCase();return q?r.search.filter(([,text])=>text.toLocaleLowerCase().includes(q)).map(([label])=>label):[];}
  function filtered():Row[]{return rows.filter(r=>(!state.sceneFilter||r.c.id===state.sceneFilter)&&(state.status==='all'||r.status===state.status)&&(!state.query||match(r).length>0));}
  function counts(rs:Row[]):Record<Status,number>{const c={verified:0,violation:0,inconclusive:0,not_tested:0,unassessed:0};for(const r of rs)c[r.status]++;return c;}
  function chips(rs:Row[]):string{const c=counts(rs);return order.filter(s=>s!=='unassessed'||c[s]).map(s=>`<span class="badge status-${s}">${labels[s]} ${c[s]}</span>`).join('');}
  function remember():void{backStack.push({state:{...state},pageY:scrollY,listY:$('#case-list').scrollTop,details:[...document.querySelectorAll<HTMLDetailsElement>('#detail details')].flatMap((d,i)=>d.open?[i]:[]),scenes:[...document.querySelectorAll<HTMLDetailsElement>('#case-list .scene[open]')].map(d=>d.dataset.case??'')});if(backStack.length>80)backStack.shift();}
  function saveHash(evidenceId?:string):void{const p=new URLSearchParams({view:state.view});if(state.selectedCase)p.set('case',state.selectedCase);if(state.goalId)p.set('goal',state.goalId);if(evidenceId&&evidenceMap.has(evidenceId))p.set('evidence',evidenceId);try{history.replaceState(null,'','#'+p.toString());}catch{/* file policy */}}
  function navigate(next:Partial<State>,push=true):void{if(push)remember();state={...state,...next};render();saveHash();$('#detail').scrollIntoView({block:'start'});}
  function selectFirst():void{const r=filtered()[0];state.selectedCase=r?.c.id??'';state.goalId=r?.g.id??'';state.view='goal';}
  function openGoal(caseId:string,goalId:string,related=false):void{const r=rows.find(r=>r.c.id===caseId&&r.g.id===goalId);if(!r)return;linkedNotice=related&&!filtered().includes(r)?'关联目标不在原筛选结果中；这里临时展示，返回可恢复原筛选与位置。':'';sceneOpen.add(caseId);navigate({view:'goal',selectedCase:caseId,goalId});}
  function renderNavigation():void{
    const scroll=$('#case-list').scrollTop;document.querySelectorAll<HTMLDetailsElement>('.scene[open]').forEach(e=>{if(e.dataset.case)sceneOpen.add(e.dataset.case);});
    const hits=filtered(),groups=new Map<string,Row[]>();for(const r of hits){const group=groups.get(r.c.id)??[];group.push(r);groups.set(r.c.id,group);}
    $<HTMLInputElement>('#search').value=state.query;$<HTMLSelectElement>('#status-filter').value=state.status;
    $('#shown').textContent=`命中 ${groups.size} 个场景 / ${hits.length} 个目标 · ${state.sceneFilter?'当前场景内':'全局范围'}`;
    const c=report.cases.find(c=>c.id===state.sceneFilter);$('#scene-scope').innerHTML=c?`<div class="note"><strong>${esc(c.title)}</strong><div class="toolbar"><button data-scene="${esc(c.id)}">本场景全部目标</button><button data-overview>全部场景</button></div></div>`:'';
    $('#case-list').innerHTML=[...groups].map(([id,rs])=>{const c=rs[0]?.c;if(!c)return '';const all=rows.filter(r=>r.c.id===id),open=sceneOpen.has(id)||!!state.query||state.status!=='all'||state.sceneFilter===id;return `<details class="scene" data-case="${esc(id)}" ${open?'open':''}><summary>${hi(c.title)} <span class="inline-id">${esc(id)}</span><div class="meta">${rs.length} 项命中 / 共 ${all.length} 个目标</div><div class="scene-counts">${chips(all)}</div></summary><div class="scene-actions"><button data-scene="${esc(id)}">场景概览 / 全部目标</button><button data-focus="${esc(id)}">只看本场景匹配项</button></div>${rs.map(r=>`<button class="goal-row" data-case-id="${esc(id)}" data-goal-id="${esc(r.g.id)}" aria-current="${state.view==='goal'&&state.selectedCase===id&&state.goalId===r.g.id}">${badge(r.status)} <span class="inline-id">${esc(r.g.id)}</span><strong>${hi(r.g.title)}</strong>${state.query?`<span class="meta">命中：${esc(match(r).join('、'))}</span>`:''}</button>`).join('')}${rs.length<all.length?`<div class="empty">另 ${all.length-rs.length} 个目标未命中。<button data-scene="${esc(id)}">查看全部 ${all.length} 项</button></div>`:''}</details>`;}).join('');
    $('#empty-results').hidden=hits.length>0;$('#case-list').scrollTop=scroll;$<HTMLButtonElement>('#back').disabled=backStack.length===0;
  }
  function sceneOverview():string{
    const statuses=order.filter(s=>s!=='unassessed'||report.counts.unassessed>0);
    return `<section class="panel"><div class="eyebrow">先看场景，再进入测试点</div><h2>${report.caseCount} 个业务场景总览</h2><p class="hint">每个场景保留完整目标及四态分布。点击场景查看具体问题与未完成项。</p><div class="tablewrap"><table><thead><tr><th>业务场景</th><th>目标</th>${statuses.map(s=>`<th>${labels[s]}</th>`).join('')}<th>查看</th></tr></thead><tbody>${report.cases.map(c=>{const rs=rows.filter(r=>r.c.id===c.id),ct=counts(rs);return `<tr><td><button class="title-button" data-scene="${esc(c.id)}">${esc(c.title)}</button><div class="inline-id">${esc(c.id)}</div>${report.context?.supplementalCaseIds.includes(c.id)?'<span class="meta">补充范围</span>':''}</td><td class="num">${rs.length}</td>${statuses.map(s=>`<td class="num"><span class="badge status-${s}">${ct[s]}</span></td>`).join('')}<td><button data-scene="${esc(c.id)}">查看场景</button></td></tr>`;}).join('')}</tbody></table></div></section>`;
  }
  function plan(c:CaseData):string{return `<details><summary>冻结前提与必要业务路径（计划，不等于执行证明）</summary><h4>关键前提</h4>${c.criticalConditions.length?list(c.criticalConditions):'<p class="hint">未列出显式前提。</p>'}<h4>必要路径</h4><p class="text">${esc(c.requiredPath??'未指定')}</p><p class="hint">步骤顺序：${c.stepOrder==='strict'?'必须按冻结顺序':'方法可调整，必要语义保持不变'}</p><ol>${c.steps.map(s=>`<li><span class="inline-id">${esc(s.id)}</span> ${esc(s.action)}</li>`).join('')}</ol></details>`;}
  function sceneFindingSection(c:CaseData):string{
    const findings=reportViewModel.sceneFindings(c);if(!findings.items.length)return '';
    return `<section class="panel" id="scene-findings"><h3>场景关联现象与额外发现</h3><p class="hint">${findings.items.length} 条关联记录，其中 ${findings.additional.length} 条额外发现、${findings.unbound.length} 条未绑定目标。这些记录不计入原目标四态统计，也不自动作为独立缺陷数量。</p>${findings.items.map(f=>`<article class="fact"><h4>${hi(f.title)}</h4><p>${f.scope==='additional'?'额外发现，与原目标分开':'原范围内关联'} · ${f.reviewState==='reviewed'?'关系已审核':'关系待审核'}</p><p class="text">${hi(f.relationReason)}</p>${f.goalIds.length?f.goalIds.map(id=>`<button class="link-button" data-related-case="${esc(c.id)}" data-related-goal="${esc(id)}">${esc(c.goals.find(g=>g.id===id)?.title??id)}</button>`).join(''):'<p class="note">没有绑定原业务目标；不能因此隐藏这条发现或改写原目标状态。</p>'}${evidenceButtons(reportViewModel.closure(f.evidenceIds,report.evidenceCatalog.items),f.scope==='additional'?'额外发现引用':'关联现象引用')}<details><summary>该现象的实际观察与来源</summary>${c.observations.filter(o=>f.observationIds.includes(o.id)).map(o=>renderObservation(o,c,f.scope==='additional'?'额外发现引用':'关联现象引用')).join('')||'<p class="hint">没有单独引用观察。</p>'}<pre class="body-text">${esc(JSON.stringify(f,null,2))}</pre></details></article>`).join('')}</section>`;
  }
  function sceneDetail():string{
    const c=report.cases.find(c=>c.id===state.selectedCase);if(!c)return sceneOverview();const rs=rows.filter(r=>r.c.id===c.id);
    return `<section class="panel"><div class="backbar"><button data-overview>全部场景</button><button data-scene-violations="${esc(c.id)}">只看本场景违反目标</button></div><div class="meta">${esc(c.id)} · 场景完整范围</div><h2>${esc(c.title)}</h2><p>共 ${rs.length} 个业务目标；这里没有隐藏其他状态。</p><div class="chips">${chips(rs)}</div>${c.findings.length?'<a class="link-button" href="#scene-findings" data-section="scene-findings">查看场景关联现象与额外发现</a>':''}<div class="tablewrap"><table><thead><tr><th>测试点与实际观察</th><th>原记录状态</th></tr></thead><tbody>${rs.map(r=>`<tr><td><button class="title-button" data-case-id="${esc(c.id)}" data-goal-id="${esc(r.g.id)}">${esc(r.g.title)}</button><div class="inline-id">${esc(r.g.id)}</div>${r.a?`<details><summary><span class="short-observation">${esc(r.a.summary??r.a.rationale)}</span><span class="meta">展开完整判断</span></summary><p class="text">${esc(r.a.rationale)}</p></details>`:'<p class="hint">未登记评估，无法据此推断业务状态。</p>'}</td><td>${badge(r.status)}</td></tr>`).join('')}</tbody></table></div>${plan(c)}</section>${sceneFindingSection(c)}`;
  }
  function metadata(e:Evidence):string{const p=payload.previews[e.id],m=e.metadata;return `<details><summary>来源与文件完整性</summary><div class="meta text">证据 ${esc(e.id)}\n来源：${esc(e.source)}\n登记时间：${time(e.collectedAt)}\n来源采集时间：${time(e.capturedAt)}\nSHA-256：${esc(e.sha256)}\n留存字节：${e.bytes}${p?.width?`\n实际图片尺寸：${p.width} × ${p.height}`:''}${m?.page?'\n页面：'+esc(m.page):''}${m?.object?'\n对象：'+esc(m.object):''}${m?.scope?'\n采集范围：'+esc({page:'页面',viewport:'视口',element:'局部元素',document:'文档',unknown:'未知'}[m.scope]):''}${m?.redaction?'\n脱敏：'+esc(m.redaction):''}${m?.omissionReason?'\n省略：'+esc(m.omissionReason):''}</div><p class="hint">hash一致只证明留存字节一致，不证明事实真实或业务正确。</p></details>`;}
  function imageSource(e:Evidence):string|undefined{const p=payload.previews[e.id],a=p?.assetId?payload.assets[p.assetId]:undefined;return a?.kind==='image'&&a.data&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(a.data)?a.data:undefined;}
  function evidenceButtons(ids:string[],context='关联证据'):string{return unique(ids).map(id=>`<button class="link-button" data-evidence="${esc(id)}" data-evidence-context="${esc(context)}">${esc(evidenceMap.get(id)?.description??id)}</button>`).join('');}
  function evidenceCard(id:string,context='当前引用',expanded=false):string{
    const e=evidenceMap.get(id);if(!e)return `<div class="error">引用的证据不存在：${esc(id)}</div>`;const p=payload.previews[id],asset=p?.assetId?payload.assets[p.assetId]:undefined,src=imageSource(e);
    const attachment=p?.attachmentPath&&/^(?:attachments|evidence)\/[a-zA-Z0-9_./-]+$/.test(p.attachmentPath)&&!p.attachmentPath.split('/').includes('..')?p.attachmentPath:undefined;
    let content='';if(src)content=`<figure><button class="image-button" data-image="${esc(id)}" data-evidence-context="${esc(context)}"><img class="thumb" src="${src}" alt="${esc(e.description)}" loading="lazy"><span class="meta">${p?.width?`${p.width} × ${p.height} · `:''}查看原图</span></button><figcaption>${hi(e.description)}</figcaption></figure>`;
    else if(asset?.kind==='text'&&asset.text!==undefined)content=`<details ${expanded||(state.query&&asset.text.toLocaleLowerCase().includes(state.query.toLocaleLowerCase()))?'open':''}><summary>${hi(e.description)} · ${kindLabels[e.kind]} · 查看正文</summary><p class="hint">以下是实际留存内容。${esc(bodyLabels[p?.contentState??'unknown'])}；摘要或筛选字段不等于完整HTTP响应。</p><pre class="body-text">${hi(asset.text)}</pre>${asset.truncated?`<p class="note">展示已截断：预览 ${asset.retainedBytes} / 原文件 ${asset.bytes} 字节。${attachment?'完整交付内容见附件。':'此HTML未包含完整正文，不能据此宣称交付完整。'}</p>`:''}</details>`;
    else content=`<h4>${hi(e.description)}</h4><p class="empty">${esc(p?.previewNote||'此证据没有可预览正文；元数据不能替代实际内容。')}</p>`;
    return `<article class="evidence-card" id="evidence-${esc(id)}">${context!=='当前引用'?`<p class="note">${esc(context)}；材料存在不等于支持当前结论。</p>`:''}${content}${p?.previewNote&&(src||asset?.kind==='text')?`<p class="hint">${esc(p.previewNote)}</p>`:''}${e.metadata?.purpose?`<p><strong>用途：</strong>${esc(e.metadata.purpose)}</p>`:''}${e.metadata?.limitations?.length?`<p class="hint">局限：${esc(e.metadata.limitations.join('；'))}</p>`:''}${e.metadata?.contextEvidenceIds?.length?`<p class="hint">关联上下文：</p>${evidenceButtons(e.metadata.contextEvidenceIds,'上下文关联')}`:''}${attachment?`<a class="attachment" href="${esc(attachment)}" download>打开留存附件</a>`:''}${metadata(e)}</article>`;
  }
  const evidenceGrid=(ids:string[],context='当前引用')=>ids.length?`<div class="evidence-grid">${unique(ids).map(id=>evidenceCard(id,context)).join('')}</div>`:'<p class="empty">没有关联证据；这不是通过结论。</p>';
  function contextFact(title:string,f:ContextFact):string{const value=f.state==='known'?f.value??'':(f.state==='unknown'?'未知：':'不适用：')+(f.reason??'未说明');return `<div class="contextfact"><div class="kicker">${title}</div><p class="text">${hi(value)}</p>${f.sourceEvidenceIds.length?evidenceButtons(f.sourceEvidenceIds,'上下文来源'):'<p class="meta">未关联独立来源证据。</p>'}</div>`;}
  function renderContext(c:Context):string{return `<section class="fact"><h4>执行上下文 <span class="inline-id">${esc(c.id)}</span></h4><div class="contexts">${contextFact('环境 / 版本',c.environment)}${contextFact('身份 / 角色 / 租户',c.actor)}${contextFact('操作对象',c.object)}${contextFact('初始状态',c.initialState)}${contextFact('授权条件',c.authorization)}</div>${c.notes?`<p class="hint text">${esc(c.notes)}</p>`:''}</section>`;}
  function renderObservation(o:Observation,c:CaseData,context='当前引用'):string{
    const ctx=c.contexts.find(ctx=>ctx.id===o.contextId);
    return `<section class="fact"><h4>实际观察 <span class="inline-id">${esc(o.id)}</span></h4><p class="text">${hi(o.actual??o.summary)}</p><p class="meta">事实发生时间：${time(o.occurredAt)}${o.contextId?' · 上下文 '+esc(o.contextId):' · 未绑定独立上下文'}</p>${ctx?`<details><summary>身份、对象与初态</summary>${renderContext(ctx)}</details>`:''}${o.actions?.length?o.actions.map((a,i)=>`<div class="action"><div class="action-header"><span class="action-number">${i+1}</span><div><h4>${hi(a.description)}</h4>${a.input?`<p class="text"><strong>实际输入：</strong>${hi(a.input)}</p>`:''}${a.result?`<p class="text"><strong>观察结果：</strong>${hi(a.result)}</p>`:''}<p class="meta">操作时间：${time(a.occurredAt)} · ${esc(a.id)}</p></div></div>${evidenceGrid(a.evidenceIds,context)}${(o.evidenceLinks??[]).filter(l=>l.actionId===a.id).map(l=>`<p><strong>证据用途：</strong>${esc(l.purpose)}；支持事实：${esc(l.fact)}${l.limitations.length?'；局限：'+esc(l.limitations.join('；')):''}${evidenceButtons([l.evidenceId],context)}</p>`).join('')}</div>`).join(''):'<p class="note">原记录未提供独立的实际动作序列。下方计划不能当作已执行步骤。</p>'}${(o.evidenceLinks??[]).filter(l=>!l.actionId).map(l=>`<p><strong>${esc(l.purpose)}</strong>：${esc(l.fact)}${l.limitations.length?'；局限：'+esc(l.limitations.join('；')):''}${evidenceButtons([l.evidenceId],context)}</p>`).join('')}<details><summary>原始观察与必要语义引用</summary><p class="text">${esc(o.summary)}</p><p class="meta">覆盖：${esc(o.coveredRefs.join('、')||'未声明')}</p>${evidenceButtons(o.evidenceIds,context)}</details></section>`;
  }
  function sameRun(id:string):boolean{return id==='self'||id===report.runId;}
  function relations(row:Row):string{
    const f=row.g.followUpOf;let html='';if(f)html+=`<div class="note"><strong>本目标复核的来源</strong><p class="text">${esc(f.reason)}</p><p class="meta">${esc(f.runId)} / ${esc(f.caseId)} / ${esc(f.goalId)}</p>${sameRun(f.runId)&&rows.some(r=>r.c.id===f.caseId&&r.g.id===f.goalId)?`<button data-related-case="${esc(f.caseId)}" data-related-goal="${esc(f.goalId)}">查看原目标</button>`:'<p class="hint">源运行未包含在本报告，只保留追踪引用；不据此宣布已解决。</p>'}</div>`;
    for(const r of rows.filter(r=>r.g.followUpOf&&sameRun(r.g.followUpOf.runId)&&r.g.followUpOf.caseId===row.c.id&&r.g.followUpOf.goalId===row.g.id))html+=`<p><button data-related-case="${esc(r.c.id)}" data-related-goal="${esc(r.g.id)}">后续复核：${esc(r.g.title)}</button> ${badge(r.status)} <span class="hint">原评估保留，不自动替换。</span></p>`;
    return html;
  }
  const referenceCache=new Map(report.cases.map(c=>[c.id,{current:new Set(reportViewModel.current(c,report.evidenceCatalog.items)),history:new Set(reportViewModel.historical(c,report.evidenceCatalog.items)),findings:new Set(reportViewModel.findingRefs(c,report.evidenceCatalog.items))}]));
  function referenceLabel(e:Evidence):string{const refs=referenceCache.get(e.caseId);return !refs?'未关联场景':refs.current.has(e.id)?'当前引用':refs.findings.has(e.id)?'关联现象引用':refs.history.has(e.id)?'仅历史引用':'已登记未引用';}
  function historyFacts(view:ReturnType<typeof reportViewModel.history>,c:CaseData):string{
    const a=view.assessment;if(!a)return '<p class="empty">未找到当时的目标评估。</p>';
    return `<details><summary>当时完整事实、上下文与判断字段</summary><p class="hint">以下来自该次评估及其引用的不可变观察；复用早先观察不会被改写为新采集。</p>${view.contexts.map(renderContext).join('')}${view.observations.map(o=>renderObservation(o,c,'历史引用')).join('')}${(a.phenomena??[]).map(p=>`<section class="fact"><h4>${hi(p.title)}</h4><p class="text">${hi(p.actual)}</p>${p.limitations.length?list(p.limitations):''}${evidenceButtons(p.evidenceIds,'历史现象引用')}</section>`).join('')}${(a.gapDetails??[]).map(g=>`<p class="note">${hi(g.missing)}；影响：${hi(g.impact)}${g.nextStep?'；需要准备：'+hi(g.nextStep):''}</p>`).join('')}${a.diagnosis?`<section class="fact"><h4>当时根因判断</h4><p>${esc(a.diagnosis.state)} / ${esc(a.diagnosis.category)}：${hi(a.diagnosis.summary)}</p>${evidenceButtons(a.diagnosis.evidenceIds,'历史诊断引用')}</section>`:''}${a.reproduction?`<section class="fact"><h4>当时复核准备</h4>${list(a.reproduction.preparation)}<p>对象现状：${hi(a.reproduction.objectState)}</p><p>重复观察：${hi(a.reproduction.repeatability)}</p>${list(a.reproduction.limitations)}</section>`:''}<details><summary>完整历史原始字段（目标范围）</summary><pre class="body-text">${esc(JSON.stringify(view,null,2))}</pre></details></details>`;
  }
  function goalDetail():string{
    const row=rows.find(r=>r.c.id===state.selectedCase&&r.g.id===state.goalId);if(!row)return '<section class="panel empty">没有符合当前条件的目标。可重置筛选查看完整报告。</section>';
    const {c,g,a,observations}=row,contexts=c.contexts.filter(ctx=>observations.some(o=>o.contextId===ctx.id));
    let html=`<section class="panel"><div class="backbar"><button data-scene="${esc(c.id)}">← 所属场景全部目标</button><button data-overview>全部场景</button></div><div class="trail"><span class="meta">${esc(c.title)} · ${esc(c.id)} / ${esc(g.id)}</span>${report.context?.supplementalCaseIds.includes(c.id)?'<span class="meta">补充范围</span>':''}</div><h2>${hi(g.title)}</h2>${a?`<p class="lead text">${hi(a.summary??a.rationale)}</p>`:''}<p>${badge(row.status)}</p>${linkedNotice?`<p class="note">${esc(linkedNotice)}</p>`:''}<nav class="sectionlinks"><a href="#judgment" data-section="judgment">预期与实际</a><a href="#facts" data-section="facts">实际经过</a><a href="#evidence" data-section="evidence">证据</a><a href="#history-section" data-section="history-section">历史与来源</a></nav></section>`;
    html+=`<section class="panel section" id="judgment"><h3>预期与实际</h3><div class="compare"><div><div class="kicker">业务预期 · 冻结原文</div><p class="text">${hi(g.expected)}</p></div><div><div class="kicker">判断理由 · 当前记录</div><p class="text">${a?hi(a.rationale):'未登记评估是记录缺口，不是第五种业务状态，也不能自动解释为未测试。'}</p></div></div>${g.clarificationQuestions?.length?`<div class="note"><strong>冻结待澄清</strong>${list(g.clarificationQuestions)}</div>`:''}`;
    if(a){
      html+=(a.phenomena??[]).map(p=>`<section class="fact"><h4>${hi(p.title)}</h4><p class="text">${hi(p.actual)}</p>${p.limitations.length?`<p class="note">${esc(p.limitations.join('；'))}</p>`:''}${evidenceGrid(p.evidenceIds)}<p class="meta">现象 ${esc(p.id)} · 观察 ${esc(p.observationIds.join('、'))}；拆分现象不增加目标数。</p></section>`).join('');
      if(a.gaps.length)html+=`<div class="note"><strong>尚存事实缺口</strong>${list(unique(a.gaps))}</div>`;
      html+=(a.gapDetails??[]).map(gap=>`<div class="note"><strong>${esc(gap.missing)}</strong><p>影响：${esc(gap.impact)}</p>${gap.nextStep?`<p>需要准备：${esc(gap.nextStep)}</p>`:''}</div>`).join('');
      if(a.diagnosis)html+=`<p class="hint">根因${{unknown:'未确认',hypothesis:'仅为假设',confirmed:'已确认'}[a.diagnosis.state]}：${esc(a.diagnosis.summary)}。根因与业务状态分别保留。</p>${evidenceButtons(a.diagnosis.evidenceIds,'诊断引用')}`;
    }
    html+=`<details ${state.query&&match(row).includes('共享规则')?'open':''}><summary>规则来源与完整原文 · ${{explicit:'明确要求',interpretation:'解释',hypothesis:'假设'}[g.basis.kind]}</summary><p class="meta text">${hi(g.basis.source)}</p><p class="text">${hi(g.basis.text)}</p><p class="meta">必要语义：${esc(g.requiredRefs.join('、'))}</p></details>${relations(row)}</section>`;
    html+=`<section class="panel section" id="facts"><h3>实际经过与复核准备</h3>${contexts.length?contexts.map(renderContext).join(''):'<p class="note">此目标未绑定独立执行上下文；身份、对象及初态不得从计划自动补造。</p>'}${observations.length?observations.map(o=>renderObservation(o,c)).join(''):'<p class="empty">当前评估未引用执行观察。请结合状态和缺口阅读，不能以计划代替现场。</p>'}`;
    if(a?.reproduction)html+=`<section class="fact"><h4>依据实际记录整理的复核准备</h4>${list(a.reproduction.preparation)}<p><strong>对象现状：</strong>${esc(a.reproduction.objectState)}</p><p><strong>重复观察：</strong>${esc(a.reproduction.repeatability)}</p>${a.reproduction.limitations.length?`<p class="note">${esc(a.reproduction.limitations.join('；'))}</p>`:''}<p class="hint">复核准备不授予新的业务操作权限。</p></section>`;
    else html+='<p class="hint">未登记独立复现准备、对象最终状态或重复观察说明；不要假定稳定复现。</p>';
    html+=`${plan(c)}</section><section class="panel section" id="evidence"><h3>当前引用证据 · ${row.evidenceIds.length} 项</h3><p class="hint">文件登记、正文及业务支持范围分别表达；资料类目标没有截图不自动判失败。</p>${evidenceGrid(row.evidenceIds)}</section>`;
    const findings=c.findings.filter(f=>f.goalIds.includes(g.id));
    if(findings.length)html+=`<section class="panel"><h3>已登记的关联现象</h3>${findings.map(f=>`<article class="fact"><h4>${esc(f.title)}</h4><p>${f.scope==='additional'?'额外发现，与原目标状态分别保留':'原范围内关联'} · ${f.reviewState==='reviewed'?'已审核关系':'待审核关系'}</p><p class="text">${esc(f.relationReason)}</p>${f.goalIds.map(id=>`<button class="link-button" data-related-case="${esc(c.id)}" data-related-goal="${esc(id)}">${esc(c.goals.find(g=>g.id===id)?.title??id)}</button>`).join('')}${evidenceButtons(f.evidenceIds,'关联现象')}</article>`).join('')}<p class="hint">关系登记不等于同根因，不自动形成独立缺陷总数。</p></section>`;
    const history=c.entries.filter(e=>e.record.assessments.some(a=>a.goalId===g.id));
    html+=`<section class="panel section" id="history-section"><h3>登记历史与来源</h3><p class="hint">final是增量登记或修订，不能按条数计算复测次数；attempt保留尝试，不替换当前结果。</p>${history.map(e=>{
      const view=reportViewModel.history(c,e,g.id),old=view.assessment;if(!old)return '';
      return `<details class="history-entry" data-history-operation="${esc(e.operationId)}" ${state.query&&match(row).includes('历史记录')?'open':''}><summary>${badge(old.status)}${e.operationId===a?.operationId?'当前采用':'历史记录'} · ${e.mode==='attempt'?'尝试':'评估登记'} · revision ${e.revision}</summary><p class="meta">登记时间：${time(e.recordedAt)} · ${esc(e.operationId)}</p>${old.revisionReason?`<p>修订原因：${hi(old.revisionReason)}</p>`:'<p class="hint">未记录独立修订原因。</p>'}${old.previousOperationId?`<p class="meta">关联前次登记：${esc(old.previousOperationId)}</p>`:''}<p class="text">${hi(old.rationale)}</p>${old.gaps.length?`<p class="note">当时缺口：${esc(old.gaps.join('；'))}</p>`:''}${evidenceButtons(reportViewModel.closure(view.evidenceIds,report.evidenceCatalog.items),'历史引用')}${historyFacts(view,c)}</details>`;
    }).join('')||'<p class="empty">未找到本目标的历史登记。</p>'}`;
    const unused=report.evidenceCatalog.items.filter(e=>e.caseId===c.id&&referenceLabel(e)==='已登记未引用');
    if(unused.length)html+=`<details><summary>同场景已登记未引用证据 · ${unused.length} 项</summary><p class="note">没有引用关系，不意味着支持当前结论。</p>${evidenceButtons(unused.map(e=>e.id),'已登记未引用')}</details>`;
    html+=`<details><summary>当前评估原始字段与技术溯源</summary><p class="meta">Run ${esc(report.runId)} · 结果版本 ${report.revision} · 证据版本 ${report.evidenceRevision}</p><pre class="body-text">${esc(JSON.stringify(a??{recordingGap:'未登记评估'},null,2))}</pre></details></section>`;
    return html;
  }
  function library():string{
    const q=state.query.toLocaleLowerCase(),items=report.evidenceCatalog.items.filter(e=>(state.evidenceKind==='all'||e.kind===state.evidenceKind)&&(state.evidenceUse==='all'||referenceLabel(e)===state.evidenceUse)&&(!q||(e.id+'\n'+evidenceText(e.id)).toLocaleLowerCase().includes(q)));
    return `<section class="panel"><h2>证据库</h2><p class="hint">${items.length} / ${report.evidenceCatalog.items.length} 项登记；内容去重不删除ID、来源和引用关系。</p><div class="library-controls"><label>种类<select id="evidence-kind">${['all','screenshot','tool_receipt','log','dom','other'].map(k=>`<option value="${k}" ${k===state.evidenceKind?'selected':''}>${k==='all'?'全部种类':kindLabels[k]}</option>`).join('')}</select></label><label>引用范围<select id="evidence-use">${['all','当前引用','关联现象引用','仅历史引用','已登记未引用'].map(k=>`<option value="${k}" ${k===state.evidenceUse?'selected':''}>${k==='all'?'全部引用状态':k}</option>`).join('')}</select></label></div>${items.length?`<div class="tablewrap"><table><thead><tr><th>证据</th><th>场景 / 种类</th><th>引用与内容</th></tr></thead><tbody>${items.map(e=>`<tr><td><button class="title-button" data-evidence="${esc(e.id)}" data-evidence-context="${esc(referenceLabel(e))}">${hi(e.description)}</button><div class="inline-id">${esc(e.id)}</div></td><td><button class="link-button" data-scene="${esc(e.caseId)}">${esc(report.cases.find(c=>c.id===e.caseId)?.title??e.caseId)}</button><div class="meta">${kindLabels[e.kind]}</div></td><td>${referenceLabel(e)}<div class="meta">${esc(bodyLabels[payload.previews[e.id]?.contentState??'unknown'])}</div></td></tr>`).join('')}</tbody></table></div>`:'<p class="empty">证据库当前筛选没有结果；可重置条件继续查看。</p>'}</section>`;
  }
  function findingMatches():string{
    const q=state.query.toLocaleLowerCase(),cases=report.cases.filter(c=>(!state.sceneFilter||c.id===state.sceneFilter)&&c.findings.some(f=>!q||JSON.stringify(f).toLocaleLowerCase().includes(q)));
    if(!cases.length)return '';
    return `<section class="panel"><h3>${q?'另有场景现象关键词命中':'场景关联现象入口'}</h3><p class="hint">这里独立列示关联现象及额外发现，不受目标状态推断，不计入目标命中数。</p>${cases.map(c=>`<article class="fact"><button class="title-button" data-scene="${esc(c.id)}">${esc(c.title)} · 查看关联现象与额外发现</button>${c.findings.filter(f=>!q||JSON.stringify(f).toLocaleLowerCase().includes(q)).map(f=>`<p>${hi(f.title)} <span class="meta">${f.scope==='additional'?'额外发现':'原范围关联'}${f.goalIds.length?'':' · 未绑定目标'}</span></p>`).join('')}</article>`).join('')}</section>`;
  }
  function render():void{renderNavigation();$('#detail').innerHTML=state.view==='overview'?sceneOverview()+findingMatches():state.view==='scene'?sceneDetail():state.view==='evidence'?library():goalDetail()+(state.query?findingMatches():'');}
  $('#project-line').textContent=report.project;$('#run-line').textContent=`Run ${report.runId} · 时间显示 UTC+08:00 · 离线报告 v6`;
  $('#scope-summary').textContent=`${report.caseCount} 个场景 · ${report.goalCount} 个业务目标`;
  $('#retrospective-label').hidden=!report.context;
  $('#summary').innerHTML=order.filter(s=>s!=='unassessed'||report.counts.unassessed>0).map(s=>`<button class="stat status-${s}" data-stat="${s}"><strong>${report.counts[s]}</strong><span>${labels[s]}</span></button>`).join('');
  if(!report.assessmentComplete||!payload.delivery.complete){$('#recording-warning').hidden=false;$('#recording-warning').textContent=[!report.assessmentComplete?`${report.counts.unassessed} 个目标未登记评估；这是记录缺口，不能算作通过或未测试。`:'',!payload.delivery.complete?'证据交付不完整；请查看各证据的缺失、截断或附件说明。':''].filter(Boolean).join(' ');}
  $('#integrity').innerHTML=`<p class="hint">${report.evidenceIntegrity.hashVerifiedItems} 项文件hash匹配；${report.evidenceCoverage.registeredScreenshots} 项截图登记，全部证据按内容去重 ${report.evidenceCoverage.distinctRetainedContents} 份。记录${report.assessmentComplete?'完整':'不完整'}不等于业务验收通过。</p><p class="meta">结果 revision ${report.revision} · 证据 revision ${report.evidenceRevision} · ${payload.delivery.mode==='bundle'?'附件包交付，移动时须保留附件目录':'独立HTML交付'}。</p>`;
  if(report.execution&&report.executionSummary){const e=report.execution,s=report.executionSummary;$('#execution-summary').innerHTML=`<h4>执行记录</h4><p class="hint">并发上限 ${s.configuredMaxParallelCases}；名额峰值 ${s.peakReservations}；执行峰值 ${s.reportedExecutionPeak??'未知'}。名额不是浏览器实测重叠。</p><p class="hint">未完成分派 ${s.unfinishedAssignmentIds.length}；待导入 ${s.pendingImportIds.length}。</p>${e.assignments.length?`<details><summary>分派与事件明细</summary>${e.assignments.map(a=>`<p class="meta">${esc(a.caseId)} / ${esc(a.id)} / ${esc(a.state)} / worker ${esc(a.workerId??'未绑定')} / Space ${esc(a.defaultSpaceId??'未知')}</p>`).join('')}${e.events.filter(e=>e.kind.startsWith('note:')).map(e=>`<p class="meta">${esc(e.kind)}：${esc(e.reason)}</p>`).join('')}</details>`:''}`;}
  if(report.context)$('#report-context').innerHTML=`<h4>事后整理来源</h4><p class="text">${esc(report.context.summary)}</p>${list(report.context.limitations)}${report.context.sources.map(s=>`<p class="meta">${esc(s.label)} · ${esc(s.file)} · SHA-256 ${esc(s.sha256)}</p>`).join('')}`;
  const modals=new Map<string,{focus:HTMLElement|null;x:number;y:number;body:string;root:string}>();
  let applyingLocation=false;
  function openDialog(id:string,trigger?:HTMLElement):void{
    const d=$<HTMLDialogElement>('#'+id);if(d.open)return;
    modals.set(id,{focus:trigger??document.activeElement as HTMLElement,x:scrollX,y:scrollY,body:document.body.style.overflow,root:document.documentElement.style.overflow});
    document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden';d.showModal();
  }
  document.querySelectorAll<HTMLDialogElement>('dialog').forEach(d=>d.addEventListener('close',()=>{
    const m=modals.get(d.id);if(!m)return;modals.delete(d.id);document.body.style.overflow=m.body;document.documentElement.style.overflow=m.root;window.scrollTo(m.x,m.y);m.focus?.focus({preventScroll:true});if(!applyingLocation&&d.id!=='theme-dialog'){if($<HTMLDialogElement>('#lightbox').open)saveHash(gallery[imageIndex]);else if($<HTMLDialogElement>('#evidence-dialog').open)saveHash($('#evidence-dialog').dataset.evidenceId);else saveHash();}
  }));
  let gallery:string[]=[],imageIndex=0,imageContext='',zoom=1;
  function setImageMode(mode:'fit'|'original'|'zoom'):void{
    const image=$<HTMLImageElement>('#lightbox-image');$('#image-body').className='viewerbody '+mode;
    if(mode!=='zoom'){image.style.width='';image.style.height='';zoom=1;}else{image.style.width=Math.round(image.naturalWidth*zoom)+'px';image.style.height='auto';}
    $('#image-zoom').textContent=mode==='fit'?'适应':Math.round(zoom*100)+'%';
  }
  function showImage():void{
    const id=gallery[imageIndex],e=id?evidenceMap.get(id):undefined;if(!e)return;const image=$<HTMLImageElement>('#lightbox-image'),p=payload.previews[e.id];
    $('#lightbox-error').hidden=true;image.hidden=false;image.alt=e.description;image.src=imageSource(e)??'';
    $('#lightbox-caption').textContent=`${imageIndex+1} / ${gallery.length} · ${e.description}`;
    $('#image-meta').textContent=`${imageContext}；${p?.width?`${p.width} × ${p.height} 像素；`:''}来源采集时间 ${time(e.capturedAt)}；登记时间 ${time(e.collectedAt)}。${e.metadata?.limitations?.join('；')??''}`;
    if($<HTMLDialogElement>('#lightbox').open)saveHash(e.id);
    $<HTMLButtonElement>('#image-prev').disabled=gallery.length<2;$<HTMLButtonElement>('#image-next').disabled=gallery.length<2;setImageMode('fit');$('#image-body').scrollTop=0;$('#image-body').scrollLeft=0;
  }
  function openImage(id:string,context:string,trigger:HTMLElement):void{
    const row=state.view==='goal'?rows.find(r=>r.c.id===state.selectedCase&&r.g.id===state.goalId):undefined;
    gallery=(context==='当前引用'&&row?row.evidenceIds:[id]).filter(id=>{const e=evidenceMap.get(id);return !!e&&!!imageSource(e);});
    if(!gallery.includes(id))gallery=[id];imageIndex=gallery.indexOf(id);imageContext=context;showImage();openDialog('lightbox',trigger);saveHash(id);
  }
  function openEvidence(id:string,context:string,trigger:HTMLElement):void{
    const e=evidenceMap.get(id);if(!e)return;if(imageSource(e)){openImage(id,context,trigger);return;}
    $('#evidence-title').textContent=e.description;$('#evidence-content').innerHTML=evidenceCard(id,context,true);$('#evidence-dialog').dataset.evidenceId=id;openDialog('evidence-dialog',trigger);saveHash(id);
  }
  $<HTMLImageElement>('#lightbox-image').addEventListener('error',()=>{$<HTMLImageElement>('#lightbox-image').hidden=true;$('#lightbox-error').hidden=false;$('#lightbox-error').textContent='图片无法解码；这里没有显示真实图像。文件hash匹配不能替代图片可读性。';});
  document.addEventListener('error',event=>{const image=event.target;if(image instanceof HTMLImageElement&&image.classList.contains('thumb')){image.hidden=true;const p=document.createElement('p');p.className='error';p.textContent='图片无法解码；请核对留存文件。';image.after(p);}},true);
  function nextImage(delta:number):void{if(gallery.length){imageIndex=(imageIndex+delta+gallery.length)%gallery.length;showImage();}}
  $('#image-prev').onclick=()=>nextImage(-1);$('#image-next').onclick=()=>nextImage(1);$('#image-fit').onclick=()=>setImageMode('fit');$('#image-original').onclick=()=>setImageMode('original');
  $('#image-minus').onclick=()=>{zoom=Math.max(.25,zoom/1.25);setImageMode('zoom');};$('#image-plus').onclick=()=>{zoom=Math.min(5,zoom*1.25);setImageMode('zoom');};
  $('#lightbox').addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();nextImage(e.key==='ArrowLeft'?-1:1);}});
  const themeNames=new Map([...document.querySelectorAll<HTMLElement>('[data-theme-id]')].map(button=>[button.dataset.themeId??'',(button.textContent??'').trim().replace(/^[A-H]\s*·\s*/,'')]));
  const themeStorageKey='ego-report-theme-v1';
  function applyTheme(id:string,persist:boolean):void{
    if(!themeNames.has(id))return;document.documentElement.dataset.theme=id;$('#theme-button').textContent='主题 · '+themeNames.get(id);$('#theme-status').textContent='已切换为'+themeNames.get(id);
    document.querySelectorAll<HTMLElement>('[data-theme-id]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeId===id)));
    if(persist){try{localStorage.setItem(themeStorageKey,id);$('#theme-storage').textContent='已在当前浏览器记住此主题。';}catch{$('#theme-storage').textContent='当前浏览器不允许保存偏好；本次切换仍然有效。';}}
  }
  try{const saved=localStorage.getItem(themeStorageKey);if(saved)applyTheme(saved,false);}catch{/* file:// storage can be unavailable; A remains usable. */}
  $('#theme-button').onclick=()=>openDialog('theme-dialog',$('#theme-button'));
  function reset():void{linkedNotice='';navigate({...initial});}
  $('#reset').onclick=reset;$('#empty-reset').onclick=reset;$('#all-scenes').onclick=reset;
  $('#back').onclick=()=>{const saved=backStack.pop();if(!saved)return;state=saved.state;linkedNotice='';sceneOpen.clear();saved.scenes.forEach(id=>sceneOpen.add(id));$('#case-list').innerHTML='';render();document.querySelectorAll<HTMLDetailsElement>('#detail details').forEach((d,i)=>{d.open=saved.details.includes(i);});document.querySelectorAll<HTMLDetailsElement>('#case-list .scene').forEach(d=>{d.open=saved.scenes.includes(d.dataset.case??'');});saveHash();window.scrollTo({top:saved.pageY,behavior:'instant'});$('#case-list').scrollTop=saved.listY;};
  $('#library-button').onclick=()=>navigate({...initial,view:'evidence'});
  let searchTimer=0;
  $('#search').addEventListener('input',()=>{window.clearTimeout(searchTimer);searchTimer=window.setTimeout(()=>{state.query=$<HTMLInputElement>('#search').value.trim();linkedNotice='';if(state.view!=='evidence')selectFirst();render();},120);});
  $<HTMLSelectElement>('#status-filter').onchange=()=>{state.status=$<HTMLSelectElement>('#status-filter').value as State['status'];linkedNotice='';selectFirst();render();};
  document.addEventListener('change',event=>{const t=event.target;if(!(t instanceof HTMLSelectElement))return;if(t.id==='evidence-kind'){state.evidenceKind=t.value;$('#detail').innerHTML=library();}if(t.id==='evidence-use'){state.evidenceUse=t.value;$('#detail').innerHTML=library();}});
  document.addEventListener('toggle',event=>{const d=event.target;if(d instanceof HTMLDetailsElement&&d.classList.contains('scene')&&d.dataset.case){if(d.open)sceneOpen.add(d.dataset.case);else sceneOpen.delete(d.dataset.case);}},true);
  document.addEventListener('click',event=>{
    const t=event.target;if(!(t instanceof Element))return;const target=t.closest<HTMLElement>('button,a');if(!target)return;
    if(target.dataset.close){$<HTMLDialogElement>('#'+target.dataset.close).close();return;}
    if(target.dataset.themeId){applyTheme(target.dataset.themeId,true);$<HTMLDialogElement>('#theme-dialog').close();return;}
    if(target.dataset.section){event.preventDefault();document.getElementById(target.dataset.section)?.scrollIntoView({block:'start'});return;}
    if(target.hasAttribute('data-overview')){reset();return;}
    if(target.dataset.scene){linkedNotice='';sceneOpen.add(target.dataset.scene);navigate({view:'scene',sceneFilter:target.dataset.scene,selectedCase:target.dataset.scene,goalId:'',query:'',status:'all'});return;}
    if(target.dataset.focus||target.dataset.sceneViolations){remember();state.sceneFilter=target.dataset.focus??target.dataset.sceneViolations??'';if(target.dataset.sceneViolations)state.status='violation';selectFirst();render();return;}
    if(target.dataset.relatedCase&&target.dataset.relatedGoal){openGoal(target.dataset.relatedCase,target.dataset.relatedGoal,true);return;}
    if(target.dataset.caseId&&target.dataset.goalId){openGoal(target.dataset.caseId,target.dataset.goalId);return;}
    if(target.dataset.stat){remember();state={...initial,view:'goal',status:target.dataset.stat as Status};selectFirst();render();return;}
    if(target.dataset.image){openImage(target.dataset.image,target.dataset.evidenceContext??'当前引用',target);return;}
    if(target.dataset.evidence)openEvidence(target.dataset.evidence,target.dataset.evidenceContext??'当前引用',target);
  });
  async function applyLocation(hashText:string):Promise<void>{
    applyingLocation=true;window.clearTimeout(searchTimer);
    try{
      // Close in stack order and await close events before reusing a dialog ID.
      // Otherwise a delayed old close could unlock or erase a newly opened modal.
      for(const id of [...modals.keys()].reverse()){
        const dialog=$<HTMLDialogElement>('#'+id);
        if(dialog.open)await new Promise<void>(resolve=>{dialog.addEventListener('close',()=>resolve(),{once:true});dialog.close();});
      }
      state={...initial};linkedNotice='';let evidenceId:string|undefined;
      try{
        const hash=new URLSearchParams(hashText.replace(/^#/,'')),caseId=hash.get('case'),goalId=hash.get('goal'),requestedEvidence=hash.get('evidence');
        if(caseId&&report.cases.some(c=>c.id===caseId)){
          state.selectedCase=caseId;
          if(goalId&&rows.some(r=>r.c.id===caseId&&r.g.id===goalId)){state.goalId=goalId;state.view='goal';}
          else{state.sceneFilter=caseId;state.view='scene';}
        }else if(hash.get('view')==='evidence')state.view='evidence';
        if(requestedEvidence&&evidenceMap.has(requestedEvidence))evidenceId=requestedEvidence;
      }catch{/* Invalid or incomplete references show the safe reading overview. */}
      render();
      if(evidenceId){const evidence=evidenceMap.get(evidenceId);if(evidence)openEvidence(evidence.id,referenceLabel(evidence),$('#library-button'));}
      else saveHash();
    }finally{applyingLocation=false;}
  }
  let locationQueue=Promise.resolve();
  function queueLocation():void{
    const hashText=location.hash;
    locationQueue=locationQueue.then(()=>applyLocation(hashText)).catch(error=>{applyingLocation=false;$('#detail').innerHTML=`<section class="panel error">无法打开报告链接：${esc(error instanceof Error?error.message:'未知错误')}</section>`;});
  }
  window.addEventListener('hashchange',queueLocation);
  queueLocation();
})();
