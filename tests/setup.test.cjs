global.window={setTimeout,clearTimeout};
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {gzipSync}=require('node:zlib');
const {createHash}=require('node:crypto');
const {zipSync}=require('fflate');
const cp=require('node:child_process');
const {findCompatibleExecutable}=require('../.test-build/client.cjs');
const {Collector,EventLines,collectorArgs}=require('../.test-build/collector.cjs');
const {defaults}=require('../.test-build/core.cjs');
const Module=require('node:module');
const load=Module._load;
Module._load=function(name,...args){return name==='obsidian'?{Modal:class{}}:load.call(this,name,...args);};
const {checkExecutable,assetName}=require('../.test-build/connector.cjs');
Module._load=load;
test('external connector rejects archives and incompatible versions without changing the file',async()=>{
  const fs=require('node:fs');const dir=mkdtempSync(join(tmpdir(),'wa-external-test-'));
  const path=join(dir,process.platform==='win32'?'wacli.exe':'wacli');fs.writeFileSync(path,'fixture');
  let calls=0;const run=(bin,args,options,done)=>{calls++;assert.equal(bin,path);assert.deepEqual(args,['--version']);assert.equal(options.shell,false);done(null,'wacli 0.19.0','');};
  try{
    await assert.rejects(checkExecutable(path+'.zip',run));assert.equal(calls,0);
    await checkExecutable(path,run);assert.equal(calls,1);assert.equal(fs.readFileSync(path,'utf8'),'fixture');
    await assert.rejects(checkExecutable(path,(bin,args,options,done)=>done(null,'wacli 0.20.0','')));
    assert.equal(assetName('win32','x64'),'wacli_0.19.0_windows_amd64.zip');assert.equal(assetName('win32','arm64'),'');
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('PATH detection accepts only the pinned compatible wacli version',async()=>{
  const calls=[];
  const compatible=(file,args,options,done)=>{calls.push(file);done(file.includes('homebrew')?null:Error('missing'),file.includes('homebrew')?'wacli version 0.19.0':'','');};
  const found=await findCompatibleExecutable(compatible);
  if(process.platform==='darwin')assert.equal(found,'/opt/homebrew/bin/wacli');
  else assert.equal(found,null);
  const old=(file,args,options,done)=>done(null,'wacli version 0.18.0','');
  assert.equal(await findCompatibleExecutable(old),null);
});



test('NDJSON handles fragmented events and ignores ordinary stderr',()=>{
  const parser=new EventLines(),events=[];
  parser.push('log line\n{"event":"qr_',(...a)=>events.push(a));
  parser.push('code","data":{"code":"secret"}}\n',(...a)=>events.push(a));
  assert.deepEqual(events,[['qr_code',{code:'secret'}]]);
  assert.throws(()=>parser.push('x'.repeat(130*1024),()=>{}));
});
test('collector ignores primitive JSON and normalizes invalid event data',()=>{
  const parser=new EventLines(),events=[];
  parser.push('null\n42\n[]\n{"event":42}\n{"event":"connected","data":[]}\n{"event":"qr_code","data":{"code":"test"}}\n',(...args)=>events.push(args));
  assert.deepEqual(events,[['connected',{}],['qr_code',{code:'test'}]]);
});
test('collector command contains no shell and no send operation',()=>{
  const args=collectorArgs('auth','C:\\Path with spaces');
  assert.equal(args[1],'C:\\Path with spaces');assert.ok(args.includes('--events'));assert.ok(args.includes('--follow'));assert.ok(!args.includes('--json'));
});
test('collector owns one child, clears QR on connect, stops it and handles revocation',()=>{
  const old=cp.spawn,dir=mkdtempSync(join(tmpdir(),'wa-collector-test-'));let child,launch;
  cp.spawn=(bin,args,options)=>{launch={bin,args,options};child=new EventEmitter();child.stderr=new PassThrough();child.kill=()=>true;return child;};
  const c=new Collector();
  try {
    c.start({...defaults,store:dir},'auth');
    assert.equal(launch.options.shell,false);assert.equal(launch.options.windowsHide,true);
    assert.throws(()=>c.start({...defaults,store:dir},'sync'));
    child.stderr.write('{"event":"qr_code","data":{"code":"private-token"}}\n');
    assert.equal(c.state.qr,'private-token');
    child.stderr.write('{"event":"connected"}\n');assert.equal(c.state.qr,'');assert.equal(c.state.connected,true);
    child.stderr.write('{"event":"logged_out"}\n');child.emit('close',0);
    assert.equal(c.state.running,false);assert.match(c.state.status,/revogado/);
    assert.ok(!c.state.status.includes('private-token'));
  } finally {c.dispose();cp.spawn=old;rmSync(dir,{recursive:true,force:true});}
});
test('collector status follows the selected locale',()=>{
  assert.equal(new Collector('en').state.status,'Collector stopped');
  assert.equal(new Collector('pt').state.status,'Coletor parado');
});
test('spawn error is sanitized and child state resets on close',()=>{
  const old=cp.spawn,dir=mkdtempSync(join(tmpdir(),'wa-collector-test-'));let child;
  cp.spawn=()=>{child=new EventEmitter();child.stderr=new PassThrough();child.kill=()=>true;return child;};
  const c=new Collector();
  try {
    c.start({...defaults,store:dir},'sync');child.emit('error',Error('secret path'));child.emit('close',-2);
    assert.equal(c.state.running,false);assert.ok(!c.state.status.includes('secret'));
  }finally{c.dispose();cp.spawn=old;rmSync(dir,{recursive:true,force:true});}
});
test('QR renderer generates a local PNG',async()=>{
  const data=await require('qrcode').toDataURL('synthetic-pairing-payload',{width:320,margin:4});
  assert.ok(data.startsWith('data:image/png;base64,'));
  assert.equal(Buffer.from(data.split(',')[1],'base64').subarray(1,4).toString(),'PNG');
});
test('stop cancels auth, clears QR and prevents premature second child',()=>{
  const old=cp.spawn,dir=mkdtempSync(join(tmpdir(),'wa-collector-test-'));let child,kills=[];
  cp.spawn=()=>{child=new EventEmitter();child.stderr=new PassThrough();child.kill=s=>{kills.push(s);return true;};return child;};
  const c=new Collector();
  try {
    c.start({...defaults,store:dir},'auth');child.stderr.write('{"event":"qr_code","data":{"code":"secret"}}\n');
    c.stop();assert.equal(c.state.qr,'');assert.deepEqual(kills,['SIGTERM']);
    assert.throws(()=>c.start({...defaults,store:dir},'auth'));
    child.emit('close',0);assert.equal(c.state.running,false);
    c.start({...defaults,store:dir},'sync');c.dispose();assert.deepEqual(kills,['SIGTERM','SIGTERM']);child.emit('close',0);
  }finally{c.dispose();cp.spawn=old;rmSync(dir,{recursive:true,force:true});}
});
