const path = require('node:path');
const fs = require('node:fs/promises');
const ACCOUNT_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const isJimengCookie = c => c.domain === 'jianying.com' || c.domain.endsWith('.jianying.com');
const hasSession = cookies => cookies.some(c => ['sessionid','sessionid_ss'].includes(c.name) && c.value && (!c.expirationDate || c.expirationDate > Date.now()/1000));
function cookieForRestore(c) {
  const domain=c.domain.replace(/^\./,'');
  const result={url:`${c.secure?'https':'http'}://${domain}${c.path||'/'}`,name:c.name,value:c.value,path:c.path||'/',secure:!!c.secure,httpOnly:!!c.httpOnly};
  if(!c.hostOnly) result.domain=c.domain;
  if(c.expirationDate) result.expirationDate=c.expirationDate;
  if(c.sameSite) result.sameSite=c.sameSite;
  return result;
}
function createAccountSessions({session,safeStorage,directory,storage=fs,fetchImpl=fetch}) {
  const sessions = new Map();
  const encryptable = () => safeStorage.isEncryptionAvailable() && !(process.platform==='linux' && safeStorage.getSelectedStorageBackend()==='basic_text');
  function file(id) {if(!ACCOUNT_ID.test(id)) throw Error('账号 ID 无效');return path.join(directory,`${id}.enc`);}
  async function snapshot(id,ses) {
    await ses.cookies.flushStore();
    if(!encryptable()) return false;
    const cookies=(await ses.cookies.get({})).filter(isJimengCookie);
    await storage.mkdir(directory,{recursive:true,mode:0o700});
    await storage.writeFile(file(id),safeStorage.encryptString(JSON.stringify({cookies})),{mode:0o600});
    return true;
  }
  async function get(id) {
    file(id);
    if(sessions.has(id)) return sessions.get(id);
    const pending=(async()=>{
      const ses=session.fromPartition(`persist:storydock-jimeng-${id}`);
      const nativeCookies=(await ses.cookies.get({})).filter(isJimengCookie);
      if(!hasSession(nativeCookies) && encryptable()) {
        try {
          const {cookies}=JSON.parse(safeStorage.decryptString(await storage.readFile(file(id))));
          for(const c of cookies.filter(isJimengCookie)) {
            if(c.expirationDate && c.expirationDate<=Date.now()/1000) continue;
            await ses.cookies.set(cookieForRestore(c));
          }
        } catch { /* A first login, inaccessible key, or expired snapshot requires login. */ }
      }
      let debounce;
      let writes=Promise.resolve();
      ses.cookies.on('changed',(_event,cookie)=>{
        if(!isJimengCookie(cookie))return;
        clearTimeout(debounce);
        debounce=setTimeout(()=>{writes=writes.then(()=>snapshot(id,ses)).catch(()=>false);},400);
      });
      return ses;
    })();
    sessions.set(id,pending);
    try{return await pending;}catch(e){sessions.delete(id);throw e;}
  }
  async function inspect(id) {
    const ses=await get(id);
    const cookies=(await ses.cookies.get({})).filter(isJimengCookie);
    if(!hasSession(cookies))return {ok:true,state:'needs-login',message:'等待即梦登录'};
    let saved=false;try{saved=await snapshot(id,ses);}catch{}
    const token=cookies.find(c=>c.name==='sessionid'&&c.value)?.value||cookies.find(c=>c.name==='sessionid_ss'&&c.value)?.value;
    if(!saved)return {ok:false,state:'unsaved',message:'检测到登录，请检查系统加密存储权限'};
    try {
      const response=await fetchImpl('http://127.0.0.1:4329/v1/account/status',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});
      const body=await response.json();
      const credits=body.account?.status;
      if(response.ok && typeof credits?.totalCredit==='number')return {ok:true,state:'verified',message:'已保存 · 接口已验证',totalCredit:credits.totalCredit};
    }catch{}
    return {ok:true,state:'saved',message:'登录态已保存 · 接口待验证'};
  }
  return {get,inspect,snapshot};
}
module.exports={createAccountSessions,cookieForRestore,isJimengCookie,hasSession};
