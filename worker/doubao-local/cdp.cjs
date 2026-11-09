class DoubaoConnection {
  constructor(endpoint='http://127.0.0.1:9227') {
    const url=new URL(endpoint);
    if(url.protocol!=='http:' || url.hostname!=='127.0.0.1' || url.username || url.password)
      throw Error('豆包调试接口必须仅连接本机127.0.0.1');
    this.endpoint=url.origin;
    this.pending=new Map();
    this.events=new Map();
    this.sequence=0;
  }
  async connect() {
    if(this.socket?.readyState===WebSocket.OPEN) return;
    if(this.connecting) return this.connecting;
    this.connecting=(async()=>{
      const response=await fetch(this.endpoint+'/json/list',{signal:AbortSignal.timeout(5000),redirect:'error'});
      if(!response.ok) throw Object.assign(Error('无法读取豆包调试页面'),{retryable:true});
      const pages=await response.json();
      const page=pages.find(p=>p.type==='page'&&/^(doubao|chrome):\/\/doubao-chat\/chat(?:[/?#]|$)/.test(p.url));
      if(!page) throw Object.assign(Error('豆包聊天页面尚未就绪'),{retryable:true});
      const target=new URL(page.webSocketDebuggerUrl);
      if(target.protocol!=='ws:' || target.hostname!=='127.0.0.1' || target.port!==new URL(this.endpoint).port)
        throw Error('豆包调试页面地址不属于已授权的本机接口');
      const socket=new WebSocket(target.href);
      socket.addEventListener('message',event=>{
        const message=JSON.parse(event.data);
        if(message.method) {
          for(const listener of this.events.get(message.method)||[]) listener(message.params);
          return;
        }
        const request=this.pending.get(message.id);
        if(!request) return;
        this.pending.delete(message.id);clearTimeout(request.timer);
        if(message.error) request.reject(Error(message.error.message));
        else request.resolve(message.result);
      });
      socket.addEventListener('close',()=>{
        for(const request of this.pending.values()) {clearTimeout(request.timer);request.reject(Object.assign(Error('豆包调试连接已断开'),{retryable:true}));}
        this.pending.clear();
      });
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{socket.close();reject(Error('连接豆包调试接口超时'));},5000);
        socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
        socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('连接豆包调试接口失败'));},{once:true});
      });
      this.socket=socket;
    })();
    try {await this.connecting;} finally {this.connecting=null;}
  }
  async send(method,params={}) {
    await this.connect();
    const id=++this.sequence;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('豆包后台操作超时 '+method));},15000);
      this.pending.set(id,{resolve,reject,timer});
      this.socket.send(JSON.stringify({id,method,params}));
    });
  }
  async evaluate(expression) {
    const response=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text);
    return response.result.value;
  }
  event(method,timeout=15000) {
    return new Promise((resolve,reject)=>{
      const listeners=this.events.get(method)||new Set();
      this.events.set(method,listeners);
      const listener=params=>{clearTimeout(timer);listeners.delete(listener);resolve(params);};
      const timer=setTimeout(()=>{listeners.delete(listener);reject(Error('等待豆包页面事件超时 '+method));},timeout);
      listeners.add(listener);
    });
  }
  async callNode(backendNodeId,fn,args=[]) {
    const resolved=await this.send('DOM.resolveNode',{backendNodeId});
    const objectId=resolved.object.objectId;
    try {
      const response=await this.send('Runtime.callFunctionOn',{
        objectId,functionDeclaration:fn.toString(),arguments:args.map(value=>({value})),
        returnByValue:true,awaitPromise:true,userGesture:true,
      });
      if(response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text);
      return response.result.value;
    } finally {await this.send('Runtime.releaseObject',{objectId}).catch(()=>{});}
  }
  close() {this.socket?.close();}
}
module.exports={DoubaoConnection};
