const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {openServices}=require('./server/context.cjs'),{createSeedanceApi,cnyPrice}=require('./server/seedance-api.cjs'),{movement,reconcileJob}=require('./server/billing.cjs');
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0oUAAAAASUVORK5CYII=','base64');
function fixture(fetchImpl){const root=fs.mkdtempSync(path.join(os.tmpdir(),'sd-api-')),s=openServices({cwd:__dirname,env:{STORYDOCK_ROOT:root,STORYDOCK_MASTER_KEY:path.join(root,'key')}});s.seedanceApi=createSeedanceApi(s,{fetchImpl,sleep:async()=>{}});const user={id:crypto.randomUUID(),role:'admin'};s.db.prepare('INSERT INTO app_users(id,username,password_hash,role,created_at) VALUES(?,?,?,?,?)').run(user.id,user.id,'test','admin',new Date().toISOString());movement(s.db,{userId:user.id,key:'test-topup',action:'topup',available:10000,frozen:0,amount:10000});const p=s.repos.content.createProject({name:'API tests'}).project;return {s,user,p,close(){s.db.close();fs.rmSync(root,{recursive:true,force:true});}};}
function json(data,status=200){return new Response(JSON.stringify({code:0,data}),{status,headers:{'content-type':'application/json'}});}
test('CNY accounting uses decimal arithmetic, preserves free quotes and rounds upward once',()=>{assert.equal(cnyPrice('1.01',50),152);assert.equal(cnyPrice('0'),0);assert.equal(cnyPrice('0.000001'),1);assert.equal(cnyPrice('2.4',0),240);assert.equal(cnyPrice(0.75625487),76);assert.equal(cnyPrice(1e-8),1);for(const v of [-1,NaN,'$2','1e3','1.2.3'])assert.throws(()=>cnyPrice(v));});
test('config is encrypted and API models stay hidden until enabled',()=>{const f=fixture();try{assert.equal(f.s.billing.listOffers().filter(o=>o.provider==='seedance_api').length,0);const c=f.s.seedanceApi.save({revision:0,apiKey:'sensitive-test-key',enabled:true,markupPercent:50});assert.equal(c.currency,'CNY');assert.equal(JSON.stringify(c).includes('sensitive'),false);assert.equal(f.s.db.prepare("SELECT ciphertext FROM secrets WHERE purpose='seedance-api-key'").get().ciphertext.includes('sensitive-test-key'),false);assert.equal(f.s.billing.listOffers().filter(o=>o.provider==='seedance_api').length,2);assert.throws(()=>f.s.seedanceApi.save({revision:0,enabled:false}),/已更新/);}finally{f.close();}});
test('reference upload, binding, exact quote, idempotent submission and final CNY settlement',async()=>{
 const calls=[];let pending=true;
 const f=fixture(async(url,opts)=>{const body=opts.body&&!Buffer.isBuffer(opts.body)?JSON.parse(opts.body):null;calls.push({url,opts,body});if(url.endsWith('/uploads'))return json({disposition:'reused',reference:{storage_object_id:'stored-1'}});if(url.endsWith('/estimate')){if(pending){pending=false;return json({estimate_pending:true});}return json({estimated_cost:'1.01',currency:'CNY'});}if(url.endsWith('/video-generations'))return json({id:'remote-1'},202);if(url.endsWith('/remote-1'))return json({id:'remote-1',status:'succeeded',billing_status:'billed',final_cost:'0.80',result:{video_url:'https://6godboy.com/result'}});throw Error('unexpected '+url);});
 try{
  f.s.seedanceApi.save({revision:0,apiKey:'test-key',enabled:true,markupPercent:50});
  const c=f.s.repos.content,a=c.createAsset({projectId:f.p.id,name:'医生',type:'角色',prompt:'test'}),v=await c.addVersion(a.id,{bytes:PNG,source:'upload'});c.setLockedVersion(a.id,v.id);
  const shot=c.createShot({projectId:f.p.id,episode:1,number:1,title:'镜头',duration:15,prompt:'@医生 走来，@医生 站住'});
  const q=await f.s.billing.quote(f.user,f.p.id,{sourceIds:[shot.id],offerId:'api-seedance-2.0-fast'});assert.equal(q.amount,450);assert.equal(calls.length,0);assert.equal(q.items[0].officialCredits,null);
  assert.equal(q.items[0].costCny,'3.00');
  const result=f.s.billing.confirm(f.user,q.id),job=f.s.repos.jobs.getJob(result.jobIds[0]);assert.equal(job.provider,'seedance_api');assert.equal(f.s.billing.confirm(f.user,q.id).jobIds[0],job.id);
  const provider=f.s.seedanceApi.provider();await provider.prepare(job);const prepared=JSON.parse(f.s.db.prepare('SELECT request_json FROM seedance_api_runs WHERE job_id=?').get(job.id).request_json);assert.equal(prepared.content.length,1);assert.equal(prepared.prompt,'[@Image 1] 走来，[@Image 1] 站住');const submitted=await provider.submit(job);assert.equal(submitted.remoteTaskId,'remote-1');await provider.submit(job);const submits=calls.filter(c=>c.url.endsWith('/video-generations'));assert.equal(submits[0].opts.headers['X-Request-ID'],submits[1].opts.headers['X-Request-ID']);assert.deepEqual(submits[0].body,prepared);assert.equal(calls.some(c=>c.url.endsWith('/estimate')),false);
  f.s.seedanceApi.save({revision:1,apiKey:'rotated-key',enabled:true,markupPercent:90});
  const usage=await provider.usage({...job,remoteTaskId:'remote-1'});assert.equal(calls.at(-1).opts.headers.Authorization,'Bearer test-key');f.s.db.prepare("UPDATE jobs SET status='succeeded',remote_task_id=?,result_json=? WHERE id=?").run('remote-1',JSON.stringify({officialUsage:usage}),job.id);reconcileJob(f.s.db,job.id);reconcileJob(f.s.db,job.id);
  const bill=f.s.db.prepare('SELECT * FROM job_billing WHERE job_id=?').get(job.id);assert.equal(bill.status,'settled');assert.equal(bill.charged,120);assert.equal(f.s.billing.wallet(f.user.id).available,9880);
 }finally{f.close();}
});
test('missing actual bill never settles using estimate; confirmed failure refunds once',async()=>{const f=fixture(async()=>json({estimated_cost:2,currency:'CNY'}));try{f.s.seedanceApi.save({revision:0,apiKey:'test',enabled:true,markupPercent:0});const shot=f.s.repos.content.createShot({projectId:f.p.id,episode:1,number:1,title:'text',duration:4,prompt:'sea'});const q=await f.s.billing.quote(f.user,f.p.id,{sourceIds:[shot.id],offerId:'api-seedance-2.0'}),r=f.s.billing.confirm(f.user,q.id),id=r.jobIds[0];f.s.db.prepare("UPDATE jobs SET status='succeeded',remote_task_id='r' WHERE id=?").run(id);reconcileJob(f.s.db,id);assert.equal(f.s.db.prepare('SELECT status FROM job_billing WHERE job_id=?').get(id).status,'frozen');f.s.db.prepare("UPDATE jobs SET status='failed' WHERE id=?").run(id);reconcileJob(f.s.db,id);reconcileJob(f.s.db,id);assert.equal(f.s.billing.wallet(f.user.id).available,10000);}finally{f.close();}});
test('timeout does not invent a remote task or report confirmed failure',async()=>{const f=fixture(async()=>{throw Error('timeout');});try{f.s.seedanceApi.save({revision:0,apiKey:'test',enabled:true,markupPercent:0});f.s.db.prepare('INSERT INTO seedance_api_runs(job_id,request_json,request_id) VALUES(?,?,?)').run('j','{}','stable');assert.equal((await f.s.seedanceApi.provider().submit({id:'j'})).outcome,'retry');}finally{f.close();}});
test('fixed quote never uploads or estimates; confirmed generation prepares references with single part zero',async()=>{
 const calls=[];const f=fixture(async(url,opts)=>{calls.push({url,opts});if(url.endsWith('/uploads'))return json({disposition:'owner',session_token:'session',generation:1,upload:{mode:'single'}});if(url.endsWith('/relay'))return json({});if(url.endsWith('/complete'))return json({storage_object_id:'verified'});throw Error('unexpected remote call '+url);});
 try{f.s.seedanceApi.save({revision:0,apiKey:'test',enabled:true,markupPercent:0});const c=f.s.repos.content,a=c.createAsset({projectId:f.p.id,name:'场景',type:'场景',prompt:'empty'}),v=await c.addVersion(a.id,{bytes:PNG,source:'upload'});c.setLockedVersion(a.id,v.id);const shot=c.createShot({projectId:f.p.id,episode:1,number:1,title:'reference',duration:13,prompt:'@场景 镜头前推'});
 const q=await f.s.billing.quote(f.user,f.p.id,{sourceIds:[shot.id],offerId:'api-seedance-2.0'});assert.equal(q.amount,559);assert.equal(calls.length,0);assert.equal(q.items[0].source,'api_fixed_cny');
 const r=f.s.billing.confirm(f.user,q.id),job=f.s.repos.jobs.getJob(r.jobIds[0]);await f.s.seedanceApi.provider().prepare(job);const relay=calls.find(c=>c.url.endsWith('/relay'));assert.equal(relay.opts.headers['X-Upload-Part'],'0');assert.deepEqual(relay.opts.body,PNG);assert.equal(calls.some(c=>c.url.endsWith('/estimate')),false);
 await assert.rejects(f.s.seedanceApi.estimate(f.p.id,{sourceIds:[shot.id],model:'seedance-2.5-draft'}),/固定单价/);
 }finally{f.close();}
});

