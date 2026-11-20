/* Continuous wildlife surfaces, articulated limb chains, fur and feather geometry.
   No spheres-as-animals, textures, downloaded models, or per-species scene copies. */
'use strict';
(function(F){
  const {V,rng,TAU,lerp}=F.math;
  class Skin{
    constructor(){this.positions=[];this.normals=[];this.colors=[];this.indices=[];}
    vertex(p,n,c){this.positions.push(...p);this.normals.push(...V.normalize(n));this.colors.push(...c);return this.positions.length/3-1;}
    face(a,b,c){this.indices.push(a,b,c);}
    quad(a,b,c,d){this.face(a,b,c);this.face(a,c,d);}
    triangle(a,b,c,color){const i=this.vertex(a,V.cross(V.sub(b,a),V.sub(c,a)),color),j=this.vertex(b,V.cross(V.sub(b,a),V.sub(c,a)),color),k=this.vertex(c,V.cross(V.sub(b,a),V.sub(c,a)),color);this.face(i,j,k);}
    finish(){return{positions:new Float32Array(this.positions),normals:new Float32Array(this.normals),colors:new Float32Array(this.colors),indices:new Uint32Array(this.indices),triangles:this.indices.length/3};}
  }
  function frame(dir){const n=V.normalize(dir),u=V.normalize(V.cross(Math.abs(n[1])>.92?[1,0,0]:[0,1,0],n)),v=V.normalize(V.cross(n,u));return[n,u,v];}
  // Each ring is elliptical but the connected surface can bend, pinch and change axis.
  // There are no disconnected spheres, visible seams or cylinder tails.
  function loft(skin,points,radii,color,options={}){
    const sides=options.sides||12,rows=[];
    const colors=Array.isArray(color[0])?color:null;
    for(let j=0;j<points.length;j++){
      const prev=points[Math.max(0,j-1)],next=points[Math.min(points.length-1,j+1)],dir=V.sub(next,prev),[n,u,v]=frame(dir),row=[];
      for(let i=0;i<=sides;i++){
        const angle=i/sides*TAU,co=Math.cos(angle),si=Math.sin(angle),r=Array.isArray(radii[j])?radii[j]:[radii[j],radii[j]];
        const ripple=options.fur?1+Math.sin(angle*17+j*1.6)*options.fur:1;
        const offset=V.add(V.scale(u,co*r[0]*ripple),V.scale(v,si*r[1]*ripple));
        const p=V.add(points[j],offset);
        const c=colors?colors[Math.min(colors.length-1,j)]:color;
        row.push(skin.vertex(p,V.normalize(offset),c));
      }rows.push(row);
    }
    for(let j=0;j<rows.length-1;j++)for(let i=0;i<sides;i++)skin.quad(rows[j][i],rows[j][i+1],rows[j+1][i+1],rows[j+1][i]);
    const startNormal=V.scale(frame(V.sub(points[1],points[0]))[0],-1),endNormal=frame(V.sub(points[points.length-1],points[points.length-2]))[0];
    const ca=skin.vertex(points[0],startNormal,colors?colors[0]:color),cb=skin.vertex(points[points.length-1],endNormal,colors?colors[colors.length-1]:color);
    for(let i=0;i<sides;i++){skin.face(ca,rows[0][i+1],rows[0][i]);skin.face(cb,rows[rows.length-1][i],rows[rows.length-1][i+1]);}
    return rows;
  }
  function smooth(points,steps=3){
    const out=[];
    for(let i=0;i<points.length-1;i++){
      const a=points[Math.max(0,i-1)],b=points[i],c=points[i+1],d=points[Math.min(points.length-1,i+2)];
      for(let j=0;j<steps;j++){
        const t=j/steps,t2=t*t,t3=t*t*t;
        out.push([0,1,2].map(k=>.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t2+(-a[k]+3*b[k]-3*c[k]+d[k])*t3)));
      }
    }out.push(points[points.length-1]);return out;
  }
  function interpolate(values,steps=3){
    const out=[];
    for(let i=0;i<values.length-1;i++)for(let j=0;j<steps;j++){
      const t=j/steps,a=values[i],b=values[i+1];
      out.push(Array.isArray(a)?a.map((value,k)=>lerp(value,b[k],t)):lerp(a,b,t));
    }
    out.push(values[values.length-1]);return out;
  }
  function organic(skin,points,radii,color,options={}){return loft(skin,smooth(points,options.steps||3),interpolate(radii,options.steps||3),color,options);}
  function ribbon(skin,points,widths,color,options={}){
    const sides=2,rows=[];
    for(let j=0;j<points.length;j++){
      const d=V.sub(points[Math.min(points.length-1,j+1)],points[Math.max(0,j-1)]),[n,u,v]=frame(d),r=widths[j],row=[];
      for(const [offset,depth]of [[-1,0],[0,.12],[1,0]])row.push(skin.vertex(V.add(V.add(points[j],V.scale(u,offset*r)),V.scale(v,depth*r)),n,color));
      rows.push(row);
    }
    for(let j=0;j<rows.length-1;j++)for(let k=0;k<2;k++)skin.quad(rows[j][k],rows[j][k+1],rows[j+1][k+1],rows[j+1][k]);
  }
  function furLock(skin,root,dir,length,width,color,options={}){
    const end=V.add(root,V.scale(dir,length)),middle=V.add(root,V.add(V.scale(dir,length*.55),options.bend||[0,.02,0]));
    const side=V.normalize(V.cross(dir,Math.abs(dir[1])>.8?[1,0,0]:[0,1,0]));
    const a=V.sub(root,V.scale(side,width*.5)),b=V.add(root,V.scale(side,width*.5));
    const c=V.add(middle,V.scale(side,width*.35)),d=V.sub(middle,V.scale(side,width*.35));
    skin.triangle(a,b,c,color);skin.triangle(a,c,d,color);skin.triangle(d,c,end,color);
    // A second offset blade gives the hair lock an actual edge, not a flat spot.
    if(options.thickness){
      const off=V.scale(options.normal||[0,1,0],options.thickness);
      skin.triangle(V.add(a,off),V.add(c,off),V.add(b,off),color);skin.triangle(V.add(d,off),V.add(end,off),V.add(c,off),color);
    }
  }
  function feather(skin,root,tip,width,color,shaftColor){
    const d=V.sub(tip,root),side=V.normalize(V.cross(d,[0,1,0])),mid=V.add(root,V.scale(d,.58)),ridge=V.add(mid,[0,width*.14,0]);
    const left=V.add(mid,V.scale(side,width)),right=V.sub(mid,V.scale(side,width));
    skin.triangle(root,left,ridge,color);skin.triangle(root,ridge,right,color);skin.triangle(left,tip,ridge,color);skin.triangle(ridge,tip,right,color);
    organic(skin,[root,V.add(root,V.scale(d,.5)),tip],[.0017,.0012,.0002],shaftColor||[.38,.36,.24],{sides:4,steps:1});
  }
  function deer(male=false){
    const parts=[],fur=[.33,.245,.145],dark=[.14,.10,.057],cream=[.58,.52,.37],white=[.76,.73,.60],hoof=[.046,.037,.026],eye=[.012,.010,.007],random=rng(3821);
    const add=(name,build,anchor)=>parts.push({name,anchor,mesh:(()=>{const s=new Skin();build(s);return s.finish();})()});
    add('body',s=>{
      // One continuous thorax / abdomen / rump surface, not a chain of body spheres.
      const points=[[0,1.12,.66],[0,1.17,.53],[0,1.17,.30],[0,1.10,.02],[0,1.07,-.24],[0,1.17,-.49],[0,1.30,-.58]];
      const radii=[[.13,.19],[.27,.34],[.32,.35],[.285,.31],[.25,.32],[.285,.39],[.23,.29]];
      loft(s,smooth(points,4),interpolate(radii,4),[fur,fur,fur,fur,[.37,.29,.18],fur,fur],{sides:24,fur:.018});
      // Scapula and haunch flow into the barrel with smaller blended patches.
      organic(s,[[0,1.19,-.47],[0,1.33,-.47],[0,1.48,-.54],[0,1.64,-.63],[0,1.80,-.69]],[[.235,.27],[.20,.23],[.155,.18],[.118,.14],[.085,.105]],fur,{sides:18});
      organic(s,[[0,1.40,.58],[0,1.48,.18],[0,1.51,-.22],[0,1.60,-.47]],[[.10,.065],[.13,.065],[.13,.06],[.085,.045]],dark,{sides:12});
      organic(s,[[0,1.19,.65],[0,1.21,.69],[0,1.25,.705],[0,1.27,.72]],[[.18,.22],[.15,.20],[.10,.16],[.035,.05]],white,{sides:18});
      organic(s,[[0,1.28,.66],[0,1.32,.81],[0,1.34,.92]],[[.048,.044],[.027,.026],[.010,.007]],fur,{sides:10});
      // Fine guard hairs break the silhouette without turning into large triangular thorns.
      for(let i=0;i<190;i++){
        const z=-.50+random()*1.10,a=random()*TAU;
        const width=.27*(1-Math.abs(z)*.3),y=1.17+Math.cos(a)*.32;
        const root=[Math.sin(a)*width,y,z];
        const dir=V.normalize([Math.sin(a)*.32,Math.cos(a)*.3,.35+random()*.25]);
        furLock(s,root,dir,.023+random()*.024,.008+random()*.006,random()>.78?cream:fur,{thickness:.0007,normal:[0,1,0]});
      }
      // The winter spots sit in the fur, subdued and narrow rather than white disks.
      for(const side of [-1,1])for(let row=0;row<3;row++)for(let i=0;i<6;i++){
        const z=-.40+i*.15+random()*.045,y=1.03+row*.13+random()*.04;
        const width=.29*Math.sqrt(Math.max(.2,1-Math.pow(z/.83,2)));
        const root=[side*(width+.007),y,z],dir=[side*.25,.16,.7];
        for(let j=0;j<3;j++)furLock(s,[root[0],root[1]+(j-1)*.012,root[2]],dir,.030+random()*.013,.011,[.52+random()*.04,.47+random()*.035,.34+random()*.025],{thickness:.0004});
      }
    },[0,0,0]);
    add('head',s=>{
      organic(s,[[0,.02,.01],[0,-.02,-.09],[0,-.13,-.17],[0,-.23,-.26],[0,-.29,-.33]],[[.125,.145],[.115,.14],[.08,.10],[.057,.078],[.05,.063]],fur,{sides:18});
      organic(s,[[0,-.22,-.27],[0,-.28,-.34],[0,-.305,-.385]],[[.056,.063],[.051,.054],[.041,.035]],dark,{sides:14});
      organic(s,[[0,-.295,-.372],[0,-.306,-.395]],[[.034,.024],[.027,.016]],eye,{sides:12});
      organic(s,[[0,-.10,-.12],[0,-.21,-.27],[0,-.285,-.335]],[[.042,.045],[.040,.047],[.033,.035]],cream,{sides:10});
      for(const side of [-1,1]){
        // Ear cartilage has a pinched base, tapered pointed tip and a concave inner fold.
        organic(s,[[side*.095,.055,.01],[side*.165,.16,.025],[side*.23,.30,.05],[side*.24,.43,.075]],[[.042,.033],[.052,.030],[.036,.020],[.001,.001]],fur,{sides:10});
        organic(s,[[side*.114,.075,-.012],[side*.17,.18,-.002],[side*.221,.31,.025],[side*.235,.385,.058]],[[.020,.013],[.032,.011],[.023,.008],[.001,.001]],cream,{sides:8});
        organic(s,[[side*.115,-.047,-.082],[side*.124,-.042,-.096]],[[.022,.025],[.017,.020]],eye,{sides:10});
        furLock(s,[side*.128,-.039,-.108],[side*.2,.2,-.6],.008,.006,white);
        furLock(s,[side*.020,-.290,-.385],[side*.2,.1,-.8],.012,.008,eye);
        for(let i=0;i<14;i++)furLock(s,[side*(.13+random()*.09),.09+random()*.22,.0],[side*.6,.3,.05],.018+random()*.022,.009,fur);
      }
      if(male){
        const antler=[.44,.36,.22];
        for(const side of [-1,1]){
          organic(s,[[side*.07,.02,.0],[side*.11,.17,.035],[side*.18,.34,.085],[side*.27,.52,.15],[side*.36,.69,.22]],[[.027,.029],[.023,.024],[.017,.019],[.011,.013],[.002,.002]],antler,{sides:9});
          organic(s,[[side*.12,.19,.04],[side*.23,.30,-.03],[side*.28,.40,-.10]],[[.016,.017],[.009,.010],[.0015,.0015]],antler,{sides:8});
          organic(s,[[side*.22,.42,.12],[side*.33,.50,.07],[side*.39,.57,.065]],[[.012,.013],[.007,.008],[.001,.001]],antler,{sides:8});
          organic(s,[[side*.30,.56,.18],[side*.41,.65,.20],[side*.46,.74,.19]],[[.009,.010],[.005,.006],[.001,.001]],antler,{sides:8});
        }
      }
    },[0,1.80,-.69]);
    for(const side of [-1,1])for(const front of [-1,1]){
      const x=side*.245,z=front<0?-.43:.43;
      add('leg',s=>{
        if(front<0){
          organic(s,[[0,0,0],[side*.014,-.20,.005],[side*.007,-.38,.055],[0,-.49,.045],[0,-.56,-.035],[0,-.77,-.015],[0,-.91,-.03]],[[.074,.086],[.060,.070],[.035,.040],[.040,.036],[.026,.028],[.022,.024],[.028,.027]],fur,{sides:12});
          organic(s,[[0,-.56,-.035],[0,-.76,-.015],[0,-.925,-.035]],[[.027,.029],[.021,.023],[.029,.025]],dark,{sides:10});
        }else{
          organic(s,[[0,0,0],[side*.024,-.17,-.07],[side*.010,-.37,-.11],[0,-.49,.055],[0,-.56,.10],[0,-.73,.03],[0,-.92,-.015]],[[.092,.105],[.070,.082],[.036,.045],[.042,.045],[.025,.029],[.021,.024],[.027,.027]],fur,{sides:12});
          organic(s,[[0,-.56,.10],[0,-.73,.03],[0,-.93,-.02]],[[.026,.028],[.021,.022],[.028,.025]],dark,{sides:10});
        }
        // Paired hoof capsules and a real front cleft.
        for(const half of [-1,1])organic(s,[[half*.013,-.925,-.035],[half*.014,-.964,-.058],[half*.012,-.962,-.095]],[[.016,.026],[.014,.021],[.011,.012]],hoof,{sides:7});
      },[x,1.03,z]);
    }
    add('tail',s=>{
      organic(s,[[0,0,0],[0,.025,.065],[0,.045,.13],[0,.052,.18]],[[.035,.032],[.030,.025],[.018,.018],[.003,.004]],fur,{sides:10});
      for(let i=0;i<28;i++){
        const a=random()*TAU,t=random();furLock(s,[Math.cos(a)*.021,.025+t*.024,.05+t*.12],[Math.cos(a)*.3,Math.sin(a)*.3,.7],.026,.009,i%3?cream:fur);
      }
    },[0,1.27,.69]);
    return parts;
  }
  function squirrel(){
    const parts=[],fur=[.34,.115,.036],dark=[.16,.052,.018],cream=[.63,.43,.23],eye=[.009,.007,.004],random=rng(9461);
    const add=(name,build,anchor)=>parts.push({name,anchor,mesh:(()=>{const s=new Skin();build(s);return s.finish();})()});
    add('body',s=>{
      const pts=[[0,.03,.075],[0,.11,.035],[0,.21,.01],[0,.31,-.015],[0,.39,-.04]];
      loft(s,smooth(pts,4),interpolate([[.040,.050],[.071,.080],[.089,.086],[.072,.064],[.048,.046]],4),[dark,fur,fur,fur,fur],{sides:20,fur:.022});
      organic(s,[[0,.065,-.010],[0,.16,-.055],[0,.27,-.068],[0,.345,-.070]],[[.031,.023],[.051,.025],[.053,.025],[.027,.018]],cream,{sides:14});
      for(const side of [-1,1]){
        organic(s,[[side*.049,.17,.04],[side*.073,.12,.052],[side*.074,.065,.016],[side*.062,.025,-.035]],[[.037,.046],[.037,.042],[.021,.028],[.020,.018]],fur,{sides:10});
        for(let toe=0;toe<4;toe++)organic(s,[[side*.062+(toe-1.5)*.009,.025,-.035],[side*.062+(toe-1.5)*.010,.018,-.073]],[[.006,.008],[.003,.004]],dark,{sides:5,steps:1});
      }
      for(let i=0;i<95;i++){
        const a=random()*TAU,y=.10+random()*.25,r=.071+Math.sin(y*11)*.017;
        furLock(s,[Math.sin(a)*r,y,Math.cos(a)*.055],[Math.sin(a)*.2,.65,Math.cos(a)*.2],.010+random()*.018,.005,random()>.8?cream:fur);
      }
    },[0,0,0]);
    add('head',s=>{
      organic(s,[[0,-.025,.0],[0,.01,-.014],[0,.015,-.05],[0,-.015,-.091],[0,-.032,-.119]],[[.047,.044],[.061,.054],[.052,.045],[.031,.030],[.017,.014]],fur,{sides:18});
      organic(s,[[0,-.025,-.095],[0,-.033,-.125]],[[.018,.016],[.012,.010]],eye,{sides:10});
      for(const side of [-1,1]){
        organic(s,[[side*.042,.04,-.006],[side*.055,.085,-.001],[side*.054,.134,.004],[side*.045,.170,.006]],[[.021,.017],[.026,.016],[.017,.010],[.001,.001]],fur,{sides:9});
        organic(s,[[side*.043,.05,-.013],[side*.053,.089,-.010],[side*.051,.13,-.005]],[[.011,.007],[.016,.008],[.008,.004]],cream,{sides:7});
        for(let i=0;i<9;i++)furLock(s,[side*(.046+random()*.012),.115+random()*.03,.002],[side*.14,.9,.06],.030+random()*.040,.0045,i%3?dark:fur);
        organic(s,[[side*.046,.009,-.052],[side*.052,.010,-.063]],[[.013,.014],[.010,.011]],eye,{sides:9});
        furLock(s,[side*.054,.013,-.068],[side*.25,.4,-.4],.005,.004,cream);
        for(let j=0;j<4;j++)organic(s,[[side*.022,-.020,-.099],[side*(.079+j*.011),-.024+j*.005,-.116]],[[.0009,.0008],[.0001,.0001]],cream,{sides:4,steps:1});
      }
    },[0,.405,-.031]);
    for(const side of [-1,1])add('arm',s=>{
      organic(s,[[0,0,0],[side*.007,-.038,-.013],[side*.003,-.073,-.049],[0,-.088,-.079]],[[.017,.019],[.013,.015],[.009,.011],[.011,.008]],fur,{sides:8});
      for(let j=0;j<4;j++)organic(s,[[(j-1.5)*.005,-.087,-.075],[(j-1.5)*.006,-.092,-.103],[(j-1.5)*.006,-.089,-.114]],[[.0038,.004],[.0026,.003],[.001,.001]],dark,{sides:5,steps:1});
    },[side*.062,.31,-.023]);
    add('tail',s=>{
      // A single swept tail, not a stack of balls. Fine radial guard hairs follow the bend.
      const pts=[[0,0,0],[0,.052,.055],[0,.16,.12],[0,.30,.145],[0,.43,.12],[0,.52,.045],[0,.53,-.015]];
      const radii=[[.018,.020],[.038,.041],[.059,.063],[.069,.073],[.058,.061],[.038,.039],[.004,.004]];
      loft(s,smooth(pts,5),interpolate(radii,5),[dark,fur,fur,fur,[.40,.17,.063],fur,dark],{sides:22,fur:.032});
      for(let i=0;i<230;i++){
        const t=random(),segment=Math.min(pts.length-2,Math.floor(t*(pts.length-1))),local=t*(pts.length-1)-segment;
        const a=V.lerp?null:null;
        const center=[lerp(pts[segment][0],pts[segment+1][0],local),lerp(pts[segment][1],pts[segment+1][1],local),lerp(pts[segment][2],pts[segment+1][2],local)];
        const r=lerp(radii[segment][0],radii[segment+1][0],local),angle=random()*TAU;
        const root=[Math.cos(angle)*r,center[1]+Math.sin(angle)*r*.5,center[2]+Math.sin(angle)*r*.5];
        furLock(s,root,[Math.cos(angle)*.28,.70,Math.sin(angle)*.25],.020+random()*.040,.005+random()*.004,random()>.82?cream:fur,{thickness:.0005});
      }
    },[0,.12,.058]);
    add('acorn',s=>{
      organic(s,[[0,-.025,0],[0,-.005,0],[0,.02,0],[0,.030,0]],[[.009,.009],[.019,.019],[.018,.018],[.017,.017]],[.29,.16,.051],{sides:12});
      organic(s,[[0,.019,0],[0,.029,0],[0,.035,0]],[[.020,.020],[.020,.020],[.012,.012]],dark,{sides:12});
      organic(s,[[0,.032,0],[0,.048,0]],[[.003,.003],[.001,.001]],dark,{sides:5});
    },[0,.24,-.16]);
    return parts;
  }
  function bird(){
    const parts=[],yellow=[.68,.54,.10],black=[.013,.019,.019],white=[.81,.80,.66],blue=[.15,.22,.26],random=rng(593);
    const add=(name,build,anchor)=>parts.push({name,anchor,mesh:(()=>{const s=new Skin();build(s);return s.finish();})()});
    add('body',s=>{
      organic(s,[[0,.035,.065],[0,.065,.025],[0,.094,-.015],[0,.129,-.035],[0,.145,-.04]],[[.023,.028],[.045,.043],[.048,.047],[.035,.031],[.029,.024]],[blue,yellow,yellow,yellow,blue],{sides:20});
      organic(s,[[0,.038,-.005],[0,.063,-.044],[0,.107,-.059],[0,.135,-.057]],[[.013,.014],[.020,.019],[.021,.017],[.023,.014]],black,{sides:12});
      for(const side of [-1,1]){
        organic(s,[[side*.018,.044,.035],[side*.020,.060,.094],[side*.014,.065,.148],[side*.008,.068,.181]],[[.012,.017],[.014,.019],[.009,.012],[.001,.001]],blue,{sides:8});
        for(let j=0;j<5;j++)feather(s,[side*.009,.055,.055],[side*(.018+j*.003),.048,.16+j*.004],.005,blue,[.32,.34,.27]);
      }
      for(let i=0;i<45;i++){
        const a=random()*TAU,y=.065+random()*.067;
        furLock(s,[Math.sin(a)*.043,y,-.024+Math.cos(a)*.03],[Math.sin(a)*.3,-.2,Math.cos(a)*.3],.006+random()*.006,.0025,yellow);
      }
    },[0,0,0]);
    add('head',s=>{
      organic(s,[[0,-.075,.017],[0,-.046,.011],[0,-.025,.004],[0,-.006,-.007]],[[.022,.025],[.029,.030],[.036,.034],[.042,.035]],yellow,{sides:14});
      organic(s,[[0,-.031,.015],[0,-.012,-.006],[0,.009,-.018],[0,.012,-.04]],[[.035,.032],[.046,.040],[.042,.036],[.032,.027]],black,{sides:18});
      for(const side of [-1,1]){
        organic(s,[[side*.032,-.008,-.017],[side*.044,-.006,-.028],[side*.040,-.014,-.049]],[[.013,.021],[.014,.019],[.009,.011]],white,{sides:10});
        organic(s,[[side*.040,.005,-.033],[side*.044,.006,-.041]],[[.006,.007],[.004,.005]],eyeColor(),{sides:8});
        furLock(s,[side*.046,.008,-.044],[side*.25,.2,-.3],.004,.002,white);
      }
      organic(s,[[0,-.020,-.061],[0,-.022,-.088],[0,-.021,-.098]],[[.009,.008],[.005,.005],[.0005,.0005]],[.045,.043,.027],{sides:8});
      organic(s,[[0,-.040,-.024],[0,-.051,-.039],[0,-.045,-.058]],[[.027,.022],[.023,.020],[.013,.012]],black,{sides:10});
    },[0,.158,-.034]);
    for(const side of [-1,1])add('wing',s=>{
      // The skin is a narrow airfoil along a shoulder-elbow-wrist chain.
      organic(s,[[0,0,0],[side*.028,.007,.017],[side*.060,.002,.049],[side*.078,-.004,.083]],[[.017,.018],[.020,.016],[.014,.012],[.006,.005]],blue,{sides:10});
      for(let j=0;j<9;j++){
        const root=[side*(.015+j*.006),.003,.008+j*.008];
        const tip=[side*(.055+j*.011),-.008-j*.003,.102+j*.007];
        feather(s,root,tip,.009+j*.0005,j%3===0?blue:[.12,.18,.21],[.32,.34,.29]);
      }
      for(let j=0;j<6;j++){
        const root=[side*(.011+j*.006),.013,.008+j*.008],tip=[side*(.041+j*.007),-.004,.054+j*.008];
        feather(s,root,tip,.005,white,[.38,.39,.31]);
      }
    },[side*.039,.108,-.003]);
    for(const side of [-1,1])add('foot',s=>{
      organic(s,[[0,0,0],[0,-.021,-.003],[0,-.039,-.007]],[[.0035,.0035],[.0028,.0028],[.002,.002]],[.19,.14,.071],{sides:6});
      for(let toe=-1;toe<=1;toe++)organic(s,[[0,-.039,-.007],[toe*.011,-.042,-.027],[toe*.012,-.040,-.035]],[[.0022,.0022],[.0015,.0015],[.0004,.0004]],black,{sides:5,steps:1});
      organic(s,[[0,-.039,-.007],[0,-.042,.014]],[[.002,.002],[.0004,.0004]],black,{sides:5});
    },[side*.024,.041,.004]);
    return parts;
  }
  function eyeColor(){return[.005,.006,.004];}
  F.anatomy={Skin,loft,organic,smooth,frame,furLock,feather,deer,squirrel,bird};
})(window.Forest);
