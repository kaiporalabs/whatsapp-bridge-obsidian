import {PluginSettingTab,Setting,Notice,App,SecretComponent,getLanguage} from 'obsidian';
import type {SettingDefinitionItem} from 'obsidian';
import type WhatsAppBridge from './main';
import {messages} from './i18n';
import {toDataURL} from 'qrcode';
import {confirmLogout} from './main';

export class BridgeSettings extends PluginSettingTab {
  private refreshers=new Set<()=>void>();
  constructor(app:App,private bridge:WhatsAppBridge){super(app,bridge);}
  private refresh(){this.refreshDomState();for(const fn of this.refreshers)fn();}
  private async act(fn:()=>void|Promise<void>){
    try{const work=fn();this.refresh();await work;}catch(error){new Notice(error instanceof Error?error.message:'Operation failed.');}
    finally{this.refresh();}
  }
  private live(update:()=>void):()=>void{
    this.refreshers.add(update);const unsubscribe=this.bridge.collector.subscribe(update);update();
    return()=>{this.refreshers.delete(update);unsubscribe();};
  }
  getSettingDefinitions():SettingDefinitionItem[]{
    const p=this.bridge,s=p.settings,t=messages(getLanguage());
    const locked=()=>p.busyState||p.collector.state.running;
    const row=(name:string,desc:string,render:(setting:Setting)=>void|(()=>void)):SettingDefinitionItem=>({name,desc,render});
    const text=(key:'folder'|'groupFolder'|'personalFolder'|'audioFolder'|'ownName'|'executable'|'store'|'source',name:string,desc:string,disabled=()=>false)=>row(name,desc,setting=>{
      let refresh=()=>{};
      setting.addText(input=>{input.setValue(s[key]).onChange(value=>{void this.act(async()=>{s[key]=value;await p.save();});});refresh=()=>input.setDisabled(disabled());});
      return this.live(refresh);
    });
    const toggle=(key:'groups'|'personal'|'autoCollect'|'downloadAudio'|'transcribeAudio',name:string,desc='',disabled=()=>false)=>row(name,desc,setting=>{
      let refresh=()=>{};
      setting.addToggle(input=>{input.setValue(s[key]).onChange(value=>{void this.act(async()=>{s[key]=value;if(key==='downloadAudio'&&!value)s.transcribeAudio=false;await p.save();});});refresh=()=>{input.setValue(s[key]);input.setDisabled(disabled());};});
      return this.live(refresh);
    });
    const number=(key:'interval'|'days'|'audioMaxMB',name:string,desc:string,min:number,max:number)=>row(name,desc,setting=>{
      setting.addText(input=>input.setValue(String(s[key])).onChange(value=>{const n=Number(value);if(!Number.isInteger(n)||n<min||n>max){setting.setErrorMessage(`${min}–${max}`);return;}setting.setErrorMessage(null);void this.act(async()=>{s[key]=n;await p.save();if(key==='interval')p.restartTimer();});}));
    });
    return [
      row(`WhatsApp Bridge · ${p.manifest.version}`,t.intro,setting=>{setting.setHeading();}),
      row(getLanguage().startsWith('pt')?'1. Configurar wacli':'1. Configure wacli',getLanguage().startsWith('pt')?'Baixe pelo navegador e selecione o executável.':'Download in your browser and select the executable.',setting=>{
        let refresh=()=>{};setting.addButton(b=>{b.setButtonText(getLanguage().startsWith('pt')?'Configurar conector':'Set up connector').onClick(()=>p.configureConnector(()=>this.refresh()));refresh=()=>b.setDisabled(locked());});return this.live(refresh);
      }),
      row(t.connect,t.connectDesc,setting=>{
        let refreshButton=()=>{};setting.addButton(b=>{b.setButtonText(t.showQr).onClick(()=>{void this.act(()=>p.startCollector('auth'));});refreshButton=()=>b.setDisabled(locked());});
        const panel=setting.settingEl.createDiv({cls:'whatsapp-bridge-qr'});
        let generation=0,disposed=false,lastCode:string|undefined;
        const status=panel.createEl('p',{attr:{role:'status'}}),qr=panel.createDiv();
        const cleanup=this.live(()=>{
          refreshButton();status.setText(p.collector.state.status);const code=p.collector.state.qr;
          if(code===lastCode)return;lastCode=code;const current=++generation;qr.empty();if(!code)return;
          qr.createEl('p',{text:t.pointQr});
          void toDataURL(code,{width:320,margin:4,errorCorrectionLevel:'M'}).then(url=>{if(!disposed&&current===generation)qr.createEl('img',{attr:{src:url,alt:t.qrAlt,width:'320',height:'320'}});}).catch(()=>{if(!disposed&&current===generation)qr.createEl('p',{text:t.qrError});});
        });
        return()=>{disposed=true;generation++;cleanup();panel.remove();};
      }),
      row(t.sync,t.syncDesc,setting=>{
        let start=()=>{},stop=()=>{};
        setting.addButton(b=>{b.setButtonText(t.start).onClick(()=>{void this.act(()=>p.startCollector('sync'));});start=()=>b.setDisabled(locked());});
        setting.addButton(b=>{b.setButtonText(t.stop).onClick(()=>p.collector.stop());stop=()=>b.setDisabled(!p.collector.state.running);});
        return this.live(()=>{start();stop();});
      }),
      row(t.logout,t.logoutDesc,setting=>{
        let refresh=()=>{};setting.addButton(b=>{b.setButtonText(t.logoutButton).setDestructive().onClick(()=>{void this.act(async()=>{if(await confirmLogout(this.app,t))await p.logoutWhatsApp();});});refresh=()=>b.setDisabled(p.busyState);});return this.live(refresh);
      }),
      toggle('autoCollect',t.auto,t.autoDesc),text('folder',t.destination,t.destinationDesc),text('groupFolder',t.groupFolder,t.groupFolderDesc),text('personalFolder',t.personalFolder,t.personalFolderDesc),number('interval',t.interval,t.intervalDesc,0,1440),
      row(t.audio,'',setting=>{setting.setHeading();}),toggle('downloadAudio',t.downloadAudio,t.downloadAudioDesc),text('audioFolder',t.audioFolder,t.audioFolderDesc,()=>!s.downloadAudio),toggle('transcribeAudio',t.transcribeAudio,t.transcribeAudioDesc,()=>!s.downloadAudio),
      row(t.openaiSecret,t.openaiSecretDesc,setting=>{
        setting.addComponent(el=>new SecretComponent(this.app,el).setValue(s.openaiSecret).onChange(value=>{void this.act(async()=>{s.openaiSecret=value??'';await p.save();});}));
        return this.live(()=>setting.setDisabled(!s.downloadAudio||!s.transcribeAudio));
      }),
      row(t.transcriptionLanguage,t.transcriptionLanguageDesc,setting=>{
        let refresh=()=>{};setting.addDropdown(input=>{input.addOption('auto','Auto').addOption('pt','Português').addOption('en','English').setValue(s.transcriptionLanguage).onChange(value=>{void this.act(async()=>{s.transcriptionLanguage=value;await p.save();});});refresh=()=>input.setDisabled(!s.downloadAudio||!s.transcribeAudio);});return this.live(refresh);
      }),number('audioMaxMB',t.audioMax,t.audioMaxDesc,1,100),{name:t.audioPrivacy},
      row(t.importing,p.lastResult,setting=>{
        setting.addButton(b=>b.setButtonText(t.importNow).setCta().onClick(()=>{void this.act(()=>p.run(false));})).addButton(b=>b.setButtonText(t.test).onClick(()=>{void this.act(()=>p.run(true));}));
        return this.live(()=>setting.setDesc(p.lastResult));
      }),
      row(t.advanced,'',setting=>{setting.setHeading();}),text('executable',t.executable,t.executableDesc,locked),text('store',t.store,t.storeDesc,locked),text('source',t.source,t.sourceDesc,locked),text('ownName',t.ownName,t.ownNameDesc),number('days',t.days,t.daysDesc,1,3650),toggle('groups',t.groups),toggle('personal',t.personal),{name:t.privacy}
    ];
  }
}
