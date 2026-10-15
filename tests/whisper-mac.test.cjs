const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module');
const original=Module._load;
Module._load=function(name,...args){if(name==='electron')return {};if(name==='obsidian')return {Modal:class{}};return original.call(this,name,...args);};
const {MacWhisper,checkMacModel,checkMacExecutable,macExecutable,macWhisperArgs,conversionArgs}=require('../.test-build/whisper-mac.cjs');
const {readSavedSettings,upgradeSettings}=require('../.test-build/core.cjs');
Module._load=original;
test('settings migration preserves Windows paths and round-trips separate Mac paths',()=>{
  const old=upgradeSettings({whisperExecutable:'C:\\faster-whisper-xxl.exe',whisperModel:'small',transcriptionProvider:'local'});
  assert.equal(old.whisperExecutable,'C:\\faster-whisper-xxl.exe');assert.equal(old.macWhisperExecutable,'');assert.equal(old.whisperModel,'small');
  const settings={...old,macWhisperExecutable:'/bin/whisper-cli',macWhisperModel:'/models/ggml-small.bin',macFfmpegExecutable:'/bin/ffmpeg'};
  assert.deepEqual(upgradeSettings(readSavedSettings({settings})),settings);
  assert.equal(readSavedSettings({settings:{macWhisperExecutable:7}}).macWhisperExecutable,undefined);
});
function fixture(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wa-mac-test-'));
  const config={macWhisperExecutable:path.join(dir,'whisper-cli'),macFfmpegExecutable:path.join(dir,'ffmpeg'),macWhisperModel:path.join(dir,'ggml-small.bin')};
  const header=Buffer.alloc(32);header.writeUInt32LE(0x67676d6c);fs.writeFileSync(config.macWhisperModel,header);
  return {dir,config,cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('Mac validation accepts GGML headers and rejects web pages and wrong executable names',async()=>{
  const {config,cleanup}=fixture();
  try{
    assert.equal(await checkMacModel(config.macWhisperModel),config.macWhisperModel);
    fs.writeFileSync(config.macWhisperModel,'<html>Not a model</html>');await assert.rejects(checkMacModel(config.macWhisperModel),/header/);
    assert.throws(()=>macExecutable('/usr/bin/bash','whisper-cli'));
    assert.throws(()=>macExecutable('whisper-cli','whisper-cli'));
    assert.equal(macExecutable('"/opt/homebrew/bin/whisper-cli"','whisper-cli'),'/opt/homebrew/bin/whisper-cli');
    fs.writeFileSync(config.macWhisperExecutable,'fixture');fs.chmodSync(config.macWhisperExecutable,0o755);
    const run=(bin,args,options,done)=>{assert.deepEqual(args,['--help']);assert.equal(options.shell,false);done(null,'--model --file --language --output-txt --output-file','');};
    assert.equal(await checkMacExecutable(config.macWhisperExecutable,'whisper-cli',run),config.macWhisperExecutable);
    await assert.rejects(checkMacExecutable(config.macWhisperExecutable,'whisper-cli',(bin,args,opt,done)=>done(null,'wrong program','')),/incompatible/);
  }finally{cleanup();}
});
test('conversion is local mono 16k PCM and whisper uses explicit auto language and model',()=>{
  const args=conversionArgs('/audio & space.ogg','/tmp/audio.wav');
  assert.equal(args[args.indexOf('-protocol_whitelist')+1],'file,pipe');
  assert.equal(args[args.indexOf('-i')+1],'/audio & space.ogg');assert.ok(args.includes('16000'));assert.ok(args.includes('pcm_s16le'));
  const whisper=macWhisperArgs('/in.wav','/out','/model with spaces.bin','auto');
  assert.equal(whisper[whisper.indexOf('--model')+1],'/model with spaces.bin');assert.ok(whisper.includes('auto'));assert.ok(!whisper.includes('--translate'));assert.ok(!whisper.includes('--no-gpu'));
  assert.throws(()=>macWhisperArgs('a','b','c','--help'));
});
test('Mac pipeline converts then transcribes and removes temporary audio and text',async()=>{
  const {config,cleanup}=fixture();let dir;const calls=[];
  const run=(bin,args,options,done)=>{
    calls.push(bin);assert.equal(options.shell,false);assert.equal(options.killSignal,'SIGKILL');
    if(bin===config.macFfmpegExecutable){const input=args[args.indexOf('-i')+1];dir=path.dirname(input);assert.deepEqual([...fs.readFileSync(input)],[1,2,3]);fs.writeFileSync(args.at(-1),'wav');}
    else {assert.equal(fs.readFileSync(args[args.indexOf('--file')+1],'utf8'),'wav');fs.writeFileSync(args[args.indexOf('--output-file')+1]+'.txt','\uFEFF Olá local ');}
    setImmediate(()=>done(null,'',''));return {kill(){}};
  };
  try{assert.equal(await new MacWhisper(run).transcribe(Uint8Array.from([1,2,3]).buffer,config,'pt'),'Olá local');assert.deepEqual(calls,[config.macFfmpegExecutable,config.macWhisperExecutable]);assert.equal(fs.existsSync(dir),false);}finally{cleanup();}
});
test('conversion failure never starts transcription and cleans up without exposing output',async()=>{
  const {config,cleanup}=fixture();let dir,calls=0;
  const run=(bin,args,opt,done)=>{calls++;dir=path.dirname(args[args.indexOf('-i')+1]);setImmediate(()=>done(Error('private speech')));return {kill(){}};};
  try{await assert.rejects(new MacWhisper(run).transcribe(new Uint8Array([1]).buffer,config,'auto'),error=>/FFmpeg/.test(error.message)&&!error.message.includes('private'));assert.equal(calls,1);assert.equal(fs.existsSync(dir),false);}finally{cleanup();}
});
test('cancellation during conversion stops the pipeline and removes temporary files',async()=>{
  const {config,cleanup}=fixture();let started,dir,calls=0;const ready=new Promise(resolve=>started=resolve);
  const run=(bin,args,opt,done)=>{calls++;dir=path.dirname(args[args.indexOf('-i')+1]);started();return {kill(signal){assert.equal(signal,'SIGKILL');setImmediate(()=>done(Error('killed')));}};};
  const runner=new MacWhisper(run);
  try{const pending=runner.transcribe(new Uint8Array([1]).buffer,config,'auto');await ready;runner.cancel();await assert.rejects(pending,/Cancelled/);assert.equal(calls,1);assert.equal(fs.existsSync(dir),false);}finally{cleanup();}
});
