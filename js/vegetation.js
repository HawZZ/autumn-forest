/* Procedural geometry. All foliage is folded, outlined mesh, never a flat billboard. */
'use strict';
(function(F){
  const {rng,V,TAU,lerp}=F.math;
  class Mesh {
    constructor(){this.vertices=[];this.indices=[];}
    vertex(p,n,uv=[0,0],color=[1,1,1],flex=0,leaf=0){this.vertices.push(p[0],p[1],p[2],n[0],n[1],n[2],uv[0],uv[1],color[0],color[1],color[2],flex,leaf);return this.vertices.length/13-1;}
    tri(a,b,c){this.indices.push(a,b,c);}
    quad(a,b,c,d){this.tri(a,b,c);this.tri(a,c,d);}
    finish(){return{vertices:new Float32Array(this.vertices),indices:new Uint32Array(this.indices),triangles:this.indices.length/3};}
  }
  function frame(direction){const n=V.normalize(direction),a=Math.abs(n[1])>.92?[1,0,0]:[0,1,0],u=V.normalize(V.cross(a,n)),v=V.normalize(V.cross(n,u));return[n,u,v];}
  function tube(mesh,points,radii,sides=7,color=[.28,.22,.14],flexStart=0,flexEnd=0){
    const rings=[];
    for(let j=0;j<points.length;j++){
      const d=j===0?V.sub(points[1],points[0]):j===points.length-1?V.sub(points[j],points[j-1]):V.sub(points[j+1],points[j-1]);
      const [n,u,v]=frame(d),ring=[];
      for(let i=0;i<=sides;i++){
        const angle=i/sides*TAU,co=Math.cos(angle),si=Math.sin(angle);
        const nn=V.normalize(V.add(V.scale(u,co),V.scale(v,si)));
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
    const delta=V.sub(b,a),bend=V.scale([random()-.5,random()*.4,random()-.5],V.length(delta)*.12),points=[];
    for(let i=0;i<5;i++){const t=i/4;points.push(V.add(V.add(a,V.scale(delta,t)),V.scale(bend,Math.sin(t*Math.PI))));}
    tube(mesh,points,[r0,lerp(r0,r1,.25),lerp(r0,r1,.55),lerp(r0,r1,.8),r1],sides,color,flex0,flex1);
    return points;
  }
  function leaf(mesh,origin,direction,size,type,random,shade=1,flex=1){
    // Local leaf: +Y midrib, +X across the blade, slight Z cup and curled tip.
    const [dir,side,normal]=frame(direction);
    const count=type===1?13:type===0?18:16;
    const outline=[];
    for(let i=0;i<count;i++){
      const a=i/(count-1)*Math.PI;
      let x,y;
      if(type===1){ // ginkgo's fan, including its small central cleft
        const theta=-1.22+a/ Math.PI*2.44;
        x=Math.sin(theta)*.68;y=Math.cos(theta)*.88+.17;
        y-=.105*Math.exp(-x*x*95);x*=1+.035*Math.sin(i*3.8);
      }else if(type===0){ // seven pointed palmate lobes
        const theta=-Math.PI+a; // from petiole, around the edge
        x=Math.sin(theta)*.68;y=Math.cos(theta)*.80+.32;
        const lobe=Math.pow(Math.abs(Math.cos(theta*3.5)),.42);
        const width=.40+.60*lobe;
        x*=width;y=.32+(y-.32)*(.59+.41*lobe);
        if(i%3===0){x*=1.17;y+=.08;}
      }else{ // softly lobed oak
        x=Math.sin(a)*.49;y=a/Math.PI*1.25;
        x*=.76+.24*Math.cos(a*6);
      }
      const curl=(Math.abs(x)*.13+y*y*.11+Math.sin(y*4)*.018)*size;
      outline.push([x*size,y*size,curl]);
    }
    const center=[0,.37*size,.085*size],uvc=[.5,.40];
    const transform=p=>V.add(origin,V.add(V.add(V.scale(side,p[0]),V.scale(dir,p[1])),V.scale(normal,p[2])));
    const n=V.normalize(V.add(normal,V.scale(dir,-.10)));
    const ci=mesh.vertex(transform(center),n,uvc,[shade,shade,shade],flex,1),ids=[];
    for(const p of outline)ids.push(mesh.vertex(transform(p),n,[p[0]/size/.9+.5,p[1]/size/1.3],[shade,shade,shade],flex,1));
    for(let i=0;i<ids.length-1;i++)mesh.tri(ci,ids[i],ids[i+1]);
    // Tiny petiole remains attached while the blade flutters.
    if(type!==2){
      const p0=V.sub(origin,V.scale(dir,size*.23)),p1=origin,w=size*.012;
      const a=mesh.vertex(V.sub(p0,V.scale(side,w)),n,[0,0],[shade,shade,shade],flex,1);
      const b=mesh.vertex(V.add(p0,V.scale(side,w)),n,[1,0],[shade,shade,shade],flex,1);
      const c=mesh.vertex(V.add(p1,V.scale(side,w)),n,[1,.3],[shade,shade,shade],flex,1);
      const d=mesh.vertex(V.sub(p1,V.scale(side,w)),n,[0,.3],[shade,shade,shade],flex,1);mesh.quad(a,b,c,d);
    }
  }
  function createTree(type,seed,lod=0){
    const random=rng(seed),wood=new Mesh(),foliage=new Mesh();
    const h=type===2?12.8:type===1?14.8:11.4;
    const bendX=(random()-.5)*.55,bendZ=(random()-.5)*.5;
    const baseRadius=type===2?.42:type===1?.29:.32;
    const trunk=[];let x=0,z=0;
    for(let i=0;i<15;i++){
      const t=i/14;x=bendX*t*t+Math.sin(t*5)*.09;z=bendZ*t*t+Math.cos(t*4)*.07;
      trunk.push([x,h*t,z]);
    }
    const radii=trunk.map((p,i)=>baseRadius*Math.pow(1-i/15,1.25)+.014+(i===0?baseRadius*.65:0));
    tube(wood,trunk,radii,lod?7:11,[.36,.30,.205],0,.32);
    for(let i=0;i<6;i++){
      const a=i/6*TAU+random()*.4,rr=baseRadius*(1.5+random());
      tube(wood,[[Math.cos(a)*rr,.04,Math.sin(a)*rr],[Math.cos(a)*baseRadius*.6,.5,Math.sin(a)*baseRadius*.6],[0,1.5,0]],[.02,baseRadius*.43,baseRadius*.5],6,[.28,.25,.16],0,.04);
    }
    const count=lod?19:type===1?31:29;
    for(let i=0;i<count;i++){
      const t=i/(count-1),angle=i*2.39996+random()*.6;
      const y=h*(type===2?.36:.32)+t*h*.58+(random()-.5)*.8;
      const trunkPoint=[x*(y/h),y,z*(y/h)];
      const crown=Math.sin(Math.pow(t,.65)*Math.PI)*.75+.30;
      const reach=(type===1?3.4:type===2?4.3:3.5)*crown*(.75+random()*.36);
      const rise=(type===1?1.3:type===2?.9:1.05)+random()*1.65;
      const end=[trunkPoint[0]+Math.cos(angle)*reach,y+rise,trunkPoint[2]+Math.sin(angle)*reach];
      branch(wood,trunkPoint,end,baseRadius*.39*(1-t*.58),.014+(.026*(1-t)),random,[.34,.28,.18],y/h*.5,.7,lod?5:7);
      const clusters=lod?2:3;
      for(let c=0;c<clusters;c++){
        const f=.48+c/(clusters-1)*.48;
        const start=V.add(trunkPoint,V.scale(V.sub(end,trunkPoint),f));
        const a=angle+(random()-.5)*1.6;
        const twigEnd=V.add(start,[Math.cos(a)*(.45+random()*.65),.15+random()*.65,Math.sin(a)*(.45+random()*.65)]);
        branch(wood,start,twigEnd,.025*(1-t*.55),.006,random,[.31,.25,.15],.5,.95,lod?4:5);
        const leaves=lod?6:type===1?12:10;
        for(let k=0;k<leaves;k++){
          const along=.18+random()*.92;
          const origin=V.add(start,V.scale(V.sub(twigEnd,start),along));
          const az=a+(k%2?1:-1)*(.55+random()*1.4);
          const spread=.18+random()*.6;
          const attach=V.add(origin,[Math.cos(az)*spread,(random()-.20)*.43,Math.sin(az)*spread]);
          const d=V.normalize([Math.cos(az)*(.75+random()*.5),random()*.85-.28,Math.sin(az)*(.75+random()*.5)]);
          const size=(type===1?.54:type===2?.60:.56)*(.73+random()*.5)*(lod?1.85:1);
          const shade=.72+random()*.34;
          leaf(foliage,attach,d,size,type,random,shade,.80+random()*.2);
          if(!lod&&k%4===0)branch(wood,origin,attach,.004,.0015,random,[.38,.32,.16],.8,1,3);
        }
      }
    }
    return{wood:wood.finish(),leaves:foliage.finish(),height:h,trunkProfile:trunk.map((p,i)=>[p[0],p[1],p[2],radii[i]])};
  }
  function createFern(seed){
    const random=rng(seed),mesh=new Mesh();
    for(let f=0;f<6;f++){
      const angle=f/6*TAU+random()*.35,dir=[Math.cos(angle),0,Math.sin(angle)],side=[-dir[2],0,dir[0]],length=.75+random()*.6;
      const points=[];
      for(let i=0;i<11;i++){
        const t=i/10,r=t*length,y=.04+Math.sin(t*Math.PI*.88)*length*.61;
        points.push([dir[0]*r,y,dir[2]*r]);
      }
      tube(mesh,points,points.map((_,i)=>.012*(1-i/12)+.001),3,[.34,.43,.10],0,1);
      for(let i=1;i<11;i++){
        const t=i/11,center=points[i],l=length*.28*Math.sin(t*Math.PI)*(.88+random()*.18);
        for(const sign of [-1,1]){
          const tip=[center[0]+side[0]*l*sign+dir[0]*l*.37,center[1]+l*.12,center[2]+side[2]*l*sign+dir[2]*l*.37];
          const midp=[(center[0]+tip[0])*.5,(center[1]+tip[1])*.5+.018,(center[2]+tip[2])*.5];
          const n=[0,1,0],c=[.76+random()*.24,.83+random()*.18,.57];
          const w=l*.105;
          const a=mesh.vertex(center,n,[0,t],c,t,1),b=mesh.vertex(V.add(midp,V.scale(dir,w)),n,[.5,t],c,t,1);
          const c1=mesh.vertex(tip,n,[1,t],c,t,1),d=mesh.vertex(V.sub(midp,V.scale(dir,w)),n,[.5,t],c,t,1);
          mesh.quad(a,b,c1,d);
          if(i<7)for(let j=1;j<3;j++){
            const tt=j/3,p=V.add(center,V.scale(V.sub(tip,center),tt)),ll=l*.2*(1-tt);
            for(const s of [-1,1]){
              const q=V.add(p,[dir[0]*ll*s+side[0]*ll*.25*sign,.008,dir[2]*ll*s+side[2]*ll*.25*sign]);
              const v0=mesh.vertex(V.sub(p,V.scale(side,.009)),n,[0,0],c,t,1),v1=mesh.vertex(V.add(p,V.scale(side,.009)),n,[1,0],c,t,1),v2=mesh.vertex(q,n,[.5,1],c,t,1);mesh.tri(v0,v1,v2);
            }
          }
        }
      }
    }return mesh.finish();
  }
  function createGrass(seed){
    const random=rng(seed),mesh=new Mesh();
    for(let i=0;i<11;i++){
      const angle=random()*TAU,h=.25+random()*.7,w=.014+random()*.018,lean=.08+random()*.38;
      const side=[Math.cos(angle),0,Math.sin(angle)],forward=[-side[2],0,side[0]],color=[.70+random()*.3,.77+random()*.2,.45];
      const base=[(random()-.5)*.38,0,(random()-.5)*.38],ids=[];
      for(let j=0;j<4;j++){
        const t=j/3,p=V.add(base,[forward[0]*lean*t*t,h*t,forward[2]*lean*t*t]);
        const width=w*(1-t*.95),n=V.normalize([forward[0],.35,forward[2]]);
        ids.push([mesh.vertex(V.sub(p,V.scale(side,width)),n,[0,t],color,t,1),mesh.vertex(V.add(p,V.scale(side,width)),n,[1,t],color,t,1)]);
      }for(let j=0;j<3;j++)mesh.quad(ids[j][0],ids[j][1],ids[j+1][1],ids[j+1][0]);
    }return mesh.finish();
  }
  function createRock(seed){
    const random=rng(seed),mesh=new Mesh(),rings=8,sides=12,rows=[];
    for(let j=0;j<=rings;j++){
      const v=j/rings,phi=v*Math.PI,row=[];
      for(let i=0;i<=sides;i++){
        const theta=i/sides*TAU;
        const n=[Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta)];
        const r=.8+F.math.noise(n[0]*3+seed,n[2]*3+n[1]*2)*.16+random()*.045;
        const p=[n[0]*r,n[1]*r*.78,n[2]*r];
        row.push(mesh.vertex(p,n,[i/sides,v],[1,1,1],0,0));
      }rows.push(row);
    }for(let j=0;j<rings;j++)for(let i=0;i<sides;i++)mesh.quad(rows[j][i],rows[j+1][i],rows[j+1][i+1],rows[j][i+1]);
    return mesh.finish();
  }
  function createLog(){
    const m=new Mesh(),points=[[-2.4,.30,0],[-1.4,.36,.05],[0,.34,0],[1.3,.43,-.04],[2.4,.38,.03]];
    tube(m,points,[.29,.27,.24,.20,.17],10,[.39,.29,.16],0,.05);
    branch(m,[.7,.35,0],[1.0,1.1,.8],.10,.03,rng(77),[.34,.26,.14],0,.1,6);
    return m.finish();
  }
  function createTerrain(world,extent=115,step=1.45){
    const mesh=new Mesh(),rows=[];
    for(let z=-extent;z<=extent;z+=step){
      const row=[];
      for(let x=-extent;x<=extent;x+=step){
        const p=[x,world.height(x,z),z],n=world.normal(x,z),path=world.pathDistance(x,z),creek=world.creekDistance(x,z);
        const patch=F.math.fbm(x*.075,z*.075,3),color=[.62+patch*.19,.55+patch*.16,.33+patch*.11];
        row.push(mesh.vertex(p,n,[x*.20,z*.20],color,0,0));
      }rows.push(row);
    }for(let j=0;j<rows.length-1;j++)for(let i=0;i<rows[j].length-1;i++)mesh.quad(rows[j][i],rows[j][i+1],rows[j+1][i+1],rows[j+1][i]);
    return mesh.finish();
  }
  function createWater(world){
    const m=new Mesh(),rows=[];
    for(let z=-115;z<=115;z+=1.35){
      const row=[];
      for(let j=0;j<9;j++){
        const offset=(j/8*2-1)*1.87,x=world.creekX(z)+offset;
        row.push(m.vertex([x,world.creekLevel(z)+.025,z],[0,1,0],[j/8,z*.08],[1,1,1],0,0));
      }rows.push(row);
    }for(let j=0;j<rows.length-1;j++)for(let i=0;i<8;i++)m.quad(rows[j][i],rows[j][i+1],rows[j+1][i+1],rows[j+1][i]);
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
  function createGroundLeaf(){const m=new Mesh();leaf(m,[0,.012,0],[0,0,1],1,0,rng(91),1,0);return m.finish();}
  F.geometry={Mesh,leaf,createTree,createFern,createGrass,createRock,createLog,createTerrain,createWater,createMountains,createGroundLeaf};
})(window.Forest);
