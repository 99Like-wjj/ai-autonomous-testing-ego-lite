#!/usr/bin/env node
import {readPresentation} from '../report/presentation.mjs';
import {saveCases} from '../core/case-versions.mjs';
import {reviewCases} from '../core/case-review.mjs';
import {renderCases,verifyCaseDocuments} from '../report/case-documents.mjs';
import {exportReviewFeedback,readFeedbackInput} from '../report/review-export.mjs';
import {startReviewSession} from '../report/review-session.mjs';
import {inspectFile} from '../files/inspect.mjs';
import { readSourceRun, sourceContext } from '../regression/sources.mjs';
import { selectRegression } from '../regression/selection.mjs';
import { compareRuns, writeComparison } from '../regression/compare.mjs';
/** Local deterministic transactions only. The host AI owns browser actions and verdicts. */
import path from 'node:path';
import { realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { toolInfo } from './toolchain.mjs';
import { errorInfo, fail, hash, json, readJSON, safePath, writeNew } from '../core/common.mjs';
import { validateCases, init, start } from '../core/cases.mjs';
import { check, recordResult, registerEvidence, progress } from '../core/records.mjs';
import { report, verifyReport } from '../report/delivery.mjs';
import { readExecutionQuery, executeRequest } from '../execution/commands.mjs';
import { sealPacket } from '../execution/packets.mjs';
import { requestKinds, parseRequest } from '../execution/parse.mjs';
import { cliParallelLimit } from '../execution/config.mjs';
import { startNetwork, statusNetwork, stopNetwork, queryNetwork } from '../observation/commands.mjs';
import { exportNetworkEvidence } from '../observation/evidence-export.mjs';
import { boundedJSON } from '../observation/store.mjs';
import { codeOf, NetworkError } from '../observation/model.mjs';
export { SOURCE_ROOT, safePath } from '../core/common.mjs';
export { normalizeCases, validateCases, init, start } from '../core/cases.mjs';
export { check, recordResult, registerEvidence, progress } from '../core/records.mjs';
export { report, verifyReport } from '../report/delivery.mjs';
export { markdown, htmlReport } from '../report/render.mjs';
export { readExecutionView, readExecutionQuery, executeRequest } from '../execution/commands.mjs';
export { sealPacket } from '../execution/packets.mjs';

interface Responses {
  regression: unknown;
  cases: unknown;
  files: unknown;
  'tool-info': Omit<Awaited<ReturnType<typeof toolInfo>>, 'files'>;
  'validate-cases': Awaited<ReturnType<typeof validateCases>>;
  init: Awaited<ReturnType<typeof init>>; start: Awaited<ReturnType<typeof start>>;
  'evidence-add': Awaited<ReturnType<typeof registerEvidence>>; record: Awaited<ReturnType<typeof recordResult>>;
  progress: Awaited<ReturnType<typeof progress>>; check: Awaited<ReturnType<typeof check>>;
  report: Awaited<ReturnType<typeof report>>; 'verify-report': Awaited<ReturnType<typeof verifyReport>>;
  execution: Awaited<ReturnType<typeof readExecutionQuery>> | Awaited<ReturnType<typeof executeRequest>>;
  'packet-seal': Awaited<ReturnType<typeof sealPacket>>;
  network: Awaited<ReturnType<typeof startNetwork>> | Awaited<ReturnType<typeof statusNetwork>> | Awaited<ReturnType<typeof stopNetwork>> | Awaited<ReturnType<typeof queryNetwork>>;
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
       node ABS_TOOL_ROOT/scripts/ego.mjs cases save --work-dir ABS --request ABS_JSON
       node ABS_TOOL_ROOT/scripts/ego.mjs cases render --cases ABS --output-dir ABS [--feedback ABS_JSON_OR_HTML] [--presentation ABS_JSON] [--ai-context ABS_JSON]
       node ABS_TOOL_ROOT/scripts/ego.mjs cases verify --cases ABS --output-dir ABS
       node ABS_TOOL_ROOT/scripts/ego.mjs cases review --cases ABS --request ABS_JSON
       node ABS_TOOL_ROOT/scripts/ego.mjs cases serve --cases ABS --output-dir ABS [--feedback ABS_JSON_OR_HTML] [--presentation ABS_JSON] [--ai-context ABS_JSON] [--idle-minutes N]
       node ABS_TOOL_ROOT/scripts/ego.mjs cases export-review --cases ABS --request ABS_JSON_OR_HTML --output-dir ABS
       node ABS_TOOL_ROOT/scripts/ego.mjs files inspect --request ABS_JSON --output-file ABS_NEW_JSON
       node ABS_TOOL_ROOT/scripts/ego.mjs validate-cases --cases ABS
       node ABS_TOOL_ROOT/scripts/ego.mjs start --project-dir ABS --cases ABS --output-dir ABS [--execution-config ABS_JSON] [--max-parallel-cases N] --binding ABS_JSON
       node ABS_TOOL_ROOT/scripts/ego.mjs evidence-add --run-dir ABS --request ABS_JSON
       node ABS_TOOL_ROOT/scripts/ego.mjs record --run-dir ABS --request ABS_JSON
       node ABS_TOOL_ROOT/scripts/ego.mjs progress --run-dir ABS
       node ABS_TOOL_ROOT/scripts/ego.mjs check --run-dir ABS
       node ABS_TOOL_ROOT/scripts/ego.mjs report --run-dir ABS [--output-dir ABS_EXISTING_DIR] [--context ABS_JSON] [--presentation ABS_JSON] [--history-locations ABS_MAP_JSON] [--delivery auto|inline|bundle] [--allow-missing-screenshots true|false]
       node ABS_TOOL_ROOT/scripts/ego.mjs verify-report --run-dir ABS --report-dir ABS
       node ABS_TOOL_ROOT/scripts/ego.mjs execution read --run-dir ABS [--view summary|assignment|full] [--assignment-id ID] [--integrity metadata|full]
       node ABS_TOOL_ROOT/scripts/ego.mjs execution ACTION --run-dir ABS --request ABS_JSON
       node ABS_TOOL_ROOT/scripts/ego.mjs packet-seal --run-dir ABS --assignment-id ID --draft ABS_JSON
       node ABS_TOOL_ROOT/scripts/ego.mjs network start --run-dir ABS --config ABS_JSON
       node ABS_TOOL_ROOT/scripts/ego.mjs network status --run-dir ABS [--capture-id ID]
       node ABS_TOOL_ROOT/scripts/ego.mjs network query --run-dir ABS --request ABS_JSON [--output-file ABS_NEW_JSON]
       node ABS_TOOL_ROOT/scripts/ego.mjs network export --run-dir ABS --request ABS_JSON --output-file ABS_NEW_JSON
       node ABS_TOOL_ROOT/scripts/ego.mjs network stop --run-dir ABS [--capture-id ID]
       node ABS_TOOL_ROOT/scripts/ego.mjs regression context --run-dir ABS [--results-revision N] [--output-file ABS_NEW_JSON]
       node ABS_TOOL_ROOT/scripts/ego.mjs regression select --request ABS_JSON [--output-file ABS_NEW_JSON]
       node ABS_TOOL_ROOT/scripts/ego.mjs regression compare --request ABS_JSON [--output-dir ABS_NEW_DIRECTORY]
Regression contracts use regressionVersion 2. Cases retain stable goal pointIds in whole-file versions. start requires a frozen selection, actual case review and current declarations. History never becomes current evidence or authorization.
cases serve opens only a capability-scoped 127.0.0.1 listener. Native review saves create verified HTML/JSON files in the named output directory; they do not register approval or start testing. The default idle lifetime is 480 minutes. Treat its URL as private.
cases export-review reads feedback as data and writes new native files without changing the source or Windows security settings. Browser-managed backup downloads can still carry source-zone metadata.
Execution ACTION: inventory, capacity, reserve, attach-space, note, set-limit, reconcile, import.
execution read defaults to a bounded metadata summary; assignment requires --assignment-id. Use --integrity full for a strictly checked compact view. --view full keeps the previous complete output and requires full checks. Metadata reads do not recover evidence or recheck historical files.
max-parallel-cases is a positive safe integer; no fixed product ceiling. Host limits are used only when explicitly supplied, never probed or globally configured.
All current data contracts use v9. Older formats are explicitly rejected; existing data is never migrated or overwritten.
record commits observations and explicit business-goal assessments through the same transaction as reviewed packet imports.
Missing assessments are recording gaps, not inconclusive verdicts. Cases group goals and have no separate business verdict.
packet-seal writes an immutable worker-local packet; it does not commit a verdict. Coordinator import requires an explicit AI review.
report writes report.json, report.md, and a standalone offline report.html; it refuses to overwrite them. Invalid run data or registered evidence stops report generation.
Generation and verify-report read back all three files; browserOpen stays not_checked. Retrospective context preserves original recorded outcomes and separate AI reviews.
network start/stop manage a scoped native-only Ego observation context. Queries read committed local evidence and make no business requests or verdicts.
Network format is independently versioned (networkVersion 1). Old experimental protocol summaries are not read or migrated.
No model calls, automatic UI actions, request replay or automatic business verdicts.`;
  if(command==='cases'){
    const [action,...args]=rest;if(!action||!['save','render','verify','review','serve','export-review'].includes(action))fail('Unknown cases action.');
    const allowed=action==='save'?['work-dir','request']:action==='review'?['cases','request']:action==='export-review'?['cases','request','output-dir','presentation']:action==='serve'?['cases','output-dir','feedback','idle-minutes','presentation','ai-context']:action==='render'?['cases','output-dir','feedback','presentation','ai-context']:['cases','output-dir'];
    const required=action==='save'?['work-dir','request']:action==='review'?['cases','request']:action==='export-review'?['cases','request','output-dir']:['cases','output-dir'];
    const flags=parseFlags(args,allowed,required);await toolInfo();
    if(action==='save')return saveCases({workDir:flags['work-dir'],request:await readJSON(await safePath(flags.request,{existing:true}))});
    if(action==='review')return reviewCases({casesFile:flags.cases,request:await readJSON(await safePath(flags.request,{existing:true}))});
    if(action==='render')return renderCases({casesFile:flags.cases,outputDir:flags['output-dir'],feedbackFile:flags.feedback,presentationFile:flags.presentation,aiContextFile:flags['ai-context']});
    if(action==='export-review')return exportReviewFeedback({casesFile:flags.cases,request:await readFeedbackInput(flags.request),outputDir:flags['output-dir'],...(flags.presentation?{presentation:await readPresentation(flags.presentation)}:{})});
    if(action==='serve'){
      if(flags['idle-minutes']&&!/^[1-9]\d*$/.test(flags['idle-minutes']))fail('Idle minutes must be a positive integer.');
      const session=await startReviewSession({casesFile:flags.cases,outputDir:flags['output-dir'],feedbackFile:flags.feedback,presentationFile:flags.presentation,aiContextFile:flags['ai-context'],...(flags['idle-minutes']?{idleMinutes:Number(flags['idle-minutes'])}:{})});return session.info;
    }
    return verifyCaseDocuments({casesFile:flags.cases,outputDir:flags['output-dir']});
  }
  if(command==='files'){const [action,...args]=rest;if(action!=='inspect')fail('Unknown files action.');const flags=parseFlags(args,['request','output-file'],['request','output-file']);await toolInfo();return inspectFile({request:await readJSON(await safePath(flags.request,{existing:true})),outputFile:flags['output-file']});}
  if(command==='regression'){
    const [action,...args]=rest;if(!action||!['context','select','compare'].includes(action))fail('Unknown regression action; definitions now use cases save/review.');
    const flags=parseFlags(args,action==='context'?['run-dir','results-revision','output-file']:action==='compare'?['request','output-dir']:['request','output-file'],action==='context'?['run-dir']:['request']);await toolInfo();let result:unknown;
    if(action==='context'){if(flags['results-revision']&&!/^\d+$/.test(flags['results-revision']))fail('Invalid results revision.');result=sourceContext(await readSourceRun(flags['run-dir'],flags['results-revision']===undefined?{}:{resultsRevision:Number(flags['results-revision'])}));}
    else if(action==='select')result=await selectRegression({request:await readJSON(await safePath(flags.request,{existing:true}))});
    else{const comparison=await compareRuns({request:await readJSON(await safePath(flags.request,{existing:true}))});result=flags['output-dir']?await writeComparison({outputDir:flags['output-dir'],comparison}):comparison;}
    if(flags['output-file']){const outputFile=await safePath(flags['output-file'],{external:true}),bytes=json(result);await writeNew(outputFile,bytes);return{outputFile,sha256:hash(bytes),regressionVersion:2,businessExecuted:false};}return result;
  }
  if (command === 'network') {
    const [action, ...options] = rest;
    if (!action || !['start', 'status', 'query', 'export', 'stop'].includes(action)) fail('Unknown network action.');
    const allowed = action === 'start' ? ['run-dir', 'config'] : action === 'export' ? ['run-dir','request','output-file'] : action === 'query' ? ['run-dir', 'request', 'output-file'] : ['run-dir', 'capture-id'];
    const flags = parseFlags(options, allowed, action === 'start' ? ['run-dir', 'config'] : action === 'export' ? ['run-dir','request','output-file'] : action === 'query' ? ['run-dir', 'request'] : ['run-dir']);
    try {
    await toolInfo();
    if (action === 'export') return exportNetworkEvidence({ runDir: flags['run-dir'], request: await boundedJSON(await safePath(flags.request, { existing: true })), outputFile: flags['output-file']! });
    if (action === 'status') return await statusNetwork(flags['run-dir'], flags['capture-id']);
    if (action === 'stop') return await stopNetwork({ runDir: flags['run-dir'], ...(flags['capture-id'] ? { captureId: flags['capture-id'] } : {}) });
    if (action === 'query') return await queryNetwork({ runDir: flags['run-dir'], request: await boundedJSON(await safePath(flags.request, { existing: true })), ...(flags['output-file'] ? { outputFile: flags['output-file'] } : {}) });
    return await startNetwork({ runDir: flags['run-dir'], config: await boundedJSON(await safePath(flags.config, { existing: true })) });
    } catch (error) { throw new NetworkError(codeOf(error)); }
  }
  if (command === 'packet-seal') {
    const flags = parseFlags(rest, ['run-dir', 'assignment-id', 'draft'], ['run-dir', 'assignment-id', 'draft']); await toolInfo();
    return sealPacket({ runDir: flags['run-dir'], assignment: flags['assignment-id'] ?? '', draftFile: flags.draft ?? '' });
  }
  if (command === 'execution') {
    const [action, ...options] = rest;
    if (!action || (action !== 'read' && !requestKinds.some(kind => kind === action))) fail('Unknown execution action.');
    const flags = parseFlags(options, action === 'read' ? ['run-dir', 'view', 'assignment-id', 'integrity'] : ['run-dir', 'request'], action === 'read' ? ['run-dir'] : ['run-dir', 'request']); await toolInfo();
    if (action === 'read') return readExecutionQuery(flags['run-dir'], flags.view, flags['assignment-id'], flags.integrity);
    const request = await readJSON(await safePath(flags.request, { existing: true }));
    if (parseRequest(request).kind !== action) fail('Execution action and request kind disagree.');
    return executeRequest({ runDir: flags['run-dir'], request });
  }
  const options: Record<string, readonly string[]> = { 'tool-info': ['expect-version', 'expect-revision'], init: ['project-dir'], 'validate-cases': ['cases'], start: ['project-dir', 'cases', 'output-dir', 'execution-config', 'max-parallel-cases', 'binding'], 'evidence-add': ['run-dir', 'request'], record: ['run-dir', 'request'], progress: ['run-dir'], check: ['run-dir'], report: ['run-dir', 'output-dir', 'presentation', 'context', 'history-locations', 'delivery', 'allow-missing-screenshots'], 'verify-report': ['run-dir', 'report-dir'] };
  const allowed = options[command];
  if (!allowed) fail('Unknown command. Use --help.');
  const required = command === 'tool-info' ? [] : command === 'report' ? ['run-dir'] : command === 'start' ? ['project-dir', 'cases', 'output-dir', 'binding'] : allowed;
  const flags = parseFlags(rest, allowed, required);
  const info = await toolInfo();
  if (command === 'tool-info') {
    if ((flags['expect-version'] && flags['expect-version'] !== info.version) || (flags['expect-revision'] && flags['expect-revision'] !== info.toolRevision)) fail('Requested Skill/tool version or revision mismatch.');
    const { files: _files, ...identity } = info; return identity;
  }
  if (command === 'validate-cases') return validateCases(flags.cases);
  if (command === 'init') return init(flags['project-dir']);
  if (command === 'start') return start({ projectDir: flags['project-dir'], casesFile: flags.cases, outputDir: flags['output-dir'], configFile: flags['execution-config'], bindingFile: flags.binding, maxParallelCases: flags['max-parallel-cases'] === undefined ? undefined : cliParallelLimit(flags['max-parallel-cases']) });
  if (command === 'evidence-add') return registerEvidence({ runDir: flags['run-dir'], request: await readJSON(await safePath(flags.request, { existing: true })) });
  if (command === 'record') return recordResult({ runDir: flags['run-dir'], request: await readJSON(await safePath(flags.request, { existing: true })) });
  if (command === 'progress') return progress(flags['run-dir']);
  if (command === 'check') return check(flags['run-dir']);
  if (command === 'verify-report') return verifyReport(flags['run-dir'], flags['report-dir']);
  return report(flags['run-dir'], { outputDir: flags['output-dir'] ?? flags['run-dir'], contextFile: flags.context, presentationFile:flags.presentation, ...(flags['history-locations']?{historyLocationsFile:flags['history-locations']}:{}) , deliveryMode: flags.delivery === undefined ? 'auto' : flags.delivery === 'auto' || flags.delivery === 'inline' || flags.delivery === 'bundle' ? flags.delivery : fail('Invalid delivery mode.'), allowMissingScreenshots: flags['allow-missing-screenshots'] === undefined ? false : flags['allow-missing-screenshots'] === 'true' ? true : flags['allow-missing-screenshots'] === 'false' ? false : fail('Invalid missing-screenshots flag.') });
}
// A linked Skill path and Node's resolved module URL can name the same entrypoint.
// Resolve only the executable identity; run/evidence path guards remain unchanged.
const invokedPath = process.argv[1] ? await realpath(path.resolve(process.argv[1])).catch(caught => {
  // With node -e, argv[1] may be an ordinary argument rather than a script filename.
  if (['ENOENT', 'ENOTDIR'].includes(errorInfo(caught).code ?? '')) return undefined;
  throw caught;
}) : undefined;
if (invokedPath && invokedPath === await realpath(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then(result => process.stdout.write(typeof result === 'string' ? result + '\n' : json(result))).catch(caught => { process.stderr.write('Error: ' + errorInfo(caught).message + '\n'); process.exitCode = 1; });
}
