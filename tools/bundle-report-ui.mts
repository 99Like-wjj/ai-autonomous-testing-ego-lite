/** Bundle generic Markdown dependencies into the offline report. Never installs a runtime dependency. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
const root=path.resolve(process.cwd()),entry=path.join(root,'.build/browser/report-ui/main.js');
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')) as {name:string};if(pkg.name!=='ai-autonomous-testing-ego-lite')throw Error('Run in the confirmed source root.');
const result=await build({entryPoints:[entry],bundle:true,platform:'browser',format:'iife',target:'es2022',write:false,outfile:path.join(root,'.build/browser/report-ui/bundled.js'),legalComments:'inline'});
if(result.outputFiles.length!==1)throw Error('Unexpected report UI bundle output.');await fs.writeFile(entry,result.outputFiles[0]!.contents);
let licenses='\n\n=== Generic report Markdown dependencies ===\n';
for(const name of ['marked','dompurify']){const base=path.join(root,'node_modules',name),p=JSON.parse(await fs.readFile(path.join(base,'package.json'),'utf8')) as {version:string;license:string};licenses+='\n'+name+' '+p.version+' ('+p.license+')\n';const files=(await fs.readdir(base)).filter(n=>/^LICENSE(?:\.|$)/i.test(n));if(!files.length)throw Error('Missing Markdown dependency license: '+name);for(const file of files)licenses+=file+'\n'+await fs.readFile(path.join(base,file),'utf8')+'\n';}
await fs.appendFile(path.join(root,'.build/node/src/vendor/THIRD-PARTY-LICENSES.txt'),licenses);process.stdout.write('Offline report Markdown UI bundled with complete dependency licenses.\n');
