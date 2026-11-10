const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openServices}=require('./server/context.cjs'),{createDreaminaWebService,compileReferences}=require('./server/dreamina-web.cjs'),{createScheduler}=require('./worker/scheduler.cjs');
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0oUAAAAASUVORK5CYII=','base64');
function setup(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'sd-web-'));const s=openServices({cwd:__dirname,env:{STORYDOCK_ROOT:root,STORYDOCK_MASTER_KEY:path.join(root,'key')}});const calls=[];let lost=false;const bridge={directory:path.join(__dirname,'vendor/jimeng-api'),proxy:'',close(){},async call(method,token,b){calls.push({method,token,b});if(method==='compliance')return {confirmed:true};if(method==='confirm-compliance')return {confirmed:true};if(method==='credit')return {totalCredit:100};if(method==='submit'){if(lost)throw lost instanceof Error?lost:Error('lost');return {submitId:b.submitId,historyId:'history',model:'dreamina_seedance_40'};}if(method==='query')return {found:true,status:'succeeded',historyId:'history',url:'https://v16-dreamina.capcutcdn-us.com/fixture.mp4'};if(method==='download'){fs.writeFileSync(b.output,Buffer.from([0,0,0,16,102,116,121,112,109,112,52,50,0,0,0,0]));return {size:16};}}};s.web=createDreaminaWebService(s,{bridge});return {s,calls,lose(value=true){lost=value;},close(){s.db.close();fs.rmSync(root,{recursive:true,force:true});}};}
async function fixture(c){const s=c.s,p=s.repos.content.createProject({name:'web test'}).project,a=s.web.create({name:'account',region:'us'});s.web.saveCredential(a.id,'PRIVATE_SESSION','identity');const asset=s.repos.content.createAsset({projectId:p.id,name:'宫廷',type:'场景',prompt:'p'});const version=await s.repos.content.addVersion(asset.id,{bytes:PNG,source:'upload'});s.repos.content.setLockedVersion(asset.id,version.id);const shot=s.repos.content.createShot({projectId:p.id,title:'shot',prompt:'@宫廷 内景，缓慢推进',episode:1,number:1,duration:4});return {p,a,asset,shot,body:{accountId:a.id,model:'jimeng-video-seedance-2.0-fast',sourceIds:[shot.id],ratio:'16:9'}};}
function scheduler(c){return createScheduler({repos:c.s.repos,db:c.s.db,media:c.s.media,owner:'test',providers:{dreamina_web_api:c.s.web.provider()}});}
function due(c,id){c.s.db.prepare('UPDATE jobs SET next_run_at=NULL WHERE id=?').run(id);}
test('web reference compiler handles Chinese adjacency, repeats and longest names',()=>{assert.equal(compileReferences('@宫廷内景中的@宫廷，@宫廷内景',[{assetId:'a',name:'宫廷'},{assetId:'b',name:'宫廷内景'}]),'@image_file_2中的@image_file_1，@image_file_2');});
test('web accounts encrypt credentials and never return them',async()=>{const c=setup();try{const f=await fixture(c);assert.ok(!JSON.stringify(c.s.web.list()).includes('PRIVATE_SESSION'));const row=c.s.db.prepare('SELECT * FROM web_accounts WHERE id=?').get(f.a.id);assert.ok(!row.ciphertext.includes('PRIVATE_SESSION'));assert.equal((await c.s.web.checked(f.a.id)).totalCredit,100);const other=c.s.web.create({name:'duplicate'});assert.throws(()=>c.s.web.saveCredential(other.id,'x','identity'),/已经添加/);}finally{c.close();}});
test('web batch freezes locked media and rejects invalid model or duplicate key changes',async()=>{const c=setup();try{const f=await fixture(c);assert.throws(()=>c.s.web.batch(f.p.id,{...f.body,model:'unknown'},'invalid'),/模型/);const b=c.s.web.batch(f.p.id,f.body,'same');assert.deepEqual(c.s.web.batch(f.p.id,f.body,'same'),b);assert.throws(()=>c.s.web.batch(f.p.id,{...f.body,ratio:'9:16'},'same'),/不一致/);const input=JSON.parse(c.s.repos.jobs.getJob(b.jobIds[0]).inputSnapshot);assert.ok(input.promptSubmitted.startsWith('@image_file_1 内景，缓慢推进\n'));assert.match(input.promptSubmitted,/人物多视角设定板/);assert.equal(input.references[0].assetId,f.asset.id);}finally{c.close();}});
test('web task submits once, downloads and archives completed video',async()=>{const c=setup();try{const f=await fixture(c),b=c.s.web.batch(f.p.id,f.body,'run'),id=b.jobIds[0],w=scheduler(c);await w.tick();due(c,id);await w.tick();await w.tick();assert.equal(c.s.repos.jobs.getJob(id).status,'succeeded');assert.equal(c.calls.filter(x=>x.method==='submit').length,1);assert.ok(c.s.repos.jobs.getJob(id).mediaId);const submit=c.calls.find(x=>x.method==='submit');assert.ok(submit.b.files.image_file_1.filepath);assert.equal(submit.b.references,true);}finally{c.close();}});
test('automatic recovery never resubmits, but explicit retry creates one new frozen task',async()=>{const c=setup();try{const f=await fixture(c),b=c.s.web.batch(f.p.id,f.body,'lost'),id=b.jobIds[0],w=scheduler(c);c.lose();await w.tick();await w.tick();assert.equal(c.calls.filter(x=>x.method==='submit').length,1);const original=c.s.repos.jobs.getJob(id);assert.equal(original.status,'submit_unknown');const query=await c.s.web.provider().query(original);assert.equal(query.outcome,'unknown');assert.equal(c.calls.filter(x=>x.method==='query').length,0);const next=c.s.repos.jobs.retryJob(id);assert.notEqual(next.id,id);assert.equal(next.status,'queued');assert.equal(next.inputSnapshot,original.inputSnapshot);assert.equal(c.s.repos.jobs.retryJob(id).id,next.id);const oldRun=c.s.db.prepare('SELECT * FROM web_runs WHERE job_id=?').get(id),newRun=c.s.db.prepare('SELECT * FROM web_runs WHERE job_id=?').get(next.id);assert.notEqual(oldRun.submit_id,newRun.submit_id);assert.equal(newRun.attempted,0);assert.equal(c.s.repos.jobs.getJob(id).status,'submit_unknown');c.lose(false);await w.tick();assert.equal(c.calls.filter(x=>x.method==='submit').length,2);assert.equal(c.s.repos.jobs.getJob(next.id).status,'remote_running');}finally{c.close();}});
test('retry download keeps the accepted task and does not generate a new video',async()=>{const c=setup();try{const f=await fixture(c),b=c.s.web.batch(f.p.id,f.body,'download'),id=b.jobIds[0];await scheduler(c).tick();c.s.db.prepare("UPDATE jobs SET status='download_failed' WHERE id=?").run(id);const retry=c.s.repos.jobs.retryJob(id);assert.equal(retry.id,id);assert.equal(retry.status,'downloading');assert.equal(c.s.db.prepare('SELECT count(*) n FROM web_runs').get().n,1);assert.equal(c.calls.filter(x=>x.method==='submit').length,1);}finally{c.close();}});
test('account pool rotates frozen jobs across enabled accounts and skips paused accounts',async()=>{const c=setup();try{const f=await fixture(c),other=c.s.web.create({name:'second'});c.s.web.saveCredential(other.id,'OTHER_SESSION','second-identity');const shot=c.s.repos.content.createShot({projectId:f.p.id,title:'second',prompt:'clouds',episode:1,number:2,duration:4});const b=c.s.web.batch(f.p.id,{...f.body,accountId:'auto',sourceIds:[f.shot.id,shot.id]},'pool');assert.notEqual(c.s.repos.jobs.getJob(b.jobIds[0]).accountId,c.s.repos.jobs.getJob(b.jobIds[1]).accountId);c.s.web.update(other.id,{enabled:false});const next=c.s.web.batch(f.p.id,{...f.body,accountId:'auto'},'pool-paused');assert.equal(c.s.repos.jobs.getJob(next.jobIds[0]).accountId,f.a.id);}finally{c.close();}});
test('server login stores only encrypted session and closes its isolated browser',async()=>{const c=setup();let closed=false,listener;try{const page={goto:async()=>{await listener({url:()=> 'https://dreamina.capcut.com/lv/v1/user/web/user_info',json:async()=>({data:{user_info:{user_id:'7627069654591276052'}}})});},screenshot:async()=>Buffer.from('jpeg'),mouse:{click:async()=>{}},keyboard:{insertText:async()=>{}},reload:async()=>{},waitForTimeout:async()=>{}};const ctx={pages:()=>[page],on:(event,fn)=>{if(event==='response')listener=fn;},cookies:async()=>[{name:'sessionid',value:'SESSION_FROM_SERVER_BROWSER'}],close:async()=>{closed=true;}};c.s.web=createDreaminaWebService(c.s,{bridge:{directory:__dirname,close(){},call:async()=>({totalCredit:88})},browserFactory:{launchPersistentContext:async(directory,options)=>{assert.ok(directory.includes('web-profiles'));assert.equal(options.headless,true);return ctx;}}});const a=c.s.web.create({name:'server login'});await c.s.web.startLogin(a.id);assert.ok((await c.s.web.loginFrame(a.id)).image);await assert.rejects(()=>c.s.web.loginInput(a.id,{type:'click',x:9999,y:0}),/坐标/);const ready=await c.s.web.finishLogin(a.id);assert.equal(ready.authorized,true);assert.equal(ready.totalCredit,88);assert.equal(closed,true);assert.ok(!JSON.stringify(c.s.web.list()).includes('SESSION_FROM_SERVER_BROWSER'));await assert.rejects(()=>c.s.web.loginFrame(a.id),/窗口已关闭/);}finally{c.close();}});
test('web account allows three remote tasks and changing concurrency releases queued work',async()=>{const c=setup();try{const f=await fixture(c),ids=[f.shot.id];for(let i=2;i<=4;i++)ids.push(c.s.repos.content.createShot({projectId:f.p.id,title:'shot'+i,prompt:'clouds',episode:1,number:i,duration:4}).id);const b=c.s.web.batch(f.p.id,{...f.body,sourceIds:ids},'concurrency'),w=scheduler(c);for(let i=0;i<3;i++)await w.tick();assert.equal(c.calls.filter(x=>x.method==='submit').length,3);assert.equal(c.s.repos.jobs.claimJob('capacity-test'),null);assert.throws(()=>c.s.web.update(f.a.id,{maxConcurrent:0}),/并发/);const updated=c.s.web.update(f.a.id,{maxConcurrent:4});assert.equal(updated.authorized,true);assert.equal(updated.enabled,true);await w.tick();assert.equal(c.calls.filter(x=>x.method==='submit').length,4);assert.equal(b.jobIds.length,4);}finally{c.close();}});
test('job completion and failure timestamps remain distinct from later status refreshes',async()=>{const c=setup();try{const f=await fixture(c),b=c.s.web.batch(f.p.id,f.body,'times'),id=b.jobIds[0],w=scheduler(c);await w.tick();due(c,id);await w.tick();await w.tick();const done=c.s.repos.jobs.getJob(id);assert.ok(done.completedAt);assert.equal(done.failedAt,null);const submitted=done.createdAt,completed=done.completedAt;c.s.db.prepare('UPDATE jobs SET updated_at=? WHERE id=?').run('2099-01-01T00:00:00.000Z',id);const shown=require('./server/present.cjs').presentJob(c.s.repos.jobs.getJob(id));assert.equal(shown.submittedAt,submitted);assert.equal(shown.completedAt,completed);const next=c.s.web.batch(f.p.id,f.body,'failure-time').jobIds[0];const original=c.s.web.bridge.call.bind(c.s.web.bridge);c.s.web.bridge.call=async(method,...args)=>method==='query'?{status:'failed',code:'TEST'}:original(method,...args);await w.tick();due(c,next);await w.tick();const failed=c.s.repos.jobs.getJob(next);assert.equal(failed.status,'failed');assert.ok(failed.failedAt);assert.equal(failed.completedAt,null);}finally{c.close();}});
test('historical completion time is restored from transition events rather than updated_at',async()=>{const c=setup();try{const f=await fixture(c),id=c.s.web.batch(f.p.id,f.body,'backfill').jobIds[0],w=scheduler(c);await w.tick();due(c,id);await w.tick();await w.tick();const event=c.s.db.prepare("SELECT created_at FROM job_events WHERE job_id=? AND json_extract(payload_json,'$.status')='succeeded' ORDER BY seq DESC LIMIT 1").get(id);c.s.db.prepare("UPDATE jobs SET completed_at=NULL,updated_at='2099-01-01T00:00:00Z' WHERE id=?").run(id);c.s.db.exec('DELETE FROM schema_migrations WHERE version=3');const {installJobTimes}=require('./server/job-times.cjs');installJobTimes(c.s.db);assert.equal(c.s.repos.jobs.getJob(id).completedAt,event.created_at);installJobTimes(c.s.db);assert.equal(c.s.repos.jobs.getJob(id).completedAt,event.created_at);}finally{c.close();}});

