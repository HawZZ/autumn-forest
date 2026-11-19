const {chromium}=require('playwright-core');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Users/user/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',args:['--no-sandbox','--use-angle=metal','--ignore-gpu-blocklist']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});page.setDefaultTimeout(120000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:4174');await page.waitForFunction(()=>window.__forest,{timeout:120000});await page.waitForTimeout(1300);
 await page.screenshot({path:'/Users/user/Documents/personal/autumn-forest/preview.png',timeout:120000});
 await page.click('#help-button');const helpOpen=await page.$eval('#help-dialog',e=>e.open);await page.click('#close-help');
 await page.click('#settings-button');await page.selectOption('#quality','balanced');await page.locator('#wind').fill('65');await page.locator('#volume').uncheck();await page.locator('#reflections').uncheck();
 const settings=await page.evaluate(()=>({quality:__forest.renderer.quality,volume:__forest.renderer.volume,reflections:__forest.renderer.reflections,wind:__forest.renderer.wind}));
 await page.locator('#volume').check();await page.locator('#reflections').check();await page.locator('#quality').selectOption('auto');await page.click('#close-settings');
 await page.click('#audio-button');const audio=await page.$eval('#audio-button',e=>e.getAttribute('aria-pressed'));await page.click('#audio-button');
 await page.evaluate(()=>{__forest.goToView('creek');document.getElementById('enter-button').click();});await page.waitForTimeout(700);
 await page.screenshot({path:'/Users/user/Documents/personal/autumn-forest/test/creek-final.png',timeout:120000});
 await page.evaluate(()=>{__forest.pauseRendering();});
 const physics=await page.evaluate(()=>{
  const {player:p,world:w}=__forest,results={};
  const tree=w.trees[0][0];p.teleport({x:tree.position[0],z:tree.position[2]+2.5,yaw:0,pitch:0});p.input.forward=1;
  let closest=Infinity;
  for(let i=0;i<500;i++){p.update(1/120,i/120);closest=Math.min(closest,Math.hypot(p.position[0]-tree.position[0],p.position[2]-tree.position[2]));}
  results.tree={position:p.position,center:tree.position,distance:Math.hypot(p.position[0]-tree.position[0],p.position[2]-tree.position[2]),closest};
  p.input.forward=0;p.input.jump=true;p.update(1/120,5);p.input.jump=false;let height=0;
  for(let i=0;i<200;i++){p.update(1/120,6+i/120);height=Math.max(height,p.position[1]-w.height(p.position[0],p.position[2]));}results.jump={height,grounded:p.grounded};
  p.teleport({x:w.creekX(12),z:12,yaw:0,pitch:0});p.inWater=true;p.step(10);results.water={ripple:Array.from(p.ripples.slice(0,4)),events:p.stepEvents};
  return results;
 });
 const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});mobile.setDefaultTimeout(120000);
 mobile.on('pageerror',e=>errors.push('mobile '+e.message));mobile.on('console',m=>{if(m.type()==='error')errors.push('mobile '+m.text());});
 await mobile.goto('http://127.0.0.1:4174');await mobile.waitForFunction(()=>window.__forest,{timeout:120000});await mobile.waitForTimeout(1300);
 await mobile.screenshot({path:'/Users/user/Documents/personal/autumn-forest/test/mobile-entry.png',timeout:120000});
 await mobile.tap('#enter-button');await mobile.waitForTimeout(300);
 const client=await mobile.context().newCDPSession(mobile);
 const before=await mobile.evaluate(()=>({yaw:__forest.player.yaw,position:__forest.player.position}));
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:74,y:665,id:1},{x:285,y:570,id:2}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:74,y:635,id:1},{x:335,y:570,id:2}]});
 await mobile.waitForTimeout(1000);
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const after=await mobile.evaluate(()=>({yaw:__forest.player.yaw,position:__forest.player.position}));
 await mobile.screenshot({path:'/Users/user/Documents/personal/autumn-forest/test/mobile-walk.png',timeout:120000});
 await mobile.tap('#settings-button');await mobile.screenshot({path:'/Users/user/Documents/personal/autumn-forest/test/mobile-settings.png',timeout:120000});
 const filePage=await browser.newPage({viewport:{width:900,height:650}});filePage.setDefaultTimeout(120000);filePage.on('pageerror',e=>errors.push('file '+e.message));
 await filePage.goto('file:///Users/user/Documents/personal/autumn-forest/index.html');await filePage.waitForFunction(()=>window.__forest,{timeout:120000});
 const fileReady=await filePage.evaluate(()=>!!window.__forest);
 const report={errors,helpOpen,settings,audio,physics,touch:{before,after},fileReady,gl:await page.evaluate(()=>__forest.renderer.gl.getError())};
 if(errors.length)throw new Error('Browser errors: '+errors.join('; '));
 if(report.gl!==0)throw new Error('WebGL error '+report.gl);
 if(!helpOpen||audio!=='true'||!fileReady)throw new Error('UI or offline loading failed');
 if(settings.volume!==false||settings.reflections!==false||settings.quality!=='balanced')throw new Error('Settings did not apply');
 if(physics.tree.closest<.75||physics.tree.closest>.88)throw new Error('Tree collision failed '+physics.tree.closest);
 if(!physics.jump.grounded||physics.jump.height<2.1||physics.jump.height>2.7)throw new Error('Jump failed');
 if(physics.water.ripple[3]!==1)throw new Error('Water ripple missing');
 if(Math.abs(after.yaw-before.yaw)<.1||Math.hypot(after.position[0]-before.position[0],after.position[2]-before.position[2])<.4)throw new Error('Two-finger touch movement failed');
 report.passed=true;
 fs.writeFileSync('/Users/user/Documents/personal/autumn-forest/test/final-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
