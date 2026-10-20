const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {inspectMp4File}=require('../video-export.cjs');
const id=()=>crypto.randomUUID().toUpperCase();
const TOKEN='__STORYDOCK_DRAFT_PATH__';
function buildDraft(plan,resolvePath){
  const draftId=id(),videos=[],segments=[],entries=[],files=[];
  let duration=0;
  for(const clip of plan.clips){
    const sourcePath=resolvePath(clip),info=inspectMp4File(sourcePath),materialId=id(),mediaPath=`${TOKEN}/media/${clip.file}`;
    videos.push({id:materialId,material_id:materialId,local_material_id:id(),material_name:clip.file,path:mediaPath,media_path:'',type:'video',duration:info.durationUs,width:info.width,height:info.height,has_audio:true,category_name:'local',category_id:'',check_flag:63487,crop_ratio:'free',crop_scale:1,crop:{upper_left_x:0,upper_left_y:0,upper_right_x:1,upper_right_y:0,lower_left_x:0,lower_left_y:1,lower_right_x:1,lower_right_y:1},audio_fade:null});
    segments.push({id:id(),material_id:materialId,target_timerange:{start:duration,duration:info.durationUs},source_timerange:{start:0,duration:info.durationUs},speed:1,volume:1,last_nonzero_volume:1,render_index:0,track_render_index:0,visible:true,reverse:false,is_tone_modify:false,extra_material_refs:[],common_keyframes:[],keyframe_refs:[],uniform_scale:{on:true,value:1},clip:{alpha:1,flip:{horizontal:false,vertical:false},rotation:0,scale:{x:1,y:1},transform:{x:0,y:0}},enable_adjust:true,enable_color_curves:true,enable_color_match:false,enable_color_wheels:true,enable_lut:true,enable_smart_color_adjust:false});
    entries.push({...clip,...info,startUs:duration});duration+=info.durationUs;
    files.push({name:`draft/media/${clip.file}`,sourcePath});
  }
  const portrait=plan.ratio==='9:16',square=plan.ratio==='1:1';
  const width=portrait?1080:square?1080:1920,height=portrait?1920:square?1080:1080;
  const materials=Object.fromEntries(['audios','canvases','effects','filters','material_animations','speeds','stickers','texts','transitions','audio_fades','beats','masks','vocal_separations'].map(k=>[k,[]]));materials.videos=videos;
  const draft={id:draftId,name:plan.name,version:360000,new_version:'5.9.0',duration,fps:30,canvas_config:{width,height,ratio:'original'},color_space:0,config:{maintrack_adsorb:true,combination_max_index:1,extract_audio_last_index:1,material_save_mode:0,original_sound_last_index:1,record_audio_last_index:1,subtitle_recognition_id:'',subtitle_sync:true},materials,tracks:[{id:id(),type:'video',attribute:0,flag:0,name:'分镜视频',is_default_name:false,segments}],keyframes:{adjusts:[],audios:[],effects:[],filters:[],handwrites:[],stickers:[],texts:[],videos:[]},platform:{app_id:3704,app_source:'lv',app_version:'5.9.0',device_id:'',hard_disk_id:'',mac_address:'',os:'windows',os_version:''},relationships:[],render_index_track_mode_on:false,source:'default',static_cover_image_path:'',time_marks:null,cover:null};
  const now=Date.now()*1000;
  const meta={draft_id:draftId,draft_name:plan.name,draft_fold_path:TOKEN,draft_root_path:'__STORYDOCK_DRAFT_ROOT__',draft_cover:'',draft_type:'',draft_is_invisible:false,draft_is_from_deeplink:'false',draft_new_version:'5.9.0',draft_materials:[{type:0,value:videos.map(v=>({id:v.local_material_id,metetype:'video',file_Path:v.path,extra_info:v.material_name,duration:v.duration,width:v.width,height:v.height,roughcut_time_range:{start:0,duration:v.duration},sub_time_range:{start:0,duration:-1},create_time:now/1e6,import_time:now/1e6}))},...[1,2,3,6,7,8].map(type=>({type,value:[]}))],draft_materials_copied_info:[],draft_segment_extra_info:[],tm_draft_create:now,tm_draft_modified:now,tm_draft_removed:0,tm_duration:duration,draft_cloud_materials:[],draft_cloud_last_action_download:false};
  for(const name of ['draft_content.json','draft_info.json'])files.push({name:`draft/${name}`,data:Buffer.from(JSON.stringify(draft))});
  files.push({name:'draft/draft_meta_info.json',data:Buffer.from(JSON.stringify(meta))});
  const manifest={kind:'storydock-jianying',schemaVersion:1,id:draftId,name:plan.name,durationUs:duration,canvas:{width,height},clips:entries.map(({storageKey,...clip})=>clip),missing:plan.missing,compatibility:'剪映专业版草稿试用格式，尚未完成 Windows/Mac 剪映实机验收；请保留原视频。'};
  files.push({name:'timeline.json',data:Buffer.from(JSON.stringify(manifest,null,2))});
  for(const name of ['import.pl','import.ps1','导入剪映-Windows.cmd','导入剪映-Mac.command','使用说明.txt'])files.push({name,data:fs.readFileSync(path.join(__dirname,name))});
  return {files,manifest};
}
module.exports={buildDraft};