test('explicit 4010 confirmation refusal fails safely instead of remaining submission unknown',async()=>{
 const c=setup();try{
  const f=await fixture(c),id=c.s.web.batch(f.p.id,f.body,'confirmation').jobIds[0],w=scheduler(c);
  c.lose(Error("[请求失败]: Couldn't generate. Refresh and agree to the confirmation before you continue. (错误码: 4010)"));
  await w.tick();
  const job=c.s.repos.jobs.getJob(id);
  assert.equal(job.status,'failed');
  assert.match(job.errorMessage,/官网要求先完成确认/);
  assert.equal(c.s.db.prepare('SELECT history_id FROM web_runs WHERE job_id=?').get(id).history_id,null);
  await w.tick();assert.equal(c.calls.filter(x=>x.method==='submit').length,1);
 }finally{c.close();}
});

test('missing website confirmation blocks submission before upload and cannot be accepted implicitly',async()=>{
 const c=setup();try{
  const f=await fixture(c),orig=c.s.web.bridge.call.bind(c.s.web.bridge);
  c.s.web.bridge.call=async(method,...args)=>method==='compliance'?{confirmed:false}:orig(method,...args);
  const info=await c.s.web.compliance(f.a.id,{force:true});assert.equal(info.confirmed,false);
  assert.match(info.statement,/充分授权/);
  await assert.rejects(c.s.web.confirmCompliance(f.a.id,{accepted:false,version:info.version},{id:'admin',role:'admin'}),/明确同意/);
  await assert.rejects(c.s.web.confirmCompliance(f.a.id,{accepted:true,version:info.version},{id:'user',role:'user'}),/管理员/);
  const id=c.s.web.batch(f.p.id,f.body,'missing-confirmation').jobIds[0];await scheduler(c).tick();
  assert.equal(c.s.repos.jobs.getJob(id).status,'failed');
  assert.equal(c.s.db.prepare('SELECT attempted FROM web_runs WHERE job_id=?').get(id).attempted,0);
  assert.equal(c.calls.filter(x=>x.method==='submit'||x.method==='confirm-compliance').length,0);
  await c.s.web.confirmCompliance(f.a.id,{accepted:true,version:info.version},{id:'admin',role:'admin'});
  assert.equal(c.s.web.list()[0].complianceConfirmed,true);
  assert.equal(c.calls.filter(x=>x.method==='confirm-compliance').length,1);
  c.s.web.saveCredential(f.a.id,'NEW_SESSION','identity');assert.equal(c.s.web.list()[0].complianceConfirmed,null);
 }finally{c.close();}
});
test('website confirmation parser fails closed for malformed settings and only accepts boolean true',()=>{
 const {readConfirmation}=require('./server/web-compliance.cjs');
 assert.equal(readConfirmation({user_custom_settings:{aigc_compliance_confirmed:true}}).confirmed,true);
 assert.equal(readConfirmation({user_custom_settings:'{"aigc_compliance_confirmed":false}'}).confirmed,false);
 assert.equal(readConfirmation({user_custom_settings:{aigc_compliance_confirmed:'true'}}).confirmed,false);
 assert.equal(readConfirmation({user_custom_settings:{}}).confirmed,false);
 assert.throws(()=>readConfirmation({}),/有效/);
});

