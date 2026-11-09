const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const directory = path.join(os.homedir(),'Library','Application Support','Storydock','doubao-local');
const labels = {tunnel:'com.storydock.doubao-tunnel',worker:'com.storydock.doubao-worker'};
const localServer = 'http://127.0.0.1:28456';

function run(command,args) {
  const result=spawnSync(command,args,{encoding:'utf8'});
  if(result.error) throw result.error;
  if(result.status!==0) throw Error(result.stderr.trim() || command+' 启动失败');
  return result.stdout.trim();
}

function prepare(folder) {
  fs.mkdirSync(folder,{recursive:true,mode:0o700});
  const key=path.join(folder,'tunnel-ed25519');
  if(!fs.existsSync(key)) run('/usr/bin/ssh-keygen',['-q','-t','ed25519','-N','','-C','storydock-doubao-mac','-f',key]);
  const publicKey=key+'.pub';
  if(!fs.existsSync(publicKey)) fs.writeFileSync(publicKey,run('/usr/bin/ssh-keygen',['-y','-f',key])+'\n',{mode:0o600,flag:'wx'});
  return publicKey;
}

function plist(label,args,log) {
  const xml=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${xml(label)}</string>
<key>ProgramArguments</key><array>${args.map(arg=>`<string>${xml(arg)}</string>`).join('')}</array>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>10</integer>
<key>StandardOutPath</key><string>${xml(log)}</string>
<key>StandardErrorPath</key><string>${xml(log)}</string>
</dict></plist>\n`;
}

function startService(label,args,log) {
  const agents=path.join(os.homedir(),'Library','LaunchAgents');
  fs.mkdirSync(agents,{recursive:true});
  const file=path.join(agents,label+'.plist');
  const service=plist(label,args,log);
  if(fs.existsSync(file)&&fs.readFileSync(file,'utf8')!==service) throw Error('此 Mac 已有不同配置的服务 '+label);
  if(!fs.existsSync(file)) fs.writeFileSync(file,service,{mode:0o600,flag:'wx'});
  fs.closeSync(fs.openSync(log,'a',0o600));
  const domain='gui/'+process.getuid();
  if(spawnSync('/bin/launchctl',['print',domain+'/'+label],{stdio:'ignore'}).status!==0)
    run('/bin/launchctl',['bootstrap',domain,file]);
}

function readEnrollment(file) {
  let data;
  try {data=JSON.parse(fs.readFileSync(file,'utf8'));}
  catch {throw Error('无法读取连接配置，请检查文件路径和 JSON 格式');}
  const {deviceId,deviceToken,accounts,ssh}=data||{};
  if(!/^[a-f0-9-]{36}$/i.test(deviceId||'') || !/^[A-Za-z0-9_-]{32,}$/.test(deviceToken||''))
    throw Error('连接配置缺少有效的设备凭据');
  if(!Array.isArray(accounts)||!accounts.length||accounts.length>50||
     accounts.some(account=>typeof account?.label!=='string'||!account.label.trim()||
       typeof account.quotaKey!=='string'||!account.quotaKey.trim()))
    throw Error('请在连接配置中填写此 Mac 已登录的豆包账号');
  if(!/^[a-z0-9][a-z0-9.-]*$/i.test(ssh?.host||'')||!/^\w[\w-]*$/.test(ssh?.user||'')||
     !/^ssh-ed25519 [A-Za-z0-9+/]+={0,2}$/.test(ssh?.hostKey||''))
    throw Error('连接配置缺少服务器地址或已验证的 SSH 主机公钥');
  return {deviceId,deviceToken,accounts,ssh};
}

async function activate(file) {
  const {deviceId,deviceToken,accounts,ssh}=readEnrollment(file);
  const configPath=path.join(directory,'config.json');
  const config={deviceId,deviceToken,accounts,serverUrl:localServer,stateDirectory:'state'};
  const previous=fs.existsSync(configPath)?JSON.parse(fs.readFileSync(configPath,'utf8')):null;
  if(previous&&JSON.stringify(previous)!==JSON.stringify(config)) throw Error('此 Mac 已有执行器配置，请保留原配置');
  const key=path.join(directory,'tunnel-ed25519');
  if(!fs.existsSync(key+'.pub')||!fs.existsSync(key)) throw Error('请先运行安装程序生成此 Mac 的公钥');
  const knownHosts=path.join(directory,'tunnel-known-hosts');
  const hostLine=ssh.host+' '+ssh.hostKey+'\n';
  if(fs.existsSync(knownHosts)&&fs.readFileSync(knownHosts,'utf8')!==hostLine) throw Error('此 Mac 已有不同的 SSH 主机公钥');
  if(!fs.existsSync(knownHosts)) fs.writeFileSync(knownHosts,hostLine,{mode:0o600,flag:'wx'});
  const payload=path.resolve(__dirname,'../..');
  const installed=path.join(directory,'runtime');
  for(const part of ['worker/doubao-local','server']) {
    const files=part==='server'?['video-export.cjs','errors.cjs']:
      ['main.cjs','driver.cjs','cdp.cjs','background.cjs','mac-setup.cjs'];
    fs.mkdirSync(path.join(installed,part),{recursive:true,mode:0o700});
    for(const name of files) fs.copyFileSync(path.join(payload,part,name),path.join(installed,part,name));
  }
  startService(labels.tunnel,['/usr/bin/ssh','-NT','-i',key,
    '-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes',
    '-o','UserKnownHostsFile='+knownHosts,'-o','ConnectTimeout=10','-o','ExitOnForwardFailure=yes',
    '-o','ServerAliveInterval=20','-o','ServerAliveCountMax=3',
    '-L','127.0.0.1:28456:127.0.0.1:18456',ssh.user+'@'+ssh.host],path.join(directory,'tunnel.log'));
  let connected=false;
  for(let attempt=0;attempt<15;attempt++){
    const response=await fetch(localServer+'/api/v1/doubao-local/tasks/'+randomUUID(),{
      headers:{'x-doubao-device':deviceToken},signal:AbortSignal.timeout(1500),redirect:'error',
    }).catch(()=>null);
    if(response?.status===401) throw Error('服务器不认可这份设备凭据');
    if(response?.status===403 && (await response.json().catch(()=>null))?.error?.code==='device_mismatch') {
      connected=true;break;
    }
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(!connected) throw Error('未能建立已授权的 SSH 隧道，请核对新 Mac 的公钥是否已登记');
  if(!previous) fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n',{mode:0o600,flag:'wx'});
  startService(labels.worker,[process.execPath,path.join(installed,'worker','doubao-local','mac-setup.cjs'),'run'],
    path.join(directory,'worker.log'));
  console.log('已安装。登录豆包并启动本机调试接口后，执行器会自动领取任务。');
}

async function main(args) {
  if(process.platform!=='darwin'||Number(process.versions.node.split('.')[0])<24) throw Error('需要 macOS 和 Node.js 24 或更新版本');
  if(args[0]==='run') {
    const driver=require('./driver.cjs');
    driver.useBackground();
    try {
      if(!driver.accountOf(await driver.snapshot())) throw Error('等待豆包登录');
    } finally {driver.closeBackground();}
    const child=spawn(process.execPath,[path.join(__dirname,'main.cjs'),path.join(directory,'config.json'),'--submit','--watch'],{stdio:'inherit'});
    const stop=()=>child.kill('SIGTERM');
    process.once('SIGTERM',stop);
    process.once('SIGINT',stop);
    try {
      process.exitCode=await new Promise((resolve,reject)=>{
        child.once('error',reject);
        child.once('exit',code=>resolve(code??1));
      });
    } finally {
      process.removeListener('SIGTERM',stop);
      process.removeListener('SIGINT',stop);
    }
  } else if(args.length) await activate(args[0]);
  else {
    if(fs.existsSync(path.join(directory,'config.json'))) throw Error('此 Mac 已有执行器，请在要接入的新 Mac 上运行');
    const publicKey=prepare(directory);
    console.log('请把下面这一行公钥发给工作台管理员，用于登记新 Mac。');
    console.log(fs.readFileSync(publicKey,'utf8').trim());
  }
}

if(require.main===module) main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={prepare,plist,readEnrollment};
