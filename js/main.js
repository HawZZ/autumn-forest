/* App lifecycle, input and a synthesized forest soundscape (audio is opt-in). */
'use strict';
(function(F){
  const $=id=>document.getElementById(id),clamp=F.math.clamp;
  const isTouch=matchMedia('(pointer:coarse)').matches;
  const keys=new Set();let renderer,player,world,started=false,locked=false,lastTime=0,accumulator=0,simTime=0;
  let toastTimer,dragging=false,dragX=0,dragY=0,movePointer=null,lookPointer=null,moveOrigin=null;
  let ecology,observer,wildlifeRenderer,observeFade=0;
  let audio=null,audioEnabled=false,birdTimer=null;
  const touchMove={x:0,y:0};
  function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2900);}
  function fatal(error){
    console.error(error);$('loading').classList.add('finished');$('error-message').hidden=false;
    $('error-detail').textContent=error.message==='WEBGL2_UNAVAILABLE'?'请使用支持 WebGL2 和硬件加速的新版浏览器，并在浏览器设置中开启图形加速。':'场景初始化未完成：'+error.message;
  }
  function updateInput(){
    player.input.forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-touchMove.y;
    player.input.strafe=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+touchMove.x;
    const length=Math.hypot(player.input.forward,player.input.strafe);if(length>1){player.input.forward/=length;player.input.strafe/=length;}
    player.input.sprint=keys.has('ShiftLeft')||keys.has('ShiftRight');
  }
  function requestLock(){
    if(isTouch||observer?.active)return;
    try{
      const promise=$('forest').requestPointerLock();
      if(promise&&promise.catch)promise.catch(()=>{toast('可按住鼠标左键拖动视角');});
    }catch{toast('可按住鼠标左键拖动视角');}
  }
  function begin(){
    if(!player)return;
    if(observer?.active)leaveObserver();
    started=true;document.body.classList.add('exploring');
    $('entry-panel').setAttribute('aria-hidden','true');$('resume-button').hidden=true;
    $('forest').focus({preventScroll:true});requestLock();
  }
  function goToView(name){
    const view=world.viewpoints[name];if(!view)return;
    player.teleport(view);accumulator=0;
    document.querySelectorAll('.viewpoint').forEach(button=>{const active=button.dataset.view===name;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    $('location-name').textContent=view.name;$('location-description').textContent=view.description;
    if(started)toast(view.name+' · '+view.description);
  }
  function makeAudio(){
    const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)return null;
    const ctx=new AudioContext(),master=ctx.createGain();master.gain.value=0;master.connect(ctx.destination);
    const buffer=ctx.createBuffer(1,ctx.sampleRate*5,ctx.sampleRate),data=buffer.getChannelData(0);let brown=0;
    for(let i=0;i<data.length;i++){const white=Math.random()*2-1;brown=(brown+white*.018)/1.018;data[i]=brown*4.3;}
    const wind=ctx.createBufferSource();wind.buffer=buffer;wind.loop=true;
    const low=ctx.createBiquadFilter();low.type='lowpass';low.frequency.value=680;low.Q.value=.45;
    const windGain=ctx.createGain();windGain.gain.value=.46;wind.connect(low).connect(windGain).connect(master);wind.start();
    const rustle=ctx.createBufferSource();rustle.buffer=buffer;rustle.loop=true;rustle.playbackRate.value=1.7;
    const high=ctx.createBiquadFilter();high.type='highpass';high.frequency.value=1250;
    const rustleGain=ctx.createGain();rustleGain.gain.value=.06;rustle.connect(high).connect(rustleGain).connect(master);rustle.start();
    const lfo=ctx.createOscillator(),lfoGain=ctx.createGain();lfo.frequency.value=.13;lfoGain.gain.value=.14;lfo.connect(lfoGain).connect(windGain.gain);lfo.start();
    return{ctx,master,windGain,rustleGain};
  }
  function bird(){
    if(!audioEnabled||!audio||audio.ctx.state!=='running')return;
    const ctx=audio.ctx,now=ctx.currentTime;
    for(let i=0;i<3;i++){
      const osc=ctx.createOscillator(),gain=ctx.createGain(),t=now+i*.19;
      osc.type='sine';osc.frequency.setValueAtTime(1750+i*190,t);osc.frequency.exponentialRampToValueAtTime(2750-i*120,t+.07);osc.frequency.exponentialRampToValueAtTime(1980,t+.14);
      gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.018,t+.022);gain.gain.exponentialRampToValueAtTime(.0001,t+.17);
      osc.connect(gain).connect(audio.master);osc.start(t);osc.stop(t+.2);
    }
  }
  async function toggleAudio(){
    try{
      if(!audio)audio=makeAudio();if(!audio){toast('当前浏览器无法播放合成声音');return;}
      await audio.ctx.resume();audioEnabled=!audioEnabled;
      audio.master.gain.setTargetAtTime(audioEnabled?.65:0,audio.ctx.currentTime,.35);
      $('audio-button').setAttribute('aria-pressed',String(audioEnabled));$('audio-button').setAttribute('aria-label',audioEnabled?'关闭自然声音':'开启自然声音');
      clearInterval(birdTimer);if(audioEnabled){birdTimer=setInterval(bird,9500);setTimeout(bird,600);}
      toast(audioEnabled?'风与鸟鸣 · 自然声音已开启':'自然声音已关闭');
    }catch(error){toast('声音未能开启，请再次点击声音按钮');}
  }
  function observe(species){
    if(!ecology)return;
    if(!started){started=true;document.body.classList.add('exploring');$('entry-panel').setAttribute('aria-hidden','true');}
    if(document.pointerLockElement)document.exitPointerLock();
    observer.select(species);document.body.classList.add('observing');
    $('observer-hud').hidden=false;$('resume-button').hidden=true;
    document.querySelectorAll('[data-animal]').forEach(button=>button.classList.toggle('active',button.dataset.animal===species));
    updateObserverHUD();
  }
  function leaveObserver(){
    if(!observer)return;
    observer.leave();document.body.classList.remove('observing');$('observer-hud').hidden=true;
    keys.clear();player.input.forward=player.input.strafe=0;player.input.sprint=false;player.input.jump=false;
    document.querySelectorAll('[data-animal]').forEach(button=>button.classList.remove('active'));
  }
  function updateObserverHUD(){
    if(!observer?.active)return;
    const a=observer.target;
    $('observer-name').textContent=a.name;
    $('observer-state').textContent=ecology.label(a);
    const facts={deer:'入冬前颈鬃与冬毛渐密，体色变深，白斑减弱；取食蕨类、草本与林下枝叶，时刻警惕脚步声。',squirrel:'冬季耳簇加长、绒毛更密。白天在枝头与地面觅食，将橡实藏入树皮或落叶下，不会冬眠。',bird:'白颊、黄腹与黑色胸腹纵纹。深秋成小群觅食，回旧巢或树洞理羽、整理巢材并停栖避风。'};
    $('observer-fact').textContent=facts[a.species];
    $('observer-foliage').textContent=observer.target.species==='bird'?'已柔化遮挡鸟巢的前景枝叶':'已柔化观察目标前的枝叶';
  }
  function bindUI(){
    $('enter-button').addEventListener('click',begin);$('resume-button').addEventListener('click',begin);
    $('help-start').addEventListener('click',()=>{$('help-dialog').close();begin();});
    $('help-button').addEventListener('click',()=>{if(document.pointerLockElement)document.exitPointerLock();$('help-dialog').showModal();});
    $('close-help').addEventListener('click',()=>$('help-dialog').close());
    $('help-dialog').addEventListener('click',event=>{if(event.target===$('help-dialog')){const r=$('help-dialog').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$('help-dialog').close();}});
    $('audio-button').addEventListener('click',toggleAudio);
    $('settings-button').addEventListener('click',()=>{
      const open=$('settings-panel').hidden;$('settings-panel').hidden=!open;$('settings-button').setAttribute('aria-expanded',String(open));
      if(open&&document.pointerLockElement)document.exitPointerLock();
    });
    $('close-settings').addEventListener('click',()=>{$('settings-panel').hidden=true;$('settings-button').setAttribute('aria-expanded','false');});
    $('quality').addEventListener('change',event=>{renderer.setQuality(event.target.value);$('quality-note').textContent=event.target.value==='auto'?'自动平衡清晰度与帧率':event.target.value==='high'?'完整分辨率与更多体积采样':event.target.value==='low'?'较低分辨率，优先漫游流畅度':'适度降低内部渲染分辨率';});
    $('wind').addEventListener('input',event=>{renderer.wind=Number(event.target.value)/100*1.4;});
    $('volume').addEventListener('change',event=>{renderer.volume=event.target.checked;});
    $('reflections').addEventListener('change',event=>{renderer.reflections=event.target.checked;});
    $('motion').addEventListener('change',event=>{player.bobEnabled=event.target.checked;});
    document.querySelectorAll('.viewpoint').forEach(button=>button.addEventListener('click',()=>goToView(button.dataset.view)));
    $('home-link').addEventListener('click',event=>{event.preventDefault();if(observer?.active)leaveObserver();goToView('path');});
    document.querySelectorAll('[data-animal]').forEach(button=>button.addEventListener('click',()=>observe(button.dataset.animal)));
    $('previous-animal').addEventListener('click',()=>{observer.cycle(-1);updateObserverHUD();});
    $('next-animal').addEventListener('click',()=>{observer.cycle(1);updateObserverHUD();});
    $('leave-observer').addEventListener('click',()=>{leaveObserver();if(!isTouch)requestLock();});
    $('forest').addEventListener('wheel',event=>{if(observer?.active){event.preventDefault();observer.zoom(event.deltaY*.004);}},{passive:false});
    addEventListener('keydown',event=>{
      if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;
      if(observer?.active){
        if(event.code==='KeyQ'){observer.cycle(-1);updateObserverHUD();event.preventDefault();return;}
        if(event.code==='KeyE'){observer.cycle(1);updateObserverHUD();event.preventDefault();return;}
        if(event.code==='KeyV'){leaveObserver();if(!isTouch)requestLock();event.preventDefault();return;}
        if(event.code==='Escape'){leaveObserver();event.preventDefault();return;}
      }
      if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)&&started)event.preventDefault();
      if(event.code==='Enter'&&started&&!locked&&!isTouch&&!$('help-dialog').open)requestLock();
      if(event.code==='Escape'){$('settings-panel').hidden=true;$('settings-button').setAttribute('aria-expanded','false');}
      keys.add(event.code);if(event.code==='Space')player.input.jump=true;
    });
    addEventListener('keyup',event=>{keys.delete(event.code);if(event.code==='Space')player.input.jump=false;});
    addEventListener('blur',()=>{keys.clear();touchMove.x=touchMove.y=0;if(player)player.input.jump=false;});
    document.addEventListener('pointerlockchange',()=>{
      locked=document.pointerLockElement===$('forest');
      if(started&&!isTouch){$('resume-button').hidden=locked||!$('settings-panel').hidden||$('help-dialog').open;}
    });
    document.addEventListener('pointerlockerror',()=>toast('按住鼠标左键也可以环顾森林'));
    document.addEventListener('mousemove',event=>{
      if(!started||!player)return;
      if(locked){player.yaw-=event.movementX*.00205;player.pitch=clamp(player.pitch-event.movementY*.00185,-1.38,1.38);}
      else if(dragging){
        if(observer?.active)observer.rotate((event.clientX-dragX)*.004,(event.clientY-dragY)*.003);
        else{player.yaw-=(event.clientX-dragX)*.003;player.pitch=clamp(player.pitch-(event.clientY-dragY)*.0027,-1.38,1.38);}
        dragX=event.clientX;dragY=event.clientY;
      }
    });
    $('forest').addEventListener('mousedown',event=>{if(event.button!==0||!started||locked||isTouch)return;dragging=true;dragX=event.clientX;dragY=event.clientY;});
    addEventListener('mouseup',()=>dragging=false);
    $('forest').addEventListener('click',()=>{if(started&&!locked&&!isTouch&&!observer?.active&&!dragging&&$('settings-panel').hidden&&!$('help-dialog').open)requestLock();});
    bindTouch();
    document.addEventListener('visibilitychange',()=>{lastTime=0;accumulator=0;if(audio){if(document.hidden)audio.ctx.suspend();else if(audioEnabled)audio.ctx.resume();}});
    $('forest').addEventListener('webglcontextlost',event=>{event.preventDefault();$('error-message').hidden=false;$('error-detail').textContent='图形上下文暂时中断。请关闭其他高负载页面，然后点击重新进入。';});
  }
  function bindTouch(){
    const pad=$('move-pad'),stick=$('move-stick'),look=$('look-pad');let lookLast=null;
    pad.addEventListener('pointerdown',event=>{event.preventDefault();if(observer?.active){lookPointer=event.pointerId;lookLast=[event.clientX,event.clientY];pad.setPointerCapture(event.pointerId);return;}movePointer=event.pointerId;moveOrigin=[event.clientX,event.clientY];pad.setPointerCapture(event.pointerId);});
    pad.addEventListener('pointermove',event=>{
      if(observer?.active&&event.pointerId===lookPointer){observer.rotate((event.clientX-lookLast[0])*.004,(event.clientY-lookLast[1])*.003);lookLast=[event.clientX,event.clientY];return;}
      if(event.pointerId!==movePointer)return;
      let dx=(event.clientX-moveOrigin[0])/37,dy=(event.clientY-moveOrigin[1])/37;const l=Math.hypot(dx,dy);if(l>1){dx/=l;dy/=l;}
      touchMove.x=dx;touchMove.y=dy;stick.style.transform=`translate(${dx*26}px,${dy*26}px)`;
    });
    const releaseMove=event=>{if(observer?.active){if(event.pointerId===lookPointer)lookPointer=null;return;}if(event.pointerId!==movePointer)return;movePointer=null;touchMove.x=touchMove.y=0;stick.style.transform='';};
    pad.addEventListener('pointerup',releaseMove);pad.addEventListener('pointercancel',releaseMove);
    look.addEventListener('pointerdown',event=>{event.preventDefault();lookPointer=event.pointerId;lookLast=[event.clientX,event.clientY];look.setPointerCapture(event.pointerId);});
    look.addEventListener('pointermove',event=>{if(event.pointerId!==lookPointer)return;
      if(observer?.active)observer.rotate((event.clientX-lookLast[0])*.004,(event.clientY-lookLast[1])*.003);
      else{player.yaw-=(event.clientX-lookLast[0])*.004;player.pitch=clamp(player.pitch-(event.clientY-lookLast[1])*.0036,-1.38,1.38);}lookLast=[event.clientX,event.clientY];});
    const releaseLook=event=>{if(event.pointerId===lookPointer)lookPointer=null;};look.addEventListener('pointerup',releaseLook);look.addEventListener('pointercancel',releaseLook);
    $('jump-button').addEventListener('pointerdown',event=>{event.preventDefault();player.input.jump=true;});$('jump-button').addEventListener('pointerup',()=>player.input.jump=false);$('jump-button').addEventListener('pointercancel',()=>player.input.jump=false);
  }
  function frame(timestamp){
    if(!renderer)return;
    if(!lastTime)lastTime=timestamp;
    const dt=Math.min((timestamp-lastTime)/1000,.08);lastTime=timestamp;
    renderer.time+=dt;
    if(started&&!document.hidden){
      if(observer?.active){
        player.input.forward=player.input.strafe=0;player.input.sprint=false;player.input.jump=false;
        observer.update(dt);
      }else updateInput();
      accumulator+=dt;let iterations=0;
      while(accumulator>=1/120&&iterations<10){simTime+=1/120;player.update(1/120,simTime);accumulator-=1/120;iterations++;}
      ecology.update(dt);
      observeFade+=((observer?.active?1:0)-observeFade)*Math.min(dt*3.5,1);
      wildlifeRenderer.update();
      if(observer?.active)updateObserverHUD();
      if(renderer.frameCounter%20===0)$('heading').textContent=String(Math.round((ecology.timeOfDay*24+5)%24)).padStart(2,'0')+'时';
    }
    try{
      renderer.render(observer?.active?observer.camera():player.camera(),observer?.active?observer.viewForward():player.forward(),dt);renderer.updatePerformance(dt);
      if(renderer.frameCounter%90===0)$('performance-text').textContent=`${renderer.lastFPS} FPS · ${(renderer.triangles/1e6).toFixed(1)}M 三角面 · ${renderer.drawCalls} 次绘制`;
    }catch(error){renderer=null;fatal(error);return;}
    requestAnimationFrame(frame);
  }
  async function boot(){
    try{
      bindUI();
      $('loading-detail').textContent='生成地形 · 混交林与溪谷';
      await new Promise(resolve=>setTimeout(resolve,70));
      world=F.createWorld();player=new F.Player(world);F.player=player;
      ecology=new F.Ecology(world);observer=new F.Observer(ecology,player);
      $('loading-detail').textContent='雕刻枝叶 · 铺设林间光影';
      await new Promise(resolve=>setTimeout(resolve,50));
      renderer=new F.Renderer($('forest'),world);F.renderer=renderer;
      wildlifeRenderer=new F.WildlifeRenderer(renderer,ecology);renderer.wildlife=wildlifeRenderer;
      wildlifeRenderer.update();
      if(matchMedia('(prefers-reduced-motion: reduce)').matches){player.bobEnabled=false;$('motion').checked=false;}
      renderer.resize();
      $('loading-detail').textContent='唤醒风、流水与第一束光';
      await new Promise(resolve=>setTimeout(resolve,50));
      renderer.render(player.camera(),player.forward(),1/60);
      window.Forest.renderer=renderer;window.Forest.player=player;
      $('loading').classList.add('finished');
      // Read-only diagnostics are intentionally available to automated smoke tests.
      window.__forest={world,player,ecology,observer,wildlife:wildlifeRenderer,renderer,get started(){return started;},get locked(){return locked;},goToView,observe,leaveObserver,pauseRendering(){renderer=null;}};
      requestAnimationFrame(frame);
    }catch(error){fatal(error);}
  }
  boot();
})(window.Forest);
