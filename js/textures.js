/* Every texture is painted here. No image or model downloads. */
'use strict';
(function(F){
  function canvasTexture(size,paint){
    const c=document.createElement('canvas');c.width=c.height=size;
    const ctx=c.getContext('2d');paint(ctx,size);return c;
  }
  function barkTexture(){
    const random=F.math.rng(8934);
    return canvasTexture(512,(ctx,n)=>{
      ctx.fillStyle='#77705a';ctx.fillRect(0,0,n,n);
      for(let i=0;i<3900;i++){
        const x=random()*n,y=random()*n,w=.5+random()*4,h=6+random()*66;
        const v=Math.floor(39+random()*81);
        ctx.fillStyle=`rgba(${v+10},${v+5},${v-3},${.16+random()*.48})`;
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y+2);ctx.lineTo(x+w*.65+Math.sin(y)*2,y+h);ctx.lineTo(x-1,y+h*.8);ctx.fill();
      }
      for(let i=0;i<95;i++){
        const x=random()*n,y=random()*n,w=3+random()*15;
        ctx.strokeStyle=`rgba(27,28,20,${.13+random()*.24})`;ctx.lineWidth=.7+random()*2;
        ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+w,y+3,x-w,y+7,x+w*.4,y+12);ctx.stroke();
      }
      for(let i=0;i<230;i++){
        const x=random()*n,y=random()*n,r=1+random()*5;
        ctx.fillStyle=`rgba(133,143,91,${random()*.19})`;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
      }
    });
  }
  function soilTexture(){
    const random=F.math.rng(29383);
    return canvasTexture(512,(ctx,n)=>{
      ctx.fillStyle='#9b9175';ctx.fillRect(0,0,n,n);
      const image=ctx.getImageData(0,0,n,n),data=image.data;
      for(let y=0;y<n;y++)for(let x=0;x<n;x++){
        const i=(y*n+x)*4,v=(random()-.5)*47+F.math.noise(x*.045,y*.045)*18;
        data[i]+=v;data[i+1]+=v;data[i+2]+=v*.7;
      }ctx.putImageData(image,0,0);
      for(let i=0;i<5700;i++){
        const x=random()*n,y=random()*n,r=.25+random()*1.8,v=50+random()*100;
        ctx.fillStyle=`rgba(${v+13},${v+8},${v-3},${.15+random()*.4})`;ctx.beginPath();ctx.ellipse(x,y,r,r*.65,random()*6,0,Math.PI*2);ctx.fill();
      }
      for(let i=0;i<75;i++){
        const x=random()*n,y=random()*n,len=4+random()*15;
        ctx.strokeStyle=`rgba(59,43,22,${.2+random()*.35})`;ctx.lineWidth=.5+random();
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+len,y+len*.23);ctx.stroke();
      }
    });
  }
  function stoneTexture(){
    const random=F.math.rng(6759);
    return canvasTexture(256,(ctx,n)=>{
      ctx.fillStyle='#c2c0ac';ctx.fillRect(0,0,n,n);
      for(let i=0;i<6500;i++){
        const x=random()*n,y=random()*n,v=50+random()*160;
        ctx.fillStyle=`rgba(${v},${v},${v*.91},${.1+random()*.3})`;ctx.fillRect(x,y,1+random()*2,1+random()*2);
      }
      for(let i=0;i<40;i++){
        ctx.strokeStyle='rgba(45,50,39,.12)';ctx.lineWidth=.5+random();let x=random()*n,y=random()*n;
        ctx.beginPath();ctx.moveTo(x,y);for(let j=0;j<4;j++){x+=(random()-.5)*24;y+=random()*15;ctx.lineTo(x,y);}ctx.stroke();
      }
    });
  }
  F.createTextures=function(){return{bark:barkTexture(),soil:soilTexture(),stone:stoneTexture()};};
})(window.Forest);
