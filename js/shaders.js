/* GLSL ES 3.00: shared wind/shadow transforms, HDR, ray-marched air and water. */
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
  float readShadow(vec3 p,vec3 n,vec3 sun){
    vec4 lp0=uShadowVP0*vec4(p+n*.065+sun*.06,1.);
    vec3 q=lp0.xyz/lp0.w*.5+.5;
    float bias=.00055;
    if(all(greaterThan(q.xy,vec2(.005)))&&all(lessThan(q.xy,vec2(.995)))&&q.z<1.){
      float s=0.;
      for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)s+=texture(uShadowNear,vec3(q.xy+vec2(x,y)/2048.,q.z-bias));
      return s/9.;
    }
    vec4 lp1=uShadowVP1*vec4(p+n*.12+sun*.13,1.);q=lp1.xyz/lp1.w*.5+.5;
    if(any(lessThan(q.xy,vec2(0.)))||any(greaterThan(q.xy,vec2(1.)))||q.z>1.)return 1.;
    float s=0.;
    for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)s+=texture(uShadowFar,vec3(q.xy+vec2(x,y)/2048.,q.z-.0011));
    return s/9.;
  }`;
  const sceneVS=head+`
  layout(location=0) in vec3 aPosition;
  layout(location=1) in vec3 aNormal;
  layout(location=2) in vec2 aUV;
  layout(location=3) in vec3 aColor;
  layout(location=4) in float aFlex;
  layout(location=5) in float aLeaf;
  layout(location=6) in vec3 iPosition;
  layout(location=7) in vec4 iScaleRotation;
  layout(location=8) in vec4 iColorPhase;
  uniform mat4 uViewProjection;
  uniform float uTime;
  uniform float uWind;
  uniform float uMode;
  out vec3 vWorld;
  out vec3 vNormal;
  out vec2 vUV;
  out vec3 vColor;
  out float vLeaf;
  out float vPhase;
  out float vLocalY;
  void main(){
    float c=cos(iScaleRotation.w),s=sin(iScaleRotation.w);
    vec3 p=aPosition*iScaleRotation.xyz;
    p=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z)+iPosition;
    vec3 n=aNormal/iScaleRotation.xyz;n=vec3(c*n.x+s*n.z,n.y,-s*n.x+c*n.z);
    float h=max(p.y-iPosition.y,0.);
    float phase=iColorPhase.w+p.x*.13+p.z*.09;
    float gust=(sin(uTime*.73+phase)+sin(uTime*1.31+phase*1.73)*.35);
    float sway=uWind*(gust*.16+sin(uTime*2.9+phase*3.)*.038*aLeaf);
    if(uMode>1.5&&uMode<3.5)sway*=2.1;
    p.x+=sway*aFlex*(.25+h*.13);
    p.z+=sway*aFlex*(.18+h*.095)*.65;
    if(uMode>1.5&&uMode<2.5)p.y+=sin(uTime*3.6+phase*5.+aPosition.x*4.)*.036*uWind*aFlex;
    vWorld=p;vNormal=normalize(n);vUV=aUV;vColor=aColor*iColorPhase.rgb;vLeaf=aLeaf;vPhase=iColorPhase.w;vLocalY=h;
    gl_Position=uViewProjection*vec4(p,1.);
  }`;
  const sceneFS=head+noise+shadow+`
  in vec3 vWorld;in vec3 vNormal;in vec2 vUV;in vec3 vColor;in float vLeaf;in float vPhase;in float vLocalY;
  uniform vec3 uCamera;
  uniform vec3 uSunDirection;
  uniform sampler2D uTexture;
  uniform float uTime;
  uniform float uMode;
  uniform float uPathX;
  uniform float uCreekX;
  uniform float uCreekLevel;
  uniform vec3 uFogColor;
  layout(location=0)out vec4 outColor;
  void main(){
    vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;
    vec3 view=normalize(uCamera-vWorld);
    if(dot(n,view)<0.)n=-n;
    vec3 albedo=vColor;
    vec3 tex=texture(uTexture,vUV).rgb;
    if(uMode<.5){
      float path=1.-smoothstep(.72,1.75,abs(vWorld.x-uPathX));
      float litter=fbm2(vWorld.xz*1.6);
      albedo*=mix(vec3(.56,.63,.47),vec3(1.13,1.02,.79),path)*(.83+litter*.42)*tex*1.12;
      float creek=1.-smoothstep(1.5,3.8,abs(vWorld.x-uCreekX));
      albedo*=1.-creek*.30;
    }else if(uMode<1.5){albedo*=tex*1.05;
    }else if(uMode<2.5){albedo*=.86;
    }else if(uMode<3.5){albedo*=.92;
    }else{albedo*=tex*1.1;}
    float shadow=readShadow(vWorld,n,uSunDirection);
    float ndl=max(dot(n,uSunDirection),0.);
    vec3 ambient=mix(vec3(.18,.20,.13),vec3(.29,.36,.43),n.y*.5+.5);
    float leaf=step(.5,vLeaf);
    float transmission=pow(max(dot(-view,uSunDirection),0.),3.)*max(dot(-n,uSunDirection),0.)*leaf;
    float back=pow(max(dot(-view,uSunDirection),0.),2.)*.13*leaf;
    vec3 light=ambient*(.64+leaf*.12)+vec3(1.85,1.45,.88)*(ndl*.84+transmission*.72+back)*shadow;
    // Fine central and lateral leaf veins, deliberately much weaker than silhouette detail.
    float vein=abs(vUV.x-.5);
    float veins=(1.-smoothstep(.012,.029,vein))*.13+(1.-smoothstep(.005,.014,abs(fract((vUV.y+vein*.7)*9.)-.5)))*.055;
    albedo*=1.-veins*leaf;
    float spec=pow(max(dot(n,normalize(uSunDirection+view)),0.),36.)*(1.-leaf)*.11;
    vec3 col=albedo*light+vec3(1.0,.85,.55)*spec*shadow;
    float dist=length(uCamera-vWorld);
    float fog=1.-exp(-dist*.0060);
    float sunAmount=pow(max(dot(-view,uSunDirection),0.),7.);
    vec3 fogColor=mix(uFogColor,vec3(.79,.70,.46),sunAmount*.47);
    col=mix(col,fogColor,fog);
    outColor=vec4(col,1.);
  }`;
  const depthVS=head+`
  layout(location=0)in vec3 aPosition;layout(location=4)in float aFlex;layout(location=5)in float aLeaf;
  layout(location=6)in vec3 iPosition;layout(location=7)in vec4 iScaleRotation;layout(location=8)in vec4 iColorPhase;
  uniform mat4 uLightVP;uniform float uTime;uniform float uWind;uniform float uMode;
  void main(){
    vec3 p=aPosition*iScaleRotation.xyz;float c=cos(iScaleRotation.w),s=sin(iScaleRotation.w);
    p=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z)+iPosition;
    float h=max(p.y-iPosition.y,0.),phase=iColorPhase.w+p.x*.13+p.z*.09;
    float sway=uWind*((sin(uTime*.73+phase)+sin(uTime*1.31+phase*1.73)*.35)*.16+sin(uTime*2.9+phase*3.)*.038*aLeaf);
    if(uMode>1.5&&uMode<3.5)sway*=2.1;
    p.x+=sway*aFlex*(.25+h*.13);p.z+=sway*aFlex*(.18+h*.095)*.65;
    gl_Position=uLightVP*vec4(p,1.);
  }`;
  const depthFS=head+`void main(){}`;
  const skyFS=head+noise+`
  in vec2 vUV;uniform mat4 uInverseVP;uniform vec3 uCamera;uniform vec3 uSunDirection;uniform float uTime;
  out vec4 outColor;
  void main(){
    vec4 p=uInverseVP*vec4(vUV*2.-1.,1.,1.);vec3 ray=normalize(p.xyz/p.w-uCamera);
    float y=max(ray.y,0.);
    vec3 sky=mix(vec3(.77,.75,.57),vec3(.24,.44,.62),pow(y,.44));
    float sun=max(dot(ray,uSunDirection),0.);
    sky+=vec3(1.,.75,.36)*pow(sun,22.)*.18;
    sky+=vec3(3.2,2.30,1.12)*pow(sun,1300.);
    float cloud=fbm2(ray.xz/(max(ray.y,.04))*1.7+uTime*.001);
    sky=mix(sky,vec3(.79,.79,.69),smoothstep(.56,.79,cloud)*smoothstep(.02,.32,y)*.20);
    if(ray.y<0.)sky=mix(vec3(.77,.75,.57),vec3(.35,.40,.31),min(-ray.y*3.,1.));
    outColor=vec4(sky,1.);
  }`;
  const volumeFS=head+noise+shadow+`
  in vec2 vUV;uniform sampler2D uDepth;uniform mat4 uInverseVP;uniform vec3 uCamera;uniform vec3 uSunDirection;
  uniform float uTime;uniform float uSteps;uniform vec2 uResolution;
  out vec4 outColor;
  vec3 worldFromDepth(vec2 uv,float depth){vec4 p=uInverseVP*vec4(uv*2.-1.,depth*2.-1.,1.);return p.xyz/p.w;}
  void main(){
    float depth=texture(uDepth,vUV).r;
    vec3 target=worldFromDepth(vUV,min(depth,.99995));
    vec3 delta=target-uCamera;float distanceToTarget=min(length(delta),88.);vec3 ray=normalize(delta);
    float jitter=hash12(gl_FragCoord.xy+mod(uTime*61.,113.));
    vec3 sum=vec3(0.);float steps=uSteps;
    float phase=.38+(1.-.62*.62)/pow(1.+.62*.62-1.24*dot(ray,uSunDirection),1.5)*.75;
    for(int i=0;i<48;i++){
      if(float(i)>=steps)break;
      float t=(float(i)+jitter)/steps*distanceToTarget;
      vec3 p=uCamera+ray*t;
      float heightFog=exp(-max(p.y+1.4,0.)*.13);
      float pockets=.62+.38*noise2(p.xz*.115+vec2(uTime*.016,-uTime*.008));
      float density=.0042*heightFog*pockets;
      float visibility=readShadow(p,vec3(0,1,0),uSunDirection);
      float transmittance=exp(-t*.015);
      sum+=vec3(1.10,.86,.48)*visibility*density*transmittance*distanceToTarget/steps*phase;
    }
    outColor=vec4(sum,1.);
  }`;
  const waterFS=head+noise+`
  in vec2 vUV;
  uniform sampler2D uColor;uniform sampler2D uDepth;uniform sampler2D uWaterMask;
  uniform mat4 uInverseVP;uniform mat4 uViewProjection;uniform vec3 uCamera;uniform vec3 uSunDirection;
  uniform vec4 uRipples[8];uniform float uTime;uniform float uReflections;
  out vec4 outColor;
  vec3 worldFromDepth(vec2 uv,float depth){vec4 p=uInverseVP*vec4(uv*2.-1.,depth*2.-1.,1.);return p.xyz/p.w;}
  void main(){
    float mask=texture(uWaterMask,vUV).r;
    if(mask<.5){outColor=texture(uColor,vUV);return;}
    vec3 p=worldFromDepth(vUV,texture(uDepth,vUV).r);
    vec3 normal=normalize(vec3(sin(p.x*3.1+uTime*1.3)*.018+sin(p.z*5.2-uTime*.9)*.015,1.,sin(p.z*2.7-uTime*.8)*.024));
    for(int i=0;i<8;i++){
      float age=uTime-uRipples[i].z;
      if(age>0.&&age<3.5){float d=length(p.xz-uRipples[i].xy);float ring=sin(d*23.-age*7.)*exp(-abs(d-age*.85)*8.)*exp(-age*1.3)*uRipples[i].w;normal.xz+=ring*.08;}
    }
    normal=normalize(normal);
    vec3 incident=normalize(p-uCamera),reflection=reflect(incident,normal);reflection.y=abs(reflection.y)+.025;reflection=normalize(reflection);
    vec3 reflected=mix(vec3(.63,.66,.47),vec3(.26,.41,.51),reflection.y);
    reflected+=vec3(.72,.59,.32)*pow(max(dot(reflection,uSunDirection),0.),48.)*.26;
    float confidence=0.;
    if(uReflections>.5){
      float travel=0.;
      for(int i=0;i<32;i++){
        travel+=.23+travel*.105;
        vec3 sampleP=p+reflection*travel;
        vec4 clip=uViewProjection*vec4(sampleP,1.);
        if(clip.w<=0.)break;
        vec2 uv=clip.xy/clip.w*.5+.5;
        if(any(lessThan(uv,vec2(.002)))||any(greaterThan(uv,vec2(.998))))break;
        float sceneDepth=texture(uDepth,uv).r;
        float sampleDepth=clip.z/clip.w*.5+.5;
        float thickness=.0012+travel*.00065;
        if(sampleDepth>=sceneDepth&&sampleDepth-sceneDepth<thickness){
          vec3 hit=texture(uColor,uv).rgb;
          float edge=smoothstep(0.,.13,uv.x)*smoothstep(0.,.13,uv.y)*smoothstep(0.,.13,1.-uv.x)*smoothstep(0.,.13,1.-uv.y);
          reflected=mix(reflected,hit,edge*.93);confidence=edge;break;
        }
      }
    }
    float fresnel=.10+.78*pow(1.-max(dot(-incident,normal),0.),3.);
    vec3 deep=vec3(.045,.087,.057);
    vec3 col=mix(deep,reflected,clamp(fresnel+.15,0.,.78));
    float glint=pow(max(dot(normal,normalize(uSunDirection-incident)),0.),220.);
    col+=vec3(.85,.70,.38)*glint*.07;
    float originalLum=dot(texture(uColor,vUV).rgb,vec3(.3,.6,.1));
    col=mix(col,texture(uColor,vUV).rgb,.12);
    outColor=vec4(col,mask*smoothstep(.40,.52,mask));
  }`;
  const maskFS=head+`in vec2 vUV;uniform sampler2D uMask;out vec4 outColor;void main(){outColor=vec4(texture(uMask,vUV).r,0,0,1);}`;
  const waterMaskVS=head+`
  layout(location=0) in vec3 aPosition;
  layout(location=6) in vec3 iPosition;
  layout(location=7) in vec4 iScaleRotation;
  uniform mat4 uViewProjection;
  void main(){vec3 p=aPosition*iScaleRotation.xyz+iPosition;gl_Position=uViewProjection*vec4(p,1.);}`;
  const waterMaskFS=head+`out vec4 outColor;void main(){outColor=vec4(1.,0.,0.,1.);}`;
  const compositeFS=head+`
  in vec2 vUV;uniform sampler2D uColor;uniform sampler2D uVolume;uniform sampler2D uDepth;
  uniform vec2 uVolumeTexel;uniform float uVolumeEnabled;out vec4 outColor;
  void main(){
    vec3 c=texture(uColor,vUV).rgb;
    if(uVolumeEnabled>.5){
      vec3 v=vec3(0.);float total=0.;float center=texture(uDepth,vUV).r;
      for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
        vec2 uv=vUV+vec2(x,y)*uVolumeTexel;
        float d=texture(uDepth,uv).r;float w=exp(-abs(d-center)*700.)*(x==0&&y==0?2.:1.);
        v+=texture(uVolume,uv).rgb*w;total+=w;
      }c+=v/total;
    }outColor=vec4(c,1.);
  }`;
  const bloomFS=head+`in vec2 vUV;uniform sampler2D uTexture;uniform vec2 uDirection;out vec4 outColor;
  void main(){vec3 c=texture(uTexture,vUV).rgb*.227027;
  c+=texture(uTexture,vUV+uDirection*1.384615).rgb*.316216;c+=texture(uTexture,vUV-uDirection*1.384615).rgb*.316216;
  c+=texture(uTexture,vUV+uDirection*3.230769).rgb*.070270;c+=texture(uTexture,vUV-uDirection*3.230769).rgb*.070270;
  outColor=vec4(c,1.);}`;
  const brightFS=head+`in vec2 vUV;uniform sampler2D uTexture;out vec4 outColor;void main(){vec3 c=texture(uTexture,vUV).rgb;float b=max(max(c.r,c.g),c.b);outColor=vec4(c*max(b-1.35,0.)/max(b,.001),1.);}`;
  const finalFS=head+noise+`
  in vec2 vUV;uniform sampler2D uColor;uniform sampler2D uBloom;uniform vec2 uTexel;uniform float uTime;out vec4 outColor;
  vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
  vec3 fxaa(vec2 uv){
    vec3 c=texture(uColor,uv).rgb;
    vec3 n=texture(uColor,uv+vec2(0,uTexel.y)).rgb,s=texture(uColor,uv-vec2(0,uTexel.y)).rgb;
    vec3 e=texture(uColor,uv+vec2(uTexel.x,0)).rgb,w=texture(uColor,uv-vec2(uTexel.x,0)).rgb;
    vec3 average=(n+s+e+w)*.25;
    float contrast=abs(dot(c-average,vec3(.333)));
    return mix(c,average,clamp(contrast*.65,0.,.36));
  }
  void main(){
    vec3 c=fxaa(vUV)+texture(uBloom,vUV).rgb*.095;
    c=aces(c*.78);c=pow(c,vec3(1./2.2));
    float vignette=1.-smoothstep(.28,.83,length((vUV-.5)*vec2(1.05,.86)))*.19;
    c*=vignette;
    c+=(hash12(gl_FragCoord.xy+uTime)-.5)*.003;
    outColor=vec4(c,1.);
  }`;
  const particleVS=head+`
  layout(location=0)in vec3 aPosition;layout(location=1)in vec3 aNormal;layout(location=2)in vec2 aUV;layout(location=3)in vec3 aColor;layout(location=4)in float aFlex;layout(location=5)in float aLeaf;
  layout(location=6)in vec4 iSeed;
  layout(location=7)in vec4 iLanding;
  uniform mat4 uViewProjection;uniform float uTime;uniform float uWind;uniform vec3 uCamera;
  out vec3 vColor;out vec3 vNormal;out vec3 vWorld;
  void main(){
    float life=fract(iSeed.w+uTime*(.026+iSeed.x*.014));
    float fall=clamp(life/.82,0.,1.);
    float angle=uTime*(.7+iSeed.y*1.3)+iSeed.z*40.;
    angle=mix(angle,1.57,smoothstep(.83,.98,life));
    float c=cos(angle),s=sin(angle);
    float size=.13+iSeed.x*.12;
    vec3 p=aPosition*size;
    p=vec3(p.x,p.y*c-p.z*s,p.y*s+p.z*c);
    float c2=cos(angle*.71),s2=sin(angle*.71);p=vec3(c2*p.x+s2*p.z,p.y,-s2*p.x+c2*p.z);
    vec3 center=iLanding.xyz;
    center.y=iLanding.w-(iLanding.w-iLanding.y)*pow(fall,1.22);
    center.x+=sin(uTime*.37+iSeed.z*30.)*1.1*(1.-fall)+uWind*fall*3.2;
    center.z+=cos(uTime*.29+iSeed.x*30.)*.85*(1.-fall);
    // Leaves settle on the actual terrain, rest, then fade before rebirth.
    float fade=smoothstep(0.,.045,life)*smoothstep(1.,.92,life);
    p*=fade;p+=center;
    vColor=mix(vec3(.88,.30,.025),vec3(1.,.68,.045),iSeed.x);vNormal=normalize(vec3(s,1.,c));vWorld=p;
    gl_Position=uViewProjection*vec4(p,1.);
  }`;
  const particleFS=head+`
  in vec3 vColor;in vec3 vNormal;in vec3 vWorld;uniform vec3 uSunDirection;uniform vec3 uCamera;out vec4 outColor;
  void main(){vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;float l=.55+max(dot(n,uSunDirection),0.)*1.35;vec3 col=vColor*l;float d=length(uCamera-vWorld);col=mix(col,vec3(.65,.66,.50),1.-exp(-d*.01));outColor=vec4(col,1.);}`;
  const moteVS=head+`
  layout(location=0)in vec3 iSeed;uniform mat4 uViewProjection;uniform float uTime;uniform vec3 uCamera;uniform vec2 uResolution;
  out float vAlpha;
  void main(){vec3 p=iSeed*vec3(72.,11.,72.)+vec3(-36.,.4,-36.);p.x+=sin(uTime*.12+iSeed.y*30.)*2.;p.y+=sin(uTime*.21+iSeed.z*30.)*.6;p.z+=cos(uTime*.15+iSeed.x*30.)*1.4;
  gl_Position=uViewProjection*vec4(p,1.);float d=length(uCamera-p);gl_PointSize=clamp(32./d,1.,3.)*uResolution.y/800.;vAlpha=(.10+.25*sin(iSeed.x*80.+uTime*.5))*(1.-smoothstep(18.,48.,d));}`;
  const moteFS=head+`in float vAlpha;out vec4 outColor;void main(){float d=length(gl_PointCoord-.5);float a=(1.-smoothstep(.05,.5,d))*vAlpha;outColor=vec4(1.,.85,.48,a);}`;
  const stepVS=head+`
  layout(location=0)in vec3 iPosition;layout(location=1)in vec2 iBirthType;
  uniform mat4 uViewProjection;uniform float uTime;uniform vec2 uResolution;uniform vec3 uCamera;
  out float vAlpha;out float vType;
  void main(){float age=uTime-iBirthType.x;vec3 p=iPosition;p.y+=age*(iBirthType.y>.5?.7:.36)-age*age*.24;p.x+=age*.15;
  gl_Position=uViewProjection*vec4(p,1.);float d=length(uCamera-p);gl_PointSize=clamp((iBirthType.y>.5?32.:22.)/d,1.5,8.)*uResolution.y/800.;vAlpha=max(1.-age/1.1,0.)*.48;vType=iBirthType.y;}`;
  const stepFS=head+`in float vAlpha;in float vType;out vec4 outColor;void main(){float d=length(gl_PointCoord-.5);float a=(1.-smoothstep(.08,.5,d))*vAlpha;vec3 color=mix(vec3(.73,.47,.15),vec3(.77,.86,.79),vType);outColor=vec4(color,a);}`;
  F.shaders={sceneVS,sceneFS,depthVS,depthFS,fullVS,skyVS,skyFS,volumeFS,waterFS,waterMaskVS,waterMaskFS,maskFS,compositeFS,bloomFS,brightFS,finalFS,particleVS,particleFS,moteVS,moteFS,stepVS,stepFS};
})(window.Forest);
