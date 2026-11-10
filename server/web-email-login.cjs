// Only automate the normal login form. Verification and consent remain visible
// in the existing remote browser; no credentials are returned or logged.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function visible(page, makeLocator) {
  for (const frame of page.frames()) {
    try {
      const locator = makeLocator(frame).first();
      if (await locator.isVisible()) return locator;
    } catch {}
  }
  return null;
}
async function waitFor(page, makeLocator, {cancelled, delay, attempts=45}) {
  for (let i=0;i<attempts;i++) {
    if(cancelled()) throw Error('cancelled');
    const locator=await visible(page,makeLocator);
    if(locator)return locator;
    await delay(500);
  }
  return null;
}
async function observeLogin(page) {
  const bodies=[];
  for(const frame of page.frames()) {try{bodies.push(await frame.locator('body').innerText({timeout:1000}));}catch{}}
  const text=bodies.join('\n');
  if(/incorrect (?:email|password|account)|invalid (?:email|password|account)|wrong password|account (?:does not|doesn't) exist|too many (?:attempts|requests)|密码错误|账号或密码错误/i.test(text))return {status:'failed',message:'官网拒绝登录，请检查邮箱密码或稍后重试'};
  const challenge=await visible(page,f=>f.locator('input[autocomplete="one-time-code"], input[name="code"], input[placeholder*="code" i], iframe[src*="captcha"]'));
  if(challenge || /verify your email|enter (?:the )?(?:verification|security) code|check your email|security verification|slide to verify|complete the puzzle|验证码|人机验证/i.test(text))return {status:'needs_verification',message:'官网要求验证码或安全验证，请在下方服务端窗口完成，系统会自动继续'};
  const consent=await visible(page,f=>f.getByRole('checkbox',{name:/agree|同意/i}));
  if(consent)return {status:'needs_confirmation',message:'官网要求确认条款，请在下方服务端窗口查看并自行确认'};
  return {status:'running',message:'正在等待官网登录结果'};
}
async function runEmailLogin({page,email,password,authenticated,cancelled=()=>false,onStage=()=>{},delay=sleep}) {
  const options={cancelled,delay};
  try {
    if(await authenticated())return {status:'authenticated'};
    onStage('正在打开邮箱登录');
    let emailField;
    for(let attempt=0;attempt<2;attempt++) {
      if(cancelled())return {status:'cancelled'};
      emailField=await visible(page,f=>f.getByPlaceholder('Enter email',{exact:true}));
      if(!emailField) {
        const signIn=await waitFor(page,f=>f.getByRole('button',{name:/^Sign in(?: Free credits)?$/i}),{...options,attempts:30});
        if(signIn)await signIn.click({timeout:10000});
        const emailButton=await waitFor(page,f=>f.getByText('Continue with email',{exact:true}),{...options,attempts:20});
        if(emailButton)await emailButton.click({timeout:10000});
        emailField=await waitFor(page,f=>f.getByPlaceholder('Enter email',{exact:true}),{...options,attempts:20});
      }
      if(emailField)break;
      if(await authenticated())return {status:'authenticated'};
      if(attempt===0){onStage('登录弹窗加载失败，正在通过服务器代理重新加载');await page.reload({waitUntil:'domcontentloaded',timeout:60000});}
    }
    if(!emailField)return {status:'manual',message:'官网邮箱登录窗口未能加载，可在服务端窗口继续；系统没有提交密码'};
    const passwordField=await waitFor(page,f=>f.getByPlaceholder('Enter password',{exact:true}),options);
    if(!passwordField)return {status:'manual',message:'官网登录表单已变化，请在服务端窗口继续'};
    if(cancelled())return {status:'cancelled'};
    onStage('正在填写邮箱和密码');
    await emailField.fill(email,{timeout:10000});await passwordField.fill(password,{timeout:10000});
    const submit=await waitFor(page,f=>f.getByRole('button',{name:'Continue',exact:true}),options);
    if(!submit)return {status:'manual',message:'官网登录按钮未就绪，请在服务端窗口继续'};
    if(cancelled())return {status:'cancelled'};
    onStage('正在提交登录');
    await submit.click({timeout:10000});
    // After submission we only observe; never repeat an uncertain password request.
    for(let i=0;i<60;i++) {
      if(cancelled())return {status:'cancelled'};
      if(await authenticated())return {status:'authenticated'};
      const result=await observeLogin(page);
      if(result.status!=='running')return result;
      await delay(1000);
    }
    return {status:'manual',message:'官网登录结果尚未确认，请在服务端窗口检查；不会重复提交密码'};
  }catch {
    return cancelled()?{status:'cancelled'}:{status:'manual',message:'自动登录未完成，请在服务端窗口继续；不会重复提交密码'};
  }finally{password='';}
}
module.exports={runEmailLogin,observeLogin};
