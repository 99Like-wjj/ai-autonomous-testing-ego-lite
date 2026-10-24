/** Typed readers for historical synthetic-probe artifacts. No browser/model execution. */
import fs from 'node:fs/promises';
import { assertClosed, object, fail } from '../src/core/common.mjs';
import { arrayValue, integer, oneOf, causeValues, statusValues, sha256Value, strings, textValue } from '../src/core/validation.mjs';
import type { RecordPayload } from '../src/contracts/model.mjs';
export function record(value: unknown): Record<string, unknown> { if (!object(value)) fail('Expected a proof JSON object.'); return value; }
export function required<T>(map: Record<string, T>, name: string): T { const value = map[name]; if (value === undefined) fail('Missing proof entry: ' + name); return value; }
export async function readData<T>(filename: string, decode: (value: unknown) => T): Promise<T> { const value: unknown = JSON.parse(await fs.readFile(filename, 'utf8')); return decode(value); }
export interface SpaceMetadata extends Record<string, unknown> { id: number }
export function inventory(value: unknown) { const data = record(value); return { ...data, spaces: arrayValue(data.spaces, 'spaces').map(v => { const space = record(v); return { ...space, id: integer(space.id, 'space id') }; }) }; }
export function binding(value: unknown) { const data = record(value); return { ...data, spaceId: integer(data.spaceId, 'space id'), name: textValue(data.name, 'space name') }; }
export function bindings(value: unknown) { return arrayValue(value, 'bindings').map(binding); }
export function proof(value: unknown) { const data = record(value); return { ...data, proofId: textValue(data.proofId, 'proof ID') }; }
export function server(value: unknown) { const data = record(value); return { ...data, baseURL: textValue(data.baseURL, 'server URL') }; }
export type TreeHashes = Record<string, string | { link: string } | true>;
export function treeHashes(value: unknown): TreeHashes {
  const out: TreeHashes = {};
  for (const [name, hash] of Object.entries(record(value))) {
    if (name === 'absent' && hash === true) out[name] = true;
    else if (typeof hash === 'string') out[name] = sha256Value(hash);
    else { const link = record(hash); assertClosed(link, ['link'], 'link metadata'); out[name] = { link: textValue(link.link, 'link target') }; }
  }
  return out;
}
export function snapshots(value: unknown): Record<string, TreeHashes> { return Object.fromEntries(Object.entries(record(value)).map(([name, data]) => [name, treeHashes(data)])); }
export function roundData(value: unknown): Record<string, unknown> & { spaceId?: number } {
  const data = record(value);
  return { ...data, ...(data.spaceId === undefined ? {} : { spaceId: integer(data.spaceId, 'space id') }) };
}
export function roundRecord(value: unknown) {
  const data = record(value);
  return { ...data, label: textValue(data.label, 'round label'), startedAt: textValue(data.startedAt, 'startedAt'), endedAt: textValue(data.endedAt, 'endedAt'), stdout: textValue(data.stdout, 'stdout', { empty: true }), stderr: textValue(data.stderr, 'stderr', { empty: true }),
    ...(data.cliPid === undefined ? {} : { cliPid: integer(data.cliPid, 'CLI PID') }), code: data.code === null ? null : integer(data.code, 'exit code') };
}
export function goals(value: unknown) { const data = record(value); return { ...data, goals: arrayValue(data.goals, 'goals').map(value => { const goal = record(value); return { id: textValue(goal.id, 'goal ID'), expected: textValue(goal.expected, 'goal expected') }; }) }; }
export function evidenceManifest(value: unknown) { const data = record(value); return { ...data, files: Object.fromEntries(Object.entries(record(data.files)).map(([name, item]) => [name, { ...record(item), sha256: sha256Value(record(item).sha256) }])) }; }
export function closureConfirmation(value: unknown) { const data = record(value); return { ...data, confirmedManualClosureIds: arrayValue(data.confirmedManualClosureIds, 'confirmed IDs').map(value => integer(value, 'Space ID')) }; }
export type AssessmentRecord = Omit<RecordPayload, 'evidenceIds'>;
export interface AssessmentCase extends AssessmentRecord { id: string; evidence: string[]; attempts: AssessmentRecord[]; update?: boolean }
export function assessment(value: unknown) {
  const data = record(value);
  return { summary: textValue(data.summary, 'summary'), limitations: strings(data.limitations, 'limitations'), cases: arrayValue(data.cases, 'assessment cases').map(value => {
    const c = record(value);
    if (c.update !== undefined && typeof c.update !== 'boolean') fail('Invalid assessment update flag.');
    const payload = recordPayloadWithoutEvidence({ status: c.status, observed: c.observed, rationale: c.rationale, remainingQuestions: c.remainingQuestions ?? [], ...(c.cause === undefined ? {} : { cause: c.cause }) });
    // Validate authored text/status without claiming that file evidence has already been registered.
    const result: AssessmentCase = { ...payload, id: textValue(c.id, 'case ID'), evidence: strings(c.evidence, 'evidence'), attempts: arrayValue(c.attempts ?? [], 'attempts').map(v => recordPayloadWithoutEvidence(v)), ...(c.update === undefined ? {} : { update: c.update }) };
    return result;
  }) };
}
function recordPayloadWithoutEvidence(value: unknown): AssessmentRecord {
  const entry = record(value);
  assertClosed(entry, ['status', 'observed', 'rationale', 'remainingQuestions', 'evidenceIds', 'cause'], 'assessment record');
  if (entry.evidenceIds !== undefined) strings(entry.evidenceIds, 'prior evidence IDs');
  // The historical assessment refers to local files; real registered IDs are added by its report tool.
  return { status: oneOf(entry.status, statusValues, 'assessment status'), observed: textValue(entry.observed, 'observed', { empty: true }), rationale: textValue(entry.rationale, 'rationale', { empty: true }), remainingQuestions: strings(entry.remainingQuestions ?? [], 'remainingQuestions'), ...(entry.cause === undefined ? {} : { cause: oneOf(entry.cause, causeValues, 'cause') }) };
}
export function protectionAssessment(value: unknown) { const data = record(value); return { evidence: strings(data.evidence, 'evidence'), record: recordPayloadWithoutEvidence(data.record), attempts: arrayValue(data.attempts ?? [], 'attempts').map(recordPayloadWithoutEvidence) }; }
