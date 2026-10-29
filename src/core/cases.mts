import { prepareBinding } from '../regression/binding.mjs';
import type { Manifest } from '../contracts/model.mjs';
import { resolveConfiguration } from '../execution/config.mjs';
import { initialExecution } from '../execution/ledger.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { errorInfo, fail, hash, json, safePath, directory, readJSON, writeNew, removeRegularIfPresent } from './common.mjs';
import { newSafeCases, normalizeCases } from './baseline.mjs';
export { newSafeCases, normalizeCases } from './baseline.mjs';
export async function validateCases(casesFile: unknown) {
  const baseline = normalizeCases(await readJSON(await safePath(casesFile, { existing: true })));
  newSafeCases(baseline);
  return { schemaVersion: 7, structurallyValid: true, project: baseline.project, caseCount: baseline.cases.length, goalCount: baseline.cases.reduce((sum, c) => sum + c.goals.length, 0), stepCount: baseline.cases.reduce((sum, c) => sum + c.steps.length, 0), stepOrderCounts: { strict: baseline.cases.filter(c => c.stepOrder === 'strict').length, adaptive: baseline.cases.filter(c => c.stepOrder === 'adaptive').length } };
}
export async function init(projectDir: unknown) {
  const target = await safePath(projectDir, { external: true }); await fs.mkdir(target, { mode: 0o700 });
  try {
    await writeNew(path.join(target, 'cases.example.json'), json({ schemaVersion: 7, project: 'Synthetic example', cases: [{
      id: 'example-1', title: 'Create a synthetic configuration (replace before use)', criticalConditions: [], requiredPath: null, stepOrder: 'strict',
      steps: [{ id: 'step-1', action: 'Create an approved synthetic configuration, then independently retrieve its saved values.' }],
      goals: [{ id: 'saved-values', basis: { kind: 'hypothesis', source: 'Example only; replace before execution', text: 'An approved configuration can be retrieved with its saved values.' }, expected: 'The saved configuration is independently retrieved with the supplied values.', requiredRefs: ['step:step-1'] }]
    }] }));
  } catch (caught) { const error = errorInfo(caught); try { await fs.rmdir(target); } catch {} throw error; }
  return { projectDir: target };
}
export async function start({ projectDir, casesFile, outputDir, configFile, maxParallelCases, bindingFile, runSchemaVersion = 7 }: { projectDir: unknown; casesFile: unknown; outputDir: unknown; configFile?: string | undefined; maxParallelCases?: number | undefined; bindingFile?: string | undefined; runSchemaVersion?: 7 }) {
  const project = await directory(projectDir), target = await safePath(outputDir, { external: true });
  const baseline = normalizeCases(await readJSON(await safePath(casesFile, { existing: true }))); newSafeCases(baseline);
  if (runSchemaVersion !== 7) fail('New runs require schemaVersion 7.');
  const configuration = await resolveConfiguration({ projectDir: project, configFile, maxParallelCases }), bytes = json(baseline);
  const manifest: Manifest = { schemaVersion: 7, baselineSchemaVersion: 7, runId: crypto.randomUUID(), projectDir: project, baselineSha256: hash(bytes), executionFile: 'execution.json' };
  const preparedBinding = bindingFile === undefined ? undefined : await prepareBinding({ projectDir: project, request: await readJSON(await safePath(bindingFile, { existing: true })), baseline, runId: manifest.runId });
  if (preparedBinding) { manifest.regressionBindingFile = 'regression-binding.json'; manifest.regressionBindingSha256 = preparedBinding.sha256; }
  await fs.mkdir(target, { mode: 0o700 });
  const createdFiles: string[] = []; let evidenceDirectoryCreated = false, workersDirectoryCreated = false;
  try {
    for (const [filename, content] of [
      ...(preparedBinding ? [['regression-binding.json', preparedBinding.bytes]] : []),
      ['baseline.json', bytes], ['manifest.json', json(manifest)], ['results.json', json({ schemaVersion: 7, revision: 0, entries: [] })],
      ['evidence.json', json({ schemaVersion: 7, revision: 0, items: [], operations: [] })], ['execution.json', json(initialExecution(manifest, configuration))]
    ]) { const full = path.join(target, filename!); await writeNew(full, content!); createdFiles.push(full); }
    await fs.mkdir(path.join(target, 'evidence'), { mode: 0o700 }); evidenceDirectoryCreated = true;
    await fs.mkdir(path.join(target, 'workers'), { mode: 0o700 }); workersDirectoryCreated = true;
  } catch (caught) {
    const error = errorInfo(caught);
    if (workersDirectoryCreated) { try { await fs.rmdir(path.join(target, 'workers')); } catch {} }
    for (const filename of createdFiles.reverse()) { try { await removeRegularIfPresent(filename); } catch {} }
    if (evidenceDirectoryCreated) { try { await fs.rmdir(path.join(target, 'evidence')); } catch {} }
    try { await fs.rmdir(target); } catch {} throw error;
  }
  return { runDir: target, cases: baseline.cases.length, goals: baseline.cases.reduce((sum, c) => sum + c.goals.length, 0), runSchemaVersion: 7, baselineSchemaVersion: 7 };
}
