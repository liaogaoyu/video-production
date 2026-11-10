const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const driver = require('./driver.cjs');
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
const transient = error => error.retryable || ['AbortError','TimeoutError'].includes(error.name) || error.cause?.code;
const WATCH_RETRIES = 3;
let nextAccountReport=0, lastAccountReportError='';

function recoveryHint(phase, stage) {
  if(stage==='submitting') return '在原账号打开原任务画布，再继续原任务。系统只核对已有提交和结果。';
  if(phase==='fetching_references') return '检查工作台连接和该分镜的参考图。文件缺失或校验失败时，终止这条未提交任务，重新锁定参考图后再生成。';
  if(phase==='switching_account') return '在执行器 Mac 上登录任务绑定的豆包账号，再继续原任务。';
  if(phase==='uploading_references') return '在豆包原画布关闭文件选择或错误弹窗，再继续原任务。执行器会核对已有参考图。';
  if(phase==='setting_parameters') return '检查原画布是否能选择 Fast 模型、画幅和时长，再继续原任务。';
  if(phase==='downloading') return '打开原任务画布，检查下载目录中的同编号 MP4，再继续原任务。';
  if(phase==='uploading') return '确认原视频文件可读且工作台连接正常，再继续回传。';
  if(phase==='generating') return '在原账号打开原任务画布，确认原视频节点仍可访问，再继续等待结果。';
  return '在执行器 Mac 上打开任务绑定账号的豆包画布，关闭遮挡弹窗，再继续原任务。';
}

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
  let latestProgress, failurePhase, heartbeat, sending=Promise.resolve();
  function sendProgress() {
    const status=latestProgress;
    if(!currentTask || !status) return sending;
    const endpoint=`tasks/${currentTask.id}/progress`;
    sending=sending.then(()=>api(endpoint,{workerId:state.workerId,resumeRevision:state.resumeRevision||0,...status},false,3000).catch(()=>null));
    return sending;
  }
  function report(phase, completed, total, interruption) {
    if(!interruption) failurePhase=phase;
    latestProgress={phase,completed,total,interruption};
    return sendProgress();
  }
  async function publishInterruption() {
    const detail=state.interruption;
    const result=await report(detail.automatic?'retrying':'needs_attention',null,null,detail);
    if(result?.ok && !detail.synced) {detail.synced=true;save();}
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
  async function recoverSubmission(task) {
    await report('submitting');
    if(!state.canvasNodeId || driver.accountOf(await driver.snapshot())!==task.account_label)
      throw Error('无法核对上次提交，请打开原账号和原任务画布');
    const result=await driver.ax({action:'canvas-status',id:state.canvasNodeId});
    if(result==='unknown') throw Object.assign(Error('豆包原节点暂未显示已受理或失败，提交结果仍待确认'),{retryable:true});
    if(result==='failed' || result==='rejected') {
      await update(task,'failed',result==='rejected'?'豆包审核不通过，生成已停止':'豆包原任务明确显示视频生成失败');
      state.stage='failed';state.error='';delete state.interruption;save();
      return;
    }
    await update(task,'running','已核对豆包原任务，继续跟踪视频结果');
    state.stage='running';save();
    await finish(task);
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
      state.stage='uploaded';state.error='';delete state.interruption;save();
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
    const resumeRevision=task.resume_revision||0;
    const hadInterruption=state.taskId===task.id && !!state.interruption;
    const resumed=state.resumeRevision!==resumeRevision || process.argv.includes('--resume');
    if(state.taskId!==task.id || resumed) delete state.interruption;
    state.resumeRevision=resumeRevision;
    if(state.interruption) {
      failurePhase=state.interruption.phase;
      if(!state.interruption.synced) await publishInterruption();
      if(!state.interruption.automatic) return;
    }
    if(state.taskId===task.id && state.canvasNodeId &&
      (task.state==='submitting' || (task.state==='running' && state.stage==='submitting'))) {
      await recoverSubmission(task);return;
    }
    if(state.taskId===task.id && ['running','awaiting_video'].includes(task.state) &&
       ['running','awaiting_video','downloading','uploading'].includes(state.stage)) {
      await finish(task);return;
    }
    if(state.taskId===task.id && task.state==='prepared' && state.stage==='submitting')
      state.stage='prepared';
    if (!['claimed','prepared'].includes(task.state) || state.stage === 'submitting')
      throw Error(`任务处于 ${task.state}，恢复时保留账号锁，请核对原任务，禁止重复提交`);
    const account = config.accounts.find(a=>a.label === task.account_label);
    if (!account) throw Error('任务绑定账号已从配置移除');
    if(state.taskId!==task.id) {
      delete state.canvasNodeId;
      state.stage='claimed';
    }
    state.taskId=task.id;
    save();
    if (task.state === 'claimed' || (task.state==='prepared' && hadInterruption)) {
      // Persist before every non-idempotent desktop operation.
      if (state.stage === 'preparing') {
        const tree=await driver.snapshot();
        if(driver.busy(tree)) throw Error('当前存在生成任务，保留账号锁');
        // The cloud is still in claimed, so no submission can have occurred.
        // After a client restart, prepare can recreate an unfinished draft safely.
      }
      if(state.stage!=='prepared' || task.state==='prepared') {
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
    await report('checking_submission');
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
    if(!canvasNodeId) throw Object.assign(Error('提交前没有识别到唯一可见的任务视频节点'),{uiTimeout:true});
    state.canvasNodeId=canvasNodeId;
    state.stage='submitting'; save();
    await report('submitting');
    await update(task,'submitting','正在提交，重启后禁止重复提交');
    await driver.ax({action:'submit',role:'AXTextArea',label:input.value,canvasNodeId,canvasNodeTitle:'豆包任务-'+task.id});
    await driver.waitFor(tree=>driver.busy(tree),20000,'点击生成后 20 秒内未看到豆包受理状态');
    state.stage='running'; save();
    await update(task,'running','豆包正在生成，账号已锁定');
    await finish(task);
  } catch (error) {
    state.error=error.message;
    if(currentTask) {
      const latest=await api('tasks/'+currentTask.id).catch(()=>null);
      if(latest?.state==='cancelling') {await finishCancellation(currentTask);return;}
      const phase=failurePhase || 'claimed';
      const attempts=(state.interruption?.attempts||0)+1;
      const beforeSubmit=['claimed','prepared'].includes(latest?.state||currentTask.state) && state.stage!=='submitting';
      const safeToRecheck=beforeSubmit || (state.stage==='submitting' && !!state.canvasNodeId);
      const automatic=process.argv.includes('--watch') && attempts<=WATCH_RETRIES &&
        Boolean(transient(error) || (safeToRecheck && error.uiTimeout));
      const code=error.cause?.code;
      const message=error.message||'执行器发生未知错误';
      const reason=code ? `${message}（${code}）` : message;
      state.interruption={phase,attempts,automatic,reason:String(reason).slice(0,500),
        recovery:automatic ? `执行器将在 10 秒后继续原任务（第 ${attempts}/${WATCH_RETRIES} 次自动重试）。` : recoveryHint(phase,state.stage)};
      save();
      if(latest) await publishInterruption();
      console.error(`豆包任务 ${currentTask.id} 在 ${phase} 中断：${reason} ${state.interruption.recovery}`);
      if(process.argv.includes('--watch')) return;
    }
    save();
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
