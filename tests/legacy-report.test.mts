import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { init,start,verifyReport } from '../src/scripts/ego.mjs';

test('old report format is explicitly unsupported and its historical bytes are preserved',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ego-old-report-'));
 t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('ego-old-report-'));await fs.rm(root,{recursive:true,force:true})});
 const project=path.join(root,'project'),run=path.join(root,'run');await init(project);await start({projectDir:project,casesFile:path.join(project,'cases.example.json'),outputDir:run});
 const files={'report.json':JSON.stringify({schemaVersion:4,description:'Synthetic historical content'}),'report.html':'<!doctype html><p>Synthetic old rendered report</p>','report.md':'Synthetic old report\n'};
 for(const [name,content] of Object.entries(files))await fs.writeFile(path.join(run,name),content);
 await assert.rejects(verifyReport(run),/Unsupported saved report format/);
 for(const [name,content] of Object.entries(files))assert.equal(await fs.readFile(path.join(run,name),'utf8'),content);
});
