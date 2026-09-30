import {spawn,ChildProcess} from 'child_process';
import {mkdirSync} from 'fs';
import {isAbsolute} from 'path';
import {Settings} from './core';
import {executable,storeDirectory} from './client';

export type CollectorState={status:string;qr:string;running:boolean;connected:boolean};
export function collectorArgs(mode:'auth'|'sync',store:string):string[] {
  return ['--store',store,'--events',mode,'--follow',...(mode==='auth'?['--qr-format','text']:['--presence-mode','quiet'])];
}
export class EventLines {
  private pending='';
  push(text:string,accept:(event:string,data:Record<string,unknown>)=>void) {
    this.pending+=text;
    if(this.pending.length>128*1024){this.pending='';throw new Error('Evento wacli excedeu o limite.');}
    const lines=this.pending.split('\n');this.pending=lines.pop()!;
    for(const line of lines) {
      let v;try{v=JSON.parse(line);}catch{continue;}
      if(v&&typeof v.event==='string')accept(v.event,v.data&&typeof v.data==='object'?v.data:{});
    }
  }
}
export class Collector {
  state:CollectorState;
  private child:ChildProcess|null=null;
  private listeners=new Set<()=>void>();
  private timer:number|null=null;
  private killTimer:number|null=null;
  private stopping=false;
  private terminal=false;
  constructor(private locale:'en'|'pt'='pt'){
    this.state={status:this.msg('Collector stopped','Coletor parado'),qr:'',running:false,connected:false};
  }
  private msg(en:string,pt:string){return this.locale==='pt'?pt:en;}
  subscribe(fn:()=>void){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
  private notify(){for(const fn of this.listeners)fn();}
  private set(value:Partial<CollectorState>){Object.assign(this.state,value);this.notify();}
  start(s:Settings,mode:'auth'|'sync') {
    if(this.child)throw new Error(this.msg('Stop the current collector before starting another operation.','Pare o coletor atual antes de iniciar outra operação.'));
    const bin=executable(s),store=storeDirectory(s);
    if(!isAbsolute(store))throw new Error(this.msg('Invalid data folder.','Pasta de dados inválida.'));
    mkdirSync(store,{recursive:true,mode:0o700});
    this.stopping=false;this.terminal=false;
    this.set({status:mode==='auth'?this.msg('Preparing pairing…','Preparando pareamento…'):this.msg('Connecting…','Conectando…'),qr:'',running:true,connected:false});
    // Auth and sync own the local session; message queries remain read-only.
    const env={...process.env};delete env.WACLI_READONLY;
    const child=spawn(bin,collectorArgs(mode,store),{shell:false,windowsHide:true,stdio:['ignore','ignore','pipe'],env});
    this.child=child;
    const parser=new EventLines();
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data',(chunk:string)=>{
      if(this.child!==child||this.stopping)return;
      try{parser.push(chunk,(event,data)=>this.event(event,data));}
      catch{this.terminal=true;this.stopWithStatus(this.msg('Incompatible collector response.','Resposta do coletor incompatível.'));}
    });
    child.once('error',()=>{this.terminal=true;this.set({status:this.msg('Could not start wacli. Install it or check its path in advanced options.','Não foi possível iniciar o wacli. Instale-o ou confira o caminho nas opções avançadas.'),qr:'',connected:false});});
    child.once('close',(code)=>{
      if(this.child!==child)return;
      this.child=null;this.clearTimers();
      this.set({running:false,connected:false,qr:'',...(!this.terminal?{status:this.stopping?this.msg('Collector stopped','Coletor parado'):this.msg(`Collector ended (${code??'signal'}). Stop any other collector before trying again.`,`Coletor encerrado (${code??'sinal'}). Se houver outro coletor, encerre-o antes de tentar novamente.`)}:{})});
    });
    if(mode==='auth')this.timer=window.setTimeout(()=>{this.terminal=true;this.stopWithStatus(this.msg('Pairing expired. Select Connect to generate another QR code.','Pareamento expirou. Clique em Conectar para gerar outro QR code.'));},180000);
  }
  private event(event:string,data:Record<string,unknown>) {
    if(event==='qr_code'&&typeof data.code==='string'&&data.code.length<8192) this.set({qr:data.code,status:this.msg('Scan the QR code with WhatsApp on your phone.','Escaneie o QR code com o WhatsApp no celular.')});
    else if(event==='connected') {if(this.timer)window.clearTimeout(this.timer);this.timer=null;this.set({qr:'',connected:true,status:this.msg('Connected · receiving messages','Conectado · recebendo mensagens')});}
    else if(event==='disconnected'||event==='stale')this.set({qr:'',connected:false,status:this.msg('Connection interrupted · waiting to reconnect','Conexão interrompida · aguardando reconexão')});
    else if(event==='logged_out'){this.terminal=true;this.stopWithStatus(this.msg('WhatsApp link revoked. Use a new session folder in advanced options to pair again.','Vínculo revogado no WhatsApp. Use uma nova pasta de sessão nas opções avançadas para parear novamente.'));}
    else if(event==='error'){this.terminal=true;this.stopWithStatus(this.msg('wacli reported an error. Check the network, disk space, and whether another collector is using the same account.','O wacli relatou erro. Confira a rede, o espaço em disco e se há outro coletor usando a mesma conta.'));}
    // Raw error payloads and QR codes are never logged or persisted.
  }
  private clearTimers(){if(this.timer)window.clearTimeout(this.timer);if(this.killTimer)window.clearTimeout(this.killTimer);this.timer=null;this.killTimer=null;}
  private stopWithStatus(status:string){this.stop();this.set({status});}
  stop(){
    this.clearTimers();this.stopping=true;this.set({qr:'',connected:false});
    const child=this.child;
    if(!child)return;
    this.set({status:this.msg('Stopping collector…','Parando coletor…')});child.kill('SIGTERM');
    this.killTimer=window.setTimeout(()=>{if(this.child===child)child.kill('SIGKILL');},2000);
  }
  async stopAndWait(timeout=5000):Promise<void>{
    if(!this.state.running)return;
    this.stop();
    await new Promise<void>((resolve,reject)=>{
      const unsubscribe=this.subscribe(()=>{if(!this.state.running){window.clearTimeout(timer);unsubscribe();resolve();}});
      const timer=window.setTimeout(()=>{unsubscribe();reject(new Error(this.msg('The collector did not stop in time.','O coletor não parou a tempo.')));},timeout);
    });
  }
  dispose(){this.listeners.clear();this.stop();}
}
