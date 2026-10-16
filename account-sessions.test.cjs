const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createAccountSessions}=require('./account-sessions.cjs');
const id='11111111-1111-1111-1111-111111111111';
function setup(files=new Map(),cookieData=[],fetchImpl=async()=>{throw Error('offline');}) {
 const cookies=[...cookieData],listeners=[];
 const session={fromPartition:()=>({cookies:{get:async()=>cookies,set:async c=>cookies.push({...c,domain:c.domain||new URL(c.url).hostname}),flushStore:async()=>{},on:(_name,fn)=>listeners.push(fn)}})};
 const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s).map(b=>b^123),decryptString:b=>Buffer.from(b).map(b=>b^123).toString(),getSelectedStorageBackend:()=> 'keychain'};
 const storage={mkdir:async()=>{},writeFile:async(p,v)=>files.set(p,v),readFile:async p=>{if(!files.has(p))throw Error('missing');return files.get(p);}};
 return {manager:createAccountSessions({session,safeStorage,directory:'/local-vault',storage,fetchImpl}),files,cookies,listeners};
}
const loginCookie={name:'sessionid',value:'TEST_ONLY_SESSION',domain:'.jianying.com',path:'/',session:true,secure:true,httpOnly:true};
test('session cookies survive a fresh session manager using an encrypted local snapshot',async()=>{
 const first=setup(new Map(),[loginCookie]);const result=await first.manager.inspect(id);assert.equal(result.state,'saved');
 assert.equal([...first.files.values()][0].toString().includes('TEST_ONLY_SESSION'),false);
 const restarted=setup(first.files);await restarted.manager.get(id);assert.equal(restarted.cookies[0].value,'TEST_ONLY_SESSION');assert.equal(restarted.cookies[0].httpOnly,true);
 assert.equal(JSON.stringify(result).includes('TEST_ONLY_SESSION'),false);
});
test('read-only validation sends session only to the fixed local backend and returns credits',async()=>{
 const x=setup(new Map(),[loginCookie],async(url,opts)=>{assert.equal(url,'http://127.0.0.1:4329/v1/account/status');assert.equal(opts.headers.Authorization,'Bearer TEST_ONLY_SESSION');return {ok:true,json:async()=>({account:{status:{totalCredit:42}}})};});
 const result=await x.manager.inspect(id);assert.equal(result.state,'verified');assert.equal(result.totalCredit,42);assert.equal(JSON.stringify(result).includes('TEST_ONLY_SESSION'),false);
});
test('missing login does not contact backend and account IDs cannot escape the vault',async()=>{
 let called=false;const x=setup(new Map(),[],async()=>{called=true;});assert.equal((await x.manager.inspect(id)).state,'needs-login');assert.equal(called,false);await assert.rejects(()=>x.manager.get('../../other'));
});
test('a logged-out snapshot does not resurrect an older login',async()=>{
 const x=setup(new Map(),[loginCookie]);await x.manager.inspect(id);x.cookies.length=0;await x.manager.snapshot(id,await x.manager.get(id));const restarted=setup(x.files);assert.equal((await restarted.manager.inspect(id)).state,'needs-login');
});
