import {build} from 'esbuild';
import {readFileSync,existsSync,writeFileSync} from 'node:fs';
const result=await build({entryPoints:['src/main.ts'],bundle:true,platform:'node',format:'cjs',target:'es2020',external:['obsidian','electron'],outfile:'main.js',minify:true,metafile:true});
const packages=new Set(Object.keys(result.metafile.inputs).filter(p=>p.startsWith('node_modules/')).map(p=>p.split('/').slice(1,p.split('/')[1].startsWith('@')?3:2).join('/')));
const notices=[];
for(const name of packages){
  const root=`node_modules/${name}`;
  const license=['LICENSE','LICENSE.txt','LICENSE.md','license','license.txt'].find(f=>existsSync(`${root}/${f}`));
  if(!license)throw Error(`Missing license for bundled dependency ${name}`);
  notices.push(`=== ${name} ===\n${readFileSync(`${root}/${license}`,'utf8')}`);
}
writeFileSync('THIRD-PARTY-NOTICES.txt',notices.join('\n\n'));
writeFileSync('main.js','/*!\n'+[readFileSync('LICENSE','utf8'),...notices].join('\n\n').replace(/\*\//g,'* /')+'\n*/\n'+readFileSync('main.js','utf8'));
