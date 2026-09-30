import {createHash} from 'crypto';

export interface Settings {
  executable: string; store: string; source: string; folder: string;
  groupFolder: string; personalFolder: string;
  days: number; interval: number; groups: boolean; personal: boolean; ownName: string;
  autoCollect: boolean;
  downloadAudio: boolean; audioFolder: string; transcribeAudio: boolean;
  openaiSecret: string; transcriptionModel: string; transcriptionLanguage: string; audioMaxMB: number;
}
export const defaults: Settings = {
  executable: '', store: '', source: 'principal', folder: 'WhatsApp',
  groupFolder: 'Grupos', personalFolder: 'Pessoais',
  days: 7, interval: 1, groups: true, personal: true, ownName: 'Me', autoCollect:false,
  downloadAudio:false,audioFolder:'Media/Audio',transcribeAudio:false,openaiSecret:'',
  transcriptionModel:'gpt-4o-mini-transcribe',transcriptionLanguage:'auto',audioMaxMB:25
};
export function isRecord(value:unknown):value is Record<string,unknown>{
  return typeof value==='object'&&value!==null&&!Array.isArray(value);
}
export function readSavedSettings(data:unknown):Partial<Settings>|undefined{
  if(!isRecord(data)||!isRecord(data.settings))return undefined;
  const saved=data.settings;
  const result:Partial<Settings>={};
  for(const key of ['executable','store','source','folder','groupFolder','personalFolder','ownName','audioFolder','openaiSecret','transcriptionModel','transcriptionLanguage'] as const){
    const value=saved[key];if(typeof value==='string')result[key]=value;
  }
  for(const key of ['days','interval','audioMaxMB'] as const){
    const value=saved[key];if(typeof value==='number'&&Number.isFinite(value))result[key]=value;
  }
  for(const key of ['groups','personal','autoCollect','downloadAudio','transcribeAudio'] as const){
    const value=saved[key];if(typeof value==='boolean')result[key]=value;
  }
  return result;
}
export function upgradeSettings(previous:Partial<Settings>|null|undefined,portuguese=false):Settings{
  const result={...defaults,...(previous??{})};
  if(previous){
    if(!Object.prototype.hasOwnProperty.call(previous,'folder'))result.folder='WhatsApp Bridge';
    if(!Object.prototype.hasOwnProperty.call(previous,'groupFolder'))result.groupFolder='Grupos';
    if(!Object.prototype.hasOwnProperty.call(previous,'personalFolder'))result.personalFolder='Pessoais';
    if(!Object.prototype.hasOwnProperty.call(previous,'ownName'))result.ownName='Eu';
  }else if(portuguese)result.ownName='Eu';
  return result;
}
export interface Message {
  chat: string; name: string; id: string; sender: string; timestamp: string;
  fromMe: boolean; text: string; mediaType:string;
}
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export function folderPath(value: string): string {
  const parts = value.trim().replace(/\\/g, '/').split('/');
  if (!parts.length || parts.some(p => !p || p === '.' || p === '..' || p.startsWith('.') || /[<>:"|?*]/.test(p) || Array.from(p).some(c=>c.charCodeAt(0)<32) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) {
    throw new Error('Use uma pasta relativa ao vault, sem segmentos vazios, ocultos ou reservados.');
  }
  return parts.join('/');
}
export function validate(s: Settings): void {
  folderPath(s.folder);
  folderPath(s.groupFolder);
  folderPath(s.personalFolder);
  folderPath(s.audioFolder);
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(s.source)) throw new Error('Identificador da conta: use 1–40 letras, números, hífen ou sublinhado.');
  if (!Number.isInteger(s.days) || s.days < 1 || s.days > 3650) throw new Error('Histórico: informe 1–3650 dias.');
  if (!Number.isInteger(s.interval) || s.interval < 0 || s.interval > 1440) throw new Error('Intervalo: informe 0–1440 minutos.');
  if (!Number.isInteger(s.audioMaxMB) || s.audioMaxMB < 1 || s.audioMaxMB > 100) throw new Error('Áudio: informe um limite entre 1 e 100 MB.');
}
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Formato JSON do wacli incompatível.');
  return v as Record<string, unknown>;
}
export function parseMessages(json: string): Message[] {
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error('O wacli não retornou JSON válido. Verifique a versão instalada.'); }
  if (!Array.isArray(value)) {
    const envelope = object(value);
    if (envelope.success === false || envelope.error) throw new Error('O wacli relatou falha na consulta. Execute doctor no terminal.');
    value = envelope.data ?? envelope;
    if (!Array.isArray(value)) {
      const data = object(value);
      if (!Object.prototype.hasOwnProperty.call(data, 'messages')) throw new Error('Resposta sem lista de mensagens. Atualize o wacli ou reporte incompatibilidade.');
      value = data.messages;
      if (value === null) value = [];
    }
  }
  if (!Array.isArray(value)) throw new Error('Lista de mensagens inválida.');
  return value.map(item => {
    const r = object(item);
    for (const key of ['ChatJID', 'MsgID', 'Timestamp']) {
      if (typeof r[key] !== 'string' || !r[key]) throw new Error(`Mensagem sem campo válido: ${key}.`);
    }
    if (typeof r.FromMe !== 'boolean' || !Number.isFinite(Date.parse(r.Timestamp as string))) throw new Error('Data ou direção de mensagem incompatível.');
    const text = typeof r.DisplayText === 'string' && r.DisplayText ? r.DisplayText : typeof r.Text === 'string' ? r.Text : '';
    return {chat:r.ChatJID as string, name:typeof r.ChatName === 'string' && r.ChatName ? r.ChatName : r.ChatJID as string,
      id:r.MsgID as string, sender:typeof r.SenderName === 'string' && r.SenderName ? r.SenderName : typeof r.SenderJID === 'string' ? r.SenderJID : 'Desconhecido',
      timestamp:new Date(r.Timestamp as string).toISOString(), fromMe:r.FromMe,mediaType:typeof r.MediaType==='string'?r.MediaType.toLowerCase():'',
      text:text || (typeof r.MediaType === 'string' && r.MediaType ? `[Mídia: ${r.MediaType}]` : '[Mensagem sem texto]')};
  });
}
export function messageKey(source: string, m: Message): string { return hash(JSON.stringify([source,m.chat,m.id])); }
export function notePath(s: Settings, m: Message): string {
  const category=m.chat.endsWith('@g.us') ? s.groupFolder : s.personalFolder;
  return `${folderPath(s.folder)}/${s.source}/${folderPath(category)}/chat-${hash(m.chat).slice(0,24)}.md`;
}
// Source text is rendered literally, so messages cannot manufacture dedup markers or embeds.
export function escapeText(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/([\\`*_{}[\]()#!|~])/g,'\\$1').replace(/\r\n?/g,'\n');
}
export function mergeNote(existing: string, messages: Message[], s: Settings): {content:string; added:number} {
  const seen = new Set(Array.from(existing.matchAll(/^<!-- wa-bridge:([a-f0-9]{64}) -->$/gm),m=>m[1]));
  let content = existing;
  let added = 0;
  for (const m of [...messages].sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.id.localeCompare(b.id))) {
    const key = messageKey(s.source,m);
    if (seen.has(key)) continue;
    if (!content) content = `---\nsource: whatsapp-bridge\naccount: ${JSON.stringify(s.source)}\nchat_id: ${JSON.stringify(m.chat)}\n---\n\n# ${escapeText(m.name).replace(/\n/g,' ')}\n\nHorários em UTC. Arquivo de importação; exclusões e edições posteriores não são refletidas nesta versão.\n`;
    content += `\n<!-- wa-bridge:${key} -->\n**${m.timestamp.replace('T',' ').replace('.000Z',' UTC')} — ${escapeText(m.fromMe ? s.ownName : m.sender).replace(/\n/g,' ')}**\n\n`;
    content += escapeText(m.text).split('\n').map(line=>`> ${line}`).join('\n')+'\n';
    seen.add(key); added++;
  }
  return {content,added};
}
