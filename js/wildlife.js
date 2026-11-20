/* Dynamic wildlife rendering in the same scene, light and shadow coordinate space. */
'use strict';
(function(F){
  const {V,lerp}=F.math;
  const head='#version 300 es\nprecision highp float;\n';
  const vertex=head+`
  layout(location=0)in vec3 aPosition;layout(location=1)in vec3 aNormal;layout(location=2)in vec3 aColor;
  layout(location=3)in vec4 iPositionScale;layout(location=4)in vec4 iRotationPart;
  layout(location=5)in vec4 iColorTint;layout(location=6)in vec4 iAnchorScale;
  uniform mat4 uViewProjection;uniform float uShadowPass;uniform mat4 uLightVP;
  out vec3 vColor;out vec3 vNormal;out vec3 vWorld;
  void main(){
    vec3 p=aPosition*iAnchorScale.w+iAnchorScale.xyz;
    vec3 n=aNormal/iAnchorScale.w;
    float angle=iRotationPart.z,c=cos(angle),s=sin(angle);
    p=vec3(p.x,p.y*c-p.z*s,p.y*s+p.z*c);n=vec3(n.x,n.y*c-n.z*s,n.y*s+n.z*c);
    float yaw=iRotationPart.w,cy=cos(yaw),sy=sin(yaw);
    p=vec3(cy*p.x+sy*p.z,p.y,-sy*p.x+cy*p.z);n=vec3(cy*n.x+sy*n.z,n.y,-sy*n.x+cy*n.z);
    p*=iPositionScale.w;
    p+=iPositionScale.xyz;
    vWorld=p;vColor=aColor*iColorTint.rgb;vNormal=normalize(n);
    gl_Position=(uShadowPass>.5?uLightVP:uViewProjection)*vec4(p,1.);
  }`;
  const fragment=head+`
  in vec3 vColor;in vec3 vNormal;in vec3 vWorld;
  uniform vec3 uCamera;uniform vec3 uSunDirection;uniform float uTime;uniform float uShadowPass;
  uniform highp sampler2DShadow uShadowNear;uniform mat4 uShadowVP0;
  layout(location=0)out vec4 outColor;layout(location=1)out vec2 outDistance;
  void main(){
    if(uShadowPass>.5)return;
    vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;
    vec3 view=normalize(uCamera-vWorld);
    vec4 q=uShadowVP0*vec4(vWorld,1.);vec3 uv=q.xyz/q.w*.5+.5;
    float visibility=1.;
    if(all(greaterThan(uv.xy,vec2(.003)))&&all(lessThan(uv.xy,vec2(.997)))&&uv.z<1.)visibility=texture(uShadowNear,vec3(uv.xy,uv.z-.00065));
    float ndl=max(dot(n,uSunDirection),0.),wrap=max((dot(n,uSunDirection)+.35)/1.35,0.);
    vec3 ambient=mix(vec3(.20,.23,.18),vec3(.47,.52,.58),n.y*.5+.5);
    vec3 light=ambient*.94+vec3(1.65,1.40,1.02)*(wrap*.70+.18)*(.23+visibility*.77);
    float rim=pow(1.-max(dot(n,view),0.),3.)*.09;
    vec3 color=vColor*light+vec3(.35,.30,.19)*rim;
    float d=length(uCamera-vWorld);color=mix(color,vec3(.43,.51,.44),1.-exp(-d*.0055));
    outColor=vec4(color,1.);outDistance=vec2(d,0.);
  }`;
  const depthFragment=head+`void main(){}`;
  class WildlifeRenderer{
    constructor(renderer,ecology){
      this.renderer=renderer;this.gl=renderer.gl;this.ecology=ecology;this.batches=[];this.birds=[];
      this.program=renderer.program('animals',vertex,fragment);
      this.depthProgram=renderer.program('animalDepth',vertex,depthFragment);
      this.prototypes={deer:createPrototype(F.anatomy.deer(false)),stag:createPrototype(F.anatomy.deer(true)),squirrel:createPrototype(F.anatomy.squirrel()),bird:createPrototype(F.anatomy.bird())};
      for(const [name,sourceParts]of Object.entries(this.prototypes)){
        const parts=sourceParts.map(part=>({...part}));
        for(const part of parts){
          const geometry=convertMesh(part.mesh),animals=this.ecology.animals.filter(a=>name==='stag'?a.species==='deer'&&a.male:a.species===name&&!a.male);
          const buffer=this.gl.createBuffer();this.gl.bindBuffer(this.gl.ARRAY_BUFFER,buffer);this.gl.bufferData(this.gl.ARRAY_BUFFER,new Float32Array(Math.max(1,animals.length)*16*4),this.gl.DYNAMIC_DRAW);
          this.batches.push({name:part.name,species:name,animals,geometry,vao:this.makeVAO(geometry,buffer),buffer,scratch:new Float32Array(Math.max(1,animals.length)*16),indexCount:geometry.indices.length,triangles:geometry.triangles,legIndex:part.name==='leg'?parts.filter(p=>p.name==='leg').indexOf(part):part.name==='arm'?parts.filter(p=>p.name==='arm').indexOf(part):part.name==='wing'?parts.filter(p=>p.name==='wing').indexOf(part):part.name==='foot'?parts.filter(p=>p.name==='foot').indexOf(part):0});
        }
      }
      const nestGeometry=convertMesh(F.createWildlifeNest());
      this.nestBatch={geometry:nestGeometry,buffer:this.gl.createBuffer(),indexCount:nestGeometry.indices.length,triangles:nestGeometry.triangles,name:'nest'};
      this.nestBatch.vao=this.makeVAO(nestGeometry,this.nestBatch.buffer);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER,this.nestBatch.buffer);this.gl.bufferData(this.gl.ARRAY_BUFFER,new Float32Array(16*6),this.gl.DYNAMIC_DRAW);
      this.batches.push(this.nestBatch);
      const markerMesh=new F.anatomy.Skin();
      F.anatomy.organic(markerMesh,[[0,.05,0],[0,.82,0],[0,1.57,0]],[.012,.017,.007],[.66,.63,.40],{sides:7});
      F.anatomy.organic(markerMesh,[[0,1.55,0],[0,1.66,0],[0,1.77,0]],[[.045,.080,.025],[.085,.11,.085],[.020,.045,.020]],[.78,.68,.38],{sides:10});
      F.anatomy.organic(markerMesh,[[0,.38,0],[0,.44,0],[0,.56,0]],[.013,.024,.013],[.66,.63,.40],{sides:7});
      const markerGeometry=convertMesh(markerMesh.finish());
      this.markerBatch={name:'player-marker',geometry:markerGeometry,buffer:this.gl.createBuffer(),indexCount:markerGeometry.indices.length,triangles:markerGeometry.triangles};
      this.markerBatch.vao=this.makeVAO(markerGeometry,this.markerBatch.buffer);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER,this.markerBatch.buffer);this.gl.bufferData(this.gl.ARRAY_BUFFER,new Float32Array(16),this.gl.DYNAMIC_DRAW);
      this.batches.push(this.markerBatch);
    }
    makeVAO(geometry,buffer){
      const gl=this.gl,vao=gl.createVertexArray();gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER,geometry.vbo);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,geometry.ibo);
      gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,36,0);
      gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,36,12);
      gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,3,gl.FLOAT,false,36,24);
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      for(let i=3;i<=6;i++)gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(3,4,gl.FLOAT,false,64,0);gl.vertexAttribPointer(4,4,gl.FLOAT,false,64,16);
      gl.vertexAttribPointer(5,4,gl.FLOAT,false,64,32);gl.vertexAttribPointer(6,4,gl.FLOAT,false,64,48);
      for(let i=3;i<=6;i++)gl.vertexAttribDivisor(i,1);
      gl.bindVertexArray(null);return vao;
    }
    update(){
      const gl=this.gl;
      for(const batch of this.batches){
        if(batch.name==='player-marker'){
          const player=F.player,visible=!!window.Forest.observer?.active;
          batch.scratch=new Float32Array([player.position[0],player.world.height(player.position[0],player.position[2]),player.position[2],1,0,0,0,0,1,1,1,1,0,0,0,1]);
          gl.bindBuffer(gl.ARRAY_BUFFER,batch.buffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,batch.scratch);batch.count=visible?1:0;continue;
        }
        if(batch.name==='nest'){
          const data=new Float32Array(16);
          for(const [i,nest]of this.ecology.nests.entries()){
            data.set([nest.position[0],nest.position[1],nest.position[2],1,0,0,0,nest.tree.rotation,1,1,1,1,0,0,0,.90],i*16);
          }
          gl.bindBuffer(gl.ARRAY_BUFFER,batch.buffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,data);batch.count=this.ecology.nests.length;continue;
        }
        const data=batch.scratch;
        for(let i=0;i<batch.animals.length;i++){
          const a=batch.animals[i],bodyYaw=a.yaw;
          let position=a.position,scale=a.scale;
          if(batch.species==='bird'&&batch.name==='head'){
            scale*=.73;
          }
          let anchor=[0,0,0],angle=0,partYaw=bodyYaw,partScale=1;
          if(batch.name==='head'){
            anchor=batch.species==='deer'||batch.species==='stag'?[0,1.80,-.69]:batch.species==='squirrel'?[0,.405,-.031]:[0,.158,-.034];
            angle=a.species==='deer'?-a.pose.head*.82:a.species==='squirrel'?a.pose.head:a.pose.head*.6;
          }else if(batch.name==='leg'){
            const side=batch.legIndex<2?-1:1,front=batch.legIndex%2?1:-1;
            anchor=[side*.245,1.03,front*.43];angle=Math.sin(a.pose.legs+(batch.legIndex%2?Math.PI:0)+(batch.legIndex>1?.5:0))*(a.species==='deer'?(a.state==='flee'?.68:.34):.35);
          }else if(batch.name==='tail'){anchor=batch.species==='squirrel'?[0,.13,.11]:[0,1.37,.72];angle=batch.species==='squirrel'?a.pose.tail*.16:a.pose.tail;
          }else if(batch.name==='arm'){anchor=[batch.legIndex%2?1:-1,0,0];anchor[0]*=.09;anchor[1]=.31;anchor[2]=-.045;angle=a.state==='eat'?-.55+Math.sin(this.ecology.time*10)*.12:-.10;
          }else if(batch.name==='wing'){
            anchor=[batch.legIndex%2?.039:-.039,.108,-.003];const flying=['fly','returning','leave'].includes(a.state);
            angle=flying?Math.sin(this.ecology.time*34+a.phase)*.72:0;
            partYaw=bodyYaw+(batch.legIndex%2?1:-1)*angle*.72;
            partScale=flying?1:.38;
          }else if(batch.name==='foot')anchor=[batch.legIndex%2?.027:-.027,.048,.007];
          else if(batch.name==='acorn'){partScale=a.carrying?1:0;anchor=[0,.23,-.19];}
          const o=i*16;
          data[o]=position[0];data[o+1]=position[1];data[o+2]=position[2];data[o+3]=scale;
          data[o+4]=anchor[0];data[o+5]=anchor[1];data[o+6]=anchor[2];data[o+7]=partYaw;
          data[o+8]=1;data[o+9]=1;data[o+10]=1;data[o+11]=batch.species==='squirrel'&&a.state==='climb'?2:1;
          data[o+12]=anchor[0];data[o+13]=anchor[1];data[o+14]=anchor[2];data[o+15]=partScale;
          // Position is always the animal world origin; local joint rotation precedes yaw.
          data[o+4]=0;data[o+5]=0;data[o+6]=angle;data[o+7]=partYaw;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER,batch.buffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,data);batch.count=batch.animals.length;
      }
    }
    uniforms(program,shadow=false){
      const r=this.renderer,p=program;
      r.use(p);
      if(shadow){r.uniforms(p,{uShadowPass:1,uLightVP:r.shadowMatrices[0]});return;}
      r.uniforms(p,{uViewProjection:r.vp,uCamera:r.cameraPos,uSunDirection:r.sun,uTime:r.time,uShadowPass:0});
      r.uniforms(p,{uShadowVP0:r.shadowMatrices[0]});r.texture(3,r.shadowNear.depth,p,'uShadowNear');
    }    draw(shadow=false){
      const gl=this.gl,r=this.renderer,p=shadow?this.depthProgram:this.program;r.use(p);
      if(shadow){
        r.uniforms(p,{uShadowPass:1,uLightVP:r.shadowMatrices[0]});
      }else{
        r.uniforms(p,{uViewProjection:r.vp,uCamera:r.cameraPos,uSunDirection:r.sun,uTime:r.time,uShadowPass:0,uShadowVP0:r.shadowMatrices[0]});
        r.texture(3,r.shadowNear.depth,p,'uShadowNear');
      }
      gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
      for(const batch of this.batches){
        if(!batch.count)continue;
        if(shadow&&batch.name==='nest')continue;
        gl.bindVertexArray(batch.vao);gl.drawElementsInstanced(gl.TRIANGLES,batch.indexCount,gl.UNSIGNED_INT,0,batch.count);
        r.drawCalls++;r.triangles+=batch.triangles*batch.count;
      }
      if(shadow)r.use(r.programs.depth);
    }
  }
  function convertMesh(mesh){
    const gl=F.renderer.gl,data=new Float32Array(mesh.positions.length/3*9);
    for(let i=0;i<mesh.positions.length/3;i++){data.set(mesh.positions.subarray(i*3,i*3+3),i*9);data.set(mesh.normals.subarray(i*3,i*3+3),i*9+3);data.set(mesh.colors.subarray(i*3,i*3+3),i*9+6);}
    return{vbo:buffer(gl,data),ibo:indexBuffer(gl,mesh.indices),indices:mesh.indices,triangles:mesh.triangles};
  }
  function buffer(gl,data){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);return b;}
  function indexBuffer(gl,data){const b=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,b);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,data,gl.STATIC_DRAW);return b;}
  function createPrototype(parts){return parts.map(part=>({...part}));}
  F.WildlifeRenderer=WildlifeRenderer;
})(window.Forest);
