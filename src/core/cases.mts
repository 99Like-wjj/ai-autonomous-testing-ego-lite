import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Manifest } from '../contracts/model.mjs';
import { prepareBinding } from '../regression/binding.mjs';
import { resolveConfiguration } from '../execution/config.mjs';
import { initialExecution } from '../execution/ledger.mjs';
import { errorInfo,fail,hash,json,safePath,directory,readJSON,writeNew,removeRegularIfPresent } from './common.mjs';
import { newSafeCases } from './baseline.mjs';
import { readCasesFile } from './case-versions.mjs';
import { hashFile } from './file-integrity.mjs';
export {newSafeCases,normalizeCases} from './baseline.mjs';
export async function validateCases(casesFile:unknown){const saved=await readCasesFile(casesFile),b=saved.baseline;return{schemaVersion:9,structurallyValid:true,project:b.project,cases:saved.ref,caseCount:b.cases.length,goalCount:b.cases.reduce((n,c)=>n+c.goals.length,0),stepCount:b.cases.reduce((n,c)=>n+c.steps.length,0),unpreparedPointIds:b.cases.flatMap(c=>c.goals.filter(g=>g.planState==='unprepared').map(g=>g.pointId)),coverageGaps:b.coverage.filter(c=>c.state==='pending'||c.state==='mapped'&&!c.pointIds.length),caveat:'Structure is not semantic coverage, actual human review, current readiness or authorization.'};}
export async function init(projectDir:unknown){
 const target=await safePath(projectDir,{external:true});await fs.mkdir(target,{mode:0o700});const created:string[]=[];
 try{for(const name of ['cases','runs']){await fs.mkdir(path.join(target,name),{mode:0o700});created.push(name);}const example={schemaVersion:9,expectedVersion:0,previousSha256:null,project:'Synthetic example; replace before use',pointPrefix:'SAMPLE',reason:'Initial synthetic case definition; not a real execution.',sources:[],coverage:[],retiredPoints:[],changes:[],cases:[{id:'example-1',title:'Create and independently read an authorized synthetic configuration',criticalConditions:[],requiredPath:null,stepOrder:'strict',parameters:[],steps:[{id:'save',action:'Create an approved synthetic configuration and independently retrieve its values.',dependsOn:[]}],goals:[{id:'saved-values',pointId:null,title:'Saved values readback',basis:{kind:'hypothesis',source:'Synthetic example only',text:'Replace this example with the real requirement and review it before execution.',sourceRefIds:[]},expected:'The independently retrieved values match the authorized inputs.',requiredRefs:['step:save'],clarificationQuestions:['Replace the synthetic criterion before testing a real application.'],planState:'prepared',preparationGaps:[],sourceAlias:null}]}]};await writeNew(path.join(target,'cases-save-request.example.json'),json(example));return{projectDir:target,exampleRequest:path.join(target,'cases-save-request.example.json'),next:'Edit the request, save/render cases, obtain actual review, select scope, then start with an explicit binding.'};}
 catch(error){for(const name of created.reverse()){try{await fs.rmdir(path.join(target,name));}catch{}}try{await fs.rmdir(target);}catch{}throw error;}
}
export async function start({projectDir,casesFile,outputDir,configFile,maxParallelCases,bindingFile,runSchemaVersion=9}:{projectDir:unknown;casesFile:unknown;outputDir:unknown;configFile?:string|undefined;maxParallelCases?:number|undefined;bindingFile?:string|undefined;runSchemaVersion?:9}){
 const project=await directory(projectDir),target=await safePath(outputDir,{external:true}),saved=await readCasesFile(casesFile),baseline=saved.baseline;newSafeCases(baseline);
 if(runSchemaVersion!==9)fail('New runs require schemaVersion 9.');if(!bindingFile)fail('start requires an explicit scope/review/current-conditions binding; case validation alone does not allow execution.');
 const configuration=await resolveConfiguration({projectDir:project,configFile,maxParallelCases}),manifest:Manifest={schemaVersion:9,baselineSchemaVersion:9,runId:crypto.randomUUID(),projectDir:project,baselineSha256:saved.ref.sha256,executionFile:'execution.json'};
 const prepared=await prepareBinding({projectDir:project,request:await readJSON(await safePath(bindingFile,{existing:true})),baseline,runId:manifest.runId,baselineSha256:saved.ref.sha256});manifest.regressionBindingFile='run-binding.json';manifest.regressionBindingSha256=prepared.sha256;
 if((await hashFile(saved.file)).sha256!==saved.ref.sha256)fail('Case file changed while the run was being prepared.');
 await fs.mkdir(target,{mode:0o700});const created:string[]=[];let evidenceDirectory=false,workerDirectory=false;
 try{for(const [name,bytes]of [['run-binding.json',prepared.bytes],['baseline.json',saved.bytes],['manifest.json',json(manifest)],['results.json',json({schemaVersion:9,revision:0,entries:[]})],['evidence.json',json({schemaVersion:9,revision:0,items:[],operations:[]})],['execution.json',json(initialExecution(manifest,configuration))]] as const){await writeNew(path.join(target,name),bytes);created.push(name);}await fs.mkdir(path.join(target,'evidence'),{mode:0o700});evidenceDirectory=true;await fs.mkdir(path.join(target,'workers'),{mode:0o700});workerDirectory=true;}
 catch(caught){const error=errorInfo(caught);for(const name of created)await removeRegularIfPresent(path.join(target,name));if(workerDirectory)await fs.rmdir(path.join(target,'workers'));if(evidenceDirectory)await fs.rmdir(path.join(target,'evidence'));try{await fs.rmdir(target);}catch{}throw error;}
 return{runDir:target,cases:saved.ref,selectedPointIds:prepared.binding.selection.selectedPointIds,executablePointIds:prepared.binding.plans.flatMap(p=>p.pointIds),deferred:prepared.binding.deferred,caseCount:prepared.binding.coverage.selectedCases,goals:prepared.binding.coverage.selectedGoals,businessExecuted:false};
}
