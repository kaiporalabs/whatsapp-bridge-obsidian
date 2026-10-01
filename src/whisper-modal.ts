import {App,Modal,Setting,getLanguage} from 'obsidian';
import {normalizeExecutablePath,selectedFilePath} from './connector';
import {checkWhisper,WHISPER_RELEASE} from './whisper';

export class WhisperModal extends Modal {
  private closed=false;
  private active=false;
  constructor(app:App,private accept:(path:string)=>Promise<void>){super(app);}
  onOpen(){
    this.closed=false;
    const t=(en:string,pt:string)=>getLanguage().startsWith('pt')?pt:en,c=this.contentEl;
    this.titleEl.setText(t('Set up local Whisper','Configurar Whisper local'));
    c.createEl('p',{text:t('1. Open the official releases page. Download the Windows x86-64 Faster-Whisper-XXL archive into Downloads. This window stays open.','1. Abra a página oficial. Baixe o pacote Faster-Whisper-XXL para Windows x86-64 em Downloads. Esta janela permanece aberta.')});
    c.createEl('a',{text:t('Open download page','Abrir página de download'),href:WHISPER_RELEASE,attr:{target:'_blank',rel:'noopener noreferrer'}});
    c.createEl('p',{text:t('2. Extract the entire archive in Downloads with an extractor that supports its format (for example, 7-Zip). Keep all files and folders together. Do not select the archive or move only the EXE.','2. Extraia o pacote inteiro em Downloads usando um extrator compatível com o formato (por exemplo, 7-Zip). Mantenha todos os arquivos e pastas juntos. Não selecione o arquivo compactado nem mova apenas o EXE.')});
    c.createEl('p',{text:t('3. Browse, drag faster-whisper-xxl.exe here, or paste its full path. Validation runs --help. The plugin does not install or update this independent program.','3. Use Procurar, arraste faster-whisper-xxl.exe aqui ou cole seu caminho completo. A validação executa --help. O plugin não instala nem atualiza esse programa independente.')});
    c.createEl('p',{text:t('Transcription runs locally on CPU. On first use, the program may download a large model from Hugging Face into its _models folder. Allow disk space and time. The plugin passes audio to the local program, not to OpenAI.','A transcrição usa a CPU local. No primeiro uso, o programa pode baixar um modelo grande do Hugging Face para sua pasta _models. Reserve espaço e tempo. O plugin entrega o áudio ao programa local, não à OpenAI.')});
    const status=c.createEl('p',{attr:{role:'status','aria-live':'polite'}});
    let selected='',update=(value:string)=>{selected=value;};
    const field=new Setting(c).setName(t('Executable','Executável'));
    field.addText(input=>{
      update=value=>{selected=normalizeExecutablePath(value);input.setValue(selected);input.inputEl.title=selected;status.setText('');};
      input.onChange(value=>{selected=normalizeExecutablePath(value);});
    });
    const picker=c.createEl('input',{type:'file'});picker.hidden=true;picker.accept='.exe';picker.multiple=false;
    const choose=async(file:File)=>{
      if(this.closed||this.active)return;
      if(file.name.toLowerCase()!=='faster-whisper-xxl.exe'){status.setText(t('Select faster-whisper-xxl.exe.','Selecione faster-whisper-xxl.exe.'));return;}
      try{const path=await selectedFilePath(file);if(!this.closed&&!this.active){if(!path)throw new Error();update(path);}}
      catch{status.setText(t('Copy the full file path and paste it here.','Copie o caminho completo do arquivo e cole aqui.'));}
    };
    field.addButton(b=>b.setButtonText(t('Browse…','Procurar…')).onClick(()=>{if(!this.active){picker.value='';picker.click();}}));
    picker.addEventListener('change',()=>{if(picker.files?.[0])void choose(picker.files[0]);});
    c.addEventListener('dragover',event=>event.preventDefault());
    c.addEventListener('drop',event=>{event.preventDefault();event.stopPropagation();if(this.active)return;const files=event.dataTransfer?.files;if(files?.length===1)void choose(files[0]);else if(!files?.length)update(event.dataTransfer?.getData('text/plain')??'');},{capture:true});
    new Setting(c).addButton(b=>b.setButtonText(t('Validate and use executable','Validar e usar executável')).setCta().onClick(()=>{
      if(this.active)return;this.active=true;b.setDisabled(true);status.setText(t('Validating…','Validando…'));
      void checkWhisper(selected).then(async path=>{if(this.closed)return;await this.accept(path);if(!this.closed)status.setText(t('Ready. You can close this window.','Pronto. Você pode fechar esta janela.'));})
        .catch((error:unknown)=>{if(!this.closed)status.setText(error instanceof Error?error.message:t('Validation failed.','Falha na validação.'));})
        .finally(()=>{this.active=false;if(!this.closed)b.setDisabled(false);});
    })).addButton(b=>b.setButtonText(t('Close','Fechar')).onClick(()=>this.close()));
  }
  onClose(){this.closed=true;this.contentEl.empty();}
}

export function confirmReprocess(app:App,all:boolean,local:boolean):Promise<boolean>{
  return new Promise(resolve=>new ReprocessModal(app,all,local,resolve).open());
}
class ReprocessModal extends Modal {
  private answered=false;
  constructor(app:App,private all:boolean,private local:boolean,private answer:(value:boolean)=>void){super(app);}
  onOpen(){
    const t=(en:string,pt:string)=>getLanguage().startsWith('pt')?pt:en;
    this.titleEl.setText(this.all?t('Reprocess all audio','Reprocessar todos os áudios'):t('Transcribe pending audio','Transcrever áudios pendentes'));
    this.contentEl.createEl('p',{text:this.all?t('Existing transcripts will be replaced only after a successful transcription.','As transcrições existentes serão substituídas somente após uma transcrição bem-sucedida.'):t('Only downloaded audio without a successful transcript will be processed.','Somente áudios baixados sem transcrição bem-sucedida serão processados.')});
    this.contentEl.createEl('p',{text:this.local?t('Uses local Faster-Whisper-XXL on CPU. Its first run may download a model from Hugging Face. This can take time and disk space.','Usa o Faster-Whisper-XXL local na CPU. O primeiro uso pode baixar um modelo do Hugging Face. Isso pode levar tempo e consumir espaço.'):t('Uploads these audio files to OpenAI using your API key. API charges may apply, including for repeated transcriptions.','Envia esses arquivos de áudio à OpenAI usando sua chave. Pode haver cobrança pela API, inclusive em transcrições repetidas.')});
    new Setting(this.contentEl).addButton(b=>b.setButtonText(t('Cancel','Cancelar')).onClick(()=>this.finish(false))).addButton(b=>b.setButtonText(t('Continue','Continuar')).setCta().onClick(()=>this.finish(true)));
  }
  private finish(value:boolean){this.answered=true;this.answer(value);this.close();}
  onClose(){if(!this.answered)this.answer(false);this.contentEl.empty();}
}
