const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { bindPromptReferences, createJimengCliPool } = require('./jimeng-cli.cjs');

function setup(outputs, options = {}) {
  const calls = [];
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(`enc:${value}`), decryptString: value => value.toString().slice(4) };
  const execFileImpl = (file, args, execOptions, callback) => { calls.push({ file, args }); const next = outputs.shift() || { stdout: '', stderr: '', code: 0 }; const error = next.code ? Object.assign(new Error(next.errorMessage || 'exit'), { code: next.code }) : null; callback(error, next.stdout, next.stderr); };
  const pool = createJimengCliPool({ directory: fs.mkdtempSync(path.join(os.tmpdir(), 'storydock-cli-')), safeStorage, execFileImpl, ...options });
  return { pool, calls };
}

test('official CLI auth material stays private and account volumes are isolated', async () => {
  const url = 'https://jimeng.jianying.com/ai-tool/cli-auth?verification_uri=https%3A%2F%2Fjimeng.jianying.com%2Fpassport%2Fopen%2Fscan_user_code%2F%3Fuser_code%3Dabc';
  const { pool, calls } = setup([{ stdout: `verification_uri: ${url}\ndevice_code: secret-device\n` }, { stdout: 'OAuth 登录成功。\ntotal_credit: 120\nuser_id: account-b\n', code: 0 }]);
  const id = '11111111-1111-1111-1111-111111111111';
  const begun = await pool.beginAuth(id);
  assert.equal(begun.authorizationUrl, url);
  assert.equal(JSON.stringify(begun).includes('secret-device'), false);
  const finished = await pool.finishAuth(id);
  assert.equal(finished.totalCredit, 120);
  assert.equal(finished.identityHash.length, 64);
  assert.match(calls[0].args.join(' '), /storydock-dreamina-11111111111111111111111111111111/);
  assert.equal(calls[0].args.join(' ').includes('secret-device'), false);
  assert.equal(calls[1].args.join(' ').includes('secret-device'), true);
});

test('OAuth success and CLI membership permission are separate states', async () => {
  const url = 'https://jimeng.jianying.com/ai-tool/cli-auth?verification_uri=x';
  const { pool } = setup([{ stdout: `verification_uri: ${url}\ndevice_code: private\n` }, { stdout: 'OAuth 登录成功。\n登录成功，但当前账号没有 dreamina_cli 使用权限: 仅限会员用户使用\ntotal_credit: 160\nuser_id: same-account\n', code: 1 }]);
  const id = '22222222-2222-2222-2222-222222222222';
  await pool.beginAuth(id);
  const result = await pool.finishAuth(id);
  assert.equal(result.authorized, true);
  assert.equal(result.permission, 'denied');
  assert.equal(result.ok, false);
});

test('reused OAuth login is checked without requiring a new device flow URL', async () => {
  const {pool,calls}=setup([
    {stdout:'已复用当前本地 OAuth 登录态。\n'},
    {stdout:'{"total_credit":120,"user_id":"existing-account"}'},
  ]);
  const result=await pool.beginAuth('22222222-2222-2222-2222-222222222222');
  assert.equal(result.alreadyAuthorized,true);
  assert.equal(result.authorized,true);
  assert.equal(result.totalCredit,120);
  assert.equal(result.authorizationUrl,undefined);
  assert.ok(calls[1].args.includes('user_credit'));
});

test('reused login is not marked authorized when its independent check fails', async () => {
  const {pool}=setup([{stdout:'已复用当前本地 OAuth 登录态。\n'},{code:1,stderr:'login fail'}]);
  await assert.rejects(()=>pool.beginAuth('22222222-2222-2222-2222-222222222222'),/检查未通过/);
});

test('resubmitting the same job stages fresh reference bytes without overwriting sealed inputs', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'storydock-retry-'));
  const source=path.join(root,'reference.png');
  const {pool,calls}=setup([{stdout:'submit_id: remote-first\ngen_status: querying\n'},{stdout:'submit_id: remote-second\ngen_status: querying\n'}]);
  const request={jobId:'same-job',prompt:'p',images:[source],referenceNames:['道具'],model:'seedance2.0',ratio:'16:9',duration:15,resolution:'720p'};
  fs.writeFileSync(source,'first');
  await pool.submitVideo('22222222-2222-2222-2222-222222222222',request);
  fs.writeFileSync(source,'second');
  await pool.submitVideo('22222222-2222-2222-2222-222222222222',request);
  const inputs=calls.map(c=>c.args.find(a=>a.includes('target=/work/input'))?.match(/source=(.*),target=/)?.[1]);
  assert.notEqual(inputs[0],inputs[1]);
  assert.equal(fs.readFileSync(path.join(inputs[0],'01.png'),'utf8'),'first');
  assert.equal(fs.readFileSync(path.join(inputs[1],'01.png'),'utf8'),'second');
  assert.equal(fs.statSync(inputs[1]).mode & 0o777,0o555);
  assert.equal(fs.statSync(path.join(inputs[1],'01.png')).mode & 0o777,0o444);
});

