(()=>{'use strict';
type HtmlPayload = import('../contracts/model.mjs').HtmlPayload;
type CaseData = import('../contracts/model.mjs').CheckedCase;
type Observation = CaseData['observations'][number];
type Assessment = CaseData['assessments'][number];
type PreviewedEvidence = import('../contracts/model.mjs').EvidenceItem & Partial<import('../contracts/model.mjs').Preview>;
const statuses = ['verified','violation','inconclusive','not_tested'] as const;
const labels = {verified:'已验证',violation:'发现违反',inconclusive:'无法判断',not_tested:'未测试',unassessed:'未登记目标评估'};
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid report object.'); return value as Record<string, unknown>; }
function array(value: unknown): unknown[] { if (!Array.isArray(value)) throw new Error('Invalid report array.'); return value; }
function text(value: unknown): void { if (typeof value !== 'string') throw new Error('Invalid report text.'); }
function texts(value: unknown): void { for (const item of array(value)) text(item); }
function number(value: unknown): void { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid report count.'); }
function member(value: unknown, choices: readonly string[]): void { if (typeof value !== 'string' || !choices.includes(value)) throw new Error('Invalid report enumeration.'); }
function observation(value: unknown): void {const o=record(value);text(o.id);text(o.summary);texts(o.coveredRefs);texts(o.evidenceIds)}
function assessment(value: unknown): void {const a=record(value);text(a.goalId);member(a.status,statuses);text(a.rationale);texts(a.observationIds);texts(a.gaps);if(a.diagnosis!==undefined){const d=record(a.diagnosis);member(d.state,['unknown','hypothesis','confirmed']);member(d.category,['product','agent','environment','spec','unknown']);text(d.summary);texts(d.evidenceIds)}}
function assertPayload(value: unknown): asserts value is HtmlPayload {
  const payload=record(value),data=record(payload.report);
  if(payload.htmlPayloadVersion!==5||data.schemaVersion!==5||data.structurallyValid!==true)throw new Error('Unsupported report format; v5 is required.');
  for(const key of ['project','runId','caveat'])text(data[key]);for(const key of ['revision','evidenceRevision','caseCount','goalCount'])number(data[key]);
  if(typeof data.assessmentComplete!=='boolean')throw new Error('Invalid assessment completeness.');
  const counts=record(data.counts);for(const key of [...statuses,'unassessed'])number(counts[key]);
  number(record(data.evidenceIntegrity).hashVerifiedItems);
  const coverage=record(data.evidenceCoverage);number(coverage.registeredScreenshots);number(coverage.distinctRetainedContents);for(const item of array(coverage.goalsWithoutScreenshots)){const g=record(item);text(g.caseId);text(g.goalId)}
  for(const raw of array(data.cases)){
    const c=record(raw);text(c.id);text(c.title);texts(c.criticalConditions);texts(c.missingGoalIds);if(c.requiredPath!==null)text(c.requiredPath);member(c.stepOrder,['strict','adaptive']);
    for(const rawGoal of array(c.goals)){const g=record(rawGoal);text(g.id);text(g.expected);texts(g.requiredRefs);const b=record(g.basis);member(b.kind,['explicit','interpretation','hypothesis']);text(b.source);text(b.text);if(g.clarificationQuestions!==undefined)texts(g.clarificationQuestions)}
    for(const rawStep of array(c.steps)){const s=record(rawStep);text(s.id);text(s.action)}
    for(const o of array(c.observations))observation(o);
    for(const rawAssessment of array(c.assessments)){assessment(rawAssessment);const a=record(rawAssessment);text(a.operationId);text(a.recordedAt);number(a.revision)}
    for(const rawEntry of array(c.entries)){const e=record(rawEntry);text(e.operationId);text(e.recordedAt);number(e.revision);member(e.mode,['final','attempt']);const r=record(e.record);for(const o of array(r.observations))observation(o);for(const a of array(r.assessments))assessment(a)}
  }
  const catalog=record(data.evidenceCatalog);if(catalog.schemaVersion!==5)throw new Error('Unsupported evidence format.');number(catalog.revision);array(catalog.operations);
  for(const raw of array(catalog.items)){const i=record(raw);for(const key of ['id','path','caseId','source','description','sha256','operationId','collectedAt'])text(i[key]);number(i.bytes);member(i.kind,['screenshot','dom','tool_receipt','log','other']);if(i.capturedAt!==undefined)text(i.capturedAt)}
  for(const raw of Object.values(record(payload.previews))){const p=record(raw);text(p.previewNote);if(p.preview!==null&&(typeof p.preview!=='string'||!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]*$/.test(p.preview)))throw new Error('Invalid inline image preview.')}
  if(data.context!==undefined){const c=record(data.context);if(c.schemaVersion!==5||c.kind!=='retrospective')throw new Error('Unsupported report context.');text(c.summary);texts(c.limitations);texts(c.supplementalCaseIds);for(const raw of array(c.sources)){const s=record(raw);text(s.label);text(s.file);text(s.sha256)}}
}
const encoded=document.getElementById('report-data')?.textContent;if(!encoded)throw new Error('Missing report payload.');
const candidate:unknown=JSON.parse(encoded);assertPayload(candidate);const payload=candidate,data=payload.report;
const $=<T extends HTMLElement=HTMLElement>(selector:string):T=>{const n=document.querySelector(selector);if(!n)throw new Error('Missing report element: '+selector);return n as T};
function el<K extends keyof HTMLElementTagNameMap>(tag:K,cls='',text?:unknown):HTMLElementTagNameMap[K]{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n}
function panel(title:string,text:unknown){const n=el('section','panel');n.append(el('h3','',title),el('p','',text||'（未提供）'));return n}
const itemMap=new Map(data.evidenceCatalog.items.map(x=>[x.id,{...x,...payload.previews[x.id]}] as const));
$('#project-line').textContent=data.project+' · Run '+data.runId;
$('#integrity').textContent='文件完整性：'+data.evidenceIntegrity.hashVerifiedItems+' 项证据 hash / 字节数匹配；不证明来源真实性或业务结论。结果 revision '+data.revision+'。';
for(const [label,value] of [['用例／场景',data.caseCount],['业务目标',data.goalCount],...Object.entries(data.counts).map(([k,n])=>[labels[k as keyof typeof labels],n]),['历史尝试',data.cases.reduce((n,c)=>n+c.entries.filter(e=>e.mode==='attempt').length,0)]] as [string,number][]){const n=el('div','metric');n.append(el('b','',value),el('span','',label));$('#summary').append(n)}
const coverage=data.evidenceCoverage,previewCount=[...itemMap.values()].filter(i=>i.kind==='screenshot'&&i.preview).length;
$('#evidence-coverage').textContent='截图证据：已登记 '+coverage.registeredScreenshots+' 项，可预览 '+previewCount+' 项；全部证据去重后内容 '+coverage.distinctRetainedContents+' 份。'+coverage.goalsWithoutScreenshots.length+' 项评估未关联截图。关键 UI 结论需要真实页面截图；截图缺口需复核，不自动改变业务状态。记录完整：'+data.assessmentComplete+'；记录完整不等于验收完成。';
if(data.context){const c=data.context,n=$('#report-context');n.hidden=false;n.append(el('h2','','事后整理来源（未重新执行）'),el('p','',c.summary));for(const x of c.limitations)n.append(el('p','',x));n.append(el('p','','补充范围用例：'+(c.supplementalCaseIds.join(', ')||'无')),el('p','meta','整理说明不另行提供业务结论，也不改变冻结基线或已有评估的来源。'));for(const s of c.sources)n.append(el('p','meta',s.label+' · '+s.file+' · SHA-256 '+s.sha256))}
if(data.execution&&data.executionSummary){const e=data.execution,s=data.executionSummary,n=$('#execution-summary');n.hidden=false;n.append(el('h2','','并发与交付记录'),el('p','','并发上限 '+s.configuredMaxParallelCases+'；名额峰值 '+s.peakReservations+'；报告执行峰值 '+(s.reportedExecutionPeak??'未知')+'。'),el('p','meta','名额不等于浏览器实测重叠；该台账不作为另一条业务结果来源。'),el('p','','未完成分派 '+s.unfinishedAssignmentIds.length+'；待导入 '+s.pendingImportIds.length+'。'));for(const a of e.assignments)n.append(el('p','meta',a.caseId+' / '+a.id+' / '+a.state+' / worker '+(a.workerId??'未绑定')+' / 默认 Space '+(a.defaultSpaceId??'未知')));for(const event of e.events.filter(e=>e.kind.startsWith('note:')))n.append(el('p','meta',event.kind+'：'+event.reason))}
const imageDecodeFailure='图片文件头符合 PNG/JPEG/WebP，但浏览器无法解码；未显示该图。hash 匹配仅代表字节一致，不证明内容真实性。';
function watchImageDecode(img: HTMLImageElement){img.addEventListener('error',()=>img.replaceWith(el('p','image-error',imageDecodeFailure)))}
function evidenceMetadata(item: PreviewedEvidence){const details=el('details','evidence-meta');details.append(el('summary','','来源与文件完整性'),el('p','','来源：'+item.source),el('p','meta','SHA-256（字节一致性）：'+item.sha256),el('p','meta','留存字节：'+item.bytes),el('p','meta','登记时间：'+item.collectedAt),el('p','meta','来源采集时间：'+(item.capturedAt||'未提供')));return details}
function addEvidence(parent: HTMLElement, ids: string[]): PreviewedEvidence[]{const known=ids.map(id=>itemMap.get(id)).filter((item): item is PreviewedEvidence => item !== undefined);const shots=known.filter(x=>x.kind==='screenshot'&&x.preview);if(!known.length){parent.append(el('div','empty','没有证据关联到这条记录。'));return shots}if(!shots.length){parent.append(el('div','empty','已关联 '+known.length+' 项证据，但没有可预览的截图。'));}const grid=el('div','evidence-grid');for(const item of known){const box=el('article','evidence');if(item.preview){const img=el('img','thumb');img.alt=item.description||'登记的截图';img.tabIndex=0;img.dataset.caption=item.description||item.id;img.addEventListener('click',()=>openImage(img));img.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openImage(img)}});watchImageDecode(img);box.append(img);img.src=item.preview ?? ''}box.append(el('p','',item.description||item.id),el('p','meta','ID '+item.id+' · '+item.kind+' · '+item.bytes+' bytes'),el('p','meta','登记 '+item.collectedAt+(item.capturedAt?' · 来源时间 '+item.capturedAt:'')),evidenceMetadata(item),...(item.previewNote?[el('p','meta',item.previewNote)]:[]));grid.append(box)}parent.append(grid);return shots}
function openImage(img: HTMLImageElement){$('#lightbox-error').hidden=true;$<HTMLImageElement>('#lightbox-image').hidden=false;$<HTMLImageElement>('#lightbox-image').src=img.src;$('#lightbox-caption').textContent=img.dataset.caption||img.alt;$<HTMLDialogElement>('#lightbox').showModal()}$<HTMLImageElement>('#lightbox-image').addEventListener('error',()=>{$<HTMLImageElement>('#lightbox-image').hidden=true;const note=$('#lightbox-error');note.textContent=imageDecodeFailure;note.hidden=false});$('#lightbox-close').addEventListener('click',()=>$<HTMLDialogElement>('#lightbox').close());$<HTMLDialogElement>('#lightbox').addEventListener('cancel',()=>$<HTMLDialogElement>('#lightbox').close());$<HTMLDialogElement>('#lightbox').addEventListener('click',e=>{if(e.target===$<HTMLDialogElement>('#lightbox'))$<HTMLDialogElement>('#lightbox').close()});

