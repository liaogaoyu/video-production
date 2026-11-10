const crypto = require('node:crypto');
const {ApiError}=require('./errors.cjs');
const {transaction}=require('./db.cjs');
const {uniqueAssetReferences}=require('./references.cjs');
const BASE='https://6godboy.com', PROVIDER='seedance_api';
const FIXED_RATES_FEN={'seedance-2.0-fast':20,'seedance-2.0':43};
const MODELS=[
 {id:'seedance-2.0',name:'Seedance 2.0（API）',resolutions:['720p','1080p','4k'],maxDuration:15,referenceLimit:9},
 {id:'seedance-2.0-fast',name:'Seedance 2.0 Fast（API）',resolutions:['720p'],maxDuration:15,referenceLimit:9},
 {id:'seedance-2.0-mini',name:'Seedance 2.0 Mini（API）',resolutions:['720p'],maxDuration:15,referenceLimit:9},
 {id:'seedance-2.5-draft',name:'Seedance 2.5 预览版（API）',resolutions:['480p'],maxDuration:30,referenceLimit:30},
];
function cnyPrice(value,markup=0){
 let str=String(value);
 if(typeof value==='number'&&Number.isFinite(value)&&value>=0&&str.includes('e')){
  const [coefficient,exponent]=str.split('e'), [whole,fraction='']=coefficient.split('.');
  const digits=whole+fraction, point=whole.length+Number(exponent);
  if(Math.abs(Number(exponent))>30)throw new ApiError(502,'invalid_api_cost','API 费用精度超出范围');
  str=point<=0?'0.'+'0'.repeat(-point)+digits:point>=digits.length?digits+'0'.repeat(point-digits.length):digits.slice(0,point)+'.'+digits.slice(point);
 }
 if(!/^(0|[1-9]\d*)(\.\d{1,30})?$/.test(str)||str.length>50||!Number.isInteger(markup)||markup<0||markup>10000)throw new ApiError(502,'invalid_api_cost','API 返回的人民币费用无效');
 const [a,b='']=str.split('.'), scale=10n**BigInt(b.length), amount=BigInt(a)*scale+BigInt(b||'0');
 const result=Number((amount*BigInt(100+markup)+scale-1n)/scale);
 if(!Number.isSafeInteger(result)||result>1e9)throw new ApiError(502,'invalid_api_cost','API 费用超出范围');
 return result;
}