test('email login validates credentials, automatically saves an authenticated session and never returns a password',async()=>{
 const c=setup();let listener,closed=false;try{
  const page={goto:async()=>{await listener({url:()=> 'https://dreamina.capcut.com/lv/v1/user/web/user_info',json:async()=>({data:{user_info:{user_id:'email-user'}}})});},screenshot:async()=>Buffer.from('jpeg'),reload:async()=>{},waitForTimeout:async()=>{}};
  const ctx={pages:()=>[page],on:(event,fn)=>{if(event==='response')listener=fn;},cookies:async()=>[{name:'sessionid',value:'EMAIL_SESSION'}],close:async()=>{closed=true;}};
  c.s.web=createDreaminaWebService(c.s,{bridge:{directory:__dirname,close(){},call:async()=>({totalCredit:88})},browserFactory:{launchPersistentContext:async()=>ctx}});
  const a=c.s.web.create({name:'email login'});
  await assert.rejects(c.s.web.startEmailLogin(a.id,{email:'bad',password:'SECRET'}),/有效邮箱/);
  const begin=await c.s.web.startEmailLogin(a.id,{email:'owner@example.com',password:'PRIVATE_PASSWORD'});
  assert.ok(!JSON.stringify(begin).includes('PRIVATE_PASSWORD'));
  await new Promise(resolve=>setImmediate(resolve));
  const result=await c.s.web.emailLoginStatus(a.id);
  assert.equal(result.status,'authenticated');assert.equal(closed,true);
  assert.equal(c.s.web.list()[0].authorized,true);
  assert.ok(!JSON.stringify(c.s.web.list()).includes('PRIVATE_PASSWORD'));
  const row=c.s.db.prepare('SELECT ciphertext FROM web_accounts WHERE id=?').get(a.id);
  assert.ok(row.ciphertext);assert.ok(!row.ciphertext.includes('EMAIL_SESSION'));
 }finally{c.close();}
});

