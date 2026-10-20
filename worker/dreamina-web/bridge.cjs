const path=require('node:path'), fs=require('node:fs'), readline=require('node:readline'),{spawn}=require('node:child_process');
function createWebBridge({directory=path.resolve(__dirname,'../../vendor/jimeng-api'),proxy=process.env.STORYDOCK_DREAMINA_PROXY||'',executable=process.env.STORYDOCK_BROWSER_EXECUTABLE||''}={}){
 let child;let next=0;const pending=new Map();
 function start(){
  if(child)return;
  const entry=path.join(directory,'dist-bridge/storydock-bridge.cjs');if(!fs.existsSync(entry))throw Error('国际网页运行环境未安装，请运行 npm run web:setup');
  child=spawn(process.execPath,[entry],{cwd:directory,env:{...process.env,ABOGUS_BROWSER_ENABLED:'1',ABOGUS_BROWSER_EXECUTABLE:executable,INTL_PROXY_URL:proxy},stdio:['pipe','pipe','pipe']});
  const live=child;readline.createInterface({input:live.stdout}).on('line',line=>{if(!line.startsWith('@@STORYDOCK@@'))return;try{const r=JSON.parse(line.slice(13));const p=pending.get(r.id);if(p){clearTimeout(p.timer);pending.delete(r.id);r.error?p.reject(Error(r.error)):p.resolve(r.data);}}catch{}});
  live.stderr.on('data',()=>{});live.on('error',()=>end(live));live.on('exit',()=>end(live));
 }
 function end(live){if(child!==live)return;child=null;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('国际网页运行进程已退出'));}pending.clear();}
 return {
  call(method,token,body={},timeout=180000){start();const id=String(++next);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error(method==='submit'?'提交响应超时，请查询原任务，勿重复提交':'网页服务请求超时'));},timeout);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,method,token,body})+'\n');});},
  close(){const live=child;child=null;live?.stdin.end();live?.kill('SIGTERM');for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('网页服务已关闭'));}pending.clear();},directory,proxy
 };
}
module.exports={createWebBridge};
