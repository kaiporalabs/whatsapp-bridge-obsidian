import {PluginSettingTab,Setting,Notice,App,SecretComponent,getLanguage} from 'obsidian';
import type {SettingDefinitionItem} from 'obsidian';
import type WhatsAppBridge from './main';
import {messages} from './i18n';
import {toDataURL} from 'qrcode';
import {confirmLogout} from './main';
import {confirmReprocess} from './whisper-modal';
import {WHISPER_MODELS} from './whisper';

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
    const tr=(en:string,pt:string)=>getLanguage().startsWith('pt')?pt:en;
    const mac=process.platform==='darwin';
    const locked=()=>p.busyState||p.collector.state.running;
    const notWacli=()=>s.messageSource!=='wacli';
    const row=(name:string,desc:string,render:(setting:Setting)=>void|(()=>void)):SettingDefinitionItem=>({name,desc,render});
    const text=(key:'folder'|'groupFolder'|'personalFolder'|'audioFolder'|'mediaFolder'|'ownName'|'executable'|'store'|'source'|'localDatabase',name:string,desc:string,disabled=()=>false)=>row(name,desc,setting=>{
      let refresh=()=>{};
      setting.addText(input=>{input.setValue(s[key]).onChange(value=>{void this.act(async()=>{s[key]=value;await p.save();});});refresh=()=>{input.setDisabled(disabled());};});
      return this.live(refresh);
    });
    const toggle=(key:'groups'|'personal'|'autoCollect'|'downloadAudio'|'transcribeAudio'|'downloadImages'|'downloadVideos'|'downloadDocuments'|'downloadStickers',name:string,desc='',disabled=()=>false)=>row(name,desc,setting=>{
      let refresh=()=>{};
      setting.addToggle(input=>{input.setValue(s[key]).onChange(value=>{void this.act(async()=>{s[key]=value;if(key==='downloadAudio'&&!value)s.transcribeAudio=false;await p.save();});});refresh=()=>{input.setValue(s[key]);input.setDisabled(disabled());};});
      return this.live(refresh);
    });
    const number=(key:'interval'|'days'|'audioMaxMB'|'mediaMaxMB',name:string,desc:string,min:number,max:number)=>row(name,desc,setting=>{
      setting.addText(input=>input.setValue(String(s[key])).onChange(value=>{const n=Number(value);if(!Number.isInteger(n)||n<min||n>max){setting.setErrorMessage(`${min}–${max}`);return;}setting.setErrorMessage(null);void this.act(async()=>{s[key]=n;await p.save();if(key==='interval')p.restartTimer();});}));
    });
    return [
      row(`WhatsApp Bridge · ${p.manifest.version}`,t.intro,setting=>{setting.setHeading();}),
      row(tr('Storage compatibility','Compatibilidade de armazenamento'),s.storageFormat==='local-sync'?tr(`Continuing ${Object.keys(s.legacyChats).length} WhatsApp Local Sync conversations in their existing notes.`,`Continuando ${Object.keys(s.legacyChats).length} conversas do WhatsApp Local Sync nas notas existentes.`):tr('Bridge currently uses its own note structure. Adoption copies the old cursors and paths; it does not reimport old text. Disable WhatsApp Local Sync before continuing.','O Bridge usa atualmente sua própria estrutura. A adoção copia os cursores e caminhos antigos; ela não reimporta textos. Desative o WhatsApp Local Sync antes de continuar.'),setting=>{
        const refreshers:Array<()=>void>=[];
        setting.addButton(b=>{b.setButtonText(tr('Adopt WhatsApp Local Sync','Adotar WhatsApp Local Sync')).onClick(()=>{void this.act(async()=>{await p.adoptLocalSync();});});refreshers.push(()=>{b.setDisabled(locked()||s.storageFormat==='local-sync');});});
        setting.addButton(b=>{b.setButtonText(tr('Use Bridge structure','Usar estrutura do Bridge')).onClick(()=>{void this.act(async()=>{s.storageFormat='bridge';await p.save();this.refresh();});});refreshers.push(()=>{b.setDisabled(locked()||s.storageFormat==='bridge');});});
        return this.live(()=>{setting.setDesc(s.storageFormat==='local-sync'?tr(`Continuing ${Object.keys(s.legacyChats).length} WhatsApp Local Sync conversations in their existing notes.`,`Continuando ${Object.keys(s.legacyChats).length} conversas do WhatsApp Local Sync nas notas existentes.`):tr('Bridge currently uses its own note structure. Adoption copies the old cursors and paths; it does not reimport old text. Disable WhatsApp Local Sync before continuing.','O Bridge usa atualmente sua própria estrutura. A adoção copia os cursores e caminhos antigos; ela não reimporta textos. Desative o WhatsApp Local Sync antes de continuar.'));for(const fn of refreshers)fn();});
      }),
      row(tr('Message source','Fonte das mensagens'),tr('Choose wacli for its own synchronized session, or read the database maintained by WhatsApp Desktop on this Mac.','Escolha wacli para uma sessão sincronizada própria ou leia o banco mantido pelo WhatsApp Desktop neste Mac.'),setting=>{
        let refresh=()=>{};setting.addDropdown(input=>{input.addOption('wacli','wacli').addOption('local-database',tr('WhatsApp local database (macOS)','Banco local do WhatsApp (macOS)')).setValue(s.messageSource).onChange(value=>{void this.act(async()=>{s.messageSource=value==='local-database'?'local-database':'wacli';if(s.messageSource==='local-database'){p.collector.stop();s.autoCollect=false;}await p.save();p.restartTimer();});});refresh=()=>{input.setValue(s.messageSource);input.setDisabled(locked()||s.storageFormat==='local-sync');};});return this.live(refresh);
      }),
      text('localDatabase',tr('ChatStorage.sqlite path','Caminho do ChatStorage.sqlite'),tr('Leave blank to detect the standard WhatsApp Desktop database on macOS. The database is opened read-only.','Deixe vazio para detectar o banco padrão do WhatsApp Desktop no macOS. O banco é aberto somente para leitura.'),()=>locked()||s.messageSource!=='local-database'),
      row(getLanguage().startsWith('pt')?'1. Configurar wacli':'1. Configure wacli',getLanguage().startsWith('pt')?'Baixe pelo navegador e selecione o executável.':'Download in your browser and select the executable.',setting=>{
        let refresh=()=>{};setting.addButton(b=>{b.setButtonText(getLanguage().startsWith('pt')?'Configurar conector':'Set up connector').onClick(()=>{p.configureConnector(()=>{this.refresh();});});refresh=()=>{b.setDisabled(locked()||notWacli());};});return this.live(refresh);
      }),
      row(t.connect,t.connectDesc,setting=>{
        let refreshButton=()=>{};setting.addButton(b=>{b.setButtonText(t.showQr).onClick(()=>{void this.act(()=>{p.startCollector('auth');});});refreshButton=()=>{b.setDisabled(locked()||notWacli());};});
        const panel=setting.settingEl.createDiv({cls:'whatsapp-bridge-qr'});
        let generation=0,disposed=false,lastCode:string|undefined;
        const status=panel.createEl('p',{attr:{role:'status'}}),qr=panel.createDiv();
        const cleanup=this.live(()=>{
          refreshButton();status.setText(notWacli()?tr('Not used with the local database.','Não é usado com o banco local.'):p.collector.state.status);const code=notWacli()?undefined:p.collector.state.qr;
          if(code===lastCode)return;lastCode=code;const current=++generation;qr.empty();if(!code)return;
          qr.createEl('p',{text:t.pointQr});
          void toDataURL(code,{width:320,margin:4,errorCorrectionLevel:'M'}).then(url=>{if(!disposed&&current===generation)qr.createEl('img',{attr:{src:url,alt:t.qrAlt,width:'320',height:'320'}});}).catch(()=>{if(!disposed&&current===generation)qr.createEl('p',{text:t.qrError});});
        });
        return()=>{disposed=true;generation++;cleanup();panel.remove();};
      }),
      row(t.sync,t.syncDesc,setting=>{
        let start=()=>{},stop=()=>{};
        setting.addButton(b=>{b.setButtonText(t.start).onClick(()=>{void this.act(()=>{p.startCollector('sync');});});start=()=>{b.setDisabled(locked()||notWacli());};});
        setting.addButton(b=>{b.setButtonText(t.stop).onClick(()=>{p.collector.stop();});stop=()=>{b.setDisabled(notWacli()||!p.collector.state.running);};});
        return this.live(()=>{start();stop();});
      }),
      row(t.logout,t.logoutDesc,setting=>{
        let refresh=()=>{};setting.addButton(b=>{b.setButtonText(t.logoutButton).setDestructive().onClick(()=>{void this.act(async()=>{if(await confirmLogout(this.app,t))await p.logoutWhatsApp();});});refresh=()=>{b.setDisabled(p.busyState||notWacli());};});return this.live(refresh);
      }),
      toggle('autoCollect',t.auto,t.autoDesc,notWacli),text('folder',t.destination,t.destinationDesc),text('groupFolder',t.groupFolder,t.groupFolderDesc),text('personalFolder',t.personalFolder,t.personalFolderDesc),number('interval',t.interval,t.intervalDesc,0,1440),
      row(t.audio,'',setting=>{setting.setHeading();}),toggle('downloadAudio',t.downloadAudio,t.downloadAudioDesc),text('audioFolder',t.audioFolder,t.audioFolderDesc,()=>!s.downloadAudio),toggle('transcribeAudio',t.transcribeAudio,t.transcribeAudioDesc,()=>!s.downloadAudio),
      row(tr('Other media','Outras mídias'),tr('Choose which cached or wacli media files are copied to the vault. All types are disabled during upgrades.','Escolha quais arquivos do cache ou do wacli serão copiados para o vault. Todos os tipos permanecem desativados durante atualizações.'),setting=>{setting.setHeading();}),
      toggle('downloadImages',tr('Images','Imagens'),tr('Imports photos and image files.','Importa fotos e arquivos de imagem.')),
      toggle('downloadVideos',tr('Videos','Vídeos'),tr('Imports videos and GIF-like MP4 files.','Importa vídeos e arquivos MP4 semelhantes a GIFs.')),
      toggle('downloadDocuments',tr('Documents','Documentos'),tr('Imports PDFs and other shared files as links.','Importa PDFs e outros arquivos compartilhados como links.')),
      toggle('downloadStickers',tr('Stickers','Figurinhas'),tr('Imports sticker files and embeds them in the conversation note.','Importa figurinhas e as incorpora na nota da conversa.')),
      text('mediaFolder',tr('Media folder','Pasta de mídia'),tr('Base folder for Images, Videos, Documents and Stickers.','Pasta base para Images, Videos, Documents e Stickers.')),
      number('mediaMaxMB',tr('Maximum media size (MB)','Tamanho máximo da mídia (MB)'),tr('Per-file limit from 1 to 2048 MB.','Limite por arquivo entre 1 e 2048 MB.'),1,2048),
      row(tr('Past media from WhatsApp Local Sync','Mídias anteriores do WhatsApp Local Sync'),tr('Scans only locally cached media rows. Existing text is not processed. Selected files are added to the original conversation notes and indexes.','Varre somente registros de mídia disponíveis no cache local. Textos existentes não são processados. Os tipos selecionados são adicionados às notas originais e aos índices.'),setting=>{
        let refresh=()=>{};setting.addButton(b=>{b.setButtonText(tr('Import past media','Importar mídias anteriores')).onClick(()=>{void this.act(async()=>{await p.backfillLegacyMedia();});});refresh=()=>{b.setDisabled(p.busyState||s.storageFormat!=='local-sync'||(!s.downloadAudio&&!s.downloadImages&&!s.downloadVideos&&!s.downloadDocuments&&!s.downloadStickers));};});return this.live(refresh);
      }),
      row(tr('Transcription provider','Provedor de transcrição'),tr('OpenAI uploads audio. Local uses whisper.cpp on macOS and Faster-Whisper-XXL on Windows.','OpenAI envia o áudio à nuvem. Local usa whisper.cpp no macOS e Faster-Whisper-XXL no Windows.'),setting=>{
        let refresh=()=>{};setting.addDropdown(input=>{input.addOption('openai','OpenAI').addOption('local',mac?'whisper.cpp (macOS)':'Faster-Whisper-XXL (Windows)').setValue(s.transcriptionProvider).onChange(value=>{void this.act(async()=>{s.transcriptionProvider=value;await p.save();});});refresh=()=>{input.setDisabled(p.busyState);};});return this.live(refresh);
      }),
      row(tr('Local Whisper executable','Executável Whisper local'),s.whisperExecutable||tr('Download and extract the complete Faster-Whisper-XXL package in Downloads.','Baixe e extraia o pacote completo Faster-Whisper-XXL em Downloads.'),setting=>{
        let refresh=()=>{};setting.addButton(b=>{b.setButtonText(tr('Set up local Whisper','Configurar Whisper local')).onClick(()=>p.configureWhisper(()=>this.refresh()));refresh=()=>{b.setDisabled(p.busyState||s.transcriptionProvider!=='local'||(!mac&&process.platform!=='win32'));setting.setDesc(mac?(s.macWhisperExecutable||tr('Select whisper-cli, FFmpeg and a GGML model.','Selecione whisper-cli, FFmpeg e um modelo GGML.')):(s.whisperExecutable||tr('Windows only. Download and extract the complete package in Downloads.','Somente Windows. Baixe e extraia o pacote completo em Downloads.')));};});return this.live(refresh);
      }),
      row(tr('Local model','Modelo local'),tr('Medium is the default. Smaller models use less memory; larger models take more time and disk space. The program downloads missing models.','Medium é o padrão. Modelos menores usam menos memória; maiores exigem mais tempo e espaço. O programa baixa modelos ausentes.'),setting=>{
        if(mac)return this.live(()=>{setting.setDesc(s.macWhisperModel||tr('Choose a downloaded GGML model in Set up local Whisper. No automatic model download.','Escolha um modelo GGML baixado em Configurar Whisper local. Não há download automático de modelos.'));});
        let refresh=()=>{};setting.addDropdown(input=>{for(const model of WHISPER_MODELS)input.addOption(model,model);input.setValue(s.whisperModel).onChange(value=>{void this.act(async()=>{s.whisperModel=value;await p.save();});});refresh=()=>{input.setDisabled(p.busyState||s.transcriptionProvider!=='local');};});return this.live(refresh);
      }),
      row(t.openaiSecret,t.openaiSecretDesc,setting=>{
        setting.addComponent(el=>new SecretComponent(this.app,el).setValue(s.openaiSecret).onChange(value=>{void this.act(async()=>{s.openaiSecret=value??'';await p.save();});}));
        return this.live(()=>{setting.setDisabled(p.busyState||s.transcriptionProvider!=='openai');});
      }),
      row(t.transcriptionLanguage,t.transcriptionLanguageDesc,setting=>{
        let refresh=()=>{};setting.addDropdown(input=>{input.addOption('auto','Auto').addOption('pt','Português').addOption('en','English').setValue(s.transcriptionLanguage).onChange(value=>{void this.act(async()=>{s.transcriptionLanguage=value;await p.save();});});refresh=()=>{input.setDisabled(p.busyState);};});return this.live(refresh);
      }),number('audioMaxMB',t.audioMax,t.audioMaxDesc,1,100),{name:t.audioPrivacy},
      row(tr('Previously downloaded audio','Áudios já baixados'),tr('Uses this account’s Audio Index, including older audio. No WhatsApp download is required. Applies the selected provider even when automatic transcription is off. Stop waits for an active OpenAI request; local processing is interrupted.','Usa o Audio Index desta conta, incluindo áudios antigos. Não baixa novamente do WhatsApp. Usa o provedor selecionado mesmo com transcrição automática desativada. Parar aguarda a requisição OpenAI ativa; o processamento local é interrompido.'),setting=>{
        const refreshers:Array<()=>void>=[];
        for(const all of [false,true])setting.addButton(b=>{b.setButtonText(all?tr('Reprocess all','Reprocessar todos'):tr('Transcribe pending','Transcrever pendentes')).onClick(()=>{
          void confirmReprocess(this.app,all,s.transcriptionProvider==='local').then(confirmed=>{if(confirmed)void this.act(()=>p.reprocessAudio(all));});
        });refreshers.push(()=>{b.setDisabled(p.busyState);});});
        setting.addButton(b=>{b.setButtonText(tr('Stop processing','Parar processamento')).onClick(()=>{p.stopProcessing();});refreshers.push(()=>{b.setDisabled(!p.busyState);});});
        return this.live(()=>{for(const refresh of refreshers)refresh();});
      }),
      row(t.importing,p.lastResult,setting=>{
        setting.addButton(b=>b.setButtonText(t.importNow).setCta().onClick(()=>{void this.act(()=>p.run(false));})).addButton(b=>b.setButtonText(t.test).onClick(()=>{void this.act(()=>p.run(true));}));
        return this.live(()=>{setting.setDesc(p.lastResult);});
      }),
      row(t.advanced,'',setting=>{setting.setHeading();}),text('executable',t.executable,t.executableDesc,()=>locked()||notWacli()),text('store',t.store,t.storeDesc,()=>locked()||notWacli()),text('source',t.source,t.sourceDesc,locked),text('ownName',t.ownName,t.ownNameDesc),number('days',t.days,t.daysDesc,1,3650),toggle('groups',t.groups),toggle('personal',t.personal),{name:t.privacy}
    ];
  }
}
