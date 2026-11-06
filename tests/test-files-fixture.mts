/** Synthetic retained bytes only. No network calls or real system evidence. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { syntheticCase, syntheticCases, startSyntheticRun } from './synthetic-cases.mjs';
import { check, registerEvidence, recordResult } from '../src/core/records.mjs';
import type { ConversationArtifact, EvidenceMetadata, RecordPayload } from '../src/contracts/model.mjs';

export async function testFilesFixture(root: string, sceneCount = 2) {
  const project = path.join(root, 'project'), run = path.join(root, 'run'), casesFile = path.join(project, 'cases', 'v001.json');
  await fs.mkdir(path.dirname(casesFile), { recursive: true });
  const steps = Array.from({ length: 10 }, (_, i) => ({ id: 'step-' + i, action: '合成步骤 ' + (i + 1) + '：核对本轮对象、输入文件和实际结果。此长文本用于检查阅读位置，文件存在不代表业务结果正确。' }));
  const baseline = syntheticCases(Array.from({ length: sceneCount }, (_, i) => syntheticCase({ id: 'files-' + i, title: '合成附件场景 ' + (i + 1), criticalConditions: ['仅用于本地工程验证，不执行真实业务。'], requiredPath: null, stepOrder: 'strict', steps,
    goals: Array.from({ length: 3 }, (_, j) => ({ id: 'goal-' + j, title: ['普通上传与下载', 'AI消息输入与输出文件', '边界及异常条件'][j]!, basis: { kind: 'explicit' as const, source: 'Synthetic local fixture', text: '本地合成需求，验证交付和阅读行为。' }, expected: '实际使用的文件可下载并核对原始字节，业务结论保持独立。', requiredRefs: ['condition:0', ...steps.map(s => 'step:' + s.id)] })) })), '合成附件与评审验证');
  await fs.writeFile(casesFile, JSON.stringify(baseline, null, 2));
  await startSyntheticRun({ projectDir: project, casesFile, outputDir: run });
  let ev = 0;
  async function register(name: string, bytes: Buffer | string, metadata: EvidenceMetadata, caseId = 'files-0', kind: 'other' | 'dom' | 'conversation' = 'other') {
    const sourceFile = path.join(root, 'source-' + ev + '.bin'); await fs.writeFile(sourceFile, bytes);
    const receipt = await registerEvidence({ runDir: run, request: { schemaVersion: 9, operationId: 'evidence-' + ev, expectedRevision: ev++, caseId, sourceFile, kind, source: 'Synthetic local fixture', description: name, metadata } });
    return { ...receipt, sourceFile };
  }
  const inputBytes = Buffer.from('编号,内容\n1,合成输入\n', 'utf8'), outputBytes = Buffer.from([0, 255, 1, 2, 128, 3]);
  const input = await register('输入数据.csv', inputBytes, { contentState: 'full', mediaType: 'text/csv', testFile: { name: '输入数据.csv', origin: 'generated' } });
  const output = await register('实际输出.xlsx', outputBytes, { contentState: 'full', testFile: { name: '实际输出.xlsx', origin: 'system_download', note: '格式异常合成文件；保留原始字节和扩展名，不自动改写。' } });
  const renamed = await register('同字节另一个名字.csv', inputBytes, { contentState: 'full', mediaType: 'text/csv', testFile: { name: '同字节另一个名字.csv', origin: 'user_provided' } });
  const aiOutput = await register('AI返回说明.txt', '合成AI产物：仅用于验证文件交付。', { contentState: 'full', mediaType: 'text/plain', testFile: { name: 'AI返回说明.txt', origin: 'ai_output' } });
  const raw = { input: '请检查这个合成输入文件。', answer: '这是合成输出文件。' };
  const rawEvidence = await register('合成消息来源', JSON.stringify(raw), { contentState: 'full', mediaType: 'application/json' }, 'files-0', 'dom');
  const conversation: ConversationArtifact = { conversationVersion: 1, id: 'files-conversation', title: '合成附件对话', limitations: ['工程验证，不是真实AI调用。'], messages: [
    { id: 'user-1', role: 'user', format: 'text', content: raw.input, presentation: 'verbatim', completeness: 'complete', state: 'final', completionBasis: '合成输入已保存', sourceRefs: [{ sourceId: 'raw', jsonPointer: '/input' }], attachmentSourceIds: ['input-file'], limitations: [] },
    { id: 'assistant-1', role: 'assistant', format: 'text', content: raw.answer, presentation: 'verbatim', completeness: 'complete', state: 'final', completionBasis: '合成输出已保存', sourceRefs: [{ sourceId: 'raw', jsonPointer: '/answer' }], attachmentSourceIds: ['output-file'], limitations: [] }
  ] };
  const chat = await register('合成规范化对话', JSON.stringify(conversation), { contentState: 'full', conversationSources: [{ sourceId: 'raw', evidenceId: rawEvidence.evidenceId }, { sourceId: 'input-file', evidenceId: input.evidenceId }, { sourceId: 'output-file', evidenceId: aiOutput.evidenceId }] }, 'files-0', 'conversation');
  const record: RecordPayload = { observations: [{ id: 'actual', summary: '合成文件引用已留存', coveredRefs: steps.map(s => 'step:' + s.id), evidenceIds: [input.evidenceId, output.evidenceId, renamed.evidenceId, aiOutput.evidenceId, chat.evidenceId], actions: [
    { id: 'upload', description: '普通功能上传输入文件', planRefs: ['step:step-0'], evidenceIds: [input.evidenceId, renamed.evidenceId], fileUses: [{ role: 'upload_input', evidenceId: input.evidenceId }, { role: 'upload_input', evidenceId: renamed.evidenceId }] },
    { id: 'download', description: '普通功能下载实际输出', planRefs: ['step:step-1'], evidenceIds: [output.evidenceId], fileUses: [{ role: 'download_output', evidenceId: output.evidenceId }] },
    { id: 'chat', description: 'AI消息使用输入与输出附件', input: raw.input, inputPresentation: 'verbatim', planRefs: ['step:step-2'], evidenceIds: [chat.evidenceId, input.evidenceId, aiOutput.evidenceId], fileUses: [{ role: 'ai_input', evidenceId: input.evidenceId }, { role: 'ai_output', evidenceId: aiOutput.evidenceId }], conversations: [{ evidenceId: chat.evidenceId, messageIds: ['user-1', 'assistant-1'] }] }
  ] }], assessments: ['goal-0', 'goal-1'].map(goalId => ({ goalId, status: 'inconclusive', rationale: '本地合成材料仅用于工程链路验证。', observationIds: ['actual'], gaps: ['未执行真实业务测试。'] })) };
  await recordResult({ runDir: run, request: { schemaVersion: 9, operationId: 'synthetic-result', expectedRevision: 0, caseId: 'files-0', mode: 'final', record } });
  return { root, project, run, casesFile, input, output, renamed, aiOutput, chat, rawEvidence, inputBytes, outputBytes, register, record, checked: await check(run) };
}
