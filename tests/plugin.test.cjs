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
  const p=new Bridge();const files=new Map(),contents=new Map();
  p.status={setText(){}};
  p.client={read:async()=>[row],cancel(){}};
  p.app={vault:{
    getAbstractFileByPath:path=>files.get(path),
    createFolder:async path=>files.set(path,new TFolder(path)),
    create:async(path,text)=>{if(files.has(path))throw Error('exists');files.set(path,new TFile(path));contents.set(path,text);},
    process:async(file,fn)=>contents.set(file.path,fn(contents.get(file.path)))
  }};
  return{p,files,contents};
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
