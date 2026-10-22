const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { openServices } = require("./server/context.cjs");
const { createHttpApp } = require("./server/api.cjs");
const { createSecretStore } = require("./server/secret-store.cjs");
const { findMentions } = require("./server/references.cjs");
const { createScheduler } = require("./worker/scheduler.cjs");
const { zipStore } = require("./server/zip.cjs");
const { createRuntimeBootstrap } = require("./worker/runtime.cjs");
const { handleAuthFailure } = require("./worker/auth.cjs");
const { restoreDesktopWorkspace } = require("./server/desktop-migration.cjs");

test("desktop migration preserves versions, references and videos without resubmitting", async () => {
  const ctx = await start();
  try {
    const root = ctx.services.paths.root;
    const one = path.join(root,"one.png"), two=path.join(root,"two.png"), video=path.join(root,"clip.mp4");
    fs.writeFileSync(one,PNG);fs.writeFileSync(two,Buffer.concat([PNG,Buffer.from("version-two")]));
    fs.writeFileSync(video,Buffer.from([0,0,0,16,102,116,121,112,109,112,52,50,0,0,0,0]));
    const workspace={projects:[{id:"old-project",name:"旧项目",data:{settings:{ratio:"9:16"},assets:[{id:"old-asset",name:"角色",type:"角色",prompt:"prompt",image:one,locked:true,selectedVersionId:"v1",versions:[{id:"v1",image:one,prompt:"original"},{id:"v2",image:two}],references:[{url:two}]}],shots:[{id:"old-shot",number:1,title:"镜头",prompt:"@角色 转身",refs:["角色"]}],jobs:[{id:"old-job",sourceId:"old-shot",kind:"shot",status:"done",submitId:"remote-id",video},{id:"pending",sourceId:"old-shot",kind:"shot",status:"remote_running",submitId:"pending-id"}]}}]};
    const restore=()=>restoreDesktopWorkspace({services:ctx.services,workspace,sourceKey:"test-source",allowedRoots:[root],staticRoot:__dirname});
    const report=restore();assert.equal(report.missing.length,0);assert.equal(report.projects[0].videos,1);
    const graph=ctx.services.repos.content.graph(report.projects[0].id);
    assert.equal(graph.versions.length,2);assert.equal(graph.references.length,1);assert.equal(graph.shotRefs[0].asset_id,graph.assets[0].id);
    const locked=graph.versions.find(v=>v.id===graph.assets[0].locked_version_id);assert.equal(locked.prompt,"original");
    assert.equal(graph.jobs.find(j=>j.remote_task_id==="remote-id").status,"succeeded");
    assert.equal(graph.jobs.find(j=>j.remote_task_id==="pending-id").status,"submit_unknown");
    assert.equal(ctx.services.repos.jobs.claimJob("test-worker"),null);
    assert.equal(restore().skipped.length,1);assert.equal(ctx.services.repos.content.listProjects().length,1);
  } finally {await ctx.close();}
});

test("premature OAuth expiry recovers an already authorized CLI account", async () => {
  const states = [];
  let checked = false, cleared = false;
  await handleAuthFailure({
    session: {id:"session",account_id:"account",expires_at:new Date(Date.now()+60000).toISOString()},
    error:new Error("授权已过期，请重新开始"),
    pool:{inspect:async()=>({authorized:true,permission:"allowed",message:"已授权"})},
    accounts:{applyCheck(){checked=true;},markAuth(id,status){states.push(status);},clearDeviceCode(){cleared=true;}},
  });
  assert.equal(checked,true);assert.equal(cleared,true);assert.deepEqual(states,["authorized"]);
});

test("a still valid OAuth exchange survives a transient expiry error", async () => {
  const states = [];
  await handleAuthFailure({session:{id:"s",account_id:"a",expires_at:new Date(Date.now()+60000).toISOString()},error:new Error("授权已过期"),pool:{inspect:async()=>({authorized:false})},accounts:{markAuth(id,status){states.push(status);}}});
  assert.deepEqual(states,["awaiting_user"]);
});

test("worker installs missing CLI once while startup checks overlap", async () => {
  const states = [];
  let installed = false, installs = 0, release;
  const gate = new Promise((resolve) => { release = resolve; });
  const runtime = createRuntimeBootstrap({
    pool: {
      runtimeStatus: async () => ({ ok: installed, code: installed ? "ready" : "image_missing", image: "pinned", message: "status" }),
      installRuntime: async () => { installs++; await gate; installed = true; },
    },
    report: (state) => states.push(state),
  });
  const pending = runtime.check();
  await Promise.resolve();
  assert.equal(states.at(-1).state, "installing");
  assert.equal(runtime.isReady(), false);
  assert.equal(runtime.check(), pending);
  release();
  await pending;
  assert.equal(installs, 1);
  assert.equal(runtime.isReady(), true);
  assert.equal(states.at(-1).state, "ready");
});

test("worker reuses existing CLI and does not install when Docker is unavailable", async () => {
  for (const status of [{ok:true,code:"ready"}, {ok:false,code:"docker_missing"}, {ok:false,code:"docker_stopped"}]) {
    let installs = 0;
    const runtime = createRuntimeBootstrap({pool:{ runtimeStatus: async()=>status, installRuntime:async()=>{ installs++; } }, report(){} });
    await runtime.check();
    assert.equal(installs,0);
    assert.equal(runtime.isReady(),status.ok);
  }
});

