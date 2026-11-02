/** Exact, read-only run snapshots; case definitions and observed facts remain separate. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {assertClosed,canonicalHash,fail,hash,object,readJSON,withRunLock} from '../core/common.mjs';
import {projectActionAttempts,recordEvidenceIds} from '../core/action-events.mjs';
import {evidenceFile,hashFile} from '../core/file-integrity.mjs';
import {parseCatalog,parseManifest,parseResults,integer,arrayValue} from '../core/validation.mjs';
import {readAndValidateBaseline} from '../core/baseline.mjs';
import {checkUnlocked,markerExists,validateResultEntries,countsFor} from '../core/records.mjs';
import {readRunBinding} from './run-binding.mjs';
import type {EvidenceItem,Report,Assessment,Baseline,Case} from '../contracts/model.mjs';
import {goalRequiredRefs} from '../contracts/targets.mjs';
import type {SourceRun,RunRef} from './model.mjs';
export async function readSourceRun(runDir: unknown, options: { resultsRevision?: number } = {}): Promise<SourceRun> {
  return withRunLock(runDir, async root => {
    // Unlike check(), source inspection does not repair or clean historical files.
    const manifest = parseManifest(await readJSON(path.join(root, 'manifest.json')));
    if (!path.isAbsolute(manifest.projectDir)) fail('Manifest project directory must be absolute.');
    const { baseline } = await readAndValidateBaseline(root, manifest);
    if (options.resultsRevision === undefined) {
      if (await markerExists(root)) fail('Historical source has an unfinished evidence transaction; source inspection cannot recover it.');
      const checked = await checkUnlocked(root), results = parseResults(await readJSON(path.join(root, 'results.json')));
      return { runDir: root, manifest, baseline, results, checked, baselineSha256: manifest.baselineSha256, resultsSha256: canonicalHash(results),
        evidenceScope: { kind: 'complete_current_catalog', catalogRevision: checked.evidenceRevision, note: 'Current run ledger and retained evidence catalog were checked in full.' } };
    }
    const revision = integer(options.resultsRevision, 'source results revision'), raw = await readJSON(path.join(root, 'results.json'));
    assertClosed(raw, ['schemaVersion', 'revision', 'entries'], 'source results');
    if (raw.schemaVersion !== 9) fail('Historical results require schemaVersion 9; files are not migrated.');
    if (revision > integer(raw.revision, 'source current revision')) fail('Requested source results revision does not exist.');
    const results = parseResults({ schemaVersion: 9, revision, entries: arrayValue(raw.entries, 'source result entries').slice(0, revision) });
    const evidenceIds = new Set(results.entries.flatMap(entry => recordEvidenceIds(entry.record)));
    const rawCatalog = await readJSON(path.join(root, 'evidence.json'));
    assertClosed(rawCatalog, ['schemaVersion', 'revision', 'items', 'operations'], 'source evidence catalog');
    if (rawCatalog.schemaVersion !== 9) fail('Historical evidence requires schemaVersion 9.');
    const rawItems=arrayValue(rawCatalog.items,'source evidence items');
    let expanded=true;while(expanded){expanded=false;for(const raw of rawItems)if(object(raw)&&typeof raw.id==='string'&&evidenceIds.has(raw.id)&&object(raw.metadata)&&Array.isArray(raw.metadata.contextEvidenceIds))for(const id of raw.metadata.contextEvidenceIds)if(typeof id==='string'&&!evidenceIds.has(id)){evidenceIds.add(id);expanded=true;}}
    const evidenceCatalog = parseCatalog({ schemaVersion: 9, revision: integer(rawCatalog.revision, 'source evidence catalog revision'),
      items: arrayValue(rawCatalog.items, 'source evidence items').filter(item => object(item) && typeof item.id === 'string' && evidenceIds.has(item.id)),
      operations: arrayValue(rawCatalog.operations, 'source evidence operations').filter(op => object(op) && typeof op.evidenceId === 'string' && evidenceIds.has(op.evidenceId)) });
    const evidenceById = new Map<string, EvidenceItem>(), operationIds = new Set<string>(), paths = new Set<string>();
    for (const item of evidenceCatalog.items) {
      if (evidenceById.has(item.id) || paths.has(item.path)) fail('Duplicate referenced source evidence ID or path.');
      if (!baseline.cases.some(c => c.id === item.caseId)) fail('Source evidence refers to an unknown case.');
      const actual = await hashFile(await evidenceFile(root, item.path));
      if (actual.sha256 !== item.sha256 || actual.bytes !== item.bytes) fail('Historical evidence content hash or byte count mismatch.');
      const operations = evidenceCatalog.operations.filter(op => op.evidenceId === item.id);
      const op = operations[0];
      if (operations.length !== 1 || !op || op.operationId !== item.operationId || op.caseId !== item.caseId || op.path !== item.path || op.sha256 !== item.sha256 || op.bytes !== item.bytes || op.committedAt !== item.collectedAt || op.revision > evidenceCatalog.revision || operationIds.has(op.operationId)) fail('Referenced source evidence does not match its original catalog operation.');
      evidenceById.set(item.id, item); operationIds.add(op.operationId); paths.add(item.path);
    }
    if (evidenceById.size !== evidenceIds.size) fail('Referenced historical evidence is missing from its source catalog.');
    const regressionBinding = await readRunBinding(root, manifest, baseline);
    if(!regressionBinding)fail('Historical v9 run is missing its frozen point scope.');
    const cases = validateResultEntries(baseline, results, evidenceById, operationIds,regressionBinding), counts = countsFor(cases);
    const checked: Report = { schemaVersion: 9, runId: manifest.runId, project: baseline.project, structurallyValid: true, revision, evidenceRevision: evidenceCatalog.revision,
      caseCount: cases.length, goalCount: cases.reduce((sum, c) => sum + c.goals.length, 0),sourceCaseCount:baseline.cases.length,sourceGoalCount:baseline.cases.reduce((n,c)=>n+c.goals.length,0), counts, assessmentComplete: counts.unassessed === 0, cases, evidenceCatalog,
      ...(regressionBinding ? { regressionBinding } : {}), actionAttempts: cases.flatMap(c => projectActionAttempts(c.actionEvents).map(a => ({ caseId: c.id, ...a }))),
      evidenceIntegrity: { hashVerifiedItems: evidenceCatalog.items.length }, evidenceCoverage: {
        registeredScreenshots: evidenceCatalog.items.filter(e => e.kind === 'screenshot').length, distinctRetainedContents: new Set(evidenceCatalog.items.map(e => e.sha256)).size,
        goalsWithoutScreenshots: cases.flatMap(c => c.assessments.filter(a => a.status !== 'not_tested' && (a.status === 'verified' || a.status === 'violation' || a.observationIds.length > 0) && !a.observationIds.some(id => c.observations.find(o => o.id === id)?.evidenceIds.some(eid => evidenceById.get(eid)?.kind === 'screenshot'))).map(a => ({ caseId: c.id, goalId: a.goalId }))) },
      caveat: 'Only the exact results prefix and its referenced original evidence were checked. Evidence operations retain their original catalog revisions and are a subset, not a rewritten catalog. Later result entries, unrelated evidence and the current execution ledger are outside this historical snapshot. Hashes do not authenticate observations or business judgments.' };
    return { runDir: root, manifest, baseline, results, checked, baselineSha256: manifest.baselineSha256, resultsSha256: canonicalHash(results),
      evidenceScope: { kind: 'results_prefix_references', catalogRevision: evidenceCatalog.revision, note: checked.caveat } };
  });
}

export async function verifyRunRef(ref:RunRef):Promise<SourceRun>{const actual=await readSourceRun(ref.runDir,{resultsRevision:ref.resultsRevision});if(path.resolve(ref.runDir)!==actual.runDir||actual.manifest.runId!==ref.runId||actual.baselineSha256!==ref.baselineSha256||actual.resultsSha256!==ref.resultsSha256)fail('Historical run identity/revision/fingerprint mismatch.');return actual;}
export function pointDetails(source:SourceRun,pointId:string) {
 const definition=source.baseline.cases.flatMap(c=>c.goals.map(g=>({c,g}))).find(x=>x.g.pointId===pointId);if(!definition)return null;
 const c=source.checked.cases.find(c=>c.id===definition.c.id),selected=Boolean(c?.goals.some(g=>g.pointId===pointId));
 const assessment=selected?c?.assessments.find(a=>a.goalId===definition.g.id)??null:null;
 const findings=selected?c?.findings.filter(f=>f.goalIds.includes(definition.g.id))??[]:[];
 const observations=c?.observations.filter(o=>assessment?.observationIds.includes(o.id)||findings.some(f=>f.observationIds.includes(o.id)))??[];
 const actionIds=new Set(c?.actionEvents.filter(e=>observations.some(o=>o.actionEventIds?.includes(e.id))).map(e=>e.actionId));
 const actions=c?.actionEvents.filter(e=>actionIds.has(e.actionId))??[],contexts=c?.contexts.filter(x=>observations.some(o=>o.contextId===x.id)||actions.some(a=>a.contextId===x.id))??[];
 const evidenceIds=new Set(recordEvidenceIds({observations,assessments:assessment?[assessment]:[],contexts,actionEvents:actions,findings}));
 const queue=[...evidenceIds];for(let i=0;i<queue.length;i++)for(const id of source.checked.evidenceCatalog.items.find(e=>e.id===queue[i])?.metadata?.contextEvidenceIds??[])if(!evidenceIds.has(id)){evidenceIds.add(id);queue.push(id);}
 const evidence=source.checked.evidenceCatalog.items.filter(e=>evidenceIds.has(e.id)).map(e=>({...e,sourceRunId:source.manifest.runId})),required=goalRequiredRefs(definition.c,definition.g),refs=new Set(required);
 return{pointId,caseId:definition.c.id,goalId:definition.g.id,title:definition.g.title,expected:definition.g.expected,basis:definition.g.basis,requiredRefs:required,selected,status:assessment?.status??null,rationale:assessment?.rationale??null,gaps:assessment?.gaps??[],assessment,observations,actions,contexts,findings,evidence,definition:definition.g,plan:{conditions:definition.c.criticalConditions.filter(c=>refs.has('condition:'+c.id)),path:definition.c.requiredPath,order:definition.c.stepOrder,steps:definition.c.steps.filter(s=>refs.has('step:'+s.id)),parameters:definition.c.parameters},relations:source.baseline.retiredPoints.filter(r=>r.pointId===pointId||r.replacements.includes(pointId))};
}
export function sourceContext(source:SourceRun){return{regressionVersion:2 as const,cases:{projectId:source.baseline.projectId,caseVersion:source.baseline.caseVersion,sha256:source.baselineSha256},normative:source.baseline,facts:source.checked.cases.flatMap(c=>c.goals.map(g=>{const detail=pointDetails(source,g.pointId)!;return{caseId:c.id,goalId:g.id,pointId:g.pointId,assessment:detail.assessment,observations:detail.observations,actions:detail.actions,contexts:detail.contexts,findings:detail.findings,evidence:detail.evidence,sourceRun:source.manifest.runId};})),gaps:(source.checked.regressionBinding as {coverage?:{gaps:unknown[]}}|undefined)?.coverage?.gaps??[],caveat:'Normative definitions and historical observations are separate. Evidence is scoped to each goal and its explicitly linked facts; history is not current authorization or freshly collected evidence.'};}
export async function verifyOriginalProblems(root:string,baseline:Baseline,c:Case,assessments:readonly Assessment[]){for(const assessment of assessments)for(const check of assessment.problemChecks??[]){if(path.resolve(check.source.run.runDir)===root)fail('Cross-run problem checks cannot re-lock their own run; use local phenomena for within-run attempts.');if(['not_checked','unclear'].includes(check.state)){if(!check.gaps.length)fail('Uncertain/unchecked problem needs an explicit gap.');continue;}if(!check.observationIds.length)fail('A recurrence observation requires current evidence.');const source=await verifyRunRef(check.source.run);if(source.baseline.projectId!==baseline.projectId)fail('Original problem belongs to another project.');const old=source.checked.cases.find(x=>x.id===check.source.caseId);if(!old)fail('Original problem case is not in the source execution scope.');let oldGoalIds:string[]=[];if(check.source.findingId){const finding=old.findings.find(f=>f.id===check.source.findingId);if(!finding)fail('Original finding is outside the pinned results prefix.');oldGoalIds=finding.goalIds;}else{if(!check.source.goalId||!check.source.operationId)fail('Original problem needs a finding or exact assessment.');const entry=old.entries.find(e=>e.operationId===check.source.operationId),a=entry?.record.assessments.find(a=>a.goalId===check.source.goalId);if(!a||check.source.phenomenonId&&!a.phenomena?.some(p=>p.id===check.source.phenomenonId))fail('Original assessment/phenomenon was not retained.');oldGoalIds=[check.source.goalId];}const current=c.goals.find(g=>g.id===assessment.goalId)!;const oldPoints=old.goals.filter(g=>oldGoalIds.includes(g.id)).map(g=>g.pointId);if(!oldPoints.length)fail('Original finding has no explicit point mapping; retain it separately or record an unclear check.');if(!oldPoints.includes(current.pointId)&&!baseline.retiredPoints.some(p=>oldPoints.includes(p.pointId)&&p.replacements.includes(current.pointId)))fail('Original problem has no explicit mapping to this point.');}}
