import {App, Modal, Setting, getLanguage} from 'obsidian';
import {execFile} from 'child_process';
import {promises as fs} from 'fs';
import {basename, isAbsolute} from 'path';
import {COMPATIBLE_WACLI_VERSION} from './client';

export const RELEASE_URL='https://github.com/openclaw/wacli/releases/tag/v0.19.0';
export function assetName(platform=process.platform,arch=process.arch):string {
  const os=platform==='win32'?'windows':platform;
  const cpu=arch==='x64'?'amd64':arch;
  if(!['darwin_amd64','darwin_arm64','linux_amd64','linux_arm64','windows_amd64'].includes(`${os}_${cpu}`))return '';
  return `wacli_${COMPATIBLE_WACLI_VERSION}_${os}_${cpu}.${os==='windows'?'zip':'tar.gz'}`;
}
export async function checkExecutable(path:string,run:typeof execFile=execFile):Promise<void>{
  const expected=process.platform==='win32'?'wacli.exe':'wacli';
  if(!isAbsolute(path)||basename(path)!==expected)throw new Error('Select the extracted '+expected+' executable / Selecione o executável extraído '+expected+'.');
  if(!(await fs.stat(path)).isFile())throw new Error('Select a file / Selecione um arquivo.');
  await new Promise<void>((resolve,reject)=>{
    run(path,['--version'],{shell:false,windowsHide:true,timeout:5000,maxBuffer:65536},(error,stdout,stderr)=>{
      const version=`${stdout}${stderr}`.trim();
      if(error||!/(?:^|\s)v?0\.19\.0(?:\s|$)/.test(version))reject(new Error('Requires runnable wacli 0.19.0 / Requer wacli 0.19.0 com permissão para executar.'));
      else resolve();
    });
  });
}
export class ConnectorModal extends Modal {
  private selected='';
  private active=false;
  private closed=false;
  constructor(app:App,private accept:(path:string)=>Promise<void>){super(app);}
  private t(en:string,pt:string){return getLanguage().startsWith('pt')?pt:en;}
  onOpen(){
    this.closed=false;
    this.titleEl.setText(this.t('Configure wacli','Configurar wacli'));
    const c=this.contentEl;
    c.createEl('p',{text:this.t('1. Open the official release page below. Save the archive in Downloads.','1. Abra a página oficial abaixo. Salve o arquivo compactado em Downloads.')});
    c.createEl('a',{text:this.t('Open wacli download page','Abrir página de download do wacli'),href:RELEASE_URL,attr:{target:'_blank',rel:'noopener noreferrer'}});
    c.createEl('p',{text:assetName()?this.t('Choose: ','Escolha: ')+assetName():this.t('No official binary for this architecture. See upstream build instructions.','Não há binário oficial para esta arquitetura. Consulte as instruções de compilação do projeto.')});
    c.createEl('p',{text:this.t('2. Extract the archive in Downloads (Windows: right-click → Extract All). Keep the extracted executable there. This window stays open while you download.','2. Extraia o arquivo em Downloads (Windows: botão direito → Extrair tudo). Mantenha o executável extraído nessa pasta. Esta janela fica aberta durante o download.')});
    c.createEl('p',{text:this.t('3. Drag the extracted wacli executable below, or paste its full path.','3. Arraste o executável wacli extraído para baixo ou cole seu caminho completo.')});
    const field=new Setting(c).setName(this.t('Executable path','Caminho do executável'));
    let update:(value:string)=>void=()=>{};
    field.addText(input=>{input.setPlaceholder(process.platform==='win32'?'C:\\Users\\...\\Downloads\\wacli.exe':'/Users/.../Downloads/wacli');input.onChange(v=>{this.selected=v.trim();});update=v=>{this.selected=v;input.setValue(v);};});
    c.addEventListener('dragover',event=>{event.preventDefault();});
    c.addEventListener('drop',async event=>{
      event.preventDefault();event.stopPropagation();if(this.active)return;
      const files=event.dataTransfer?.files;if(!files||files.length!==1)return;
      const file=files[0] as File & {path?:string};
      let path=file.path??'';
      try{if(!path)path=(await import('electron')).webUtils.getPathForFile(file);}catch{/* Manual path remains available on older Electron. */}
      if(this.closed||this.active)return;
      if(path)update(path);else status.setText(this.t('Paste the full path instead.','Cole o caminho completo do arquivo.'));
    });
    c.createEl('p',{text:this.t('Validation executes only wacli --version. wacli is independent, unofficial software. The plugin does not install, move, or update it. Pairing later connects to WhatsApp and saves credentials outside the vault.','A validação executa apenas wacli --version. O wacli é um software independente e não oficial. O plugin não instala, move ou atualiza o executável. O pareamento posterior conecta ao WhatsApp e salva credenciais fora do vault.')});
    const status=c.createEl('p',{attr:{role:'status'}});
    new Setting(c).addButton(b=>b.setButtonText(this.t('Validate and use executable','Validar e usar executável')).setCta().onClick(async()=>{
      if(this.active)return;this.active=true;b.setDisabled(true);
      const path=this.selected;
      try{await checkExecutable(path);if(this.closed)return;await this.accept(path);if(!this.closed){status.setText(this.t('Ready. Close this window and select Show QR code.','Pronto. Feche esta janela e clique em Mostrar QR code.'));}}
      catch(error){if(!this.closed)status.setText(error instanceof Error?error.message:this.t('Validation failed.','Falha na validação.'));}
      finally{this.active=false;if(!this.closed)b.setDisabled(false);}
    })).addButton(b=>b.setButtonText(this.t('Close','Fechar')).onClick(()=>this.close()));
  }
  onClose(){this.closed=true;this.contentEl.empty();}
}
