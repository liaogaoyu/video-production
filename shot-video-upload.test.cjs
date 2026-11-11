const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {openServices}=require('./server/context.cjs'),{createHttpApp}=require('./server/api.cjs'),{hashPassword}=require('./server/auth-http.cjs'),{fixture}=require('./test-fixtures/mp4.cjs'),{presentProject}=require('./server/present.cjs'),{planVideoExport}=require('./server/video-export.cjs');
async function setup(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'sd-upload-')),s=openServices({cwd:__dirname,env:{STORYDOCK_ROOT:root,STORYDOCK_MASTER_KEY:path.join(root,'key')}}),users=[];for(const name of ['alice','bob']){const id=crypto.randomUUID();s.db.prepare('INSERT INTO app_users(id,username,password_hash,role,email,email_verified_at,created_at) VALUES(?,?,?,?,?,?,?)').run(id,name,await hashPassword('test-password'),'user',name+'@example.com',new Date().toISOString(),new Date().toISOString());users.push({id,name});}const p=s.repos.content.createProject({name:'上传测试'}).project;s.db.prepare('UPDATE projects SET owner_user_id=? WHERE id=?').run(users[0].id,p.id);const shot=s.repos.content.createShot({projectId:p.id,episode:1,number:1,title:'手动视频',prompt:'不依赖生图资产',duration:15}),app=await createHttpApp(s);for(const u of users){const r=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username:u.name,password:'test-password'}});assert.equal(r.statusCode,200);u.cookie=r.headers['set-cookie'].split(';')[0];}return {s,p,shot,app,users,async close(){await app.close();s.db.close();fs.rmSync(root,{recursive:true,force:true});}};}
function upload(f,bytes,user=f.users[0],id=f.shot.id){const boundary='fixture-boundary';return f.app.inject({method:'POST',url:`/api/v1/shots/${id}/video`,headers:{cookie:user.cookie,'content-type':'multipart/form-data; boundary='+boundary},payload:Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="片段.mp4"\r\nContent-Type: video/mp4\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--\r\n`)])});}
test('uploaded video is immediately previewable, exportable, retained in history and never billed',async()=>{const f=await setup();try{const bytes=fixture(2.75),r=await upload(f,bytes);assert.equal(r.statusCode,201,r.body);const data=r.json();assert.equal(data.metadata.durationUs,2750000);const video=await f.app.inject({url:data.url,headers:{cookie:f.users[0].cookie}});assert.equal(video.statusCode,200);assert.deepEqual(video.rawPayload,bytes);assert.match(video.headers['content-type'],/video\/mp4/);const graph=f.s.repos.content.graph(f.p.id),project=presentProject(graph);assert.equal(project.data.jobs[0].status,'done');assert.equal(project.data.jobs[0].provider,'upload');assert.equal(project.data.jobs[0].video,data.url);assert.equal(planVideoExport(project,f.s.db,f.s.media).clips[0].mediaId,data.mediaId);assert.equal(graph.shots[0].duration,15);assert.equal(f.s.db.prepare('SELECT count(*) n FROM job_billing').get().n,0);assert.equal(f.s.db.prepare('SELECT count(*) n FROM wallet_ledger').get().n,0);assert.equal(f.s.repos.jobs.claimJob('worker'),null);const second=await upload(f,fixture(3));assert.equal(second.statusCode,201);assert.equal(f.s.repos.content.graph(f.p.id).jobs.length,2);assert.equal((await f.app.inject({url:data.url,headers:{cookie:f.users[0].cookie}})).statusCode,200);}finally{await f.close();}});
test('upload rejects another tenant, deleted shots, and invalid video before creating result',async()=>{const f=await setup();try{assert.equal((await upload(f,fixture(),f.users[1])).statusCode,404);assert.equal((await upload(f,Buffer.from('not a video'))).statusCode,400);assert.equal((await upload(f,Buffer.from([0,0,0,16,102,116,121,112,109,112,52,50,0,0,0,0]))).statusCode,422);assert.equal(f.s.db.prepare('SELECT count(*) n FROM jobs').get().n,0);f.s.repos.content.deleteShot(f.shot.id);assert.equal((await upload(f,fixture())).statusCode,404);}finally{await f.close();}});
test('an older generation finishing later does not replace the uploaded video in export',async()=>{const f=await setup();try{const r=(await upload(f,fixture())).json();const time=new Date().toISOString();f.s.db.prepare("INSERT INTO jobs(id,project_id,source_id,batch_id,kind,status,provider,model,config_snapshot,input_snapshot,media_id,created_at,updated_at,completed_at) VALUES(?,?,?,?,'video','succeeded','jimeng','test','{}','{}',?,'2000-01-01T00:00:00.000Z',?,?)").run(crypto.randomUUID(),f.p.id,f.shot.id,crypto.randomUUID(),r.mediaId,time,'2099-01-01T00:00:00.000Z');const plan=planVideoExport(presentProject(f.s.repos.content.graph(f.p.id)),f.s.db,f.s.media);assert.equal(plan.clips[0].jobId,r.jobId);}finally{await f.close();}});

test('episode final videos stay separate across episodes and invalid replacements preserve the current file', async () => {
  const f = await setup();
  try {
    const first = f.s.repos.content.createEpisode(f.p.id, { title: '成片测试一' });
    const second = f.s.repos.content.createEpisode(f.p.id, { title: '成片测试二' });
    const url = episode => `/api/v1/projects/${f.p.id}/episodes/${episode.id}/final-video`;
    const get = (episode, user = f.users[0]) => f.app.inject({
      url: url(episode), headers: { cookie: user.cookie },
    });
    const put = (episode, bytes, filename = 'final.mp4') => f.app.inject({
      method: 'POST',
      url: url(episode),
      headers: {
        cookie: f.users[0].cookie,
        'content-type': 'multipart/form-data; boundary=video-test',
      },
      payload: Buffer.concat([
        Buffer.from(`--video-test\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
        bytes,
        Buffer.from('\r\n--video-test--\r\n'),
      ]),
    });
    const bytes = fixture(3.5);
    const result = await put(first, bytes);
    assert.equal(result.statusCode, 201, result.body);
    const { video } = result.json();
    assert.equal(video.filename, 'final.mp4');
    assert.equal((await get(first)).json().video.id, video.id);
    assert.equal((await get(second)).json().video, null);
    assert.equal((await get(first, f.users[1])).statusCode, 404);
    assert.equal((await put(first, Buffer.from('not a video'))).statusCode, 400);
    assert.equal((await get(first)).json().video.id, video.id);
    const preview = await f.app.inject({
      url: video.url, headers: { cookie: f.users[0].cookie, range: 'bytes=0-11' },
    });
    assert.equal(preview.statusCode, 206);
    assert.deepEqual(preview.rawPayload, bytes.subarray(0, 12));
    const mov = fixture(4);
    mov.write('qt  ', 8);
    for (const [filename, sample, mime] of [
      ['final.MOV', mov, 'video/quicktime'],
      ['legacy.mov', mov.subarray(16), 'video/quicktime'],
      ['final.m4v', fixture(4), 'video/mp4'],
    ]) {
      const result = await put(first, sample, filename);
      assert.equal(result.statusCode, 201, result.body);
      const replacement = result.json().video;
      assert.notEqual(replacement.id, video.id);
      assert.equal(replacement.filename, filename);
      assert.equal((await get(first)).json().video.id, replacement.id);
      const response = await f.app.inject({ url: replacement.url, headers: { cookie: f.users[0].cookie } });
      assert.equal(response.headers['content-type'], mime);
      assert.deepEqual(response.rawPayload, sample);
    }
    assert.equal(f.s.repos.content.graph(f.p.id).jobs.length, 0);
  } finally {
    await f.close();
  }
});

