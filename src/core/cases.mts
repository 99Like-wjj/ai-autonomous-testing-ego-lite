import type { Manifest } from '../contracts/model.mjs';
import { resolveConfiguration } from '../execution/config.mjs';
import { initialExecution } from '../execution/ledger.mjs';


import { errorInfo } from './common.mjs';
import fs from 'node:fs/promises';

import path from 'node:path';
import crypto from 'node:crypto';
import { fail, hash, json, safePath, directory, readJSON, writeNew, removeRegularIfPresent } from './common.mjs';
import { newSafeCases, normalizeCases } from './baseline.mjs';
export { newSafeCases, normalizeCases } from './baseline.mjs';
export async function validateCases(casesFile: unknown) {
  const baseline = normalizeCases(await readJSON(await safePath(casesFile, { existing: true })));
  newSafeCases(baseline);
  return { schemaVersion: 3, structurallyValid: true, project: baseline.project, caseCount: baseline.cases.length, stepCount: baseline.cases.reduce((sum, c) => sum + c.steps.length, 0), stepOrderCounts: { strict: baseline.cases.filter(c => c.stepOrder === 'strict').length, adaptive: baseline.cases.filter(c => c.stepOrder === 'adaptive').length } };
}
export async function init(projectDir: unknown) {
  const target = await safePath(projectDir, { external: true });
  await fs.mkdir(target, { mode: 0o700 });
  try {
    await writeNew(path.join(target, 'cases.example.json'), json({ schemaVersion: 3, project: 'Synthetic example', cases: [{ id: 'example-1', title: 'Create a synthetic configuration (replace before use)', basis: { kind: 'hypothesis', source: 'Example only, not an acceptance requirement', text: 'Synthetic requirement only: a configuration created with an approved name and value can be retrieved with those values. Replace with an actual source-backed requirement before use.' }, criticalConditions: [], expected: 'The configuration can be retrieved with name synthetic-example and value example-value.', requiredPath: null, stepOrder: 'strict', steps: [{ id: 'step-1', action: 'In the approved test environment, find the configuration center’s example configuration feature.' }, { id: 'step-2', action: 'Create an example configuration named synthetic-example with value example-value, using the user-approved test data.' }] }] }));
  } catch (caughterror) { const error = errorInfo(caughterror); try { await fs.rmdir(target); } catch {} throw error; }
  return { projectDir: target };
}
export async function start({ projectDir, casesFile, outputDir, configFile, maxParallelCases, runSchemaVersion = 4 }: { projectDir: unknown; casesFile: unknown; outputDir: unknown; configFile?: string | undefined; maxParallelCases?: number | undefined; runSchemaVersion?: 3 | 4 }) {
  const project = await directory(projectDir);
  const target = await safePath(outputDir, { external: true });
  const baseline = normalizeCases(await readJSON(await safePath(casesFile, { existing: true })));
  newSafeCases(baseline);
  if (runSchemaVersion !== 3 && runSchemaVersion !== 4) fail('Unsupported new-run manifest version.');
  if (runSchemaVersion === 3 && (configFile !== undefined || maxParallelCases !== undefined)) fail('Legacy runs cannot accept parallel configuration.');
  const configuration = runSchemaVersion === 4 ? await resolveConfiguration({ projectDir: project, configFile, maxParallelCases }) : undefined;
  const bytes = json(baseline);
  const identity = { baselineSchemaVersion: 3 as const, runId: crypto.randomUUID(), projectDir: project, baselineSha256: hash(bytes) };
  const manifest: Manifest = runSchemaVersion === 4 ? { ...identity, schemaVersion: 4, executionFile: 'execution.json' } : { ...identity, schemaVersion: 3 };
  await fs.mkdir(target, { mode: 0o700 });
  const createdFiles = [];
  let evidenceDirectoryCreated = false, workersDirectoryCreated = false;
  try {
    const baselinePath = path.join(target, 'baseline.json');
    await writeNew(baselinePath, bytes); createdFiles.push(baselinePath);
    const manifestPath = path.join(target, 'manifest.json');
    await writeNew(manifestPath, json(manifest)); createdFiles.push(manifestPath);
    const resultsPath = path.join(target, 'results.json');
    await writeNew(resultsPath, json({ schemaVersion: 3, revision: 0, cases: baseline.cases.map(c => ({ id: c.id, basis: c.basis, status: 'not_run', observed: '', rationale: '', remainingQuestions: [], evidenceIds: [], cause: 'unknown', attempts: [] })), operations: [] })); createdFiles.push(resultsPath);
    const evidencePath = path.join(target, 'evidence.json');
    await writeNew(evidencePath, json({ schemaVersion: 3, revision: 0, items: [], operations: [] })); createdFiles.push(evidencePath);
    await fs.mkdir(path.join(target, 'evidence'), { mode: 0o700 });
    evidenceDirectoryCreated = true;
    if (configuration) {
      const executionPath = path.join(target, 'execution.json');
      await writeNew(executionPath, json(initialExecution(manifest, configuration))); createdFiles.push(executionPath);
      await fs.mkdir(path.join(target, 'workers'), { mode: 0o700 }); workersDirectoryCreated = true;
    }
  } catch (caughterror) { const error = errorInfo(caughterror);
    if (workersDirectoryCreated) { try { await fs.rmdir(path.join(target, 'workers')); } catch {} }
    for (const filename of createdFiles.reverse()) { try { await removeRegularIfPresent(filename); } catch {} }
    if (evidenceDirectoryCreated) { try { await fs.rmdir(path.join(target, 'evidence')); } catch {} }
    try { await fs.rmdir(target); } catch {}
    throw error;
  }
  return { runDir: target, cases: baseline.cases.length, runSchemaVersion, baselineSchemaVersion: 3 };
}
