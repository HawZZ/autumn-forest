/* Autonomous animals in the exact same terrain and tree coordinate system. */
'use strict';
(function(F){
  const {rng,clamp,lerp,V,TAU}=F.math;
  const labels={deer:'梅花鹿',squirrel:'欧亚红松鼠',bird:'大山雀'};
  const stateLabels={graze:'低头取食',watch:'抬头警戒',walk:'林间漫步',flee:'受惊奔逃',rest:'卧息反刍',drink:'溪边饮水',forage:'寻找橡实',eat:'坐起啃食',cache:'储藏橡实',climb:'沿干攀行',fly:'短程飞行',hop:'枝头跳跃',preen:'整理羽毛',returning:'返回巢位',arrange:'整理巢材',feed:'分享食物',roost:'收翅停栖',look:'巢缘张望',leave:'离巢觅食'};
  class Ecology{
    constructor(world){
      this.world=world;this.random=rng(864209);this.animals=[];this.time=0;this.dayDuration=600;this.timeOfDay=.31;
      this.nests=[];this.nextId=0;
      this.createDeer();this.createSquirrels();this.createBirds();
    }
    createDeer(){
      const starts=[[5.2,10.5],[7.4,14.8],[4.6,17.2],[-9,-30]];
      starts.forEach(([x,z],i)=>{
        const male=i===3;
        const a={id:this.nextId++,species:'deer',name:male?'雄鹿 · 冬毛渐密':i===0?'雌鹿 · 林间取食':'幼鹿 · 跟随雌鹿',male,position:[x,this.world.height(x,z),z],yaw:i===3?1.2:.4,velocity:[0,0,0],state:'graze',stateTime:this.random()*4,stateDuration:5+this.random()*4,target:[x,z],speed:0,alert:0,phase:this.random()*TAU,group:i<3?0:1,scale:male?1.05:i===2?.77:.93,energy:.8,seed:this.random(),pose:{head:0,legs:0,tail:0}};
        this.animals.push(a);
      });
    }
    createSquirrels(){
      const trees=this.world.trees[2].filter(t=>t.position[2]>0&&t.position[2]<42&&Math.abs(t.position[0])<27).slice(0,3);
      const fallback=this.world.trees[2][0];if(!trees.length)trees.push(fallback);
      const treeAngles=[1.25,1.25,1.25];
      trees.forEach((tree,i)=>{
        const angle=treeAngles[i],r=.52*tree.scale[0]+.14;
        const x=tree.position[0]+Math.cos(angle)*r,z=tree.position[2]+Math.sin(angle)*r;
        const a={id:this.nextId++,species:'squirrel',name:'红松鼠 · 冬耳簇',position:[x,this.world.height(x,z)+1.1+i*.4,z],yaw:angle+Math.PI/2,velocity:[0,0,0],state:'climb',stateTime:0,stateDuration:4+i,target:[x,z],speed:0,alert:0,phase:this.random()*TAU,scale:1.0,tree,treeAngle:angle,treeHeight:1.1+i*.4,forageOffset:[Math.cos(angle)*1.4,Math.sin(angle)*1.4],carrying:false,pose:{head:0,legs:0,tail:0}};
        this.animals.push(a);
      });
    }
    createBirds(){
      const tree=this.world.trees[0][0],ground=tree.position[1],scale=tree.scale[1],c=Math.cos(tree.rotation),s=Math.sin(tree.rotation);
      const profile=F.geometry.createTree(0,3041,0,tree.variant).trunkProfile;
      const local=profile[Math.floor(profile.length*.62)];
      const center=[tree.position[0]+c*local[0]*scale+s*local[2]*scale,ground+local[1]*scale,tree.position[2]-s*local[0]*scale+c*local[2]*scale];
      const nest={tree,position:[center[0]+.27,center[1]-.06,center[2]+.18],radius:.28,occupants:[]};this.nests.push(nest);
      for(let i=0;i<7;i++){
        const angle=i/7*TAU,perch=i<3?[nest.position[0]+Math.cos(angle)*.18,nest.position[1]+.04,nest.position[2]+Math.sin(angle)*.18]:[center[0]+Math.cos(angle)*2.5,center[1]+1.5+this.random()*1.8,center[2]+Math.sin(angle)*2.5];
        const a={id:this.nextId++,species:'bird',name:'大山雀 · 白颊黄腹',position:[...perch],yaw:angle+Math.PI,velocity:[0,0,0],state:i<3?'preen':'hop',stateTime:this.random()*2,stateDuration:3+this.random()*5,target:[...perch],perch:[...perch],home:nest,speed:0,alert:0,phase:this.random()*TAU,scale:1.45,energy:.7+this.random()*.2,roostUntil:0,pose:{head:0,legs:0,tail:0}};
        this.animals.push(a);
      }
    }
    bySpecies(species){return this.animals.filter(a=>a.species===species);}
    nearest(x,z,species=null){let best=null,d=Infinity;for(const a of this.animals){if(species&&a.species!==species)continue;const dist=Math.hypot(x-a.position[0],z-a.position[2]);if(dist<d){d=dist;best=a;}}return best;}
    change(a,state,duration){a.state=state;a.stateTime=0;a.stateDuration=duration;if(a.species==='bird')this.birdTransitions=(this.birdTransitions||[]).concat({id:a.id,state,time:this.time});}
    steerGround(a,target,speed,dt){
      const dx=target[0]-a.position[0],dz=target[1]-a.position[2],dist=Math.hypot(dx,dz);
      if(dist<.12){a.speed=0;a.velocity[0]*=.8;a.velocity[2]*=.8;return true;}
      const dir=[dx/dist,dz/dist];let nx=dir[0],nz=dir[1];
      const nearby=this.world.nearby(a.position[0]+nx*.8,a.position[2]+nz*.8,1.6);
      for(const c of nearby){
        if(c.type===0&&c.y!==undefined&&Math.abs((a.position[1]+.8)-c.y)>1.2)continue;
        const rx=a.position[0]+nx*.8-c.x,rz=a.position[2]+nz*.8-c.z,r=Math.hypot(rx,rz),min=c.r+(a.species==='deer'?.52:.20)+.35;
        if(r<min){const sign=rx*dir[1]-rz*dir[0]>0?-1:1;nx+=-dir[1]*sign*(min-r+.3)*2;nz+=dir[0]*sign*(min-r+.3)*2;}
      }
      const norm=Math.hypot(nx,nz)||1;nx/=norm;nz/=norm;
      const blend=1-Math.exp(-dt*3.3);a.velocity[0]=lerp(a.velocity[0],nx*speed,blend);a.velocity[2]=lerp(a.velocity[2],nz*speed,blend);
      a.position[0]+=a.velocity[0]*dt;a.position[2]+=a.velocity[2]*dt;
      a.position[1]=this.world.height(a.position[0],a.position[2]);
      a.yaw=this.approachAngle(a.yaw,Math.atan2(-nx,-nz),dt*5);
      a.speed=Math.hypot(a.velocity[0],a.velocity[2]);return false;
    }
    approachAngle(a,b,t){let d=((b-a+Math.PI)%(TAU)+TAU)%TAU-Math.PI;return a+d*Math.min(t,1);}
    wanderTarget(a,radius=9){
      const angle=this.random()*TAU,r=2+this.random()*radius;
      a.target=[clamp(a.position[0]+Math.cos(angle)*r,-65,65),clamp(a.position[2]+Math.sin(angle)*r,-65,65)];
    }
    updateDeer(a,dt,playerDistance,playerMoving){
      const alarm=playerDistance<5.2||(playerDistance<8.5&&playerMoving);
      if(alarm&&a.state!=='flee'){
        a.alert=1;const dx=a.position[0]-F.player.position[0],dz=a.position[2]-F.player.position[2],l=Math.hypot(dx,dz)||1;
        a.target=[clamp(a.position[0]+dx/l*18,-80,80),clamp(a.position[2]+dz/l*18,-80,80)];this.change(a,'flee',5+this.random()*3);
      }
      if(a.state==='flee'){
        if(this.steerGround(a,a.target,5.6,dt)||a.stateTime>a.stateDuration){a.alert=.25;this.change(a,'watch',3);}
      }else if(a.state==='graze'||a.state==='rest'||a.state==='drink'){
        a.speed=0;if(a.stateTime>a.stateDuration){
          if(playerDistance<14)this.change(a,'watch',3+this.random()*3);
          else if(a.state==='graze'&&this.random()<.42)this.change(a,'rest',9+this.random()*10);
          else{this.wanderTarget(a,8);this.change(a,'walk',8+this.random()*6);}
        }
      }else if(a.state==='watch'){
        a.speed=0;a.alert=Math.max(0,a.alert-dt*.1);
        if(a.stateTime>a.stateDuration){if(playerDistance<12){this.wanderTarget(a,4);this.change(a,'walk',4);}else this.change(a,'graze',5+this.random()*6);}
      }else if(a.state==='walk'){
        if(this.steerGround(a,a.target,.82,dt)||a.stateTime>a.stateDuration)this.change(a,playerDistance<14?'watch':'graze',4+this.random()*7);
      }
      const moving=a.speed>.1;
      a.pose.head=a.state==='graze'?1.15:a.state==='drink'?1.34:a.state==='watch'?-.14:.12;
      a.pose.legs=moving?a.time*(a.state==='flee'?11:4.7):0;
      a.pose.tail=a.state==='flee'?Math.sin(this.time*14)*.3:Math.sin(this.time*2+a.phase)*.08;
    }
    squirrelGround(a,x,z){return[x,this.world.height(x,z)+.02,z];}
    updateSquirrel(a,dt,playerDistance){
      const t=a.tree,base=t.position,r=.52*t.scale[0]+.14;
      if(playerDistance<3.6&&a.state!=='climb'){
        a.treeHeight=Math.max(.2,a.position[1]-this.world.height(a.position[0],a.position[2]));this.change(a,'climb',6);
      }
      if(a.state==='climb'){
        const targetHeight=a.stateTime<2?5.6:2.6;
        a.treeHeight=lerp(a.treeHeight,targetHeight,1-Math.exp(-dt*1.1));
        a.treeAngle+=dt*.18;
        const profile=t.trunkProfile||(t.trunkProfile=F.geometry.createTree(2,3041+2*971,0,t.variant).trunkProfile);
        const fraction=clamp(a.treeHeight/profile[profile.length-1][1],0,1),index=Math.min(profile.length-2,Math.floor(fraction*(profile.length-1)));
        const p0=profile[index],p1=profile[index+1],f=fraction*(profile.length-1)-index;
        const cx=lerp(p0[0],p1[0],f),cz=lerp(p0[2],p1[2],f),radius=lerp(p0[3],p1[3],f)*t.scale[0];
        const co=Math.cos(t.rotation),si=Math.sin(t.rotation),r=radius+.24;
        const centerX=base[0]+co*cx*t.scale[0]+si*cz*t.scale[0],centerZ=base[2]-si*cx*t.scale[0]+co*cz*t.scale[0];
        a.position[0]=centerX+Math.cos(a.treeAngle)*r;a.position[2]=centerZ+Math.sin(a.treeAngle)*r;
        a.position[1]=base[1]+a.treeHeight;
        a.yaw=Math.atan2(Math.cos(a.treeAngle),Math.sin(a.treeAngle));a.speed=.7;
        if(a.stateTime>a.stateDuration){a.target=this.squirrelGround(a,base[0]+a.forageOffset[0],base[2]+a.forageOffset[1]);this.change(a,'forage',7);}
      }else if(a.state==='forage'){
        if(this.steerGround(a,a.target,1.25,dt)||a.stateTime>a.stateDuration){a.carrying=true;this.change(a,'eat',3+this.random()*3);}
      }else if(a.state==='eat'){
        a.speed=0;if(a.stateTime>a.stateDuration){const angle=this.random()*TAU;a.target=this.squirrelGround(a,base[0]+Math.cos(angle)*2.0,base[2]+Math.sin(angle)*2.0);this.change(a,'cache',4);}
      }else if(a.state==='cache'){
        if(this.steerGround(a,a.target,1.35,dt)){a.carrying=false;this.change(a,'eat',1.7);}
        if(a.stateTime>5){a.carrying=false;this.change(a,'climb',7);}
      }else{a.speed=0;if(a.stateTime>a.stateDuration)this.change(a,'climb',6);}
      a.pose.head=a.state==='eat'?Math.sin(this.time*10)*.12:Math.sin(this.time*2+a.phase)*.07;
      a.pose.legs=a.speed>.1?this.time*13:0;a.pose.tail=Math.sin(this.time*3+a.phase)*.16+(a.state==='climb'?.3:0);
    }
    setPerch(a,height=1.8){
      const angle=this.random()*TAU,r=3.4+this.random()*2.4,t=a.home.tree;
      a.perch=[a.home.position[0]+Math.cos(angle)*r,a.home.position[1]+height+this.random()*2.1,a.home.position[2]+Math.sin(angle)*r];
      a.target=[...a.perch];
    }
    wakeForDawn(a){if(a.state==='roost'){a.roostUntil=this.time+2;}}
    updateBird(a,dt,playerDistance){
      const phase=(this.time/this.dayDuration+.30)%1;
      const dusk=phase>.70||phase<.16;
      const toNest=V.sub(a.home.position,a.position),nestDistance=V.length(toNest);
      if(dusk&&a.state!=='returning'&&!['arrange','preen','feed','roost','look'].includes(a.state)){
        a.target=[a.home.position[0]+Math.cos(a.phase)*.18,a.home.position[1]+.06,a.home.position[2]+Math.sin(a.phase)*.18];this.change(a,'returning',60);
      }
      if(!dusk&&a.state==='roost'&&a.stateTime>a.stateDuration)this.change(a,'leave',2.4);
      if(a.state==='leave'&&a.stateTime<.01){this.setPerch(a);a.target=[...a.perch];}
      if(a.state==='returning'||a.state==='leave'||a.state==='fly'){
        if(a.state==='leave'&&a.stateTime>2.1){this.change(a,'fly',15);}
        const target=a.state==='returning'||a.state==='leave'?a.target:a.perch||a.target;
        const d=V.sub(target,a.position),distance=V.length(d),direction=distance>.001?V.scale(d,1/distance):[0,0,0];
        const speed=a.state==='returning'?3.2:2.5;
        a.velocity[0]=lerp(a.velocity[0],direction[0]*speed,1-Math.exp(-dt*2.7));
        a.velocity[1]=lerp(a.velocity[1],direction[1]*speed+Math.sin(this.time*3+a.phase)*.10,1-Math.exp(-dt*2.7));
        a.velocity[2]=lerp(a.velocity[2],direction[2]*speed,1-Math.exp(-dt*2.7));
        a.position[0]+=a.velocity[0]*dt;a.position[1]+=a.velocity[1]*dt;a.position[2]+=a.velocity[2]*dt;
        a.yaw=this.approachAngle(a.yaw,Math.atan2(-a.velocity[0],-a.velocity[2]),dt*4);a.speed=V.length(a.velocity);
        if(distance<.22&&a.state!=='leave'&&a.stateTime>.8){a.position=[...target];a.velocity=[0,0,0];a.speed=0;this.change(a,a.state==='returning'?'look':'hop',a.state==='returning'?3:2+this.random()*3);}
      }else if(a.state==='hop'){
        a.speed=0;if(a.stateTime>a.stateDuration){
          if(this.random()<.30){this.setPerch(a);this.change(a,'fly',12);}
          else{this.change(a,this.random()<.6?'preen':'hop',2+this.random()*4);a.yaw+=.4+this.random();}
        }
      }else{
        a.speed=0;a.yaw+=Math.sin(this.time*.7+a.phase)*dt*.12;
        if(a.stateTime>a.stateDuration){
          const sequence=['look','preen','arrange','feed','roost'],index=sequence.indexOf(a.state);
          if(index>=0&&index<sequence.length-1)this.change(a,sequence[index+1],a.state==='arrange'?4:7+this.random()*5);
          else if(a.state==='roost'&&dusk)a.stateDuration=12;
          else this.change(a,dusk?'roost':'preen',5+this.random()*6);
        }
      }
      a.pose.head=a.state==='preen'?Math.sin(this.time*2.3)*.5+.6:a.state==='arrange'?Math.sin(this.time*6)*.32:Math.sin(this.time*1.4+a.phase)*.09;
    }
    update(dt){
      this.time+=dt;this.timeOfDay=(this.time/this.dayDuration+.30)%1;
      const p=F.player.position,moving=Math.hypot(F.player.velocity[0],F.player.velocity[2])>3.2;
      for(const a of this.animals){
        a.stateTime+=dt;
        const distance=Math.hypot(a.position[0]-p[0],a.position[2]-p[2]);
        if(a.species==='deer')this.updateDeer(a,dt,distance,moving);
        else if(a.species==='squirrel')this.updateSquirrel(a,dt,distance);
        else this.updateBird(a,dt,distance);
      }
    }
    label(a){return stateLabels[a.state]||a.state;}
    isNesting(a){return a.species==='bird'&&(a.state==='returning'||['arrange','preen','feed','roost','look'].includes(a.state));}
    focusFor(a){
      if(a.species==='bird'&&this.isNesting(a))return{position:a.home.position,radius:.5,kind:'nest'};
      return{position:a.position,radius:a.species==='deer'?1.5:.45,kind:'animal'};
    }
  }
  F.Ecology=Ecology;
})(window.Forest);
