const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const original=Module._load;
Module._load=function(name,...args){if(name==='electron')return {};if(name==='obsidian')return {Modal:class{}};return original.call(this,name,...args);};
const {LocalWhisper,whisperArgs,whisperPath}=require('../.test-build/whisper.cjs');
const {indexedRecords,updateAudioIndex,mergeAudioByKey}=require('../.test-build/audio.cjs');
Module._load=original;
test('Whisper validates Windows filename, language and model without shell syntax',()=>{
  assert.equal(whisperPath('"C:\\Audio tools\\faster-whisper-xxl.exe"','win32'),'C:\\Audio tools\\faster-whisper-xxl.exe');
  for(const value of ['faster-whisper-xxl.exe','C:\\whisper.exe','C:\\faster-whisper-xxl.exe --help'])assert.throws(()=>whisperPath(value,'win32'));
  assert.throws(()=>whisperPath('/tmp/faster-whisper-xxl','darwin'));
  const args=whisperArgs('C:\\My audio & test.ogg','C:\\Output','medium','auto');
  assert.equal(args[0],'C:\\My audio & test.ogg');assert.ok(!args.includes('--language'));
  assert.deepEqual(whisperArgs('audio','out','small','pt').slice(-2),['--language','pt']);
  assert.throws(()=>whisperArgs('a','b','--help','pt'));
});
test('local runner passes audio bytes, reads UTF-8 transcript and removes temporary files',async()=>{
  let dir;
  const run=(bin,args,options,done)=>{
    assert.equal(options.shell,false);assert.ok(options.timeout>0);assert.equal(options.killSignal,'SIGKILL');
    assert.deepEqual([...fs.readFileSync(args[0])],[1,2,3]);
    dir=args[args.indexOf('--output_dir')+1];fs.writeFileSync(path.join(dir,'audio.txt'),'\uFEFFOlá $&');
    setImmediate(()=>done(null,'',''));return {kill(){}};
  };
  const runner=new LocalWhisper(run,'win32');
  assert.equal(await runner.transcribe(Uint8Array.from([1,2,3]).buffer,'audio.ogg','C:\\faster-whisper-xxl.exe','medium','pt'),'Olá $&');
  assert.equal(fs.existsSync(dir),false);
});
test('local runner cancellation sanitizes errors and cleans up audio',async()=>{
  let dir,started;
  const ready=new Promise(resolve=>started=resolve);
  const run=(bin,args,options,done)=>{dir=args[args.indexOf('--output_dir')+1];started();return {kill(signal){assert.equal(signal,'SIGKILL');setImmediate(()=>done(new Error('private transcript')));}};};
  const runner=new LocalWhisper(run,'win32');
  const result=runner.transcribe(new Uint8Array([1]).buffer,'test.ogg','C:\\faster-whisper-xxl.exe','small','auto');
  await ready;runner.cancel();await assert.rejects(result,/cancelled/);assert.equal(fs.existsSync(dir),false);
});
test('legacy Markdown indexes round-trip metadata and dollar replacement text',()=>{
  const record={key:'a'.repeat(64),chat:'group@g.us',chatName:'A [team] & stuff',sender:'Ana * B',timestamp:'2026-01-01T12:00:00.000Z',note:'WhatsApp/principal/Grupos/chat.md',path:'WhatsApp/principal/Media/Audio/a.ogg',status:'transcribed',transcript:'$& $` test <hello>',error:''};
  const index=updateAudioIndex('',record);
  assert.deepEqual(indexedRecords(updateAudioIndex(index,record)),[record]);
  const note=`<!-- wa-bridge:${record.key} -->`;
  const once=mergeAudioByKey(note,record.key,record.path,record.transcript);
  assert.equal(mergeAudioByKey(once,record.key,record.path,record.transcript),once);
});
