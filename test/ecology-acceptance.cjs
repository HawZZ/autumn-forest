const {chromium}=require('playwright-core');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Users/user/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',args:['--no-sandbox','--use-angle=metal','--ignore-gpu-blocklist']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(120000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:4175');await page.waitForFunction(()=>window.__forest,{timeout:120000});await page.waitForTimeout(1500);
 const result={errors,checks:{}};
 for(const species of ['deer','squirrel','bird']){
  await page.evaluate(species=>__forest.observe(species),species);await page.waitForTimeout(700);
  await page.screenshot({path:`/Users/user/Documents/personal/autumn-forest/test/observed-${species}.png`,timeout:120000});
  result.checks[species]=await page.evaluate(()=>({active:__forest.observer.active,species:__forest.observer.species,distance:__forest.observer.distanceActual,position:__forest.observer.position,state:__forest.observer.target.state,gl:__forest.renderer.gl.getError()}));
 }
 const behavior=await page.evaluate(()=>{
  const {ecology:e,player:p,observer:o}=__forest;
  const playerBefore=JSON.stringify({position:p.position,yaw:p.yaw,pitch:p.pitch});
  const bird=e.bySpecies('bird')[4],squirrel=e.bySpecies('squirrel')[0],deer=e.bySpecies('deer')[0];
  const states=[],positions=[];
  e.time=e.dayDuration*.71;
  for(let i=0;i<1200;i++){e.update(.05);if(i%100===0){states.push(bird.state);positions.push([...bird.position]);}}
  const distance=Math.hypot(...bird.position.map((v,i)=>v-bird.home.position[i]));
  const roost=bird.state==='roost';
  e.time=e.dayDuration*1.05;
  let leaves=false,maxNestDistance=0;
  for(let i=0;i<250;i++){e.update(.05);if(bird.state==='leave'||bird.state==='fly')leaves=true;maxNestDistance=Math.max(maxNestDistance,Math.hypot(...bird.position.map((v,j)=>v-bird.home.position[j])));}
  const animalBefore=JSON.stringify({position:deer.position,state:deer.state});
  o.update(.016);const playerAfter=JSON.stringify({position:p.position,yaw:p.yaw,pitch:p.pitch});
  p.teleport({x:deer.position[0]+1,z:deer.position[2]+1,yaw:0,pitch:0});p.input.forward=1;p.input.sprint=true;
  for(let i=0;i<30;i++)e.update(.1);
  return{bird:{states,distance,roost,leaves,maxNestDistance,transitions:e.birdTransitions},playerPreserved:playerBefore===playerAfter,deerAlert:deer.state==='flee'||deer.state==='watch',squirrel:squirrel.state,animalBefore};
 });result.behavior=behavior;
 await page.evaluate(()=>{__forest.leaveObserver();});await page.waitForTimeout(200);
 result.returned=await page.evaluate(()=>({active:__forest.observer.active,position:__forest.player.position,yaw:__forest.player.yaw,gl:__forest.renderer.gl.getError()}));
 await page.screenshot({path:'/Users/user/Documents/personal/autumn-forest/test/returned-player.png',timeout:120000});
 const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});mobile.setDefaultTimeout(120000);
 await mobile.goto('http://127.0.0.1:4175');await mobile.waitForFunction(()=>window.__forest,{timeout:120000});await mobile.waitForTimeout(1400);await mobile.tap('[data-animal="bird"]');await mobile.waitForTimeout(500);
 await mobile.screenshot({path:'/Users/user/Documents/personal/autumn-forest/test/mobile-wildlife.png',timeout:120000});
 result.mobile=await mobile.evaluate(()=>({active:__forest.observer.active,width:innerWidth,hud:document.getElementById('observer-hud').getBoundingClientRect().toJSON()}));
 if(errors.length)throw new Error(errors.join('; '));
 if(Object.values(result.checks).some(c=>!c.active||c.gl))throw new Error('Observation or GL check failed');
 if(!behavior.bird.roost||behavior.bird.distance>.35||!behavior.bird.leaves||behavior.bird.maxNestDistance<2){console.log('NEST FAILURE',JSON.stringify(behavior.bird));throw new Error('Bird nesting cycle failed');}
 if(!behavior.playerPreserved)throw new Error('Player changed by observation');
 result.passed=true;
 fs.writeFileSync('/Users/user/Documents/personal/autumn-forest/test/ecology-validation.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({passed:true,checks:result.checks,bird:result.behavior.bird,returned:result.returned,mobile:result.mobile},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