test('login refreshes an existing identity and merges only the unused placeholder automatically',async()=>{
 const c=setup();let listener,closed=false;try{
  const original=c.s.web.create({name:'existing account'});c.s.web.saveCredential(original.id,'OLD_SESSION','same-user');
  const page={goto:async()=>listener({url:()=> 'https://dreamina.capcut.com/lv/v1/user/web/user_info',json:async()=>({data:{user_info:{user_id:'same-user'}}})}),reload:async()=>{},waitForTimeout:async()=>{}};
  const ctx={pages:()=>[page],on:(e,fn)=>{if(e==='response')listener=fn;},cookies:async()=>[{name:'sessionid',value:'REFRESHED_SESSION'}],close:async()=>{closed=true;}};
  c.s.web=createDreaminaWebService(c.s,{bridge:{directory:__dirname,close(){},call:async()=>({totalCredit:1200})},browserFactory:{launchPersistentContext:async()=>ctx}});
  const placeholder=c.s.web.create({name:'new placeholder'});
  await c.s.web.startEmailLogin(placeholder.id,{email:'owner@example.com',password:'SECRET'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await c.s.web.emailLoginStatus(placeholder.id)).status,'authenticated');
  const accounts=c.s.web.list();assert.equal(accounts.length,1);assert.equal(accounts[0].id,original.id);assert.equal(accounts[0].totalCredit,1200);assert.equal(closed,true);
  const stored=c.s.db.prepare('SELECT * FROM web_accounts WHERE id=?').get(original.id);
  assert.equal(c.s.secrets.open(stored,{accountId:original.id,purpose:'dreamina-web-session'}),'us-REFRESHED_SESSION');
  assert.equal(c.s.db.prepare('SELECT enabled FROM web_accounts WHERE id=?').get(placeholder.id).enabled,0);
 }finally{c.close();}
});

