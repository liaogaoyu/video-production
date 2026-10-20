// Run as the same OS user and with the same environment as API / Worker.
const {chromium}=require('../vendor/jimeng-api/node_modules/playwright-core');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.STORYDOCK_BROWSER_EXECUTABLE?{executablePath:process.env.STORYDOCK_BROWSER_EXECUTABLE}:{})});
 try {const page=await browser.newPage();await page.setContent('<title>StoryDock browser check</title>');if(await page.title()!=='StoryDock browser check')throw Error('Browser page failed');console.log('Chromium headless runtime OK (network/login/generation not tested)');}
 finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
