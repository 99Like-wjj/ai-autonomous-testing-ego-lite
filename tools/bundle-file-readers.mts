import { TOOL_NAME } from '../src/contracts/layout.mjs';
/** Prebundle only fixed parser dependencies. No runtime npm install or application data. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
const root=path.resolve(process.cwd());
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')) as {name:string};if(pkg.name!==TOOL_NAME)throw Error('Run from the confirmed source root.');
await fs.mkdir(path.join(root,'.build/node/src/vendor'),{recursive:true});
const result=await build({entryPoints:[path.join(root,'src/files/readers.mts')],outfile:path.join(root,'.build/node/src/vendor/file-readers.mjs'),bundle:true,metafile:true,platform:'node',format:'esm',target:'node22',legalComments:'inline',banner:{js:"import {createRequire as createBundledRequire} from 'node:module'; const require=createBundledRequire(import.meta.url);"}});
const packages=[...new Set(Object.keys(result.metafile.inputs).flatMap(input=>{const at=input.lastIndexOf('node_modules/');if(at<0)return[];const suffix=input.slice(at+'node_modules/'.length),name=suffix.startsWith('@')?suffix.split('/').slice(0,2).join('/'):suffix.split('/')[0];return[name?input.slice(0,at)+'node_modules/'+name:[]];}).flat())].sort();
const notices:string[]=['Bundled read-only file parsers. Full upstream license texts follow.'];
for(const folder of packages){const directory=path.resolve(root,folder),metadata=JSON.parse(await fs.readFile(path.join(directory,'package.json'),'utf8')) as {name:string;version:string;license?:string};let license:string|undefined;
  for(const name of ['LICENSE','LICENSE.md','LICENSE.txt','license','license.md','LICENCE'])try{license=await fs.readFile(path.join(directory,name),'utf8');break;}catch(error){if(!(error instanceof Error&&'code'in error&&error.code==='ENOENT'))throw error;}
  if(!license&&metadata.name==='worker-f'&&metadata.version==='0.1.21')license=await fs.readFile(path.join(root,'docs/third-party-licenses/worker-f-0.1.21.txt'),'utf8');
  if(!license)throw Error('Missing full bundled dependency license: '+metadata.name);
  notices.push('\n===== '+metadata.name+' @ '+metadata.version+' ('+(metadata.license??'see text')+') =====\n'+license);
}
await fs.writeFile(path.join(root,'.build/node/src/vendor/THIRD-PARTY-LICENSES.txt'),notices.join('\n')+'\n');
process.stdout.write('Fixed file readers bundled for the local runtime.\n');
