const { execFile } = require('node:child_process');
const path = require('node:path');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const DEFAULT_MODEL='Seedance 2.0 Fast';
let guard=null;
const setGuard=check=>{guard=check;};
let background=null;
function useBackground(endpoint) {
  background?.close();
  background=new (require('./background.cjs').BackgroundAdapter)(endpoint);
}
function closeBackground() {background?.close();background=null;}

async function ax(request) {
  if(!['snapshot','canvas-node','canvas-rejected'].includes(request.action) && guard) await guard();
  if(background) {
    try {return await background.perform(request);}
    catch(error) {error.message+=` [后台 ${request.action}${request.role?' '+request.role:''}]`;throw error;}
  }
  const child = execFile('python3', [path.join(__dirname, 'accessibility.py')], { maxBuffer: 8*1024*1024, timeout: 20000 });
  const result = await new Promise((resolve, reject) => {
    let output = '', error = '';
    child.stdout.on('data', text => { output += text; });
    child.stderr.on('data', text => { error += text; });
    child.once('error', reject);
    child.once('close', code => {
      try {
        const data = JSON.parse(output);
        if (code || data.error) reject(Error(data.error || error || '豆包控制失败'));
        else resolve(data);
      } catch (e) { reject(e); }
    });
    child.stdin.end(JSON.stringify(request));
  });
  return result;
}
const snapshot = () => ax({action:'snapshot'});
const label = node => node.title || node.description || node.value;
const hasVideoDownload = nodes => nodes.some(node=>node.role==='AXButton'&&label(node)==='下载视频');
const busy = nodes => nodes.some(node => /正在生成(?:视频|图片)|\d+\s*%.*生成/.test(label(node)));
const accountOf = nodes => nodes.find(node => node.role === 'AXPopUpButton' && node.help === '⇧⌘,')?.title;
const normalized = text => String(text||'').replace(/\s+/g,' ').trim();
const promptInput = (nodes,prompt) => nodes.find(n=>n.role==='AXTextArea'&&normalized(n.value)===normalized(prompt));
async function waitFor(check, timeout = 15000, message = '豆包界面未进入预期状态，已停止自动操作') {
  const until = Date.now() + timeout;
  do {
    if(guard) await guard();
    const nodes = await snapshot();
    if (check(nodes)) return nodes;
    await pause(400);
  } while (Date.now() < until);
  throw Error(message);
}
async function click(role, text) {
  await ax({action:'click',role,label:text});
}
async function switchAccount(target) {
  let nodes = await snapshot();
  if (busy(nodes)) throw Error('检测到正在生成的任务，禁止切换账号');
  const current = accountOf(nodes);
  if (!current) throw Error('无法识别当前账号');
  if (current === target) return false;
  if (!nodes.some(n => n.role === 'AXMenuItem' && label(n) === '更多账号'))
    await click('AXPopUpButton', current);
  nodes = await waitFor(tree => tree.some(n => n.role === 'AXMenuItem' && label(n) === '更多账号'));
  let account = nodes.find(n => n.role === 'AXMenuItem' && label(n) === 'avatar ' + target);
  if (!account) {
    await click('AXMenuItem', '更多账号');
    nodes = await waitFor(tree => tree.some(n => n.role === 'AXMenuItem' && label(n) === 'avatar ' + target));
    account = nodes.find(n => n.role === 'AXMenuItem' && label(n) === 'avatar ' + target);
  }
  await click(account.role, label(account));
  await waitFor(tree => accountOf(tree) === target);
  return true;
}
async function prepare(task, config, report=async()=>{}) {
  await report('switching_account');
  const switched=await switchAccount(task.account_label);
  await report('opening_canvas');
  let nodes = await snapshot();
  if (busy(nodes)) throw Error('当前画布已有生成任务，保持账号锁');
  const canvasOpen=tree=>tree.some(n=>n.role==='AXCheckBox'&&label(n)==='视频生成');
  const defaultChat='新画布 归档对话 更多';
  const chat=nodes.filter(n=>n.role==='AXLink'&&label(n)===(config.canvasLabel||defaultChat));
  const link=chat.length===1?chat[0]:null;
  const configuredTitle=config.canvasTitle || (link?label(link):config.canvasLabel)?.split(' 归档对话')[0];
  const configuredCanvasOpen=tree=>canvasOpen(tree)&&
    (!background||!configuredTitle||tree.some(n=>n.role==='AXTab'&&n.selected&&label(n)===configuredTitle));
  if (switched || !configuredCanvasOpen(nodes)) {
    const isCard=n=>n.role==='AXButton'&&n.title.includes('创建时间：')&&
      (!link||!configuredTitle||n.title.startsWith(configuredTitle+' '));
    if(link) {
      await click(link.role, label(link));
      nodes=await waitFor(tree=>tree.some(isCard),60000,'未找到已配置的画布卡片');
    } else {
      const create=nodes.find(n=>n.role==='AXButton'&&n.title.startsWith('新工作任务'));
      if(!create) throw Error('无法定位新建画布入口');
      await click('AXButton',create.title);
      const command='chat_input_suggestion_create-canvas';
      const canvasOption=n=>n.identifier===command;
      const workComposer=n=>n.role==='AXTextArea'&&
        (/^发消息或创建任务/.test(normalized(n.value)) ||
         (background&&/^\/画布(?:搜索\.\.\.)?$/.test(normalized(n.value))));
      nodes=await waitFor(tree=>(tree.filter(workComposer).length===1 ||
        (background&&tree.some(canvasOption))) &&
        !tree.some(isCard),15000,'新工作任务输入框尚未就绪');
      if(background) {
        const input=nodes.find(workComposer);
        if(!nodes.some(canvasOption) && input) {
          await ax({action:'search-canvas',role:input.role,label:input.value});
          const notFound='斜杠搜索未找到画布入口';
          try {nodes=await waitFor(tree=>tree.filter(canvasOption).length===1,4000,notFound);}
          catch(error) {
            if(error.message!==notFound) throw error;
            nodes=await snapshot();
          }
        }
        if(!nodes.some(canvasOption)) {
          const skills=nodes.filter(n=>n.role==='AXPopUpButton'&&['技能','更多技能'].includes(n.title));
          if(skills.length!==1) throw Error('未找到唯一的技能菜单');
          await click(skills[0].role,skills[0].title);
          nodes=await waitFor(tree=>tree.filter(canvasOption).length===1,15000,'技能菜单中未找到画布入口');
        }
        if(accountOf(nodes)!==task.account_label || busy(nodes)) throw Error('打开画布前账号或生成状态发生变化');
        await click(nodes.find(canvasOption).role,command);
      } else {
        const input=nodes.find(workComposer);
        await ax({action:'fill',role:'AXTextArea',label:input.value,text:'创建新画布'});
        await waitFor(tree=>tree.some(n=>n.role==='AXTextArea'&&n.value==='创建新画布'));
        await ax({action:'create-canvas',role:'AXTextArea',label:'创建新画布'});
      }
      nodes=await waitFor(tree=>canvasOpen(tree)||tree.some(isCard),60000,'画布尚未打开');
    }
    if(link || !canvasOpen(nodes)) {
      const cards=nodes.filter(isCard);
      if(cards.length!==1) throw Error('画布入口不唯一，请手动打开自动化专用画布');
      await click('AXButton',cards[0].title);
      nodes=await waitFor(link?configuredCanvasOpen:canvasOpen);
    }
  }
  await report('writing_prompt');
  const title='豆包任务-'+task.id;
  if(selectedTitle(nodes)!==title) {
    const pending=nodes.filter(n=>n.role==='AXGroup'&&n.description==='等待生成视频').length;
    await click('AXCheckBox', '视频生成');
    await waitFor(tree => tree.filter(n=>n.role==='AXGroup'&&n.description==='等待生成视频').length>pending &&
      selectedTitle(tree)==='视频' && tree.some(n => n.role === 'AXTextArea' && n.value.trim() === '添加图片，描述你想生成的视频'),15000,'新视频节点尚未准备就绪');
    await ax({action:'title',role:'AXStaticText',label:'视频'});
    await waitFor(tree => tree.some(n=>n.role==='AXTextField'&&n.description==='编辑素材标题'),15000,'节点标题输入框未打开');
    await ax({action:'fill',role:'AXTextField',label:'编辑素材标题',text:title});
    if(selectedTitle(await snapshot())!==title) {
      try {await ax({action:'commit-title',role:'AXTextField',label:'编辑素材标题'});}
      catch(error) {if(error.matches!==0 || selectedTitle(await snapshot())!==title) throw error;}
    }
    await waitFor(tree => selectedTitle(tree) === title,15000,'节点任务编号未保存');
  }
  nodes=await snapshot();
  const input = promptInput(nodes,task.prompt) || nodes.find(n=>n.role==='AXTextArea'&&n.value.trim()==='添加图片，描述你想生成的视频');
  if(!input) throw Error('任务节点的提示词状态不明确');
  if(!promptInput(nodes,task.prompt)) await ax({action:'fill',role:'AXTextArea',label:input.value,text:task.prompt});
  nodes=await waitFor(tree => !!promptInput(tree,task.prompt),15000,'节点提示词写入后核对失败');
  const files=task.referenceFiles||[];
  const present=editorReferences(nodes,task.prompt);
  if(present.length>files.length || present.some((name,index)=>name!==path.basename(files[index])))
    throw Error('已上传参考图与任务快照不一致');
  if(files.length) await report('uploading_references',present.length,files.length);
  for(let index=present.length;index<files.length;index++) {
    const file=files[index];
    nodes=await snapshot();
    if(background) await ax({action:'upload',label:promptInput(nodes,task.prompt).value,files:[file]});
    else {
      await ax({action:'reference-menu',role:'AXTextArea',label:promptInput(nodes,task.prompt).value});
      await waitFor(tree=>tree.some(n=>n.role==='AXMenuItem'&&label(n)==='上传文件'));
      await click('AXMenuItem','上传文件');
      await waitFor(tree=>tree.some(n=>n.role==='AXButton'&&n.title==='取消'));
      await ax({action:'path-dialog'});
      await waitFor(tree=>tree.some(n=>n.identifier==='PathTextField'));
      await ax({action:'fill',role:'AXTextField',label:'PathTextField',text:file});
      await ax({action:'commit-path',role:'AXTextField',label:'PathTextField'});
      await waitFor(tree=>!tree.some(n=>n.identifier==='PathTextField'));
      await click('AXButton','打开');
    }
    await waitFor(tree=>tree.some(n=>n.role==='AXImage'&&label(n)===path.basename(file)) &&
      !tree.some(n=>n.role==='AXProgressIndicator'&&/upload/i.test(label(n))),60000);
    await report('uploading_references',index+1,files.length);
  }
  const expected=files.map(file=>path.basename(file));
  nodes=await snapshot();
  const actual=editorReferences(nodes,task.prompt);
  if(actual.length!==expected.length || actual.some((name,index)=>name!==expected[index]))
    throw Error('豆包参考图数量或顺序与图号映射不一致，禁止提交');
  await report('setting_parameters');
  await configure(task);
  return {account:task.account_label,prompt:task.prompt,title};
}
async function configure(task) {
  for(let attempt=0;attempt<3;attempt++) {
    try {await configureControls(task);return;}
    catch(error) {
      const transient=error.matches===0 || /参数面板未打开|模型选择菜单未打开|模型选择后核对失败/.test(error.message);
      if(!background || attempt===2 || !transient) throw error;
      const tree=await snapshot(),input=promptInput(tree,task.prompt);
      if(busy(tree) || !input || (task.id && selectedTitle(tree)!=='豆包任务-'+task.id)) throw error;
      await click('AXTextArea',input.value);
      await snapshot();
    }
  }
}
async function configureControls(task) {
  const ratio=task.ratio==='auto'?'自动':task.ratio;
  const duration=task.duration;
  let nodes=await snapshot();
  const model=task.model||DEFAULT_MODEL;
  if(model!==DEFAULT_MODEL) throw Error('本地豆包任务默认模型应为 '+DEFAULT_MODEL);
  if(!nodes.some(n=>n.role==='AXPopUpButton'&&n.title==='模型 '+model)) {
    const current=nodes.find(n=>n.role==='AXPopUpButton'&&n.title.startsWith('模型 '));
    if(!current) throw Error('找不到视频模型入口');
    if(!nodes.some(n=>n.role==='AXMenuItem'&&n.title.startsWith(model+' '))) await click('AXPopUpButton',current.title);
    nodes=await waitFor(tree=>tree.some(n=>n.role==='AXMenuItem'&&(n.title===model||n.title.startsWith(model+' '))),15000,'模型选择菜单未打开');
    const option=nodes.find(n=>n.role==='AXMenuItem'&&(n.title===model||n.title.startsWith(model+' ')));
    await click('AXMenuItem',option.title);
    nodes=await waitFor(tree=>tree.some(n=>n.role==='AXPopUpButton'&&n.title==='模型 '+model)&&
      !tree.some(n=>n.role==='AXMenu'&&n.title.startsWith('模型 ')),15000,'Fast 模型选择后核对失败');
  }
  const popup=nodes.find(n=>n.role==='AXPopUpButton'&&/^(自动|\d+:\d+) · \d+s$/.test(n.title));
  if(!popup) throw Error('视频参数入口未找到');
  if(popup.title===`${ratio} · ${duration}s`) {
    const input=promptInput(nodes,task.prompt);
    if(background&&input) {await click('AXTextArea',input.value);await snapshot();}
    return;
  }
  if(background || !nodes.some(n=>n.role==='AXButton'&&n.title===ratio)) await click('AXPopUpButton',popup.title);
  await waitFor(tree=>tree.some(n=>n.role==='AXButton'&&n.title===ratio)&&
    (!background||tree.some(n=>n.role==='AXPopUpButton'&&n.title===popup.title&&n.expanded)),15000,'视频参数面板未打开');
  await click('AXButton',ratio);
  nodes=await snapshot();
  const current=nodes.find(n=>n.role==='AXPopUpButton'&&n.title.startsWith(ratio+' · '));
  let seconds=Number(current?.title.match(/(\d+)s$/)?.[1]);
  if(!Number.isInteger(seconds)||!Number.isInteger(duration)||duration<4||duration>15) throw Error('视频时长无法核对');
  while(seconds!==duration) {
    const action=seconds<duration?'increment':'decrement';
    await ax({action,role:'AXSlider',label:''});
    seconds+=seconds<duration?1:-1;
    await waitFor(tree=>tree.some(n=>n.role==='AXPopUpButton'&&n.title===`${ratio} · ${seconds}s`));
  }
  nodes=await snapshot();
  const input=promptInput(nodes,task.prompt);
  if(!input) throw Error('参数设置后提示词无法核对');
  await click('AXTextArea',input.value);
  await waitFor(tree=>tree.some(n=>n.role==='AXPopUpButton'&&n.title===`${ratio} · ${duration}s`));
}
async function cancelPreparation() {
  let nodes=await snapshot();
  if(busy(nodes)) throw Error('检测到生成任务，保留账号锁供核对');
  if(background) {
    const input=nodes.filter(n=>n.role==='AXTextArea').at(-1);
    if(input) {await click('AXTextArea',input.value);await snapshot();}
    return;
  }
  if(nodes.some(n=>n.identifier==='PathTextField')) {
    await ax({action:'click',role:'AXButton',label:'CloseButton'});
    nodes=await waitFor(tree=>!tree.some(n=>n.identifier==='PathTextField'));
  }
  if(nodes.some(n=>n.identifier==='CancelButton')) {
    await ax({action:'click',role:'AXButton',label:'CancelButton'});
    nodes=await waitFor(tree=>!tree.some(n=>n.identifier==='open-panel'));
  }
  const menu=nodes.find(n=>n.role==='AXMenu'&&n.title.startsWith('模型 '));
  if(menu) {await click('AXPopUpButton',menu.title);await snapshot();}
}
function editorReferences(nodes,prompt) {
  let index=nodes.findIndex(n=>n===promptInput(nodes,prompt));
  if(index<0) return [];
  let images=[];
  while(nodes[index]?.parent!==null) {
    index=nodes[index].parent;
    const descendants=nodes.filter((_,child)=>{
      while(child!==null && child!==index) child=nodes[child]?.parent??null;
      return child===index;
    });
    if(descendants.some(n=>n.role==='AXToolbar'&&label(n)==='画布工具栏')) break;
    if(descendants.some(n=>n.role==='AXPopUpButton'&&n.title==='视频生成'))
      images=descendants.filter(n=>n.role==='AXImage'&&label(n)).map(label);
  }
  return images;
}
function selectedTitle(nodes) {
  return nodes.find(n=>{
    if(n.role!=='AXStaticText') return false;
    let parent=n.parent;
    while(parent!==null) {if(nodes[parent]?.help==='双击编辑标题') return true;parent=nodes[parent]?.parent??null;}
    return false;
  })?.value;
}
function selectedFailed(nodes) {
  const header=nodes.find(n=>n.help==='双击编辑标题');
  const frame=header && nodes[header.parent]?.bounds;
  if(!frame) return false;
  return nodes.some(n=>n.description==='视频生成失败' && n.bounds &&
    n.bounds.every((number,index)=>Math.abs(number-frame[index])<=2));
}
module.exports = { ax, snapshot, busy, accountOf, switchAccount, prepare, waitFor, click, selectedTitle, selectedFailed, hasVideoDownload, editorReferences, promptInput, configure, DEFAULT_MODEL, setGuard, cancelPreparation, useBackground, closeBackground };

if (require.main === module) {
  (async () => {
    if (process.argv[2] === 'inspect') {
      const nodes = await snapshot();
      console.log(JSON.stringify({account:accountOf(nodes),generating:busy(nodes),canvasReady:nodes.some(n=>n.role==='AXCheckBox'&&label(n)==='视频生成')},null,2));
    } else if (process.argv[2] === 'switch' && process.argv[3]) {
      await switchAccount(process.argv[3]);
      console.log(JSON.stringify({account:accountOf(await snapshot())}));
    } else throw Error('用法 node driver.cjs inspect | switch "账号名 组织名"');
  })().catch(error => { console.error(error.message); process.exitCode=1; });
}
