const fs = require('node:fs');
const { ApiError } = require('./errors.cjs');
function planVideoExport(project, db, media) {
  const clips=[], missing=[];
  const shots=[...project.data.shots].sort((a,b)=>a.episode-b.episode||a.number-b.number||a.id.localeCompare(b.id));
  for(const shot of shots){
    const job=project.data.jobs.filter(j=>j.sourceId===shot.id&&j.status==='done'&&j.video)
      .sort((a,b)=>(b.completedAt||b.createdAt||'').localeCompare(a.completedAt||a.createdAt||'')||b.id.localeCompare(a.id))[0];
    const stored=job&&db.prepare('SELECT * FROM media WHERE id=? AND project_id=?').get(job.video.split('/').pop(),project.id);
    if(!stored||!fs.existsSync(media.locate(stored.storage_key))){missing.push({id:shot.id,episode:shot.episode,number:shot.number,title:shot.title,reason:'没有可下载的已完成视频'});continue;}
    const title=shot.title.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,40).replace(/[. ]+$/,'')||'分镜';
    const file=`${String(clips.length+1).padStart(4,'0')}_E${String(shot.episode).padStart(3,'0')}_S${String(shot.number).padStart(4,'0')}_${title}_${shot.id.slice(0,8)}.mp4`;
    clips.push({shotId:shot.id,jobId:job.id,mediaId:stored.id,storageKey:stored.storage_key,episode:shot.episode,number:shot.number,title:shot.title,file});
  }
  return {projectId:project.id,name:project.name,ratio:project.data.settings.ratio,clips,missing};
}
// ISO BMFF headers provide actual video timing without installing FFmpeg on the server.
function inspectMp4(bytes) {
  function boxes(start,end){
    const result=[];
    while(start+8<=end){
      let size=bytes.readUInt32BE(start),header=8;
      if(size===1){if(start+16>end)break;size=Number(bytes.readBigUInt64BE(start+8));header=16;}
      if(size===0)size=end-start;
      if(!Number.isSafeInteger(size)||size<header||start+size>end)throw new Error('MP4 box exceeds file');
      result.push({type:bytes.toString('ascii',start+4,start+8),start:start+header,end:start+size});start+=size;
    }return result;
  }
  try{
    const moov=boxes(0,bytes.length).find(b=>b.type==='moov');if(!moov)throw Error('missing moov');
    for(const track of boxes(moov.start,moov.end).filter(b=>b.type==='trak')){
      const children=boxes(track.start,track.end),mdia=children.find(b=>b.type==='mdia'),tkhd=children.find(b=>b.type==='tkhd');
      if(!mdia||!tkhd)continue;
      const m=boxes(mdia.start,mdia.end),handler=m.find(b=>b.type==='hdlr'),timing=m.find(b=>b.type==='mdhd');
      if(!handler||!timing||bytes.toString('ascii',handler.start+8,handler.start+12)!=='vide')continue;
      const v=bytes[timing.start];if(v!==0&&v!==1)throw Error('unknown timing version');
      const offset=timing.start+(v===1?20:12),scale=bytes.readUInt32BE(offset);
      const duration=v===1?Number(bytes.readBigUInt64BE(offset+4)):bytes.readUInt32BE(offset+4);
      const durationUs=Math.round(duration/scale*1e6),width=Math.round(bytes.readUInt32BE(tkhd.end-8)/65536),height=Math.round(bytes.readUInt32BE(tkhd.end-4)/65536);
      if(!Number.isSafeInteger(durationUs)||durationUs<=0||!width||!height)throw Error('invalid video timing');
      return {durationUs,width,height};
    }throw Error('missing video track');
  }catch(error){throw new ApiError(422,'invalid_video',`无法读取视频实际时长，请检查视频文件：${error.message}`);}
}
module.exports={planVideoExport,inspectMp4};

function inspectMp4File(file) {
  const fd=fs.openSync(file,'r');
  try {
    const end=fs.fstatSync(fd).size,header=Buffer.alloc(16);
    for(let offset=0;offset+8<=end;){
      fs.readSync(fd,header,0,Math.min(16,end-offset),offset);
      let size=header.readUInt32BE(0);const extra=size===1?16:8;
      if(size===1)size=Number(header.readBigUInt64BE(8));if(size===0)size=end-offset;
      if(!Number.isSafeInteger(size)||size<extra||offset+size>end)throw Error('invalid MP4 box');
      if(header.toString('ascii',4,8)==='moov'){
        if(size>32*1024*1024)throw Error('MP4 metadata exceeds 32MB');
        const bytes=Buffer.alloc(size);let read=0;
        while(read<size){const n=fs.readSync(fd,bytes,read,size-read,offset+read);if(!n)throw Error('truncated MP4');read+=n;}
        return inspectMp4(bytes);
      }offset+=size;
    }throw Error('missing video metadata');
  } finally {fs.closeSync(fd);}
}
module.exports.inspectMp4File=inspectMp4File;
