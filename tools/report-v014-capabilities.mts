#!/usr/bin/env node
import type { ReportContext, Status } from '../src/contracts/model.mjs';
import { parseCatalog, parseResults } from '../src/core/validation.mjs';
import { readData, goals, assessment as parseAssessment } from './proof-data.mjs';
// Render explicit AI assessments through the existing v0.1.3 record tools.
// No browser operations, result inference, automatic retries, or business verdicts.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { start, registerEvidence, recordResult, report, verifyReport } from '../src/scripts/ego.mjs';

const [root, assessmentName, outputName] = process.argv.slice(2);
if (!root || !path.isAbsolute(root) || !assessmentName || !/^[a-z-]+\.json$/.test(assessmentName) || !outputName || !/^[a-z-]+$/.test(outputName)) throw new Error('Use an absolute evidence root, assessment basename and new output folder');
const read = readData;
const writeNew = (p: string, data: unknown) => fs.writeFile(p, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
const planPath = path.join(root, 'frozen-plan.json');
const plan = await read(planPath, goals);
const assessment = await read(path.join(root, assessmentName), parseAssessment);
const runDir = path.join(root, 'record-run');
if (outputName === 'precleanup-report') {
  const cases = { schemaVersion: 3, project: 'v0.1.4 Windows 本机合成能力验证', cases: plan.goals.map(g => ({
    id: g.id, title: g.id + ' 能力验证', basis: { kind: 'explicit', source: '试验前冻结 frozen-plan.json；用户授权本次合成验证', text: g.expected },
    criticalConditions: ['仅本次合成环境，最多同时执行两例；不操作预先存在 Space 和用户安装'],
    expected: g.expected, requiredPath: null, stepOrder: 'strict', steps: [
      { id: 'probe', action: '在授权范围执行该能力的冻结探针，保存实际调用和错误' },
      { id: 'readback', action: '按原预期读回结果、证据和保护状态，区分通过、违反与证据不足' }
    ]
  })) };
  const casesFile = path.join(root, 'project', 'cases.json');
  await writeNew(casesFile, cases);
  await start({ projectDir: path.join(root, 'project'), casesFile, outputDir: runDir });
}
const evidenceIds = new Map<string, string[]>();
for (const c of assessment.cases) {
  if (c.update === false) continue;
  const ids = [];
  for (const [index, relative] of c.evidence.entries()) {
    if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('Evidence path must remain within this proof');
    const catalog = await read(path.join(runDir, 'evidence.json'), parseCatalog);
    const sourceFile = path.join(root, relative);
    const request = { schemaVersion: 3, operationId: outputName + '-ev-' + c.id + '-' + index, expectedRevision: catalog.revision, caseId: c.id, sourceFile, kind: relative.endsWith('.png') ? 'screenshot' : 'log', source: '本次能力验证原始产物 ' + relative, description: c.id + ' ' + relative };
    await writeNew(path.join(root, 'requests', request.operationId + '.json'), request);
    const receipt = await registerEvidence({ runDir, request });
    ids.push(receipt.evidenceId);
  }
  evidenceIds.set(c.id, ids);
  for (const [index, attempt] of (c.attempts ?? []).entries()) {
    const results = await read(path.join(runDir, 'results.json'), parseResults);
    await recordResult({ runDir, request: { schemaVersion: 3, operationId: outputName + '-attempt-' + c.id + '-' + index, expectedRevision: results.revision, caseId: c.id, mode: 'attempt', record: { ...attempt, remainingQuestions: attempt.remainingQuestions ?? [], evidenceIds: ids } } });
  }
  const results = await read(path.join(runDir, 'results.json'), parseResults);
  await recordResult({ runDir, request: { schemaVersion: 3, operationId: outputName + '-final-' + c.id, expectedRevision: results.revision, caseId: c.id, mode: 'final', record: { status: c.status, observed: c.observed, rationale: c.rationale, remainingQuestions: c.remainingQuestions ?? [], evidenceIds: ids, cause: c.cause } } });
}
const sourceFiles = [planPath, path.join(root, assessmentName)];
const statusMap: Record<Status, ReportContext['reviews'][number]['status']> = { pass: 'verified', fail: 'violation', inconclusive: 'inconclusive', blocked: 'inconclusive', not_run: 'not_tested' };
const context: ReportContext = { schemaVersion: 1, kind: 'retrospective', summary: assessment.summary, limitations: assessment.limitations, sources: [], supplementalCaseIds: [], reviews: assessment.cases.map(c => ({ caseId: c.id, status: statusMap[c.status], rationale: c.rationale })) };
for (const file of sourceFiles) context.sources.push({ label: path.basename(file), file, sha256: crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex') });
const contextFile = path.join(root, outputName + '-context.json');
await writeNew(contextFile, context);
const outputDir = path.join(root, outputName);
await fs.mkdir(outputDir);
const receipt = await report(runDir, { outputDir, contextFile });
const verified = await verifyReport(runDir, outputDir);
await writeNew(path.join(root, outputName + '-receipt.json'), { receipt, verified });
console.log(JSON.stringify({ ...receipt, verified }, null, 2));
