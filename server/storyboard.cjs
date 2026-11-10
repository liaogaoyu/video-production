const crypto=require('node:crypto');
const {ApiError}=require('./errors.cjs');
const {transaction}=require('./db.cjs');
const STATUSES=new Set(['draft','ready','archived']);
function installStoryboard(db){
 transaction(db,()=>{
  db.exec(`CREATE TABLE IF NOT EXISTS episodes(
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    external_key TEXT NOT NULL DEFAULT '',
    number INTEGER NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(project_id,number)
  );`);
  const cols=db.prepare('PRAGMA table_info(episodes)').all();
  if(!cols.some(c=>c.name==='body'))db.exec("ALTER TABLE episodes ADD COLUMN body TEXT NOT NULL DEFAULT ''");
  if(!cols.some(c=>c.name==='summary'))db.exec("ALTER TABLE episodes ADD COLUMN summary TEXT NOT NULL DEFAULT ''");
  if(!cols.some(c=>c.name==='status'))db.exec("ALTER TABLE episodes ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'");
  if(!db.prepare('PRAGMA table_info(shots)').all().some(c=>c.name==='episode_id'))db.exec('ALTER TABLE shots ADD COLUMN episode_id TEXT');
  for(const row of db.prepare('SELECT DISTINCT project_id,episode FROM shots WHERE episode_id IS NULL').all()){
   let e=db.prepare('SELECT id FROM episodes WHERE project_id=? AND number=?').get(row.project_id,row.episode);
   if(!e){e={id:crypto.randomUUID()};const now=new Date().toISOString();db.prepare('INSERT INTO episodes(id,project_id,number,title,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(e.id,row.project_id,row.episode,'第 '+row.episode+' 集',now,now);}
   db.prepare('UPDATE shots SET episode_id=? WHERE project_id=? AND episode=? AND episode_id IS NULL').run(e.id,row.project_id,row.episode);
  }
 });
}
function clampText(value,label,max,{required=false}={}){
 const text=String(value??'');
 if(required&&!text.trim())throw new ApiError(400,'invalid_episode',label+'不能为空');
 if(text.length>max)throw new ApiError(400,'invalid_episode',label+'过长');
 return text;
}
function storyboardRepository(db,content,record){
 const all=p=>db.prepare('SELECT * FROM episodes WHERE project_id=? ORDER BY number,id').all(p);
 function createEpisode(projectId,b={}){
  content.mustProject(projectId);
  const number=b.number===undefined?Math.max(0,...all(projectId).map(e=>e.number))+1:Number(b.number);
  const title=clampText(b.title||('第 '+number+' 集'),'分集名称',80,{required:true}).trim();
  const key=clampText(b.key||'','分集 key',80);
  const body=clampText(b.body||'','分集正文',200000);
  const summary=clampText(b.summary||'','分集摘要',500);
  const status=b.status||'draft';
  if(!Number.isInteger(number)||number<1||number>999)throw new ApiError(400,'invalid_episode','分集名称或集数无效');
  if(!STATUSES.has(status))throw new ApiError(400,'invalid_episode','分集状态无效');
  if(all(projectId).some(e=>e.number===number||(key&&e.external_key===key)))throw new ApiError(409,'episode_conflict','分集编号或 key 已存在');
  const id=crypto.randomUUID(),now=new Date().toISOString();
  db.prepare('INSERT INTO episodes(id,project_id,external_key,number,title,body,summary,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
   .run(id,projectId,key,number,title,body,summary,status,now,now);
  record('episode.created',{projectId,episodeId:id});
  return db.prepare('SELECT * FROM episodes WHERE id=?').get(id);
 }
 function updateEpisode(projectId,id,b){
  content.mustProject(projectId);
  const e=all(projectId).find(e=>e.id===id);
  if(!e)throw new ApiError(404,'episode_missing','分集不存在');
  if(b.revision!==e.revision)throw new ApiError(409,'revision_conflict','分集已更新，请刷新');
  const title=clampText(b.title===undefined?e.title:b.title,'分集名称',80,{required:true}).trim();
  const body=clampText(b.body===undefined?e.body:b.body,'分集正文',200000);
  const summary=clampText(b.summary===undefined?e.summary:b.summary,'分集摘要',500);
  const status=b.status===undefined?e.status:b.status;
  if(!STATUSES.has(status))throw new ApiError(400,'invalid_episode','分集状态无效');
  db.prepare('UPDATE episodes SET title=?,body=?,summary=?,status=?,revision=revision+1,updated_at=? WHERE id=?')
   .run(title,body,summary,status,new Date().toISOString(),id);
  record('episode.updated',{projectId,episodeId:id});
  return db.prepare('SELECT * FROM episodes WHERE id=?').get(id);
 }
 function deleteEpisode(projectId,id){
  return transaction(db,()=>{
   content.mustProject(projectId);
   const e=all(projectId).find(e=>e.id===id);
   if(!e)throw new ApiError(404,'episode_missing','分集不存在');
   const now=new Date().toISOString();
   const shots=db.prepare('UPDATE shots SET deleted_at=?, updated_at=? WHERE project_id=? AND episode_id=? AND deleted_at IS NULL')
    .run(now,now,projectId,id);
   db.prepare('DELETE FROM episodes WHERE id=? AND project_id=?').run(id,projectId);
   record('episode.deleted',{projectId,episodeId:id,shots:shots.changes});
   return {deleted:true,shots:shots.changes};
  });
 }
 function reorder(projectId,episodeId,ids){
  const e=all(projectId).find(e=>e.id===episodeId);
  if(!e)throw new ApiError(404,'episode_missing','分集不存在');
  const rows=db.prepare('SELECT * FROM shots WHERE project_id=? AND episode_id=? AND deleted_at IS NULL ORDER BY number,id').all(projectId,episodeId);
  if(rows.length>9999)throw new ApiError(400,'too_many_shots','每集最多9999个分镜');
  const update=db.prepare('UPDATE shots SET number=?,sort_key=?,revision=revision+1,updated_at=? WHERE id=?');
  for(const [i,id] of ids.entries())update.run(i+1,`${String(e.number).padStart(4,'0')}-${String(i+1).padStart(6,'0')}-${id}`,new Date().toISOString(),id);
 }
 function insertShot(projectId,b){
  return transaction(db,()=>{
   content.mustProject(projectId);
   const e=all(projectId).find(e=>e.id===b.episodeId);
   if(!e)throw new ApiError(404,'episode_missing','请先选择分集');
   const rows=db.prepare('SELECT id FROM shots WHERE project_id=? AND episode_id=? AND deleted_at IS NULL ORDER BY number,id').all(projectId,e.id);
   let position=rows.length;
   if(b.afterId){
    position=rows.findIndex(s=>s.id===b.afterId)+1;
    if(!position)throw new ApiError(409,'shot_missing','插入位置已变化，请刷新');
   }
   const created=content.createShot({
    ...b,
    projectId,
    episodeId:e.id,
    title:b.title||'新分镜',
    prompt:b.prompt||'请填写本镜提示词',
    duration:b.duration||15,
    number:Math.max(0,...db.prepare('SELECT number FROM shots WHERE episode_id=? AND deleted_at IS NULL').all(e.id).map(s=>s.number))+1,
   });
   const ids=rows.map(s=>s.id);
   ids.splice(position,0,created.id);
   reorder(projectId,e.id,ids);
   return {id:created.id};
  });
 }
 function importStoryboard(projectId,body){
  content.mustProject(projectId);
  if(body.schemaVersion!==2||body.kind!=='storyboard'||!Array.isArray(body.episodes)||body.episodes.length>999)throw new ApiError(400,'invalid_import','需要 schemaVersion:2、kind:storyboard 和 episodes 数组');
  let total=0;const seenEpisodes=new Set(),seenShots=new Set();
  for(const [i,e] of body.episodes.entries()){
   if(!e||typeof e.key!=='string'||!e.key.trim()||e.key.length>80||seenEpisodes.has(e.key)||!Array.isArray(e.shots))throw new ApiError(400,'invalid_import',`episodes[${i}]：分集 key 需唯一且必须提供 shots 数组`);
   seenEpisodes.add(e.key);
   if(typeof e.title!=='string'||!e.title.trim()||e.title.length>80)throw new ApiError(400,'invalid_import',`episodes[${i}].title 无效`);
   for(const [j,s] of e.shots.entries()){
    const where=`episodes[${i}].shots[${j}]`;
    if(!s||typeof s.key!=='string'||!s.key.trim()||s.key.length>80||seenShots.has(s.key))throw new ApiError(400,'invalid_import',where+'.key 必须非空且在本文件中唯一');
    seenShots.add(s.key);
    if(!Number.isInteger(s.duration)||s.duration<4||s.duration>15)throw new ApiError(400,'invalid_import',where+'.duration 必须为4–15整数秒');
    if(typeof s.title!=='string'||!s.title.trim()||s.title.length>80||typeof s.prompt!=='string'||!s.prompt.trim()||s.prompt.length>20000)throw new ApiError(400,'invalid_import',where+'：title 或 prompt 无效');
    total++;
   }
  }
  if(total>2000)throw new ApiError(400,'invalid_import','单次最多导入2000个分镜');
  const preview=[],created=[],updated=[],episodeResults=[];const rollback={};let result;
  try{transaction(db,()=>{
   for(const e of body.episodes){
    let episode=all(projectId).find(x=>x.external_key===e.key);
    if(!episode)episode=createEpisode(projectId,{key:e.key,title:e.title});
    else if(episode.title!==e.title)episode=updateEpisode(projectId,episode.id,{title:e.title,revision:episode.revision});
    episodeResults.push({id:episode.id,key:e.key,title:e.title});
    const ordered=[];
    for(const s of e.shots){
     const matches=db.prepare('SELECT * FROM shots WHERE project_id=? AND external_key=? AND deleted_at IS NULL').all(projectId,s.key);
     if(matches.length>1)throw new ApiError(409,'ambiguous_key','已有分镜 key 重复：'+s.key);
     const old=matches[0];let id;
     if(old){
      const max=db.prepare('SELECT COALESCE(max(number),0) n FROM shots WHERE episode_id=? AND deleted_at IS NULL').get(episode.id).n;
      content.updateShot(old.id,{title:s.title,prompt:s.prompt,duration:s.duration,episodeId:episode.id,number:old.episode_id===episode.id?old.number:max+1,revision:old.revision});
      id=old.id;updated.push({id});
     }else{
      id=content.createShot({projectId,episodeId:episode.id,number:db.prepare('SELECT COALESCE(max(number),0)+1 n FROM shots WHERE episode_id=? AND deleted_at IS NULL').get(episode.id).n,title:s.title,prompt:s.prompt,duration:s.duration,externalKey:s.key}).id;
      created.push({id});
     }
     ordered.push(id);
     preview.push({title:s.title,episode:episode.number,key:s.key,action:old?'update':'create',accepted:true});
    }
    const keep=db.prepare('SELECT id FROM shots WHERE episode_id=? AND deleted_at IS NULL ORDER BY number,id').all(episode.id).map(s=>s.id).filter(id=>!ordered.includes(id));
    reorder(projectId,episode.id,[...ordered,...keep]);
   }
   result={preview,created,updated,episodes:episodeResults};
   if(body.mode!=='commit')throw rollback;
  });}catch(e){if(e!==rollback)throw e;}
  return {...result,dryRun:body.mode!=='commit'};
 }
 function splitPlainScript(text){
  const source=String(text||'').replace(/\r\n/g,'\n');
  const re=/(?:^|\n)[ \t]*(第\s*([0-9]{1,3})\s*集[^\n]*)/g;
  const hits=[];let m;
  while((m=re.exec(source)))hits.push({index:m.index+(m[0].startsWith('\n')?1:0),number:Number(m[2]),title:m[1].trim()});
  if(!hits.length)return [{number:1,title:'第 1 集',body:source.trim(),key:'ep-1'}];
  return hits.map((h,i)=>{
   const start=h.index+source.slice(h.index).indexOf('\n');
   const end=i+1<hits.length?hits[i+1].index:source.length;
   const body=start>=0?source.slice(start+1,end).trim():'';
   return {number:h.number,title:h.title.slice(0,80),body,key:'ep-'+String(h.number).padStart(2,'0')};
  });
 }
 function importScript(projectId,body){
  content.mustProject(projectId);
  let episodes;
  if(typeof body.text==='string'){
   episodes=splitPlainScript(body.text);
  }else{
   if(body.schemaVersion!==1||body.kind!=='script'||!Array.isArray(body.episodes)||body.episodes.length>999)throw new ApiError(400,'invalid_import','需要 schemaVersion:1、kind:script 和 episodes 数组，或提供 text 纯文本');
   episodes=body.episodes;
  }
  if(body.synopsis!==undefined&&String(body.synopsis).length>200000)throw new ApiError(400,'invalid_import','整剧梗概过长');
  const preview=[],seen=new Set();
  for(const [i,e] of episodes.entries()){
   const where=`episodes[${i}]`;
   if(!e||typeof e!=='object')throw new ApiError(400,'invalid_import',where+' 无效');
   const key=String(e.key||('ep-'+String(e.number||i+1).padStart(2,'0'))).trim();
   const title=String(e.title||('第 '+(e.number||i+1)+' 集')).trim();
   const number=e.number===undefined?i+1:Number(e.number);
   const summary=String(e.summary||'');
   const epBody=String(e.body||'');
   const status=e.status||'draft';
   if(!key||key.length>80||seen.has(key))throw new ApiError(400,'invalid_import',where+'.key 必须唯一');
   seen.add(key);
   if(!Number.isInteger(number)||number<1||number>999||!title||title.length>80)throw new ApiError(400,'invalid_import',where+'：集数或标题无效');
   if(summary.length>500||epBody.length>200000||!STATUSES.has(status))throw new ApiError(400,'invalid_import',where+'：摘要、正文或状态无效');
   const existing=all(projectId).find(x=>x.external_key===key||x.number===number);
   preview.push({key,number,title,summary,body:epBody,status,action:existing?'update':'create',accepted:true,existingId:existing?.id||null,revision:existing?.revision});
  }
  if(body.mode!=='commit')return {preview:preview.map(({existingId,revision,...row})=>row),created:[],updated:[],dryRun:true};
  return transaction(db,()=>{
   if(body.synopsis!==undefined){
    const project=content.mustProject(projectId);
    content.updateProject(projectId,{revision:project.revision,synopsis:body.synopsis});
   }
   const created=[],updated=[],episodeResults=[];
   for(const row of preview){
    if(row.existingId){
     const saved=updateEpisode(projectId,row.existingId,{title:row.title,summary:row.summary,body:row.body,status:row.status,revision:row.revision});
     updated.push({id:saved.id});episodeResults.push({id:saved.id,key:row.key,title:row.title});
    }else{
     const saved=createEpisode(projectId,{key:row.key,number:row.number,title:row.title,summary:row.summary,body:row.body,status:row.status});
     created.push({id:saved.id});episodeResults.push({id:saved.id,key:row.key,title:row.title});
    }
   }
   record('script.imported',{projectId,created:created.length,updated:updated.length});
   return {preview,created,updated,episodes:episodeResults,dryRun:false};
  });
 }
 return {createEpisode,updateEpisode,deleteEpisode,insertShot,importStoryboard,importScript,splitPlainScript};
}
module.exports={installStoryboard,storyboardRepository};
