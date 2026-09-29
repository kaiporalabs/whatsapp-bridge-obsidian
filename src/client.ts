import {execFile, ChildProcess} from 'child_process';
import {isAbsolute, join} from 'path';
import {homedir} from 'os';
import {existsSync,promises as fs} from 'fs';
import {tmpdir} from 'os';
import {extname} from 'path';
import {Settings, parseMessages} from './core';

export const LIMIT = 10000;
export const COMPATIBLE_WACLI_VERSION='0.19.0';
export function executableCandidates():string[]{
  const pathName=process.platform==='win32'?'wacli.exe':'wacli';
  return process.platform==='darwin'?['/opt/homebrew/bin/wacli','/usr/local/bin/wacli',pathName]:[pathName];
}
export async function findCompatibleExecutable(run:typeof execFile=execFile):Promise<string|null>{
  for(const candidate of executableCandidates()){
    const version=await new Promise<string|null>(resolve=>run(candidate,['--version'],{shell:false,windowsHide:true,timeout:5000,maxBuffer:64*1024},(error,stdout,stderr)=>resolve(error?null:`${stdout}${stderr}`)));
    if(version&&new RegExp(`(?:^|\\s)v?${COMPATIBLE_WACLI_VERSION.replace(/\./g,'\\.')}(?:\\s|$)`).test(version.trim()))return candidate;
  }
  return null;
}
export function executable(s: Settings): string {
  if (s.executable.trim()) {
    const path = s.executable.trim();
    const pathCommand=process.platform==='win32'?'wacli.exe':'wacli';
    if ((!isAbsolute(path)&&path!==pathCommand) || /\.(bat|cmd|ps1)$/i.test(path)) throw new Error('Informe o caminho absoluto do binário wacli (wacli.exe no Windows), sem aspas ou argumentos.');
    return path;
  }
  const candidates = executableCandidates();
  return candidates.find(p=>isAbsolute(p)&&existsSync(p)) ?? candidates[candidates.length-1];
}
export function storeDirectory(s: Settings): string {
  const p = s.store.trim() || (process.platform === 'linux' ? join(homedir(),'.local','state','wacli') : join(homedir(),'.wacli'));
  if (!isAbsolute(p)) throw new Error('A pasta wacli deve ser um caminho absoluto.');
  return p;
}
export function storePath(s: Settings): string {
  const p=storeDirectory(s);
  if (!existsSync(join(p,'wacli.db'))) throw new Error('Base local ainda não criada. Clique em Conectar WhatsApp e aguarde a primeira sincronização.');
  return p;
}
export function argumentsFor(store: string, after: string, limit: number): string[] {
  return ['--store',store,'--read-only','--json','messages','list','--after',after,'--limit',String(limit)];
}
export function logoutArguments(store:string):string[]{return ['--store',store,'--json','auth','logout'];}
export function mediaArguments(store:string,chat:string,id:string,output:string):string[]{return ['--store',store,'--read-only','--json','media','download','--chat',chat,'--id',id,'--output',output];}
export class WacliClient {
  private child: ChildProcess | null = null;
  cancel(): void { this.child?.kill(); }
  async logout(s:Settings):Promise<void>{
    const bin=executable(s),store=storeDirectory(s);
    const env={...process.env};delete env.WACLI_READONLY;
    await new Promise<void>((resolve,reject)=>{
      this.child=execFile(bin,logoutArguments(store),{shell:false,windowsHide:true,timeout:60000,maxBuffer:1024*1024,env},error=>{
        this.child=null;
        if(error)reject(new Error((error as NodeJS.ErrnoException).code==='ENOENT'?'wacli not found. Configure the executable path.':'Could not disconnect WhatsApp. Check that no other wacli process is using this session.'));
        else resolve();
      });
    });
  }
  async downloadAudio(s:Settings,chat:string,id:string,maxBytes:number):Promise<{data:ArrayBuffer;extension:string}>{
    const bin=executable(s),store=storePath(s);const dir=await fs.mkdtemp(join(tmpdir(),'whatsapp-bridge-audio-'));
    try{
      await new Promise<void>((resolve,reject)=>{
        this.child=execFile(bin,mediaArguments(store,chat,id,dir),{shell:false,windowsHide:true,timeout:120000,maxBuffer:1024*1024,env:{...process.env,WACLI_READONLY:'1'}},error=>{
          this.child=null;error?reject(new Error('Could not download this audio from WhatsApp.')):resolve();
        });
      });
      const entries=await fs.readdir(dir,{withFileTypes:true});
      if(entries.length!==1||!entries[0].isFile()||entries[0].isSymbolicLink())throw new Error('wacli returned an unexpected audio package.');
      const file=join(dir,entries[0].name),stat=await fs.stat(file);
      if(stat.size<1||stat.size>maxBytes)throw new Error('Audio exceeds the configured size limit.');
      const bytes=await fs.readFile(file);const view=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
      return{data:view,extension:extname(entries[0].name)||'.bin'};
    }finally{await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
  }
  async read(s: Settings, after: string, limit=LIMIT) {
    const bin = executable(s), store = storePath(s);
    const output = await new Promise<string>((resolve,reject)=> {
      this.child = execFile(bin,argumentsFor(store,after,limit),{
        shell:false,windowsHide:true,timeout:60000,maxBuffer:32*1024*1024,
        env:{...process.env,WACLI_READONLY:'1'}
      },(error,stdout)=> {
        this.child=null;
        if (error) {
          const code = (error as NodeJS.ErrnoException).code;
          reject(new Error(code === 'ENOENT' ? 'wacli não encontrado. Configure o caminho completo do executável.' : 'Falha ao consultar wacli (timeout, limite de saída, cancelamento ou versão incompatível). Execute o comando de diagnóstico do guia.'));
        } else resolve(stdout);
      });
    });
    const rows = parseMessages(output);
    if (rows.length >= limit && limit === LIMIT) throw new Error('A janela atingiu 10.000 mensagens. Nenhuma nota foi alterada. Reduza os dias de histórico antes de tentar novamente.');
    return rows;
  }
}
