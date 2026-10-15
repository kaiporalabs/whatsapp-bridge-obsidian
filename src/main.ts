import {Plugin, Setting, Notice, TFile, TFolder, App, Modal, getLanguage} from 'obsidian';
import {defaults, Settings, Message, validate, notePath, mergeNote, upgradeSettings, readSavedSettings,folderPath} from './core';
import {LocalWhisper} from './whisper';
import {WhisperModal} from './whisper-modal';
import {MacWhisper} from './whisper-mac';
import {MacWhisperModal} from './whisper-mac-modal';
import {indexedRecords,mergeAudioByKey} from './audio';
import {WacliClient, storeDirectory, findCompatibleExecutable} from './client';
import {LocalDatabaseClient,resolveLocalDatabase} from './local-client';
import {Collector} from './collector';
import {ConnectorModal} from './connector';
import {existsSync} from 'fs';
import {join} from 'path';
import {messages} from './i18n';
import {BridgeSettings} from './settings';
import {audioIndexPath,audioKey,deterministicAudioPath,findIndexedAudio,hasTranscript,indexedTranscript,isAudio,mergeAudioIntoNote,transcribe,updateAudioIndex,AudioRecord} from './audio';
import {adoptLegacySettings,legacyIndex,legacyIndexPath,mergeLegacyNote,parseLegacyPluginData} from './legacy';
import {deterministicMediaPath,findIndexedMedia,mediaEnabled,mediaIndexPath,mediaKey,mediaKind,mergeMediaIntoNote,updateMediaIndex,MediaRecord} from './media';

