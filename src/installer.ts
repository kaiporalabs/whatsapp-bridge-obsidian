import {createHash, randomUUID} from 'crypto';
import {promises as fs} from 'fs';
import {join} from 'path';
import {homedir} from 'os';
import {gunzipSync} from 'zlib';
import {unzipSync} from 'fflate';

export const WACLI_VERSION='0.19.0';
const hashes: Record<string,string>={
  darwin_amd64:'1cbe652438f88b830ebbae7e5e8caa9e8381c1cc16da10a8c25bed6c871a1669',
  darwin_arm64:'d033cd1ee2c62cb60a3aae9d1c9abab8f5ac13b72a3a423ddf40d23284bf3d70',
  linux_amd64:'57ea00b26c0ffefa29758b2bcfc183b3e7b061271afee21cb0471a024f3c57ff',
  linux_arm64:'9047eefc9e9a6d37604c1a71ef6469d1127bb61bb75b99d929c76e0c1328d364',
  windows_amd64:'92d96c9d211844c30244b433cbc02e96f2088f4f3ce515becb0e51ed5e55fddd'
};
export function release(platform=process.platform,arch=process.arch) {
  const os=platform==='win32'?'windows':platform;
  const cpu=arch==='x64'?'amd64':arch;
  const key=`${os}_${cpu}`; const digest=hashes[key];
  if(!digest)throw new Error('Não há binário automático para esta arquitetura. Use instalação manual nas opções avançadas.');
  const ext=os==='windows'?'zip':'tar.gz';
  const filename=`wacli_${WACLI_VERSION}_${key}.${ext}`;
  return {filename,digest,binary:os==='windows'?'wacli.exe':'wacli',url:`https://github.com/openclaw/wacli/releases/download/v${WACLI_VERSION}/${filename}`};
}
export function managedRoot():string {
  return process.platform==='win32' ? join(process.env.LOCALAPPDATA||join(homedir(),'AppData','Local'),'WhatsAppBridge') :
    process.platform==='darwin' ? join(homedir(),'Library','Application Support','WhatsAppBridge') :
    join(process.env.XDG_DATA_HOME||join(homedir(),'.local','share'),'whatsapp-bridge');
}
export function managedStore(source:string):string {
  if(!/^[a-zA-Z0-9_-]{1,40}$/.test(source))throw new Error('Identificador de conta inválido.');
  return join(managedRoot(),'accounts',source);
}
export function verifyArchive(data:Uint8Array,digest:string):void {
  if(data.length>64*1024*1024 || createHash('sha256').update(data).digest('hex')!==digest)throw new Error('Download recusado: checksum SHA-256 diferente do esperado. Nenhum executável foi instalado.');
}
export function extractBinary(data:Uint8Array,name:string,zip:boolean):Uint8Array {
  const matches:Uint8Array[]=[];
  const allowed=(path:string)=>path===name||path===`./${name}`;
  if(zip) {
    const files=unzipSync(data,{filter:file=>allowed(file.name)&&file.originalSize<=64*1024*1024});
    for(const [path,bytes]of Object.entries(files))if(allowed(path))matches.push(bytes);
  } else {
    const tar=gunzipSync(data,{maxOutputLength:128*1024*1024});
    for(let i=0;i+512<=tar.length;) {
      const header=tar.subarray(i,i+512);if(header.every(b=>b===0))break;
      const field=(a:number,b:number)=>header.subarray(a,b).toString('utf8').split('\0')[0];
      const path=field(0,100), prefix=field(345,500);
      const sizeText=field(124,136).trim();
      if(!/^[0-7]+$/.test(sizeText))throw new Error('Arquivo TAR incompatível.');
      const size=parseInt(sizeText,8),start=i+512;
      if(!Number.isSafeInteger(size)||size>64*1024*1024||start+size>tar.length)throw new Error('Arquivo TAR inválido.');
      if(!prefix&&allowed(path)&&(header[156]===0||header[156]===48))matches.push(tar.subarray(start,start+size));
      i=start+Math.ceil(size/512)*512;
    }
  }
  if(matches.length!==1||!matches[0].length)throw new Error('O pacote não contém um executável reconhecido.');
  return matches[0];
}
export async function install(download:(url:string)=>Promise<ArrayBuffer>,cancelled:()=>boolean):Promise<string> {
  const asset=release();
  const archive=new Uint8Array(await download(asset.url));
  if(cancelled())throw new Error('Instalação cancelada.');
  verifyArchive(archive,asset.digest);
  const bytes=extractBinary(archive,asset.binary,asset.filename.endsWith('.zip'));
  const dir=join(managedRoot(),'bin',WACLI_VERSION);
  await fs.mkdir(dir,{recursive:true,mode:0o700});
  const destination=join(dir,asset.binary),temp=join(dir,`${asset.binary}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temp,bytes,{flag:'wx',mode:0o700});
    if(cancelled())throw new Error('Instalação cancelada.');
    await fs.rename(temp,destination);
    return destination;
  } finally {await fs.rm(temp,{force:true}).catch(()=>{});}
}