test('authenticated media and archive requests redirect to OSS with local fallback for missing copies', async t => {
  const f = await setup();
  try {
    const clip = (await upload(f, fixture())).json();
    const exp = f.s.repos.accounts.createExport({ projectId: f.p.id, kind: 'videos', manifest: {} });
    const key = `exports/${exp.id}.zip`;
    f.s.repos.accounts.finishExport(exp.id, { status: 'succeeded', storageKey: key, manifest: {} });
    f.s.oss.enabled = true;
    const published = new Set([key]);
    const mirror = t.mock.method(f.s.oss, 'putFile', async (storageKey) => { published.add(storageKey); });
    t.mock.method(f.s.oss, 'isPublic', async (storageKey) => published.has(storageKey));
    t.mock.method(f.s.oss, 'publicUrl', (storageKey, options = {}) => {
      const url = new URL(storageKey, 'https://test.oss-cn-hangzhou.aliyuncs.com/');
      if (options.disposition) url.searchParams.set('filename', options.disposition);
      return url.href;
    });
    const cookies = { cookie: f.users[0].cookie };
    const first = await f.app.inject({ url: clip.url, headers: { ...cookies, range: 'bytes=0-11' } });
    assert.equal(first.statusCode, 206);
    assert.deepEqual(first.rawPayload, fixture().subarray(0, 12));
    assert.equal(mirror.mock.callCount(), 1);
    const second = await f.app.inject({ url: clip.url, headers: cookies });
    assert.equal(second.statusCode, 307);
    assert.match(second.headers.location, /^https:\/\/test\.oss-cn-hangzhou\.aliyuncs\.com\//);
    assert.equal((await f.app.inject({ url: clip.url, headers: { cookie: f.users[1].cookie } })).statusCode, 404);
    assert.equal((await f.app.inject({ url: clip.url })).statusCode, 401);
    const archivePath = f.s.media.locate(key);
    fs.mkdirSync(path.dirname(archivePath), { recursive: true });
    fs.writeFileSync(archivePath, Buffer.from('zip-bytes'));
    const archive = await f.app.inject({ url: `/api/v1/exports/${exp.id}/download`, headers: cookies });
    assert.equal(archive.statusCode, 200);
    assert.match(archive.headers['content-disposition'], /storydock-videos\.zip/);
    assert.equal(archive.body, 'zip-bytes');
  } finally {
    await f.close();
  }
});

test('OSS episode upload validates remote metadata, binds once and never creates a local video', async t => {
  const f = await setup();
  try {
    const episode = f.s.repos.content.createEpisode(f.p.id, { title: 'OSS 成片' });
    const route = `/api/v1/projects/${f.p.id}/episodes/${episode.id}/final-video`;
    const post = (suffix, payload, user = f.users[0]) => f.app.inject({
      method: 'POST', url: route + suffix, payload, headers: { cookie: user.cookie },
    });
    const video = fixture(3.5);
    f.s.oss.enabled = true;
    t.mock.method(f.s.oss, 'uploadForm', () => ({ url: 'https://test.aliyuncs.com/', fields: {} }));
    t.mock.method(f.s.oss, 'statObject', async () => ({ bytes: video.length, etag: '"test"' }));
    t.mock.method(f.s.oss, 'readRange', async (_key, offset, length) => video.subarray(offset, offset + length));
    const copy = t.mock.method(f.s.oss, 'copyObject', async () => {});
    t.mock.method(f.s.oss, 'deleteObject', async () => {});
    t.mock.method(f.s.oss, 'signedUrl', (_key, _lifetime, options) => {
      assert.match(options.disposition, /filename\*=UTF-8/);
      return 'https://test.aliyuncs.com/final';
    });
    const ticket = (await post('/upload', { filename: '成片.mov', bytes: video.length })).json();
    assert.equal(ticket.direct, true);
    assert.equal((await post('/complete', { uploadId: ticket.uploadId }, f.users[1])).statusCode, 404);
    const first = await post('/complete', { uploadId: ticket.uploadId });
    assert.equal(first.statusCode, 201, first.body);
    const saved = first.json().video;
    assert.equal((await post('/complete', { uploadId: ticket.uploadId })).json().video.id, saved.id);
    assert.equal(copy.mock.callCount(), 1);
    const key = f.s.db.prepare('SELECT storage_key FROM media WHERE id=?').get(saved.id).storage_key;
    assert.equal(fs.existsSync(f.s.media.locate(key)), false);
    assert.equal((await f.app.inject({
      url: saved.url + '?download=1', headers: { cookie: f.users[0].cookie },
    })).statusCode, 307);
  } finally {
    await f.close();
  }
});
