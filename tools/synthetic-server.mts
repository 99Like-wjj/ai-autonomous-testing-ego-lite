/** Development-only loopback fixture for real browser/worker concurrency evidence. Never shipped. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { safePath } from '../src/core/common.mjs';
import { cliParallelLimit } from '../src/execution/config.mjs';
const [outputDir, concurrency = '3'] = process.argv.slice(2);
if (!outputDir || !path.isAbsolute(outputDir)) throw new Error('Use ABS_NEW_EXTERNAL_FIXTURE_DIRECTORY [PARTICIPANTS].');
const root = await safePath(outputDir, { external: true }), participants = cliParallelLimit(concurrency);
await fs.mkdir(root); const proofId = crypto.randomUUID(), ids = Array.from({ length: participants }, (_, i) => 'CASE-' + (i + 1));
const log = async (event: Record<string, unknown>) => fs.appendFile(path.join(root, 'server-events.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n');
type Peer = { response: http.ServerResponse; arrivedAt: string; timer: ReturnType<typeof setTimeout> };
const phases = new Map<string, Map<string, Peer>>();
function fixture(caseId: string): string {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>并发合成用例 ${caseId}</title><style>body{font:22px system-ui;background:#ecf4fa;padding:35px;color:#12314c}main{padding:30px;background:white;border:3px solid #087e91;max-width:920px;border-radius:16px}button,input{font:22px system-ui;padding:12px;margin:12px}output{display:block;background:#edf7ee;padding:18px}</style><main><h1>合成测试 ${caseId}</h1><p id="proof">运行标记 ${proofId}</p><p id="case">用例 ${caseId}</p><label>本用例的值<input id="value"></label><button id="commit">保存合成值</button><output id="result">尚未保存</output><button id="join" disabled>加入三方同步</button><output id="barrier">尚未加入同步</output></main><script>
const caseId=${JSON.stringify(caseId)},proofId=${JSON.stringify(proofId)};
document.querySelector('#commit').onclick=()=>{const value=document.querySelector('#value').value;document.querySelector('#result').textContent=caseId+':'+value;document.querySelector('#join').disabled=false;};
document.querySelector('#join').onclick=async()=>{document.querySelector('#join').disabled=true;document.querySelector('#barrier').textContent='等待其他用例';const phase=new URL(location.href).searchParams.get('phase')||'native';try{const response=await fetch('/barrier/'+phase+'/'+caseId,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({proofId,value:document.querySelector('#value').value})});const data=await response.json();if(!response.ok)throw new Error(JSON.stringify(data));document.querySelector('#barrier').textContent='已完成同步：'+data.caseIds.join(', ');document.body.dataset.barrier='released';}catch(error){document.querySelector('#barrier').textContent='同步失败：'+error.message;}};
</script></html>`;
}
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/health') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ proofId, participants, caseIds: ids })); return; }
  if (url.pathname === '/shutdown' && request.method === 'POST') {
    if (request.headers['x-proof-id'] !== proofId) { response.writeHead(403); response.end('wrong proof'); return; }
    await log({ event: 'shutdown' }); response.end('stopped'); server.close(); return;
  }
  const page = url.pathname.match(/^\/case\/(CASE-\d+)$/);
  if (page?.[1] && ids.includes(page[1])) { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.setHeader('Cache-Control', 'no-store'); response.end(fixture(page[1])); return; }
  const join = url.pathname.match(/^\/barrier\/([a-z0-9-]+)\/(CASE-\d+)$/);
  if (request.method === 'POST' && join?.[1] && join[2] && ids.includes(join[2])) {
    const phase = join[1], caseId = join[2]; let text = '';
    for await (const chunk of request) { text += String(chunk); if (text.length > 8192) { response.writeHead(413); response.end('body too large'); return; } }
    const input: unknown = JSON.parse(text);
    if (!input || typeof input !== 'object' || !('proofId' in input) || input.proofId !== proofId || !('value' in input) || typeof input.value !== 'string') { response.writeHead(400); response.end('wrong proof'); return; }
    const peers = phases.get(phase) ?? new Map<string, Peer>(); phases.set(phase, peers);
    if (peers.has(caseId)) { response.writeHead(409); response.end(JSON.stringify({ error: 'duplicate case; observe before retry' })); return; }
    const arrivedAt = new Date().toISOString();
    const timer = setTimeout(() => { void log({ event: 'barrier-timeout', caseId, phase }); if (!response.writableEnded && !response.destroyed) { response.writeHead(504); response.end(JSON.stringify({ error: 'peers did not arrive' })); } }, 180000);
    peers.set(caseId, { response, arrivedAt, timer });
    await log({ event: 'barrier-arrival', caseId, phase, arrivedAt, value: input.value, userAgent: request.headers['user-agent'] ?? '' });
    if (peers.size === participants && [...peers.values()].every(peer => !peer.response.destroyed && !peer.response.writableEnded)) {
      const releasedAt = new Date().toISOString(); await log({ event: 'barrier-release', phase, releasedAt, caseIds: [...peers.keys()], arrivals: [...peers].map(([id, peer]) => ({ caseId: id, arrivedAt: peer.arrivedAt })) });
      for (const peer of peers.values()) { clearTimeout(peer.timer); peer.response.setHeader('Content-Type', 'application/json'); peer.response.end(JSON.stringify({ proofId, releasedAt, caseIds: [...peers.keys()] })); }
    }
    return;
  }
  response.writeHead(404); response.end('not found');
});
server.listen(0, '127.0.0.1', async () => {
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing loopback port.');
  const value = { proofId, baseURL: 'http://127.0.0.1:' + address.port, participants, caseIds: ids, pid: process.pid, startedAt: new Date().toISOString() };
  await fs.writeFile(path.join(root, 'server.json'), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); process.stdout.write(JSON.stringify(value) + '\n');
});
