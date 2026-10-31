// Internal stdio bridge. Credentials never appear in arguments, URLs or responses.
import readline from 'node:readline';
import crypto from 'node:crypto';
const estimateRules=new Map<string,any>();
import fs from 'node:fs/promises';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { generateVideo, getModel } from './api/controllers/videos.ts';
import { getCredit, request, parseRegionFromToken, checkImageContent } from './api/controllers/core.ts';
import { uploadImageBuffer } from './lib/image-uploader.ts';
import { extractVideoUrl } from './lib/image-utils.ts';
import { closeAllBrowserSessions } from './lib/abogus-browser.ts';
async function execute(m:any) {
 const b=m.body||{};
 if(m.method==='runtime') return {available:true,models:['jimeng-video-seedance-2.0','jimeng-video-seedance-2.0-fast']};
 if(m.method==='estimate') {
  const region=parseRegionFromToken(m.token),model=getModel(b.model,region),headers={Referer:'https://dreamina.capcut.com/'};
  const {selectBenefit,calculateEstimate}=require(process.env.STORYDOCK_WEB_VENDOR+'/../../server/web-estimate.cjs');
  const key=crypto.createHash('sha256').update(m.token+'|'+model+'|'+b.resolution).digest('hex');
  let rules=estimateRules.get(key);
  if(!rules||rules.expiresAt<Date.now()){
   const config=await request('post','/mweb/v1/video_generate/get_common_config',m.token,{data:{},headers});
   const benefit=selectBenefit(config,model,b.resolution||'720p');
   const meta=await request('post','/commerce/v3/resource/benefit_metadata',m.token,{data:{query_list:[{resource_type:'aigc',resource_id:'generate_video',benefit_type_list:[benefit]}]},noDefaultParams:true,headers});
   rules={benefit,meta,expiresAt:Date.now()+30000};
   if(estimateRules.size>=100)estimateRules.clear();
   estimateRules.set(key,rules);
  }
  return {...calculateEstimate(rules.meta,rules.benefit,b.duration),model};
 }
 if(m.method==='usage') {
  const r=await request('post','/commerce/v1/benefits/user_credit_history',m.token,{data:{cursor:b.cursor||'',count:50},noDefaultParams:true,headers:{Referer:'https://dreamina.capcut.com/'}});
  return {records:r.records?.map((x:any)=>({amount:x.amount,submit_id:x.submit_id,history_id:x.history_id,history_type:x.history_type,status:x.status})),hasMore:r.has_more,cursor:r.new_cursor};
 }
 if(m.method==='credit') return getCredit(m.token);
 if(m.method==='check-upload'){const image=await uploadImageBuffer(await fs.readFile(b.file),m.token,parseRegionFromToken(m.token));await checkImageContent(image.uri,m.token,parseRegionFromToken(m.token));return {uploaded:true,width:image.width,height:image.height};}
 if(m.method==='submit') return generateVideo(b.model,b.prompt,{ratio:b.ratio,resolution:'720p',duration:b.duration,files:b.files||{},functionMode:b.references?'omni_reference':'first_last_frames',submitOnly:true,clientSubmitId:b.submitId},m.token);
 if(m.method==='query') {
  const id=String(b.historyId||b.submitId);const result=await request('post','/mweb/v1/get_history_by_ids',m.token,{data:{history_ids:[id]}});
  const h=result[id]||Object.values(result).find((v:any)=>v?.task?.submit_id===b.submitId) as any;
  if(!h)return {status:'pending',found:false};
  const url=h.item_list?.[0]&&extractVideoUrl(h.item_list[0]);
  if(url) return {status:'succeeded',historyId:h.history_record_id||id,url,model:h.task?.original_input?.model_req_key||null};
  if(h.status===30||h.task?.status===30||h.fail_code) return {status:'failed',code:h.fail_code||h.task?.fail_code};
  return {status:'pending',found:true};
 }
 if(m.method==='download') {
  const u=new URL(b.url);if(u.protocol!=='https:'||!/(^|\.)(capcutcdn-us\.com|capcutcdn\.com|tiktokcdn-us\.com|byteoversea\.com|byteimg\.com|bytevcloudapi\.com)$/.test(u.hostname))throw Error('Unsupported media host');
  const agent=process.env.INTL_PROXY_URL?new HttpsProxyAgent(process.env.INTL_PROXY_URL):undefined;
  const r=await axios.get(b.url,{responseType:'arraybuffer',timeout:120000,maxContentLength:500*1024*1024,...(agent?{httpsAgent:agent,proxy:false}:{})});
  await fs.writeFile(b.output,Buffer.from(r.data),{mode:0o600});return {size:r.data.length};
 }
 throw Error('Unknown bridge command');
}
const lines=readline.createInterface({input:process.stdin});
let chain=Promise.resolve();
lines.on('line',line=>{chain=chain.then(async()=>{let m:any;try{m=JSON.parse(line);const data=await execute(m);process.stdout.write('@@STORYDOCK@@'+JSON.stringify({id:m.id,data})+'\n');}catch(e:any){process.stdout.write('@@STORYDOCK@@'+JSON.stringify({id:m?.id,error:String(e?.message||'Bridge failed').replace(/[a-f0-9]{32,}/gi,'[redacted]').slice(0,500)})+'\n');}});});
lines.on('close',()=>{chain.finally(async()=>{await closeAllBrowserSessions();process.exit(0);});});