test('superseding an authorization stops its CLI container', async () => {
  let removed = false, finishRun;
  const {pool} = setup([], {
    sessionStore:{get:async()=>({deviceCode:'private',expiresAt:new Date(Date.now()+60000).toISOString()}),isActive:async()=>false},
    execFileImpl(file,args,options,callback) {
      if(args[0]==='run') finishRun=callback;
      else if(args[0]==='rm') {removed=true;callback(null,'','');finishRun(Object.assign(new Error('cancelled'),{code:137}),'','');}
    },
  });
  await pool.finishAuth('11111111-1111-1111-1111-111111111111');
  assert.equal(removed,true);
});

test('runtime status uses the pinned image and invalid IDs never reach Docker', async () => {
  const { pool, calls } = setup([{ stdout: 'sha256:test' }]);
  assert.equal((await pool.runtimeStatus()).ok, true);
  assert.deepEqual(calls[0].args.slice(0, 3), ['image', 'inspect', 'lumenx-dreamina-eval:1.4.21']);
  await assert.rejects(() => pool.inspect('../escape'), /ID/);
});

test('JSON account identity matches text identity without losing large integer precision', async () => {
  const identity = '9876543210123456789';
  const {pool}=setup([
    {stdout:`{"total_credit":120,"user_id":${identity},"user_name":"测试用户","vip_level":"vip"}`},
    {stdout:`{"total_credit":120,"user_id":"${identity}"}`},
    {stdout:`total_credit: 120\nuser_id: ${identity}\n`},
  ]);
  const account='11111111-1111-1111-1111-111111111111';
  const results=await Promise.all([pool.inspect(account),pool.inspect(account),pool.inspect(account)]);
  const expected=require('node:crypto').createHash('sha256').update(identity).digest('hex');
  for(const result of results){assert.equal(result.identityHash,expected);assert.equal(JSON.stringify(result).includes(identity),false);}
});

test('auth reports missing Docker instead of a misleading authorization URL error', async () => {
  const { pool } = setup([{ code: 'ENOENT', errorMessage: 'spawn docker ENOENT' }]);
  await assert.rejects(() => pool.beginAuth('77777777-7777-7777-7777-777777777777'), /Docker Desktop 未安装/);
});

test('auth tells the user to install the CLI runtime when the image is missing', async () => {
  const { pool } = setup([{ code: 125, stderr: 'Unable to find image locally\ndocker: pull access denied for lumenx-dreamina-eval' }]);
  await assert.rejects(() => pool.beginAuth('88888888-8888-8888-8888-888888888888'), /安装.*CLI 运行环境/);
});

test('video submission stages ordered images and returns an accepted remote id', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'storydock-video-'));
  const one = path.join(root, 'one.png');
  const two = path.join(root, 'two.jpg');
  fs.writeFileSync(one, 'one');
  fs.writeFileSync(two, 'two');
  const { pool, calls } = setup([{ stdout: 'submit_id: remote-123\ngen_status: querying\n' }]);
  const result = await pool.submitVideo('33333333-3333-3333-3333-333333333333', { jobId: 'job-1', prompt: '场景：@兜率宫·大殿内。@银童子 在场景中转身，再看向 @银童子。', images: [one, two], referenceNames: ['兜率宫·大殿内', '银童子'], model: 'seedance2.0', ratio: '9:16', duration: 5, resolution: '720p' });
  assert.equal(result.kind, 'accepted');
  assert.equal(result.submitId, 'remote-123');
  assert.equal(result.status, 'querying');
  const command = calls[0].args;
  assert.ok(command.indexOf('/work/input/01.png') < command.indexOf('/work/input/02.jpg'));
  assert.equal(command.includes('--model_version'), true);
  assert.equal(command.includes('seedance2.0'), true);
  const submittedPrompt = command[command.indexOf('--prompt') + 1];
  assert.equal(submittedPrompt.includes('@兜率宫·大殿内'), false);
  assert.equal(submittedPrompt.includes('@银童子'), false);
  assert.match(submittedPrompt, /参考图1对应资产“兜率宫·大殿内”/);
  assert.match(submittedPrompt, /参考图2对应资产“银童子”/);
  assert.match(submittedPrompt, /场景：参考图1。参考图2 在场景中转身，再看向 参考图2。/);
  assert.deepEqual(result.referenceBindings, [
    { name: '兜率宫·大殿内', imageNumber: 1 },
    { name: '银童子', imageNumber: 2 },
  ]);
});

