import {Plugin, Setting, Notice, TFile, TFolder, App, Modal, getLanguage} from 'obsidian';
import {defaults, Settings, Message, validate, notePath, mergeNote, upgradeSettings, readSavedSettings} from './core';
import {WacliClient, storeDirectory, findCompatibleExecutable} from './client';
import {Collector} from './collector';
import {ConnectorModal} from './connector';
import {existsSync} from 'fs';
import {join} from 'path';
import {messages} from './i18n';
import {BridgeSettings} from './settings';
import {audioIndexPath,audioKey,deterministicAudioPath,findIndexedAudio,hasTranscript,indexedTranscript,isAudio,mergeAudioIntoNote,transcribe,updateAudioIndex,AudioRecord} from './audio';

export default class WhatsAppBridge extends Plugin {
  settings: Settings = {...defaults};
  private client = new WacliClient();
  private busy = false;
  collector = new Collector(getLanguage().toLowerCase().startsWith('pt')?'pt':'en');
  installing = false;
  private unloaded = false;
  private stopped = false;
  private timer: number | null = null;
  private status!: HTMLElement;
  get busyState(){return this.busy;}
  lastResult = getLanguage().toLowerCase().startsWith('pt')?'Ainda não testado.':'Not tested yet.';
  private text(en:string,pt:string){return getLanguage().toLowerCase().startsWith('pt')?pt:en;}
  async onload() {
    const stored:unknown = await this.loadData();
    const previous=readSavedSettings(stored);
    this.settings = upgradeSettings(previous,getLanguage().toLowerCase().startsWith('pt'));
    if(!this.settings.executable){
      const detected=await findCompatibleExecutable();
      if(detected){this.settings.executable=detected;await this.save();}
    }
    this.status = this.addStatusBarItem(); this.status.setText(this.text('WA Bridge · ready','WA Bridge · pronto'));
    this.addSettingTab(new BridgeSettings(this.app,this));
    this.addRibbonIcon('messages-square',this.text('Import WhatsApp','Importar WhatsApp'),()=>void this.run(false));
    this.addCommand({id:'import',name:this.text('Import messages','Importar mensagens'),callback:()=>void this.run(false)});
    this.addCommand({id:'test',name:this.text('Test local read','Testar leitura local'),callback:()=>void this.run(true)});
    this.addCommand({id:'stop',name:this.text('Stop import','Parar importação'),callback:()=>{this.stopped=true;this.client.cancel();}});
    this.restartTimer();
    if(this.settings.autoCollect) { try {this.collector.start({...this.settings},'sync');} catch {this.lastResult=this.text('Could not start the collector automatically. Check the settings.','Não foi possível iniciar o coletor automaticamente. Verifique as configurações.');} }
  }
  onunload() { this.unloaded=true; this.collector.dispose(); this.stopped=true; this.client.cancel(); if(this.timer!==null)window.clearInterval(this.timer); }
  configureConnector(refresh:()=>void) {
    new ConnectorModal(this.app,async path=>{
      if(this.unloaded||this.busy||this.collector.state.running)throw new Error(this.text('Stop the collector and wait for the current operation.','Pare o coletor e aguarde a operação atual.'));
      const previous=this.settings.executable;
      this.settings.executable=path;
      try {await this.save();}catch(error){this.settings.executable=previous;throw error;}
      refresh();
    }).open();
  }
  startCollector(mode:'auth'|'sync') {
    if(this.installing || this.busy)throw new Error('Aguarde a operação atual.');
    validate(this.settings);
    this.collector.start({...this.settings},mode);
  }
  async logoutWhatsApp(){
    if(this.installing||this.busy)throw new Error(this.text('Wait for the current operation to finish.','Aguarde a operação atual.'));
    this.busy=true;
    try{
      await this.collector.stopAndWait();
      await this.client.logout({...this.settings});
      this.settings.autoCollect=false;
      await this.save();
      this.lastResult=this.text('WhatsApp disconnected. Local credentials were removed.','WhatsApp desconectado. As credenciais locais foram removidas.');
      new Notice(this.lastResult,8000);
    }finally{this.busy=false;}
  }
  async save() { await this.saveData({settings:this.settings}); }
  restartTimer() {
    if(this.timer!==null) window.clearInterval(this.timer);
    this.timer=null;
    if(Number.isInteger(this.settings.interval)&&this.settings.interval>0&&this.settings.interval<=1440) {
      this.timer=window.setInterval(()=>{
        try {if(!existsSync(join(storeDirectory(this.settings),'wacli.db')))return;}catch{return;}
        void this.run(false);
      },this.settings.interval*60000);
      this.registerInterval(this.timer);
    }
  }
  private async folders(path: string) {
    const parts = path.split('/'); parts.pop(); let current='';
    for(const part of parts) {
      current=current ? `${current}/${part}`:part;
      const found=this.app.vault.getAbstractFileByPath(current);
      if(found && !(found instanceof TFolder)) throw new Error('Um arquivo ocupa o caminho da pasta de destino.');
      if(!found) { try { await this.app.vault.createFolder(current); } catch(e) { if(!(this.app.vault.getAbstractFileByPath(current) instanceof TFolder))throw e; } }
    }
  }
  private async processAudios(rows:Message[],s:Settings){
    if(!s.downloadAudio)return{downloaded:0,transcribed:0,failed:0};
    const indexPath=audioIndexPath(s);const indexFile=this.app.vault.getAbstractFileByPath(indexPath);
    if(indexFile&&!(indexFile instanceof TFile))throw new Error('Audio index path is occupied by a folder.');
    let index=indexFile instanceof TFile?await this.app.vault.read(indexFile):'';
    let downloaded=0,transcribed=0,failed=0,changed=false;
    for(const m of rows.filter(m=>isAudio(m)&&!m.chat.includes('broadcast')&&!m.chat.endsWith('@newsletter')&&(m.chat.endsWith('@g.us')?s.groups:s.personal))){
      if(this.stopped)break;
      const key=audioKey(s,m),note=notePath(s,m),alreadyTranscribed=hasTranscript(index,key);
      let path=findIndexedAudio(index,key),data:ArrayBuffer|null=null,extension='',downloadedNow=false,transcriptText='';
      let status:AudioRecord['status']='downloaded',error='';
      try{
        const existing=path?this.app.vault.getAbstractFileByPath(path):null;
        if(existing instanceof TFile){if(s.transcribeAudio&&!alreadyTranscribed)data=await this.app.vault.readBinary(existing);}
        else{
          const result=await this.client.downloadAudio(s,m.chat,m.id,s.audioMaxMB*1024*1024);data=result.data;extension=result.extension;
          path=deterministicAudioPath(s,m,extension);await this.folders(path);
          const occupied=this.app.vault.getAbstractFileByPath(path);
          if(!occupied)await this.app.vault.createBinary(path,data);else if(!(occupied instanceof TFile))throw new Error('Audio destination is occupied by a folder.');
          downloaded++;downloadedNow=true;
        }
        if(alreadyTranscribed){transcriptText=indexedTranscript(index,key);status='transcribed';}
        else if(s.transcribeAudio){
          const secret=this.app.secretStorage?.getSecret(s.openaiSecret)??'';
          if(!data){const file=this.app.vault.getAbstractFileByPath(path);if(file instanceof TFile)data=await this.app.vault.readBinary(file);}
          if(!data)throw new Error('Downloaded audio could not be read.');
          transcriptText=await transcribe(data,path.split('/').pop()??'audio.ogg',secret,s.transcriptionModel,s.transcriptionLanguage);
          status='transcribed';transcribed++;
        }
      }catch(e){
        failed++;error=e instanceof Error?e.message:'Audio processing failed.';status=path?'transcription_failed':'download_failed';
      }
      const record:AudioRecord={key,chat:m.chat,chatName:m.name,sender:m.fromMe?s.ownName:m.sender,timestamp:m.timestamp,note,path,status,transcript:transcriptText,error};
      index=updateAudioIndex(index,record);changed=true;
      if(path&&(downloadedNow||transcriptText)){
        const noteFile=this.app.vault.getAbstractFileByPath(note);
        if(noteFile instanceof TFile)await this.app.vault.process(noteFile,content=>mergeAudioIntoNote(content,s,m,path,transcriptText));
      }
    }
    if(changed){await this.folders(indexPath);if(indexFile instanceof TFile)await this.app.vault.process(indexFile,()=>index);else await this.app.vault.create(indexPath,index);}
    return{downloaded,transcribed,failed};
  }
  async run(test: boolean) {
    if(this.installing) { new Notice(this.text('Wait for the wacli installation to finish.','Aguarde a instalação do wacli.'));return; }
    if(this.busy) { new Notice(this.text('An operation is already running.','Já existe uma operação em andamento.')); return; }
    this.busy=true; this.stopped=false;
    const s={...this.settings};
    let added=0,files=0;
    try {
      validate(s); this.status.setText(this.text('WA Bridge · reading','WA Bridge · lendo'));
      const after=new Date(Date.now()-s.days*86400000).toISOString();
      const rows=await this.client.read(s,after,test?1:undefined);
      if(this.stopped) throw new Error('Operação cancelada.');
      if(test) {
        this.lastResult=rows.length ? this.text('Local read OK. Messages exist in the selected window. This does not verify that the collector is online.','Leitura local OK. Há mensagens na janela. Isso não verifica se o coletor está online.') : this.text('Local read OK; no messages in the selected window. Check the collector and history range.','Leitura local OK; nenhuma mensagem na janela. Confira o coletor e o histórico.');
      } else {
        const groups=new Map<string,Message[]>();
        for(const m of rows) {
          if(m.chat.includes('broadcast') || m.chat.endsWith('@newsletter'))continue;
          if(m.chat.endsWith('@g.us') ? !s.groups : !s.personal)continue;
          const path=notePath(s,m); const group=groups.get(path)??[]; group.push(m); groups.set(path,group);
        }
        for(const [path,messages] of groups) {
          if(this.stopped) throw new Error('Operação cancelada.');
          await this.folders(path);
          const existing=this.app.vault.getAbstractFileByPath(path);
          let count=0;
          if(existing instanceof TFile) {
            await this.app.vault.process(existing,content=>{const r=mergeNote(content,messages,s);count=r.added;return r.content;});
          } else if(existing) throw new Error('Destino ocupado por uma pasta.');
          else {
            const r=mergeNote('',messages,s);
            await this.app.vault.create(path,r.content);count=r.added;
          }
          added+=count; if(count)files++;
          this.status.setText(`WA Bridge · ${added} novas`);
        }
        const audio=await this.processAudios(rows,s);
        const audioSummary=s.downloadAudio?this.text(` Audio: ${audio.downloaded} downloaded, ${audio.transcribed} transcribed, ${audio.failed} failed.`,` Áudio: ${audio.downloaded} baixado(s), ${audio.transcribed} transcrito(s), ${audio.failed} falha(s).`):'';
        this.lastResult=this.text(`${added} message(s) added to ${files} note(s).${audioSummary} ${new Date().toLocaleString()}`,`${added} mensagem(ns) adicionada(s) em ${files} nota(s).${audioSummary} ${new Date().toLocaleString()}`);
      }
      this.status.setText('WA Bridge · OK');
      new Notice(this.lastResult,8000);
    } catch(e) {
      // Never display CLI stdout/stderr or message contents in diagnostics.
      const message=e instanceof Error ? e.message : 'Erro desconhecido.';
      this.lastResult=`${message} ${added ? `${added} mensagem(ns) já gravada(s); repetir é seguro.`:''}`;
      this.status.setText(this.text('WA Bridge · attention','WA Bridge · atenção')); new Notice(this.lastResult,10000);
    } finally {this.busy=false;}
  }
}
export function confirmLogout(app:App,t:ReturnType<typeof messages>):Promise<boolean>{
  return new Promise(resolve=>new LogoutModal(app,t,resolve).open());
}
class LogoutModal extends Modal{
  private answered=false;
  constructor(app:App,private t:ReturnType<typeof messages>,private answer:(value:boolean)=>void){super(app);}
  onOpen(){
    this.titleEl.setText(this.t.logoutTitle);
    this.contentEl.createEl('p',{text:this.t.logoutConfirm});
    new Setting(this.contentEl)
      .addButton(b=>b.setButtonText(this.t.cancel).onClick(()=>this.finish(false)))
      .addButton(b=>b.setButtonText(this.t.logoutButton).setDestructive().onClick(()=>this.finish(true)));
  }
  onClose(){this.contentEl.empty();if(!this.answered){this.answered=true;this.answer(false);}}
  private finish(value:boolean){if(this.answered)return;this.answered=true;this.answer(value);this.close();}
}
