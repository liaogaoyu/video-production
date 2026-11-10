const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {openServices} = require('./server/context.cjs');
const {createDoubaoQueue} = require('./server/doubao-local.cjs');
const {fixture} = require('./test-fixtures/mp4.cjs');
const driver=require('./worker/doubao-local/driver.cjs');
const {BackgroundAdapter,mapRole}=require('./worker/doubao-local/background.cjs');
const {DoubaoConnection}=require('./worker/doubao-local/cdp.cjs');

function setup(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'doubao-queue-'));
  const services=openServices({cwd:__dirname,env:{STORYDOCK_ROOT:root,STORYDOCK_MASTER_KEY:path.join(root,'key')}});
  t.after(()=>{services.db.close();fs.rmSync(root,{recursive:true,force:true});});
  const project=services.repos.content.createProject({name:'本地豆包'}).project;
  const shot=services.repos.content.createShot({projectId:project.id,episode:1,number:1,title:'镜头',prompt:'测试提示词',duration:10});
  return {services,shot,queue:createDoubaoQueue(services)};
}
const accounts=[{label:'甲账号',quotaKey:'user-a'},{label:'乙账号',quotaKey:'user-b'}];
function runToVideo(queue,id) {
  for(const state of ['prepared','submitting','running','awaiting_video']) queue.update(id,'mac',state);
}
test('desktop lock survives restart, blocks other accounts and workers, and forbids premature completion',t=>{
  const {queue,services,shot}=setup(t);
  const a=queue.enqueue(shot.id,'a');queue.enqueue(shot.id,'b');
  assert.equal(queue.enqueue(shot.id,'a').id,a.id);
  assert.equal(queue.claim('mac',accounts).task.id,a.id);
  assert.equal(queue.claim('another-mac',accounts).task,null);
  runToVideo(queue,a.id);
  const restarted=createDoubaoQueue(services);
  assert.equal(restarted.claim('mac',accounts).task.id,a.id);
  assert.equal(restarted.claim('other',accounts).reason,'desktop_locked');
  assert.throws(()=>queue.update(a.id,'mac','succeeded'),/状态/);
  queue.update(a.id,'mac','blocked','网络状态不确定');
  assert.equal(restarted.claim('mac',accounts).task.state,'blocked');
});
test('upload is idempotent, appears as a shot video and releases lock only after stored result',async t=>{
  const {queue,services,shot}=setup(t);
  const task=queue.enqueue(shot.id,'video');queue.enqueue(shot.id,'next');
  queue.claim('mac',accounts);runToVideo(queue,task.id);
  await assert.rejects(()=>queue.upload(task.id,'other',fixture()),/执行器/);
  await assert.rejects(()=>queue.upload(task.id,'mac',Buffer.from('bad')),/视频/);
  assert.equal(queue.claim('other',accounts).task,null);
  const result=await queue.upload(task.id,'mac',fixture());
  assert.equal(result.state,'succeeded');
  assert.equal((await queue.upload(task.id,'mac',fixture())).media_id,result.media_id);
  assert.equal(services.db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE id=?').get(task.id).n,1);
  assert.equal(queue.claim('mac',accounts).task.request_key,'next');
});
test('OSS credential failure leaves the returned video playable and releases the queue lock',async t=>{
  const {queue,services,shot}=setup(t);
  services.oss.enabled=true;
  t.mock.method(services.oss,'put',async (key,bytes,mime,{signal})=>{
    assert.equal(mime,'video/mp4');
    assert(signal instanceof AbortSignal);
    throw Object.assign(Error('OSS rejected this request'),{
      statusCode:403, body:Buffer.from('<Code>InvalidAccessKeyId</Code>'),
    });
  });
  const task=queue.enqueue(shot.id,'video');
  queue.enqueue(shot.id,'next');
  queue.claim('mac',accounts);runToVideo(queue,task.id);
  const bytes=fixture();
  const [result,retry]=await Promise.all([queue.upload(task.id,'mac',bytes),queue.upload(task.id,'mac',bytes)]);
  assert.equal(result.state,'succeeded');
  assert.equal(retry.media_id,result.media_id);
  assert.match(result.note,/OSS 暂未同步.*AccessKey 无效或已停用/);
  const media=services.db.prepare('SELECT storage_key FROM media WHERE id=?').get(result.media_id);
  assert.deepEqual(fs.readFileSync(await services.media.ensureLocal(media.storage_key)),bytes);
  assert.equal(services.db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE id=?').get(task.id).n,1);
  assert.equal(queue.claim('mac',accounts).task.request_key,'next');
});
test('daily quota is shared by account identity across organizations and moves to next account',async t=>{
  const {queue,shot}=setup(t);
  const pool=[accounts[0],{label:'甲账号其他组织',quotaKey:'user-a'},accounts[1]];
  for(let i=0;i<4;i++) {
    queue.enqueue(shot.id,'task-'+i);
    const task=queue.claim('mac',pool).task;
    assert.equal(task.quota_key,i<2?'user-a':'user-b');
    runToVideo(queue,task.id);
    await queue.upload(task.id,'mac',fixture());
  }
  assert.throws(()=>queue.enqueue(shot.id,'tomorrow'),{code:'daily_limit'});
  assert.equal(queue.list().length,4);
  assert.equal(queue.claim('mac',pool).reason,'daily_limit');
});
test('queued tasks reserve available quota and a refreshed pool accepts new submissions',t=>{
  const {queue,shot,services}=setup(t);
  assert.equal(queue.overview().quota,null);
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());
  const limited={...accounts[0],usedToday:1,usageDate:date};
  const alias={...limited,label:'甲账号其他组织'};
  const pool=[limited,alias];
  assert.equal(queue.claim('mac',pool).reason,'empty');
  assert.deepEqual(queue.overview().quota,{available:1,total:2});
  const pending=queue.enqueue(shot.id,'first');
  assert.deepEqual(queue.overview().quota,{available:0,total:2});
  const restarted=createDoubaoQueue(services);
  assert.equal(restarted.enqueue(shot.id,'first').id,pending.id);
  assert.throws(()=>restarted.enqueue(shot.id,'second'),{code:'daily_limit'});
  restarted.cancel(pending.id);
  const active=restarted.enqueue(shot.id,'second');
  assert.equal(restarted.claim('mac',pool).task.id,active.id);
  assert.throws(()=>restarted.enqueue(shot.id,'third'),{code:'daily_limit'});
  assert.equal(restarted.claim('mac',[...pool,accounts[1]]).task.id,active.id);
  assert.equal(restarted.enqueue(shot.id,'third').state,'queued');
  assert.deepEqual(restarted.overview().quota,{available:1,total:4});
});
test('a removed account stays out of its device pool when an old config polls',t=>{
  const {queue,shot,services}=setup(t);
  queue.claim('mac',accounts);
  assert.deepEqual(queue.overview().quota,{available:4,total:4});
  services.db.prepare('INSERT INTO doubao_local_excluded_accounts VALUES (?,?)').run('mac',accounts[0].label);
  const task=queue.enqueue(shot.id,'after-removal');
  assert.equal(queue.claim('mac',accounts).task.quota_key,accounts[1].quotaKey);
  assert.deepEqual(queue.overview().quota,{available:1,total:2});
  assert.equal(queue.cancel(task.id).state,'cancelling');
  queue.update(task.id,'mac','cancelled');
  queue.enqueue(shot.id,'other-device');
  assert.equal(queue.claim('other-mac',accounts).task.quota_key,accounts[0].quotaKey);
});
test('queue overview shows live execution progress, FIFO waiting tasks and recent results',t=>{
  const {queue,shot}=setup(t);
  const running=queue.enqueue(shot.id,'running');
  const first=queue.enqueue(shot.id,'first');
  const second=queue.enqueue(shot.id,'second');
  assert.equal(queue.overview().worker.online,false);
  assert.equal(queue.claim('mac',accounts).task.id,running.id);
  assert.throws(()=>queue.progress(running.id,'other',{phase:'opening_canvas'}),{code:'worker_mismatch'});
  assert.throws(()=>queue.progress(running.id,'mac',{phase:'generating',completed:101,total:100}),{code:'invalid_progress'});
  queue.progress(running.id,'mac',{phase:'uploading_references',completed:2,total:5});
  const {active,waiting,worker}=queue.overview();
  assert.equal(worker.online,true);
  assert.deepEqual(waiting.map(t=>t.id),[first.id,second.id]);
  assert.deepEqual([active[0].title,active[0].phase,active[0].completed,active[0].total],
    ['镜头','uploading_references',2,5]);
  queue.cancel(first.id);
  assert.equal(queue.overview().recent[0].state,'cancelled');
});
test('a paused task reports the cause and can be resumed without changing its state or owner',t=>{
  const {queue,shot}=setup(t);
  const task=queue.enqueue(shot.id,'recover');
  queue.claim('mac',accounts);
  queue.update(task.id,'mac','prepared');
  queue.update(task.id,'mac','submitting');
  const interruption={phase:'submitting',reason:'未看到受理状态',recovery:'核对原任务画布'};
  queue.progress(task.id,'mac',{phase:'needs_attention',interruption});
  assert.deepEqual(queue.overview().active[0].interruption,interruption);
  assert.deepEqual(queue.resume(task.id),{requested:true});
  assert.deepEqual(queue.resume(task.id),{requested:true});
  queue.progress(task.id,'mac',{phase:'needs_attention',interruption,resumeRevision:0});
  assert.equal(queue.overview().active[0].phase,'resume_requested');
  assert.equal(queue.get(task.id).resume_revision,1);
  assert.equal(queue.claim('other',accounts).task,null);
  assert.equal(queue.claim('mac',accounts).task.state,'submitting');
  queue.progress(task.id,'mac',{phase:'submitting',resumeRevision:1});
  assert.equal(queue.overview().active[0].interruption,null);
});
test('a confirmed generation failure ends its lock but still consumes the reserved daily slot',t=>{
  const {queue,shot}=setup(t);
  for(let i=0;i<2;i++) {
    queue.enqueue(shot.id,'failed-'+i);
    const task=queue.claim('mac',accounts).task;
    for(const state of ['prepared','submitting','running','failed']) queue.update(task.id,'mac',state);
  }
  queue.enqueue(shot.id,'other-account');
  assert.equal(queue.claim('mac',accounts).task.quota_key,'user-b');
});
test('a confirmed review rejection restores its daily slot for enqueue and claim after restart',t=>{
  const {queue,services,shot}=setup(t);
  const pool=[accounts[0]];
  const first=queue.enqueue(shot.id,'first');
  const rejected=queue.enqueue(shot.id,'rejected');
  assert.equal(queue.claim('mac',pool).task.id,first.id);
  for(const state of ['prepared','submitting','failed']) queue.update(first.id,'mac',state);
  assert.equal(queue.claim('mac',pool).task.id,rejected.id);
  for(const state of ['prepared','submitting','running']) queue.update(rejected.id,'mac',state);
  assert.throws(()=>queue.enqueue(shot.id,'retry'),{code:'daily_limit'});
  queue.update(rejected.id,'mac','failed','豆包审核不通过，生成已停止');
  const restarted=createDoubaoQueue(services);
  assert.deepEqual(restarted.overview().quota,{available:1,total:2});
  assert.equal(restarted.get(rejected.id).state,'failed');
  const retry=restarted.enqueue(shot.id,'retry');
  assert.throws(()=>restarted.enqueue(shot.id,'extra'),{code:'daily_limit'});
  assert.equal(restarted.claim('mac',pool).task.id,retry.id);
  restarted.update(retry.id,'mac','prepared');
  assert.equal(restarted.update(retry.id,'mac','submitting').state,'submitting');
});
test('pending tasks default to Fast and cancellation releases the desktop only after worker acknowledgement',t=>{
  const {queue,shot}=setup(t);
  const task=queue.enqueue(shot.id,'cancel-preparation');
  assert.equal(task.model,'Seedance 2.0 Fast');
  queue.claim('mac',accounts);
  assert.equal(queue.cancel(task.id).state,'cancelling');
  assert.equal(queue.cancel(task.id).state,'cancelling');
  queue.enqueue(shot.id,'after-cancel');
  assert.equal(queue.claim('other',accounts).task,null);
  assert.throws(()=>queue.update(task.id,'mac','submitting'),/状态/);
  assert.throws(()=>queue.update(task.id,'other','cancelled'),/执行器/);
  queue.update(task.id,'mac','cancelled');
  assert.equal(queue.claim('mac',accounts).task.request_key,'after-cancel');
});
test('queued cancellation is immediate and a submission that wins the race cannot be cancelled',t=>{
  const {queue,shot}=setup(t);
  const queued=queue.enqueue(shot.id,'cancel-queue');
  assert.equal(queue.cancel(queued.id).state,'cancelled');
  const task=queue.enqueue(shot.id,'submit-first');
  queue.claim('mac',accounts);queue.update(task.id,'mac','prepared');queue.update(task.id,'mac','submitting');
  assert.throws(()=>queue.cancel(task.id),/提交阶段/);
  assert.equal(queue.get(task.id).state,'submitting');
});
test('cancellation guard stops desktop mutations before spawning the native adapter',async()=>{
  driver.setGuard(async()=>{throw Object.assign(Error('cancelled'),{code:'cancelled'});});
  try {
    await assert.rejects(()=>driver.ax({action:'click',role:'AXButton',label:'打开'}),{code:'cancelled'});
    await assert.rejects(()=>driver.waitFor(()=>false),{code:'cancelled'});
  } finally {driver.setGuard(null);}
});
test('background connection accepts only the authorized loopback endpoint',()=>{
  assert.throws(()=>new DoubaoConnection('http://example.com:9227'),/127.0.0.1/);
  assert.throws(()=>new DoubaoConnection('http://user:password@127.0.0.1:9227'),/127.0.0.1/);
  assert.equal(new DoubaoConnection('http://127.0.0.1:9227').endpoint,'http://127.0.0.1:9227');
});
test('background accessibility roles retain model menus, toggles and rich editors',()=>{
  const node=(role,properties=[])=>({role:{value:role},properties});
  assert.equal(mapRole(node('button',[{name:'hasPopup',value:{value:'menu'}}])),'AXPopUpButton');
  assert.equal(mapRole(node('button',[{name:'pressed',value:{value:'false'}}])),'AXCheckBox');
  assert.equal(mapRole(node('generic',[{name:'editable',value:{value:'richtext'}},{name:'focusable',value:{value:true}}])),'AXTextArea');
  assert.equal(mapRole(node('menuitemradio')),'AXMenuItem');
});
test('background snapshot flattens ignored wrappers and preserves node titles and placeholders',async()=>{
  const adapter=new BackgroundAdapter();
  const raw=[
    {nodeId:'1',backendDOMNodeId:1,role:{value:'RootWebArea'},childIds:['2','5']},
    {nodeId:'2',parentId:'1',backendDOMNodeId:2,role:{value:'generic'},description:{value:'双击编辑标题'},childIds:['3']},
    {nodeId:'3',parentId:'2',role:{value:'none'},ignored:true,childIds:['4']},
    {nodeId:'4',parentId:'3',backendDOMNodeId:4,role:{value:'StaticText'},name:{value:'豆包任务-test'}},
    {nodeId:'5',parentId:'1',backendDOMNodeId:5,role:{value:'generic'},properties:[{name:'editable',value:{value:'richtext'}},{name:'focusable',value:{value:true}}]},
  ];
  adapter.connection={send:async()=>({nodes:raw}),callNode:async id=>id===5?'添加图片，描述你想生成的视频':[0,0,300,200]};
  const nodes=await adapter.snapshot();
  assert.equal(driver.selectedTitle(nodes),'豆包任务-test');
  assert.equal(nodes.find(n=>n.role==='AXTextArea').value,'添加图片，描述你想生成的视频');
});
test('background result download restores the bound canvas node and rejects stale selection',async()=>{
  const adapter=new BackgroundAdapter();
  let selected='other', title='其他视频', downloads=0;
  const makeNode=(id,onClick)=>({
    dataset:{id},clientWidth:100,clientHeight:100,getClientRects:()=>[{}],classList:{contains:()=>selected===id},click:onClick,
  });
  const target=makeNode('target',()=>{selected='target';title='豆包任务-test';});
  const other=makeNode('other',()=>{selected='other';title='其他视频';});
  const document={querySelectorAll:selector=>{
    if(selector==='[title="双击编辑标题"]') return [{firstElementChild:{textContent:title}}];
    if(selector==='.react-flow__node.selected[data-id]') return [
      {dataset:{id:'hidden'},clientWidth:0,clientHeight:0},selected==='target'?target:other,
    ];
    assert.equal(selector,'.react-flow__node[data-id]');
    return [target,other];
  }};
  const button={isConnected:true,click:()=>{downloads++;}};
  adapter.connection={
    evaluate:async expression=>vm.runInNewContext(expression,{document}),
    callNode:async(id,fn,args)=>args ? vm.runInNewContext('('+fn+').apply(button,args)',{document,button,args}) : true,
  };
  const nodes=[{role:'AXButton',title:'下载视频',description:'',backendNodeId:1}];
  adapter.snapshot=async()=>nodes;
  const read={action:'canvas-node',title:'豆包任务-test'};
  const download={action:'click',role:'AXButton',label:'下载视频',canvasNodeId:'target',canvasNodeTitle:read.title};
  assert.equal(driver.hasVideoDownload(nodes),true);
  assert.equal(await adapter.perform(read),null);
  assert.equal(await adapter.perform({action:'select-canvas-node',id:'missing'}),false);
  assert.equal(await adapter.perform({action:'select-canvas-node',id:'target'}),true);
  assert.equal(await adapter.perform(read),'target');
  await adapter.perform(download);
  other.click();
  await assert.rejects(()=>adapter.perform(download),{retryable:true});
  assert.equal(downloads,1);
});
test('canvas rejection only matches the saved video node with an explicit review failure',async()=>{
  const adapter=new BackgroundAdapter();
  const node=(id,innerText,hasVideo=false)=>({
    dataset:{id},clientWidth:100,clientHeight:100,getClientRects:()=>[{}],
    querySelector:selector=>selector==='video'?(hasVideo?{}:null):{innerText},
  });
  const document={querySelectorAll:()=>[
    node('rejected','审核不通过\n重新编辑'),
    node('ready','审核不通过',true),
    node('waiting','等待生成视频'),
    node('running','正在生成视频'),
  ]};
  adapter.connection={evaluate:async expression=>vm.runInNewContext(expression,{document})};
  for(const [id,rejected] of [['rejected',true],['ready',false],['waiting',false],['missing',false]])
    assert.equal(await adapter.perform({action:'canvas-rejected',id}),rejected);
  for(const [id,status] of [['rejected','rejected'],['ready','ready'],['waiting','unknown'],['running','running'],['missing','unknown']])
    assert.equal(await adapter.perform({action:'canvas-status',id}),status);
});

test('a missing download retries the existing result once and uploads it without resubmitting',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'doubao-result-'));
  const config=path.join(root,'config.json');
  const state=path.join(root,'state.json');
  const oldArgs=process.argv;
  t.after(()=>{process.argv=oldArgs;fs.rmSync(root,{recursive:true,force:true});});
  process.argv=['node','main.cjs',config];
  const task={id:'test-result',state:'awaiting_video',account_label:'备用账号'};
  const title='豆包任务-'+task.id;
  fs.writeFileSync(config,JSON.stringify({
    deviceId:'mac',deviceToken:'test',serverUrl:'http://127.0.0.1',stateDirectory:'.',
    downloadDirectory:root,accounts:[{label:task.account_label,quotaKey:'test'}],
  }),{mode:0o600});
  fs.writeFileSync(state,JSON.stringify({workerId:'mac',taskId:task.id,stage:'downloading',canvasNodeId:'result'}));
  let now=0,clicks=0;
  t.mock.method(Date,'now',()=>now);
  t.mock.method(global,'setTimeout',(resolve,ms)=>{now+=clicks?ms:180000;queueMicrotask(resolve);});
  t.mock.method(driver,'snapshot',async()=>[
    {role:'AXPopUpButton',help:'⇧⌘,',title:task.account_label},
    {role:'AXGroup',help:'双击编辑标题',parent:null},
    {role:'AXStaticText',value:title,parent:1},
    {role:'AXButton',title:'下载视频'},
  ]);
  t.mock.method(driver,'ax',async request=>{
    if(request.action==='canvas-node') return 'result';
    assert.equal(request.action,'click');
    assert.equal(request.label,'下载视频');
    assert.equal(request.canvasNodeTitle,title);
    clicks++;
    fs.writeFileSync(path.join(root,title+'.mp4'),fixture());
  });
  const requests=[];
  t.mock.method(global,'fetch',async (url,options)=>{
    requests.push(url.pathname);
    if(url.pathname.endsWith('/claim')) return Response.json({task});
    if(url.pathname.endsWith('/progress')) return Response.json({ok:true});
    assert.equal(url.pathname,'/api/v1/doubao-local/tasks/'+task.id+'/video');
    assert.equal(options.body.get('file').name,title+'.mp4');
    return Response.json({state:'succeeded'});
  });
  await require('./worker/doubao-local/main.cjs').main();
  assert.equal(clicks,1);
  assert.equal(requests.filter(endpoint=>!endpoint.endsWith('/progress')).length,2);
  assert.equal(JSON.parse(fs.readFileSync(state,'utf8')).stage,'uploaded');
});
test('an unconfirmed submission reports the failure and checks the same node on resume without clicking generate',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'doubao-resume-'));
  const config=path.join(root,'config.json');
  const state=path.join(root,'state.json');
  const oldArgs=process.argv;
  t.after(()=>{process.argv=oldArgs;fs.rmSync(root,{recursive:true,force:true});});
  process.argv=['node','main.cjs',config,'--submit','--watch'];
  const task={id:'original',state:'submitting',account_label:'原账号',resume_revision:0};
  fs.writeFileSync(config,JSON.stringify({
    deviceId:'mac',deviceToken:'test',serverUrl:'http://127.0.0.1',stateDirectory:'.',
    accounts:[{label:task.account_label,quotaKey:'test'}],
  }),{mode:0o600});
  fs.writeFileSync(state,JSON.stringify({workerId:'mac',taskId:task.id,stage:'submitting',canvasNodeId:'original-node'}));
  t.mock.method(driver,'snapshot',async()=>[{role:'AXPopUpButton',help:'⇧⌘,',title:task.account_label}]);
  let lookups=0;
  t.mock.method(driver,'ax',async request=>{
    assert.deepEqual(request,{action:'canvas-status',id:'original-node'});
    return ++lookups===5?'failed':'unknown';
  });
  const reports=[];
  t.mock.method(global,'fetch',async (url,options)=>{
    if(url.pathname.endsWith('/claim')) return Response.json({task});
    if(url.pathname.endsWith('/progress')) {
      reports.push(JSON.parse(options.body));
      return Response.json({ok:true});
    }
    if(url.pathname.endsWith('/state')) {
      assert.equal(JSON.parse(options.body).state,'failed');
      task.state='failed';
    }
    return Response.json(task);
  });
  const {main}=require('./worker/doubao-local/main.cjs');
  for(let attempt=0;attempt<4;attempt++) await main();
  assert.equal(reports.at(-1).phase,'needs_attention');
  assert.match(reports.at(-1).interruption.reason,/结果仍待确认/);
  await main();
  assert.equal(lookups,4);
  task.resume_revision=1;
  await main();
  assert.equal(task.state,'failed');
  assert.equal(JSON.parse(fs.readFileSync(state,'utf8')).stage,'failed');
});
test('background reopens the configured canvas after switching even if a canvas with the same title is still visible',async t=>{
  const previous={role:'AXPopUpButton',title:'原账号',help:'⇧⌘,'};
  const account={role:'AXPopUpButton',title:'备用账号',help:'⇧⌘,'};
  const chat='创建空白画布 归档对话 更多';
  const card='空白画布 创建时间：11-07 15:03';
  const reached=Error('reached video node creation');
  let screen=[previous];
  const actions=[];
  t.mock.method(BackgroundAdapter.prototype,'perform',async request=>{
    if(request.action==='snapshot') return screen;
    actions.push(request.label);
    if(request.label===previous.title) {
      screen=[previous,{role:'AXMenuItem',title:'更多账号'},{role:'AXMenuItem',title:'avatar '+account.title}];
    } else if(request.label==='avatar '+account.title) {
      screen=[account,{role:'AXLink',description:chat},
        {role:'AXTab',description:'空白画布',selected:true},{role:'AXCheckBox',title:'视频生成'}];
    } else if(request.label===chat) screen=[account,{role:'AXButton',title:card}];
    else if(request.label===card) screen=[account,{role:'AXTab',description:'空白画布',selected:true},{role:'AXCheckBox',title:'视频生成'}];
    else if(request.label==='视频生成') throw reached;
    else assert.fail('unexpected control '+request.label);
  });
  driver.useBackground();
  try {
    await assert.rejects(()=>driver.prepare({id:'test',account_label:account.title},{canvasLabel:chat,canvasTitle:'空白画布'}),error=>error===reached);
    assert.deepEqual(actions,[previous.title,'avatar '+account.title,chat,card,'视频生成']);
  } finally {driver.closeBackground();}
});
test('background video preparation accepts a title already saved by Doubao',async t=>{
  const account={role:'AXPopUpButton',title:'备用账号',help:'⇧⌘,'};
  const canvas={role:'AXCheckBox',title:'视频生成'};
  const empty={role:'AXTextArea',value:'添加图片，描述你想生成的视频'};
  const header=value=>[{role:'AXGroup',help:'双击编辑标题',parent:null},{role:'AXStaticText',value,parent:2}];
  const reached=Error('reached video prompt');
  let screen=[account,canvas];
  t.mock.method(BackgroundAdapter.prototype,'perform',async request=>{
    if(request.action==='snapshot') return screen;
    if(request.action==='click'&&request.label==='视频生成') {
      screen=[account,canvas,...header('视频'),empty,{role:'AXGroup',description:'等待生成视频'}];
    } else if(request.action==='title') {
      screen=[account,canvas,{role:'AXTextField',description:'编辑素材标题'}];
    } else if(request.action==='fill'&&request.label==='编辑素材标题') {
      screen=[account,canvas,...header(request.text),empty];
    } else if(request.action==='fill'&&request.label===empty.value) throw reached;
    else assert.fail('unexpected control '+request.action);
  });
  driver.useBackground();
  try {
    await assert.rejects(()=>driver.prepare({id:'test',account_label:account.title,prompt:'测试视频'},{}),error=>error===reached);
  } finally {driver.closeBackground();}
});
test('background canvas bootstrap selects the slash search result without sending the draft',async t=>{
  const account={role:'AXPopUpButton',title:'备用账号',help:'⇧⌘,'};
  const work='新工作任务 ⌘ N';
  const skills={role:'AXPopUpButton',title:'技能'};
  const command='chat_input_suggestion_create-canvas';
  const description='创建画布 在无限画布中自由创建图片与视频';
  const reached=Error('reached video node creation');
  let screen=[account,{role:'AXButton',title:work}];
  const actions=[];
  t.mock.method(BackgroundAdapter.prototype,'perform',async request=>{
    if(request.action==='snapshot') return screen;
    actions.push(request.label);
    if(request.label===work) screen=[account,skills,{role:'AXTextArea',value:'/画布'}];
    else if(request.action==='search-canvas') {
      assert.equal(request.label,'/画布');
      screen=[account,{role:'AXButton',title:description,identifier:command}];
    } else if(request.label===command) {
      assert.equal(request.role,'AXButton');
      screen=[account,{role:'AXCheckBox',title:'视频生成'}];
    } else if(request.label==='视频生成') throw reached;
    else assert.fail('unexpected control '+request.label);
  });
  driver.useBackground();
  try {
    await assert.rejects(()=>driver.prepare({id:'test',account_label:account.title},{}),error=>error===reached);
    assert.deepEqual(actions,[work,'/画布',command,'视频生成']);
  } finally {driver.closeBackground();}
});
test('account discovery includes expanded rows without switching accounts',async t=>{
  const account={role:'AXPopUpButton',title:'当前账号',help:'⇧⌘,'};
  const menu={role:'AXMenu',title:''};
  const item=title=>({role:'AXMenuItem',title});
  let screen=[account];
  const actions=[];
  t.mock.method(BackgroundAdapter.prototype,'perform',async request=>{
    if(request.action==='snapshot') return screen;
    actions.push(request.label||request.action);
    if(request.label===account.title) screen=[account,menu,item('更多账号'),item('avatar 常用账号')];
    else if(request.label==='更多账号') screen=[account,menu,item('avatar 其他账号'),item('avatar 常用账号')];
    else if(request.action==='close-account-menu') screen=[account];
    else assert.fail('unexpected menu action');
  });
  driver.useBackground();
  try {
    assert.deepEqual(await driver.collectAccounts(),['当前账号','常用账号','其他账号']);
    screen=[account,{role:'AXStaticText',value:'正在生成视频'}];
    assert.equal(await driver.collectAccounts(),null);
    assert.deepEqual(actions,['当前账号','更多账号','close-account-menu']);
  } finally {driver.closeBackground();}
});
test('the Doubao canvas option receives mousedown before click',async()=>{
  const adapter=new BackgroundAdapter();
  const command='chat_input_suggestion_create-canvas';
  const events=[];
  const option={
    getBoundingClientRect:()=>({x:1,y:1,width:20,height:10}),
    dispatchEvent:event=>events.push(event.type),
    click:()=>events.push('click'),
  };
  class Event {constructor(type) {this.type=type;}}
  adapter.snapshot=async()=>[{role:'AXGroup',description:'创建画布',identifier:command,backendNodeId:1}];
  adapter.connection={callNode:async(id,fn,args)=>
    args ? vm.runInNewContext('('+fn+').apply(option,args)',{option,args,MouseEvent:Event,PointerEvent:Event}) : true};
  await adapter.perform({action:'click',role:'AXGroup',label:command});
  assert.deepEqual(events,['pointerdown','mousedown','pointerup','mouseup','click']);
});
test('background uploads intercept the chooser and send file paths directly, including cleanup on failure',async()=>{
  for(const fail of [false,true]) {
    const adapter=new BackgroundAdapter(),events=[];
    adapter.connection={
      send:async(method,params)=>{events.push({method,params});if(fail&&method==='DOM.setFileInputFiles')throw Error('upload failed');return {};},
      event:async method=>{events.push({method});return {backendNodeId:123};},
    };
    adapter.snapshot=async()=>[{role:'AXMenuItem',title:'上传文件'}];
    adapter.perform=async request=>{events.push({action:request.action});return {ok:true};};
    const upload=adapter.upload({label:'提示词',files:['/tmp/图1.png']});
    if(fail) await assert.rejects(()=>upload,/upload failed/);else await upload;
    assert.deepEqual(events.find(e=>e.method==='DOM.setFileInputFiles').params,{files:['/tmp/图1.png'],backendNodeId:123});
    assert.equal(events.find(e=>e.method==='Page.setInterceptFileChooserDialog').params.enabled,true);
    assert.deepEqual(events.at(-1),{method:'Page.setInterceptFileChooserDialog',params:{enabled:false}});
  }
});
test('background reference upload leaves an already open menu open',async()=>{
  const adapter=new BackgroundAdapter();
  const trigger={getAttribute:key=>key==='aria-expanded'?'true':null};
  const button={
    closest:selector=>selector==='[data-slot="dropdown-menu-trigger"]'?trigger:null,
    click:()=>assert.fail('an open reference menu must not be toggled'),
  };
  adapter.snapshot=async()=>[];
  adapter.select=()=>({backendNodeId:1,role:'AXPopUpButton',popupType:'menu'});
  adapter.connection={callNode:async(id,fn,args)=>
    args ? vm.runInNewContext('('+fn+').apply(button,args)',{button,args}) : true};
  await adapter.perform({action:'reference-menu',role:'AXTextArea',label:'当前视频提示词'});
});
test('background transport rejects native file chooser actions',async()=>{
  await assert.rejects(()=>new BackgroundAdapter().perform({action:'path-dialog'}),/直接文件上传/);
});
test('background control refresh retries read-only selection before exactly one mutation',async()=>{
  const adapter=new BackgroundAdapter();let reads=0,mutations=0;
  adapter.snapshot=async()=>[{parent:null,role:'AXButton',title:'操作',backendNodeId:1}];
  adapter.connection={callNode:async(id,fn,args)=>{
    if(args===undefined) return ++reads>1;
    mutations++;return true;
  }};
  await adapter.perform({action:'click',role:'AXButton',label:'操作'});
  assert.equal(reads,2);assert.equal(mutations,1);
});
test('editor reference checks retain order across wrappers and normalize accessibility line breaks',()=>{
  const nodes=[
    {parent:null,role:'AXWindow'},
    {parent:0,role:'AXGroup'},
    {parent:1,role:'AXToolbar',description:'画布工具栏'},
    {parent:1,role:'AXImage',description:'其他节点.png'},
    {parent:1,role:'AXGroup'},
    {parent:4,role:'AXGroup'},
    {parent:5,role:'AXImage',description:'图1.png'},
    {parent:5,role:'AXImage',description:'图2.png'},
    {parent:4,role:'AXGroup'},
    {parent:8,role:'AXPopUpButton',title:'视频生成'},
    {parent:8,role:'AXTextArea',value:'图1 是人物。 图2 是场景。'},
  ];
  assert.deepEqual(driver.editorReferences(nodes,'图1 是人物。\n图2 是场景。'),['图1.png','图2.png']);
  assert.equal(driver.promptInput(nodes,'图1 是人物。\n图2 是场景。'),nodes[10]);
});
test('manually consumed quota is included and cannot be reduced by another claim',async t=>{
  const {queue,shot}=setup(t);
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());
  queue.enqueue(shot.id,'manual');
  const seeded=[{...accounts[0],usedToday:2,usageDate:date},accounts[1]];
  const task=queue.claim('mac',seeded).task;
  assert.equal(task.quota_key,'user-b');
  runToVideo(queue,task.id);await queue.upload(task.id,'mac',fixture());
  queue.enqueue(shot.id,'still-full');
  assert.equal(queue.claim('mac',[{...accounts[0],usedToday:0,usageDate:date}]).reason,'daily_limit');
});
test('unsupported shot inputs are rejected before creating a desktop task',t=>{
  const {queue,services,shot}=setup(t);
  services.db.prepare('UPDATE shots SET duration=16 WHERE id=?').run(shot.id);
  assert.throws(()=>queue.enqueue(shot.id,'too-long'),/4至15秒/);
  services.db.prepare('UPDATE shots SET duration=10 WHERE id=?').run(shot.id);
  services.db.prepare("INSERT INTO shot_references(shot_id,asset_id,position) VALUES(?,'asset',1)").run(shot.id);
  assert.throws(()=>queue.enqueue(shot.id,'references'),/参考图/);
  assert.equal(queue.list().length,0);
});
test('HTTP routes require login and deny non-admin users',async t=>{
  const {services,shot}=setup(t);
  const {hashPassword}=require('./server/auth-http.cjs');
  const password=await hashPassword('fixture-password');
  const now=new Date().toISOString();
  for(const role of ['admin','user']) services.db.prepare(`INSERT INTO app_users
    (id,username,password_hash,role,email,email_verified_at,created_at) VALUES(?,?,?,?,?,?,?)`)
    .run(role,role,password,role,role+'@example.com',now,now);
  const app=await require('./server/api.cjs').createHttpApp(services);
  try {
    assert.equal((await app.inject({url:'/api/v1/doubao-local/tasks'})).statusCode,401);
    let adminCookie;
    for(const role of ['admin','user']) {
      const login=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username:role,password:'fixture-password'}});
      const cookie=login.headers['set-cookie'].split(';')[0];
      const r=await app.inject({method:'POST',url:'/api/v1/doubao-local/tasks',headers:{cookie},payload:{shotId:shot.id,requestKey:'http'}});
      assert.equal(r.statusCode,role==='admin'?200:403,r.body);
      if(role==='admin') adminCookie=cookie;
    }
    const {issueDevice}=require('./server/doubao-local.cjs');
    const device=issueDevice(services,'fixture'), other=issueDevice(services,'other');
    const headers={'x-doubao-device':device.token};
    assert.equal((await app.inject({url:'/api/v1/projects',headers})).statusCode,403);
    assert.equal((await app.inject({url:'/api/v1/doubao-local/tasks',headers})).statusCode,403);
    const report='/api/v1/doubao-local/account-report';
    const push=payload=>app.inject({method:'POST',url:report,headers,payload});
    assert.equal((await push({workerId:other.id,labels:['不属于此设备']})).statusCode,403);
    assert.equal((await push({workerId:device.id,labels:['   ']})).statusCode,400);
    assert.equal((await push({workerId:device.id,labels:['甲账号','新账号','甲账号']})).statusCode,200);
    assert.equal((await app.inject({url:'/api/v1/doubao-local/queue',headers})).statusCode,403);
    const overview=await app.inject({url:'/api/v1/doubao-local/queue',headers:{cookie:adminCookie}});
    assert.deepEqual(overview.json().account_reports.map(({label,labels})=>({label,labels})),
      [{label:'fixture',labels:['甲账号','新账号']}]);
    assert.equal(services.db.prepare('SELECT COUNT(*) AS n FROM doubao_local_account_pools').get().n,0);
    const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());
    const pool=[{...accounts[0],usedToday:1,usageDate:date}];
    const claim=await app.inject({method:'POST',url:'/api/v1/doubao-local/claim',headers,payload:{workerId:device.id,accounts:pool}});
    assert.equal(claim.statusCode,200,claim.body);
    const taskId=claim.json().task.id;
    const rejected=await app.inject({method:'POST',url:'/api/v1/doubao-local/tasks',headers:{cookie:adminCookie},
      payload:{shotId:shot.id,requestKey:'http-no-quota'}});
    assert.equal(rejected.statusCode,409,rejected.body);
    assert.equal(rejected.json().error.message,'本地豆包今日额度已用完，任务未入队');
    assert.equal(services.db.prepare('SELECT COUNT(*) AS count FROM doubao_local_tasks').get().count,1);
    assert.equal((await app.inject({method:'POST',url:`/api/v1/doubao-local/tasks/${taskId}/cancel`,headers,payload:{}})).statusCode,403);
    assert.equal((await app.inject({url:'/api/v1/doubao-local/tasks/'+taskId,headers})).statusCode,200);
    assert.equal((await app.inject({url:'/api/v1/doubao-local/tasks/'+taskId,headers:{'x-doubao-device':other.token}})).statusCode,403);
    assert.equal((await app.inject({method:'POST',url:`/api/v1/doubao-local/tasks/${taskId}/state`,headers,payload:{workerId:other.id,state:'prepared'}})).statusCode,403);
    services.db.prepare('UPDATE doubao_local_devices SET revoked_at=? WHERE id=?').run(now,device.id);
    assert.equal((await app.inject({url:'/api/v1/doubao-local/tasks/'+taskId,headers})).statusCode,401);
  } finally {await app.close();}
});
test('reference slots freeze locked images, deduplicate shared pictures and replace asset mentions with 图N',async t=>{
  const {services,shot,queue}=setup(t),content=services.repos.content;
  const projectId=services.db.prepare('SELECT project_id FROM shots WHERE id=?').get(shot.id).project_id;
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRuoAAAAASUVORK5CYII=','base64');
  const names=['小林','小林 冬装','医院走廊'],assets=[];
  for(let i=0;i<names.length;i++) {
    const asset=content.createAsset({projectId,name:names[i],type:i===2?'scene':'character',prompt:'test'});
    const version=await content.addVersion(asset.id,{bytes:i<2?png:Buffer.concat([png,Buffer.from('scene')]),source:'upload'});
    content.setLockedVersion(asset.id,version.id);assets.push(asset);
    services.db.prepare('INSERT INTO shot_references VALUES(?,?,?)').run(shot.id,asset.id,i);
  }
  services.db.prepare('UPDATE shots SET prompt=? WHERE id=?').run('@小林 冬装 走进 @医院走廊 ，@小林 看向门口。',shot.id);
  const task=queue.enqueue(shot.id,'references');
  const refs=JSON.parse(task.references_json);
  assert.equal(refs.length,2);assert.deepEqual(refs.map(r=>r.index),[1,2]);
  assert.deepEqual(refs[0].assets.map(a=>a.name),names.slice(0,2));
  assert.match(task.prompt,/图1 走进 图2 ，图1 看向门口/);
  assert.equal(task.prompt.includes('@'),false);
  const app=await require('./server/api.cjs').createHttpApp(services);
  try {
    const device=require('./server/doubao-local.cjs').issueDevice(services,'reference-fixture');
    queue.claim(device.id,accounts);
    const response=await app.inject({url:`/api/v1/doubao-local/tasks/${task.id}/references/1`,headers:{'x-doubao-device':device.token}});
    assert.equal(response.statusCode,200,response.body);
    assert.deepEqual(response.rawPayload,png);
  } finally {await app.close();}
  content.setLockedVersion(assets[0].id,null);
  const newer=await content.addVersion(assets[0].id,{bytes:Buffer.concat([png,Buffer.from('new')]),source:'upload'});
  content.setLockedVersion(assets[0].id,newer.id);
  assert.equal(JSON.parse(queue.get(task.id).references_json)[0].sha256,refs[0].sha256);
  services.db.prepare('UPDATE shots SET prompt=? WHERE id=?').run('@未知人物 走来',shot.id);
  assert.throws(()=>queue.enqueue(shot.id,'unresolved'),/未匹配/);
});
