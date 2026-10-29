import type { TestContext } from 'node:test';
import type { Case, RecordPayload, RecordRequest, TestHooks } from '../src/contracts/model.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { init, start } from '../src/core/cases.mjs';
import { registerEvidence, recordResult } from '../src/core/records.mjs';
export const caseOf = (id = 'one'): Case => ({
  id, title: 'Synthetic grouped scene', criticalConditions: ['Synthetic isolated data'], requiredPath: null, stepOrder: 'strict',
  steps: [{ id: 'create', action: 'Create a synthetic record and independently read its saved value.' }, { id: 'capacity', action: 'Inspect a synthetic record whose capacity is unknown.' }],
  goals: [
    { id: 'saved', title: 'Saved value readback', basis: { kind: 'explicit', source: 'Synthetic requirement', text: 'Saved data can be independently read.' }, expected: 'The saved value is returned.', requiredRefs: ['condition:0', 'step:create'] },
    { id: 'capacity', title: 'Unknown capacity remains unknown', basis: { kind: 'explicit', source: 'Synthetic requirement', text: 'Unknown capacity must not mean idle.' }, expected: 'Unknown capacity is not reported as idle.', requiredRefs: ['condition:0', 'step:capacity'] }
  ]
});
export const writeJSON = (file: string, value: unknown) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
export async function readJSON(file: string): Promise<unknown> { return JSON.parse(await fs.readFile(file, 'utf8')); }
export async function fixture(t: TestContext, cases = [caseOf(), caseOf('two')]) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ego-v7-synthetic-'));
  t.after(async () => { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('ego-v7-synthetic-')); await fs.rm(root, { recursive: true, force: true }); });
  const projectDir = path.join(root, 'project with spaces'); await init(projectDir);
  const casesFile = path.join(projectDir, 'cases.json'), runDir = path.join(root, 'run with spaces');
  await writeJSON(casesFile, { schemaVersion: 7, project: 'Synthetic only', cases }); await start({ projectDir, casesFile, outputDir: runDir });
  const sourceFile = path.join(root, 'source.log'); await fs.writeFile(sourceFile, 'Synthetic observation; no live browser or business action.\n');
  return { root, projectDir, casesFile, runDir, sourceFile };
}
export type Fixture = Awaited<ReturnType<typeof fixture>>;
export function evidenceRequest(f: Fixture, overrides: Record<string, unknown> = {}) {
  return { schemaVersion: 7, operationId: 'evidence-1', expectedRevision: 0, caseId: 'one', sourceFile: f.sourceFile, kind: 'log', source: 'Synthetic fixture', description: 'Retained synthetic facts', ...overrides };
}
export async function addEvidence(f: Fixture, overrides: Record<string, unknown> = {}, hooks: TestHooks = {}) {
  return registerEvidence({ runDir: f.runDir, request: evidenceRequest(f, overrides) }, hooks);
}
export function observed(evidenceId: string, status: 'verified' | 'violation' | 'inconclusive' = 'verified'): RecordPayload {
  return { observations: [{ id: 'readback', summary: 'Synthetic independent saved-value readback.', coveredRefs: ['condition:0', 'step:create'], evidenceIds: [evidenceId] }],
    assessments: [{ goalId: 'saved', status, rationale: 'Synthetic assessment against the saved-value requirement.', observationIds: ['readback'], gaps: [] }] };
}
export function untested(goalId = 'capacity'): RecordPayload {
  return { observations: [], assessments: [{ goalId, status: 'not_tested', rationale: 'The user deferred this isolated synthetic check.', observationIds: [], gaps: ['Synthetic resource not available for this goal.'] }] };
}
export function request(record: RecordPayload, overrides: Partial<RecordRequest> = {}): RecordRequest {
  return { schemaVersion: 7, operationId: 'result-1', expectedRevision: 0, caseId: 'one', mode: 'final', record, ...overrides };
}
export function record(f: Fixture, payload: RecordPayload, overrides: Partial<RecordRequest> = {}, hooks: TestHooks = {}) {
  return recordResult({ runDir: f.runDir, request: request(payload, overrides) }, hooks);
}