test("failed runtime installation backs off and retries", async () => {
  let time = 0, attempts = 0;
  const states = [];
  const runtime = createRuntimeBootstrap({
    pool: {runtimeStatus:async()=>({ok:false,code:"image_missing"}),installRuntime:async()=>{attempts++;throw new Error("network unavailable");}},
    report:(state)=>states.push(state), now:()=>time, retryMs:1000,
  });
  await runtime.check();
  await runtime.check();
  assert.equal(attempts,1);
  assert.equal(states.at(-1).state,"failed");
  time = 1001;
  await runtime.check();
  assert.equal(attempts,2);
});

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function start() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "storydock-bs-"));
  const services = openServices({
    paths: {
      root,
      database: path.join(root, "data", "storydock.sqlite"),
      media: path.join(root, "media"),
      runs: path.join(root, "runs"),
      backups: path.join(root, "backups"),
      cli: path.join(root, "cli"),
      runtime: path.join(root, "run"),
      masterKey: path.join(root, "master-key"),
      staticRoot: __dirname,
      port: 0,
      host: "127.0.0.1",
      accessPassword: "",
      publicBase: "",
    },
  });
  const app = await createHttpApp(services);
  return {
    app,
    services,
    async close() {
      await app.close();
      services.db.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

function json(response) {
  return JSON.parse(response.body);
}

test("cancelled OAuth sessions cannot be revived by a late worker result", async () => {
  const ctx = await start();
  try {
    const accounts = ctx.services.repos.accounts;
    const account = accounts.createAccount({name:"测试账号"});
    const first = accounts.createAuthSession(account.id);
    accounts.markAuth(first.authSessionId,"starting");
    const second = accounts.createAuthSession(account.id);
    accounts.markAuth(first.authSessionId,"awaiting_user","late response");
    assert.equal(accounts.getAuthSession(first.authSessionId).status,"cancelled");
    accounts.saveAuthExchange(account.id,{authSessionId:first.authSessionId,authorizationUrl:"https://jimeng.jianying.com/old",expiresAt:new Date(Date.now()+60000).toISOString(),nonce:"old",ciphertext:"old"});
    assert.equal(accounts.getAuthSession(second.authSessionId).status,"queued");
    assert.equal(accounts.getAuthSession(second.authSessionId).authorizationUrl,"");
  } finally { await ctx.close(); }
});

async function authPage(sessionResults) {
  const elements = new Map();
  let closed = false, toast = "", polls = 0;
  const context = require("node:vm").createContext({
    window: {}, sessionStorage:{getItem:()=>""},localStorage:{getItem:()=>null},
    document:{querySelector:(key)=>elements.get(key)||null,createTextNode:(text)=>text,createElement:()=>({})},
    setTimeout:(fn)=>{fn();return 1;},setInterval(){},clearTimeout(){},EventSource:class{},
    fetch:async(url,options)=>{
      let data={};
      if(url.endsWith("/auth-sessions")) data={authSessionId:"session"};
      else if(url.includes("/auth-sessions/")){data=sessionResults[Math.min(polls,sessionResults.length-1)];polls++;}
      else if(url.endsWith("/projects")) data={projects:[]};
      else if(url.endsWith("/jimeng/accounts"))data={accounts:[]};
      else if(url.endsWith("/system/runtime"))data={cli:{}};
      return {ok:true,status:200,text:async()=>JSON.stringify(data)};
    },
  });
  require("node:vm").runInContext(fs.readFileSync(path.join(__dirname,"web/api.js"),"utf8"),context);
  context.window.storydockApi.attach({
    read:()=>({connections:{image:{},pool:{}}}),replaceAll(){},render(){},
    modal(){for(const key of ["#authLink","#authStatus"])elements.set(key,{textContent:"",replaceChildren(){},append(){}});},
    close(){closed=true;elements.clear();},toast(text){toast=text;},
  });
  await context.window.storydockApi.beginAuth({id:"account",name:"我的账号"});
  return {elements,closed,toast,polls};
}

test("authorization waits past the old 40-poll limit and reports success",async()=>{
  const page=await authPage([...Array.from({length:45},()=>({status:"awaiting_user"})),{status:"authorized"}]);
  assert.equal(page.polls,46);assert.equal(page.closed,true);assert.match(page.toast,/授权完成/);
});

test("authorization errors remain visible inside the dialog",async()=>{
  const page=await authPage([{status:"expired",message:"授权已过期，请重新开始"}]);
  assert.equal(page.closed,false);assert.match(page.elements.get("#authStatus").textContent,/授权已过期/);
  assert.equal(page.elements.get("#authLink").textContent,"本次授权已结束。");
});

test("browser server bootstrap uses external scripts allowed by CSP", async () => {
  const ctx = await start();
  try {
    const page = await ctx.app.inject({ method: "GET", url: "/" });
    assert.match(page.body, /script-src 'self'/);
    assert.doesNotMatch(page.body, /<script>window\.__STORYDOCK_SERVER__/);
    assert.ok(page.body.indexOf('src="web/api.js"') < page.body.indexOf('src="app.js"'));
    const script = await ctx.app.inject({ method: "GET", url: "/web/api.js" });
    assert.match(script.body, /window\.__STORYDOCK_SERVER__ = true/);
  } finally { await ctx.close(); }
});

test("secret store binds ciphertext to account and purpose", () => {
  const store = createSecretStore(crypto.randomBytes(32));
  const sealed = store.seal("keyring-password", { accountId: "account-1", purpose: "keyring" });
  assert.equal(store.open(sealed, { accountId: "account-1", purpose: "keyring" }), "keyring-password");
  assert.throws(() => store.open(sealed, { accountId: "account-2", purpose: "keyring" }));
  assert.throws(() => store.open(sealed, { accountId: "account-1", purpose: "image-api-key" }));
});

test("asset mentions prefer the longer name and reject exact duplicates", () => {
  const found = findMentions("@少年·外勤装 看向 @少年", [
    { id: "1", name: "少年" },
    { id: "2", name: "少年·外勤装" },
  ]);
  assert.deepEqual(found.map((asset) => asset.name), ["少年·外勤装", "少年"]);
  assert.throws(
    () => findMentions("@少年", [{ id: "1", name: "少年" }, { id: "2", name: "少年" }]),
    /多个资产/,
  );
});

test("two browsers share projects and a stale revision returns 409", async () => {
  const ctx = await start();
  const created = json(await ctx.app.inject({ method: "POST", url: "/api/v1/projects", payload: { name: "雾都来信", ratio: "16:9" } }));
  const listed = json(await ctx.app.inject({ method: "GET", url: "/api/v1/projects" }));
  assert.equal(listed.projects[0].id, created.project.id);
  const saved = json(await ctx.app.inject({
    method: "PATCH",
    url: `/api/v1/projects/${created.project.id}`,
    payload: { revision: created.project.revision, name: "雨夜档案" },
  }));
  assert.equal(saved.project.name, "雨夜档案");
  const stale = await ctx.app.inject({
    method: "PATCH",
    url: `/api/v1/projects/${created.project.id}`,
    payload: { revision: created.project.revision, name: "被覆盖" },
  });
  assert.equal(stale.statusCode, 409);
  assert.equal(json(stale).error.code, "revision_conflict");
  const removed = json(await ctx.app.inject({ method: "DELETE", url: `/api/v1/projects/${created.project.id}` }));
  assert.equal(removed.deleted, true);
  assert.equal(json(await ctx.app.inject({ method: "GET", url: "/api/v1/projects" })).projects.length, 0);
  const page = await ctx.app.inject({ method: "GET", url: "/" });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /src="web\/api.js"/);
  await ctx.close();
});

test("media range requests and frozen video references survive renames", async () => {
  const ctx = await start();
  const project = json(await ctx.app.inject({ method: "POST", url: "/api/v1/projects", payload: { name: "参考图", ratio: "16:9" } })).project;
  await ctx.app.inject({
    method: "PUT",
    url: "/api/v1/connections/image",
    payload: { name: "桩", baseUrl: "https://example.com/v1", model: "gpt-image-2", resolution: "1k", apiKey: "sk-test" },
  });
  const asset = json(await ctx.app.inject({
    method: "POST",
    url: `/api/v1/projects/${project.id}/assets`,
    payload: { name: "宫廷", type: "场景", prompt: "宫殿" },
  }));
  const boundary = "----storydock";
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="court.png"\r\nContent-Type: image/png\r\n\r\n`),
    PNG,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const uploaded = json(await ctx.app.inject({
    method: "POST",
    url: `/api/v1/assets/${asset.id}/versions`,
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    payload,
  }));
  assert.equal(uploaded.mediaId.length > 10, true);
  const ranged = await ctx.app.inject({ method: "GET", url: `/api/v1/media/${uploaded.mediaId}`, headers: { range: "bytes=0-3" } });
  assert.equal(ranged.statusCode, 206);
  assert.match(String(ranged.headers["content-range"]), /^bytes 0-3\//);
  assert.equal(ranged.rawPayload.length, 4);
  await ctx.app.inject({ method: "PUT", url: `/api/v1/assets/${asset.id}/locked-version`, payload: { versionId: uploaded.id } });
  const shot = json(await ctx.app.inject({
    method: "POST",
    url: `/api/v1/projects/${project.id}/shots`,
    payload: { title: "入殿", prompt: "@宫廷 中转身", episode: 1, number: 1, duration: 6 },
  }));
  const key = crypto.randomUUID();
  const batch = json(await ctx.app.inject({
    method: "POST",
    url: `/api/v1/projects/${project.id}/jobs/batch`,
    headers: { "idempotency-key": key },
    payload: { kind: "video", sourceIds: [shot.id], model: "seedance2.0", resolution: "720p", ratio: "16:9" },
  }));
  assert.equal(batch.jobIds.length, 1);
  const replay = json(await ctx.app.inject({
    method: "POST",
    url: `/api/v1/projects/${project.id}/jobs/batch`,
    headers: { "idempotency-key": key },
    payload: { kind: "video", sourceIds: [shot.id], model: "seedance2.0", resolution: "720p", ratio: "16:9" },
  }));
  assert.deepEqual(replay.jobIds, batch.jobIds);
  const conflict = await ctx.app.inject({
    method: "POST",
    url: `/api/v1/projects/${project.id}/jobs/batch`,
    headers: { "idempotency-key": key },
    payload: { kind: "video", sourceIds: [shot.id], model: "seedance2.0fast", resolution: "720p", ratio: "16:9" },
  });
  assert.equal(conflict.statusCode, 409);
  const frozen = ctx.services.repos.jobs.getJob(batch.jobIds[0]);
  assert.match(frozen.inputSnapshot, /宫廷/);
  const detail = json(await ctx.app.inject({ method: "GET", url: `/api/v1/projects/${project.id}` }));
  const current = detail.project.data.assets[0];
  await ctx.app.inject({
    method: "PATCH",
    url: `/api/v1/assets/${asset.id}`,
    payload: { revision: current.revision, name: "新宫殿" },
  });
  assert.match(ctx.services.repos.jobs.getJob(batch.jobIds[0]).inputSnapshot, /宫廷/);
  assert.doesNotMatch(ctx.services.repos.jobs.getJob(batch.jobIds[0]).inputSnapshot, /新宫殿/);
  await ctx.close();
});

test("an expired submit without a remote id becomes submit_unknown and is not resent", async () => {
  const ctx = await start();
  const project = json(await ctx.app.inject({ method: "POST", url: "/api/v1/projects", payload: { name: "队列" } })).project;
  await ctx.app.inject({
    method: "PUT",
    url: "/api/v1/connections/image",
    payload: { name: "桩", baseUrl: "https://example.com/v1", model: "gpt-image-2", apiKey: "sk-test" },
  });
  const asset = json(await ctx.app.inject({
    method: "POST",
    url: `/api/v1/projects/${project.id}/assets`,
    payload: { name: "角色", type: "角色", prompt: "肖像" },
  }));
  const batch = json(await ctx.app.inject({
    method: "POST",
    url: `/api/v1/projects/${project.id}/jobs/batch`,
    headers: { "idempotency-key": crypto.randomUUID() },
    payload: { kind: "image", sourceIds: [asset.id], ratio: "1:1" },
  }));
  const scheduler = createScheduler({
    repos: ctx.services.repos,
    db: ctx.services.db,
    media: ctx.services.media,
    providers: {
      image: {
        async prepare() {},
        async submit(job) {
          const stored = await ctx.services.repos.content.saveMedia({ projectId: job.projectId, bytes: PNG, source: "generation", assetId: job.sourceId });
          return { outcome: "succeeded", mediaId: stored.id };
        },
        async query() { return { outcome: "pending" }; },
        async download() { return { outcome: "pending" }; },
      },
      jimeng: { async prepare() {}, async submit() { return { outcome: "failed" }; }, async query() { return { outcome: "pending" }; }, async download() { return { outcome: "pending" }; } },
    },
  });
  await scheduler.tick();
  assert.equal(ctx.services.repos.jobs.getJob(batch.jobIds[0]).status, "succeeded");
  const version = ctx.services.repos.content.graph(project.id).assets[0].selected_version_id;
  assert.ok(version);
  const unknown = ctx.services.db.prepare("INSERT INTO jobs(id,project_id,source_id,kind,status,provider,lease_until,remote_task_id,config_snapshot,input_snapshot,created_at,updated_at) VALUES(?,?,?,'image','submitting','image',? ,NULL,'{}','{}',?,?)")
    .run(crypto.randomUUID(), project.id, asset.id, new Date(Date.now() - 5000).toISOString(), new Date().toISOString(), new Date().toISOString());
  void unknown;
  const expiredId = ctx.services.db.prepare("SELECT id FROM jobs WHERE status='submitting'").get().id;
  ctx.services.repos.jobs.claimJob("worker-b");
  assert.equal(ctx.services.repos.jobs.getJob(expiredId).status, "submit_unknown");
  const retry = await ctx.app.inject({ method: "POST", url: `/api/v1/jobs/${expiredId}/retry`, payload: {} });
  assert.equal(retry.statusCode, 409);
  assert.equal(json(retry).error.code, "confirmation_required");
  await ctx.close();
});

test("old project packages report missing files and do not resubmit remote jobs", async () => {
  const ctx = await start();
  const manifest = {
    schemaVersion: 1,
    kind: "storydock-project",
    project: {
      name: "旧项目",
      description: "",
      style: "",
      data: {
        settings: { ratio: "9:16" },
        assets: [{ name: "沈知微", type: "角色", prompt: "肖像", image: "file:///tmp/missing.png" }],
        shots: [{ title: "开场", prompt: "@沈知微 转身", episode: 1, number: 1, duration: 6 }],
        jobs: [{ id: "old-job", sourceId: "old", submitId: "remote-123", video: "file:///tmp/missing.mp4" }],
      },
    },
  };
  const archive = zipStore([{ name: "manifest.json", data: Buffer.from(JSON.stringify(manifest)) }]);
  const boundary = "----storydockzip";
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="project.zip"\r\nContent-Type: application/zip\r\n\r\n`),
    archive,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const imported = json(await ctx.app.inject({
    method: "POST",
    url: "/api/v1/imports",
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    payload,
  }));
  assert.equal(imported.report.assets, 1);
  assert.equal(imported.report.shots, 1);
  assert.equal(imported.report.missing.length, 2);
  const job = ctx.services.db.prepare("SELECT status, remote_task_id FROM jobs WHERE project_id=?").get(imported.project.id);
  assert.equal(job.status, "submit_unknown");
  assert.equal(job.remote_task_id, "remote-123");
  await ctx.close();
});

