/* Procedural geometry: distinct tree individuals, continuous surfaces and real leaf thickness. */
'use strict';
(function(F){
  const {rng,V,TAU,lerp,clamp}=F.math;
  class Mesh {
    constructor(){this.vertices=[];this.indices=[];}
    vertex(p,n,uv=[0,0],color=[1,1,1],flex=0,leaf=0){this.vertices.push(p[0],p[1],p[2],n[0],n[1],n[2],uv[0],uv[1],color[0],color[1],color[2],flex,leaf);return this.vertices.length/13-1;}
    tri(a,b,c){this.indices.push(a,b,c);}
    quad(a,b,c,d){this.tri(a,b,c);this.tri(a,c,d);}
    finish(){return{vertices:new Float32Array(this.vertices),indices:new Uint32Array(this.indices),triangles:this.indices.length/3};}
  }
  function frame(direction){const n=V.normalize(direction),a=Math.abs(n[1])>.92?[1,0,0]:[0,1,0],u=V.normalize(V.cross(a,n)),v=V.normalize(V.cross(n,u));return[n,u,v];}
  function smoothPath(points,steps=2){
    const result=[];
    for(let i=0;i<points.length-1;i++){
      const a=points[Math.max(0,i-1)],b=points[i],c=points[i+1],d=points[Math.min(points.length-1,i+2)];
      for(let j=0;j<steps;j++){
        const t=j/steps,t2=t*t,t3=t2*t;
        result.push([0,1,2].map(k=>.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t2+(-a[k]+3*b[k]-3*c[k]+d[k])*t3)));
      }
    }result.push(points[points.length-1]);return result;
  }
  function tube(mesh,points,radii,sides=7,color=[.28,.22,.14],flexStart=0,flexEnd=0){
    const rings=[];
    for(let j=0;j<points.length;j++){
      const d=j===0?V.sub(points[1],points[0]):j===points.length-1?V.sub(points[j],points[j-1]):V.sub(points[j+1],points[j-1]);
      const [n,u,v]=frame(d),ring=[];
      for(let i=0;i<=sides;i++){
        const angle=i/sides*TAU,co=Math.cos(angle),si=Math.sin(angle);
        const nn=V.normalize(V.add(V.add(V.scale(u,co),V.scale(v,si)),V.scale(n,Math.sin(i*2.4+j*.8)*.025)));
        const p=V.add(points[j],V.scale(nn,radii[j]));
        ring.push(mesh.vertex(p,nn,[i/sides,(points[j][1]+points[j][0])*.24],color,lerp(flexStart,flexEnd,j/(points.length-1)),0));
      }rings.push(ring);
    }
    for(let j=0;j<rings.length-1;j++)for(let i=0;i<sides;i++)mesh.quad(rings[j][i],rings[j][i+1],rings[j+1][i+1],rings[j+1][i]);
    const last=points.length-1,[n]=frame(V.sub(points[last],points[last-1]));
    const center=mesh.vertex(points[last],n,[.5,.5],color,flexEnd,0);
    for(let i=0;i<sides;i++)mesh.tri(rings[last][i],rings[last][i+1],center);
  }
  function branch(mesh,a,b,r0,r1,random,color,flex0=.1,flex1=.8,sides=6){
    const delta=V.sub(b,a),length=V.length(delta),bend=V.scale([random()-.5,random()*.65,random()-.5],length*.22);
    const middle=V.add(V.add(a,V.scale(delta,.5)),bend);
    const path=smoothPath([a,middle,b],2);
    const radii=path.map((_,i)=>lerp(r0,r1,Math.pow(i/(path.length-1),.84)));
    tube(mesh,path,radii,sides,color,flex0,flex1);
    return path;
  }
  function leaf(mesh,origin,direction,size,type,random,shade=1,flex=1,lod=0,form=null){
    const [forward,side,normal]=frame(direction);
    const twist=form?form.twist:(random()-.5)*1.2,curl=form?form.curl:.12+random()*.38;
    const droop=form?form.droop:random()*.35,asymmetry=form?form.asymmetry:.84+random()*.34;
    const thickness=form?form.thickness:.005+random()*.0025;
    const widthScale=form?form.width:.84+random()*.30,phase=random()*TAU;
    const co=Math.cos(twist),si=Math.sin(twist);
    const U=V.add(V.scale(side,co),V.scale(normal,si)),N=V.normalize(V.sub(V.scale(normal,co),V.scale(side,si)));
    const outline=[];
    function surface(t,q,sign){
      const width=(type===1?Math.sin(t*Math.PI*.82)*.69:type===2?Math.sin(t*Math.PI)*.40:Math.pow(Math.sin(t*Math.PI),.60)*.57)*widthScale;
      const lobes=type===0?(.38+.62*Math.pow(Math.abs(Math.cos(t*Math.PI*3.5)),.48)):type===2?(.82+.18*Math.cos(t*Math.PI*7)):1;
      const teeth=type===1?1+.018*Math.sin(t*73+phase)+.012*Math.sin(t*137+phase):1+.040*Math.sin(t*83+phase)+.022*Math.sin(t*157+phase);
      const x=q*width*lobes*teeth*(q<0?asymmetry:1);
      const y=t*1.16-.10;
      const fold=Math.abs(q)*curl*.15+Math.pow(t,2)*droop*.18;
      const wave=Math.sin(t*9+phase+q*2.2)*.024*q*q;
      const midrib=Math.exp(-q*q*36)*.017;
      const z=(fold+wave+midrib)*size+sign*thickness*.5;
      return V.add(origin,V.add(V.add(V.scale(U,x*size),V.scale(forward,y*size)),V.scale(N,z)));
    }
    const rows=lod?3:5,cols=lod?3:5,grid=lod?[[]]:[[],[]];
    const surfaces=lod?1:2;
    for(let signIndex=0;signIndex<surfaces;signIndex++){
      const sign=signIndex===0?1:-1;
      for(let i=0;i<rows;i++){
        const t=.04+i/(rows-1)*.92,row=[];
        for(let j=0;j<cols;j++){
          const q=j/(cols-1)*2-1,p=surface(t,q,sign);
          const du=V.sub(surface(Math.min(t+.01,.98),q,sign),surface(Math.max(t-.01,.02),q,sign));
          const dv=V.sub(surface(t,Math.min(q+.03,1),sign),surface(t,Math.max(q-.03,-1),sign));
          const n=V.normalize(V.scale(V.cross(dv,du),sign));
          const edge=Math.abs(q),shadeLocal=shade*(.96+Math.sin(t*8+phase)*.045)*(1-edge*.07);
          row.push(mesh.vertex(p,n,[q*.5+.5,t],[shadeLocal,shadeLocal,shadeLocal],flex,1));
        }grid[signIndex].push(row);
      }
    }
    for(let s=0;s<surfaces;s++)for(let i=0;i<rows-1;i++)for(let j=0;j<cols-1;j++){
      const a=grid[s][i][j],b=grid[s][i][j+1],c=grid[s][i+1][j+1],d=grid[s][i+1][j];
      if(s===0)mesh.quad(a,b,c,d);else mesh.quad(d,c,b,a);
    }
    if(!lod){
      for(const j of [0,cols-1])for(let i=0;i<rows-1;i++){
        const a=grid[0][i][j],b=grid[0][i+1][j],c=grid[1][i+1][j],d=grid[1][i][j];
        if(j===0)mesh.quad(d,c,b,a);else mesh.quad(a,b,c,d);
      }
      for(const i of [0,rows-1])for(let j=0;j<cols-1;j++){
        const a=grid[0][i][j],b=grid[0][i][j+1],c=grid[1][i][j+1],d=grid[1][i][j];
        if(i===0)mesh.quad(a,b,c,d);else mesh.quad(d,c,b,a);
      }
    }
    // A thin petiole is part of the same bending hierarchy, not a detached billboard.
    if(!lod){
      const a=V.sub(origin,V.scale(forward,size*.20)),b=origin,w=size*.010;
      const color=[shade*.8,shade*.82,shade*.60];
      const i0=mesh.vertex(V.sub(a,V.scale(U,w)),N,[0,0],color,flex,1),i1=mesh.vertex(V.add(a,V.scale(U,w)),N,[1,0],color,flex,1);
      const i2=mesh.vertex(V.add(b,V.scale(U,w)),N,[1,.2],color,flex,1),i3=mesh.vertex(V.sub(b,V.scale(U,w)),N,[0,.2],color,flex,1);mesh.quad(i0,i1,i2,i3);
    }
  }
  function createTree(type,seed,lod=0,variant=0){
    const random=rng(seed+variant*15331),wood=new Mesh(),foliage=new Mesh();
    const shape=[{height:1,width:1,lean:.35},{height:.92,width:1.17,lean:-.6},{height:1.10,width:.90,lean:.6},{height:.98,width:1.05,lean:-.15}][variant%4];
    const h=(type===2?12.8:type===1?14.8:11.4)*shape.height;
    const bendX=shape.lean+(random()-.5)*.40,bendZ=(random()-.5)*.60;
    const baseRadius=(type===2?.42:type===1?.29:.32)*(1+(random()-.5)*.20);
    const trunk=[];
    for(let i=0;i<14;i++){
      const t=i/13;
      trunk.push([bendX*t*t+Math.sin(t*5+variant)*.11*t,h*t,bendZ*t*t+Math.sin(t*4+variant)*.13*t]);
    }
    const radii=trunk.map((p,i)=>baseRadius*Math.pow(1-i/14,1.22)+.009+(i===0?baseRadius*.48:0));
    tube(wood,smoothPath(trunk,1),radii,lod?6:9,[.30,.265,.20],0,.25);
    for(let i=0;i<5;i++){
      const a=i/5*TAU+random()*.65,rr=baseRadius*(1.6+random()*.9);
      tube(wood,smoothPath([[Math.cos(a)*rr,.01,Math.sin(a)*rr],[Math.cos(a)*baseRadius*.7,.38,Math.sin(a)*baseRadius*.7],[trunk[0][0],1.3,trunk[0][2]]],2),[.012,baseRadius*.35,baseRadius*.44,baseRadius*.4,baseRadius*.44],5,[.26,.24,.16],0,.03);
    }
    const count=lod?17:type===1?28:26;
    for(let i=0;i<count;i++){
      const t=(i+random()*.55)/count,angle=i*2.39996+random()*.82+variant*.4;
      const y=h*(type===2?.32:.29)+t*h*.59;
      const ix=Math.min(12,Math.floor(y/h*13)),trunkPoint=[trunk[ix][0],y,trunk[ix][2]];
      const crown=Math.sin(Math.pow(t,.74)*Math.PI)*.79+.25;
      const reach=(type===1?3.3:type===2?4.1:3.5)*crown*shape.width*(.70+random()*.48);
      const rise=(type===1?1.15:type===2?.85:1.05)+random()*1.8;
      const end=[trunkPoint[0]+Math.cos(angle)*reach,y+rise,trunkPoint[2]+Math.sin(angle)*reach];
      const curve=branch(wood,trunkPoint,end,baseRadius*.37*(1-t*.68),.009+(.018*(1-t)),random,[.31,.27,.19],y/h*.40,.76,lod?4:6);
      const clusters=lod?2:3;
      for(let c=0;c<clusters;c++){
        const f=.50+c/(clusters-1)*.47,index=Math.min(curve.length-1,Math.floor(f*(curve.length-1)));
        const start=curve[index],a=angle+(random()-.5)*1.7;
        const twigEnd=V.add(start,[Math.cos(a)*(.35+random()*.8),.08+random()*.68,Math.sin(a)*(.35+random()*.8)]);
        branch(wood,start,twigEnd,.020*(1-t*.60),.0045,random,[.28,.245,.17],.52,.94,lod?3:4);
        const leaves=lod?7:type===1?18:15;
        for(let k=0;k<leaves;k++){
          const along=.15+random()*.85,origin=V.add(start,V.scale(V.sub(twigEnd,start),along));
          const az=a+(k%2?1:-1)*(.50+random()*1.2)+(random()-.5)*.4;
          const spread=.06+random()*.60;
          const attach=V.add(origin,[Math.cos(az)*spread,(random()-.42)*.46,Math.sin(az)*spread]);
          const d=V.normalize([Math.cos(az)*(.75+random()*.5),random()*.85-.43,Math.sin(az)*(.75+random()*.5)]);
          const size=(type===1?.37:type===2?.43:.39)*(.65+random()*.70)*(lod?2.05:1);
          const shade=.80+random()*.26;
          const form={twist:(random()-.5)*2.5,curl:.04+random()*.62,droop:random()*.75,asymmetry:.73+random()*.52,width:.73+random()*.47,thickness:.0028+random()*.0035};
          leaf(foliage,attach,d,size,type,random,shade,.82+random()*.18,lod,form);
          if(!lod&&k%7===0)branch(wood,origin,attach,.003,.001,random,[.32,.27,.15],.82,1,3);
        }
      }
    }
    return{wood:wood.finish(),leaves:foliage.finish(),height:h,trunkProfile:trunk.map((p,i)=>[p[0],p[1],p[2],radii[i]]),variant};
  }
  function createFern(seed,lod=0){
    const random=rng(seed),mesh=new Mesh();
    for(let f=0;f<(lod?4:6);f++){
      const angle=f/(lod?4:6)*TAU+random()*.65,dir=[Math.cos(angle),0,Math.sin(angle)],side=[-dir[2],0,dir[0]],length=.65+random()*.65;
      const points=[];
      for(let i=0;i<11;i++){
        const t=i/10,r=t*length,y=.04+Math.sin(t*Math.PI*.91)*length*.66;
        points.push([dir[0]*r,y,dir[2]*r]);
      }
      tube(mesh,points,points.map((_,i)=>.008*(1-i/12)+.001),3,[.27,.34,.12],0,1);
      for(let i=1;i<(lod?8:11);i++){
        const t=i/11,center=points[i],l=length*.26*Math.sin(t*Math.PI)*(.8+random()*.28);
        for(const sign of [-1,1]){
          const tip=[center[0]+side[0]*l*sign+dir[0]*l*.32,center[1]+l*.09,center[2]+side[2]*l*sign+dir[2]*l*.32];
          const mid=[(center[0]+tip[0])*.5,(center[1]+tip[1])*.5+.035,(center[2]+tip[2])*.5];
          const n=V.normalize([dir[0]*.13,1,dir[2]*.13]),color=[.75+random()*.2,.80+random()*.18,.60];
          const w=l*.09;
          const a=mesh.vertex(center,n,[0,t],color,t,1),b=mesh.vertex(V.add(mid,V.scale(dir,w)),n,[.5,t],color,t,1);
          const c=mesh.vertex(tip,n,[1,t],color,t,1),d=mesh.vertex(V.sub(mid,V.scale(dir,w)),n,[.5,t],color,t,1);mesh.quad(a,b,c,d);
          if(!lod&&i<9)for(let j=1;j<3;j++){
            const tt=j/3,p=V.add(center,V.scale(V.sub(tip,center),tt)),ll=l*.19*(1-tt);
            for(const s of [-1,1]){
              const q=V.add(p,[dir[0]*ll*s+side[0]*ll*.23*sign,.015,dir[2]*ll*s+side[2]*ll*.23*sign]);
              const v0=mesh.vertex(V.sub(p,V.scale(side,.008)),n,[0,0],color,t,1),v1=mesh.vertex(V.add(p,V.scale(side,.008)),n,[1,0],color,t,1),v2=mesh.vertex(q,n,[.5,1],color,t,1);mesh.tri(v0,v1,v2);
            }
          }
        }
      }
    }return mesh.finish();
  }
  function createGrass(seed){
    const random=rng(seed),mesh=new Mesh();
    for(let i=0;i<9;i++){
      const angle=random()*TAU,h=.23+random()*.65,w=.009+random()*.018,lean=.06+random()*.42;
      const side=[Math.cos(angle),0,Math.sin(angle)],forward=[-side[2],0,side[0]],color=[.68+random()*.25,.72+random()*.2,.48];
      const base=[(random()-.5)*.34,0,(random()-.5)*.34],ids=[];
      for(let j=0;j<4;j++){
        const t=j/3,p=V.add(base,[forward[0]*lean*t*t,h*t,forward[2]*lean*t*t]);
        const width=w*(1-t*.98),n=V.normalize([forward[0]*.7,.72,forward[2]*.7]);
        ids.push([mesh.vertex(V.sub(p,V.scale(side,width)),n,[0,t],color,t,1),mesh.vertex(V.add(p,V.scale(side,width)),n,[1,t],color,t,1)]);
      }for(let j=0;j<3;j++)mesh.quad(ids[j][0],ids[j][1],ids[j+1][1],ids[j+1][0]);
    }return mesh.finish();
  }
  function createRock(seed){
    const random=rng(seed),mesh=new Mesh(),rings=10,sides=16,rows=[];
    for(let j=0;j<=rings;j++){
      const v=j/rings,phi=v*Math.PI,row=[];
      for(let i=0;i<=sides;i++){
        const theta=i/sides*TAU;
        const n=[Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta)];
        const r=.8+F.math.noise(n[0]*3+seed,n[2]*3+n[1]*2)*.14+random()*.025;
        const p=[n[0]*r,n[1]*r*.76,n[2]*r];
        row.push(mesh.vertex(p,n,[i/sides,v],[1,1,1],0,0));
      }rows.push(row);
    }for(let j=0;j<rings;j++)for(let i=0;i<sides;i++)mesh.quad(rows[j][i],rows[j+1][i],rows[j+1][i+1],rows[j][i+1]);
    return mesh.finish();
  }
  function createLog(){
    const m=new Mesh(),points=smoothPath([[-2.4,.30,0],[-1.4,.36,.05],[0,.34,0],[1.3,.43,-.04],[2.4,.38,.03]],2);
    tube(m,points,points.map((_,i)=>lerp(.29,.17,i/(points.length-1))),10,[.34,.27,.17],0,.05);
    branch(m,[.7,.35,0],[1.0,1.1,.8],.10,.025,rng(77),[.32,.26,.15],0,.1,6);
    return m.finish();
  }
  function createTerrain(world,extent=115,step=1.45){
    const mesh=new Mesh(),rows=[];
    for(let z=-extent;z<=extent;z+=step){
      const row=[];
      for(let x=-extent;x<=extent;x+=step){
        const p=[x,world.height(x,z),z],n=world.normal(x,z);
        const patch=F.math.fbm(x*.075,z*.075,3),color=[.62+patch*.19,.55+patch*.16,.33+patch*.11];
        row.push(mesh.vertex(p,n,[x*.20,z*.20],color,0,0));
      }rows.push(row);
    }for(let j=0;j<rows.length-1;j++)for(let i=0;i<rows[j].length-1;i++)mesh.quad(rows[j][i],rows[j][i+1],rows[j+1][i+1],rows[j+1][i]);
    return mesh.finish();
  }
  function createWater(world){
    const m=new Mesh(),rows=[];
    for(let z=-115;z<=115;z+=.85){
      const center=world.creekX(z),width=world.creekWidth(z)+.40,row=[];
      for(let j=0;j<13;j++){
        const fraction=j/12*2-1,x=center+fraction*width,y=world.creekLevel(z)+.012;
        const depth=Math.max(0,world.waterDepth(x,z));
        row.push(m.vertex([x,y,z],[0,1,0],[fraction*.5+.5,z*.14],[depth,depth,depth],0,0));
        const flow=world.flowAt(x,z),index=m.vertices.length/13-1;
        m.vertices[index*13+9]=flow[0];m.vertices[index*13+10]=flow[1];m.vertices[index*13+11]=depth;
        m.vertices[index*13+4]=flow[4];
      }rows.push(row);
    }
    for(let j=0;j<rows.length-1;j++)for(let i=0;i<12;i++)m.quad(rows[j][i],rows[j][i+1],rows[j+1][i+1],rows[j+1][i]);
    return m.finish();
  }
  function createMountains(){
    const m=new Mesh();
    for(let ring=0;ring<3;ring++){
      const radius=145+ring*52,rows=[];
      for(let i=0;i<=128;i++){
        const a=i/128*TAU,x=Math.cos(a),z=Math.sin(a);
        const top=15+ring*12+F.math.fbm(x*4+ring,z*4)*22+F.math.noise(x*17,z*17)*5;
        const color=ring===0?[.20,.255,.16]:ring===1?[.255,.30,.215]:[.32,.36,.29];
        const row=[];
        for(const [r,y]of [[radius-20,-6],[radius,top],[radius+48,top*.65]])row.push(m.vertex([x*r,y,z*r],[0,.65,.3],[i/128,ring],[...color],0,0));rows.push(row);
      }for(let i=0;i<128;i++)for(let j=0;j<2;j++)m.quad(rows[i][j],rows[i+1][j],rows[i+1][j+1],rows[i][j+1]);
    }return m.finish();
  }
  function createGroundLeaf(){const m=new Mesh();leaf(m,[0,.012,0],[0,0,1],1,0,rng(91),1,0,1,{twist:.15,curl:.35,droop:.18,asymmetry:.93,width:1,thickness:.005});return m.finish();}
  F.geometry={Mesh,leaf,createTree,createFern,createGrass,createRock,createLog,createTerrain,createWater,createMountains,createGroundLeaf};
})(window.Forest);
