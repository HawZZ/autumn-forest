const {chromium}=require('playwright-core');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Users/user/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',args:['--no-sandbox','--use-angle=metal','--ignore-gpu-blocklist']});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:800}});page.setDefaultTimeout(120000);
 const errors=[];page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errors.push(m.text());});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4174');await page.waitForFunction(()=>window.__forest,{timeout:120000});await page.waitForTimeout(1400);
 await page.evaluate(()=>{document.getElementById('enter-button').click();__forest.player.bobEnabled=false;});
 const samples=[];
 for(let i=0;i<5;i++){
  await page.keyboard.down('w');await page.keyboard.down('Shift');await page.mouse.move(640+i*18,400);
  await page.waitForTimeout(1100);await page.keyboard.up('w');await page.keyboard.up('Shift');
  await page.screenshot({path:`/Users/user/Documents/personal/autumn-forest/test/motion-${i}.png`,timeout:120000});
  samples.push(await page.evaluate(()=>({position:__forest.player.position,fps:__forest.renderer.lastFPS,triangles:__forest.renderer.triangles,scale:__forest.renderer.renderScale,gl:__forest.renderer.gl.getError()})));
 }
 console.log(JSON.stringify({errors,samples},null,2));fs.writeFileSync('/Users/user/Documents/personal/autumn-forest/test/motion-validation.json',JSON.stringify({errors,samples},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
