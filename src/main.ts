import {Plugin, PluginSettingTab, Setting, Notice, TFile, TFolder, App, Modal, requestUrl, getLanguage} from 'obsidian';
import {defaults, Settings, Message, validate, notePath, mergeNote, upgradeSettings} from './core';
import {WacliClient, storeDirectory, findCompatibleExecutable} from './client';
import {Collector} from './collector';
import {install, managedStore, WACLI_VERSION} from './installer';
import {toDataURL} from 'qrcode';
import {existsSync} from 'fs';
import {join} from 'path';
import {messages} from './i18n';

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
    const stored = await this.loadData();
    const previous=stored?.settings;
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
  async downloadWacli() {
    if(this.installing || this.collector.state.running || this.busy)throw new Error('Aguarde a operação atual ou pare o coletor antes de instalar.');
    this.installing=true;
    try {
      const path=await install(async url=>{
        const result=await requestUrl({url,method:'GET',throw:false});
        if(result.status!==200)throw new Error('Falha no download do GitHub. Confira a conexão e tente novamente.');
        return result.arrayBuffer;
      },()=>this.unloaded);
      if(this.unloaded)return;
      if(!this.settings.store && !existsSync(join(storeDirectory(this.settings),'wacli.db')))this.settings.store=managedStore(this.settings.source);
      this.settings.executable=path;
      await this.save();this.lastResult=this.text('wacli installed. Now select Connect WhatsApp.','wacli instalado. Agora clique em Conectar WhatsApp.');
    } finally {this.installing=false;}
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
        this.lastResult=this.text(`${added} message(s) added to ${files} note(s). ${new Date().toLocaleString()}`,`${added} mensagem(ns) adicionada(s) em ${files} nota(s). ${new Date().toLocaleString()}`);
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
class BridgeSettings extends PluginSettingTab {
  private unsubscribe: (()=>void)|null=null;
  private visible=false;
  private renderId=0;
  constructor(app: App,private plugin: WhatsAppBridge) {super(app,plugin);}
  hide(){this.visible=false;this.renderId++;this.unsubscribe?.();this.unsubscribe=null;this.containerEl.empty();}
  display() {
    this.visible=true;
    if(!this.unsubscribe)this.unsubscribe=this.plugin.collector.subscribe(()=>{if(this.visible)this.display();});
    const generation=++this.renderId;
    const {containerEl:c}=this;c.empty(); const p=this.plugin,s=p.settings;
    const t=messages(getLanguage());
    const running=p.collector.state.running,locked=running||p.installing;
    const act=(fn:()=>void|Promise<void>)=>async()=>{
      try {const promise=fn();this.display();await promise;}catch(e){new Notice(e instanceof Error?e.message:'Falha na operação.');}
      finally {if(this.visible)this.display();}
    };
    c.createEl('h2',{text:'WhatsApp Bridge · 0.3.1'});
    c.createEl('p',{text:t.intro,cls:'whatsapp-bridge-help'});
    new Setting(c).setName(t.install).setDesc(t.installDesc(WACLI_VERSION))
      .addButton(b=>b.setButtonText(p.installing?t.downloading:s.executable?t.reinstall:t.download).setDisabled(locked).onClick(act(()=>p.downloadWacli())));
    new Setting(c).setName(t.connect).setDesc(t.connectDesc)
      .addButton(b=>b.setButtonText(t.showQr).setDisabled(locked).onClick(act(()=>p.startCollector('auth'))));
    const status=c.createEl('p',{text:p.collector.state.status});status.setAttribute('role','status');
    const code=p.collector.state.qr;
    if(code){
      const qr=c.createDiv({cls:'whatsapp-bridge-qr'});
      qr.createEl('p',{text:t.pointQr});
      void toDataURL(code,{width:320,margin:4,errorCorrectionLevel:'M'}).then(url=>{
        if(this.visible&&generation===this.renderId)qr.createEl('img',{attr:{src:url,alt:t.qrAlt,width:'320',height:'320'}});
      }).catch(()=>{if(this.visible&&generation===this.renderId)qr.createEl('p',{text:t.qrError});});
    }
    new Setting(c).setName(t.sync).setDesc(t.syncDesc)
      .addButton(b=>b.setButtonText(t.start).setDisabled(locked).onClick(act(()=>p.startCollector('sync'))))
      .addButton(b=>b.setButtonText(t.stop).setDisabled(!running).onClick(()=>p.collector.stop()));
    new Setting(c).setName(t.logout).setDesc(t.logoutDesc)
      .addButton(b=>b.setButtonText(t.logoutButton).setWarning().setDisabled(p.installing||p.busyState).onClick(async()=>{
        const confirmed=await confirmLogout(this.app,t);
        if(confirmed)await act(()=>p.logoutWhatsApp())();
      }));
    new Setting(c).setName(t.auto).setDesc(t.autoDesc)
      .addToggle(t=>t.setValue(s.autoCollect).onChange(async v=>{s.autoCollect=v;await p.save();}));
    new Setting(c).setName(t.destination).setDesc(t.destinationDesc)
      .addText(t=>t.setValue(s.folder).onChange(async v=>{s.folder=v;await p.save();}));
    new Setting(c).setName(t.groupFolder).setDesc(t.groupFolderDesc)
      .addText(input=>input.setValue(s.groupFolder).onChange(async v=>{s.groupFolder=v;await p.save();}));
    new Setting(c).setName(t.personalFolder).setDesc(t.personalFolderDesc)
      .addText(input=>input.setValue(s.personalFolder).onChange(async v=>{s.personalFolder=v;await p.save();}));
    new Setting(c).setName(t.interval).setDesc(t.intervalDesc)
      .addText(t=>t.setValue(String(s.interval)).onChange(async v=>{s.interval=Number(v);await p.save();p.restartTimer();}));
    new Setting(c).setName(t.importing).setDesc(p.lastResult)
      .addButton(b=>b.setButtonText(t.importNow).setCta().onClick(act(()=>p.run(false))))
      .addButton(b=>b.setButtonText(t.test).onClick(act(()=>p.run(true))));
    const advanced=c.createEl('details');advanced.createEl('summary',{text:t.advanced});
    const field=(key:'executable'|'store'|'source'|'ownName',name:string,desc:string)=>new Setting(advanced).setName(name).setDesc(desc).addText(t=>t.setValue(s[key]).setDisabled(locked).onChange(async v=>{s[key]=v;await p.save();}));
    field('executable',t.executable,t.executableDesc);
    field('store',t.store,t.storeDesc);
    field('source',t.source,t.sourceDesc);
    field('ownName',t.ownName,t.ownNameDesc);
    new Setting(advanced).setName(t.days).setDesc(t.daysDesc).addText(input=>input.setValue(String(s.days)).onChange(async v=>{s.days=Number(v);await p.save();}));
    new Setting(advanced).setName(t.groups).addToggle(input=>input.setValue(s.groups).onChange(async v=>{s.groups=v;await p.save();}));
    new Setting(advanced).setName(t.personal).addToggle(input=>input.setValue(s.personal).onChange(async v=>{s.personal=v;await p.save();}));
    c.createEl('p',{text:t.privacy,cls:'whatsapp-bridge-help'});
  }
}
function confirmLogout(app:App,t:ReturnType<typeof messages>):Promise<boolean>{
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
      .addButton(b=>b.setButtonText(this.t.logoutButton).setWarning().onClick(()=>this.finish(true)));
  }
  onClose(){this.contentEl.empty();if(!this.answered){this.answered=true;this.answer(false);}}
  private finish(value:boolean){if(this.answered)return;this.answered=true;this.answer(value);this.close();}
}
