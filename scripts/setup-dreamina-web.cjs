const {spawnSync}=require('node:child_process'),path=require('node:path');
const directory=path.resolve(__dirname,'../vendor/jimeng-api');
for(const [cmd,args] of [[process.platform==='win32'?'npm.cmd':'npm',['ci','--omit=dev','--no-audit','--no-fund']],[process.execPath,[path.join(directory,'node_modules/playwright-core/cli.js'),'install',...(process.argv.includes('--with-deps')?['--with-deps']:[]),'chromium']]]){
 const r=spawnSync(cmd,args,{cwd:directory,stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);
}
console.log('国际网页视频运行环境已安装。Linux系统运行库请在镜像构建阶段安装。');
