const path=require('node:path'),{createRequire}=require('node:module');
function installDedicatedProxy(axios,url,createAgent,audit=()=>{}){
 const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol))throw Error('国际网页代理必须为 HTTP/HTTPS 地址');
 const agent=createAgent(url);
 const enforce=config=>{audit({time:new Date().toISOString(),host:new URL(config.url,config.baseURL).hostname,method:config.method||'get',proxied:true});return {...config,httpAgent:agent,httpsAgent:agent,proxy:false,timeout:config.timeout||60000};};
 // Includes image upload apply/upload/commit, credit/history and media download.
 const id=axios.interceptors.request.use(enforce);
 return {agent,enforce,close(){axios.interceptors.request.eject(id);agent.destroy?.();}};
}
if(process.env.STORYDOCK_ENFORCE_WEB_PROXY==='1'){
 if(!process.env.INTL_PROXY_URL)throw Error('国际网页强制代理未配置');
 const directory=process.env.STORYDOCK_WEB_VENDOR||path.resolve(__dirname,'../../vendor/jimeng-api');
 const dependency=createRequire(path.join(directory,'package.json'));
 const {HttpsProxyAgent}=dependency('https-proxy-agent');
 installDedicatedProxy(dependency('axios'),process.env.INTL_PROXY_URL,url=>new HttpsProxyAgent(url),record=>{if(process.env.STORYDOCK_PROXY_AUDIT_FILE)require('node:fs').appendFileSync(process.env.STORYDOCK_PROXY_AUDIT_FILE,JSON.stringify(record)+'\n',{mode:0o600});});
}
module.exports={installDedicatedProxy};
