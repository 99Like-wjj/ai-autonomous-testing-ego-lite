#!/usr/bin/env node
/** Local deterministic transactions only. The host AI owns browser actions and verdicts. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolInfo } from './toolchain.mjs';
import { errorInfo, fail, json, readJSON, safePath } from '../core/common.mjs';
import { validateCases, init, start } from '../core/cases.mjs';
import { check, recordResult, registerEvidence, progress } from '../core/records.mjs';
import { report, verifyReport } from '../report/delivery.mjs';
export { SOURCE_ROOT, safePath } from '../core/common.mjs';
export { normalizeCases, validateCases, init, start } from '../core/cases.mjs';
export { check, recordResult, registerEvidence, progress } from '../core/records.mjs';
export { report, verifyReport } from '../report/delivery.mjs';
export { markdown, htmlReport } from '../report/render.mjs';

interface Responses {
  'tool-info': Omit<Awaited<ReturnType<typeof toolInfo>>, 'files'>;
  'validate-cases': Awaited<ReturnType<typeof validateCases>>;
  init: Awaited<ReturnType<typeof init>>; start: Awaited<ReturnType<typeof start>>;
  'evidence-add': Awaited<ReturnType<typeof registerEvidence>>; record: Awaited<ReturnType<typeof recordResult>>;
  progress: Awaited<ReturnType<typeof progress>>; check: Awaited<ReturnType<typeof check>>;
  report: Awaited<ReturnType<typeof report>>; 'verify-report': Awaited<ReturnType<typeof verifyReport>>;
}
export function parseFlags(args: readonly string[], allowed: readonly string[], required: readonly string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const arg = args[i], value = args[i + 1], key = arg?.slice(2);
    if (!arg || !arg.startsWith('--') || !key || !allowed.includes(key) || Object.hasOwn(flags, key) || !value || value.startsWith('--')) fail('Unknown, duplicate, or incomplete option.');
    flags[key] = value;
  }
  if (required.some(key => !flags[key])) fail('Missing required option. Use --help.');
  return flags;
}
export async function main<C extends keyof Responses>(argv: readonly [C, ...string[]]): Promise<Responses[C]>;
export async function main(argv: readonly string[]): Promise<unknown>;
export async function main(argv: readonly string[]): Promise<unknown> {
  const [command, ...rest] = argv;
  if (command === '--help' || command === 'help' || !command) return `Usage: node ABS_TOOL_ROOT/scripts/ego.mjs tool-info [--expect-version VERSION] [--expect-revision REVISION]
       node ABS_TOOL_ROOT/scripts/ego.mjs init --project-dir ABS
       node ABS_TOOL_ROOT/scripts/ego.mjs validate-cases --cases ABS
       node ABS_TOOL_ROOT/scripts/ego.mjs start --project-dir ABS --cases ABS --output-dir ABS
       node ABS_TOOL_ROOT/scripts/ego.mjs evidence-add --run-dir ABS --request ABS_JSON
       node ABS_TOOL_ROOT/scripts/ego.mjs record --run-dir ABS --request ABS_JSON
       node ABS_TOOL_ROOT/scripts/ego.mjs progress --run-dir ABS
       node ABS_TOOL_ROOT/scripts/ego.mjs check --run-dir ABS
       node ABS_TOOL_ROOT/scripts/ego.mjs report --run-dir ABS [--output-dir ABS_EXISTING_DIR] [--context ABS_JSON]
       node ABS_TOOL_ROOT/scripts/ego.mjs verify-report --run-dir ABS --report-dir ABS
report writes report.json, report.md, and a standalone offline report.html; it refuses to overwrite them. Invalid run data or registered evidence stops report generation.
Generation and verify-report read back all three files; browserOpen stays not_checked. Retrospective context preserves original recorded outcomes and separate AI reviews.
No network, model, browser, or Ego actions.`;
  const options: Record<string, readonly string[]> = { 'tool-info': ['expect-version', 'expect-revision'], init: ['project-dir'], 'validate-cases': ['cases'], start: ['project-dir', 'cases', 'output-dir'], 'evidence-add': ['run-dir', 'request'], record: ['run-dir', 'request'], progress: ['run-dir'], check: ['run-dir'], report: ['run-dir', 'output-dir', 'context'], 'verify-report': ['run-dir', 'report-dir'] };
  const allowed = options[command];
  if (!allowed) fail('Unknown command. Use --help.');
  const required = command === 'tool-info' ? [] : command === 'report' ? ['run-dir'] : allowed;
  const flags = parseFlags(rest, allowed, required);
  const info = await toolInfo();
  if (command === 'tool-info') {
    if ((flags['expect-version'] && flags['expect-version'] !== info.version) || (flags['expect-revision'] && flags['expect-revision'] !== info.toolRevision)) fail('Requested Skill/tool version or revision mismatch.');
    const { files: _files, ...identity } = info; return identity;
  }
  if (command === 'validate-cases') return validateCases(flags.cases);
  if (command === 'init') return init(flags['project-dir']);
  if (command === 'start') return start({ projectDir: flags['project-dir'], casesFile: flags.cases, outputDir: flags['output-dir'] });
  if (command === 'evidence-add') return registerEvidence({ runDir: flags['run-dir'], request: await readJSON(await safePath(flags.request, { existing: true })) });
  if (command === 'record') return recordResult({ runDir: flags['run-dir'], request: await readJSON(await safePath(flags.request, { existing: true })) });
  if (command === 'progress') return progress(flags['run-dir']);
  if (command === 'check') return check(flags['run-dir']);
  if (command === 'verify-report') return verifyReport(flags['run-dir'], flags['report-dir']);
  return report(flags['run-dir'], { outputDir: flags['output-dir'] ?? flags['run-dir'], contextFile: flags.context });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(result => process.stdout.write(typeof result === 'string' ? result + '\n' : json(result))).catch(caught => { process.stderr.write('Error: ' + errorInfo(caught).message + '\n'); process.exitCode = 1; });
}