test('text-only shots enqueue without references while referenced assets still need fixed images',async()=>{
 const ctx=await start();
 try {
  const project=json(await ctx.app.inject({method:'POST',url:'/api/v1/projects',payload:{name:'纯文生视频'}})).project;
  const asset=json(await ctx.app.inject({method:'POST',url:`/api/v1/projects/${project.id}/assets`,payload:{name:'宫廷',type:'场景',prompt:'宫廷'}}));
  for(const [prompt,expected] of [['云海中的宫廷，镜头缓慢推进。',202],['@宫廷 镜头推进。',400]]){
   const shot=json(await ctx.app.inject({method:'POST',url:`/api/v1/projects/${project.id}/shots`,payload:{title:'场景',prompt,episode:1,number:expected,duration:5}}));
   const response=await ctx.app.inject({method:'POST',url:`/api/v1/projects/${project.id}/jobs/batch`,headers:{'idempotency-key':crypto.randomUUID()},payload:{kind:'video',sourceIds:[shot.id],model:'seedance2.0',ratio:'16:9',resolution:'720p'}});
   assert.equal(response.statusCode,expected,response.body);
   if(expected===202){const job=ctx.services.repos.jobs.getJob(json(response).jobIds[0]);assert.deepEqual(JSON.parse(job.inputSnapshot).references,[]);}
   else assert.equal(json(response).error.code,'reference_not_ready');
  }
 } finally {await ctx.close();}
});
test('server page exposes web video integration without loading retired international CLI UI',async()=>{const c=await start();try{const response=await c.app.inject({method:'GET',url:'/'});assert.equal(response.statusCode,200);assert.ok(response.body.includes('src="web/dreamina-web.js"'));assert.ok(!response.body.includes('src="web/global.js"'));}finally{await c.close();}});
test('API shutdown closes active event streams instead of blocking service restart',async()=>{const c=await start(),abort=new AbortController();let timeout;try{c.services.repos.content.createProject({name:'event shutdown'});const address=await c.app.listen({port:0,host:'127.0.0.1'});const response=await fetch(address+'/api/v1/events',{headers:{accept:'text/event-stream'},signal:abort.signal});assert.equal(response.status,200);await Promise.race([c.app.close(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Event stream blocked shutdown')),2000);})]);}finally{clearTimeout(timeout);abort.abort();await c.close();}});

test('synchronous image responses use bounded concurrency without blocking other jobs or expiring active leases', async (t) => {
  const ctx = await start();
  const gates = [], submitted = [];
  let otherCalls = 0;
  let scheduler;
  const renewals = new Set();
  const timers = { setInterval(fn) { renewals.add(fn); return { unref() {} }; }, clearInterval() {} };
  try {
    const project = json(await ctx.app.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: '同步并发' } })).project;
    await ctx.app.inject({ method: 'PUT', url: '/api/v1/connections/image', payload: { name: 'sync', baseUrl: 'https://example.com/v1', model: 'gpt-image-2', apiKey: 'test' } });
    const ids = [];
    for (let i=0;i<3;i++) ids.push(json(await ctx.app.inject({ method:'POST',url:`/api/v1/projects/${project.id}/assets`,payload:{name:`角色${i}`,type:'角色',prompt:'portrait'} })).id);
    const batch = json(await ctx.app.inject({method:'POST',url:`/api/v1/projects/${project.id}/jobs/batch`,headers:{'idempotency-key':crypto.randomUUID()},payload:{kind:'image',sourceIds:ids,ratio:'1:1'}}));
    const jobs = ctx.services.repos.jobs;
    const otherId = crypto.randomUUID(), stamp = new Date(Date.now()+1000).toISOString();
    ctx.services.db.prepare("INSERT INTO jobs(id,project_id,source_id,kind,status,provider,config_snapshot,input_snapshot,created_at,updated_at) VALUES(?,?,?,'image','queued','other','{}','{}',?,?)").run(otherId,project.id,ids[0],stamp,stamp);
    scheduler=createScheduler({repos:ctx.services.repos,db:ctx.services.db,owner:'sync-test',imageConcurrency:2,timers,providers:{
      image:{async prepare(){},async submit(job){submitted.push(job.id);await new Promise(resolve=>gates.push(resolve));const saved=await ctx.services.repos.content.saveMedia({projectId:job.projectId,assetId:job.sourceId,bytes:PNG,source:'generation'});return {outcome:'succeeded',mediaId:saved.id};}},
      other:{async prepare(){},async submit(){otherCalls++;return {outcome:'failed',message:'test terminal'};}},
    }});
    await scheduler.tick({backgroundImages:true});
    assert.equal(submitted.length,2,'second image is submitted before the first response');
    assert.equal(jobs.listJobs(project.id).filter(j=>j.provider==='image'&&j.status==='queued').length,1);
    await scheduler.tick({backgroundImages:true});
    assert.equal(otherCalls,1,'saturated images do not block other providers');
    assert.equal(submitted.length,2,'concurrency limit is enforced');
    ctx.services.db.prepare("UPDATE jobs SET lease_until=? WHERE lease_owner='sync-test'").run(new Date(Date.now()-1000).toISOString());
    for (const renew of renewals) renew();
    assert.equal(jobs.claimJob('another-worker',180000,{excludeImages:true}),null);
    for(const id of submitted)assert.equal(jobs.getJob(id).status,'submitting','lease renewal keeps pending sync requests owned');
    gates.splice(0).forEach(resolve=>resolve());
    await scheduler.drain();
    assert.equal(submitted.filter(id=>jobs.getJob(id).status==='succeeded').length,2);
    await scheduler.tick({backgroundImages:true});
    assert.equal(submitted.length,3,'remaining image starts when a slot is released');
    gates.splice(0).forEach(resolve=>resolve());
    await scheduler.drain();
    assert.ok(batch.jobIds.every(id=>jobs.getJob(id).status==='succeeded'));
  } finally {
    gates.splice(0).forEach(resolve=>resolve());
    await scheduler?.drain();
    await ctx.close();
  }
});

test('event bursts and overlapping polls share one jobs request and one UI merge', async () => {
  const vm=require('node:vm');
  let source, poll, resolveJobs, calls=0, merges=0;
  const hooks={read:()=>({activeProject:{id:'project'},connections:{image:{},pool:{}}}),replaceAll(){},render(){},toast(){},setRuntime(){},setAccounts(){},mergeJobs(){merges++;}};
  const context=vm.createContext({window:{},sessionStorage:{getItem:()=>''},localStorage:{getItem:()=>null},setTimeout,clearTimeout,setInterval(fn){poll=fn;},EventSource:class{constructor(){source=this;}},fetch:async(url)=>{
    if(url.endsWith('/jobs')){calls++;await new Promise(resolve=>{resolveJobs=resolve;});}
    const data=url.endsWith('/projects')?{projects:[]}:url.endsWith('/accounts')?{accounts:[]}:url.endsWith('/jobs')?{jobs:[]}:{};
    return {ok:true,status:200,text:async()=>JSON.stringify(data)};
  }});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'web/api.js'),'utf8'),context);
  context.window.storydockApi.attach(hooks);
  await new Promise(resolve=>setImmediate(resolve));
  for(let i=0;i<500;i++)source.onmessage({lastEventId:String(i),data:JSON.stringify({type:'job.updated'})});
  for(let i=0;i<20;i++)poll();
  await new Promise(resolve=>setTimeout(resolve,200));
  assert.equal(calls,1);
  resolveJobs();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(merges,1);
  poll();
  assert.equal(calls,2,'later polls continue after the pending request completes');
  resolveJobs();
  await new Promise(resolve=>setImmediate(resolve));
});

