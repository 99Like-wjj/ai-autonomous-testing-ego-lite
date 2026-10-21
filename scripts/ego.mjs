#!/usr/bin/env node
/** Local evidence bookkeeping only. No model, browser, network, or verdict inference. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const statuses = new Set(['pass', 'fail', 'inconclusive', 'blocked', 'not_run']);
const causes = new Set(['product_candidate', 'agent', 'environment', 'spec', 'unknown']);
const fail = message => { throw new Error(message); };
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const inside = (root, target) => { const rel = path.relative(root, target); return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

// Reject every symlink component, not just links that currently resolve outside a root.
export async function safePath(value, { external = false, existing = false } = {}) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) fail('Paths must be absolute.');
  const resolved = path.resolve(value);
  if (external && (resolved === path.parse(resolved).root || inside(SOURCE_ROOT, resolved))) fail('Project and run records must be outside the source repository and not at a filesystem root.');
  let cursor = path.parse(resolved).root;
  for (const component of resolved.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    try { if ((await fs.lstat(cursor)).isSymbolicLink()) fail(`Symlink path is not allowed: ${cursor}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (existing) await fs.lstat(resolved);
  return resolved;
}
async function directory(value) {
  const target = await safePath(value, { external: true, existing: true });
  if (!(await fs.lstat(target)).isDirectory()) fail('Expected a directory.');
  return target;
}
async function readJSON(filename) {
  await safePath(filename, { existing: true });
  if (!(await fs.lstat(filename)).isFile()) fail('Expected a regular JSON file.');
  return JSON.parse(await fs.readFile(filename, 'utf8'));
}
async function writeNew(filename, data) { await fs.writeFile(filename, data, { flag: 'wx', mode: 0o600 }); }
export function normalizeCases(input) {
  if (!object(input) || Object.keys(input).some(k => !['schemaVersion', 'project', 'cases'].includes(k)) || input.schemaVersion !== 2 || !nonempty(input.project) || !Array.isArray(input.cases) || !input.cases.length) fail('Cases require schemaVersion 2, project, and a nonempty cases array.');
  const ids = new Set();
  const cases = input.cases.map(c => {
    if (!object(c) || Object.keys(c).some(k => !['id', 'title', 'basis', 'criticalConditions', 'expected', 'requiredPath', 'stepOrder', 'steps'].includes(k)) || !nonempty(c.id) || !nonempty(c.title) || !nonempty(c.expected)) fail('Each case requires id, title, and expected strings.');
    if (ids.has(c.id)) fail(`Duplicate case id: ${c.id}`);
    ids.add(c.id);
    if (!object(c.basis) || Object.keys(c.basis).some(k => !['kind', 'source', 'text'].includes(k)) || !['explicit', 'interpretation', 'hypothesis'].includes(c.basis.kind) || !nonempty(c.basis.source) || !nonempty(c.basis.text)) fail(`Invalid basis: ${c.id}`);
    if (!Array.isArray(c.criticalConditions) || !c.criticalConditions.every(nonempty)) fail(`Invalid criticalConditions: ${c.id}`);
    if (c.requiredPath !== null && !nonempty(c.requiredPath)) fail(`requiredPath must be null or nonempty text: ${c.id}`);
    if (!['strict', 'adaptive'].includes(c.stepOrder)) fail(`Invalid stepOrder: ${c.id}`);
    if (!Array.isArray(c.steps) || !c.steps.length) fail(`A nonempty steps array is required: ${c.id}`);
    const stepIds = new Set();
    const steps = c.steps.map(step => {
      if (!object(step) || Object.keys(step).some(k => !['id', 'action', 'expected'].includes(k)) || !nonempty(step.id) || !nonempty(step.action) || !nonempty(step.expected)) fail(`Invalid step: ${c.id}`);
      if (stepIds.has(step.id)) fail(`Duplicate step id: ${c.id}/${step.id}`);
      stepIds.add(step.id);
      return { id: step.id, action: step.action, expected: step.expected };
    });
    return { id: c.id, title: c.title, basis: { kind: c.basis.kind, source: c.basis.source, text: c.basis.text }, criticalConditions: [...c.criticalConditions], expected: c.expected, requiredPath: c.requiredPath, stepOrder: c.stepOrder, steps };
  });
  return { schemaVersion: 2, project: input.project, cases };
}
// Read-only, deterministic structural validation shared by imported and AI-authored cases.
export async function validateCases(casesFile) {
  const baseline = normalizeCases(await readJSON(await safePath(casesFile, { existing: true })));
  return { schemaVersion: 2, structurallyValid: true, project: baseline.project, caseCount: baseline.cases.length, stepCount: baseline.cases.reduce((sum, c) => sum + c.steps.length, 0), stepOrderCounts: { strict: baseline.cases.filter(c => c.stepOrder === 'strict').length, adaptive: baseline.cases.filter(c => c.stepOrder === 'adaptive').length } };
}
export async function init(projectDir) {
  const target = await safePath(projectDir, { external: true });
  await fs.mkdir(target, { mode: 0o700 }); // Deliberately non-recursive: existing target is an error.
  await writeNew(path.join(target, 'cases.example.json'), json({ schemaVersion: 2, project: 'Synthetic example', cases: [{ id: 'example-1', title: 'Replace with a user-approved case', basis: { kind: 'hypothesis', source: 'Example only, not an acceptance requirement', text: 'Replace with the actual source and requirement.' }, criticalConditions: [], expected: 'Describe observable behavior.', requiredPath: null, stepOrder: 'strict', steps: [{ id: 'step-1', action: 'Open the synthetic example screen in the approved test environment.', expected: 'The synthetic example screen is visible.' }, { id: 'step-2', action: 'Perform the user-approved example action.', expected: 'The specified observable outcome is visible.' }] }] }));
  return { projectDir: target };
}
export async function start({ projectDir, casesFile, outputDir }) {
  const project = await directory(projectDir);
  const target = await safePath(outputDir, { external: true });
  const baseline = normalizeCases(await readJSON(await safePath(casesFile, { existing: true })));
  const bytes = json(baseline);
  await fs.mkdir(target, { mode: 0o700 });
  await writeNew(path.join(target, 'baseline.json'), bytes);
  await writeNew(path.join(target, 'manifest.json'), json({ schemaVersion: 2, runId: crypto.randomUUID(), projectDir: project, baselineSha256: hash(bytes) }));
  await writeNew(path.join(target, 'results.json'), json({ schemaVersion: 2, cases: baseline.cases.map(c => ({ id: c.id, basis: c.basis, status: 'not_run', observed: '', rationale: '', remainingQuestions: [], evidence: [], cause: 'unknown', attempts: [] })) }));
  await writeNew(path.join(target, 'evidence.json'), json({ schemaVersion: 2, items: [] }));
  await fs.mkdir(path.join(target, 'evidence'), { mode: 0o700 });
  return { runDir: target, cases: baseline.cases.length };
}
async function evidenceFile(runDir, ref) {
  if (!nonempty(ref) || ref.includes('\\') || ref.includes('\0') || ref.includes(':') || path.posix.isAbsolute(ref) || /^[A-Za-z]:/.test(ref) || ref.split('/').some(c => c === '..' || c === '.' || c === '')) fail('Evidence must use relative slash-separated paths without traversal.');
  if (!ref.startsWith('evidence/')) fail('Evidence files must be under the run evidence/ directory.');
  const filename = path.resolve(runDir, ref);
  if (!inside(runDir, filename)) fail('Evidence escapes run directory.');
  await safePath(filename, { existing: true });
  if (!(await fs.lstat(filename)).isFile()) fail(`Evidence is not a regular file: ${ref}`);
}
async function validateRecord(runDir, record, label, catalog) {
  if (!object(record) || !statuses.has(record.status) || typeof record.observed !== 'string' || typeof record.rationale !== 'string' || !Array.isArray(record.remainingQuestions) || !record.remainingQuestions.every(nonempty) || !Array.isArray(record.evidence)) fail(`Invalid result record: ${label}`);
  if (record.cause !== undefined && !causes.has(record.cause)) fail(`Invalid cause: ${label}`);
  if (['pass', 'fail'].includes(record.status) && (!record.observed.trim() || !record.rationale.trim() || !record.evidence.length)) fail(`Pass/fail requires rationale and evidence plus observed behavior: ${label}`);
  if (['inconclusive', 'blocked'].includes(record.status) && !record.rationale.trim()) fail(`Inconclusive/blocked requires rationale: ${label}`);
  for (const ref of record.evidence) {
    await evidenceFile(runDir, ref);
    if (!catalog.has(ref)) fail(`Evidence reference missing from catalog: ${ref}`);
  }
}
export async function check(runDir) {
  const root = await directory(runDir);
  const manifest = await readJSON(path.join(root, 'manifest.json'));
  if (!object(manifest) || Object.keys(manifest).some(k => !['schemaVersion', 'runId', 'projectDir', 'baselineSha256'].includes(k)) || !nonempty(manifest.projectDir) || !path.isAbsolute(manifest.projectDir) || manifest.schemaVersion !== 2 || !nonempty(manifest.runId) || !/^[a-f0-9]{64}$/.test(manifest.baselineSha256)) fail('Invalid manifest.');
  const baselinePath = path.join(root, 'baseline.json');
  const original = await readJSON(baselinePath);
  if (hash(await fs.readFile(baselinePath)) !== manifest.baselineSha256) fail('Baseline hash mismatch. This integrity check is not tamper-proof.');
  const baseline = normalizeCases(original);
  const evidenceCatalog = await readJSON(path.join(root, 'evidence.json'));
  if (!object(evidenceCatalog) || evidenceCatalog.schemaVersion !== 2 || !Array.isArray(evidenceCatalog.items) || Object.keys(evidenceCatalog).some(k => !['schemaVersion', 'items'].includes(k))) fail('Invalid evidence catalog.');
  const catalog = new Map();
  const evidenceIds = new Set();
  for (const item of evidenceCatalog.items) {
    if (!object(item) || Object.keys(item).some(k => !['id', 'path', 'kind', 'capturedAt', 'source', 'description'].includes(k)) || !nonempty(item.id) || !nonempty(item.path) || !['screenshot', 'dom', 'tool_receipt', 'log', 'other'].includes(item.kind) || !nonempty(item.source) || !nonempty(item.description) || typeof item.capturedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(item.capturedAt) || !Number.isFinite(Date.parse(item.capturedAt)) || new Date(item.capturedAt).toISOString() !== item.capturedAt.replace(/Z$/, item.capturedAt.includes('.') ? 'Z' : '.000Z')) fail('Invalid evidence catalog item.');
    if (evidenceIds.has(item.id) || catalog.has(item.path)) fail('Duplicate evidence id or path.');
    await evidenceFile(root, item.path);
    evidenceIds.add(item.id); catalog.set(item.path, item);
  }
  const results = await readJSON(path.join(root, 'results.json'));
  if (!object(results) || Object.keys(results).some(k => !['schemaVersion', 'cases'].includes(k)) || results.schemaVersion !== 2 || !Array.isArray(results.cases)) fail('Invalid results schema.');
  const byId = new Map(baseline.cases.map(c => [c.id, c]));
  const seen = new Set();
  for (const record of results.cases) {
    if (!object(record) || !byId.has(record.id)) fail('Unknown case id in results.');
    if (Object.keys(record).some(key => !['id', 'basis', 'status', 'observed', 'rationale', 'remainingQuestions', 'evidence', 'cause', 'attempts'].includes(key))) fail(`Unexpected result key: ${record.id}`);
    if (seen.has(record.id)) fail(`Duplicate result id: ${record.id}`);
    seen.add(record.id);
    const basis = record.basis;
    const expected = byId.get(record.id).basis;
    if (!object(basis) || Object.keys(basis).length !== 3 || ['kind', 'source', 'text'].some(key => basis[key] !== expected[key])) fail(`Basis changed: ${record.id}`);
    await validateRecord(root, record, record.id, catalog);
    if (record.attempts !== undefined) {
      if (!Array.isArray(record.attempts)) fail(`Invalid attempts: ${record.id}`);
      for (const [index, attempt] of record.attempts.entries()) {
        if (!object(attempt) || Object.keys(attempt).some(key => !['status', 'observed', 'rationale', 'remainingQuestions', 'evidence', 'cause'].includes(key))) fail(`Unexpected attempt key: ${record.id}`);
        await validateRecord(root, attempt, `${record.id} attempt ${index + 1}`, catalog);
      }
    }
  }
  if (seen.size !== byId.size) fail('Missing original cases in results. Keep unexecuted cases as not_run.');
  const ordered = baseline.cases.map(c => ({ ...c, ...results.cases.find(r => r.id === c.id) }));
  const counts = Object.fromEntries([...statuses].map(s => [s, ordered.filter(c => c.status === s).length]));
  return { schemaVersion: 2, runId: manifest.runId, project: baseline.project, structurallyValid: true, hasUnexecutedCases: ordered.some(c => c.status === 'not_run'), counts, recordedExplicitOutcomes: { pass: ordered.filter(c => c.basis.kind === 'explicit' && c.status === 'pass').length, fail: ordered.filter(c => c.basis.kind === 'explicit' && c.status === 'fail').length }, caveat: 'Structural validation only. Recorded verdicts are supplied by the operator, not proven by this tool. Interpretation/hypothesis outcomes are not confirmed acceptance results. Evidence timestamps, sources, and descriptions are operator supplied, not authenticated. Baseline hashing is not tamper-proof. Helpers are not a security boundary for actions bypassing them.', evidenceCatalog, cases: ordered };
}
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\`*_{}\[\]()#+.!|~-]/g, '\\$&').replace(/\r?\n/g, '  \n');
export function markdown(report) {
  return `# Local evidence report\n\n${escape(report.project)}\n\n${report.caveat}\n\nUnexecuted cases remain: ${report.hasUnexecutedCases}\n\nRecorded explicit outcomes (operator supplied): ${report.recordedExplicitOutcomes.pass} pass, ${report.recordedExplicitOutcomes.fail} fail.\n\n` + report.cases.map(c => `## ${escape(c.id)}: ${escape(c.title)}\n\nBasis: ${c.basis.kind}${c.basis.kind === 'explicit' ? '' : ' (NOT confirmed acceptance)'}\n\nSource: ${escape(c.basis.source)}\n\nRequirement: ${escape(c.basis.text)}\n\nExpected: ${escape(c.expected)}\n\nCritical conditions: ${escape(c.criticalConditions.join('; ') || '(none supplied)')}\n\nRequired path: ${escape(c.requiredPath ?? '(none supplied)')}\n\nStep order: ${c.stepOrder} (${c.stepOrder === 'strict' ? 'preserve the business-step sequence' : 'UI route/order may adapt only within intent and preconditions; do not skip steps'})\n\nPlanned steps (frozen baseline, not execution proof):\n\n${c.steps.map((step, index) => `${index + 1}. ${escape(step.id)}: ${escape(step.action)}\n   Expected: ${escape(step.expected)}\n`).join('')}\nRecorded status: ${c.status}\n\nObserved: ${escape(c.observed)}\n\nRationale: ${escape(c.rationale)}\n\nRemaining questions: ${c.remainingQuestions.map(escape).join('; ') || '(none supplied)'}\n\nCause: ${c.cause ?? 'unknown'}\n\nEvidence references (not automatically opened): ${c.evidence.map(escape).join(', ') || '(none)'}\n\nOriginal attempts supplied: ${(c.attempts ?? []).length}\n\n${(c.attempts ?? []).map((a, i) => `Attempt ${i + 1}: ${a.status}; cause: ${a.cause ?? 'unknown'}\n\nObserved: ${escape(a.observed)}\n\nRationale: ${escape(a.rationale)}\n\nRemaining questions: ${a.remainingQuestions.map(escape).join('; ') || '(none supplied)'}\n\nEvidence: ${a.evidence.map(escape).join(', ') || '(none)'}\n\n`).join('')}`).join('') + `## Evidence catalog (operator-supplied metadata)\n\n` + report.evidenceCatalog.items.map(item => `- ${escape(item.id)}: ${escape(item.path)}\n  Kind: ${item.kind}; captured at: ${escape(item.capturedAt)}\n  Source: ${escape(item.source)}\n  Description: ${escape(item.description)}\n\n`).join('');
}
export async function report(runDir) {
  const result = await check(runDir);
  const root = path.resolve(runDir);
  const jsonPayload = json(result);
  const markdownPayload = markdown(result);
  for (const name of ['report.json', 'report.md']) {
    try { await fs.lstat(path.join(root, name)); fail(`Refusing to overwrite ${name}.`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await writeNew(path.join(root, 'report.json'), jsonPayload);
  await writeNew(path.join(root, 'report.md'), markdownPayload);
  return { reportJson: path.join(root, 'report.json'), reportMarkdown: path.join(root, 'report.md') };
}
export async function main(argv) {
  const [command, ...rest] = argv;
  if (command === '--help' || command === 'help' || !command) return 'Usage: node scripts/ego.mjs init --project-dir ABS\n       node scripts/ego.mjs validate-cases --cases ABS\n       node scripts/ego.mjs start --project-dir ABS --cases ABS --output-dir ABS\n       node scripts/ego.mjs check --run-dir ABS\n       node scripts/ego.mjs report --run-dir ABS\nvalidate-cases reads schemaVersion 2 cases and prints a structural summary without writing files.\nAll record directories must be outside the source repository. New output targets must not already exist. No network/model/browser actions.';
  const allowed = { init: ['project-dir'], 'validate-cases': ['cases'], start: ['project-dir', 'cases', 'output-dir'], check: ['run-dir'], report: ['run-dir'] }[command];
  if (!allowed) fail('Unknown command. Use --help.');
  const flags = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i].slice(2);
    if (!rest[i].startsWith('--') || !allowed.includes(key) || flags[key] !== undefined || !rest[i + 1] || rest[i + 1].startsWith('--')) fail('Unknown, duplicate, or incomplete option.');
    flags[key] = rest[i + 1];
  }
  if (allowed.some(key => !flags[key])) fail('Missing required option. Use --help.');
  if (command === 'validate-cases') return validateCases(flags.cases);
  if (command === 'init') return init(flags['project-dir']);
  if (command === 'start') return start({ projectDir: flags['project-dir'], casesFile: flags.cases, outputDir: flags['output-dir'] });
  if (command === 'check') return check(flags['run-dir']);
  return report(flags['run-dir']);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(result => process.stdout.write(typeof result === 'string' ? result + '\n' : json(result))).catch(error => { process.stderr.write(`Error: ${error.message}\n`); process.exitCode = 1; });
}