function createSeedanceApi(s,{fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const {db,secrets,repos}=s;
 db.exec(`CREATE TABLE IF NOT EXISTS seedance_api_runs(job_id TEXT PRIMARY KEY,request_json TEXT NOT NULL,request_id TEXT NOT NULL UNIQUE,last_json TEXT NOT NULL DEFAULT '{}');`);
 for(const m of MODELS)db.prepare('INSERT OR IGNORE INTO public_model_offers(id,name,kind,provider,model,group_key,enabled,pricing_json) VALUES(?,?,?,?,?,?,?,?)').run('api-'+m.id,m.name,'video',PROVIDER,m.id,'international',1,'{}');
 function row(){return db.prepare("SELECT * FROM model_connections WHERE id='seedance-api'").get();}
 function config(){const r=row(), c=JSON.parse(r?.model||'{}');return {enabled:!!c.enabled,markupPercent:c.markupPercent||0,revision:r?.revision||0,keyConfigured:!!r?.secret_id,baseUrl:BASE,currency:'CNY',fixedRatesFen:FIXED_RATES_FEN};}
 function save(b){return transaction(db,()=>{
  const old=row();if(Number(b.revision)!==(old?.revision||0))throw new ApiError(409,'revision_conflict','配置已更新，请刷新');
  const markup=b.markupPercent??config().markupPercent;
  if(!Number.isInteger(markup)||markup<0||markup>10000||typeof b.enabled!=='boolean')throw new ApiError(400,'invalid_setting','请正确填写开关与加价比例');
  let secretId=old?.secret_id||null;
  if(b.apiKey){if(typeof b.apiKey!=='string'||b.apiKey.length>4096||/[\r\n]/.test(b.apiKey))throw new ApiError(400,'invalid_key','API Key 无效');const sealed=secrets.seal(b.apiKey.trim(),{accountId:'',purpose:'seedance-api-key'});secretId=crypto.randomUUID();db.prepare('INSERT INTO secrets(id,purpose,account_id,nonce,ciphertext,created_at) VALUES(?,?,?,?,?,?)').run(secretId,'seedance-api-key','',sealed.nonce,sealed.ciphertext,new Date().toISOString());}
  if(b.enabled&&!secretId)throw new ApiError(400,'api_key_required','请填写官转渠道二的 API Key');
  db.prepare("INSERT INTO model_connections(id,name,base_url,model,resolution,secret_id,revision,updated_at) VALUES('seedance-api','Seedance API',?,?, '720p',?,?,?) ON CONFLICT(id) DO UPDATE SET model=excluded.model,secret_id=excluded.secret_id,revision=excluded.revision,updated_at=excluded.updated_at").run(BASE,JSON.stringify({enabled:b.enabled,markupPercent:markup}),secretId,(old?.revision||0)+1,new Date().toISOString());
  repos.record('seedance-api.config.updated',{});return config();
 });}
 function key(secretId){const r=secretId?{secret_id:secretId}:row();if(!r?.secret_id)throw new ApiError(400,'api_not_configured','请先配置 Seedance API Key');const v=db.prepare('SELECT nonce,ciphertext FROM secrets WHERE id=?').get(r.secret_id);return secrets.open(v,{accountId:'',purpose:'seedance-api-key'});}
 async function call(path,{method='GET',body,headers={},raw=false,secretId}={}){
  const authKey=key(secretId);
  const response=await fetchImpl(BASE+path,{method,headers:{Authorization:'Bearer '+authKey,...(body&&!Buffer.isBuffer(body)?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(90000)});
  if(raw){if(!response.ok)throw new Error('API 下载失败：'+response.status);return response;}
  let payload;try{payload=await response.json();}catch{throw new ApiError(502,'api_response','API 未返回有效 JSON');}
  if(!response.ok||payload.code!==0){const e=new ApiError(400,'upstream_rejected',require('./errors.cjs').publicMessage(String(payload.message||payload.reason||'API 请求失败').replaceAll(authKey,'[已隐藏密钥]')).slice(0,500));e.statusCode=response.status;e.uncertain=response.status>=500;throw e;}
  return payload.data;
 }
 async function check(){const capabilities=await call('/api/v1/video-generations/capabilities');const balance=await call('/api/v1/video-generations/balance');return {ok:true,capabilities,balance,currency:'CNY'};}
 function freeze(projectId,shotId,model,resolution,ratio){
  const shot=db.prepare('SELECT * FROM shots WHERE id=? AND project_id=? AND deleted_at IS NULL').get(shotId,projectId),m=MODELS.find(m=>m.id===model);
  if(!shot||!m)throw new ApiError(400,'invalid_source','分镜或模型不存在');
  if(!Number.isInteger(shot.duration)||shot.duration<4||shot.duration>m.maxDuration||!m.resolutions.includes(resolution)||!['16:9','9:16','1:1','4:3','3:4','21:9'].includes(ratio))throw new ApiError(400,'invalid_parameters','该 API 模型不支持所选时长、画幅或分辨率');
  const refs=uniqueAssetReferences(db.prepare('SELECT a.id assetId,a.name,v.media_id mediaId FROM shot_references r JOIN assets a ON a.id=r.asset_id AND a.deleted_at IS NULL LEFT JOIN asset_versions v ON v.id=a.locked_version_id WHERE r.shot_id=? ORDER BY r.position').all(shotId));
  if(refs.length>m.referenceLimit)throw new ApiError(400,'too_many_references',`该模型最多支持 ${m.referenceLimit} 张参考图`);
  if(refs.some(r=>!r.mediaId))throw new ApiError(400,'reference_not_ready','请先固定所有引用资产的图片');
  // Replace asset mentions once, longest names first, so generated tokens cannot be rebound.
  const ordered=refs.map((r,i)=>({...r,index:i+1})).sort((a,b)=>b.name.length-a.name.length);
  const escaped=ordered.map(r=>r.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  const prompt=escaped.length?shot.prompt.replace(new RegExp('@('+escaped.join('|')+')(?=$|[\\s，。！？、；：,.!?:;])','g'),(_,name)=>`[@Image ${refs.findIndex(r=>r.name===name)+1}]`):shot.prompt;
  return {shotId,title:shot.title,promptOriginal:shot.prompt,promptSubmitted:prompt,references:refs,model,resolution,ratio,duration:shot.duration};
 }
 async function upload(projectId,ref,secretId){
  const uploadCall=(path,options={})=>call(path,{...options,secretId});
  const file=repos.content.readReferenceMedia(projectId,ref.mediaId);
  const sha=crypto.createHash('sha256').update(file.bytes).digest('hex');
  let data=await uploadCall('/api/v1/video-generations/uploads',{method:'POST',body:{sha256:sha,size_bytes:file.bytes.length,kind:'image',content_type:file.mime,idempotency_key:crypto.createHash('sha256').update('image:'+sha).digest('hex')}});
  for(let attempt=0;data.disposition==='waiting'&&attempt<60;attempt++){await sleep(Math.max(1000,Math.min(10000,(data.retry_after_seconds||3)*1000)));data=await uploadCall('/api/v1/video-generations/uploads/wait',{method:'POST',body:{ticket:data.ticket}});}
  if(data.disposition==='reused'){const id=data.reference?.storage_object_id||data.storage_object_id;if(!id)throw Error('复用素材缺少编号');return id;}
  if(data.disposition!=='owner')throw Error('素材上传仍在等待，请稍后重试');
  const u=data.upload||data,session=data.session_token||u.session_token,generation=data.generation??u.generation;
  if(!session||generation==null)throw Error('上传会话返回不完整');
  if(u.mode!=='single')throw Error('当前图片需分片上传，请压缩至单片大小后重试');
  const response=await uploadCall('/api/v1/video-generations/uploads/relay',{method:'PUT',body:file.bytes,headers:{'Content-Type':file.mime,'X-Upload-Session':session,'X-Upload-Generation':String(generation),'X-Upload-Part':'0'},raw:true});
  // Relay may return JSON metadata; completion is the authoritative verification.
  await response.arrayBuffer();
  const done=await uploadCall('/api/v1/video-generations/uploads/complete',{method:'POST',body:{session_token:session,generation}});
  const id=done.reference?.storage_object_id||done.storage_object_id;if(!id)throw Error('素材尚未验证完成');return id;
 }
 async function estimate(projectId,body){
  if(!config().enabled)throw new ApiError(400,'api_disabled','Seedance API 渠道未启用');
  const rate=FIXED_RATES_FEN[body.model];
  if(rate==null)throw new ApiError(400,'api_price_missing','该 API 模型尚未配置固定单价');
  return body.sourceIds.map(id=>{
   const input=freeze(projectId,id,body.model,body.resolution,body.ratio);
   return {costCny:(rate*input.duration/100).toFixed(2),source:'api_fixed_cny',perSecondFen:rate,input,connectionRevision:config().revision};
  });
 }
 function requestOf(input,content=[]){return {model:input.model,prompt:input.promptSubmitted,duration:input.duration,resolution:input.resolution,ratio:input.ratio,task_mode:input.references.length?'references':'text',...(content.length?{content}:{})};}

 function batch(projectId,body,idempotencyKey,evidence){return transaction(db,()=>{
  if(!config().enabled)throw new ApiError(409,'api_disabled','API 渠道已停用');
  const batchId=crypto.randomUUID(),jobIds=[],time=new Date().toISOString();
  for(let i=0;i<body.sourceIds.length;i++){
   const e=evidence[i],id=crypto.randomUUID();
   if(e.connectionRevision!==config().revision)throw new ApiError(409,'quote_changed','API 配置已更新，请重新报价');
   db.prepare("INSERT INTO jobs(id,project_id,source_id,batch_id,kind,status,provider,model,config_snapshot,input_snapshot,created_at,updated_at) VALUES(?,?,?,?,'video','queued',?,?,?,?,?,?)").run(id,projectId,body.sourceIds[i],batchId,PROVIDER,body.model,JSON.stringify({model:body.model,resolution:body.resolution,ratio:body.ratio,secretId:row().secret_id}),JSON.stringify(e.input),time,time);
   db.prepare('INSERT INTO seedance_api_runs(job_id,request_json,request_id) VALUES(?,?,?)').run(id,JSON.stringify(e.request||requestOf(e.input)),'storydock-'+id);
   jobIds.push(id);
  }
  repos.record('jobs.created',{projectId,batchId,jobIds});return {batchId,jobIds};
 });}
 function run(job){const r=db.prepare('SELECT * FROM seedance_api_runs WHERE job_id=?').get(job.id);if(!r)throw Error('API 任务快照不存在');return r;}
 function secretFor(job){return JSON.parse(job.configSnapshot||'{}').secretId;}
 async function downloadResponse(job){
  let url=BASE+'/api/v1/video-generations/'+encodeURIComponent(job.remoteTaskId)+'/content?download=1';
  for(let hop=0;hop<5;hop++){
   await require('./net-guard.cjs').assertPublicUrl(url);
   const response=await fetchImpl(url,{headers:new URL(url).origin===BASE?{Authorization:'Bearer '+key(secretFor(job))}:{},redirect:'manual',signal:AbortSignal.timeout(150000)});
   if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');if(!location)throw Error('API 下载重定向无效');url=new URL(location,url).href;continue;}
   if(!response.ok)throw Error('API 下载失败：'+response.status);return response;
  }
  throw Error('API 下载重定向次数过多');
 }
 async function queryData(job){const data=await call('/api/v1/video-generations/'+encodeURIComponent(job.remoteTaskId),{secretId:secretFor(job)});db.prepare('UPDATE seedance_api_runs SET last_json=? WHERE job_id=?').run(JSON.stringify(data),job.id);return data;}
 function usageOf(data,id){if(data.billing_status!=='billed'||data.final_cost==null)return null;cnyPrice(data.final_cost);return {source:'api_actual_cny',currency:'CNY',taskId:id,costCny:String(data.final_cost),billingStatus:data.billing_status};}
 function provider(){return {
  async prepare(job){
   const r=run(job);key(secretFor(job));const input=JSON.parse(job.inputSnapshot),request=JSON.parse(r.request_json);
   if(!input.references.length||request.content?.length===input.references.length)return;
   const content=[];
   for(const ref of input.references)content.push({type:'image_url',role:'reference_image',storage_object_id:await upload(job.projectId,ref,secretFor(job))});
   db.prepare('UPDATE seedance_api_runs SET request_json=? WHERE job_id=?').run(JSON.stringify(requestOf(input,content)),job.id);
  },
  async submit(job){const r=run(job);try{const data=await call('/api/v1/video-generations',{method:'POST',headers:{'X-Request-ID':r.request_id},body:JSON.parse(r.request_json),secretId:secretFor(job)});if(!data.id)return {outcome:'unknown',message:'API 已响应但缺少任务编号，请核对原请求'};return {outcome:'remote',remoteTaskId:String(data.id)};}catch(e){return e.uncertain||!e.statusCode?{outcome:'retry',message:'API 网络异常，将使用原请求号重试'}:{outcome:'failed',message:e.message};}},
  async query(job){try{const d=await queryData(job);if(['failed','expired','cancelled'].includes(d.status))return {outcome:'failed',message:d.error_message||d.error_code||'API 生成失败'};if(d.status==='succeeded'&&(d.result?.video_url||d.video_url))return {outcome:'download'};return {outcome:'pending',queueNote:d.waiting_for_credits?'API 等待可用额度':'API 排队 / 生成中'};}catch(e){return {outcome:'retry',message:e.message};}},
  async download(job){try{const d=await queryData(job);if(d.status!=='succeeded')return {outcome:'download_failed',message:'API 成片尚未准备完成'};const response=await downloadResponse(job);const length=Number(response.headers.get('content-length')||0);if(length>500*1024*1024)throw Error('视频超过大小限制');const reader=response.body.getReader(),chunks=[];let total=0;try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>500*1024*1024)throw Error('视频超过大小限制');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}const media=await repos.content.saveMedia({projectId:job.projectId,bytes:Buffer.concat(chunks),source:PROVIDER,video:true,jobId:job.id});const usage=usageOf(d,job.remoteTaskId);return {outcome:'succeeded',mediaId:media.id,...(usage?{accounting:{officialUsage:usage}}:{})};}catch(e){return {outcome:'download_failed',message:e.message};}},
  async usage(job){return usageOf(await queryData(job),job.remoteTaskId);}
 };}
 return {config,save,check,estimate,batch,provider};
}
module.exports={createSeedanceApi,MODELS,PROVIDER,cnyPrice,FIXED_RATES_FEN};