test('SSE starts at latest event and reconnect resumes from Last-Event-ID',async()=>{
  const c=await start();
  const controllers=[];
  try{
    c.services.repos.content.createProject({name:'old snapshot'});
    const last=c.services.db.prepare('SELECT MAX(seq) AS seq FROM job_events').get().seq;
    const address=await c.app.listen({port:0,host:'127.0.0.1'});
    const read=async(headers)=>{
      const abort=new AbortController();controllers.push(abort);
      const r=await fetch(address+'/api/v1/events',{headers:{accept:'text/event-stream',...headers},signal:abort.signal});
      const reader=r.body.getReader();const chunk=await reader.read();abort.abort();return Buffer.from(chunk.value).toString();
    };
    const fresh=await read({});
    assert.match(fresh,/: connected/);assert.doesNotMatch(fresh,/data:/,'initial page snapshot must not trigger a historic event storm');
    const resumed=await read({'last-event-id':String(last-1)});
    assert.match(resumed,new RegExp('id: '+last+'\\n'));
  }finally{controllers.forEach(c=>c.abort());await c.close();}
});

test('domestic CLI admits multiple remote videos per account up to configured capacity',async()=>{
 const c=await start();
 try{
  const {repos,db}=c.services,project=repos.content.createProject({name:'国内并行'}).project,a=repos.accounts.createAccount({name:'并行账号'});
  db.prepare("UPDATE jimeng_accounts SET authorized=1,permission='allowed' WHERE id=?").run(a.id);
  repos.accounts.updatePool({remoteTaskLimit:3});
  for(let i=0;i<4;i++){const stamp=new Date(Date.now()+i).toISOString();db.prepare("INSERT INTO jobs(id,project_id,source_id,kind,status,provider,config_snapshot,input_snapshot,created_at,updated_at) VALUES(?,?,?,'video','queued','jimeng','{}','{}',?,?)").run(crypto.randomUUID(),project.id,crypto.randomUUID(),stamp,stamp);}
  for(let i=0;i<3;i++){
   const job=repos.jobs.claimJob('domestic-test');assert.ok(job);assert.equal(job.accountId,a.id);
   repos.jobs.commitJob(job,{status:'remote_running',remote_task_id:'official-'+i,next_run_at:new Date(Date.now()+60000).toISOString(),lease_owner:null,lease_until:null});
  }
  assert.equal(repos.jobs.claimJob('domestic-test'),null);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status='remote_running'").get().n,3);
 }finally{await c.close();}
});