function observationsFor(c:CaseData,ids:string[]){return c.observations.filter(o=>ids.includes(o.id))}
function renderObservation(o:Observation){const n=panel('观察 '+o.id,o.summary);n.append(el('p','meta','必要语义覆盖：'+(o.coveredRefs.join(', ')||'未声明')));addEvidence(n,o.evidenceIds);return n}
function renderCase(c:CaseData){
  const card=el('details','case-card');card.id='case-'+c.id;
  const byGoal=c.goals.map(g=>({g,a:c.assessments.find(a=>a.goalId===g.id)}));
  const counts:{[key:string]:number}={};for(const {a} of byGoal){const status=a?.status??'unassessed';counts[status]=(counts[status]??0)+1}
  card.dataset.statuses=Object.keys(counts).join(' ');
  card.dataset.search=JSON.stringify(c).toLocaleLowerCase()+' '+data.evidenceCatalog.items.filter(i=>i.caseId===c.id).map(i=>i.description).join(' ').toLocaleLowerCase();
  const summary=el('summary');summary.append(el('span','case-id',c.id),el('span','case-title',c.title));
  for(const [status,count] of Object.entries(counts))summary.append(el('span','badge status-'+status,labels[status as keyof typeof labels]+' '+count));
  if(data.context?.supplementalCaseIds.includes(c.id))summary.append(el('span','meta','补充范围'));
  card.append(summary);const body=el('div','case-body');
  for(const {g,a} of byGoal){
    const block=el('section','panel section');block.id='goal-'+c.id+'-'+g.id;block.dataset.goalStatus=a?.status??'unassessed';
    block.append(el('h3','',g.id+' · '+labels[a?.status??'unassessed']),panel('业务预期',g.expected),panel('需求依据 · '+g.basis.kind,g.basis.source+' · '+g.basis.text),el('p','meta','必要语义引用：'+(g.requiredRefs.join(', ')||'无')));
    if(g.followUpOf){const f=g.followUpOf;block.append(panel('本目标复核的来源',f.runId+' / '+f.caseId+' / '+f.goalId+'：'+f.reason));if(f.runId===data.runId&&data.cases.some(c=>c.id===f.caseId&&c.goals.some(g=>g.id===f.goalId))){const link=el('a','','查看原目标');link.href='#goal-'+f.caseId+'-'+f.goalId;block.append(link)}}
    for(const laterCase of data.cases)for(const later of laterCase.goals){const f=later.followUpOf;if(f?.runId===data.runId&&f.caseId===c.id&&f.goalId===g.id){const latest=laterCase.assessments.find(a=>a.goalId===later.id),link=el('a','','后续复核 '+laterCase.id+'/'+later.id+' · '+labels[latest?.status??'unassessed']);link.href='#goal-'+laterCase.id+'-'+later.id;block.append(link,el('p','meta',f.reason+'；原评估保留，不自动替换。'))}}
    if(g.clarificationQuestions?.length)block.append(panel('冻结待澄清',g.clarificationQuestions.join('\n')));
    if(!a)block.append(el('p','empty','未登记目标评估：这是记录完整性缺口，不能据此推断未测试、无法判断或其他业务结论。'));
    else{
      block.append(panel('判断理由',a.rationale),panel('剩余事实缺口',a.gaps.join('\n')||'未列出剩余缺口'),el('p','meta','评估来源 '+a.operationId+' · revision '+a.revision+' · '+a.recordedAt));
      if(a.diagnosis){block.append(panel('归因 · '+a.diagnosis.state+' / '+a.diagnosis.category,a.diagnosis.summary),el('p','meta','归因状态与业务结果独立；根因未知不会自动改成无法判断。'));if(a.diagnosis.evidenceIds.length)addEvidence(block,a.diagnosis.evidenceIds)}
      const observations=observationsFor(c,a.observationIds);for(const o of observations)block.append(renderObservation(o));
      if(!observations.length)block.append(el('p','meta','此评估没有引用执行观察；请结合状态及判断理由阅读。'));
    }
    body.append(block);
  }
  const constraints=el('details','section');constraints.append(el('summary','','冻结前提、必要步骤与路径（不计入业务目标数）'));
  constraints.append(panel('关键前提',c.criticalConditions.map((text,i)=>'condition:'+i+' · '+text).join('\n')||'未列出显式前提'),panel('必经路径',c.requiredPath??'未指定'),panel('步骤顺序',c.stepOrder),el('p','meta','计划不是执行证明；事后整理说明不改变该计划的来源。'));
  const steps=el('ol','steps');for(const s of c.steps){const n=el('li','',s.id+' · '+s.action);steps.append(n)}constraints.append(steps);body.append(constraints);
  const history=el('details','section');history.append(el('summary','','原始观察与评估历史 · '+c.entries.length+' 条'),el('p','meta','attempt 仅作历史，不替换当前评估；final 只更新本次明确提及的目标。首次异常与后续修订均保留。'));
  for(const e of c.entries){const n=el('section','history-item');n.append(el('h3','',e.mode+' / '+e.operationId+' / revision '+e.revision),el('p','meta',e.recordedAt));for(const o of e.record.observations)n.append(renderObservation(o));for(const a of e.record.assessments){n.append(panel(a.goalId+' · '+labels[a.status],a.rationale),el('p','meta','观察引用：'+(a.observationIds.join(', ')||'无')),panel('当时剩余缺口',a.gaps.join('\n')||'未列出'));if(a.diagnosis){n.append(panel('当时归因 · '+a.diagnosis.state+' / '+a.diagnosis.category,a.diagnosis.summary));if(a.diagnosis.evidenceIds.length)addEvidence(n,a.diagnosis.evidenceIds)}}history.append(n)}body.append(history);
  const allReferenced=new Set([...c.observations.flatMap(o=>o.evidenceIds),...c.entries.flatMap(e=>e.record.assessments.flatMap(a=>a.diagnosis?.evidenceIds??[]))]);
  const unlinked=data.evidenceCatalog.items.filter(i=>i.caseId===c.id&&!allReferenced.has(i.id));if(unlinked.length){const n=el('details','section');n.append(el('summary','','已登记但未被观察或诊断引用的证据'),el('p','meta','这些文件不自动作为结论依据。'));addEvidence(n,unlinked.map(i=>i.id));body.append(n)}
  card.append(body);return card;
}
const list=$('#case-list');for(const c of data.cases)list.append(renderCase(c));
function filter(){const q=$<HTMLInputElement>('#search').value.trim().toLocaleLowerCase(),status=$<HTMLSelectElement>('#status-filter').value;let shown=0;for(const child of list.children){const card=child as HTMLDetailsElement;const visible=(status==='all'||(card.dataset.statuses??'').split(' ').includes(status))&&(!q||(card.dataset.search??'').includes(q));card.hidden=!visible;if(visible)shown++}$('#shown').textContent='显示 '+shown+' / '+data.caseCount+' 个场景；筛选按子目标状态匹配';$('#empty-results').hidden=shown!==0}
$<HTMLInputElement>('#search').addEventListener('input',filter);$<HTMLSelectElement>('#status-filter').addEventListener('change',filter);filter();
})();