test('duplicate login cannot merge an account that already owns saved credentials',async()=>{
 const c=setup();let listener;try{
  const first=c.s.web.create({name:'first'}),second=c.s.web.create({name:'second'});
  c.s.web.saveCredential(first.id,'FIRST','first-user');c.s.web.saveCredential(second.id,'SECOND','second-user');
  const page={goto:async()=>listener({url:()=> 'https://dreamina.capcut.com/lv/v1/user/web/user_info',json:async()=>({data:{user_info:{user_id:'first-user'}}})})};
  const ctx={pages:()=>[page],on:(e,fn)=>{if(e==='response')listener=fn;},cookies:async()=>[{name:'sessionid',value:'NEW'}],close:async()=>{}};
  c.s.web=createDreaminaWebService(c.s,{bridge:{directory:__dirname,close(){},call:async()=>({totalCredit:100})},browserFactory:{launchPersistentContext:async()=>ctx}});
  await c.s.web.startLogin(second.id);
  await assert.rejects(c.s.web.finishLogin(second.id),/不能自动合并/);
  assert.equal(c.s.web.list().length,2);
  const stored=c.s.db.prepare('SELECT * FROM web_accounts WHERE id=?').get(second.id);
  assert.equal(c.s.secrets.open(stored,{accountId:second.id,purpose:'dreamina-web-session'}),'us-SECOND');
  await c.s.web.closeLogin(second.id);
 }finally{c.close();}
});

