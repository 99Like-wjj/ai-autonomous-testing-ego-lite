/** Loopback-only synthetic observation fixture. No UAT requests or user data. Not shipped. */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const output=process.argv[2];
if(!output || !path.isAbsolute(output))throw Error('Use a new absolute output directory outside the repository.');
const root=path.resolve(output),repo=process.cwd(),relative=path.relative(repo,root);
if(root===path.parse(root).root || !(path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path.sep)))throw Error('Fixture output must be external.');
await fs.mkdir(root);
const proofId=crypto.randomUUID();let title='Synthetic original',day=1;
const log=(event:Record<string,unknown>)=>fs.appendFile(path.join(root,'server-events.jsonl'),JSON.stringify({at:new Date().toISOString(),...event})+'\n');
const content='# Synthetic download\nProof: '+proofId+'\n';
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Ego 取证合成页</title><style>body{font:18px system-ui;margin:28px;color:#14314b;background:#edf3f8}section{background:white;padding:18px;margin:12px 0;max-width:920px;border-radius:12px}button,input{font:18px system-ui;padding:9px;margin:6px}#track{height:85px;position:relative;background:#dbe7f2;width:600px}#bar{position:absolute;left:30px;top:20px;background:#087b8f;color:white;padding:10px;cursor:grab;touch-action:none;width:110px}pre{white-space:pre-wrap}a{padding:12px;display:inline-block}</style><h1>Ego 本地合成取证</h1><p>所有内容仅为合成数据</p><code id="proof">${proofId}</code><section><h2>重命名</h2><form id="rename-form"><label>合成标题<input id="title" value="Synthetic original"></label><button id="save">保存标题</button></form><p id="saved-title"></p></section><section><h2>拖动改期</h2><div id="track"><div id="bar">拖动合成事项</div></div><p id="date"></p><pre id="pointer-log"></pre></section><section><h2>上下文与错误</h2><button id="context">发送合成上下文</button><button id="reject">触发合成拒绝</button><pre id="context-result"></pre><pre id="reject-result"></pre></section><section><h2>下载</h2><a id="download" href="/download">当前页下载</a><a id="popup" href="/child" target="_blank">打开派生下载页</a><a id="transient-download" href="/download?via=transient" target="_blank">临时派生页直接下载</a></section><script>
const proofId=${JSON.stringify(proofId)};const $=id=>document.getElementById(id);
async function state(){const s=await(await fetch('/api/state')).json();$('saved-title').textContent=s.title;$('date').textContent='计划第 '+s.day+' 天';$('bar').style.left=(30+(s.day-1)*40)+'px';}state();
$('rename-form').onsubmit=async e=>{e.preventDefault();const r=await fetch('/api/rename',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({proofId,title:$('title').value})});if(r.ok)await state();};
let beginX=0,beginLeft=0,held=false;const events=[];const emit=(kind,e)=>{events.push({kind,x:e.clientX,isTrusted:e.isTrusted});$('pointer-log').textContent=JSON.stringify(events);};
$('bar').onpointerdown=e=>{held=true;beginX=e.clientX;beginLeft=parseFloat($('bar').style.left);$('bar').setPointerCapture(e.pointerId);emit('down',e);};
$('bar').onpointermove=e=>{if(held)$('bar').style.left=Math.max(0,Math.min(460,beginLeft+e.clientX-beginX))+'px';};
$('bar').onpointerup=async e=>{if(!held)return;held=false;emit('up',e);const next=1+Math.round((parseFloat($('bar').style.left)-30)/40);await fetch('/api/drag',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({proofId,day:next})});await state();};
$('context').onclick=async()=>{const r=await fetch('/api/context',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({proofId,projectId:'synthetic-project',page:'progress',filter:{milestones:false},selectedItem:'synthetic-item'})});$('context-result').textContent=JSON.stringify(await r.json());};
$('reject').onclick=async()=>{const r=await fetch('/api/reject',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({proofId})});$('reject-result').textContent=r.status+' '+await r.text();console.error('Synthetic rejected request');};
</script></html>`;
const server=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url??'/','http://127.0.0.1');res.setHeader('Cache-Control','no-store');
 if(req.method==='GET'&&u.pathname==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}
 if(req.method==='GET'&&u.pathname==='/child'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><title>合成派生页</title><h1>派生页下载</h1><a id="child-download" href="/download?via=child">下载合成文件</a>');return;}
 if(req.method==='GET'&&u.pathname==='/download'){await log({kind:'download',via:u.searchParams.get('via')??'parent'});res.setHeader('Content-Type','text/markdown;charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="synthetic.md"');res.end(content);return;}
 if(req.method==='GET'&&u.pathname==='/api/state'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({title,day,proofId}));return;}
 if(req.method==='POST'){
  let raw='';for await(const chunk of req){raw+=String(chunk);if(Buffer.byteLength(raw)>4096){res.writeHead(413).end('bounded fixture');return;}}
  const body:Record<string,unknown>=JSON.parse(raw);if(body.proofId!==proofId){res.writeHead(403).end('wrong synthetic proof');return;}
  if(u.pathname==='/shutdown'){await log({kind:'shutdown'});res.end('stopped');server.close();return;}
  await log({kind:'request',path:u.pathname,body});res.setHeader('Content-Type','application/json');
  if(u.pathname==='/api/rename'&&typeof body.title==='string'){title=body.title;res.end(JSON.stringify({saved:true}));return;}
  if(u.pathname==='/api/drag'&&Number.isInteger(body.day)){day=Number(body.day);res.end(JSON.stringify({saved:true}));return;}
  if(u.pathname==='/api/context'){res.end(JSON.stringify({received:body}));return;}
  if(u.pathname==='/api/reject'){res.writeHead(409).end(JSON.stringify({error:'synthetic conflict'}));return;}
 }
 res.writeHead(404).end('not found');
}catch(error){res.writeHead(400).end('invalid synthetic request');}});
server.listen(0,'127.0.0.1',async()=>{const a=server.address();if(!a||typeof a==='string')throw Error('No local port');const identity={proofId,baseURL:'http://127.0.0.1:'+a.port,pid:process.pid};await fs.writeFile(path.join(root,'server.json'),JSON.stringify(identity,null,2));await fs.writeFile(path.join(root,'expected-download.md'),content);console.log(JSON.stringify(identity));});