export default class WhatsAppBridge extends Plugin {
  settings: Settings = {...defaults};
  private client = new WacliClient();
  private localClient = new LocalDatabaseClient();
  private whisper = new LocalWhisper();
  private macWhisper = new MacWhisper();
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
    if(this.settings.messageSource==='wacli'&&!this.settings.executable){
      const detected=await findCompatibleExecutable();
      if(detected){this.settings.executable=detected;await this.save();}
    }
    this.status = this.addStatusBarItem(); this.status.setText(this.text('WA Bridge · ready','WA Bridge · pronto'));
    this.addSettingTab(new BridgeSettings(this.app,this));
    this.addRibbonIcon('messages-square',this.text('Import WhatsApp','Importar WhatsApp'),()=>void this.run(false));
    this.addCommand({id:'import',name:this.text('Import messages','Importar mensagens'),callback:()=>void this.run(false)});
    this.addCommand({id:'test',name:this.text('Test local read','Testar leitura local'),callback:()=>void this.run(true)});
    this.addCommand({id:'stop',name:this.text('Stop import or transcription','Parar importação ou transcrição'),callback:()=>this.stopProcessing()});
    this.restartTimer();
    if(this.settings.messageSource==='wacli'&&this.settings.autoCollect) { try {this.collector.start({...this.settings},'sync');} catch {this.lastResult=this.text('Could not start the collector automatically. Check the settings.','Não foi possível iniciar o coletor automaticamente. Verifique as configurações.');} }
  }
  onunload() { this.unloaded=true; this.collector.dispose(); this.stopProcessing(); if(this.timer!==null)window.clearInterval(this.timer); }
  stopProcessing(){this.stopped=true;this.client.cancel();this.localClient.cancel();this.whisper.cancel();this.macWhisper.cancel();}
  private sourceClient(s:Settings){return s.messageSource==='local-database'?this.localClient:this.client;}
  configureWhisper(refresh:()=>void){
    if(process.platform==='darwin'){
      new MacWhisperModal(this.app,this.settings,async config=>{
        if(this.unloaded||this.busy)throw new Error(this.text('Wait for the current operation.','Aguarde a operação atual.'));
        const previous={macWhisperExecutable:this.settings.macWhisperExecutable,macWhisperModel:this.settings.macWhisperModel,macFfmpegExecutable:this.settings.macFfmpegExecutable};
        Object.assign(this.settings,config);
        try{await this.save();}catch(error){Object.assign(this.settings,previous);throw error;}refresh();
      }).open();return;
    }
    new WhisperModal(this.app,async path=>{
      if(this.unloaded||this.busy)throw new Error(this.text('Wait for the current operation.','Aguarde a operação atual.'));
      const previous=this.settings.whisperExecutable;this.settings.whisperExecutable=path;
      try{await this.save();}catch(error){this.settings.whisperExecutable=previous;throw error;}
      refresh();
    }).open();
  }
  private async transcribeAudioData(data:ArrayBuffer,path:string,s:Settings):Promise<string>{
    if(this.stopped)throw new Error(this.text('Cancelled.','Cancelado.'));
    if(!data.byteLength||data.byteLength>s.audioMaxMB*1024*1024)throw new Error(this.text('Audio is empty or exceeds the configured size limit.','Áudio vazio ou acima do limite configurado.'));
    const filename=path.split('/').pop()??'audio.ogg';
    let result:string;
    if(s.transcriptionProvider==='local'&&process.platform==='darwin')result=await this.macWhisper.transcribe(data,s,s.transcriptionLanguage);
    else if(s.transcriptionProvider==='local')result=await this.whisper.transcribe(data,filename,s.whisperExecutable,s.whisperModel,s.transcriptionLanguage);
    else if(s.transcriptionProvider==='openai')result=await transcribe(data,filename,this.app.secretStorage?.getSecret(s.openaiSecret)??'',s.transcriptionModel,s.transcriptionLanguage);
    else throw new Error('Unknown transcription provider / Provedor de transcrição desconhecido.');
    if(this.stopped)throw new Error(this.text('Cancelled.','Cancelado.'));
    return result;
  }
  async reprocessAudio(all:boolean){
    if(this.busy){new Notice(this.text('An operation is already running.','Já existe uma operação em andamento.'));return;}
    this.busy=true;this.stopped=false;const s={...this.settings};
    let done=0,failed=0,skipped=0;
    try{
      validate(s);
      const file=this.app.vault.getAbstractFileByPath(audioIndexPath(s));
      if(!(file instanceof TFile))throw new Error(this.text('No audio index for this account and destination folder.','Não há índice de áudios para esta conta e pasta de destino.'));
      const records=indexedRecords(await this.app.vault.read(file));
      for(const record of records){
        if(this.stopped)break;
        if(!all&&record.status==='transcribed'&&record.transcript){skipped++;continue;}
        const previous={...record};
        try{
          // Index files can be edited. Only process vault-relative paths and the linked message block.
          folderPath(record.path);folderPath(record.note);
          const audio=this.app.vault.getAbstractFileByPath(record.path);
          if(!(audio instanceof TFile))throw new Error(this.text('Downloaded audio not found.','Áudio baixado não encontrado.'));
          if(audio.stat?.size>s.audioMaxMB*1024*1024)throw new Error(this.text('Audio exceeds the size limit.','Áudio acima do limite de tamanho.'));
          this.status.setText(this.text(`WA Bridge · transcribing ${done+failed+1}`,`WA Bridge · transcrevendo ${done+failed+1}`));
          record.transcript=await this.transcribeAudioData(await this.app.vault.readBinary(audio),record.path,s);
          const note=this.app.vault.getAbstractFileByPath(record.note);
          if(note instanceof TFile)await this.app.vault.process(note,content=>mergeAudioByKey(content,record.key,record.path,record.transcript));
          record.status='transcribed';record.error='';done++;
        }catch(error){
          if(this.stopped)break;
          Object.assign(record,previous);failed++;
          if(record.status!=='transcribed')record.status='transcription_failed';
          record.error=error instanceof Error?error.message:'Transcription failed.';
        }
        // Persist each result; merge into the latest index so unrelated edits survive.
        await this.app.vault.process(file,content=>updateAudioIndex(content,record));
      }
      this.lastResult=this.text(`${done} transcribed, ${failed} failed, ${skipped} already transcribed.`,`${done} transcrito(s), ${failed} falha(s), ${skipped} já transcrito(s).`)+(this.stopped?this.text(' Cancelled.',' Cancelado.'):'');
    }catch(error){this.lastResult=error instanceof Error?error.message:'Transcription failed.';}
    finally{this.busy=false;this.status.setText('WA Bridge · '+this.lastResult);if(!this.unloaded)new Notice(this.lastResult,10000);}
  }
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
    if(this.settings.messageSource!=='wacli')throw new Error(this.text('The collector is only used with wacli.','O coletor é usado somente com wacli.'));
    if(this.installing || this.busy)throw new Error('Aguarde a operação atual.');
    validate(this.settings);
    this.collector.start({...this.settings},mode);
  }
  async logoutWhatsApp(){
    if(this.settings.messageSource!=='wacli')throw new Error(this.text('Local database mode does not store credentials.','O modo de banco local não armazena credenciais.'));
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
  async adoptLocalSync(){
    if(this.busy||this.collector.state.running)throw new Error(this.text('Stop current operations first.','Pare as operações atuais primeiro.'));
    const path=`${this.app.vault.configDir}/plugins/whatsapp-local-sync/data.json`;
    let raw:string;try{raw=await this.app.vault.adapter.read(path);}catch{throw new Error(this.text('WhatsApp Local Sync data.json was not found in this vault. Keep the old plugin folder until adoption is complete.','O data.json do WhatsApp Local Sync não foi encontrado neste vault. Mantenha a pasta do plugin antigo até concluir a adoção.'));}
    let value:unknown;try{value=JSON.parse(raw);}catch{throw new Error('WhatsApp Local Sync data.json is not valid JSON.');}
    const data=parseLegacyPluginData(value);adoptLegacySettings(this.settings,data);this.collector.stop();await this.save();this.restartTimer();
    this.lastResult=this.text(`Adopted ${Object.keys(data.chats).length} conversations. Existing text cursors and note paths will be continued.`,`${Object.keys(data.chats).length} conversas adotadas. Os cursores de texto e caminhos existentes terão continuidade.`);
    new Notice(this.lastResult,10000);
  }
  restartTimer() {
    if(this.timer!==null) window.clearInterval(this.timer);
    this.timer=null;
    if(Number.isInteger(this.settings.interval)&&this.settings.interval>0&&this.settings.interval<=1440) {
      this.timer=window.setInterval(()=>{
        try {
          if(this.settings.messageSource==='wacli'&&!existsSync(join(storeDirectory(this.settings),'wacli.db')))return;
          if(this.settings.messageSource==='local-database')resolveLocalDatabase(this.settings);
        }catch{return;}
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
          const result=await this.sourceClient(s).downloadAudio(s,m,s.audioMaxMB*1024*1024);data=result.data;extension=result.extension;
          path=deterministicAudioPath(s,m,extension);await this.folders(path);
          const occupied=this.app.vault.getAbstractFileByPath(path);
          if(!occupied)await this.app.vault.createBinary(path,data);else if(!(occupied instanceof TFile))throw new Error('Audio destination is occupied by a folder.');
          downloaded++;downloadedNow=true;
        }
        if(alreadyTranscribed){transcriptText=indexedTranscript(index,key);status='transcribed';}
        else if(s.transcribeAudio){
          if(!data){const file=this.app.vault.getAbstractFileByPath(path);if(file instanceof TFile)data=await this.app.vault.readBinary(file);}
          if(!data)throw new Error('Downloaded audio could not be read.');
          transcriptText=await this.transcribeAudioData(data,path,s);
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
  private async processMedia(rows:Message[],s:Settings){
    if(!s.downloadImages&&!s.downloadVideos&&!s.downloadDocuments&&!s.downloadStickers)return{downloaded:0,failed:0};
    const indexPath=mediaIndexPath(s),indexFile=this.app.vault.getAbstractFileByPath(indexPath);
    if(indexFile&&!(indexFile instanceof TFile))throw new Error('Media index path is occupied by a folder.');
    let index=indexFile instanceof TFile?await this.app.vault.read(indexFile):'',downloaded=0,failed=0,changed=false;
    for(const m of rows.filter(m=>mediaEnabled(s,m)&&!m.chat.includes('broadcast')&&!m.chat.endsWith('@newsletter')&&(m.chat.endsWith('@g.us')?s.groups:s.personal))){
      if(this.stopped)break;const key=mediaKey(s,m),note=notePath(s,m),kind=mediaKind(m);if(!kind)continue;
      let path=findIndexedMedia(index,key),error='',status:MediaRecord['status']='downloaded';
      try{
        const existing=path?this.app.vault.getAbstractFileByPath(path):null;
        if(!(existing instanceof TFile)){
          const result=await this.sourceClient(s).downloadMedia(s,m,s.mediaMaxMB*1024*1024);path=deterministicMediaPath(s,m,result.extension);await this.folders(path);
          const occupied=this.app.vault.getAbstractFileByPath(path);if(!occupied)await this.app.vault.createBinary(path,result.data);else if(!(occupied instanceof TFile))throw new Error('Media destination is occupied by a folder.');downloaded++;
        }
      }catch(e){failed++;status='download_failed';error=e instanceof Error?e.message:'Media processing failed.';}
      const record:MediaRecord={key,kind,chat:m.chat,chatName:m.name,sender:m.fromMe?s.ownName:m.sender,timestamp:m.timestamp,note,path,name:m.mediaName??kind,status,error};
      index=updateMediaIndex(index,record);changed=true;
      if(path){const noteFile=this.app.vault.getAbstractFileByPath(note);if(noteFile instanceof TFile)await this.app.vault.process(noteFile,content=>mergeMediaIntoNote(content,s,m,path));}
    }
    if(changed){await this.folders(indexPath);if(indexFile instanceof TFile)await this.app.vault.process(indexFile,()=>index);else await this.app.vault.create(indexPath,index);}
    return{downloaded,failed};
  }
  async backfillLegacyMedia(){
    if(this.busy){new Notice(this.text('An operation is already running.','Já existe uma operação em andamento.'));return;}
    this.busy=true;this.stopped=false;const s={...this.settings,legacyChats:{...this.settings.legacyChats}};
    try{
      validate(s);if(s.storageFormat!=='local-sync')throw new Error(this.text('Adopt WhatsApp Local Sync storage first.','Adote primeiro o armazenamento do WhatsApp Local Sync.'));
      if(!s.downloadAudio&&!s.downloadImages&&!s.downloadVideos&&!s.downloadDocuments&&!s.downloadStickers)throw new Error(this.text('Enable at least one media type first.','Ative primeiro pelo menos um tipo de mídia.'));
      this.status.setText(this.text('WA Bridge · finding past media','WA Bridge · procurando mídias antigas'));
      const all=await this.localClient.readHistoricalMedia(s),selected=all.filter(m=>m.mediaType==='audio'?s.downloadAudio:mediaEnabled(s,m));
      const audio=await this.processAudios(selected,s),media=await this.processMedia(selected,s);
      this.lastResult=this.text(`Past media scan: ${audio.downloaded+media.downloaded} downloaded, ${audio.transcribed} audio transcribed, ${audio.failed+media.failed} failed.`,`Varredura histórica: ${audio.downloaded+media.downloaded} baixado(s), ${audio.transcribed} áudio(s) transcrito(s), ${audio.failed+media.failed} falha(s).`);
    }catch(error){this.lastResult=error instanceof Error?error.message:'Media backfill failed.';}
    finally{this.busy=false;this.status.setText('WA Bridge · '+this.lastResult);if(!this.unloaded)new Notice(this.lastResult,12000);}
  }
  async run(test: boolean) {
    if(this.installing) { new Notice(this.text('Wait for the wacli installation to finish.','Aguarde a instalação do wacli.'));return; }
    if(this.busy) { new Notice(this.text('An operation is already running.','Já existe uma operação em andamento.')); return; }
    this.busy=true; this.stopped=false;
    const s={...this.settings};
    let added=0,files=0;
    try {
      validate(s); this.status.setText(this.text('WA Bridge · reading','WA Bridge · lendo'));
      const legacyDate=s.storageFormat==='local-sync'&&Number.isFinite(Date.parse(s.legacyLastSync))?Date.parse(s.legacyLastSync)-86400000:NaN;
      const after=new Date(Number.isFinite(legacyDate)?legacyDate:Date.now()-s.days*86400000).toISOString();
      const rows=await this.sourceClient(s).read(s,after,test?1:undefined);
      if(this.stopped) throw new Error('Operação cancelada.');
      if(test) {
        this.lastResult=rows.length ? this.text('Local read OK. Messages exist in the selected window. This does not verify that the collector is online.','Leitura local OK. Há mensagens na janela. Isso não verifica se o coletor está online.') : this.text('Local read OK; no messages in the selected window. Check the collector and history range.','Leitura local OK; nenhuma mensagem na janela. Confira o coletor e o histórico.');
      } else {
        const groups=new Map<string,Message[]>();
        for(const m of rows) {
          if(m.chat.includes('broadcast') || m.chat.endsWith('@newsletter'))continue;
          if(m.chat.endsWith('@g.us') ? !s.groups : !s.personal)continue;
          if(s.storageFormat==='local-sync'&&(!m.hasText||(m.localRowPk??0)<=(s.legacyChats[m.chat]?.lastRowPk??0)))continue;
          const path=notePath(s,m); const group=groups.get(path)??[]; group.push(m); groups.set(path,group);
        }
        for(const [path,messages] of groups) {
          if(this.stopped) throw new Error('Operação cancelada.');
          await this.folders(path);
          const existing=this.app.vault.getAbstractFileByPath(path);
          let count=0;
          if(existing instanceof TFile) {
            await this.app.vault.process(existing,content=>{if(s.storageFormat==='local-sync'){const r=mergeLegacyNote(content,messages,s);count=r.added;s.legacyChats[messages[0].chat]=r.state;return r.content;}const r=mergeNote(content,messages,s);count=r.added;return r.content;});
          } else if(existing) throw new Error('Destino ocupado por uma pasta.');
          else {
            if(s.storageFormat==='local-sync'){const r=mergeLegacyNote('',messages,s);await this.app.vault.create(path,r.content);count=r.added;s.legacyChats[messages[0].chat]=r.state;}
            else{const r=mergeNote('',messages,s);await this.app.vault.create(path,r.content);count=r.added;}
          }
          added+=count; if(count)files++;
          if(s.storageFormat==='local-sync'&&count){this.settings.legacyChats=s.legacyChats;await this.save();}
          this.status.setText(`WA Bridge · ${added} novas`);
        }
        const audio=await this.processAudios(rows,s);
        const media=await this.processMedia(rows,s);
        if(s.storageFormat==='local-sync'){
          const indexPath=legacyIndexPath(s);await this.folders(indexPath);const index=this.app.vault.getAbstractFileByPath(indexPath),content=legacyIndex(s);
          if(index instanceof TFile)await this.app.vault.process(index,()=>content);else if(!index)await this.app.vault.create(indexPath,content);
          s.legacyLastSync=new Date().toISOString();this.settings.legacyChats=s.legacyChats;this.settings.legacyLastSync=s.legacyLastSync;await this.save();
        }
        const audioSummary=s.downloadAudio?this.text(` Audio: ${audio.downloaded} downloaded, ${audio.transcribed} transcribed, ${audio.failed} failed.`,` Áudio: ${audio.downloaded} baixado(s), ${audio.transcribed} transcrito(s), ${audio.failed} falha(s).`):'';
        const mediaSummary=(s.downloadImages||s.downloadVideos||s.downloadDocuments||s.downloadStickers)?this.text(` Media: ${media.downloaded} downloaded, ${media.failed} failed.`,` Mídia: ${media.downloaded} baixada(s), ${media.failed} falha(s).`):'';
        this.lastResult=this.text(`${added} message(s) added to ${files} note(s).${audioSummary}${mediaSummary} ${new Date().toLocaleString()}`,`${added} mensagem(ns) adicionada(s) em ${files} nota(s).${audioSummary}${mediaSummary} ${new Date().toLocaleString()}`);
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