test('HTTP copy writes directly through legacy clipboard without a manual-copy modal',async()=>{
 const vm=require('node:vm');let copied='',removed=false,focused=false;
 const field={style:{},focus(){},select(){},remove(){removed=true;}};
 const context=vm.createContext({navigator:{},document:{activeElement:{focus(){focused=true;}},createElement:()=>field,body:{append(){}},execCommand(action){assert.equal(action,'copy');copied=field.value;return true;}}});
 const source=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');vm.runInContext(source.slice(0,source.indexOf('const paths =')),context);
 await vm.runInContext('copyText("Codex 指令内容")',context);
 assert.equal(copied,'Codex 指令内容');assert.ok(removed&&focused);
});

test('hash routing restores page and project after refresh and browser back',()=>{
 const vm=require('node:vm'),listeners={},history=[];
 const window={location:{hash:'#/shots?project=second'},history:{},addEventListener(name,fn){listeners[name]=fn;}};
 for(const name of ['pushState','replaceState'])window.history[name]=(_,__,hash)=>{history.push({name,hash});window.location.hash=hash;};
 const first={id:'first',data:{marker:1}},second={id:'second',data:{marker:2}};
 const context=vm.createContext({window,URLSearchParams,workspace:{projects:[first,second]},activeProject:first,state:first.data,view:'projects',selected:new Set(),selectedShots:new Set(),close(){},render(){}});
 const source=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
 vm.runInContext(source.slice(source.indexOf('const routeViews ='),source.indexOf('let workspaceGeneration =')),context);
 vm.runInContext('restoreRoute()',context);
 assert.equal(context.view,'shots');assert.equal(context.activeProject.id,'second');assert.equal(context.state.marker,2);
 vm.runInContext('view="jobs";updateRoute()',context);
 assert.equal(window.location.hash,'#/jobs?project=second');
 window.location.hash='#/assets?project=first';listeners.popstate();
 assert.equal(context.view,'assets');assert.equal(context.activeProject.id,'first');
 window.location.hash='#/shots?project=deleted';listeners.hashchange();assert.equal(context.view,'projects');
 assert.equal(history[0].name,'pushState');
});

