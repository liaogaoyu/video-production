const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {inspectMp4,planVideoExport}=require('./server/video-export.cjs');
const {buildDraft}=require('./server/jianying/draft.cjs');
const {writeExportArchive}=require('./server/export-archive.cjs');
const {unzip}=require('./server/zip.cjs');
const {fixture}=require('./test-fixtures/mp4.cjs');
test('actual MP4 duration uses video timescale including 64-bit headers, rejects broken videos',()=>{
 for(const v of [0,1])assert.deepEqual(inspectMp4(fixture(2.75,v)),{durationUs:2750000,width:1920,height:1080});
 assert.throws(()=>inspectMp4(Buffer.from('not a video')),/无法读取视频/);
});
test('export plan sorts shots, uses latest successful version, and reports missing media',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'storydock-plan-'));
 try{
 fs.writeFileSync(path.join(dir,'a'),'x');
 const shots=[{id:'c',episode:2,number:1,title:'缺失'},{id:'b',episode:1,number:2,title:'重复/名'},{id:'a',episode:1,number:1,title:'重复/名'}];
 const jobs=[{id:'old',sourceId:'a',status:'done',video:'/media/old',completedAt:'2026-01-01'},{id:'new',sourceId:'a',status:'done',video:'/media/new',completedAt:'2026-01-02'},{id:'second',sourceId:'b',status:'done',video:'/media/b',completedAt:'2026-01-01'}];
 const db={prepare:()=>({get:id=>({id,storage_key:'a'})})},media={locate:key=>path.join(dir,key)};
 const plan=planVideoExport({id:'p',name:'测试',data:{shots,jobs,settings:{ratio:'9:16'}}},db,media);
 assert.deepEqual(plan.clips.map(c=>c.shotId),['a','b']);assert.equal(plan.clips[0].jobId,'new');assert.equal(plan.missing[0].id,'c');assert.equal(new Set(plan.clips.map(c=>c.file)).size,2);assert.ok(plan.clips.every(c=>!c.file.includes('/')));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('draft timeline is contiguous with actual clip durations, original audio and all bundled paths',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'storydock-draft-'));
 try{
 const source=path.join(dir,'video.mp4');fs.writeFileSync(source,fixture());
 const plan={name:'分镜验证',ratio:'9:16',clips:[{shotId:'one',file:'0001_第一镜.mp4'},{shotId:'two',file:'0002_第二镜.mp4'}],missing:[]};
 const {files,manifest}=buildDraft(plan,()=>source);const archive=path.join(dir,'test.zip');await writeExportArchive(archive,files);
 const extracted=unzip(fs.readFileSync(archive));
 const doc=JSON.parse(extracted.find(f=>f.name==='draft/draft_content.json').data);
 assert.equal(doc.canvas_config.width,1080);assert.equal(doc.duration,5500000);
 assert.deepEqual(doc.tracks[0].segments.map(s=>s.target_timerange),[{start:0,duration:2750000},{start:2750000,duration:2750000}]);assert.ok(doc.tracks[0].segments.every(s=>s.volume===1));assert.equal(manifest.clips.length,2);
 for(const material of doc.materials.videos)assert.ok(extracted.some(f=>f.name==='draft/'+material.path.replace('__STORYDOCK_DRAFT_PATH__/','')));
 for(const file of extracted){const target=path.join(dir,'package',file.name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,file.data);}
 if(process.platform==='darwin'||process.platform==='linux'){
  const root=path.join(dir,'自定义 草稿位置');fs.mkdirSync(root);
  cp.execFileSync('perl',[path.join(dir,'package/import.pl'),root]);
  const dest=path.join(root,'Storydock-'+manifest.id),installed=JSON.parse(fs.readFileSync(path.join(dest,'draft_content.json')));
  assert.equal(installed.duration,5500000);assert.equal(typeof installed.duration,'number');assert.equal(installed.platform.os,'mac');assert.ok(installed.materials.videos.every(m=>fs.existsSync(m.path)));
  const before=fs.readFileSync(path.join(dest,'draft_content.json'));assert.throws(()=>cp.execFileSync('perl',[path.join(dir,'package/import.pl'),root],{stdio:'pipe'}));assert.deepEqual(fs.readFileSync(path.join(dest,'draft_content.json')),before);
 }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
module.exports={fixture};
