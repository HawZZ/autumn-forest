const {chromium}=require('playwright-core');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Users/user/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',args:['--no-sandbox','--use-angle=metal','--ignore-gpu-blocklist']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto('https://momcozy-app.github.io/autumn-forest/',{waitUntil:'networkidle',timeout:120000});
  await page.waitForFunction(()=>window.__forest,{timeout:120000});await page.waitForTimeout(1500);
  const result=await page.evaluate(()=>({title:document.title,frames:__forest.renderer.frameCounter,glError:__forest.renderer.gl.getError(),trees:__forest.world.trees.map(trees=>trees.length),page:location.href}));
  if(errors.length||result.glError||result.frames<2)throw new Error(JSON.stringify({errors,result}));
  console.log(JSON.stringify({passed:true,errors,...result},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
