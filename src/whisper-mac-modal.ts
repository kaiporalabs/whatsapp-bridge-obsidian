import {App,Modal,Setting,getLanguage} from 'obsidian';
import {checkMacExecutable,checkMacModel,MacWhisperConfig,macExecutable} from './whisper-mac';
import {normalizeExecutablePath,selectedFilePath} from './connector';
import {promises as fs} from 'fs';

export class MacWhisperModal extends Modal {
  private closed=false;
  private active=false;
  constructor(app:App,private initial:MacWhisperConfig,private accept:(config:MacWhisperConfig)=>Promise<void>){super(app);}
  onOpen(){
    this.closed=false;
    const t=(en:string,pt:string)=>getLanguage().startsWith('pt')?pt:en,c=this.contentEl;
    this.titleEl.setText(t('Set up whisper.cpp for macOS','Configurar whisper.cpp para macOS'));
    c.createEl('p',{text:t('1. Install whisper.cpp and FFmpeg outside Obsidian. If you already use Homebrew, run the command below in Terminal. The plugin does not execute installation commands.','1. Instale whisper.cpp e FFmpeg fora do Obsidian. Se você já usa Homebrew, execute o comando abaixo no Terminal. O plugin não executa comandos de instalação.')});
    c.createEl('pre').createEl('code',{text:'brew install whisper.cpp ffmpeg'});
    for(const [label,url] of [['whisper.cpp','https://github.com/ggml-org/whisper.cpp'],['Homebrew: whisper.cpp','https://formulae.brew.sh/formula/whisper.cpp'],['FFmpeg','https://ffmpeg.org/download.html']]){
      c.createEl('p').createEl('a',{text:label,href:url,attr:{target:'_blank',rel:'noopener noreferrer'}});
    }
    c.createEl('p',{text:t('2. Download a whisper.cpp GGML model in your browser and save it in Downloads. Start with ggml-small.bin (multilingual). Models ending in .en only support English. Windows Faster-Whisper models are not compatible.','2. Baixe pelo navegador um modelo GGML para whisper.cpp e salve em Downloads. Comece com ggml-small.bin (multilíngue). Modelos com .en só suportam inglês. Modelos do Faster-Whisper do Windows não são compatíveis.')});
    c.createEl('a',{text:t('Open model downloads','Abrir download dos modelos'),href:'https://huggingface.co/ggerganov/whisper.cpp/tree/main',attr:{target:'_blank',rel:'noopener noreferrer'}});
    c.createEl('p',{text:t('3. Select the two executables and the model below. Browse, drag into the matching field, or paste a full path. In the macOS picker, press Cmd+Shift+G to enter /opt/homebrew/bin or /usr/local/bin. Keep installed libraries and model files in place.','3. Selecione os dois executáveis e o modelo abaixo. Use Procurar, arraste para o campo correspondente ou cole o caminho completo. No seletor do macOS, pressione Cmd+Shift+G para abrir /opt/homebrew/bin ou /usr/local/bin. Mantenha as bibliotecas instaladas e o modelo nos seus locais.')});
    const values={...this.initial};
    const status=c.createEl('p',{attr:{role:'status','aria-live':'polite'}});
    const updates:Partial<Record<keyof MacWhisperConfig,(value:string)=>void>>={};
    const specs:[keyof MacWhisperConfig,string,string][]=[['macWhisperExecutable','whisper-cli','/opt/homebrew/bin/whisper-cli'],['macFfmpegExecutable','ffmpeg','/opt/homebrew/bin/ffmpeg'],['macWhisperModel',t('GGML model','Modelo GGML'),'/Users/.../Downloads/ggml-small.bin']];
    for(const [key,label,placeholder] of specs){
      const row=new Setting(c).setName(label);
      let update=(value:string)=>{values[key]=value;};
      row.addText(input=>{update=value=>{values[key]=normalizeExecutablePath(value);input.setValue(values[key]);input.inputEl.title=values[key];status.setText('');};input.setPlaceholder(placeholder).setValue(values[key]).onChange(value=>{values[key]=normalizeExecutablePath(value);});});
      updates[key]=update;
      const picker=c.createEl('input',{type:'file'});picker.hidden=true;picker.multiple=false;if(key==='macWhisperModel')picker.accept='.bin';
      const choose=async(file:File)=>{
        if(this.active||this.closed)return;
        try{
          if(key==='macWhisperModel'?!/^ggml-[\w.-]+\.bin$/.test(file.name):file.name!==label)throw new Error(t('Select the correct file for this field.','Selecione o arquivo correto para este campo.'));
          const path=await selectedFilePath(file);if(!this.closed&&!this.active)update(path);
        }catch(error){if(!this.closed)status.setText(error instanceof Error?error.message:t('Paste the full file path.','Cole o caminho completo do arquivo.'));}
      };
      row.addButton(b=>b.setButtonText(t('Browse…','Procurar…')).onClick(()=>{if(!this.active){picker.value='';picker.click();}}));
      picker.addEventListener('change',()=>{if(picker.files?.[0])void choose(picker.files[0]);});
      row.settingEl.addEventListener('dragover',event=>event.preventDefault());
      row.settingEl.addEventListener('drop',event=>{event.preventDefault();event.stopPropagation();if(this.active)return;const files=event.dataTransfer?.files;if(files?.length===1)void choose(files[0]);else if(!files?.length)update(event.dataTransfer?.getData('text/plain')??'');},{capture:true});
    }
    new Setting(c).addButton(b=>b.setButtonText(t('Find Homebrew executables','Localizar executáveis do Homebrew')).onClick(()=>{
      if(this.active)return;
      void (async()=>{
        for(const [key,name] of [['macWhisperExecutable','whisper-cli'],['macFfmpegExecutable','ffmpeg']] as const){
          if(values[key])continue;
          for(const root of ['/opt/homebrew/bin','/usr/local/bin']){
            const path=`${root}/${name}`;
            try{if((await fs.stat(path)).isFile()){if(!this.closed&&!this.active)updates[key]?.(macExecutable(path,name));break;}}catch{/* Not installed in this location. */}
          }
        }
        if(!this.closed)status.setText(t('Select the model and any missing paths, then validate.','Selecione o modelo e os caminhos que faltarem, depois valide.'));
      })();
    }));
    c.createEl('p',{text:t('Validation runs whisper-cli --help and ffmpeg -version and checks the model header. Transcription uses local temporary files, never uploads audio to OpenAI, and does not download models. Metal acceleration depends on your Mac and whisper.cpp build.','A validação executa whisper-cli --help e ffmpeg -version e confere o cabeçalho do modelo. A transcrição usa arquivos temporários locais, não envia áudio à OpenAI nem baixa modelos. A aceleração Metal depende do Mac e da compilação do whisper.cpp.')});
    new Setting(c).addButton(b=>b.setButtonText(t('Validate and save','Validar e salvar')).setCta().onClick(()=>{
      if(this.active)return;this.active=true;b.setDisabled(true);const snapshot={...values};status.setText(t('Validating…','Validando…'));
      void (async()=>{
        const config:MacWhisperConfig={macWhisperExecutable:await checkMacExecutable(snapshot.macWhisperExecutable,'whisper-cli'),macFfmpegExecutable:await checkMacExecutable(snapshot.macFfmpegExecutable,'ffmpeg'),macWhisperModel:await checkMacModel(snapshot.macWhisperModel)};
        if(this.closed)return;await this.accept(config);if(!this.closed)status.setText(t('Ready. Close this window to transcribe audio.','Pronto. Feche esta janela para transcrever áudios.'));
      })().catch((error:unknown)=>{if(!this.closed)status.setText(error instanceof Error?error.message:t('Validation failed.','Falha na validação.'));}).finally(()=>{this.active=false;if(!this.closed)b.setDisabled(false);});
    })).addButton(b=>b.setButtonText(t('Close','Fechar')).onClick(()=>this.close()));
  }
  onClose(){this.closed=true;this.contentEl.empty();}
}
