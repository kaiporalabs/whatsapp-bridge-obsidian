import {execFile,ChildProcess} from 'child_process';
import {accessSync,constants,existsSync,promises as fs} from 'fs';
import {basename,dirname,extname,isAbsolute,join,resolve,sep} from 'path';
import {homedir} from 'os';
import {Message,Settings} from './core';
import {LIMIT} from './client';

type Row={chat?:unknown;name?:unknown;id?:unknown;sender?:unknown;timestamp?:unknown;from_me?:unknown;text?:unknown;has_text?:unknown;message_type?:unknown;media_path?:unknown;media_name?:unknown;row_pk?:unknown};
const MAC_EPOCH=978307200;
export function defaultLocalDatabasePaths():string[]{
  if(process.platform==='darwin')return[join(homedir(),'Library','Group Containers','group.net.whatsapp.WhatsApp.shared','ChatStorage.sqlite')];
  return[];
}
export function resolveLocalDatabase(s:Settings):string{
  if(process.platform!=='darwin')throw new Error('Direct database access is currently supported on macOS. Use wacli on Windows or Linux.');
  const candidates=s.localDatabase.trim()?[s.localDatabase.trim()]:defaultLocalDatabasePaths();
  for(const path of candidates){
    if(!isAbsolute(path))throw new Error('The WhatsApp database path must be absolute.');
    try{accessSync(path,constants.R_OK);return path;}catch{/* try the next candidate */}
  }
  throw new Error('ChatStorage.sqlite was not found or is not readable. Open WhatsApp Desktop once or configure its full path.');
}
function sqliteString(value:string){return `'${value.replace(/'/g,"''")}'`;}
function query(after:string,limit:number,mediaOnly=false){
  const unix=Math.floor(new Date(after).getTime()/1000);
  if(!Number.isFinite(unix))throw new Error('Invalid history date.');
  return `SELECT m.Z_PK AS row_pk, s.ZCONTACTJID AS chat, COALESCE(s.ZPARTNERNAME,s.ZCONTACTJID) AS name, COALESCE(m.ZSTANZAID,'local-'||m.Z_PK) AS id, COALESCE(m.ZPUSHNAME,gm.ZMEMBERJID,m.ZFROMJID,s.ZPARTNERNAME,s.ZCONTACTJID) AS sender, datetime(m.ZMESSAGEDATE+${MAC_EPOCH},'unixepoch')||'.000Z' AS timestamp, m.ZISFROMME AS from_me, COALESCE(m.ZTEXT,'') AS text, CASE WHEN m.ZTEXT IS NULL THEN 0 ELSE 1 END AS has_text, m.ZMESSAGETYPE AS message_type, mi.ZMEDIALOCALPATH AS media_path, mi.ZTITLE AS media_name FROM ZWAMESSAGE m JOIN ZWACHATSESSION s ON m.ZCHATSESSION=s.Z_PK LEFT JOIN ZWAGROUPMEMBER gm ON m.ZGROUPMEMBER=gm.Z_PK LEFT JOIN ZWAMEDIAITEM mi ON m.ZMEDIAITEM=mi.Z_PK WHERE m.ZMESSAGEDATE>${unix-MAC_EPOCH} AND ${mediaOnly?"mi.ZMEDIALOCALPATH IS NOT NULL AND mi.ZMEDIALOCALPATH<>''":"(m.ZTEXT IS NOT NULL OR m.ZMESSAGETYPE IN (1,2,3,8,11,15) OR (mi.ZMEDIALOCALPATH IS NOT NULL AND mi.ZMEDIALOCALPATH<>''))"} ORDER BY m.ZMESSAGEDATE ASC LIMIT ${Math.max(1,Math.min(LIMIT,Math.trunc(limit)))};`;
}
export function localMediaType(messageType:number,path:string|undefined):string{
  if(messageType===1)return'image';if(messageType===2||messageType===11)return'video';if(messageType===3)return'audio';if(messageType===8)return'document';if(messageType===15)return'sticker';
  const ext=extname(path??'').toLowerCase();if(['.jpg','.jpeg','.png','.gif','.heic','.webp'].includes(ext))return'image';if(['.mp4','.mov','.mkv','.webm','.avi'].includes(ext))return'video';if(['.opus','.ogg','.mp3','.m4a','.wav','.aac'].includes(ext))return'audio';return path?'document':'';
}
export class LocalDatabaseClient{
  private child:ChildProcess|null=null;
  cancel(){this.child?.kill();}
  async read(s:Settings,after:string,limit=LIMIT):Promise<Message[]>{return this.readQuery(s,after,limit,false);}
  async readHistoricalMedia(s:Settings,limit=LIMIT):Promise<Message[]>{return this.readQuery(s,'2001-01-01T00:00:00.000Z',limit,true);}
  async readHistoricalAudio(s:Settings,limit=LIMIT):Promise<Message[]>{return(await this.readHistoricalMedia(s,limit)).filter(m=>m.mediaType==='audio');}
  private async readQuery(s:Settings,after:string,limit:number,mediaOnly:boolean):Promise<Message[]>{
    const database=resolveLocalDatabase(s);
    const output=await new Promise<string>((resolve,reject)=>{
      this.child=execFile('/usr/bin/sqlite3',['-readonly','-json',database,query(after,limit,mediaOnly)],{shell:false,windowsHide:true,timeout:60000,maxBuffer:64*1024*1024},(error,stdout)=>{
        this.child=null;error?reject(new Error('Could not read the local WhatsApp database. Close WhatsApp and try again, or use wacli.')):resolve(stdout);
      });
    });
    let rows:Row[];
    try{const value=output.trim()?JSON.parse(output):[];if(!Array.isArray(value))throw new Error();rows=value;}catch{throw new Error('The installed sqlite3 returned an incompatible response.');}
    if(rows.length>=limit&&limit===LIMIT)throw new Error('The window reached 10,000 messages. No note was changed. Reduce the history range.');
    return rows.map(row=>{
      const timestamp=String(row.timestamp??'');if(!row.chat||!row.id||!Number.isFinite(Date.parse(timestamp)))throw new Error('The WhatsApp database schema is incompatible with this version.');
      const localMediaPath=typeof row.media_path==='string'&&row.media_path?row.media_path:undefined,mediaType=localMediaType(Number(row.message_type),localMediaPath);
      const mediaName=typeof row.media_name==='string'&&row.media_name.trim()?row.media_name.trim():localMediaPath?basename(localMediaPath):undefined;
      return{chat:String(row.chat),name:String(row.name??row.chat),id:String(row.id),sender:String(row.sender??'Unknown'),timestamp:new Date(timestamp).toISOString(),fromMe:Number(row.from_me)===1,text:String(row.text||'')||(mediaType?`[Media: ${mediaType}]`:'[Message without text]'),mediaType,mediaName,localMediaPath,localRowPk:Number(row.row_pk),hasText:Number(row.has_text)===1};
    });
  }
  async downloadMedia(s:Settings,message:Message,maxBytes:number):Promise<{data:ArrayBuffer;extension:string}>{
    if(!message.localMediaPath)throw new Error('This media file is not available in the local WhatsApp cache.');
    const database=resolveLocalDatabase(s),root=resolve(dirname(database));
    const path=resolve(isAbsolute(message.localMediaPath)?message.localMediaPath:join(root,'Message',message.localMediaPath));
    if(path!==root&&!path.startsWith(root+sep))throw new Error('The media path is outside the WhatsApp data folder.');
    if(!existsSync(path))throw new Error('This media file is no longer available in the local WhatsApp cache.');
    const stat=await fs.stat(path);if(!stat.isFile()||stat.size<1||stat.size>maxBytes)throw new Error('Media is empty or exceeds the configured size limit.');
    const bytes=await fs.readFile(path);return{data:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),extension:extname(path)||'.opus'};
  }
  async downloadAudio(s:Settings,message:Message,maxBytes:number){return this.downloadMedia(s,message,maxBytes);}
}