test('application login protects APIs, imports old passwords and revokes sessions on password changes',async()=>{
 const c=await start();
 try{
  const {importLegacyUsers,verify}=require('./server/auth-http.cjs');const file=path.join(c.services.paths.root,'legacy.htpasswd');const hash=await require('bcryptjs').hash('legacy-test-password',4);fs.writeFileSync(file,'admin:'+hash.replace('$2b$','$2y$')+'\n');importLegacyUsers(c.services.db,file);
  assert.equal((await c.app.inject({url:'/api/v1/projects'})).statusCode,401);
  assert.equal((await c.app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username:'admin',password:'wrong'}})).statusCode,401);
  const login=await c.app.inject({method:'POST',url:'/api/v1/auth/login',headers:{host:'example.test:18456',origin:'http://example.test:18456'},payload:{username:'admin',password:'legacy-test-password'}});assert.equal(login.statusCode,200);const cookie=login.headers['set-cookie'].split(';')[0];assert.match(login.headers['set-cookie'],/HttpOnly/);assert.match(login.headers['set-cookie'],/SameSite=Lax/);
  assert.equal((await c.app.inject({url:'/api/v1/projects',headers:{cookie}})).statusCode,200);
  assert.ok(c.services.db.prepare('SELECT password_hash FROM app_users').get().password_hash.startsWith('scrypt:'));
  assert.notEqual(c.services.db.prepare('SELECT token_hash FROM app_sessions').get().token_hash,cookie.split('=')[1]);
  assert.equal((await c.app.inject({method:'POST',url:'/api/v1/projects',headers:{cookie,origin:'https://another-site.example'},payload:{name:'bad origin'}})).statusCode,403);
  const changed=await c.app.inject({method:'PUT',url:'/api/v1/auth/password',headers:{cookie},payload:{username:'owner',currentPassword:'legacy-test-password',password:'new-test-password'}});assert.equal(changed.statusCode,200);
  assert.equal((await c.app.inject({url:'/api/v1/projects',headers:{cookie}})).statusCode,401);
  assert.ok(await verify('new-test-password',c.services.db.prepare('SELECT password_hash FROM app_users').get().password_hash));
  const fresh=changed.headers['set-cookie'].split(';')[0];assert.equal((await c.app.inject({url:'/api/v1/auth/session',headers:{cookie:fresh}})).json().user.username,'owner');
  await c.app.inject({method:'POST',url:'/api/v1/auth/logout',headers:{cookie:fresh}});assert.equal((await c.app.inject({url:'/api/v1/projects',headers:{cookie:fresh}})).statusCode,401);
 }finally{await c.close();}
});

