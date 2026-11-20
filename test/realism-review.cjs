const {chromium}=require('playwright-core');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Users/user/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',args:['--no-sandbox','--use-angle=metal','--ignore-gpu-blocklist']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});page.setDefaultTimeout(120000);
 page.on('pageerror',e=>console.log('ERROR',e.message));
 await page.goto('http://127.0.0.1:4175');await page.waitForFunction(()=>window.__forest,{timeout:120000});await page.waitForTimeout(1500);
 const cases=[
  ['deer-side','deer',.9,.10,4.8],['deer-front','deer',-.85,.13,4.5],['squirrel-side','squirrel',.9,.08,1.55],['bird-side','bird',.5,.08,1.3]
 ];
 for(const [name,species,yaw,pitch,distance]of cases){
  await page.evaluate(({species,yaw,pitch,distance})=>{__forest.observe(species);const o=__forest.observer;o.yaw=yaw;o.pitch=pitch;o.distance=distance;o.update(1,true);__forest.wildlife.update();}, {species,yaw,pitch,distance});
  await page.waitForTimeout(150);
  await page.screenshot({path:`/Users/user/Documents/personal/autumn-forest/test/review-${name}.png`,timeout:120000});
  console.log(name,await page.evaluate(()=>({gl:__forest.renderer.gl.getError(),camera:__forest.observer.position,target:__forest.observer.target.position})));
 }
 await page.evaluate(()=>{__forest.leaveObserver();});await page.waitForTimeout(200);await page.screenshot({path:'/Users/user/Documents/personal/autumn-forest/test/review-forest.png',timeout:120000});
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
