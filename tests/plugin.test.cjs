global.window={setTimeout,clearTimeout};
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
class TFile{constructor(path){this.path=path;}}
class TFolder{constructor(path){this.path=path;}}
class Plugin{ }
class Modal{}
const original=Module._load;
Module._load=function(name,...args){if(name==='obsidian')return{Plugin,PluginSettingTab:class{},Modal,Notice:class{},TFile,TFolder,getLanguage:()=> 'en'};return original.call(this,name,...args);};
const Bridge=require('../.test-build/main.cjs').default;
Module._load=original;
const row={chat:'x@g.us',name:'Test',id:'1',timestamp:'2026-09-29T12:00:00.000Z',fromMe:false,sender:'Alice',text:'fixture'};
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
