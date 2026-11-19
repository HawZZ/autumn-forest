const {chromium}=require('playwright-core');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Users/user/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',args:['--no-sandbox','--use-angle=metal','--ignore-gpu-blocklist']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});page.setDefaultTimeout(120000);
 const errors=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4174');await page.waitForFunction(()=>window.__forest,{timeout:120000});await page.waitForTimeout(1500);
 await page.screenshot({path:'/Users/user/Documents/personal/autumn-forest/preview.png',timeout:120000});
 await page.evaluate(()=>{document.getElementById('enter-button').click();__forest.goToView('path');});
 await page.keyboard.down('w');await page.keyboard.down('Shift');await page.waitForTimeout(5000);await page.keyboard.up('w');await page.keyboard.up('Shift');
 const stats=await page.evaluate(()=>{const {renderer:r,player:p}=__forest;const info=r.gl.getExtension('WEBGL_debug_renderer_info');return{gpu:r.gl.getParameter(info.UNMASKED_RENDERER_WEBGL),fps:r.lastFPS,drawCalls:r.drawCalls,triangles:r.triangles,frames:r.frameCounter,renderScale:r.renderScale,position:p.position,distance:p.distance,glError:r.gl.getError()};});
 if(errors.length||stats.glError)throw new Error('Rendering validation failed '+JSON.stringify({errors,stats}));
 if(stats.distance<10)throw new Error('Roaming input did not advance');
 stats.passed=true;stats.viewport=[1440,900];stats.note='Single-machine hardware measurement, not a universal FPS guarantee.';
 console.log(JSON.stringify({errors,...stats},null,2));fs.writeFileSync('/Users/user/Documents/personal/autumn-forest/test/hardware-validation.json',JSON.stringify({errors,...stats},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