test('explicit Dreamina -6 rejection fails without resubmitting', async () => {
  const c = setup();
  try {
    const f = await fixture(c);
    const id = c.s.web.batch(f.p.id, f.body, 'shark-rejected').jobIds[0];
    c.lose(Error('[请求失败]: shark not pass reject (错误码: -6)'));
    const worker = scheduler(c);
    await worker.tick();
    await worker.tick();
    const job = c.s.repos.jobs.getJob(id);
    assert.equal(job.status, 'failed');
    assert.equal(job.remoteTaskId, null);
    assert.equal(job.queueNote, '');
    assert.match(job.errorMessage, /官网拒绝/);
    assert.equal(c.calls.filter(call => call.method === 'submit').length, 1);
  } finally {
    c.close();
  }
});

test('Dreamina submit passes only the assigned account profile to the browser bridge', async () => {
  const c = setup();
  try {
    const f = await fixture(c);
    const profile = path.join(c.s.paths.root, 'web-profiles', f.a.id);
    fs.mkdirSync(profile, { recursive: true });
    c.s.web.batch(f.p.id, f.body, 'saved-browser-profile');
    await scheduler(c).tick();
    const submit = c.calls.find(call => call.method === 'submit');
    assert.equal(submit.b.profileDirectory, profile);
  } finally {
    c.close();
  }
});
