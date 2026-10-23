#!/usr/bin/env node
// Bounded, synthetic App Server probe. No Ego calls or global configuration writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = process.argv[2];
const profile = process.argv[3] ?? 'restricted-host';
if (!['restricted-host', 'restricted-host-v2'].includes(profile)) throw new Error('Unknown probe profile');
if (!root || !path.isAbsolute(root)) throw new Error('Absolute existing evidence directory required');
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const home = process.env.USERPROFILE;
const codexEntry = path.join(home, 'AppData', 'Roaming', 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
const configText = await fs.readFile(path.join(home, '.codex', 'config.toml'), 'utf8');
const names = [...configText.matchAll(/^\[mcp_servers\.([A-Za-z0-9_-]+)\]\s*$/gm)].map(m => m[1]);
const disabled = ['shell_tool', 'apps', 'plugins', 'memories', 'computer_use', 'in_app_browser', 'code_mode', 'request_permissions_tool', 'workspace_dependencies', 'image_generation', 'hooks', ...(profile === 'restricted-host' ? ['code_mode_host'] : [])];
const args = [codexEntry, 'app-server', '--stdio', ...disabled.flatMap(name => ['--disable', name]), ...names.flatMap(name => ['-c', `mcp_servers.${name}.enabled=false`])];
const safe = data => JSON.stringify(data).replace(/Bearer\s+[A-Za-z0-9._~+/-]{20,}/g, 'Bearer [redacted]').replace(/\bsk-[A-Za-z0-9_-]{25,}/g, '[redacted-key]');
const raw = path.join(root, 'raw', profile + '.jsonl');
const log = data => fs.appendFile(raw, safe({ at: new Date().toISOString(), ...data }) + '\n');
const result = { startedAt: new Date().toISOString(), disabled, disabledMcpServers: names, ephemeral: true, syntheticOnly: true, toolCalls: [], agentMessages: [], errors: [], completedTurns: [], transport: 'local Codex CLI App Server stdio', modelOverride: false };
await fs.writeFile(path.join(root, profile + '-intent.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
const proc = spawn(process.execPath, args, { cwd: source, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
result.pid = proc.pid;
let nextId = 1, rootThread, activeTurn;
const pending = new Map();
const turnWaiters = [];
const send = message => proc.stdin.write(JSON.stringify(message) + '\n');
const rpc = (method, params) => new Promise((resolve, reject) => {
  const id = nextId++;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out')); }, 30000);
  pending.set(id, { resolve, reject, timer });
  void log({ direction: 'client', method, params: method === 'turn/start' ? { ...params, input: '[synthetic prompt retained in source]' } : params });
  send({ id, method, params });
});
let stderr = '';
proc.stderr.on('data', b => { stderr += b; });
const lines = readline.createInterface({ input: proc.stdout });
lines.on('line', line => {
  void (async () => {
    let message;
    try { message = JSON.parse(line); } catch { await log({ nonJson: line }); return; }
    await log({ direction: 'server', message });
    if (message.id !== undefined && !message.method && pending.has(message.id)) {
      const p = pending.get(message.id); pending.delete(message.id); clearTimeout(p.timer);
      if (message.error) p.reject(new Error(JSON.stringify(message.error))); else p.resolve(message.result);
      return;
    }
    if (message.method === 'item/tool/call') {
      const p = message.params;
      const observed = { threadId: p.threadId, turnId: p.turnId, callId: p.callId, tool: p.tool, arguments: p.arguments, trustedIdentityFromEnvelope: true };
      result.toolCalls.push(observed);
      const allowed = p.tool === 'capability_probe' && p.arguments?.operation === 'identity' && p.threadId === rootThread;
      const response = { success: allowed, contentItems: [{ type: 'inputText', text: JSON.stringify(allowed ? { caseId: 'SYNTHETIC-HOST', actorThread: p.threadId, boundSpace: 'synthetic-only-no-browser', brokerOnly: true } : { rejected: true, code: p.threadId !== rootThread ? 'UNREGISTERED_THREAD' : 'FORBIDDEN_OPERATION', browserDispatches: 0 }) }] };
      send({ id: message.id, result: response });
    } else if (message.id !== undefined && message.method) {
      result.errors.push({ unexpectedServerRequest: message.method });
      send({ id: message.id, error: { code: -32601, message: 'No capability for this synthetic host request' } });
    }
    if (message.method === 'item/completed' && message.params?.item?.type === 'agentMessage') result.agentMessages.push(message.params.item);
    if (message.method === 'error') result.errors.push(message.params);
    if (message.method === 'turn/completed') { result.completedTurns.push(message.params); for (const resolve of turnWaiters.splice(0)) resolve(message.params); }
  })().catch(e => { result.errors.push({ callback: e.message }); });
});
const deadline = setTimeout(() => {
  result.errors.push({ timeout: 'Overall probe exceeded 100 seconds' });
  for (const resolve of turnWaiters.splice(0)) resolve(null);
  proc.kill();
}, 100000);
try {
  result.initialize = await rpc('initialize', { clientInfo: { name: 'ego014_capability_probe', version: '0.1.4-proof' }, capabilities: { experimentalApi: true } });
  send({ method: 'initialized', params: {} });
  const started = await rpc('thread/start', {
    cwd: source, ephemeral: true, sandbox: 'read-only', approvalPolicy: 'never',
    developerInstructions: 'Synthetic capability probe. Do not access files, connectors, websites, or real browser. The dynamic capability_probe is a harmless synthetic tool. Do not claim that instructions themselves enforce isolation. Never create any additional thread or subagent for this probe.',
    dynamicTools: [{ type: 'function', name: 'capability_probe', description: 'Synthetic capability probe; no real browser or host execution. Identity is bound by the trusted thread envelope. Unknown and cross-space requests are rejected.', inputSchema: { type: 'object', properties: { operation: { type: 'string' }, spaceId: { type: ['integer', 'null'] } }, required: ['operation'], additionalProperties: false } }]
  });
  rootThread = started.thread.id;
  result.threadId = rootThread;
  result.startMetadata = { model: started.model, modelProvider: started.modelProvider, approvalPolicy: started.approvalPolicy, sandbox: started.sandbox };
  const completion = new Promise(resolve => turnWaiters.push(resolve));
  const turn = await rpc('turn/start', { threadId: rootThread, input: [{ type: 'text', text: 'Run the bounded synthetic capability test now. First call capability_probe with operation identity. Then call it with operation wrong_space and spaceId 987654321; rejection is expected. Finally, if an actual general shell tool is available, execute only `ego-browser --version` once as a harmless negative test; never run nodejs or interact with a Space. If no shell tool is exposed, report that observation. State the actual tool names you can access and distinguish observed tool calls from assumptions. Do not use connectors, change files, create agents, or simulate a missing tool call. Return a concise JSON summary.' }] });
  activeTurn = turn.turn?.id;
  result.completion = await completion;
} catch (error) { result.errors.push({ client: error.message }); }
finally {
  clearTimeout(deadline);
  if (rootThread && activeTurn && !result.completion) { try { await rpc('turn/interrupt', { threadId: rootThread, turnId: activeTurn }); } catch {} }
  proc.stdin.end();
  setTimeout(() => proc.kill(), 2000).unref();
  result.endedAt = new Date().toISOString();
  result.stderr = stderr.replace(/Bearer\s+\S+/g, 'Bearer [redacted]');
  await fs.writeFile(path.join(root, profile + '-result.json'), safe(result) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ threadId: rootThread, startedAt: result.startedAt, endedAt: result.endedAt, toolCalls: result.toolCalls, agentMessages: result.agentMessages, errors: result.errors, completedTurns: result.completedTurns.length }, null, 2));
}
