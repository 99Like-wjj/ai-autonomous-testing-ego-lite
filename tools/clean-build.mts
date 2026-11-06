import { TOOL_NAME } from '../src/contracts/layout.mjs';
/** Remove only compiler/staging output, including modules whose sources were deleted. */
import fs from 'node:fs/promises';
import path from 'node:path';
const root=await fs.realpath(process.cwd()),pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')) as {name:string};
if(pkg.name!==TOOL_NAME)throw Error('Run in the confirmed source workspace.');
const build=path.join(root,'.build');
try{if((await fs.lstat(build)).isSymbolicLink())throw Error('Refusing a linked build directory.');}catch(error){if(!(error instanceof Error&&'code'in error&&error.code==='ENOENT'))throw error;}
for(const name of ['node','browser','runtime']){
  const target=path.resolve(build,name);
  if(path.dirname(target)!==build||!target.startsWith(root+path.sep))throw Error('Build cleanup escaped the source workspace.');
  try{const stat=await fs.lstat(target);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Build output must be an ordinary directory.');await fs.rm(target,{recursive:true});}
  catch(error){if(!(error instanceof Error&&'code'in error&&error.code==='ENOENT'))throw error;}
}