test('overlapping asset names bind the longer token', () => {
  const bound = bindPromptReferences('@少年·外勤装 看向 @少年', ['少年', '少年·外勤装']);
  assert.match(bound, /参考图1对应资产“少年”/);
  assert.match(bound, /参考图2对应资产“少年·外勤装”/);
  assert.match(bound, /参考图2 看向 参考图1/);
  assert.equal(bound.includes('@'), false);
});

test('prompt binding keeps the CLI image order as the semantic reference order', () => {
  assert.equal(
    bindPromptReferences('@角色甲 拿起 @道具乙', ['角色甲', '道具乙']),
    '参考图对应关系：参考图1对应资产“角色甲”；参考图2对应资产“道具乙”。\n参考图1 拿起 参考图2',
  );
});

test('video preflight rejects invalid limits before starting Docker', async () => {
  const { pool, calls } = setup([]);
  await assert.rejects(() => pool.submitVideo('44444444-4444-4444-4444-444444444444', { jobId: 'job-2', prompt: 'p', images: Array(10).fill('too-many.png'), referenceNames: Array(10).fill('asset'), model: 'seedance2.0', ratio: '9:16', duration: 5, resolution: '720p' }), /参考图数量/);
  assert.equal(calls.length, 0);
});

test('video query distinguishes running, success and terminal failure', async () => {
  const { pool } = setup([
    { stdout: 'submit_id: remote-456\ngen_status: querying\n' },
    { stdout: 'submit_id: remote-456\ngen_status: success\n' },
    { stdout: 'submit_id: remote-456\ngen_status: fail\nfail_reason: 内容校验失败\n', code: 1 },
  ]);
  const account = '55555555-5555-5555-5555-555555555555';
  assert.equal((await pool.queryVideo(account, 'remote-456')).kind, 'accepted');
  assert.equal((await pool.queryVideo(account, 'remote-456')).kind, 'succeeded');
  const failed = await pool.queryVideo(account, 'remote-456');
  assert.equal(failed.kind, 'failed');
  assert.match(failed.message, /内容校验失败/);
});

test('escaped resource upload failure keeps the complete official CLI reason', async () => {
  const { pool } = setup([{
    stdout: '{"gen_status":"fail","fail_reason":"upload resource \\\"/work/input/04.png\\\": request timeout"}\n',
    code: 1,
  }]);
  const result = await pool.queryVideo('55555555-5555-5555-5555-555555555555', 'remote-upload');
  assert.equal(result.kind, 'failed');
  assert.equal(result.code, 'resource_upload_failed');
  assert.equal(result.message, 'upload resource "/work/input/04.png": request timeout');
});

test('queued JSON result stays accepted and reports the official wait', async () => {
  const { pool } = setup([{ stdout: '{"submit_id":"f4eb3670-84d5-4f26-9303-d685680141d0","gen_status":"querying","queue_info":{"queue_idx":3559,"queue_status":"Queueing"},"estimated_remaining_seconds":29028}\n' }]);
  const result = await pool.queryVideo('66666666-6666-6666-6666-666666666666', 'f4eb3670-84d5-4f26-9303-d685680141d0');
  assert.equal(result.kind, 'accepted');
  assert.equal(result.status, 'querying');
  assert.match(result.message, /前面约 3559 个/);
  assert.match(result.message, /8 小时/);
});

