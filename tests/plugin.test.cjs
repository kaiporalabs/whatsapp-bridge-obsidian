global.window={setTimeout,clearTimeout};
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
class TFile{constructor(path){this.path=path;}}
class TFolder{constructor(path){this.path=path;}}
class Plugin{ }
class Modal{}
const original=Module._load;
Module._load=function(name,...args){if(name==='electron')return {};if(name==='obsidian')return{Plugin,PluginSettingTab:class{},Modal,Notice:class{},TFile,TFolder,getLanguage:()=> 'en'};return original.call(this,name,...args);};
const Bridge=require('../.test-build/main.cjs').default;
const {BridgeSettings}=require('../.test-build/settings.cjs');
const {audioIndexPath,indexedRecords}=require('../.test-build/audio.cjs');
Module._load=original;
const row={chat:'x@g.us',name:'Test',id:'1',timestamp:'2026-09-29T12:00:00.000Z',fromMe:false,sender:'Alice',text:'fixture'};
test('declarative settings preserve connection actions and clean up their subscriptions',()=>{
  const p=new Bridge();p.manifest={version:'0.4.3'};
  const tab=new BridgeSettings({},p),items=tab.getSettingDefinitions();
  const names=items.map(item=>item.name);
  for(const name of ['2. Connect WhatsApp','3. Synchronization','Disconnect WhatsApp','Import','Advanced options','OpenAI API key'])assert.ok(names.includes(name),name);
  assert.equal(Object.hasOwn(BridgeSettings.prototype,'display'),false);
  const buttons=[];
  const row={addButton(fn){const button={setButtonText(){return this;},onClick(fn){this.click=fn;return this;},setDisabled(value){this.disabled=value;return this;}};buttons.push(button);fn(button);return this;}};
  const sync=items.find(item=>item.name==='3. Synchronization');
  const cleanup=sync.render(row);
  assert.equal(buttons[0].disabled,false);assert.equal(buttons[1].disabled,true);
  p.collector.state.running=true;p.collector.notify();
  assert.equal(buttons[0].disabled,true);assert.equal(buttons[1].disabled,false);
  cleanup();p.collector.state.running=false;p.collector.notify();assert.equal(buttons[0].disabled,true);
});
function setup(){
  const p=new Bridge();const files=new Map(),contents=new Map(),binaries=new Map();
  p.status={setText(){}};
  p.client={read:async()=>[row],cancel(){}};
  p.app={vault:{
    getAbstractFileByPath:path=>files.get(path),
    createFolder:async path=>files.set(path,new TFolder(path)),
    create:async(path,text)=>{if(files.has(path))throw Error('exists');files.set(path,new TFile(path));contents.set(path,text);},
    createBinary:async(path,data)=>{if(files.has(path))throw Error('exists');files.set(path,new TFile(path));binaries.set(path,data);},
    read:async file=>contents.get(file.path),readBinary:async file=>binaries.get(file.path),
    process:async(file,fn)=>contents.set(file.path,fn(contents.get(file.path)))
  }};
  return{p,files,contents,binaries};
}
test('plugin imports through vault API and second run is idempotent',async()=>{
  const {p,contents}=setup();await p.run(false);assert.equal(contents.size,1);const before=[...contents.values()][0];
  await p.run(false);assert.equal([...contents.values()][0],before);assert.match(p.lastResult,/0 message/);
});
test('connection test never writes notes',async()=>{const{p,contents}=setup();await p.run(true);assert.equal(contents.size,0);assert.match(p.lastResult,/Local read OK/);});
test('reader failure leaves vault untouched',async()=>{const{p,contents}=setup();p.client.read=async()=>{throw Error('incompatible');};await p.run(false);assert.equal(contents.size,0);assert.match(p.lastResult,/incompatible/);});
test('disabled groups are not imported',async()=>{const{p,contents}=setup();p.settings.groups=false;await p.run(false);assert.equal(contents.size,0);});
test('retry after partial write imports remaining chat without duplicates',async()=>{
  const{p,contents}=setup();p.client.read=async()=>[row,{...row,chat:'y@g.us',id:'2'}];
  const create=p.app.vault.create;let attempts=0;
  p.app.vault.create=async(...args)=>{if(++attempts===2)throw Error('disk failure');return create(...args);};
  await p.run(false);assert.equal(contents.size,1);
  p.app.vault.create=create;await p.run(false);assert.equal(contents.size,2);
  assert.equal([...contents.values()].reduce((n,s)=>n+(s.match(/^<!-- wa-bridge:/gm)||[]).length,0),2);
});
test('audio import writes a binary, embeds it and maintains conversation index metadata',async()=>{
  const{p,contents,binaries}=setup();p.settings.downloadAudio=true;
  p.client.read=async()=>[{...row,mediaType:'audio',text:'[Audio]'}];
  p.client.downloadAudio=async()=>({data:Uint8Array.from([79,103,103]).buffer,extension:'.ogg'});
  await p.run(false);
  assert.equal(binaries.size,1);const text=[...contents.values()].join('\n');
  assert.match(text,/!\[\[/);assert.match(text,/WhatsApp Audio Index/);assert.match(text,/Conversation:/);assert.match(text,/Sender: Alice/);assert.match(text,/Sent: 2026/);
});
async function audioFixture(){
  const fixture=setup(),{p}=fixture;p.settings.downloadAudio=true;
  p.client.read=async()=>[{...row,mediaType:'audio',text:'[Audio]',timestamp:'2020-01-01T12:00:00.000Z'}];
  p.client.downloadAudio=async()=>({data:Uint8Array.from([79,103,103]).buffer,extension:'.ogg'});
  await p.run(false);p.settings.downloadAudio=false;p.settings.transcribeAudio=false;
  p.client.read=async()=>{throw Error('must not query WhatsApp');};
  p.client.downloadAudio=async()=>{throw Error('must not download');};
  return fixture;
}
test('pending and all work on old downloaded audio with automatic transcription disabled',async()=>{
  const{p,contents}=await audioFixture();let calls=0;
  p.settings.transcriptionProvider='local';p.settings.whisperExecutable='C:\\faster-whisper-xxl.exe';
  p.whisper={transcribe:async()=>{calls++;return 'Transcript '+calls;},cancel(){}};
  await p.reprocessAudio(false);assert.equal(calls,1);
  let records=indexedRecords(contents.get(audioIndexPath(p.settings)));assert.equal(records[0].transcript,'Transcript 1');
  await p.reprocessAudio(false);assert.equal(calls,1);
  await p.reprocessAudio(true);assert.equal(calls,2);
  records=indexedRecords(contents.get(audioIndexPath(p.settings)));assert.equal(records[0].transcript,'Transcript 2');
  assert.match(contents.get(records[0].note),/Transcript 2/);assert.doesNotMatch(contents.get(records[0].note),/Transcript 1/);
  p.whisper.transcribe=async()=>{throw Error('model missing');};
  await p.reprocessAudio(true);
  records=indexedRecords(contents.get(audioIndexPath(p.settings)));assert.equal(records[0].transcript,'Transcript 2');assert.equal(records[0].status,'transcribed');
  assert.match(p.lastResult,/1 failed/);assert.match(contents.get(records[0].note),/Transcript 2/);
});
test('missing files and invalid indexed paths do not trigger transcription',async()=>{
  const{p,contents,binaries,files}=await audioFixture();let calls=0;
  p.transcribeAudioData=async()=>{calls++;return 'not called';};
  const binary=[...binaries.keys()][0];files.delete(binary);
  await p.reprocessAudio(false);assert.equal(calls,0);assert.match(p.lastResult,/1 failed/);
  const index=audioIndexPath(p.settings);contents.set(index,contents.get(index).replace(binary,'../outside.ogg'));
  await p.reprocessAudio(false);assert.equal(calls,0);assert.match(p.lastResult,/1 failed/);
});
test('failed pending transcripts are retried and cancellation preserves index',async()=>{
  const{p,contents}=await audioFixture();const index=audioIndexPath(p.settings);
  p.transcribeAudioData=async()=>{throw Error('HTTP 429');};await p.reprocessAudio(false);assert.match(contents.get(index),/transcription_failed/);
  const failed=contents.get(index);p.transcribeAudioData=async()=>{p.stopProcessing();throw Error('cancelled');};
  await p.reprocessAudio(false);assert.equal(contents.get(index),failed);assert.match(p.lastResult,/Cancelled/);
  p.transcribeAudioData=async()=> 'Recovered';await p.reprocessAudio(false);assert.match(contents.get(index),/Recovered/);
});
