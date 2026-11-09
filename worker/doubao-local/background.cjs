const {DoubaoConnection}=require('./cdp.cjs');
const label=node=>node.title||node.description||node.value;

function descendants(nodes,parent) {
  return nodes.filter((node,index)=>{
    while(index!==null && index!==parent) index=nodes[index].parent;
    return index===parent;
  });
}
function mapRole(node) {
  const props=Object.fromEntries((node.properties||[]).map(p=>[p.name,p.value.value]));
  const role=node.role?.value;
  if(props.editable && props.focusable) return props.editable==='richtext'?'AXTextArea':'AXTextField';
  if(role==='button') return props.hasPopup&&props.hasPopup!=='false'?'AXPopUpButton':props.pressed!==undefined?'AXCheckBox':'AXButton';
  return {StaticText:'AXStaticText',image:'AXImage',menu:'AXMenu',menuitem:'AXMenuItem',
    menuitemradio:'AXMenuItem',menuitemcheckbox:'AXMenuItem',toolbar:'AXToolbar',link:'AXLink',
    slider:'AXSlider',progressbar:'AXProgressIndicator',checkbox:'AXCheckBox',textbox:'AXTextField',tab:'AXTab'}[role]||'AXGroup';
}

class BackgroundAdapter {
  constructor(endpoint) {this.connection=new DoubaoConnection(endpoint);}
  async snapshot() {
    const {nodes:raw}=await this.connection.send('Accessibility.getFullAXTree');
    const byId=new Map(raw.map(node=>[node.nodeId,node]));
    const result=[],visited=new Set();
    function walk(id,parent) {
      if(visited.has(id)) return;
      visited.add(id);
      const source=byId.get(id);
      if(!source) return;
      if(source.ignored || source.role?.value==='InlineTextBox') {
        for(const child of source.childIds||[]) walk(child,parent);
        return;
      }
      const role=mapRole(source),name=source.name?.value||'',description=source.description?.value||'';
      const index=result.length;
      const title=['AXButton','AXPopUpButton','AXMenu','AXMenuItem'].includes(role)?name:'';
      result.push({parent,role,title,description:title?'':name,help:description,identifier:'',
        value:role==='AXStaticText'?name:String(source.value?.value??''),backendNodeId:source.backendDOMNodeId,
        selected:source.properties?.find(p=>p.name==='selected')?.value.value===true,
        popupType:source.properties?.find(p=>p.name==='hasPopup')?.value.value,
        expanded:source.properties?.find(p=>p.name==='expanded')?.value.value===true});
      for(const child of source.childIds||[]) walk(child,index);
    }
    for(const node of raw.filter(n=>!n.parentId)) walk(node.nodeId,null);
    for(const node of result) {
      if(node.role==='AXTextArea'&&node.backendNodeId) {
        const text=await this.connection.callNode(node.backendNodeId,function(){return this.innerText.trim()?this.innerText:this.querySelector('[data-placeholder]')?.getAttribute('data-placeholder')||this.innerText;});
        node.value=text;
      }
      if(node.role==='AXTextField' && node.backendNodeId) {
        const info=await this.connection.callNode(node.backendNodeId,function(){return {label:this.getAttribute('aria-label')||this.getAttribute('placeholder')||'',value:this.value||''};});
        node.description=info.label||node.description;node.value=info.value;
      }
      if(node.backendNodeId && ['AXButton','AXGroup','AXMenuItem'].includes(node.role) &&
         /^(创建|打开)画布(?:\s|$)/.test(label(node))) {
        node.identifier=await this.connection.callNode(node.backendNodeId,function(){
          const legacy=this.getAttribute('data-testid')==='chat_input_suggestion_create-canvas';
          const current=this.closest('[data-testid="skill-panel-v2"]') &&
            this.getAttribute('data-suggestion-key')==='["client-custom","create-canvas"]';
          return legacy || current
            ? 'chat_input_suggestion_create-canvas' : '';
        });
      }
      if(node.help==='双击编辑标题' && node.parent!==null) await this.addBounds(result[node.parent]);
      if(node.description==='视频生成失败' || (node.role==='AXPopUpButton'&&!label(node))) await this.addBounds(node);
    }
    return result;
  }
  async addBounds(node) {
    if(!node.backendNodeId) return;
    node.bounds=await this.connection.callNode(node.backendNodeId,function(){const e=this.nodeType===3?this.parentElement:this;const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height];});
  }
  select(nodes,request) {
    let matches=nodes.filter(node=>node.role===request.role&&[node.title,node.description,node.value,node.identifier].includes(request.label));
    if(request.action==='title') {
      const headers=nodes.map((node,index)=>({node,index})).filter(item=>item.node.help==='双击编辑标题');
      matches=headers.map(item=>descendants(nodes,item.index).find(node=>node.role==='AXStaticText'&&node.backendNodeId)).filter(Boolean);
    }
    if(['submit','reference-menu'].includes(request.action)) {
      const index=nodes.findIndex(node=>node.role==='AXTextArea'&&node.value===request.label);
      if(index<0) throw Error('找不到本任务的后台提示词输入框');
      let parent=nodes[index].parent;
      matches=[];
      while(parent!==null) {
        const children=descendants(nodes,parent);
        const control=children.find(node=>node.role==='AXPopUpButton'&&node.title==='视频生成');
        if(control) {
          if(request.action==='reference-menu') matches=children.filter(node=>node.role==='AXPopUpButton'&&!label(node)&&node.bounds?.[2]>=8&&node.bounds?.[3]>=8);
          else {
            let ancestor=control.parent;
            while(ancestor!==null) {
              matches=descendants(nodes,ancestor).filter(node=>node.role==='AXButton');
              if(matches.length || ancestor===parent) break;
              ancestor=nodes[ancestor].parent;
            }
          }
          break;
        }
        parent=nodes[parent].parent;
      }
    }
    if(matches.length!==1 || !matches[0].backendNodeId)
      throw Object.assign(Error('后台控件必须唯一，当前匹配 '+matches.length+' 个'),{matches:matches.length});
    return matches[0];
  }
  async perform(request) {
    if(request.action==='snapshot') return this.snapshot();
    if(request.action==='canvas-node') {
      return this.connection.evaluate(`(title => {
        const headers=document.querySelectorAll('[title="双击编辑标题"]');
        if(headers.length!==1 || headers[0].firstElementChild?.textContent!==title) return null;
        const selected=document.querySelectorAll('.react-flow__node.selected[data-id]');
        return selected.length===1 ? selected[0].dataset.id : null;
      })(${JSON.stringify(request.title)})`);
    }
    if(request.action==='canvas-rejected') {
      return this.connection.evaluate(`(id => {
        const matches=[...document.querySelectorAll('.react-flow__node[data-id]')]
          .filter(node=>node.dataset.id===id && node.getClientRects().length);
        if(matches.length!==1 || matches[0].querySelector('video')) return false;
        const card=matches[0].querySelector('[data-canvas-generation-state]');
        return !!card?.innerText.split('\\n').some(line=>line.trim()==='审核不通过');
      })(${JSON.stringify(request.id)})`);
    }
    if(request.action==='select-canvas-node') {
      return this.connection.evaluate(`(id => {
        const nodes=[...document.querySelectorAll('.react-flow__node[data-id]')]
          .filter(node=>node.dataset.id===id && node.getClientRects().length);
        if(nodes.length!==1) return false;
        if(!nodes[0].classList.contains('selected')) nodes[0].click();
        return true;
      })(${JSON.stringify(request.id)})`);
    }
    if(request.action==='upload') return this.upload(request);
    if(['path-dialog','commit-path'].includes(request.action)) throw Error('后台执行器使用直接文件上传');
    let target;
    for(let attempt=0;attempt<30;attempt++) {
      const nodes=await this.snapshot();
      try {target=this.select(nodes,request);}
      catch(error) {if(error.matches!==0 || attempt===29)throw error;}
      if(target) {
        const live=await this.connection.callNode(target.backendNodeId,function(){
          const e=this.nodeType===3?this.parentElement:this;
          return !!e?.isConnected && !!e.getClientRects().length && !e.disabled &&
            e.getAttribute('aria-disabled')!=='true' && e.getAttribute('data-loading')!=='true' &&
            !e.closest('[aria-hidden="true"],[hidden],[inert]');
        }).catch(()=>false);
        if(live) break;
        target=null;
      }
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    if(!target) throw Error('后台控件仍在刷新，已停止操作');
    if(request.action==='search-canvas') {
      const draft=await this.connection.callNode(target.backendNodeId,function(){
        const text=this.innerText.trim();
        if(!this.isContentEditable || (text && text!=='/画布')) return null;
        this.focus();
        if(document.activeElement!==this) return null;
        if(text) {
          const range=document.createRange();
          range.selectNodeContents(this);
          const selection=getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        }
        return text;
      });
      if(draft===null) throw Error('新工作任务输入框有其他内容，无法搜索画布');
      const keypress=async (key,text)=> {
        await this.connection.send('Input.dispatchKeyEvent',{type:'keyDown',...key,...text});
        await this.connection.send('Input.dispatchKeyEvent',{type:'keyUp',...key});
      };
      if(draft) await keypress({key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8,nativeVirtualKeyCode:51});
      await keypress({key:'/',code:'Slash',windowsVirtualKeyCode:191,nativeVirtualKeyCode:44},{text:'/',unmodifiedText:'/'});
      await this.connection.send('Input.insertText',{text:'画布'});
    } else if(request.action==='fill') {
      await this.connection.callNode(target.backendNodeId,function(text){
        const e=this.nodeType===3?this.parentElement:this;
        if(e.isContentEditable) {
          e.focus();const range=document.createRange();range.selectNodeContents(e);
          const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
          if(!document.execCommand('insertText',false,text)) throw Error('后台文本输入失败');
        } else {
          const prototype=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(prototype,'value').set.call(e,text);
          e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));
        }
      },[request.text]);
    } else if(['commit-title','create-canvas','increment','decrement'].includes(request.action)) {
      const key={increment:'ArrowRight',decrement:'ArrowLeft'}[request.action]||'Enter';
      await this.connection.callNode(target.backendNodeId,function(key){
        const e=this.nodeType===3?this.parentElement:this;e.focus();
        const code={Enter:13,ArrowRight:39,ArrowLeft:37}[key];
        for(const type of ['keydown','keyup']) e.dispatchEvent(new KeyboardEvent(type,{key,code:key,keyCode:code,which:code,bubbles:true,cancelable:true}));
      },[key]);
    } else if(['click','press','submit','title','reference-menu'].includes(request.action)) {
      const clicked=await this.connection.callNode(target.backendNodeId,function(double,popup,canvasNodeId,canvasNodeTitle,referenceMenu){
        const e=this.nodeType===3?this.parentElement:this;
        if(referenceMenu && e.closest('[data-slot="dropdown-menu-trigger"]')?.getAttribute('aria-expanded')==='true')
          return true;
        if(canvasNodeId) {
          const selected=document.querySelectorAll('.react-flow__node.selected[data-id]');
          const headers=document.querySelectorAll('[title="双击编辑标题"]');
          if(!e.isConnected || selected.length!==1 || selected[0].dataset.id!==canvasNodeId ||
             headers.length!==1 || headers[0].firstElementChild?.textContent!==canvasNodeTitle) return false;
        }
        if(double) {e.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true,button:0,detail:2}));return;}
        if(popup) {
          const r=e.getBoundingClientRect(),position={clientX:r.x+r.width/2,clientY:r.y+r.height/2};
          e.dispatchEvent(new PointerEvent('pointerdown',{...position,bubbles:true,cancelable:true,button:0,buttons:1,pointerType:'mouse'}));
          e.dispatchEvent(new MouseEvent('mousedown',{...position,bubbles:true,cancelable:true,button:0,buttons:1}));
          e.dispatchEvent(new PointerEvent('pointerup',{...position,bubbles:true,cancelable:true,button:0,pointerType:'mouse'}));
          e.dispatchEvent(new MouseEvent('mouseup',{...position,bubbles:true,cancelable:true,button:0}));
        }
        e.click();
        return true;
      },[request.action==='title',target.role==='AXTextArea'||(target.role==='AXPopUpButton'&&target.popupType==='menu')||
        target.identifier==='chat_input_suggestion_create-canvas',
        request.canvasNodeId||null,request.canvasNodeTitle||null,request.action==='reference-menu']);
      if(clicked===false) throw Object.assign(Error('下载前选中节点发生变化，稍后重试'),{retryable:true});
    } else throw Error('不支持的后台操作 '+request.action);
    return {ok:true};
  }
  async upload(request) {
    await this.connection.send('Page.enable');
    await this.connection.send('Page.setInterceptFileChooserDialog',{enabled:true});
    try {
      let option;
      for(let attempt=0;attempt<3 && !option;attempt++) {
        await this.perform({action:'reference-menu',role:'AXTextArea',label:request.label});
        for(let poll=0;poll<20;poll++) {
          option=(await this.snapshot()).find(node=>node.role==='AXMenuItem'&&node.title==='上传文件');
          if(option) break;
          await new Promise(resolve=>setTimeout(resolve,100));
        }
      }
      if(!option) throw Error('后台参考图上传入口未找到');
      const opened=this.connection.event('Page.fileChooserOpened');opened.catch(()=>{});
      await this.perform({action:'click',role:'AXMenuItem',label:'上传文件'});
      const chooser=await opened;
      if(!chooser.backendNodeId) throw Error('豆包未提供可直接上传的文件输入框');
      await this.connection.send('DOM.setFileInputFiles',{files:request.files,backendNodeId:chooser.backendNodeId});
    } finally {await this.connection.send('Page.setInterceptFileChooserDialog',{enabled:false}).catch(()=>{});}
    return {ok:true};
  }
  close() {this.connection.close();}
}
module.exports={BackgroundAdapter,mapRole};