test('first-use compliance failure is not shown as a raw API error', async () => {
  const { pool } = setup([{ stdout: 'submit_id: remote-789\ngen_status: fail\nfail_reason: api error: ret=4010, message=AigcComplianceConfirmationRequired, aigc compliance confirmation required\n', code: 1 }]);
  const result = await pool.queryVideo('66666666-6666-6666-6666-666666666666', 'remote-789');
  assert.equal(result.kind, 'blocked');
  assert.equal(result.code, 'web_confirmation_required');
  assert.match(result.message, /首次使用确认/);
});

 test('keyring mount is readable without DAC capabilities and removed after execution', async () => {
  let mountedPath;
  const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'storydock-keyring-test-'));
  const oldMask=process.umask(0o077);
  try {
    const {pool}=setup([], {runtimeDirectory:runtime,execFileImpl(file,args,options,callback){
      const mount=args.find(value=>value.includes('target=/run/secrets/keyring_password'));
      mountedPath=mount.match(/source=([^,]+)/)[1];
      assert.equal(fs.statSync(mountedPath).mode & 0o777,0o444);
      assert.equal(fs.statSync(path.dirname(mountedPath)).mode & 0o777,0o700);
      assert.match(mount,/,readonly$/);
      assert.ok(args.includes('--cap-drop=ALL'));
      callback(null,'OAuth 登录成功。\ntotal_credit: 1\nuser_id: test-account\n','');
    }});
    await pool.inspect('11111111-1111-1111-1111-111111111111');
    assert.equal(fs.existsSync(mountedPath),false);
  } finally { process.umask(oldMask); fs.rmSync(runtime,{recursive:true,force:true}); }
});

test('video without references uses official text2video instead of multimodal mode',async()=>{
 const {pool,calls}=setup([{stdout:'submit_id: remote-text-123\ngen_status: querying\n'}]);
 const result=await pool.submitVideo('33333333-3333-3333-3333-333333333333',{jobId:'text-only',prompt:'云海中的宫廷，镜头缓慢推进。',images:[],referenceNames:[],model:'seedance2.0',ratio:'16:9',duration:5,resolution:'720p'});
 assert.equal(result.kind,'accepted');
 assert.ok(calls[0].args.includes('text2video'));
 assert.ok(!calls[0].args.includes('multimodal2video'));
 assert.ok(!calls[0].args.includes('--image'));
 assert.equal(result.submittedPrompt,'云海中的宫廷，镜头缓慢推进。');
});

test('scoped download directory allows a different container UID to save video',async()=>{
 const account='55555555-5555-5555-5555-555555555555';
 const {pool}=setup([],{execFileImpl(file,args,options,callback){
  const mount=args.find(a=>a.includes('target=/work/output'));
  const output=mount.match(/source=([^,]+)/)[1];
  assert.equal(fs.statSync(output).mode & 0o777,0o777);
  fs.writeFileSync(path.join(output,'video.mp4'),'video');
  callback(null,'submit_id: remote-output-123\ngen_status: success\n','');
 }});
 const result=await pool.queryVideo(account,'remote-output-123',true);
 assert.equal(result.kind,'succeeded');
 assert.equal(fs.readFileSync(result.files[0],'utf8'),'video');
});

test('resource recovery uploads RGB JPEG copies while preserving original PNGs and reference ordering',async()=>{
 const sharp=require('sharp'),root=fs.mkdtempSync(path.join(os.tmpdir(),'cli-jpeg-'));
 const source=path.join(root,'reference.png');await sharp({create:{width:48,height:32,channels:4,background:{r:120,g:80,b:40,alpha:0.5}}}).png().toFile(source);
 const original=fs.readFileSync(source),{pool,calls}=setup([{stdout:'submit_id: new-jpeg-task\ngen_status: querying'}]);
 try{
  await pool.submitVideo('22222222-2222-2222-2222-222222222222',{jobId:'jpeg-recovery',prompt:'p',images:[source],referenceNames:['成品碗'],model:'seedance2.0fast_vip',ratio:'16:9',duration:9,resolution:'720p',referenceImageFormat:'jpeg'});
  const args=calls[0].args,folder=args.find(a=>a.includes('target=/work/input')).match(/source=(.*),target=/)[1];
  assert.ok(args.includes('/work/input/01.jpg'));const staged=path.join(folder,'01.jpg'),meta=await sharp(staged).metadata();
  assert.equal(meta.format,'jpeg');assert.equal(meta.width,48);assert.equal(meta.height,32);assert.equal(meta.channels,3);assert.equal(meta.hasAlpha,false);
  assert.deepEqual(fs.readFileSync(source),original);assert.equal(fs.statSync(staged).mode&0o777,0o444);
  fs.writeFileSync(source,'invalid image');await assert.rejects(()=>pool.submitVideo('22222222-2222-2222-2222-222222222222',{jobId:'bad-jpeg',prompt:'p',images:[source],referenceNames:['成品碗'],model:'seedance2.0fast_vip',ratio:'16:9',duration:9,resolution:'720p',referenceImageFormat:'jpeg'}));
  assert.equal(calls.length,1,'invalid images must not reach the generation CLI');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
