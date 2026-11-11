const crypto=require('node:crypto');
const path=require('node:path');
const {ApiError}=require('./errors.cjs');
const {transaction}=require('./db.cjs');
const {inspectMp4}=require('./video-export.cjs');
function registerShotVideoUpload(app,s){
 app.post('/api/v1/shots/:id/video',async(request,reply)=>{
  const id=request.params.id;
  function shot(){const row=s.db.prepare('SELECT * FROM shots WHERE id=? AND deleted_at IS NULL').get(id);if(!row)throw new ApiError(404,'shot_not_found','分镜不存在');require('./tenant.cjs').own(s.db,row.project_id,request.appUser);return row;}
  const original=shot(),file=await request.file({limits:{fileSize:500*1024*1024,files:1}});
  if(!file)throw new ApiError(400,'file_required','请选择要上传的 MP4 视频');
  const bytes=await file.toBuffer();
  if(file.file.truncated)throw new ApiError(413,'file_too_large','视频超过 500MB');
  s.media.inspect(bytes,{video:true});
  const metadata=inspectMp4(bytes),jobId=crypto.randomUUID();
  const stored=await s.repos.content.saveMedia({projectId:original.project_id,bytes,source:'upload',video:true,jobId});
  const result=transaction(s.db,()=>{
   const current=shot(),time=new Date().toISOString();
   const filename=path.basename(file.filename||'video.mp4').slice(0,200);
   s.db.prepare(`INSERT INTO jobs(id,project_id,source_id,batch_id,kind,status,provider,model,config_snapshot,input_snapshot,result_json,media_id,created_at,updated_at,completed_at)
    VALUES(?,?,?,?,'video','succeeded','upload','手动上传',?,?,?,?,?,?,?)`).run(jobId,current.project_id,id,jobId,JSON.stringify({source:'upload'}),JSON.stringify({shotId:id,title:current.title,promptOriginal:current.prompt,duration:current.duration}),JSON.stringify({uploaded:true,filename,videoMetadata:metadata}),stored.id,time,time,time);
   s.repos.record('job.succeeded',{jobId,projectId:current.project_id,sourceId:id,source:'upload'});
   const direct=s.oss?.enabled&&typeof s.oss.publicUrl==='function'?s.oss.publicUrl(stored.storage_key):'';
   return {jobId,mediaId:stored.id,url:direct||'/api/v1/media/'+stored.id,metadata};
  });
  reply.code(201);return result;
 });
}
module.exports={registerShotVideoUpload};