test("fixed voice assets are submitted as audio references with their own numbering", async () => {
  const uploads = [];
  const f = fixture(async (url, options) => {
    if (url.endsWith("/uploads")) {
      const { kind, content_type } = JSON.parse(options.body);
      uploads.push({ kind, content_type });
      return json({ disposition: "reused", storage_object_id: "stored-" + kind });
    }
    if (url.endsWith("/video-generations")) {
      assert.deepEqual(JSON.parse(options.body).content, [
        { type: "audio_url", role: "reference_audio", storage_object_id: "stored-audio" },
        { type: "image_url", role: "reference_image", storage_object_id: "stored-image" },
      ]);
      return json({ id: "video" });
    }
    throw Error("unexpected " + url);
  });
  try {
    f.s.seedanceApi.save({ revision: 0, apiKey: "test", enabled: true, markupPercent: 0 });
    const content = f.s.repos.content;
    const voice = content.createAsset({ projectId: f.p.id, name: "知性女声", type: "音色" });
    const wav = Buffer.alloc(44 + 64000);
    wav.write("RIFF");
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(16000, 24);
    wav.writeUInt32LE(32000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(wav.length - 44, 40);

    await assert.rejects(content.addVersion(voice.id, { bytes: PNG, source: "upload" }), /WAV 或 MP3/);
    const audio = await content.addVersion(voice.id, { bytes: wav, source: "upload" });
    content.setLockedVersion(voice.id, audio.id);
    const project = require("./server/present.cjs").presentProject(content.graph(f.p.id));
    const voiceAsset = project.data.assets.find(asset => asset.id === voice.id);
    assert.equal(voiceAsset.audio, "/api/v1/media/" + audio.mediaId);
    assert.equal(voiceAsset.image, "");

    const scene = content.createAsset({ projectId: f.p.id, name: "溪谷", type: "场景" });
    const image = await content.addVersion(scene.id, { bytes: PNG, source: "upload" });
    content.setLockedVersion(scene.id, image.id);
    const shot = content.createShot({
      projectId: f.p.id, episode: 1, number: 1, title: "溪谷", duration: 11,
      prompt: "@知性女声 作为旁白。@溪谷 缓慢推近。@知性女声 延续同一音色。",
    });

    const quote = await f.s.billing.quote(f.user, f.p.id, { sourceIds: [shot.id], offerId: "api-seedance-2.0" });
    assert.equal(uploads.length, 0);
    const result = f.s.billing.confirm(f.user, quote.id);
    const job = f.s.repos.jobs.getJob(result.jobIds[0]);
    const provider = f.s.seedanceApi.provider();
    await provider.prepare(job);
    assert.deepEqual(uploads, [
      { kind: "audio", content_type: "audio/wav" },
      { kind: "image", content_type: "image/png" },
    ]);
    const request = f.s.db.prepare("SELECT request_json FROM seedance_api_runs WHERE job_id=?").get(job.id);
    assert.equal(JSON.parse(request.request_json).prompt, "[@Audio 1] 作为旁白。[@Image 1] 缓慢推近。[@Audio 1] 延续同一音色。");
    assert.equal((await provider.submit(job)).remoteTaskId, "video");
  } finally {
    f.close();
  }
});