test('server backup roundtrip preserves image versions references locks and shots',async()=>{
 const c=await start();try{
  const {repos}=c.services,p=repos.content.createProject({name:'React备份验收'}).project;
  const asset=repos.content.createAsset({projectId:p.id,name:'角色',type:'角色',prompt:'portrait'});
  const v=await repos.content.addVersion(asset.id,{bytes:PNG,source:'upload'});await repos.content.addReference(asset.id,PNG);repos.content.setLockedVersion(asset.id,v.id);
  repos.content.createShot({projectId:p.id,title:'镜头',prompt:'@角色 回头',episode:1,number:1,duration:5});
  const row=repos.accounts.createExport({projectId:p.id,kind:'backup',manifest:{}});
  await createScheduler({repos,db:c.services.db,media:c.services.media,providers:{}}).tick();
  const downloaded=await c.app.inject({url:`/api/v1/exports/${row.id}/download`});assert.equal(downloaded.statusCode,200);
  const boundary='restoretest';const body=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="backup.zip"\r\nContent-Type: application/zip\r\n\r\n`),downloaded.rawPayload,Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const result=await c.app.inject({method:'POST',url:'/api/v1/imports',headers:{'content-type':`multipart/form-data; boundary=${boundary}`},payload:body});assert.equal(result.statusCode,201,result.body);const restored=result.json().project;assert.equal(restored.data.assets[0].versions.length,1);assert.equal(restored.data.assets[0].references.length,1);assert.equal(restored.data.assets[0].locked,true);assert.equal(restored.data.shots[0].refs[0],'角色');
 }finally{await c.close();}
});

test('Jianying export freezes shot order and video versions, requires explicit missing-shot choice',async()=>{
 const c=await start();try{
  const {repos,db,media}=c.services,p=repos.content.createProject({name:'剪映导出验收'}).project;
  const shot=repos.content.createShot({projectId:p.id,title:'第一镜',prompt:'test',episode:1,number:1,duration:15});
  const missing=repos.content.createShot({projectId:p.id,title:'未生成镜头',prompt:'test',episode:1,number:2,duration:5});
  assert.equal((await c.app.inject({method:'POST',url:`/api/v1/projects/${p.id}/exports`,payload:{kind:'jianying'}})).statusCode,409);
  const bytes=require('./test-fixtures/mp4.cjs').fixture(2.75);
  const stored=await repos.content.saveMedia({projectId:p.id,bytes,video:true,source:'test'}),stamp=new Date().toISOString();
  db.prepare("INSERT INTO jobs(id,project_id,source_id,kind,status,provider,media_id,config_snapshot,input_snapshot,created_at,updated_at,completed_at) VALUES(?,?,?,'video','succeeded','jimeng',?,'{}','{}',?,?,?)").run(crypto.randomUUID(),p.id,shot.id,stored.id,stamp,stamp,stamp);
  const blocked=await c.app.inject({method:'POST',url:`/api/v1/projects/${p.id}/exports`,payload:{kind:'jianying'}});assert.equal(blocked.statusCode,409);assert.equal(blocked.json().missing[0].id,missing.id);
  const ready=await c.app.inject({method:'POST',url:`/api/v1/projects/${p.id}/exports`,payload:{kind:'jianying',allowPartial:true}});assert.equal(ready.statusCode,202,ready.body);
  const row=repos.accounts.getExport(ready.json().exportId);const plan=JSON.parse(row.manifest_json).plan;assert.equal(plan.clips[0].title,'第一镜');
  repos.content.updateShot(shot.id,{title:'提交导出后改名',revision:shot.revision});
  await createScheduler({repos,db,media,providers:{}}).tick();
  const status=await c.app.inject({url:`/api/v1/exports/${row.id}`});assert.equal(status.json().status,'succeeded',status.body);
  const download=await c.app.inject({url:`/api/v1/exports/${row.id}/download`});assert.equal(download.statusCode,200);
  const files=require('./server/zip.cjs').unzip(download.rawPayload),timeline=JSON.parse(files.find(f=>f.name==='timeline.json').data);
  assert.equal(timeline.durationUs,2750000);assert.equal(timeline.clips[0].title,'第一镜');assert.equal(timeline.missing.length,1);assert.ok(files.some(f=>f.name==='导入剪映-Windows.cmd'));assert.ok(files.some(f=>f.name==='导入剪映-Mac.command'));
 }finally{await c.close();}
});

test('new image jobs freeze type-specific four-view prompts while preserving editable originals',async()=>{
 const c=await start();try{
  const {repos}=c.services,p=repos.content.createProject({name:'四视图验收'}).project;
  await c.app.inject({method:'PUT',url:'/api/v1/connections/image',payload:{name:'four-view',baseUrl:'https://example.com/v1',model:'gpt-image-2',apiKey:'test-key'}});
  const assets=['角色','场景','道具'].map((type,i)=>repos.content.createAsset({projectId:p.id,name:type,type,prompt:`原始描述${i}`}));
  const batch=repos.jobs.createBatch({projectId:p.id,body:{kind:'image',sourceIds:assets.map(a=>a.id)},idempotencyKey:crypto.randomUUID()});
  const inputs=batch.jobIds.map(id=>JSON.parse(repos.jobs.getJob(id).inputSnapshot));
  for(let i=0;i<inputs.length;i++){
   assert.equal(inputs[i].promptOriginal,`原始描述${i}`);
   assert.match(inputs[i].promptSubmitted,/2×2等大四宫格/);
   assert.equal(inputs[i].promptSubmitted.split('【默认资产四视图版式】').length,2);
  }
  assert.match(inputs[0].promptSubmitted,/完整全身/);
  assert.match(inputs[1].promptSubmitted,/同一剧情时段/);
  assert.match(inputs[2].promptSubmitted,/不额外加入手持人物/);
  assert.equal(repos.content.graph(p.id).assets[0].prompt,'原始描述0');
  repos.content.updateAsset(assets[0].id,{revision:assets[0].revision,prompt:'后来修改'});
  assert.equal(JSON.parse(repos.jobs.getJob(batch.jobIds[0]).inputSnapshot).promptSubmitted,inputs[0].promptSubmitted);
  let received;
  const provider=require('./worker/providers/image.cjs').createImageProvider({repos,fetchImpl:async(url,options)=>{received=JSON.parse(options.body);return {ok:true,json:async()=>({data:[{b64_json:PNG.toString('base64')}]})};}});
  await provider.submit(repos.jobs.getJob(batch.jobIds[0]));
  assert.equal(received.prompt,inputs[0].promptSubmitted);
 }finally{await c.close();}
});

test('project references apply to every asset, deduplicate own images, stay frozen and remain isolated',async()=>{
 const c=await start();try{
  const {repos}=c.services,p=repos.content.createProject({name:'公共参考验收'}).project,other=repos.content.createProject({name:'另一个项目'}).project;
  const a=repos.content.createAsset({projectId:p.id,name:'角色',type:'角色',prompt:'portrait'}),b=repos.content.createAsset({projectId:p.id,name:'场景',type:'场景',prompt:'room'}),o=repos.content.createAsset({projectId:other.id,name:'其他',type:'道具',prompt:'prop'});
  const ref=await repos.content.addProjectReference(p.id,PNG);await repos.content.addProjectReference(p.id,PNG);
  await repos.content.addReference(a.id,PNG);const own=await repos.content.addReference(a.id,Buffer.concat([PNG,Buffer.from('own')]));
  assert.equal(repos.content.graph(p.id).projectReferences.length,1);
  assert.throws(()=>repos.content.deleteProjectReference(other.id,ref.id),/不存在/);
  await c.app.inject({method:'PUT',url:'/api/v1/connections/image',payload:{name:'参考图验收',baseUrl:'https://example.com/v1',model:'gpt-image-2',apiKey:'test-key'}});
  const batch=(projectId,ids)=>repos.jobs.createBatch({projectId,body:{kind:'image',sourceIds:ids},idempotencyKey:crypto.randomUUID()});
  const first=batch(p.id,[a.id,b.id]);const jobs=first.jobIds.map(id=>repos.jobs.getJob(id));
  const r=JSON.parse(jobs[0].inputSnapshot).references;
  assert.deepEqual(r.map(x=>x.mediaId),[ref.mediaId,own.mediaId]);assert.deepEqual(r.map(x=>x.index),[1,2]);assert.deepEqual(r.map(x=>x.scope),['project','asset']);
  assert.equal(JSON.parse(jobs[1].inputSnapshot).references[0].mediaId,ref.mediaId);
  assert.equal(JSON.parse(repos.jobs.getJob(batch(other.id,[o.id]).jobIds[0]).inputSnapshot).references.length,0);
  repos.content.deleteProjectReference(p.id,ref.id);
  assert.deepEqual(JSON.parse(repos.jobs.getJob(jobs[0].id).inputSnapshot).references,r);
  assert.equal(JSON.parse(repos.jobs.getJob(batch(p.id,[b.id]).jobIds[0]).inputSnapshot).references.length,0);
  let received;
  const provider=require('./worker/providers/image.cjs').createImageProvider({repos,fetchImpl:async(url,options)=>{received={url,options};return {ok:true,json:async()=>({data:[{b64_json:PNG.toString('base64')}]})};}});
  assert.equal((await provider.submit(jobs[0])).outcome,'succeeded');assert.match(received.url,/images\/edits$/);assert.ok(received.options.body instanceof FormData);const attachments=received.options.body.getAll('image[]');assert.equal(attachments.length,2);assert.deepEqual(Buffer.from(await attachments[0].arrayBuffer()),PNG);
  const apimart={...jobs[0],configSnapshot:JSON.stringify({baseUrl:'https://api.apimart.ai/v1',model:'gpt-image-2',ratio:'16:9'})};await provider.submit(apimart);assert.equal(JSON.parse(received.options.body).image_urls[0],`data:image/png;base64,${PNG.toString('base64')}`);
 }finally{await c.close();}
});

test('project reference upload API persists in backups and combined reference cap never truncates',async()=>{
 const c=await start();try{
  const {repos,db,media}=c.services,p=repos.content.createProject({name:'备份公共参考'}).project;
  const boundary='projectref',body=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="ref.png"\r\nContent-Type: image/png\r\n\r\n`),PNG,Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const upload=await c.app.inject({method:'POST',url:`/api/v1/projects/${p.id}/references`,headers:{'content-type':`multipart/form-data; boundary=${boundary}`},payload:body});assert.equal(upload.statusCode,201,upload.body);
  const detail=(await c.app.inject({url:`/api/v1/projects/${p.id}`})).json().project;assert.equal(detail.data.projectReferences.length,1);
  const row=repos.accounts.createExport({projectId:p.id,kind:'backup',manifest:{}});await createScheduler({repos,db,media,providers:{}}).tick();
  const archive=require('./server/zip.cjs').unzip(fs.readFileSync(media.locate(repos.accounts.getExport(row.id).storage_key)));const manifest=JSON.parse(archive.find(f=>f.name==='manifest.json').data);
  const restored=await require('./server/restore-backup.cjs').restoreBackup(c.services,manifest,archive);
  assert.equal(restored.project.data.projectReferences.length,1);
  const asset=repos.content.createAsset({projectId:p.id,name:'超限测试',type:'角色',prompt:'test'});
  for(let i=0;i<15;i++)await repos.content.addReference(asset.id,Buffer.concat([PNG,Buffer.from('own-'+i)]));
  await c.app.inject({method:'PUT',url:'/api/v1/connections/image',payload:{name:'参考图验收',baseUrl:'https://example.com/v1',model:'gpt-image-2',apiKey:'test'}});
  assert.throws(()=>repos.jobs.createBatch({projectId:p.id,body:{kind:'image',sourceIds:[asset.id]},idempotencyKey:crypto.randomUUID()}),/合计超过 15/);
 }finally{await c.close();}
});
