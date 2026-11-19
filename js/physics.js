/* Fixed-step first-person motion. Render smoothing never changes collision state. */
'use strict';
(function(F){
  const {clamp,V}=F.math;
  class Player{
    constructor(world){
      this.world=world;this.position=[world.viewpoints.path.x,0,world.viewpoints.path.z];
      this.position[1]=world.height(this.position[0],this.position[2])+1.68;
      this.velocity=[0,0,0];this.verticalVelocity=0;this.grounded=true;this.eyeHeight=1.68;
      this.yaw=world.viewpoints.path.yaw;this.pitch=world.viewpoints.path.pitch;
      this.input={forward:0,strafe:0,sprint:false,jump:false};this.jumpLatch=false;
      this.walkPhase=0;this.distance=0;this.stepAccumulator=0;this.smoothGround=this.position[1]-this.eyeHeight;
      this.ripples=new Float32Array(32);this.rippleIndex=0;this.lastRipple=-10;this.inWater=false;
      this.bobEnabled=true;this.bob=0;this.viewYaw=this.yaw;this.viewPitch=this.pitch;
      this.stepEvents=0;this.gustParticles=0;
    }
    teleport(view){
      this.position[0]=view.x;this.position[2]=view.z;
      this.smoothGround=this.world.height(view.x,view.z);this.position[1]=this.smoothGround+this.eyeHeight;
      this.velocity=[0,0,0];this.verticalVelocity=0;this.grounded=true;this.yaw=view.yaw;this.pitch=view.pitch;
      this.viewYaw=this.yaw;this.viewPitch=this.pitch;this.ripples.fill(0);this.rippleIndex=0;
    }
    update(dt,time){
      const w=this.world,p=this.position,v=this.velocity,input=this.input;
      const speed=input.sprint?5.3:2.65;
      const sy=Math.sin(this.yaw),cy=Math.cos(this.yaw);
      let tx=(-sy*input.forward+cy*input.strafe)*speed,tz=(-cy*input.forward-sy*input.strafe)*speed;
      const accel=this.grounded?15:3.5;
      v[0]+=(tx-v[0])*Math.min(accel*dt,1);v[2]+=(tz-v[2])*Math.min(accel*dt,1);
      if(Math.abs(input.forward)+Math.abs(input.strafe)<.01){const damp=Math.exp(-dt*8);v[0]*=damp;v[2]*=damp;}
      if(input.jump&&!this.jumpLatch&&this.grounded){this.verticalVelocity=4.25;this.grounded=false;this.jumpLatch=true;}
      if(!input.jump)this.jumpLatch=false;
      const oldX=p[0],oldZ=p[2];
      p[0]+=v[0]*dt;p[2]+=v[2]*dt;
      const radius=.29;
      for(let iteration=0;iteration<3;iteration++){
        const nearby=w.nearby(p[0],p[2],2.5);
        for(const c of nearby){
          if(c.type===0&&c.y!==undefined&&Math.abs((p[1]-this.eyeHeight)-c.y)>1.03)continue;
          const dx=p[0]-c.x,dz=p[2]-c.z,min=radius+c.r;
          if(c.type===2){ // a fallen log is a low obstacle, jumpable and solid at foot level
            if(p[1]-this.eyeHeight>w.height(c.x,c.z)+c.h)continue;
          }
          const d=Math.hypot(dx,dz);
          if(d<min){
            const nx=d>.0001?dx/d:1,nz=d>.0001?dz/d:0;
            p[0]=c.x+nx*min;p[2]=c.z+nz*min;
            const dot=v[0]*nx+v[2]*nz;if(dot<0){v[0]-=dot*nx;v[2]-=dot*nz;}
          }
        }
      }
      const r=Math.hypot(p[0],p[2]);
      if(r>w.RADIUS-2){const scale=(w.RADIUS-2)/r;p[0]*=scale;p[2]*=scale;v[0]*=.25;v[2]*=.25;}
      const ground=w.height(p[0],p[2]);
      const uphill=ground-w.height(oldX,oldZ);
      if(this.grounded&&uphill>.14){
        // Ground following permits forest undulations, not vertical banks.
        const slope=w.slope(p[0],p[2]);
        if(slope>.88){p[0]=oldX;p[2]=oldZ;v[0]*=.25;v[2]*=.25;}
      }
      const actualGround=w.height(p[0],p[2]);
      if(!this.grounded){
        this.verticalVelocity-=10.5*dt;p[1]+=this.verticalVelocity*dt;
        if(p[1]<=actualGround+this.eyeHeight){p[1]=actualGround+this.eyeHeight;this.verticalVelocity=0;this.grounded=true;}
      }else p[1]=actualGround+this.eyeHeight;
      const smoothRate=this.grounded?1-Math.exp(-dt*14):1;
      this.smoothGround+=(actualGround-this.smoothGround)*smoothRate;
      if(this.grounded)p[1]=this.smoothGround+this.eyeHeight;
      const moved=Math.hypot(p[0]-oldX,p[2]-oldZ);this.distance+=moved;
      if(this.grounded&&moved>.0001){
        this.walkPhase+=moved*(input.sprint?4.5:5.8);this.stepAccumulator+=moved;
        this.bob=Math.sin(this.walkPhase)*Math.min(moved/dt/2.65,1)*.020;
        if(this.stepAccumulator>(input.sprint?.86:.70)){
          this.stepAccumulator=0;this.step(time);
        }
      }else this.bob*=Math.exp(-dt*7);
      const inWater=w.creekDistance(p[0],p[2])<1.78&&actualGround<w.creekLevel(p[2]);
      this.inWater=inWater;
      if(inWater)v[0]*=1-dt*1.8,v[2]*=1-dt*1.8;
      if(this.stepSound)this.stepSound(inWater);
    }
    step(time){
      this.stepEvents++;
      if(this.inWater&&time-this.lastRipple>.18){
        const o=this.rippleIndex*4;this.ripples[o]=this.position[0];this.ripples[o+1]=this.position[2];this.ripples[o+2]=time;this.ripples[o+3]=1;
        this.rippleIndex=(this.rippleIndex+1)%8;this.lastRipple=time;
      }
    }
    rippleData(){return this.ripples;}
    camera(){
      return[this.position[0],this.position[1]+(this.bobEnabled?this.bob:0),this.position[2]];
    }
    forward(){
      const cp=Math.cos(this.pitch);return[-Math.sin(this.yaw)*cp,Math.sin(this.pitch),-Math.cos(this.yaw)*cp];
    }
    snapshot(){return{position:[...this.position],ground:this.world.height(this.position[0],this.position[2]),velocity:[...this.velocity],grounded:this.grounded,inWater:this.inWater,yaw:this.yaw,pitch:this.pitch,distance:this.distance};}
  }
  F.Player=Player;
})(window.Forest);
