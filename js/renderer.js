/* Native WebGL2 renderer: instanced HDR geometry -> shadows -> water -> air -> film. */
'use strict';
(function(F){
  const {V,perspective,lookAt,ortho,multiply,inverse,clamp}=F.math;
  class Renderer{
    constructor(canvas,world){
      this.canvas=canvas;this.world=world;
      const gl=this.gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:true,stencil:false,powerPreference:'high-performance',preserveDrawingBuffer:false});
      if(!gl)throw new Error('WEBGL2_UNAVAILABLE');
      this.floatColor=!!gl.getExtension('EXT_color_buffer_float');
      this.aniso=gl.getExtension('EXT_texture_filter_anisotropic');
      this.programs={};this.batches=[];this.textures={};this.targets={};
      this.width=0;this.height=0;this.renderScale=.82;this.quality='auto';this.autoScale=.82;
      this.time=0;this.wind=.62;this.volume=true;this.reflections=true;
      this.frameTimes=[];this.lastFPS=60;this.frameCounter=0;this.lastQualityChange=0;
      this.shadowMatrices=[];this.lastShadowTime=-10;this.shadowCenter=[1e5,0,1e5];
      this.shadowTick=0;this.visibleBatches=[];this.farBatches=[];this.shadowBatches=[];
      this.sun=V.normalize([.48,.44,-.76]);
      this.init();
    }
    shader(type,source,label){
      const gl=this.gl,s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){
        const message=label+'\n'+gl.getShaderInfoLog(s);gl.deleteShader(s);throw new Error(message);
      }return s;
    }
    program(name,vs,fs){
      const gl=this.gl,p=gl.createProgram();
      const v=this.shader(gl.VERTEX_SHADER,vs,name+' vertex'),f=this.shader(gl.FRAGMENT_SHADER,fs,name+' fragment');
      gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);
      if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(name+' link: '+gl.getProgramInfoLog(p));
      const uniforms={},types={};const count=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);
      for(let i=0;i<count;i++){const info=gl.getActiveUniform(p,i);const key=info.name.replace(/\[0\]$/,'');uniforms[key]=gl.getUniformLocation(p,info.name);types[key]=info.type;}
      this.programs[name]={p,u:uniforms,types};return p;
    }
    use(p){this.gl.useProgram(p.p);this.currentProgram=p;}
    init(){
      const gl=this.gl,S=F.shaders;
      this.program('scene',S.sceneVS,S.sceneFS);this.program('depth',S.depthVS,S.depthFS);
      this.program('sky',S.skyVS,S.skyFS);this.program('volume',S.fullVS,S.volumeFS);
      this.program('waterSurface',S.waterSurfaceVS,S.waterSurfaceFS);this.program('waterInfo',S.waterInfoVS,S.waterInfoFS);this.program('composite',S.fullVS,S.compositeFS);
      this.program('bright',S.fullVS,S.brightFS);this.program('bloom',S.fullVS,S.bloomFS);this.program('final',S.fullVS,S.finalFS);
      this.program('particle',S.particleVS,S.particleFS);this.program('mote',S.moteVS,S.moteFS);this.program('stepParticle',S.stepVS,S.stepFS);
      for(const [name,canvas]of Object.entries(F.createTextures()))this.textures[name]=this.textureFromCanvas(canvas);
      this.shadowNear=this.createDepthTarget(1536);this.shadowFar=this.createDepthTarget(1536);
      this.fullVAO=gl.createVertexArray();
      gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
      gl.clearColor(.3,.35,.25,1);
      this.buildScene();
      this.buildParticles();
    }
    textureFromCanvas(canvas){
      const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.SRGB8_ALPHA8,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
      gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
      if(this.aniso)gl.texParameterf(gl.TEXTURE_2D,this.aniso.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      return t;
    }
    createTarget(w,h,depth=false,float=true){
      const gl=this.gl,fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);
      const color=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,color);
      const internal=float&&this.floatColor?gl.RGBA16F:gl.RGBA8,type=float&&this.floatColor?gl.HALF_FLOAT:gl.UNSIGNED_BYTE;
      gl.texImage2D(gl.TEXTURE_2D,0,internal,w,h,0,gl.RGBA,type,null);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,color,0);
      let distanceTexture=null;
      if(depth){
        distanceTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,distanceTexture);
        gl.texImage2D(gl.TEXTURE_2D,0,this.floatColor?gl.RG16F:gl.RG8,w,h,0,gl.RG,this.floatColor?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,distanceTexture,0);
      }
      let depthTexture=null;
      if(depth){depthTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,depthTexture);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,w,h,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_MODE,gl.NONE);
        gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,depthTexture,0);
      }
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('FRAMEBUFFER_INCOMPLETE');
      return{fbo,color,depth:depthTexture,distance:distanceTexture,w,h};
    }
    createDepthTarget(size,shadow=true){
      const gl=this.gl,fbo=gl.createFramebuffer(),texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,size,size,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,shadow?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,shadow?gl.LINEAR:gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_MODE,shadow?gl.COMPARE_REF_TO_TEXTURE:gl.NONE);
      if(shadow)gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_FUNC,gl.LEQUAL);
      gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,texture,0);
      gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('DEPTH_FRAMEBUFFER_INCOMPLETE');
      return{fbo,depth:texture,w:size,h:size};
    }
    createWaterInfo(w,h){
      const gl=this.gl,fbo=gl.createFramebuffer(),info=gl.createTexture(),depth=gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D,depth);gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,w,h,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_MODE,gl.NONE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D,info);gl.texImage2D(gl.TEXTURE_2D,0,this.floatColor?gl.RG16F:gl.RG8,w,h,0,gl.RG,this.floatColor?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,info,0);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,depth,0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('WATER_INFO_FRAMEBUFFER_INCOMPLETE');
      return{fbo,color:info,depth,w,h};
    }
    geometry(mesh){
      const gl=this.gl,vbo=gl.createBuffer(),ibo=gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,mesh.vertices,gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);
      return{vbo,ibo,count:mesh.indices.length,triangles:mesh.triangles};
    }
    makeBatchVAO(geometry,instanceBuffer){
      const gl=this.gl,vao=gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER,geometry.vbo);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,geometry.ibo);
      for(let i=0;i<6;i++)gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(0,3,gl.FLOAT,false,52,0);gl.vertexAttribPointer(1,3,gl.FLOAT,false,52,12);
      gl.vertexAttribPointer(2,2,gl.FLOAT,false,52,24);gl.vertexAttribPointer(3,3,gl.FLOAT,false,52,32);
      gl.vertexAttribPointer(4,1,gl.FLOAT,false,52,44);gl.vertexAttribPointer(5,1,gl.FLOAT,false,52,48);
      if(instanceBuffer)this.bindInstances(instanceBuffer);
      else{
        gl.vertexAttrib3f(6,0,0,0);gl.vertexAttrib4f(7,1,1,1,0);gl.vertexAttrib4f(8,1,1,1,0);gl.vertexAttrib1f(9,0);
      }
      gl.bindVertexArray(null);
      return vao;
    }
    instanceBuffer(list){
      const gl=this.gl,buffer=gl.createBuffer(),data=new Float32Array(list.length*12);
      for(let i=0;i<list.length;i++){
        const a=list[i],o=i*12;data[o]=a.position[0];data[o+1]=a.position[1];data[o+2]=a.position[2];
        data[o+3]=a.scale[0];data[o+4]=a.scale[1];data[o+5]=a.scale[2];data[o+6]=a.rotation;
        data[o+7]=a.color[0];data[o+8]=a.color[1];data[o+9]=a.color[2];data[o+10]=a.phase;data[o+11]=a.variant||0;
      }gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
      return{buffer,data,count:list.length};
    }
    bindInstances(buffer){
      const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      for(let i=6;i<=9;i++)gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(6,3,gl.FLOAT,false,48,0);gl.vertexAttribPointer(7,4,gl.FLOAT,false,48,12);gl.vertexAttribPointer(8,4,gl.FLOAT,false,48,28);gl.vertexAttribPointer(9,1,gl.FLOAT,false,48,44);
      gl.vertexAttribDivisor(6,1);gl.vertexAttribDivisor(7,1);gl.vertexAttribDivisor(8,1);gl.vertexAttribDivisor(9,1);
    }
    batch(name,geometry,instances,mode,options={}){
      if(!geometry||!geometry.indices.length)return null;
      const gl=this.gl,inst=this.instanceBuffer(instances||[{position:[0,0,0],scale:[1,1,1],rotation:0,phase:0,color:[1,1,1]}]);
      const gpuGeometry=this.geometry(geometry);
      const vao=this.makeBatchVAO(gpuGeometry,instances?inst.buffer:null);
      const batch={name,vbo:gpuGeometry.vbo,ibo:gpuGeometry.ibo,indexCount:gpuGeometry.count,triangles:gpuGeometry.triangles,instances:inst,mode,vao,visibleCount:inst.count,static:!instances,...options};this.batches.push(batch);return batch;
    }
    buildScene(){
      const w=this.world,G=F.geometry;
      this.batch('terrain',G.createTerrain(w),null,0,{texture:'soil',shadow:false,frustum:false});
      this.batch('mountains',G.createMountains(),null,0,{texture:'soil',shadow:false,frustum:false});
      this.treeBatches=[];
      for(let t=0;t<3;t++){
        for(let variant=0;variant<4;variant++){
          const high=G.createTree(t,3041+t*971,0,variant),low=G.createTree(t,3041+t*971,1,variant);
          const instances=w.trees[t].filter(tree=>tree.variant===variant);
          const wood=this.batch('wood-'+t+'-'+variant,high.wood,instances,1,{texture:'bark',frustum:true,radius:8,centerY:7});
          const leaves=this.batch('leaves-'+t+'-'+variant,high.leaves,instances,2,{frustum:true,radius:8,centerY:9,lod:1,shadow:true});
          const lowLeaves=this.batch('far-leaves-'+t+'-'+variant,low.leaves,instances,2,{frustum:true,radius:8,centerY:9,far:true,lod:2});
          this.treeBatches.push({wood,leaves,lowLeaves});
        }
      }
      this.batch('ferns',G.createFern(357),w.ferns,3,{frustum:true,radius:1.4,centerY:.4,maxDistance:44});
      this.batch('grasses',G.createGrass(855),w.grasses,4,{frustum:true,radius:.6,centerY:.3,maxDistance:34});
      this.batch('rocks',G.createRock(883),w.rocks,4,{texture:'stone',frustum:true,radius:1,centerY:.2});
      this.batch('logs',G.createLog(),w.logs,1,{texture:'bark',frustum:true,radius:3,centerY:.4});
      this.batch('leaf-litter',G.createGroundLeaf(),w.groundLeaves,2,{frustum:true,radius:.4,centerY:.05,maxDistance:48});
      this.batch('saplings',G.createTree(1,790,1,2).leaves,w.saplings,2,{frustum:true,radius:1.2,centerY:1,maxDistance:48});
      this.water=this.batch('water',G.createWater(w),null,5,{texture:'stone',shadow:false,frustum:false});
    }
    buildParticles(){
      const gl=this.gl,geo=this.geometry(F.geometry.createGroundLeaf()),random=F.math.rng(77234),data=new Float32Array(1250*8);
      for(let i=0;i<1250;i++){
        data[i*8]=random();data[i*8+1]=random();data[i*8+2]=random();data[i*8+3]=random();
        const x=data[i*8]*110-55,z=data[i*8+2]*110-55;
        data[i*8+4]=x;data[i*8+5]=this.world.height(x,z)+.045;data[i*8+6]=z;data[i*8+7]=8+data[i*8+1]*9;
      }
      this.particleCount=1250;this.particleTriangles=geo.triangles;this.particleVAO=this.makeBatchVAO(geo,null);gl.bindVertexArray(this.particleVAO);
      const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
      gl.enableVertexAttribArray(6);gl.vertexAttribPointer(6,4,gl.FLOAT,false,32,0);gl.vertexAttribDivisor(6,1);
      gl.enableVertexAttribArray(10);gl.vertexAttribPointer(10,4,gl.FLOAT,false,32,16);gl.vertexAttribDivisor(10,1);
      this.moteVAO=gl.createVertexArray();gl.bindVertexArray(this.moteVAO);
      const motes=new Float32Array(850*3);for(let i=0;i<motes.length;i++)motes[i]=random();
      const mb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,mb);gl.bufferData(gl.ARRAY_BUFFER,motes,gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,12,0);gl.vertexAttribDivisor(0,0);
      this.moteCount=850;gl.bindVertexArray(null);
      this.stepParticleBuffer=gl.createBuffer();this.stepParticleVAO=gl.createVertexArray();gl.bindVertexArray(this.stepParticleVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.stepParticleBuffer);gl.bufferData(gl.ARRAY_BUFFER,72*20,gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,20,0);gl.vertexAttribDivisor(0,0);
      gl.enableVertexAttribArray(10);gl.vertexAttribPointer(10,2,gl.FLOAT,false,20,12);gl.vertexAttribDivisor(10,0);
      this.stepParticles=[];this.lastStepEvent=0;
    }
    resize(){
      const dpr=Math.min(window.devicePixelRatio||1,innerWidth<700?1.25:1.35),w=Math.floor(innerWidth*dpr),h=Math.floor(innerHeight*dpr);
      this.canvas.width=w;this.canvas.height=h;
      this.width=Math.max(320,Math.floor(w*this.renderScale));this.height=Math.max(180,Math.floor(h*this.renderScale));
      for(const key of ['scene','reflection','reflectionDistance','waterComposite','composite','waterInfo','volume','bloomA','bloomB'])if(this.targets[key]){
        const t=this.targets[key];this.gl.deleteFramebuffer(t.fbo);this.gl.deleteTexture(t.color);if(t.depth)this.gl.deleteTexture(t.depth);if(t.distance)this.gl.deleteTexture(t.distance);
      }
      const w0=this.width,h0=this.height;
      this.targets.scene=this.createTarget(w0,h0,true);
      this.targets.reflection=this.createTarget(w0,h0,true);
      this.targets.reflectionDistance=this.createTarget(w0,h0,false);
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER,this.targets.reflectionDistance.fbo);
      this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER,this.gl.COLOR_ATTACHMENT0,this.gl.TEXTURE_2D,this.targets.scene.distance,0);
      this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER,this.gl.DEPTH_ATTACHMENT,this.gl.TEXTURE_2D,null,0);
      this.targets.reflectionDistance.distance=this.targets.scene.distance;
      this.targets.waterComposite=this.createTarget(w0,h0,false);
      this.targets.composite=this.createTarget(w0,h0,false);
      this.targets.waterInfo=this.createWaterInfo(w0,h0);
      this.targets.volume=this.createTarget(Math.ceil(w0/2),Math.ceil(h0/2));
      this.targets.bloomA=this.createTarget(Math.ceil(w0/4),Math.ceil(h0/4));
      this.targets.bloomB=this.createTarget(Math.ceil(w0/4),Math.ceil(h0/4));
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER,null);
    }
    setQuality(value){
      this.quality=value;
      const scales={high:1,balanced:.83,low:.65,auto:this.autoScale};
      this.renderScale=scales[value]||.83;this.resize();
    }
    texture(unit,texture,program,name){
      const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);
      if(this.currentProgram!==program)this.use(program);
      if(program.u[name]!==undefined)gl.uniform1i(program.u[name],unit);
    }
    uniforms(p,values){
      const gl=this.gl;
      for(const [name,value]of Object.entries(values)){
        const loc=p.u[name];if(loc===undefined||loc===null)continue;
        if(typeof value==='number'){
          if(p.types[name]===gl.INT||p.types[name]===gl.BOOL||p.types[name]===gl.SAMPLER_2D||p.types[name]===gl.SAMPLER_2D_SHADOW)gl.uniform1i(loc,value);else gl.uniform1f(loc,value);
        }
        else if(value.length===16)gl.uniformMatrix4fv(loc,false,value);
        else if(value.length===2)gl.uniform2fv(loc,value);
        else if(value.length===3)gl.uniform3fv(loc,value);
        else if(value.length===4)gl.uniform4fv(loc,value);
      }
    }
    pass(name,target){const gl=this.gl,p=this.programs[name];gl.useProgram(p.p);this.currentProgram=p;gl.bindFramebuffer(gl.FRAMEBUFFER,target?target.fbo:null);gl.viewport(0,0,target?target.w:this.canvas.width,target?target.h:this.canvas.height);
      if(target)gl.drawBuffers(target.distance&&target!==this.targets.reflection?[gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]:[gl.COLOR_ATTACHMENT0]);
      for(let i=0;i<8;i++){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,null);}
      return p;}
    setShadowUniforms(p){
      this.uniforms(p,{uShadowVP0:this.shadowMatrices[0],uShadowVP1:this.shadowMatrices[1]});
      this.texture(3,this.shadowNear.depth,p,'uShadowNear');this.texture(4,this.shadowFar.depth,p,'uShadowFar');
    }
    showTexture(target){
      if(!this.debugTexture){
        this.program('debug',F.shaders.fullVS,F.shaders.maskFS);this.debugTexture=this.programs.debug;
      }
      const p=this.pass('debug',null);this.texture(0,target.color,p,'uMask');this.gl.bindVertexArray(this.fullVAO);this.gl.drawArrays(this.gl.TRIANGLES,0,3);
    }
    filterInstances(batch,shadowPass=false,shadowRange=75){
      if(!batch||batch.static)return batch?1:0;
      const data=batch.instances.data,field=shadowPass?'shadowFilter':'viewFilter';
      const filter=batch[field]||(batch[field]={});
      const out=filter.data||(filter.data=new Float32Array(data.length));
      let count=0;
      const maxDistance=batch.far?145:batch.lod===1?25:batch.lod===2?40:batch.maxDistance||100;
      const camera=this.cameraPos;
      for(let i=0;i<batch.instances.count;i++){
        const o=i*12,dx=data[o]-camera[0],dz=data[o+2]-camera[2],dist=Math.hypot(dx,dz);
        if(dist>maxDistance)continue;
        if(shadowPass&&dist>shadowRange)continue;
        if(batch.frustum&&this.frustum){
          const x=data[o],y=data[o+1]+(batch.centerY||2),z=data[o+2],r=batch.radius||2;
          const f=this.frustum;let visible=true;
          for(let k=0;k<4;k++){if(f[k][0]*x+f[k][1]*y+f[k][2]*z+f[k][3]<-r){visible=false;break;}}
          if(!visible)continue;
        }
        if(count!==i)out.set(data.subarray(o,o+12),count*12);count++;
      }
      if(!count)return 0;
      if(!filter.buffer){
        const gl=this.gl;filter.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,filter.buffer);gl.bufferData(gl.ARRAY_BUFFER,data.byteLength,gl.DYNAMIC_DRAW);
        filter.vao=this.makeBatchVAO(batch,filter.buffer);
      }
      const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,filter.buffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,out.subarray(0,count*12));return count;
    }
    drawBatch(batch,count=-1,shadowPass=false){
      const gl=this.gl;if(!batch)return;
      if(batch.static){
        gl.bindVertexArray(batch.vao);gl.drawElementsInstanced(gl.TRIANGLES,batch.indexCount,gl.UNSIGNED_INT,0,1);
        this.triangles+=batch.triangles;this.drawCalls++;return;
      }
      const n=count<0?batch.instances.count:count;if(!n)return;
      const filter=batch[shadowPass?'shadowFilter':'viewFilter'];
      const vao=filter&&filter.vao?filter.vao:batch.vao;
      gl.bindVertexArray(vao);gl.drawElementsInstanced(gl.TRIANGLES,batch.indexCount,gl.UNSIGNED_INT,0,n);
      this.triangles+=batch.triangles*n;this.drawCalls++;
    }
    shadowMap(camera,forward){
      const gl=this.gl,p=this.programs.depth;this.use(p);
      gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.clearDepth(1);gl.disable(gl.BLEND);
      for(let index=0;index<2;index++){
        const span=index===0?29:79;
        const center=[camera[0]+forward[0]*(index===0?10:29),0,camera[2]+forward[2]*(index===0?10:29)];
        center[0]=Math.round(center[0]*2)/2;center[2]=Math.round(center[2]*2)/2;
        const eye=[center[0]+this.sun[0]*105,center[1]+this.sun[1]*105,center[2]+this.sun[2]*105];
        const light=multiply(ortho(-span,span,-span,span,.5,240),lookAt(eye,center,[0,1,0]));
        this.shadowMatrices[index]=light;
        gl.bindFramebuffer(gl.FRAMEBUFFER,index===0?this.shadowNear.fbo:this.shadowFar.fbo);gl.viewport(0,0,1536,1536);gl.clear(gl.DEPTH_BUFFER_BIT);
        this.uniforms(p,{uLightVP:light,uTime:this.time,uWind:this.wind});
        for(const batch of this.shadowBatches){
          this.uniforms(p,{uMode:batch.mode});this.drawBatch(batch,batch.visibleCount,true);
        }
      }
    }
    render(camera,forward,dt){
      if(!this.width||this.canvas.width!==Math.floor(innerWidth*Math.min(devicePixelRatio||1,innerWidth<700?1.25:1.35))||this.canvas.height!==Math.floor(innerHeight*Math.min(devicePixelRatio||1,innerWidth<700?1.25:1.35)))this.resize();
      const gl=this.gl;this.cameraPos=camera;this.drawCalls=0;this.triangles=0;
      const aspect=this.width/this.height,projection=perspective(67*Math.PI/180,aspect,.10,290);
      const view=lookAt(camera,[camera[0]+forward[0],camera[1]+forward[1],camera[2]+forward[2]],[0,1,0]);
      const vp=multiply(projection,view),invVP=inverse(vp);this.vp=vp;this.invVP=invVP;
      this.frustum=[];
      for(const m of [[vp[3]+vp[0],vp[7]+vp[4],vp[11]+vp[8],vp[15]+vp[12]],[vp[3]-vp[0],vp[7]-vp[4],vp[11]-vp[8],vp[15]-vp[12]],[vp[3]+vp[1],vp[7]+vp[5],vp[11]+vp[9],vp[15]+vp[13]],[vp[3]-vp[1],vp[7]-vp[5],vp[11]-vp[9],vp[15]-vp[13]]]){
        const len=Math.hypot(m[0],m[1],m[2]);this.frustum.push(m.map(v=>v/len));
      }
      this.visibleBatches.length=0;this.farBatches.length=0;
      for(const batch of this.batches){
        const count=batch.frustum?this.filterInstances(batch):batch.instances.count;
        batch.visibleCount=count;if(!count)continue;
        if(batch.far)this.farBatches.push(batch);else this.visibleBatches.push(batch);
      }
      // Complete caster coverage: the camera cannot hide objects that still block the sun.
      this.shadowBatches.length=0;
      for(const batch of this.batches){
        if(batch.static)continue;
        if(batch.shadow===false||batch.name==='water'||batch.name.startsWith('leaf-litter')||batch.name==='grasses')continue;
      const source=batch.far?batch:batch.lod===1?batch.lodTreeFar||batch:batch;
        if(!source)continue;
        const count=this.filterInstances(source,true,110);if(!count)continue;
        source.visibleCount=count;this.shadowBatches.push(source);
      }
      if(this.time-this.lastShadowTime>.24||Math.hypot(camera[0]-this.shadowCenter[0],camera[2]-this.shadowCenter[2])>2.5){
        this.shadowMap(camera,forward);this.lastShadowTime=this.time;this.shadowCenter=[camera[0],0,camera[2]];
      }
      let p=this.pass('scene',this.targets.scene);gl.depthMask(true);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.disable(gl.BLEND);
      this.uniforms(p,{uViewProjection:vp,uCamera:camera,uSunDirection:this.sun,uTime:this.time,uWind:this.wind,uFogColor:[.43,.51,.44]});
      this.setShadowUniforms(p);
      this.uniforms(p,{uPathX:this.world.pathX(camera[2]),uCreekX:this.world.creekX(camera[2])});
      for(const batch of this.visibleBatches){
        if(batch.name==='water')continue;
        this.uniforms(p,{uMode:batch.mode});
        this.texture(0,this.textures[batch.texture||'soil'],p,'uTexture');
        this.drawBatch(batch,batch.visibleCount);
      }
      for(const lowLeaves of this.farBatches){this.uniforms(p,{uMode:2});this.drawBatch(lowLeaves,lowLeaves.visibleCount);}
      this.drawParticles();
      p=this.pass('sky',this.targets.scene);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(false);
      this.uniforms(p,{uInverseVP:invVP,uCamera:camera,uSunDirection:this.sun,uTime:this.time});gl.bindVertexArray(this.fullVAO);gl.drawArrays(gl.TRIANGLES,0,3);this.drawCalls++;
      gl.disable(gl.DEPTH_TEST);
      // Actual water depth, not a color mask or an approximation based on the scene depth.
      // Seed water depth from opaque geometry. A creek behind a tree cannot cover the trunk.
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER,this.targets.scene.fbo);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,this.targets.waterInfo.fbo);
      gl.blitFramebuffer(0,0,this.width,this.height,0,0,this.width,this.height,gl.DEPTH_BUFFER_BIT,gl.NEAREST);
      p=this.pass('waterInfo',this.targets.waterInfo);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.clearColor(999,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);
      this.uniforms(p,{uViewProjection:vp,uCamera:camera});this.drawBatch(this.water,-1);
      gl.disable(gl.DEPTH_TEST);gl.depthMask(false);
      p=this.pass('volume',this.targets.volume);this.uniforms(p,{uDepth:0,uInverseVP:invVP,uCamera:camera,uSunDirection:this.sun,uTime:this.time,uSteps:this.quality==='low'?10:this.quality==='high'?20:14});
      this.texture(0,this.targets.waterInfo.depth,p,'uDepth');this.setShadowUniforms(p);gl.bindVertexArray(this.fullVAO);gl.drawArrays(gl.TRIANGLES,0,3);this.drawCalls++;
      // The creek is a depth-tested transparent mesh, not a full-screen reflection overlay.
      // A read-only color copy is required for reflections; never sample the active render target.
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER,this.targets.scene.fbo);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,this.targets.reflection.fbo);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,this.targets.reflection.fbo);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      gl.blitFramebuffer(0,0,this.width,this.height,0,0,this.width,this.height,gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT,gl.NEAREST);
      p=this.pass('waterSurface',this.targets.waterComposite);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(false);
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
      this.uniforms(p,{uViewProjection:vp,uInverseVP:invVP,uCamera:camera,uSunDirection:this.sun,uTime:this.time,uReflections:this.reflections?1:0});
      this.texture(0,this.targets.reflection.color,p,'uColor');this.texture(1,this.targets.reflectionDistance.distance,p,'uDistanceTexture');
      if(p.u.uRipples)gl.uniform4fv(p.u.uRipples,F.player?F.player.rippleData():new Float32Array(32));
      const obstacles=this.flowObstacleData||(this.flowObstacleData=(()=>{const a=new Float32Array(48);this.world.waterObstacles.slice(0,12).forEach((o,i)=>{a[i*4]=o.x;a[i*4+1]=o.z;a[i*4+2]=o.radius;a[i*4+3]=o.height;});return a;})());
      if(p.u.uFlowObstacles)gl.uniform4fv(p.u.uFlowObstacles,obstacles);
      this.drawBatch(this.water,-1);gl.disable(gl.BLEND);gl.depthMask(true);
      p=this.pass('composite',this.targets.composite);this.uniforms(p,{uVolumeEnabled:this.volume?1:0,uVolumeTexel:[1/this.targets.volume.w,1/this.targets.volume.h]});
      this.texture(0,this.targets.scene.color,p,'uColor');this.texture(1,this.targets.volume.color,p,'uVolume');this.texture(2,this.targets.waterComposite.color,p,'uWater');this.texture(3,this.targets.scene.depth,p,'uSceneDepth');this.texture(4,this.targets.waterInfo.depth,p,'uWaterDepth');gl.bindVertexArray(this.fullVAO);gl.drawArrays(gl.TRIANGLES,0,3);this.drawCalls++;
      p=this.pass('bright',this.targets.bloomA);this.texture(0,this.targets.composite.color,p,'uTexture');gl.bindVertexArray(this.fullVAO);gl.drawArrays(gl.TRIANGLES,0,3);
      p=this.pass('bloom',this.targets.bloomB);this.texture(0,this.targets.bloomA.color,p,'uTexture');this.uniforms(p,{uDirection:[1/this.targets.bloomA.w,0]});gl.drawArrays(gl.TRIANGLES,0,3);
      p=this.pass('bloom',this.targets.bloomA);this.texture(0,this.targets.bloomB.color,p,'uTexture');this.uniforms(p,{uDirection:[0,1/this.targets.bloomA.h]});gl.drawArrays(gl.TRIANGLES,0,3);
      p=this.pass('final',null);this.uniforms(p,{uTexel:[1/this.width,1/this.height]});
      this.texture(0,this.targets.composite.color,p,'uColor');this.texture(1,this.targets.bloomA.color,p,'uBloom');gl.bindVertexArray(this.fullVAO);gl.drawArrays(gl.TRIANGLES,0,3);this.drawCalls++;
      gl.depthMask(true);gl.enable(gl.DEPTH_TEST);this.frameCounter++;
      return{drawCalls:this.drawCalls,triangles:this.triangles};
    }
    drawParticles(){
      const gl=this.gl,p=this.programs.particle;this.use(p);
      this.uniforms(p,{uViewProjection:this.vp,uTime:this.time,uWind:this.wind,uCamera:this.cameraPos,uSunDirection:this.sun});
      gl.bindVertexArray(this.particleVAO);gl.drawElementsInstanced(gl.TRIANGLES,this.particleTriangles*3,gl.UNSIGNED_INT,0,this.quality==='low'?450:1250);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.NONE]);
      this.triangles+=21*1250;this.drawCalls++;
      gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.depthMask(false);
      const m=this.programs.mote;this.use(m);this.uniforms(m,{uViewProjection:this.vp,uTime:this.time,uCamera:this.cameraPos,uResolution:[this.width,this.height]});
      gl.bindVertexArray(this.moteVAO);gl.drawArrays(gl.POINTS,0,this.quality==='low'?250:850);this.drawCalls++;
      const player=window.Forest.player;
      if(player&&player.stepEvents!==this.lastStepEvent){
        this.lastStepEvent=player.stepEvents;
        for(let i=0;i<6;i++){
          const a=i*2.4+player.stepEvents,r=.12+(i%3)*.07;
          const x=player.position[0]+Math.cos(a)*r,z=player.position[2]+Math.sin(a)*r;
          this.stepParticles.push([x,this.world.height(x,z)+.07,z,this.time,player.inWater?1:0]);
        }
        if(this.stepParticles.length>72)this.stepParticles.splice(0,this.stepParticles.length-72);
      }
      this.stepParticles=this.stepParticles.filter(p=>this.time-p[3]<1.15);
      if(this.stepParticles.length){
        const s=this.programs.stepParticle;this.use(s);this.uniforms(s,{uViewProjection:this.vp,uTime:this.time,uCamera:this.cameraPos,uResolution:[this.width,this.height]});
        gl.bindVertexArray(this.stepParticleVAO);gl.bindBuffer(gl.ARRAY_BUFFER,this.stepParticleBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,new Float32Array(this.stepParticles.flat()));gl.drawArrays(gl.POINTS,0,this.stepParticles.length);this.drawCalls++;
      }
      gl.depthMask(true);gl.disable(gl.BLEND);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
    }
    updatePerformance(dt){
      this.frameTimes.push(dt);if(this.frameTimes.length>180)this.frameTimes.shift();
      if(this.frameCounter%180===0&&this.frameTimes.length>90){
        const sorted=this.frameTimes.slice().sort((a,b)=>a-b),avg=sorted.reduce((a,b)=>a+b,0)/sorted.length;
        this.lastFPS=Math.round(1/avg);
        if(this.quality==='auto'&&this.time-this.lastQualityChange>4){
          let next=this.autoScale;
          const slow=sorted[Math.floor(sorted.length*.8)],fast=sorted[Math.floor(sorted.length*.35)];
          if(slow>.027&&this.autoScale>.56)next=Math.max(.56,this.autoScale-.07);
          else if(fast<.0155&&this.autoScale<.96)next=Math.min(.96,this.autoScale+.035);
          if(Math.abs(next-this.autoScale)>.01){this.autoScale=next;this.renderScale=next;this.lastQualityChange=this.time;this.resize();}
        }
      }
    }
  }
  F.Renderer=Renderer;
})(window.Forest);
