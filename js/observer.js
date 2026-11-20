/* Observation camera: changes viewpoint only, never animal controls or player position. */
'use strict';
(function(F){
  const {V,clamp,lerp}=F.math;
  class Observer{
    constructor(ecology,player){
      this.ecology=ecology;this.player=player;this.active=false;this.species='deer';this.index=0;this.target=null;
      this.yaw=0;this.pitch=.16;this.distance=5;this.position=[0,0,0];this.look=[0,0,0];this.focus=[0,0,0];this.initialized=false;
    }
    enter(species=this.species){
      const list=this.ecology.bySpecies(species);if(!list.length)return false;
      this.species=species;this.index=clamp(this.index,0,list.length-1);this.target=list[this.index];this.active=true;
      this.distance=species==='deer'?6.8:species==='squirrel'?1.75:1.65;
      this.yaw=this.target.yaw+(species==='bird'?1.3:.5);
      if(species==='squirrel'){
        const a=this.target,dx=Math.cos(a.treeAngle),dz=Math.sin(a.treeAngle);
        this.yaw=Math.atan2(dx,dz)+.65;
      }else if(species==='bird'){
        const a=this.target,dx=a.position[0]-a.home.tree.position[0],dz=a.position[2]-a.home.tree.position[2];
        this.yaw=Math.atan2(dx,dz)-.85;
      }
      this.pitch=species==='bird'?.12:.14;this.initialized=false;this.update(1,true);return true;
    }
    cycle(direction){
      const list=this.ecology.bySpecies(this.species);if(!list.length)return;
      this.index=(this.index+(direction>0?1:-1)+list.length)%list.length;this.target=list[this.index];this.initialized=false;
    }
    select(species){this.index=0;return this.enter(species);}
    leave(){this.active=false;this.target=null;return this.player;}
    rotate(dx,dy){this.yaw-=dx;this.pitch=clamp(this.pitch-dy,-.65,1.0);}
    zoom(amount){const min=this.species==='squirrel'?.75:1.4,max=this.species==='deer'?11:8;this.distance=clamp(this.distance+amount,min,max);}
    update(dt,snap=false){
      if(!this.active||!this.target)return;
      if(!this.initialized){this.position=[0,0,0];this.focus=[0,0,0];snap=true;this.initialized=true;}
      const a=this.target,focus=this.ecology.focusFor(a);
      if(a.species==='squirrel'){
        const dx=a.position[0]-a.tree.position[0],dz=a.position[2]-a.tree.position[2],angle=Math.atan2(dx,dz)-.78;
        this.yaw+=(((angle-this.yaw+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI)*Math.min(dt*2.5,1);
        this.pitch=.10;
      }
      const height=a.species==='deer'?1.25:a.species==='squirrel'?.23:.12;
      const target=[focus.position[0],focus.position[1]+height,focus.position[2]];
      const smoothing=snap?1:1-Math.exp(-dt*4.0);
      for(let i=0;i<3;i++)this.focus[i]=lerp(this.focus[i],target[i],smoothing);
      const cp=Math.cos(this.pitch),desired=[this.focus[0]+Math.sin(this.yaw)*cp*this.distance,this.focus[1]+Math.sin(this.pitch)*this.distance+(a.species==='deer'?.7:.12),this.focus[2]+Math.cos(this.yaw)*cp*this.distance];
      desired[1]=Math.max(desired[1],F.player.world.height(desired[0],desired[2])+.28);
      const blend=snap?1:1-Math.exp(-dt*5.5);
      for(let i=0;i<3;i++)this.position[i]=lerp(this.position[i],desired[i],blend);
      const away=V.sub(this.position,this.focus),distance=V.length(away);
      const safe=a.species==='deer'?3.0:a.species==='squirrel'?1.05:.85;
      if(distance<safe){
        const direction=distance>.001?V.scale(away,1/distance):[Math.sin(this.yaw),.15,Math.cos(this.yaw)];
        this.position=V.add(this.focus,V.scale(V.normalize(direction),safe));
      }
      if(a.species==='squirrel'&&a.tree){
        const dx=this.position[0]-a.tree.position[0],dz=this.position[2]-a.tree.position[2],radius=Math.hypot(dx,dz)||1,min=.55*a.tree.scale[0]+.35;
        if(radius<min){this.position[0]=a.tree.position[0]+dx/radius*min;this.position[2]=a.tree.position[2]+dz/radius*min;}
      }
      const direction=V.normalize(V.sub(this.focus,this.position));
      const length=V.length(V.sub(this.focus,this.position));this.forward=direction;this.distanceActual=length;
    }
    camera(){return this.position;}
    viewForward(){return this.forward||[0,0,-1];}
    label(){return this.ecology.label(this.target);}
    focusData(){return this.ecology.focusFor(this.target);}
  }
  F.Observer=Observer;
})(window.Forest);
