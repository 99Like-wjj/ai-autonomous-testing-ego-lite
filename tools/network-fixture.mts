/** Loopback-only protocol/UI fixture with an independent server oracle. Never shipped. */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Socket } from 'node:net';

export const streamText = 'event: update\r\nid: one\r\ndata: 你好，合成流\r\ndata: 第二行\r\n\r\n: comment\n\ndata: final 🙂\n\n';
export const wsBinary = Buffer.from([0, 255, 3, 128, 17]);
function frame(data: Buffer | string, opcode = 1, fin = true) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data), head = Buffer.alloc(bytes.length < 126 ? 2 : 4);
  head[0] = (fin ? 128 : 0) | opcode;
  if (bytes.length < 126) head[1] = bytes.length; else { head[1] = 126; head.writeUInt16BE(bytes.length, 2); }
  return Buffer.concat([head, bytes]);
}
export async function networkFixture(root: string) {
  if (!path.isAbsolute(root) || root === path.parse(root).root || !path.relative(process.cwd(), root).startsWith('..') && !path.isAbsolute(path.relative(process.cwd(), root))) throw Error('Use a new absolute fixture directory outside source.');
  await fs.mkdir(root); const proofId = crypto.randomUUID();
  let saveCount = 0, pollCount = 0, otherURL = '';
  const sockets = new Set<Socket>(), streams = new Set<http.ServerResponse>(), held = new Set<http.ServerResponse>();
  let logChain = Promise.resolve();
  const log = (event: Record<string, unknown>) => { logChain = logChain.then(() => fs.appendFile(path.join(root, 'oracle.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n')); return logChain; };
  const handler = (originLabel: string) => async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    if (url.pathname === '/' || url.pathname === '/next' || url.pathname === '/second') {
      res.setHeader('Content-Type', 'text/html;charset=utf-8');
      if (url.pathname === '/second') { res.end('<!doctype html><meta charset="utf-8"><title>合成第二页</title><h1>活动页控制</h1><button id="count">计数</button><p id="value">0</p><script>let n=0;document.getElementById("count").onclick=()=>document.getElementById("value").textContent=++n;</script>'); return; }
      res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>接口观测产品验收</title><style>body{font:18px system-ui;margin:24px;background:#eff5fa;color:#17324b}button,a{font:16px system-ui;margin:5px;padding:9px}section{background:white;border-radius:12px;padding:14px;margin:12px 0;max-width:1100px}pre{white-space:pre-wrap;font:14px ui-monospace}</style><h1>接口观测 · 本地合成验收</h1><p>仅合成数据；proof ${proofId}</p><section><button id="save">保存</button><button id="xhr">XHR 提交</button><button id="errors">业务与 HTTP 错误</button><button id="async">异步与重定向</button><button id="cancel">取消与超时</button><button id="origins">多来源与范围排除</button><button id="binary">HTTP 二进制</button><pre id="result">ready</pre></section><section><button id="events">EventSource</button><button id="fetch-stream">POST Fetch SSE</button><button id="xhr-stream">POST XHR SSE</button><button id="sockets">WebSocket 双向</button><button id="broken">异常 WebSocket</button><button id="close">结束流</button><pre id="streams"></pre></section><section><button id="counter">UI 计数</button><span id="count">0</span><a id="nav" href="/next">同页导航</a><a id="newpage" href="/second" target="_blank">派生页</a></section><script>
const $=id=>document.getElementById(id),log=x=>$('streams').textContent+=x+'\\n';let n=0,es,ws;const other=${JSON.stringify(otherURL)};
const delayed=document.createElement('button');delayed.id='held';delayed.textContent='延迟读回';$('counter').parentNode.appendChild(delayed);delayed.onclick=()=>fetch('/api/held').then(r=>r.text()).then(x=>log('held:'+x));
$('counter').onclick=()=>$('count').textContent=++n;
$('save').onclick=async()=>{const r=await fetch('/api/save?view=safe&token=synthetic-query-private',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'合成保存',password:'synthetic-body-private',nested:{apiKey:'synthetic-key-private'}})});$('result').textContent=JSON.stringify(await r.json());};
$('xhr').onclick=()=>{const x=new XMLHttpRequest();x.open('POST','/api/xhr');x.setRequestHeader('Content-Type','application/json');x.onload=()=>$('result').textContent=x.responseText;x.send(JSON.stringify({name:'XHR-合成',token:'synthetic-xhr-private'}));};
$('errors').onclick=async()=>{const a=await fetch('/api/biz-error'),b=await fetch('/api/http-error');$('result').textContent=await a.text()+' | '+b.status+' '+await b.text();};
$('async').onclick=async()=>{const a=await fetch('/api/accepted');const p1=await(await fetch('/api/poll')).json(),p2=await(await fetch('/api/poll')).json();await fetch('/api/redirect');await fetch('/api/redirect-out');await Promise.all([fetch('/api/repeat'),fetch('/api/repeat')]);$('result').textContent=a.status+' '+JSON.stringify([p1,p2]);};
$('cancel').onclick=async()=>{const c=new AbortController();fetch('/api/slow?kind=abort',{signal:c.signal}).catch(()=>{});setTimeout(()=>c.abort(),100);const x=new XMLHttpRequest();x.open('GET','/api/slow?kind=timeout');x.timeout=120;x.ontimeout=()=>$('result').textContent='取消与超时完成';x.send();};
$('origins').onclick=async()=>{await fetch(other+'/api/cross');await fetch('/excluded/outside');$('result').textContent='多来源完成';};
$('binary').onclick=async()=>{await fetch('/api/binary');const f=new FormData();f.append('file',new Blob(['synthetic upload']), 'synthetic.txt');await fetch('/api/upload',{method:'POST',body:f});$('result').textContent='二进制完成';};
$('events').onclick=()=>{es=new EventSource('/events');es.addEventListener('update',e=>log('eventsource:'+e.data));es.onmessage=e=>log('eventsource:'+e.data);};
$('fetch-stream').onclick=async()=>{const r=await fetch('/stream/fetch',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"source":"fetch"}'}),reader=r.body.getReader(),decoder=new TextDecoder();while(true){const p=await reader.read();if(p.done)break;log('fetch:'+decoder.decode(p.value,{stream:true}));}};
$('xhr-stream').onclick=()=>{const x=new XMLHttpRequest();x.open('POST','/stream/xhr');x.setRequestHeader('Content-Type','application/json');x.onprogress=()=>log('xhr:'+x.responseText);x.send('{"source":"xhr"}');};
$('sockets').onclick=()=>{ws=new WebSocket(location.origin.replace('http','ws')+'/socket');ws.binaryType='arraybuffer';ws.onopen=()=>{ws.send('client 你好');ws.send(new Uint8Array([2,4,6]));};ws.onmessage=e=>log('ws:'+(typeof e.data==='string'?e.data:Array.from(new Uint8Array(e.data)).join(',')));ws.onclose=e=>log('ws-close:'+e.code+':'+e.wasClean);};
$('broken').onclick=()=>{const x=new WebSocket(location.origin.replace('http','ws')+'/socket/broken');x.onclose=e=>log('broken-close:'+e.code);};
$('close').onclick=()=>{es?.close();ws?.close(1000,'done');fetch('/fixture/release').then(()=>log('released'));};
</script></html>`); return;
    }
    let body = ''; if (req.method === 'POST') for await (const chunk of req) body += String(chunk);
    await log({ kind: 'http', originLabel, path: url.pathname, query: url.search, method: req.method, body });
    if (url.pathname === '/fixture/release') { for (const stream of streams) stream.end(); streams.clear(); res.end('released'); return; }
    if (url.pathname === '/api/held') { held.add(res); res.on('close',()=>held.delete(res)); return; }
    if (url.pathname === '/fixture/release-held') { for (const pending of held) { pending.setHeader('Content-Type','application/json'); pending.end('{"saved":true,"text":"后台读取合成结果"}'); } held.clear(); res.end('released held'); return; }
    if (url.pathname === '/fixture/state') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ saveCount, pollCount })); return; }
    if (url.pathname === '/fixture/shutdown' && body === proofId) { res.end('closing'); setTimeout(() => { for (const socket of sockets) socket.destroy(); for (const stream of streams) stream.end(); for (const pending of held) pending.end(); primary.close(); secondary.close(); }, 30); return; }
    if (url.pathname === '/events' || url.pathname.startsWith('/stream/')) {
      res.setHeader('Content-Type', 'text/event-stream'); res.flushHeaders(); streams.add(res); res.on('close', () => streams.delete(res));
      const data = Buffer.from(streamText), split = data.indexOf(Buffer.from('合')) + 1, chunks = [data.subarray(0, split), data.subarray(split, split + 1), data.subarray(split + 1, data.length - 5), data.subarray(data.length - 5)];
      chunks.forEach((chunk, index) => setTimeout(() => { if (!res.destroyed) { res.write(chunk); void log({ kind: 'sse-chunk', path: url.pathname, index, base64: chunk.toString('base64') }); } }, index * 170)); return;
    }
    if (url.pathname === '/api/slow') { setTimeout(() => res.end('late'), 1500); return; }
    if (url.pathname === '/api/redirect' || url.pathname === '/api/redirect-out') { res.writeHead(302, { Location: url.pathname.endsWith('-out') ? '/excluded/redirected' : '/api/final' }).end(); return; }
    if (url.pathname === '/api/binary') { res.setHeader('Content-Type', 'application/octet-stream'); res.end(Buffer.from([0, 1, 255])); return; }
    if (url.pathname === '/api/body-limit') { res.setHeader('Content-Type', 'text/plain'); res.end('x'.repeat(1024 * 1024)); return; }
    if (url.pathname === '/api/http-error') { res.writeHead(500, { 'Content-Type': 'text/plain' }).end('synthetic failure token=synthetic-error-private'); return; }
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/api/save') { saveCount++; res.setHeader('Set-Cookie', 'synthetic=private-cookie'); res.end(JSON.stringify({ ok: true, saveCount, received: JSON.parse(body), accessToken: 'synthetic-response-private' })); return; }
    if (url.pathname === '/api/xhr') { res.end(JSON.stringify({ ok: true, received: JSON.parse(body) })); return; }
    if (url.pathname === '/api/biz-error') { res.end(JSON.stringify({ ok: false, error: 'synthetic business denial' })); return; }
    if (url.pathname === '/api/accepted') { res.statusCode = 202; res.end('{"state":"pending"}'); return; }
    if (url.pathname === '/api/poll') { pollCount++; res.end(JSON.stringify({ state: pollCount >= 2 ? 'done' : 'pending', pollCount })); return; }
    if (url.pathname.startsWith('/excluded/')) { res.end('{"outside":"UNSCOPED_BODY_MUST_NOT_RETAIN"}'); return; }
    res.end(JSON.stringify({ ok: true, path: url.pathname, originLabel }));
  };
  const primary = http.createServer(handler('primary')), secondary = http.createServer(handler('secondary'));
  for (const server of [primary, secondary]) {
    server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
    server.on('upgrade', async (req, socket) => {
      const key = req.headers['sec-websocket-key']; if (typeof key !== 'string') { socket.destroy(); return; }
      const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
      socket.write(frame('server text 你好')); socket.write(frame('fragmented ', 1, false)); socket.write(frame('消息', 0, true)); socket.write(frame(wsBinary, 2));
      await log({ kind: 'ws-sent', path: req.url, text: ['server text 你好', 'fragmented 消息'], binary: wsBinary.toString('base64') });
      if (req.url === '/socket/broken') { setTimeout(() => socket.destroy(), 120); return; }
      let pending = Buffer.alloc(0), closing = false;
      socket.on('data', chunk => {
        pending = Buffer.concat([pending, chunk]);
        while (pending.length >= 2) {
          const opcode = pending[0]! & 15, masked = Boolean(pending[1]! & 128); let size = pending[1]! & 127, offset = 2;
          if (size === 126) { if (pending.length < 4) return; size = pending.readUInt16BE(2); offset = 4; }
          if (size === 127) { socket.destroy(); return; }
          const maskSize = masked ? 4 : 0; if (pending.length < offset + maskSize + size) return;
          const mask = pending.subarray(offset, offset + maskSize), data = Buffer.from(pending.subarray(offset + maskSize, offset + maskSize + size));
          if (masked) for (let i = 0; i < data.length; i++) data[i] = data[i]! ^ mask[i % 4]!;
          pending = pending.subarray(offset + maskSize + size);
          void log({ kind: 'ws-received', opcode, base64: data.toString('base64') });
          if (opcode === 8 && !closing) { closing = true; socket.end(frame(data, 8)); } else if (opcode === 9) socket.write(frame(data, 10));
        }
      });
    });
  }
  const listen = (server: http.Server) => new Promise<number>(resolve => server.listen(0, '127.0.0.1', () => { const addr = server.address(); if (!addr || typeof addr === 'string') throw Error('No fixture port'); resolve(addr.port); }));
  otherURL = 'http://127.0.0.1:' + await listen(secondary); const baseURL = 'http://127.0.0.1:' + await listen(primary);
  const metadata = { proofId, baseURL, otherURL, pid: process.pid, streamText, wsBinaryBase64: wsBinary.toString('base64') };
  await fs.writeFile(path.join(root, 'server.json'), JSON.stringify(metadata, null, 2)); return metadata;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href && process.argv[2]) console.log(JSON.stringify(await networkFixture(process.argv[2])));
