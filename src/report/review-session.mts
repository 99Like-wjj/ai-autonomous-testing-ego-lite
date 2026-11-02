/** A capability-scoped loopback writer for human review files, never a business API. */
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { caseDocumentHtml, loadCaseDocument } from './case-reader.mjs';
import { exportReviewFeedback, reviewBodyLimit, type ReviewExportReceipt } from './review-export.mjs';
import { parseReviewFeedback } from '../contracts/review-feedback.mjs';
import { safePath, hash } from '../core/common.mjs';
import { regularFilePath } from '../core/file-integrity.mjs';

class RequestError extends Error { constructor(readonly status: number, message: string) { super(message); } }
function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let bytes = 0, failed = false; const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      if (failed) return; bytes += chunk.length;
      if (bytes > reviewBodyLimit) { failed = true; chunks.length = 0; reject(new RequestError(413, '评审记录超过8MiB保存限制。')); return; }
      chunks.push(chunk);
    });
    request.on('end', () => { if (!failed) resolve(Buffer.concat(chunks).toString('utf8')); });
    request.on('error', reject); request.on('aborted', () => reject(new RequestError(400, '保存请求已中断。')));
  });
}
export interface ReviewSession {
  info: { kind: 'case-review-session'; url: string; outputDir: string; idleMinutes: number; businessExecuted: false; reviewRegistered: false };
  close(): Promise<void>;
  closed: Promise<void>;
}
export async function startReviewSession({ casesFile, outputDir, feedbackFile, presentationFile, aiContextFile, idleMinutes = 480 }: { casesFile: unknown; outputDir: unknown; feedbackFile?: unknown; presentationFile?: unknown; aiContextFile?:unknown; idleMinutes?: number }): Promise<ReviewSession> {
  if (!Number.isFinite(idleMinutes) || idleMinutes < 1 || idleMinutes > 1440) throw Error('Review idle timeout must be between 1 and 1440 minutes.');
  const { saved, model, script } = await loadCaseDocument({ casesFile, feedbackFile, presentationFile, aiContextFile });
  const root = await safePath(outputDir, { external: true }); await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const page = caseDocumentHtml(model, script), token = crypto.randomBytes(24).toString('hex'), prefix = '/review/' + token + '/';
  const identity = { cases: saved.ref, pointIds: saved.baseline.cases.flatMap(c => c.goals.map(g => g.pointId)) };
  const exported = new Map<string, { file: string; sha256: string }>();
  let origin = '', closing = false, timer: ReturnType<typeof setTimeout> | undefined, queue = Promise.resolve(), queued = 0;
  let resolveClosed!: () => void; const closed = new Promise<void>(resolve => { resolveClosed = resolve; });
  const close = async () => {
    if (!closing) { closing = true; if (timer) clearTimeout(timer); server.close(); server.closeIdleConnections(); }
    await closed;
  };
  const touch = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => { void close(); }, idleMinutes * 60000); timer.unref(); };
  function respond(response: ServerResponse, status: number, type: string, body: string | Uint8Array) {
    response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin', 'Content-Security-Policy': "frame-ancestors 'none'" }); response.end(body);
  }
  const json = (response: ServerResponse, status: number, value: unknown) => respond(response, status, 'application/json; charset=utf-8', JSON.stringify(value) + '\n');
  async function save(request: IncomingMessage): Promise<ReviewExportReceipt> {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) throw new RequestError(415, '保存需要JSON评审数据。');
    const length = Number(request.headers['content-length'] ?? 0); if (length > reviewBodyLimit) { request.resume(); throw new RequestError(413, '评审记录超过8MiB保存限制。'); }
    let input: unknown; try { input = JSON.parse(await readBody(request)) as unknown; } catch (error) { if (error instanceof RequestError) throw error; throw new RequestError(400, '评审JSON无法解析。'); }
    let parsed; try { parsed = parseReviewFeedback(input, identity); } catch (error) { throw new RequestError(400, error instanceof Error ? error.message : '评审格式无效。'); }
    if (queued >= 4) throw new RequestError(429, '已有保存正在处理，请保留草稿后再核对。');
    queued++;
    const result = queue.then(() => exportReviewFeedback({ casesFile: saved.file, request: parsed, outputDir: root, ...(model.presentation?{presentation:model.presentation}:{}) }));
    queue = result.then(() => undefined, () => undefined);
    try { return await result; } finally { queued--; }
  }
  async function handle(request: IncomingMessage, response: ServerResponse) {
    if (request.headers.host !== new URL(origin).host) throw new RequestError(403, '本机审阅Host不匹配。');
    const url = new URL(request.url ?? '/', origin);
    if (url.origin !== origin || !url.pathname.startsWith(prefix) || url.search) throw new RequestError(404, '没有此审阅资源。');
    const relative = url.pathname.slice(prefix.length), method = request.method;
    if (method === 'POST') {
      if (request.headers.origin !== origin || request.headers['sec-fetch-site'] && request.headers['sec-fetch-site'] !== 'same-origin') throw new RequestError(403, '拒绝跨来源保存请求。');
      if (relative === 'save') {
        touch(); const result = await save(request);
        for (const file of result.files) exported.set(file.name, { file: path.join(root, file.name), sha256: file.sha256 });
        json(response, 200, result); return;
      }
      if (relative === 'close') { request.resume(); json(response, 200, { closed: true }); setImmediate(() => { void close(); }); return; }
      throw new RequestError(404, '没有此保存操作。');
    }
    if (method !== 'GET') throw new RequestError(405, '不支持此方法。');
    if (relative === '') { touch(); respond(response, 200, 'text/html; charset=utf-8', page); return; }
    if (relative === 'capabilities') { touch(); json(response, 200, { kind: 'case-review-session', cases: saved.ref, outputDir: root, saveMode: 'native' }); return; }
    if (relative.startsWith('files/')) {
      const name = relative.slice(6), known = exported.get(name); if (!known || !/^[A-Za-z0-9.-]+\.(?:json|html)$/.test(name)) throw new RequestError(404, '文件不属于本次保存。');
      const bytes = await fs.readFile(await regularFilePath(await safePath(known.file, { existing: true })));
      if (hash(bytes) !== known.sha256) throw new RequestError(409, '已保存文件发生变化，请保留原记录并重新核对。');
      touch(); respond(response, 200, name.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8', bytes); return;
    }
    throw new RequestError(404, '没有此审阅资源。');
  }
  const server = http.createServer((request, response) => { void handle(request, response).catch(error => {
    if (response.headersSent) { response.destroy(); return; }
    if (error instanceof RequestError && error.status === 413) response.setHeader('Connection', 'close');
    json(response, error instanceof RequestError ? error.status : 409, { error: error instanceof Error ? error.message : '本机保存失败，原有文件和草稿保留。' });
  }); });
  server.requestTimeout = 30000; server.headersTimeout = 10000; server.keepAliveTimeout = 1000;
  server.once('close', resolveClosed);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address(); if (!address || typeof address === 'string') { await close(); throw Error('No loopback address available.'); }
  origin = 'http://127.0.0.1:' + address.port; touch();
  return { info: { kind: 'case-review-session', url: origin + prefix, outputDir: root, idleMinutes, businessExecuted: false, reviewRegistered: false }, close, closed };
}
