const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn,spawnSync,execFileSync}=require('node:child_process');
const {resolvePaths}=require('../paths.cjs');
const VERSION='v26.3.27';
const BUILDS={
 'darwin-arm64':{asset:'Xray-macos-arm64-v8a.zip',sha256:'2e93a67e8aa1936ecefb307e120830fcbd4c643ab9b1c46a2d0838d5f8409eaf'},
 'linux-x64':{asset:'Xray-linux-64.zip',sha256:'23cd9af937744d97776ee35ecad4972cf4b2109d1e0fe6be9930467608f7c8ae'},
 'linux-arm64':{asset:'Xray-linux-arm64-v8a.zip',sha256:'4d30283ae614e3057f730f67cd088a42be6fdf91f8639d82cb69e48cde80413c'},
};
function nodeToXray(n,{port=17891}={}){
 if(String(n.type).toLowerCase()!=='vless'||n.obfs!=='xhttp')throw Error('需要 VLESS / XHTTP 节点');
 if(!n.host||/[\s/]/.test(n.host)||!Number.isInteger(Number(n.port))||Number(n.port)<1||Number(n.port)>65535)throw Error('节点地址或端口无效');
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(n.password||''))throw Error('需要节点 password 字段中的 VLESS 用户 ID，不能使用导出记录的 uuid');
 if(!n.peer||/[\s/]/.test(n.peer)||!/^[A-Za-z0-9_-]{43}$/.test(n.publicKey||'')||!/^(?:[a-f0-9]{2}){0,8}$/i.test(n.shortId||''))throw Error('REALITY 参数无效');
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('本地端口应为1024至65535');
 if(!['auto','packet-up','stream-up','stream-one'].includes(n.mode||'auto')||!String(n.path||'').startsWith('/'))throw Error('XHTTP 模式或路径无效');
 return {log:{loglevel:'warning'},inbounds:[{tag:'dreamina-http',listen:'127.0.0.1',port,protocol:'http',settings:{}}],outbounds:[{tag:'dreamina-node',protocol:'vless',settings:{vnext:[{address:n.host,port:Number(n.port),users:[{id:n.password,encryption:'none'}]}]},streamSettings:{network:'xhttp',security:'reality',realitySettings:{serverName:n.peer,fingerprint:'chrome',password:n.publicKey,shortId:n.shortId||''},xhttpSettings:{path:n.path,mode:n.mode||'auto',...(n.obfsParam?{host:n.obfsParam}:{})}}}]};
}
function locations(env=process.env){const root=resolvePaths(env,path.resolve(__dirname,'../..')).root,dir=path.join(root,'proxy');return {root,dir,bin:path.join(dir,'bin','xray'),config:path.join(dir,'xray.json'),pid:path.join(dir,'xray.pid'),log:path.join(dir,'xray.log')};}
function writePrivate(file,value){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file,value,{mode:0o600});fs.chmodSync(file,0o600);}
function verifyArchive(file,build){if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==build.sha256)throw Error('Xray SHA-256 校验失败');}
function install(p,archive){const build=BUILDS[process.platform+'-'+process.arch];if(!build)throw Error('支持 macOS arm64、Linux amd64 / arm64');fs.mkdirSync(path.dirname(p.bin),{recursive:true,mode:0o700});const zip=archive||path.join(p.dir,build.asset);
 if(!archive){const r=spawnSync('curl',['--fail','--location','--silent','--show-error','--max-time','180','https://github.com/XTLS/Xray-core/releases/download/'+VERSION+'/'+build.asset,'-o',zip],{stdio:'inherit'});if(r.status!==0)throw Error('下载失败，可使用 --archive 指定离线安装包');}
 verifyArchive(zip,build);const bytes=execFileSync('unzip',['-p',zip,'xray'],{maxBuffer:100*1024*1024});fs.writeFileSync(p.bin,bytes,{mode:0o700});fs.chmodSync(p.bin,0o700);console.log('Xray '+VERSION+' 已安装并校验：'+p.bin);}
function testConfig(p){const r=spawnSync(p.bin,['run','-test','-config',p.config],{encoding:'utf8'});if(r.status!==0)throw Error('Xray 配置校验失败；请检查私有节点文件和内核版本');}
function cleanEnv(){const env={...process.env};for(const key of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy'])delete env[key];return env;}
function runningPid(p){if(!fs.existsSync(p.pid))return null;const id=Number(fs.readFileSync(p.pid));if(!Number.isInteger(id)||id<2)return null;try{process.kill(id,0);const command=execFileSync('ps',['-p',String(id),'-o','command='],{encoding:'utf8'});return command.includes(p.bin)?id:null;}catch{return null;}}
function start(p){testConfig(p);if(runningPid(p)){console.log('代理进程已运行');return;}
 const fd=fs.openSync(p.log,'a',0o600);try{const child=spawn(p.bin,['run','-config',p.config],{detached:true,stdio:['ignore',fd,fd],env:cleanEnv()});child.unref();writePrivate(p.pid,String(child.pid));console.log('本地代理已启动；运行 check 验证链路后再 enable');}finally{fs.closeSync(fd);}}
function check(p){const config=JSON.parse(fs.readFileSync(p.config));const port=config.inbounds[0].port;const proxy='http://127.0.0.1:'+port;const r=spawnSync('curl',['--fail','--silent','--show-error','--max-time','35','--proxy',proxy,'--noproxy','','https://api.ipify.org'],{encoding:'utf8'});if(r.status!==0)throw Error('节点连接失败，未切换应用代理');const ip=r.stdout.trim();if(!/^[a-f\d.:]+$/i.test(ip))throw Error('出口校验未返回有效地址');console.log('代理出口：'+ip);return proxy;}
async function main(args=process.argv.slice(2)){const p=locations(),cmd=args[0];fs.mkdirSync(p.dir,{recursive:true,mode:0o700});
 if(cmd==='install'){install(p,args.includes('--archive')?path.resolve(args[args.indexOf('--archive')+1]):null);return;}
 if(cmd==='configure'){if(!args[1])throw Error('用法 configure /私有节点.json');const n=JSON.parse(fs.readFileSync(args[1]));writePrivate(p.config,JSON.stringify(nodeToXray(n),null,2));testConfig(p);console.log('私有节点配置已保存并通过内核校验');return;}
 if(cmd==='start'){start(p);return;}
 if(cmd==='check'){check(p);return;}
 if(cmd==='enable'){const proxy=check(p);const file=path.join(p.root,'web-runtime.json');const old=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{};writePrivate(file,JSON.stringify({...old,proxy}));console.log('国际网页渠道已指向专用代理；重启 API 和 Worker 后生效');return;}
 if(cmd==='stop'){const id=runningPid(p);if(id)process.kill(id,'SIGTERM');if(fs.existsSync(p.pid))fs.unlinkSync(p.pid);return;}
 throw Error('用法：proxy install [--archive 路径] | configure 节点.json | start | check | enable | stop');
}
module.exports={nodeToXray,locations,verifyArchive,BUILDS,VERSION,main};
