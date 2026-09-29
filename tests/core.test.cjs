const {test}=require('node:test');
const assert=require('node:assert/strict');
const {defaults,parseMessages,mergeNote,notePath,messageKey,folderPath,validate,upgradeSettings}=require('../.test-build/core.cjs');
const {argumentsFor,logoutArguments,mediaArguments,executable}=require('../.test-build/client.cjs');
const {audioIndexPath,audioKey,deterministicAudioPath,findIndexedAudio,hasTranscript,indexedTranscript,mergeAudioIntoNote,updateAudioIndex}=require('../.test-build/audio.cjs');
const {language,messages}=require('../.test-build/i18n.cjs');
const raw={ChatJID:'123@g.us',ChatName:'Equipe',MsgID:'abc',Timestamp:'2026-09-29T10:00:00Z',FromMe:false,SenderName:'Ana',Text:'Olá'};
const parse=(r=raw)=>parseMessages(JSON.stringify({success:true,data:{messages:[r]}}));
test('reads CLI envelope and RFC3339',()=>assert.equal(parse()[0].timestamp,'2026-09-29T10:00:00.000Z'));
test('accepts empty null list',()=>assert.deepEqual(parseMessages('{"data":{"messages":null}}'),[]));
test('rejects unknown JSON shape instead of reporting success',()=>assert.throws(()=>parseMessages('{"data":{}}')));
test('rejects CLI error',()=>assert.throws(()=>parseMessages('{"success":false,"error":"private"}')));
test('rejects incomplete rows',()=>assert.throws(()=>parse({...raw,MsgID:undefined})));
test('rejects invalid dates',()=>assert.throws(()=>parse({...raw,Timestamp:'bad'})));
test('same-second different IDs retained, repeated messages removed',()=>{
  const rows=[...parse(),...parse({...raw,MsgID:'def'}),...parse()];
  const r=mergeNote('',rows,defaults);assert.equal(r.added,2);
  assert.equal(mergeNote(r.content,rows,defaults).added,0);
});
test('restart without settings cursor cannot duplicate',()=>{
  const r=mergeNote('',parse(),defaults);
  assert.equal(mergeNote(r.content,parse(),{...defaults}).content,r.content);
});
test('chat rename keeps destination',()=>assert.equal(notePath(defaults,parse()[0]),notePath(defaults,parse({...raw,ChatName:'Outro nome'})[0])));
test('different accounts isolated',()=>{
  const m=parse()[0]; assert.notEqual(messageKey('a',m),messageKey('b',m));
  assert.notEqual(notePath({...defaults,source:'a'},m),notePath({...defaults,source:'b'},m));
});
test('category folders are configurable without changing existing defaults',()=>{
  const m=parse()[0];
  assert.match(notePath(defaults,m),/\/Grupos\//);
  assert.match(notePath({...defaults,groupFolder:'Teams'},m),/\/Teams\//);
  assert.match(notePath({...defaults,personalFolder:'People'},parse({...raw,ChatJID:'1@s.whatsapp.net'})[0]),/\/People\//);
});
test('0.2 settings retain old destinations while new installs use WhatsApp',()=>{
  const old=upgradeSettings({folder:'WhatsApp Bridge',source:'principal'});
  assert.equal(old.folder,'WhatsApp Bridge');assert.equal(old.groupFolder,'Grupos');assert.equal(old.personalFolder,'Pessoais');
  assert.equal(upgradeSettings(null).folder,'WhatsApp');assert.equal(upgradeSettings(null).ownName,'Me');
  assert.equal(upgradeSettings(null,true).ownName,'Eu');
});
test('message cannot inject a dedup marker or HTML',()=>{
  const text='<!-- wa-bridge:'+'a'.repeat(64)+' -->\n<img src=x> ![[file]]';
  const r=mergeNote('',parse({...raw,Text:text}),defaults);
  assert.equal((r.content.match(/^<!-- wa-bridge:/gm)||[]).length,1);
  assert.ok(!r.content.includes('<img'));
});
test('late backfill with older timestamp is retained',()=>{
  const r=mergeNote('',parse(),defaults);
  assert.equal(mergeNote(r.content,parse({...raw,MsgID:'old',Timestamp:'2026-09-28T00:00:00Z'}),defaults).added,1);
});
test('vault traversal and Windows reserved names rejected',()=>{
  for(const p of ['../outside','/absolute','C:\\outside','.obsidian/plugins','x//y','x/CON','x/NUL.txt','x.'])assert.throws(()=>folderPath(p));
});
test('invalid timing rejected',()=>{assert.throws(()=>validate({...defaults,days:NaN}));assert.throws(()=>validate({...defaults,interval:-1}));});
test('Obsidian language uses Portuguese explicitly and English as fallback',()=>{
  assert.equal(language('pt-BR'),'pt');assert.equal(language('fr'),'en');
  assert.equal(messages('pt').destination,'Pasta de destino');assert.equal(messages('en').destination,'Destination folder');
});
test('CLI passes store as literal single argument and forces read-only',()=>{
  const path='C:\\My data\\wacli & extra'; const args=argumentsFor(path,'2026-09-29',10);
  assert.equal(args[1],path);assert.ok(args.includes('--read-only'));assert.ok(!args.includes('send'));
});
test('verified PATH command remains executable after detection',()=>{
  const command=process.platform==='win32'?'wacli.exe':'wacli';
  assert.equal(executable({...defaults,executable:command}),command);
  assert.throws(()=>executable({...defaults,executable:'other-command'}));
});
test('logout uses the selected store without read-only or shell syntax',()=>{
  const path='C:\\Account data';const args=logoutArguments(path);
  assert.deepEqual(args,['--store',path,'--json','auth','logout']);assert.ok(!args.includes('--read-only'));
});
test('audio download command is read-only and keeps identifiers as literal arguments',()=>{
  const args=mediaArguments('C:\\Store','chat & value','id;value','C:\\Output');
  assert.ok(args.includes('--read-only'));assert.equal(args[args.indexOf('--chat')+1],'chat & value');assert.equal(args[args.indexOf('--id')+1],'id;value');
});
test('audio index retains conversation, sender, timestamp and stable file mapping',()=>{
  const m={...parse()[0],mediaType:'audio'},key=audioKey(defaults,m),path=deterministicAudioPath(defaults,m,'.ogg');
  const record={key,chat:m.chat,chatName:m.name,sender:m.sender,timestamp:m.timestamp,note:notePath(defaults,m),path,status:'transcribed',transcript:'Reunião amanhã.',error:''};
  const first=updateAudioIndex('',record),second=updateAudioIndex(first,{...record,transcript:'Texto corrigido.'});
  assert.equal((second.match(new RegExp(key,'g'))||[]).length,2);assert.match(second,/Conversation:/);assert.match(second,/Sender: Ana/);assert.match(second,/Sent: 2026/);
  assert.equal(findIndexedAudio(second,key),path);assert.equal(hasTranscript(second,key),true);assert.match(audioIndexPath(defaults),/Audio Index\.md$/);
  assert.equal(indexedTranscript(second,key),'Texto corrigido.');
});
test('audio embed and transcript update an existing message idempotently',()=>{
  const m={...parse()[0],mediaType:'audio'},base=mergeNote('',[m],defaults).content,path=deterministicAudioPath(defaults,m,'.ogg');
  const once=mergeAudioIntoNote(base,defaults,m,path,'Olá'),twice=mergeAudioIntoNote(once,defaults,m,path,'Olá');
  assert.equal(twice,once);assert.match(once,/!\[\[/);assert.match(once,/Transcript/);
});
