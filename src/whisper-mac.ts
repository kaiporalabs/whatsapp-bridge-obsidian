import {execFile,ChildProcess} from 'child_process';
import {promises as fs,constants} from 'fs';
import {join,dirname,basename,isAbsolute} from 'path';
import {tmpdir} from 'os';
import {normalizeExecutablePath} from './connector';

export interface MacWhisperConfig {macWhisperExecutable:string;macWhisperModel:string;macFfmpegExecutable:string;}
export function macExecutable(value:string,name:'whisper-cli'|'ffmpeg'):string{
  const path=normalizeExecutablePath(value);
  if(!isAbsolute(path)||basename(path)!==name)throw new Error(`Select ${name} using its full path / Selecione ${name} pelo caminho completo.`);
  return path;
}
export async function checkMacModel(value:string):Promise<string>{
  const path=normalizeExecutablePath(value);
  if(!isAbsolute(path)||!/^ggml-[\w.-]+\.bin$/.test(basename(path)))throw new Error('Select a ggml-*.bin Whisper model / Selecione um modelo Whisper ggml-*.bin.');
  const file=await fs.open(path,'r');
  try{
    if(!(await file.stat()).isFile())throw new Error('Invalid model file / Arquivo de modelo inválido.');
    const header=Buffer.alloc(4);const {bytesRead}=await file.read(header,0,4,0);
    if(bytesRead!==4||header.readUInt32LE(0)!==0x67676d6c)throw new Error('Invalid GGML model header. Download the actual model, not the web page / Cabeçalho GGML inválido. Baixe o modelo, não a página web.');
  }finally{await file.close();}
  return path;
}
export async function checkMacExecutable(value:string,name:'whisper-cli'|'ffmpeg',run:typeof execFile=execFile):Promise<string>{
  const path=macExecutable(value,name);
  if(!(await fs.stat(path)).isFile())throw new Error('Select an executable file / Selecione um arquivo executável.');
  await fs.access(path,constants.X_OK);
  await new Promise<void>((resolve,reject)=>run(path,[name==='ffmpeg'?'-version':'--help'],{shell:false,windowsHide:true,timeout:15000,maxBuffer:1024*1024},(error,stdout,stderr)=>{
    const output=`${stdout}${stderr}`;
    const compatible=name==='ffmpeg'?/ffmpeg version/i.test(output):['--model','--language','--output-txt','--output-file','--file'].every(flag=>output.includes(flag));
    if(error||!compatible)reject(new Error(`${name}: incompatible or unable to run / incompatível ou não foi possível executar.`));else resolve();
  }));
  return path;
}
export function conversionArgs(input:string,output:string):string[]{
  return ['-nostdin','-hide_banner','-loglevel','error','-y','-protocol_whitelist','file,pipe','-i',input,'-map','0:a:0','-vn','-ar','16000','-ac','1','-c:a','pcm_s16le',output];
}
export function macWhisperArgs(input:string,output:string,model:string,language:string):string[]{
  if(!['auto','en','pt'].includes(language))throw new Error('Unsupported language / Idioma não suportado.');
  return ['--model',model,'--file',input,'--language',language,'--output-txt','--output-file',output,'--no-timestamps'];
}
export class MacWhisper {
  private child:ChildProcess|null=null;
  private cancelled=false;
  constructor(private run:typeof execFile=execFile){}
  cancel(){this.cancelled=true;this.child?.kill('SIGKILL');}
  private async execute(binary:string,args:string[],timeout:number,stage:string){
    if(this.cancelled)throw new Error('Cancelled / Cancelado.');
    await new Promise<void>((resolve,reject)=>{
      this.child=this.run(binary,args,{shell:false,windowsHide:true,cwd:dirname(binary),timeout,killSignal:'SIGKILL',maxBuffer:4*1024*1024},error=>{
        this.child=null;
        if(this.cancelled)reject(new Error('Cancelled / Cancelado.'));
        else if(error)reject(new Error(`${stage}: failed or timed out. Check the selected files and available memory / falhou ou excedeu o tempo. Confira os arquivos selecionados e a memória disponível.`));
        else resolve();
      });
    });
  }
  async transcribe(data:ArrayBuffer,config:MacWhisperConfig,language:string):Promise<string>{
    this.cancelled=false;
    const whisper=macExecutable(config.macWhisperExecutable,'whisper-cli'),ffmpeg=macExecutable(config.macFfmpegExecutable,'ffmpeg');
    const model=await checkMacModel(config.macWhisperModel);
    // Validate language before writing audio or launching a process.
    macWhisperArgs('input','output',model,language);
    const dir=await fs.mkdtemp(join(tmpdir(),'whatsapp-bridge-mac-'));
    try{
      const input=join(dir,'input.audio'),wav=join(dir,'audio.wav'),output=join(dir,'transcript');
      await fs.writeFile(input,Buffer.from(data));
      await this.execute(ffmpeg,conversionArgs(input,wav),5*60*1000,'FFmpeg');
      await this.execute(whisper,macWhisperArgs(wav,output,model,language),60*60*1000,'whisper.cpp');
      const stat=await fs.lstat(output+'.txt');
      if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2*1024*1024)throw new Error('Invalid transcript output / Saída de transcrição inválida.');
      const text=(await fs.readFile(output+'.txt','utf8')).replace(/^\uFEFF/,'').trim();
      if(this.cancelled)throw new Error('Cancelled / Cancelado.');
      if(!text)throw new Error('No speech recognized / Nenhuma fala reconhecida.');
      return text;
    }finally{await fs.rm(dir,{recursive:true,force:true});}
  }
}
