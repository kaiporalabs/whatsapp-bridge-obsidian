import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {zipSync,unzipSync} from 'fflate';
const manifest=JSON.parse(readFileSync('manifest.json','utf8'));
const pkg=JSON.parse(readFileSync('package.json','utf8'));
if(pkg.version!==manifest.version)throw Error('Version mismatch');
const dir=`dist/${manifest.id}`;mkdirSync(dir,{recursive:true});
const entries={};
for(const file of ['main.js','manifest.json','styles.css']){
  copyFileSync(file,`${dir}/${file}`);entries[`${manifest.id}/${file}`]=new Uint8Array(readFileSync(file));
}
entries['LEIA-ME.txt']=new Uint8Array(readFileSync('TESTE-WINDOWS.md'));
entries['THIRD-PARTY-NOTICES.txt']=new Uint8Array(readFileSync('THIRD-PARTY-NOTICES.txt'));
entries['LICENSE']=new Uint8Array(readFileSync('LICENSE'));
const zip=zipSync(entries,{level:9});
const name=`${manifest.id}-${manifest.version}.zip`;
writeFileSync(`dist/${name}`,zip);
writeFileSync(`dist/${name}.sha256`,`${createHash('sha256').update(zip).digest('hex')}  ${name}\n`);
if(Object.keys(unzipSync(zip)).length!==6)throw Error('Invalid ZIP');
console.log(`Created and verified dist/${name}`);
