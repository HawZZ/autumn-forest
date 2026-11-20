/* GLSL ES 3.00: stable foliage shading, full-coverage shadows, depth-correct water and air. */
'use strict';
(function(F){
  const head=`#version 300 es\nprecision highp float;\nprecision highp int;\n`;
  const fullVS=head+`out vec2 vUV;
  void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vUV=p;gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;
  const skyVS=head+`out vec2 vUV;
  void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vUV=p;gl_Position=vec4(p*2.0-1.0,1.0,1.0);}`;
  const noise=`
  float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
  float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash12(i),hash12(i+vec2(1,0)),f.x),mix(hash12(i+vec2(0,1)),hash12(i+1.),f.x),f.y);}
  float fbm2(vec2 p){return noise2(p)*.57+noise2(p*2.03+17.7)*.28+noise2(p*4.11+7.2)*.15;}
  `;
  const shadow=`
  uniform highp sampler2DShadow uShadowNear;
  uniform highp sampler2DShadow uShadowFar;
  uniform mat4 uShadowVP0;
  uniform mat4 uShadowVP1;
  float shadowTap(vec2 uv,float z,bool nearMap){
    vec2 texel=vec2(1./1536.);float s;
    if(nearMap){
      s=texture(uShadowNear,vec3(uv,z))*.4;
      s+=texture(uShadowNear,vec3(uv+vec2(.9,.25)*texel,z))*.15;
      s+=texture(uShadowNear,vec3(uv+vec2(-.25,.9)*texel,z))*.15;
      s+=texture(uShadowNear,vec3(uv+vec2(-.9,-.25)*texel,z))*.15;
      s+=texture(uShadowNear,vec3(uv+vec2(.25,-.9)*texel,z))*.15;
    }else{
      s=texture(uShadowFar,vec3(uv,z))*.4;
      s+=texture(uShadowFar,vec3(uv+vec2(.9,.25)*texel,z))*.15;
      s+=texture(uShadowFar,vec3(uv+vec2(-.25,.9)*texel,z))*.15;
      s+=texture(uShadowFar,vec3(uv+vec2(-.9,-.25)*texel,z))*.15;
      s+=texture(uShadowFar,vec3(uv+vec2(.25,-.9)*texel,z))*.15;
    }return s;
  }
  float readShadow(vec3 p,vec3 n,vec3 sun){
    float slope=clamp(1.-abs(dot(n,sun)),0.,1.);
    vec4 lp0=uShadowVP0*vec4(p+n*(.006+slope*.008)+sun*.016,1.);
    vec3 q=lp0.xyz/lp0.w*.5+.5;
    float nearValue=1.;
    if(all(greaterThan(q.xy,vec2(.002)))&&all(lessThan(q.xy,vec2(.998)))&&q.z<1.)nearValue=shadowTap(q.xy,q.z-(.00018+slope*.00020),true);
    float edge=max(max(abs(q.x-.5),abs(q.y-.5))*2.,0.);
    if(edge<.84)return nearValue;
    vec4 lp1=uShadowVP1*vec4(p+n*.08+sun*.13,1.);q=lp1.xyz/lp1.w*.5+.5;
    if(any(lessThan(q.xy,vec2(0.)))||any(greaterThan(q.xy,vec2(1.)))||q.z>1.)return nearValue;
    float farValue=shadowTap(q.xy,q.z-(.00068+slope*.00040),false);
    return mix(nearValue,farValue,smoothstep(.84,.97,edge));
  }
  float readVisibility(vec3 p){
    vec4 q=uShadowVP0*vec4(p,1.);vec3 uv=q.xyz/q.w*.5+.5;
    if(all(greaterThan(uv.xy,vec2(.003)))&&all(lessThan(uv.xy,vec2(.997)))&&uv.z<1.)return texture(uShadowNear,vec3(uv.xy,uv.z-.0006));
    q=uShadowVP1*vec4(p,1.);uv=q.xyz/q.w*.5+.5;
    if(any(lessThan(uv.xy,vec2(0.)))||any(greaterThan(uv.xy,vec2(1.)))||uv.z>1.)return 1.;
    return texture(uShadowFar,vec3(uv.xy,uv.z-.001));
  }`;
  const wind=`
  uniform float uTime;uniform float uWind;uniform float uMode;
  vec3 windOffset(vec3 p,vec3 origin,float flex,float leaf,float localY){
    float phase=origin.x*.21+origin.z*.17;
    float slow=sin(uTime*.73+phase)+sin(uTime*1.19+phase*1.7)*.27;
    float flutter=sin(uTime*2.3+phase*3.+localY*2.1)*.022*leaf;
    float strength=uWind*(slow*.085+flutter);
    if(uMode>1.5&&uMode<3.5)strength*=1.7;
    return vec3(strength*flex*(.15+max(p.y-origin.y,0.)*.10),0.,strength*flex*(.10+max(p.y-origin.y,0.)*.065)*.65);
  }`;
  const sceneVS=head+wind+`
  layout(location=0) in vec3 aPosition;layout(location=1) in vec3 aNormal;
  layout(location=2) in vec2 aUV;layout(location=3) in vec3 aColor;
  layout(location=4) in float aFlex;layout(location=5) in float aLeaf;
  layout(location=6) in vec3 iPosition;layout(location=7) in vec4 iScaleRotation;
  layout(location=8) in vec4 iColorPhase;layout(location=9) in float iVariant;
  uniform mat4 uViewProjection;
  out vec3 vWorld;out vec3 vNormal;out vec2 vUV;out vec3 vColor;out float vLeaf;out float vPhase;
  void main(){
    float c=cos(iScaleRotation.w),s=sin(iScaleRotation.w);
    vec3 p=aPosition*iScaleRotation.xyz;
    p=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z)+iPosition;
    vec3 n=aNormal/iScaleRotation.xyz;n=vec3(c*n.x+s*n.z,n.y,-s*n.x+c*n.z);
    p+=windOffset(p,iPosition,aFlex,aLeaf,aPosition.y);
    vWorld=p;vNormal=normalize(n);vUV=aUV;vColor=aColor*iColorPhase.rgb;vLeaf=aLeaf;vPhase=iColorPhase.w;
    gl_Position=uViewProjection*vec4(p,1.);
  }`;
  const sceneFS=head+noise+shadow+`
  in vec3 vWorld;in vec3 vNormal;in vec2 vUV;in vec3 vColor;in float vLeaf;in float vPhase;
  uniform vec3 uCamera;uniform vec3 uSunDirection;uniform sampler2D uTexture;
  uniform float uTime;uniform float uMode;uniform float uPathX;uniform float uCreekX;uniform vec3 uFogColor;
  uniform vec3 uObserveTarget;uniform float uObserveStrength;uniform float uObserveDistance;
  layout(location=0)out vec4 outColor;
  layout(location=1)out vec2 outDistance;
  void main(){
    vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;
    vec3 view=normalize(uCamera-vWorld);
    vec3 albedo=vColor,tex=texture(uTexture,vUV).rgb;
    if(uMode<.5){
      float path=1.-smoothstep(.78,1.85,abs(vWorld.x-uPathX));
      float litter=fbm2(vWorld.xz*1.35);
      albedo*=mix(vec3(.51,.57,.44),vec3(1.13,.99,.76),path)*(.84+litter*.36)*tex*1.12;
      float creek=1.-smoothstep(1.5,3.8,abs(vWorld.x-uCreekX));albedo*=1.-creek*.32;
    }else if(uMode<1.5){
      float ridge=fbm2(vec2(vUV.x*34.,vUV.y*1.2));
      float grooves=fbm2(vec2(vUV.x*110.+ridge*3.,vUV.y*2.2));
      albedo*=tex*(.91+ridge*.26+grooves*.11);
      float sideLight=pow(max(dot(n,normalize(uSunDirection+view)),0.),12.)*.035;
      albedo+=vec3(.10,.08,.045)*sideLight;
    }else if(uMode<2.5){
      albedo*=.79;
      float midrib=1.-smoothstep(.005,.025,abs(vUV.x-.5));
      float sideVeins=pow(.5+.5*sin((vUV.y*13.+abs(vUV.x-.5)*9.)*3.14159),16.);
      float veinMask=clamp(midrib*.14+sideVeins*.045,0.,.20);
      albedo*=1.-veinMask;
    }else if(uMode<3.5){albedo*=.84;
    }else{albedo*=tex*1.03;}
    float visibility=readShadow(vWorld,n,uSunDirection);
    float ndl=max(dot(n,uSunDirection),0.),leaf=step(.5,vLeaf);
    vec3 ambient=mix(vec3(.19,.21,.16),vec3(.38,.44,.49),n.y*.5+.5);
    float transmission=pow(max(dot(-view,uSunDirection),0.),3.)*max(dot(-n,uSunDirection),0.)*leaf;
    float wrap=max((dot(n,uSunDirection)+.28)/1.28,0.);
    float contact=1.;
    if(uMode<.5){
      vec2 shadowUV=(uShadowVP0*vec4(vWorld,1.)).xy*.5+.5;
      float d=texture(uShadowNear,vec3(shadowUV,1.));
      contact=mix(.68,1.,smoothstep(.0,.012,d));
    }
    vec3 light=ambient*.88*contact+vec3(1.95,1.62,1.14)*(wrap*.76+transmission*.48)*(.20+visibility*.80);
    vec3 col=albedo*light;
    float dist=length(uCamera-vWorld);
    // Subpixel foliage settles softly instead of shimmering into disconnected hard pixels.
    if(leaf>.5)col=mix(col,uFogColor*.86,smoothstep(38.,108.,dist)*.16);
    float fog=1.-exp(-dist*.0055);
    float sunAmount=pow(max(dot(-view,uSunDirection),0.),9.);
    vec3 fogColor=mix(uFogColor,vec3(.71,.66,.47),sunAmount*.33);
    col=mix(col,fogColor,fog);
    float fade=0.;
    if(uObserveStrength>.001&&(leaf>.5||uMode>.5&&uMode<1.5)){
      vec3 targetRay=uObserveTarget-uCamera,rayToFragment=vWorld-uCamera;
      float along=dot(rayToFragment,normalize(targetRay));
      float miss=length(rayToFragment-normalize(targetRay)*along);
      float width=.50+uObserveDistance*.065;
      float center=1.-smoothstep(width*.30,width,miss);
      float inFront=(1.-smoothstep(uObserveDistance-.6,uObserveDistance+.4,along))*step(.04,along);
      float screenDoor=hash12(floor(gl_FragCoord.xy/2.));
      fade=center*inFront*uObserveStrength;
      if(leaf<.5)fade*=.75;
      if(screenDoor<fade*.88)discard;
    }
    outColor=vec4(col,1.);outDistance=vec2(dist,0.);
  }`;
  const depthVS=head+wind+`
  layout(location=0)in vec3 aPosition;layout(location=4)in float aFlex;layout(location=5)in float aLeaf;
  layout(location=6)in vec3 iPosition;layout(location=7)in vec4 iScaleRotation;layout(location=8)in vec4 iColorPhase;
  uniform mat4 uLightVP;
  void main(){
    vec3 p=aPosition*iScaleRotation.xyz;float c=cos(iScaleRotation.w),s=sin(iScaleRotation.w);
    p=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z)+iPosition;
    p+=windOffset(p,iPosition,aFlex,aLeaf,aPosition.y);
    gl_Position=uLightVP*vec4(p,1.);
  }`;
  const depthFS=head+`void main(){}`;
  const waterInfoVS=head+`
  layout(location=0)in vec3 aPosition;layout(location=6)in vec3 iPosition;layout(location=7)in vec4 iScaleRotation;
  uniform mat4 uViewProjection;uniform vec3 uCamera;out float vDistance;
  void main(){vec3 p=aPosition*iScaleRotation.xyz+iPosition;vDistance=length(p-uCamera);gl_Position=uViewProjection*vec4(p,1.);}`;
  const waterInfoFS=head+`in float vDistance;out vec2 outInfo;void main(){outInfo=vec2(vDistance,1.);}`;
  const skyFS=head+noise+`
  in vec2 vUV;uniform mat4 uInverseVP;uniform vec3 uCamera;uniform vec3 uSunDirection;uniform float uTime;layout(location=0)out vec4 outColor;layout(location=1)out vec2 outDistance;
  void main(){
    vec4 p=uInverseVP*vec4(vUV*2.-1.,1.,1.);vec3 ray=normalize(p.xyz/p.w-uCamera);
    float y=max(ray.y,0.);vec3 sky=mix(vec3(.70,.72,.61),vec3(.26,.43,.57),pow(y,.48));
    float sun=max(dot(ray,uSunDirection),0.);sky+=vec3(1.,.79,.43)*pow(sun,24.)*.13;
    sky+=vec3(2.8,2.15,1.23)*pow(sun,1500.);
    float cloud=fbm2(ray.xz/(max(ray.y,.05))*1.5+uTime*.001);
    sky=mix(sky,vec3(.77,.79,.70),smoothstep(.57,.80,cloud)*smoothstep(.03,.32,y)*.14);
    if(ray.y<0.)sky=mix(vec3(.70,.72,.61),vec3(.32,.37,.28),min(-ray.y*3.,1.));outColor=vec4(sky,1.);outDistance=vec2(10000.,0.);
  }`;
  const volumeFS=head+noise+shadow+`
  in vec2 vUV;uniform sampler2D uDepth;uniform mat4 uInverseVP;uniform vec3 uCamera;uniform vec3 uSunDirection;
  uniform float uTime;uniform float uSteps;out vec4 outColor;
  vec3 worldFromDepth(vec2 uv,float depth){vec4 p=uInverseVP*vec4(uv*2.-1.,depth*2.-1.,1.);return p.xyz/p.w;}
  void main(){
    vec3 target=worldFromDepth(vUV,min(texture(uDepth,vUV).r,.99995));
    vec3 delta=target-uCamera;float distanceToTarget=min(length(delta),72.);vec3 ray=normalize(delta);
    // Screen-space fixed sampling: stable while walking, no frame-random sparkle.
    float jitter=hash12(floor(gl_FragCoord.xy));vec3 sum=vec3(0.);
    float phase=.28+(1.-.55*.55)/pow(1.+.55*.55-1.10*dot(ray,uSunDirection),1.5)*.62;
    for(int i=0;i<24;i++){
      if(float(i)>=uSteps)break;
      float t=(float(i)+jitter)/uSteps*distanceToTarget;vec3 p=uCamera+ray*t;
      float heightFog=exp(-max(p.y+1.4,0.)*.16);
      float pockets=.73+.27*noise2(p.xz*.09+vec2(uTime*.010,-uTime*.006));
      float density=.0055*heightFog*pockets;
      sum+=vec3(1.02,.85,.57)*readVisibility(p)*density*exp(-t*.015)*distanceToTarget/uSteps*phase;
    }outColor=vec4(sum,1.);
  }`;
  const waterSurfaceVS=head+`
  layout(location=0)in vec3 aPosition;layout(location=2)in vec2 aUV;layout(location=3)in vec3 aColor;layout(location=6)in vec3 iPosition;layout(location=7)in vec4 iScaleRotation;
  uniform mat4 uViewProjection;uniform vec3 uCamera;uniform float uTime;uniform vec4 uFlowObstacles[12];
  out vec3 vWorld;out float vDistance;out vec3 vFlow;out vec2 vWaterUV;out float vBed;
  void main(){
    vec3 p=aPosition*iScaleRotation.xyz+iPosition;
    float speed=max(length(aColor.xy),.1),depth=max(aColor.z,.025);
    vec2 direction=normalize(aColor.xy+vec2(.001,.001));
    vec2 uv=p.xz-direction*uTime*speed*.85;
    float shear=sin(uv.y*2.1+sin(uv.x*1.7+uTime*.55))*sin(uv.x*2.8-uTime*speed*1.9);
    float crossing=sin(dot(uv,vec2(3.7,5.1))+sin(uv.y*2.6+uTime*.7));
    float eddy=sin(uv.x*4.0+sin(uv.y*3.0-uTime*1.4))*cos(uv.y*3.6-uTime*speed*1.8);
    float wave=(crossing*.010+eddy*.015+shear*.013)*smoothstep(.025,.35,depth);
    p.y+=wave;vBed=wave;vWorld=p;vDistance=length(p-uCamera);vFlow=aColor;vWaterUV=aUV;gl_Position=uViewProjection*vec4(p,1.);
  }`;
  const waterSurfaceFS=head+noise+`
  in vec3 vWorld;in float vDistance;in vec3 vFlow;in vec2 vWaterUV;in float vBed;uniform sampler2D uColor;uniform sampler2D uDistanceTexture;uniform mat4 uInverseVP;uniform mat4 uViewProjection;uniform vec3 uCamera;uniform vec3 uSunDirection;
  uniform vec4 uRipples[8];uniform vec4 uFlowObstacles[12];uniform float uTime;uniform float uReflections;layout(location=0)out vec4 outColor;
  void main(){
    float speed=length(vFlow.xy),depth=max(vFlow.z,.01);
    vec2 flowDirection=vFlow.xy/max(speed,.001),flowUV=vWorld.xz-flowDirection*uTime*speed*1.15;
    float rippleA=sin(dot(flowUV,vec2(5.4,2.0))+sin(flowUV.y*1.7+uTime*.45)*1.8);
    float rippleB=sin(dot(flowUV,vec2(-3.0,8.2))-uTime*speed*1.6);
    float vortex=sin(flowUV.x*3.6+sin(flowUV.y*2.7-uTime*1.2))*cos(flowUV.y*4.1-uTime*speed*1.3);
    float shallow=1.-smoothstep(.10,.50,depth),riffle=smoothstep(.18,.75,speed);
    vec3 normal=normalize(vec3(rippleA*.046*riffle+rippleB*.020+vortex*.033,1.,rippleB*.052*riffle+sin(flowUV.x*3.4)*.023+vortex*.028));
    float wake=0.;
    for(int i=0;i<12;i++){
      vec2 delta=vWorld.xz-uFlowObstacles[i].xy;float d=length(delta);
      float influence=(1.-smoothstep(uFlowObstacles[i].z,uFlowObstacles[i].z+1.7,d))*step(.01,uFlowObstacles[i].z);
      float downstream=max(dot(delta,flowDirection),0.),cross=dot(delta,vec2(-flowDirection.y,flowDirection.x));
      float tail=sin(d*15.-uTime*speed*5.+cross*4.)*exp(-downstream*.52)*exp(-abs(cross)*1.6);
      float recirculation=sin(cross*5.+downstream*2.-uTime*speed*2.)*exp(-downstream*.8)*exp(-abs(cross)*1.3);
      wake+=tail*influence+recirculation*influence;normal.xz+=normalize(delta+vec2(.001))*influence*.046;
    }
    for(int i=0;i<8;i++){
      float age=uTime-uRipples[i].z;
      if(age>0.&&age<3.5){float d=length(vWorld.xz-uRipples[i].xy);normal.xz+=sin(d*23.-age*7.)*exp(-abs(d-age*.85)*8.)*exp(-age*1.3)*uRipples[i].w*.055;}
    }
    normal=normalize(normal);vec3 incident=normalize(vWorld-uCamera),reflection=normalize(reflect(incident,normal));reflection.y=max(reflection.y,.04);reflection=normalize(reflection);
    vec3 reflected=mix(vec3(.26,.35,.25),vec3(.20,.31,.38),reflection.y);
    if(uReflections>.5){
      float travel=.20;
      for(int i=0;i<28;i++){
        travel+=.18+travel*.13;vec3 sampleP=vWorld+reflection*travel;
        vec4 clip=uViewProjection*vec4(sampleP,1.);if(clip.w<=0.)break;
        vec2 uv=clip.xy/clip.w*.5+.5;if(any(lessThan(uv,vec2(.002)))||any(greaterThan(uv,vec2(.998))))break;
        vec2 hit=texture(uDistanceTexture,uv).rg;
        float difference=length(sampleP-uCamera)-hit.r;
        if(difference>0.&&difference<.10+travel*.020&&hit.r>.2&&hit.y<.5){
          float edge=smoothstep(0.,.13,uv.x)*smoothstep(0.,.13,uv.y)*smoothstep(0.,.13,1.-uv.x)*smoothstep(0.,.13,1.-uv.y);
          reflected=mix(reflected,texture(uColor,uv).rgb,edge*.94);break;
        }
        if(travel>36.)break;
      }
    }
    float fresnel=.17+.77*pow(1.-max(dot(-incident,normal),0.),3.);
    vec3 col=mix(vec3(.030,.055,.035),reflected,clamp(fresnel+.38,0.,.92));
    float glint=pow(max(dot(normal,normalize(uSunDirection-incident)),0.),165.);col+=vec3(.95,.78,.44)*glint*.20;
    col+=vec3(.40,.43,.28)*riffle*max(rippleA*rippleB,0.)*.07;
    col+=vec3(.38,.43,.31)*abs(wake)*.075;
    col+=vec3(.14,.18,.11)*vBed*.9;
    float transparency=(.24+smoothstep(.02,.55,depth)*.64)*smoothstep(.0,.09,depth);
    col=mix(col,vec3(.09,.125,.067),shallow*.28);
    outColor=vec4(col,transparency);
  }`;
  const compositeFS=head+`
  in vec2 vUV;uniform sampler2D uColor;uniform sampler2D uVolume;uniform sampler2D uWater;uniform sampler2D uSceneDepth;uniform sampler2D uWaterDepth;uniform vec2 uVolumeTexel;uniform float uVolumeEnabled;out vec4 outColor;
  void main(){vec3 c=texture(uColor,vUV).rgb;vec4 water=texture(uWater,vUV);
    if(texture(uWaterDepth,vUV).r<texture(uSceneDepth,vUV).r)c=mix(c,water.rgb,water.a);
    if(uVolumeEnabled>.5){vec3 v=texture(uVolume,vUV).rgb*.5;
    v+=texture(uVolume,vUV+vec2(uVolumeTexel.x,0.)).rgb*.125;v+=texture(uVolume,vUV-vec2(uVolumeTexel.x,0.)).rgb*.125;
    v+=texture(uVolume,vUV+vec2(0.,uVolumeTexel.y)).rgb*.125;v+=texture(uVolume,vUV-vec2(0.,uVolumeTexel.y)).rgb*.125;c+=v;}outColor=vec4(c,1.);}`;
  const maskFS=head+`in vec2 vUV;uniform sampler2D uMask;out vec4 outColor;void main(){outColor=vec4(texture(uMask,vUV).r,0,0,1);}`;
  const bloomFS=head+`in vec2 vUV;uniform sampler2D uTexture;uniform vec2 uDirection;out vec4 outColor;
  void main(){vec3 c=texture(uTexture,vUV).rgb*.227027;
  c+=texture(uTexture,vUV+uDirection*1.384615).rgb*.316216;c+=texture(uTexture,vUV-uDirection*1.384615).rgb*.316216;
  c+=texture(uTexture,vUV+uDirection*3.230769).rgb*.070270;c+=texture(uTexture,vUV-uDirection*3.230769).rgb*.070270;outColor=vec4(c,1.);}`;
  const brightFS=head+`in vec2 vUV;uniform sampler2D uTexture;out vec4 outColor;void main(){vec3 c=texture(uTexture,vUV).rgb;float b=max(max(c.r,c.g),c.b);outColor=vec4(c*max(b-1.65,0.)/max(b,.001),1.);}`;
  const finalFS=head+`
  in vec2 vUV;uniform sampler2D uColor;uniform sampler2D uBloom;uniform vec2 uTexel;out vec4 outColor;
  vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
  vec3 fxaa(vec2 uv){
    vec3 rgbNW=texture(uColor,uv+vec2(-1.,-1.)*uTexel).rgb,rgbNE=texture(uColor,uv+vec2(1.,-1.)*uTexel).rgb;
    vec3 rgbSW=texture(uColor,uv+vec2(-1.,1.)*uTexel).rgb,rgbSE=texture(uColor,uv+vec2(1.,1.)*uTexel).rgb;
    vec3 rgbM=texture(uColor,uv).rgb;vec3 luma=vec3(.299,.587,.114);
    float lNW=dot(rgbNW,luma),lNE=dot(rgbNE,luma),lSW=dot(rgbSW,luma),lSE=dot(rgbSE,luma),lM=dot(rgbM,luma);
    float lMin=min(lM,min(min(lNW,lNE),min(lSW,lSE))),lMax=max(lM,max(max(lNW,lNE),max(lSW,lSE)));
    vec2 dir=vec2(-((lNW+lNE)-(lSW+lSE)),(lNW+lSW)-(lNE+lSE));
    float reduce=max((lNW+lNE+lSW+lSE)*.03125,.0078125);
    float inv=1./(min(abs(dir.x),abs(dir.y))+reduce);dir=clamp(dir*inv,vec2(-5.),vec2(5.))*uTexel;
    vec3 a=.5*(texture(uColor,uv-dir/6.).rgb+texture(uColor,uv+dir/6.).rgb);
    vec3 b=a*.5+.25*(texture(uColor,uv-dir*.5).rgb+texture(uColor,uv+dir*.5).rgb);
    float lB=dot(b,luma);return lB<lMin||lB>lMax?a:b;
  }
  void main(){vec3 c=fxaa(vUV)+texture(uBloom,vUV).rgb*.065;c=aces(c*.83);c=pow(c,vec3(1./2.2));
    float vignette=1.-smoothstep(.30,.90,length((vUV-.5)*vec2(1.05,.86)))*.11;c*=vignette;outColor=vec4(c,1.);
  }`;
  const particleVS=head+`
  layout(location=0)in vec3 aPosition;layout(location=1)in vec3 aNormal;layout(location=2)in vec2 aUV;layout(location=3)in vec3 aColor;layout(location=4)in float aFlex;layout(location=5)in float aLeaf;
  layout(location=6)in vec4 iSeed;layout(location=10)in vec4 iLanding;
  uniform mat4 uViewProjection;uniform float uTime;uniform float uWind;uniform vec3 uCamera;
  out vec3 vColor;out vec3 vNormal;out vec3 vWorld;
  void main(){
    float life=fract(iSeed.w+uTime*(.026+iSeed.x*.014)),fall=clamp(life/.82,0.,1.);
    float angle=mix(uTime*(.7+iSeed.y*1.3)+iSeed.z*40.,1.57,smoothstep(.83,.98,life));
    float c=cos(angle),s=sin(angle);vec3 p=aPosition*(.13+iSeed.x*.12);
    p=vec3(p.x,p.y*c-p.z*s,p.y*s+p.z*c);float c2=cos(angle*.71),s2=sin(angle*.71);p=vec3(c2*p.x+s2*p.z,p.y,-s2*p.x+c2*p.z);
    vec3 center=iLanding.xyz;center.y=iLanding.w-(iLanding.w-iLanding.y)*pow(fall,1.22);
    center.x+=sin(uTime*.37+iSeed.z*30.)*1.1*(1.-fall)+uWind*fall*3.2;center.z+=cos(uTime*.29+iSeed.x*30.)*.85*(1.-fall);
    p*=smoothstep(0.,.045,life)*smoothstep(1.,.92,life);p+=center;
    vColor=mix(vec3(.88,.30,.025),vec3(1.,.68,.045),iSeed.x);vNormal=normalize(vec3(s,1.,c));vWorld=p;gl_Position=uViewProjection*vec4(p,1.);
  }`;
  const particleFS=head+`
  in vec3 vColor;in vec3 vNormal;in vec3 vWorld;uniform vec3 uSunDirection;uniform vec3 uCamera;layout(location=0)out vec4 outColor;layout(location=1)out vec2 outDistance;
  void main(){vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;float l=.55+max(dot(n,uSunDirection),0.)*1.15;vec3 col=vColor*l;float d=length(uCamera-vWorld);col=mix(col,vec3(.57,.61,.45),1.-exp(-d*.007));outColor=vec4(col,1.);outDistance=vec2(d,0.);}`;
  const moteVS=head+`
  layout(location=0)in vec3 iSeed;uniform mat4 uViewProjection;uniform float uTime;uniform vec3 uCamera;uniform vec2 uResolution;out float vAlpha;
  void main(){vec3 p=iSeed*vec3(72.,11.,72.)+vec3(-36.,.4,-36.);p.x+=sin(uTime*.12+iSeed.y*30.)*2.;p.y+=sin(uTime*.21+iSeed.z*30.)*.6;p.z+=cos(uTime*.15+iSeed.x*30.)*1.4;
  gl_Position=uViewProjection*vec4(p,1.);float d=length(uCamera-p);gl_PointSize=clamp(32./d,1.,3.)*uResolution.y/800.;vAlpha=(.10+.25*sin(iSeed.x*80.+uTime*.5))*(1.-smoothstep(18.,48.,d));}`;
  const moteFS=head+`in float vAlpha;out vec4 outColor;void main(){float d=length(gl_PointCoord-.5);float a=(1.-smoothstep(.05,.5,d))*vAlpha;outColor=vec4(1.,.85,.48,a);}`;
  const stepVS=head+`
  layout(location=0)in vec3 iPosition;layout(location=10)in vec2 iBirthType;uniform mat4 uViewProjection;uniform float uTime;uniform vec2 uResolution;uniform vec3 uCamera;
  out float vAlpha;out float vType;
  void main(){float age=uTime-iBirthType.x;vec3 p=iPosition;p.y+=age*(iBirthType.y>.5?.7:.36)-age*age*.24;p.x+=age*.15;
  gl_Position=uViewProjection*vec4(p,1.);float d=length(uCamera-p);gl_PointSize=clamp((iBirthType.y>.5?32.:22.)/d,1.5,8.)*uResolution.y/800.;vAlpha=max(1.-age/1.1,0.)*.48;vType=iBirthType.y;}`;
  const stepFS=head+`in float vAlpha;in float vType;out vec4 outColor;void main(){float d=length(gl_PointCoord-.5);float a=(1.-smoothstep(.08,.5,d))*vAlpha;vec3 color=mix(vec3(.73,.47,.15),vec3(.77,.86,.79),vType);outColor=vec4(color,a);}`;
  F.shaders={sceneVS,sceneFS,depthVS,depthFS,fullVS,skyVS,skyFS,volumeFS,waterSurfaceVS,waterSurfaceFS,compositeFS,waterInfoVS,waterInfoFS,maskFS,bloomFS,brightFS,finalFS,particleVS,particleFS,moteVS,moteFS,stepVS,stepFS};
})(window.Forest);
