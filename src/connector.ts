import {App, Modal, Setting, getLanguage} from 'obsidian';
import {execFile} from 'child_process';
import {promises as fs} from 'fs';
import {win32,posix} from 'path';
import {COMPATIBLE_WACLI_VERSION} from './client';

export const RELEASE_URL='https://github.com/openclaw/wacli/releases/tag/v0.19.0';
export function assetName(platform=process.platform,arch=process.arch):string {
  const os=platform==='win32'?'windows':platform;
  const cpu=arch==='x64'?'amd64':arch;
  if(!['darwin_amd64','darwin_arm64','linux_amd64','linux_arm64','windows_amd64'].includes(`${os}_${cpu}`))return '';
  return `wacli_${COMPATIBLE_WACLI_VERSION}_${os}_${cpu}.${os==='windows'?'zip':'tar.gz'}`;
}
export function normalizeExecutablePath(value:string):string{
  let path=value.trim();
  if((path.startsWith('"')&&path.endsWith('"'))||(path.startsWith("'")&&path.endsWith("'")))path=path.slice(1,-1).trim();
  return path;
}
export function validExecutablePath(value:string,platform=process.platform):boolean{
  const path=normalizeExecutablePath(value),api=platform==='win32'?win32:posix;
  const name=api.basename(path);
  return api.isAbsolute(path)&&(platform==='win32'?name.toLowerCase()==='wacli.exe':name==='wacli');
}
export async function selectedFilePath(file:File):Promise<string>{
  const legacy=(file as File & {path?:string}).path;
  if(legacy)return normalizeExecutablePath(legacy);
  return normalizeExecutablePath((await import('electron')).webUtils.getPathForFile(file));
}
export async function checkExecutable(value:string,run:typeof execFile=execFile):Promise<string>{
  const path=normalizeExecutablePath(value);
  const expected=process.platform==='win32'?'wacli.exe':'wacli';
  if(!validExecutablePath(path))throw new Error('Select the extracted '+expected+' executable / Selecione o executável extraído '+expected+'.');
  if(!(await fs.stat(path)).isFile())throw new Error('Select a file / Selecione um arquivo.');
  await new Promise<void>((resolve,reject)=>{
    run(path,['--version'],{shell:false,windowsHide:true,timeout:5000,maxBuffer:65536},(error,stdout,stderr)=>{
      const version=`${stdout}${stderr}`.trim();
      if(error||!/(?:^|\s)v?0\.19\.0(?:\s|$)/.test(version))reject(new Error('Requires runnable wacli 0.19.0 / Requer wacli 0.19.0 com permissão para executar.'));
      else resolve();
    });
  });
  return path;
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
    c.createEl('p',{text:this.t('3. Select the extracted executable with Browse, drag it below, or paste its full path.','3. Selecione o executável extraído pelo botão Procurar, arraste-o para baixo ou cole seu caminho completo.')});
    const status=c.createEl('p',{attr:{role:'status','aria-live':'polite'}});
    const field=new Setting(c).setName(this.t('Executable path','Caminho do executável'));
    let update:(value:string)=>void=()=>{};
    field.addText(input=>{input.setPlaceholder(process.platform==='win32'?'C:\\Users\\...\\Downloads\\wacli.exe':'/Users/.../Downloads/wacli');input.onChange(v=>{this.selected=normalizeExecutablePath(v);status.setText('');});update=v=>{this.selected=normalizeExecutablePath(v);input.setValue(this.selected);input.inputEl.title=this.selected;status.setText(this.t('File selected. Click Validate and use executable.','Arquivo selecionado. Clique em Validar e usar executável.'));};});
    const picker=c.createEl('input',{type:'file'});picker.hidden=true;picker.multiple=false;
    picker.accept=process.platform==='win32'?'.exe':'';
    const chooseFile=async(file:File)=>{
      if(this.active||this.closed)return;
      if(process.platform==='win32'?file.name.toLowerCase()!=='wacli.exe':file.name!=='wacli'){
        status.setText(this.t('Select only the extracted wacli executable, not the ZIP or another program.','Selecione apenas o executável wacli extraído, não o ZIP ou outro programa.'));return;
      }
      try{const path=await selectedFilePath(file);if(this.closed||this.active)return;if(!path)throw new Error('Empty path');update(path);}
      catch{if(!this.closed)status.setText(this.t('Could not read the file path. Use Copy as path in the file manager and paste it here.','Não foi possível ler o caminho. Use Copiar como caminho no explorador e cole aqui.'));}
    };
    field.addButton(b=>b.setButtonText(this.t('Browse…','Procurar…')).onClick(()=>{if(!this.active){picker.value='';picker.click();}}));
    picker.addEventListener('change',()=>{const file=picker.files?.[0];if(file)void chooseFile(file);});
    c.addEventListener('dragover',event=>{event.preventDefault();});
    const handleDrop=(event:DragEvent):void=>{
      event.preventDefault();event.stopPropagation();if(this.active)return;
      const files=event.dataTransfer?.files;
      if(files?.length===1){void chooseFile(files[0]);return;}
      if(files&&files.length>1){status.setText(this.t('Select one executable at a time.','Selecione um executável por vez.'));return;}
      const text=event.dataTransfer?.getData('text/plain');if(text)update(text);
    };
    // Capture before the input's default drop handler inserts quoted text.
    c.addEventListener('drop',handleDrop,{capture:true});
    c.createEl('p',{text:this.t('Validation executes only wacli --version. wacli is independent, unofficial software. The plugin does not install, move, or update it. Pairing later connects to WhatsApp and saves credentials outside the vault.','A validação executa apenas wacli --version. O wacli é um software independente e não oficial. O plugin não instala, move ou atualiza o executável. O pareamento posterior conecta ao WhatsApp e salva credenciais fora do vault.')});
    new Setting(c).addButton(b=>b.setButtonText(this.t('Validate and use executable','Validar e usar executável')).setCta().onClick(async()=>{
      if(this.active)return;this.active=true;b.setDisabled(true);
      const path=normalizeExecutablePath(this.selected);update(path);status.setText(this.t('Checking wacli version…','Verificando a versão do wacli…'));
      try{const verified=await checkExecutable(path);if(this.closed)return;await this.accept(verified);if(!this.closed){status.setText(this.t('Ready. Close this window and select Show QR code.','Pronto. Feche esta janela e clique em Mostrar QR code.'));}}
      catch(error){if(!this.closed)status.setText(error instanceof Error?error.message:this.t('Validation failed.','Falha na validação.'));}
      finally{this.active=false;if(!this.closed)b.setDisabled(false);}
    })).addButton(b=>b.setButtonText(this.t('Close','Fechar')).onClick(()=>this.close()));
  }
  onClose(){this.closed=true;this.contentEl.empty();}
}
