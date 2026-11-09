const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const driver = require('./driver.cjs');
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
const transient = error => error.retryable || ['AbortError','TimeoutError'].includes(error.name) || error.cause?.code;
let nextAccountReport=0, lastAccountReportError='';

async function main() {
  const configPath = process.argv[2];
  if (!configPath) throw Error('用法 node worker/doubao-local/main.cjs /绝对路径/config.json [--submit]');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if(!config.deviceId || !config.deviceToken) throw Error('请先配置本机专用连接凭据');
  if(fs.statSync(configPath).mode & 0o077) throw Error('连接配置权限应为600，请限制其他用户读取');
  driver.useBackground(config.cdpEndpoint||'http://127.0.0.1:9227');
  const base = new URL(config.serverUrl);
  if (base.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(base.hostname))
    throw Error('远程服务器必须使用 HTTPS');
  if (!Array.isArray(config.accounts)) throw Error('请配置账号列表');
  const directory = path.resolve(path.dirname(configPath), config.stateDirectory || 'doubao-state');
  fs.mkdirSync(directory, {recursive:true, mode:0o700});
  const lockFile = path.join(directory, 'worker.lock');
  const lock = fs.openSync(lockFile, 'wx', 0o600);
  fs.writeSync(lock, String(process.pid));
  const exit=()=>{try{fs.unlinkSync(lockFile);}catch{}};
  const interrupt=()=>{exit();process.exit(130);};
  process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
  const stateFile = path.join(directory, 'state.json');
  let state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {workerId:crypto.randomUUID()};
  if(config.deviceId) {
    if(state.taskId && state.workerId!==config.deviceId) throw Error('本地任务归属与连接凭据不一致');
    state.workerId=config.deviceId;
  }
  function save() {
    const temporary = stateFile + '.tmp';
    const file = fs.openSync(temporary, 'w', 0o600);
    try { fs.writeFileSync(file, JSON.stringify(state,null,2)); fs.fsyncSync(file); }
    finally { fs.closeSync(file); }
    fs.renameSync(temporary, stateFile);
  }
  save();
  async function api(endpoint, body, multipart = false, timeout = 30000) {
    const response = await fetch(new URL('/api/v1/doubao-local/' + endpoint, base), {
      method:body ? 'POST':'GET', redirect:'error', signal:AbortSignal.timeout(timeout),
      headers:{...(!multipart ? {'content-type':'application/json'} : {'x-doubao-worker':state.workerId}), 'x-doubao-device':config.deviceToken},
      body:body ? (multipart ? body : JSON.stringify(body)) : undefined,
    });
    const text=await response.text();
    let result;
    try {result=JSON.parse(text);} catch {throw Object.assign(Error('云端服务暂不可用（HTTP '+response.status+'）'),{retryable:response.status>=500});}
    if (!response.ok) throw Object.assign(Error(result.error?.message || '云端请求失败'),{retryable:response.status>=500});
    return result;
  }
  const update = (task, next, note) => api(`tasks/${task.id}/state`,{workerId:state.workerId,state:next,note});
  let currentTask=null;
  let latestProgress, heartbeat, sending=Promise.resolve();
  function sendProgress() {
    const status=latestProgress;
    if(!currentTask || !status) return sending;
    const endpoint=`tasks/${currentTask.id}/progress`;
    sending=sending.then(()=>api(endpoint,{workerId:state.workerId,...status},false,3000).catch(()=>{}));
    return sending;
  }
  function report(phase, completed, total) {
    latestProgress={phase,completed,total};
    return sendProgress();
  }
  async function checkCancellation() {
    const latest=await api('tasks/'+currentTask.id);
    if(['cancelling','cancelled'].includes(latest.state))
      throw Object.assign(Error('用户已请求终止操作'),{code:'cancelled'});
  }
  async function finishCancellation(task) {
    driver.setGuard(null);
    await report('cancelling');
    await driver.cancelPreparation();
    await update(task,'cancelled','本机已停止提交前操作，额度预留已释放');
    state.taskId=task.id;state.stage='cancelled';state.error='';save();
    console.log('已终止当前任务，尚未提交生成。');
  }
  async function referenceFiles(task) {
    const references=JSON.parse(task.references_json||'[]');
    const folder=path.join(directory,'references',task.id);
    fs.mkdirSync(folder,{recursive:true,mode:0o700});
    const files=[];
    let total=0;
    if(references.length) await report('fetching_references',0,references.length);
    for(const reference of references) {
      await checkCancellation();
      const response=await fetch(new URL(`/api/v1/doubao-local/tasks/${task.id}/references/${reference.index}`,base),{
        headers:{'x-doubao-device':config.deviceToken},redirect:'error',signal:AbortSignal.timeout(30000),
      });
      if(!response.ok) throw Object.assign(Error('下载固定参考图失败（HTTP '+response.status+'）'),{retryable:response.status>=500});
      const chunks=[];
      for await(const chunk of response.body) {
        total+=chunk.length;if(total>50*1024*1024) throw Error('参考图总大小超过50MB');chunks.push(chunk);
      }
      const bytes=Buffer.concat(chunks);
      if(crypto.createHash('sha256').update(bytes).digest('hex')!==reference.sha256)
        throw Error('参考图内容与任务快照不一致');
      const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[reference.mime];
      if(!ext) throw Error('参考图格式不支持');
      const file=path.join(folder,`图${reference.index}_${reference.sha256.slice(0,12)}.${ext}`);
      fs.writeFileSync(file,bytes,{mode:0o600});files.push(file);
      await report('fetching_references',files.length,references.length);
    }
    return files;
  }
  async function resultNode(task) {
    const title='豆包任务-'+task.id;
    const checkedSnapshot=async()=>{
      const nodes=await driver.snapshot();
      if(driver.accountOf(nodes)!==task.account_label) throw Error('账号发生变化，停止任务并保留锁');
      return nodes;
    };
    let nodes=await checkedSnapshot();
    let id=await driver.ax({action:'canvas-node',title});
    if(state.canvasNodeId && !id &&
       await driver.ax({action:'select-canvas-node',id:state.canvasNodeId})) {
      nodes=await checkedSnapshot();
      id=await driver.ax({action:'canvas-node',title});
    }
    if(!id || driver.selectedTitle(nodes)!==title)
      throw Object.assign(Error('当前画布未找到原任务节点，保留账号锁，等待恢复'),{retryable:true});
    if(state.canvasNodeId!==id) {state.canvasNodeId=id;save();}
    return nodes;
  }
  async function finish(task) {
    if (state.stage === 'running') {
      const deadline=Date.now()+60*60*1000;
      let complete=false;
      while(Date.now()<deadline) {
        if(state.canvasNodeId && await driver.ax({action:'canvas-rejected',id:state.canvasNodeId})) {
          const observed=await driver.snapshot();
          if(driver.accountOf(observed)===task.account_label && !driver.busy(observed)) {
            await update(task,'failed','豆包审核不通过，生成已停止');
            state.stage='failed';state.error='';save();
            console.log('豆包审核不通过，结束本次账号锁定。');return;
          }
        }
        const nodes=await resultNode(task);
        if(!driver.busy(nodes) && driver.selectedFailed(nodes)) {
          await update(task,'failed','豆包当前任务节点明确显示视频生成失败');
          state.stage='failed';save();console.log('豆包生成失败，已确认终态，结束本次账号锁定。');return;
        }
        if(!driver.busy(nodes) && driver.hasVideoDownload(nodes)) {
          complete=true; break;
        }
        const marker=nodes.findIndex(n=>n.role==='AXStaticText'&&n.value==='正在生成视频');
        const value=marker>=2&&nodes[marker-1].value==='%'?nodes[marker-2].value:'';
        const percent=/^\d{1,3}$/.test(value)?Number(value):null;
        if(percent!==null&&percent<=100) await report('generating',percent,100);
        else if(latestProgress?.phase!=='generating') await report('generating');
        await pause(10000);
      }
      if(!complete) throw Error('等待生成超过一小时，保留原任务和账号锁');
      state.stage='awaiting_video';save();
      await update(task,'awaiting_video','视频已生成，等待下载回传，账号锁保留');
    }
    const downloadDirectory=path.resolve(config.downloadDirectory || path.join(os.homedir(),'Downloads'));
    const downloaded=()=>fs.readdirSync(downloadDirectory).filter(name=>name.includes(task.id)&&/\.mp4$/i.test(name));
    async function requestDownload() {
      const nodes=await resultNode(task);
      if(driver.busy(nodes) || !driver.hasVideoDownload(nodes))
        throw Object.assign(Error('原任务的下载控件尚未就绪'),{retryable:true});
      if(!downloaded().length)
        await driver.ax({action:'click',role:'AXButton',label:'下载视频',
          canvasNodeId:state.canvasNodeId,canvasNodeTitle:'豆包任务-'+task.id});
    }
    if(['awaiting_video','downloading'].includes(state.stage)) await report('downloading');
    if(state.stage==='awaiting_video') {
      if(!downloaded().length) await requestDownload();
      state.downloadRetried=false;
      state.stage='downloading';save();
    }
    while(state.stage==='downloading') {
      const deadline=Date.now()+180000;
      let candidate='', previousSize=-1;
      while(Date.now()<deadline) {
        const candidates=downloaded();
        if(candidates.length>1) throw Error('发现多个同编号视频，请核对下载目录');
        if(candidates.length===1) {
          candidate=path.join(downloadDirectory,candidates[0]);
          const stat=fs.statSync(candidate);
          if(stat.size>0&&stat.size===previousSize) {
            require('../../server/video-export.cjs').inspectMp4File(candidate);
            state.videoFile=candidate;state.stage='uploading';save();break;
          }
          previousSize=stat.size;
        }
        await pause(2000);
      }
      if(state.stage==='uploading') break;
      const unfinished=fs.readdirSync(downloadDirectory).some(name=>
        name.includes(task.id)&&/\.(crdownload|download|part|tmp)$/i.test(name));
      if(state.downloadRetried || unfinished || downloaded().length)
        throw Error('未找到包含任务编号的完整 MP4，保留账号锁，请检查下载位置');
      await requestDownload();
      state.downloadRetried=true;save();
    }
    if(state.stage==='uploading') {
      await report('uploading');
      const bytes=fs.readFileSync(state.videoFile);
      if(bytes.length>500*1024*1024) throw Error('视频超过500MB');
      const form=new FormData();form.append('file',new Blob([bytes],{type:'video/mp4'}),path.basename(state.videoFile));
      const result=await api(`tasks/${task.id}/video`,form,true);
      if(result.state!=='succeeded') throw Error('云端未确认保存成功');
      state.stage='uploaded';state.error='';save();
      console.log('视频已回传，云端账号锁已释放。');
    }
  }
  try {
    if(state.taskId && state.stage==='uploading') {
      const previous=await api('tasks/'+state.taskId);
      if(previous.state==='succeeded') {state.stage='uploaded';save();}
    }
    if((!state.taskId || ['uploaded','failed','cancelled'].includes(state.stage)) && Date.now()>=nextAccountReport) {
      nextAccountReport=Date.now()+30000;
      try {
        const labels=await driver.collectAccounts();
        if(labels) {
          await api('account-report',{workerId:state.workerId,labels},false,5000);
          nextAccountReport=Date.now()+(config.accounts.length?300000:45000);
          if(!config.accounts.length && state.idleReason!=='waiting_account_mapping') {
            state.idleReason='waiting_account_mapping';
            save();
            console.log('已上报豆包账号名单，等待配置生成账号。');
          }
          lastAccountReportError='';
        }
      } catch(error) {
        if(error.message!==lastAccountReportError) console.error('账号名单暂未上报：',error.message);
        lastAccountReportError=error.message;
      }
    }
    if(!config.accounts.length) return;
    const claim = await api('claim',{workerId:state.workerId,accounts:config.accounts});
    if (!claim.task) {
      if(state.idleReason!==claim.reason){state.idleReason=claim.reason;save();console.log(JSON.stringify(claim));}
      return;
    }
    state.idleReason='';
    const task = claim.task;
    currentTask=task;
    heartbeat=setInterval(()=>void sendProgress(),15000);
    heartbeat.unref();
    if(task.state==='cancelling') {await finishCancellation(task);return;}
    driver.setGuard(checkCancellation);
    if (state.taskId && state.taskId !== task.id && !['uploaded','failed','cancelled'].includes(state.stage))
      throw Error('本地仍有未完成任务，保持锁定，请核对任务状态');
    if(state.taskId===task.id && ['running','awaiting_video'].includes(task.state) &&
       ['running','awaiting_video','downloading','uploading'].includes(state.stage)) {
      await finish(task);return;
    }
    if (!['claimed','prepared'].includes(task.state) || state.stage === 'submitting')
      throw Error(`任务处于 ${task.state}，恢复时保留账号锁，请核对原任务，禁止重复提交`);
    const account = config.accounts.find(a=>a.label === task.account_label);
    if (!account) throw Error('任务绑定账号已从配置移除');
    if(state.taskId!==task.id) delete state.canvasNodeId;
    state.taskId=task.id;
    save();
    if (task.state === 'claimed') {
      // Persist before every non-idempotent desktop operation.
      if (state.stage === 'preparing') {
        const tree=await driver.snapshot();
        if(driver.busy(tree)) throw Error('当前存在生成任务，保留账号锁');
        // The cloud is still in claimed, so no submission can have occurred.
        // After a client restart, prepare can recreate an unfinished draft safely.
      }
      if(state.stage!=='prepared') {
        task.referenceFiles=await referenceFiles(task);
        state.stage='preparing'; save();
        await driver.prepare(task, account, report);
        state.stage='prepared'; save();
      }
      await update(task,'prepared','视频节点和提示词已核对');
    }
    if (!process.argv.includes('--submit')) {
      await report('prepared');
      console.log('节点已准备，账号锁保留。添加 --submit 可提交当前任务。');
      return;
    }
    const nodes = await driver.snapshot();
    if (driver.accountOf(nodes) !== task.account_label || driver.busy(nodes) || driver.selectedTitle(nodes)!=='豆包任务-'+task.id)
      throw Error('账号已改变或已有生成任务，保持锁定');
    if(!nodes.some(n=>n.role==='AXPopUpButton'&&n.title==='模型 '+(task.model||driver.DEFAULT_MODEL)))
      throw Error('提交前 Fast 模型核对失败');
    if(!nodes.some(n=>n.role==='AXPopUpButton'&&n.title===`${task.ratio==='auto'?'自动':task.ratio} · ${task.duration}s`))
      throw Error('提交前画幅或时长核对失败');
    const expected=JSON.parse(task.references_json||'[]').map(r=>`图${r.index}_${r.sha256.slice(0,12)}.${{'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[r.mime]}`);
    const actual=driver.editorReferences(nodes,task.prompt);
    if(expected.length!==actual.length || expected.some((name,index)=>name!==actual[index]))
      throw Error('提交前参考图顺序核对失败');
    const input=driver.promptInput(nodes,task.prompt);
    if(!input) throw Error('提交前提示词核对失败');
    const canvasNodeId=await driver.ax({action:'canvas-node',title:'豆包任务-'+task.id});
    if(!canvasNodeId) throw Error('提交前无法识别选中的画布节点');
    state.canvasNodeId=canvasNodeId;
    state.stage='submitting'; save();
    await report('submitting');
    await update(task,'submitting','正在提交，重启后禁止重复提交');
    await driver.ax({action:'submit',role:'AXTextArea',label:input.value});
    await driver.waitFor(tree=>driver.busy(tree),20000);
    state.stage='running'; save();
    await update(task,'running','豆包正在生成，账号已锁定');
    await finish(task);
  } catch (error) {
    if(currentTask) {
      const latest=await api('tasks/'+currentTask.id).catch(()=>null);
      if(latest?.state==='cancelling') {await finishCancellation(currentTask);return;}
      if(latest) await report(transient(error)?'retrying':'needs_attention');
    }
    state.error=error.message; save();
    throw error;
  } finally {
    clearInterval(heartbeat);
    driver.setGuard(null);
    driver.closeBackground();
    fs.closeSync(lock);
    exit();process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);
  }
}
if (require.main === module) {
  (async()=>{
    do {
      try {await main();}
      catch(error) {
        if(!process.argv.includes('--watch') || !transient(error)) throw error;
        console.error('任务暂未能继续，账号锁保留，稍后重试。',error.message);
      }
      if(process.argv.includes('--watch')) await pause(10000);
    } while(process.argv.includes('--watch'));
  })().catch(error=>{console.error(error.message);process.exitCode=1;});
}
module.exports = { main };
