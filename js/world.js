/* Deterministic terrain field, instanced forest distribution and colliders. */
'use strict';
(function(F){
  const {noise,fbm,smooth,rng,clamp,V}=F.math;
  const RADIUS=112;
  function pathX(z){return 3.4*Math.sin(z*.042)+1.5*Math.sin(z*.089+1.1);}
  function creekX(z){return 17.5+6.3*Math.sin(z*.036+.65)+1.5*Math.sin(z*.11);}
  function baseHeight(x,z){
    return fbm(x*.021,z*.021,4)*3.7+noise(x*.075+9,z*.075)*.42+smooth(32,110,Math.hypot(x,z))*7;
  }
  const creekLevel=z=>-.7+Math.sin(z*.024)*.45;
  function pathDistance(x,z){return Math.abs(x-pathX(z))/Math.sqrt(1+Math.pow(.143*Math.cos(z*.042)+.1335*Math.cos(z*.089+1.1),2));}
  function creekDistance(x,z){return Math.abs(x-creekX(z))/Math.sqrt(1+Math.pow(.227*Math.cos(z*.036+.65)+.165*Math.cos(z*.11),2));}
  function height(x,z){
    let h=baseHeight(x,z);
    const pd=pathDistance(x,z), pm=1-smooth(.9,2.7,pd);
    if(pm>0)h=F.math.lerp(h,baseHeight(pathX(z),z),pm*.65);
    const cd=creekDistance(x,z),cm=1-smooth(1.5,4.4,cd);
    if(cm>0)h=F.math.lerp(h,creekLevel(z)-.38,cm);
    return h;
  }
  function normal(x,z){const e=.18;return V.normalize([height(x-e,z)-height(x+e,z),e*2,height(x,z-e)-height(x,z+e)]);}
  function slope(x,z){const n=normal(x,z);return Math.acos(clamp(n[1],-1,1));}
  function clearForTree(x,z){return pathDistance(x,z)>2.3&&creekDistance(x,z)>3.3;}
  const COLORS={
    maple:[1.0,.245,.043],red:[.76,.077,.022],orange:[1.0,.42,.052],gold:[1.0,.67,.065],oak:[.65,.30,.055]
  };
  function treeColor(type,r,moist){
    if(type===0)return r<.40?COLORS.red:r<.8?COLORS.maple:COLORS.orange;
    if(type===1)return COLORS.gold;
    return moist>.1?[.70,.42,.085]:COLORS.oak;
  }
  function makeInstance(x,z,scale,type,r,color,angle){
    return {position:[x,height(x,z)-.06,z],scale:Array.isArray(scale)?scale:[scale,scale,scale],rotation:angle===undefined?r()*Math.PI*2:angle,phase:r()*40,color:color||[1,1,1]};
  }
  F.createWorld=function(onProgress){
    const random=rng(219071),trees=[[],[],[]],colliders=[],grid=new Map(),saplings=[];
    const addCollider=(x,z,r,h,type=0)=>{
      const c={x,z,r,h,type},index=colliders.length;colliders.push(c);
      const range=Math.ceil(r/5);
      const gx=Math.floor(x/5),gz=Math.floor(z/5);
      for(let a=gx-range;a<=gx+range;a++)for(let b=gz-range;b<=gz+range;b++){
        const key=a+','+b;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(index);
      }
    };
    // Hand-composed foreground: one copper frame, one luminous ginkgo, a quiet opening ahead.
    const heroes=[[-6.8,18,1.20,0],[7.7,1,1.24,1],[-7.3,-12,1.03,0],[8.8,-25,.92,0],[-10.1,33,1.12,2],[13.0,21,1.0,1],[-7,-38,1.0,1],[6.3,-53,1.12,0],[-11,-62,.97,2]];
    for(const [x,z,s,t]of heroes){
      const instance=makeInstance(x,z,s,t,random,treeColor(t,random(),noise(x*.04,z*.04)));
      trees[t].push(instance);
    }
    let attempts=0;
    while(trees[0].length+trees[1].length+trees[2].length<490&&attempts++<8000){
      const a=random()*Math.PI*2,r=Math.sqrt(random())*RADIUS;
      const x=Math.cos(a)*r,z=Math.sin(a)*r;
      if(!clearForTree(x,z))continue;
      if(Math.abs(x)<13&&z>1&&z<48&&random()<.88)continue; // breathing room around the initial camera
      let type=random()<.42?0:random()<.47?1:2;
      if(z>20&&x<-12)type=random()<.75?0:type;
      if(x>10&&z<0)type=random()<.62?1:type;
      const scale=.65+random()*.67+(r>75?random()*.25:0);
      let tooClose=false;
      for(const c of nearby(x,z,4.4)){if(Math.hypot(x-c.x,z-c.z)<3.7){tooClose=true;break;}}
      if(tooClose)continue;
      trees[type].push(makeInstance(x,z,scale,type,random,treeColor(type,random(),noise(x*.03,z*.03))));
    }
    function addTreeCollider(instance,type){
      const profile=F.geometry.createTree(type,3041+type*971,0).trunkProfile;
      const co=Math.cos(instance.rotation),si=Math.sin(instance.rotation),ground=instance.position[1];
      for(let i=0;i<profile.length-1;i++){
        const a=profile[i],b=profile[i+1];
        const localX=(a[0]+b[0])*.5*instance.scale[0],localZ=(a[2]+b[2])*.5*instance.scale[2];
        const x=instance.position[0]+co*localX+si*localZ,z=instance.position[2]-si*localX+co*localZ;
        const h=ground+(a[1]+b[1])*.5*instance.scale[1];
        const c={x,z,r:(a[3]+b[3])*.5*instance.scale[0],y:h,h:0,type:0},index=colliders.length;colliders.push(c);
        const gx=Math.floor(x/5),gz=Math.floor(z/5),key=gx+','+gz;
        if(!grid.has(key))grid.set(key,[]);grid.get(key).push(index);
      }
    }
    function nearby(x,z,r){
      const set=new Set(),out=[];
      for(let a=Math.floor((x-r)/5);a<=Math.floor((x+r)/5);a++)for(let b=Math.floor((z-r)/5);b<=Math.floor((z+r)/5);b++){
        const bucket=grid.get(a+','+b);if(bucket)for(const i of bucket)if(!set.has(i)){set.add(i);out.push(colliders[i]);}
      }return out;
    }
    // A distant ring of layered hills is geometry, not a photographic backdrop.
    const mountains=[];
    for(const list of trees)for(let i=0;i<list.length;i++)addTreeCollider(list[i],trees.indexOf(list));
    const ferns=[],grasses=[],rocks=[],groundLeaves=[],logs=[];
    for(let i=0;i<10500;i++){
      const x=(random()-.5)*150,z=(random()-.5)*160-14;
      if(Math.hypot(x,z)>92||creekDistance(x,z)<1.65||pathDistance(x,z)<1.0)continue;
      const scale=.48+random()*.82;
      ferns.push(makeInstance(x,z,scale,0,random,[.24+random()*.10,.31+random()*.11,.085+random()*.055]));
    }
    for(let i=0;i<20000;i++){
      const x=(random()-.5)*160,z=(random()-.5)*170-10;
      if(Math.hypot(x,z)>100||creekDistance(x,z)<1.4||pathDistance(x,z)<.85)continue;
      grasses.push(makeInstance(x,z,[.4+random()*.55,.30+random()*.55,.4+random()*.55],0,random,[.32+random()*.15,.30+random()*.12,.105+random()*.065]));
    }
    for(let i=0;i<290;i++){
      const z=(random()-.5)*165,x=creekX(z)+(random()<.5?-1:1)*(1.6+random()*3.7);
      const s=.16+random()*.65;
      rocks.push(makeInstance(x,z,[s*(1+random()*.8),s*.65,s],0,random,[.45+random()*.2,.45+random()*.18,.38+random()*.14]));
      if(s>.38)addCollider(x,z,s*.85,s*1.2,1);
    }
    for(let i=0;i<23;i++){
      const x=(random()-.5)*95,z=(random()-.5)*100-18;
      if(pathDistance(x,z)<2.5||creekDistance(x,z)<3.3)continue;
      const s=.6+random()*.8;
      rocks.push(makeInstance(x,z,[s*1.4,s,s*1.1],0,random,[.47,.47,.40]));addCollider(x,z,s*1.03,s,1);
    }
    for(let i=0;i<11;i++){
      const x=(random()-.5)*50-12,z=(random()-.5)*75-12;
      if(pathDistance(x,z)<2.5||creekDistance(x,z)<4)continue;
      const angle=random()*Math.PI*2,s=.6+random()*.6;
      logs.push(makeInstance(x,z,s,0,random,[.65,.56,.39],angle));
      addCollider(x,z,.8*s,1,2);
    }
    for(let i=0;i<36000;i++){
      const x=(random()-.5)*145,z=(random()-.5)*165-7;
      if(Math.hypot(x,z)>87||creekDistance(x,z)<1.1)continue;
      const r=random(),color=r<.38?[.75+random()*.25,.20+random()*.18,.026]:r<.78?[1,.49+random()*.24,.035]:[.51+random()*.2,.29+random()*.13,.04];
      groundLeaves.push(makeInstance(x,z,.14+random()*.15,0,random,color));
    }
    for(let i=0;i<90;i++){
      const x=(random()-.5)*110,z=(random()-.5)*125;
      if(!clearForTree(x,z))continue;
      saplings.push(makeInstance(x,z,.13+random()*.14,random()<.5?0:1,random,treeColor(random()<.5?0:1,random(),0)));
    }
    const viewpoints={
      path:{name:'林间小径',description:'风过林梢，光影随行',x:pathX(34),z:34,yaw:-.035,pitch:.075},
      creek:{name:'溪畔听风',description:'一溪秋水，半树金声',x:creekX(12)-3.5,z:12,yaw:-1.27,pitch:-.10},
      overlook:{name:'远山层林',description:'万叶着色，远山含烟',x:pathX(-62),z:-62,yaw:Math.PI+.08,pitch:.045}
    };
    return {RADIUS,pathX,creekX,pathDistance,creekDistance,creekLevel,height,normal,slope,trees,ferns,grasses,rocks,groundLeaves,logs,saplings,colliders,nearby,viewpoints,mountains};
  };
})(window.Forest);
