import {execFile,ChildProcess} from 'child_process';
import {promises as fs} from 'fs';
import {join,dirname,extname,win32} from 'path';
import {tmpdir} from 'os';
import {normalizeExecutablePath} from './connector';

export const WHISPER_RELEASE='https://github.com/Purfview/whisper-standalone-win/releases';
export const WHISPER_MODELS=['tiny','base','small','medium','large-v3','turbo'];
export function whisperPath(value:string,platform=process.platform):string{
  const path=normalizeExecutablePath(value);
  if(platform!=='win32')throw new Error('Local Faster-Whisper-XXL requires Windows / A transcrição local requer Windows.');
  if(!win32.isAbsolute(path)||win32.basename(path).toLowerCase()!=='faster-whisper-xxl.exe')throw new Error('Select faster-whisper-xxl.exe / Selecione faster-whisper-xxl.exe.');
  return path;
}
export async function checkWhisper(value:string):Promise<string>{
  const path=whisperPath(value);
  if(!(await fs.stat(path)).isFile())throw new Error('Select an extracted executable / Selecione o executável extraído.');
  await new Promise<void>((resolve,reject)=>{
    execFile(path,['--help'],{shell:false,windowsHide:true,cwd:dirname(path),timeout:30000,maxBuffer:1024*1024},(error,stdout,stderr)=>{
      const help=`${stdout}${stderr}`;
      if(error||!['--model','--output_dir','--output_format','--device','--compute_type','--language','--task'].every(flag=>help.includes(flag)))reject(new Error('Incompatible or unavailable Faster-Whisper-XXL / Faster-Whisper-XXL incompatível ou indisponível.'));
      else resolve();
    });
  });
  return path;
}
export function whisperArgs(input:string,output:string,model:string,language:string):string[]{
  if(!WHISPER_MODELS.includes(model))throw new Error('Unsupported local model / Modelo local não suportado.');
  if(!['auto','pt','en'].includes(language))throw new Error('Unsupported language / Idioma não suportado.');
  return [input,'--model',model,'--device','cpu','--compute_type','int8','--task','transcribe','--output_dir',output,'--output_format','txt',...(language==='auto'?[]:['--language',language])];
}
export class LocalWhisper {
  constructor(private run:typeof execFile=execFile,private platform:NodeJS.Platform=process.platform){}
  private child:ChildProcess|null=null;
  private cancelled=false;
  cancel(){this.cancelled=true;this.child?.kill('SIGKILL');}
  async transcribe(data:ArrayBuffer,filename:string,executable:string,model:string,language:string):Promise<string>{
    const path=whisperPath(executable,this.platform);
    this.cancelled=false;
    const dir=await fs.mkdtemp(join(tmpdir(),'whatsapp-bridge-whisper-'));
    try{
      const extension=extname(filename);
      const input=join(dir,`audio${/^\.[a-z0-9]{2,5}$/i.test(extension)?extension:'.ogg'}`);
      await fs.writeFile(input,Buffer.from(data));
      if(this.cancelled)throw new Error('Transcription cancelled / Transcrição cancelada.');
      await new Promise<void>((resolve,reject)=>{
        this.child=this.run(path,whisperArgs(input,dir,model,language),{
          shell:false,windowsHide:true,cwd:dirname(path),timeout:60*60*1000,killSignal:'SIGKILL',maxBuffer:4*1024*1024
        },error=>{
          this.child=null;
          if(error)reject(new Error(this.cancelled?'Transcription cancelled / Transcrição cancelada.':'Local transcription failed or timed out. Check the extracted package, model download, disk space and memory / Falha ou tempo esgotado na transcrição local. Verifique a extração, download do modelo, espaço e memória.'));
          else resolve();
        });
      });
      if(this.cancelled)throw new Error('Transcription cancelled / Transcrição cancelada.');
      const output=join(dir,'audio.txt'),stat=await fs.lstat(output);
      if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2*1024*1024)throw new Error('Invalid transcription output / Saída de transcrição inválida.');
      const text=(await fs.readFile(output,'utf8')).replace(/^\uFEFF/,'').trim();
      if(!text)throw new Error('No speech recognized / Nenhuma fala reconhecida.');
      return text;
    }finally{await fs.rm(dir,{recursive:true,force:true});}
  }
}
