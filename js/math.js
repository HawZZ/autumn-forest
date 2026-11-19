/* 层林尽染 · small, dependency-free math toolkit */
'use strict';
window.Forest = window.Forest || {};
(function (F) {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    length: a => Math.hypot(a[0], a[1], a[2]),
    normalize: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  };
  function mat4() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); }
  function multiply(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      out[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
    }
    return out;
  }
  function perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
    return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
  }
  function lookAt(eye, target, up) {
    const z = V.normalize(V.sub(eye, target)), x = V.normalize(V.cross(up, z)), y = V.cross(z, x);
    return new Float32Array([x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -V.dot(x,eye),-V.dot(y,eye),-V.dot(z,eye),1]);
  }
  function ortho(left, right, bottom, top, near, far) {
    return new Float32Array([2/(right-left),0,0,0, 0,2/(top-bottom),0,0, 0,0,-2/(far-near),0, -(right+left)/(right-left),-(top+bottom)/(top-bottom),-(far+near)/(far-near),1]);
  }
  function inverse(m) {
    const out = new Float32Array(16), a = m;
    const b00=a[0]*a[5]-a[1]*a[4], b01=a[0]*a[6]-a[2]*a[4], b02=a[0]*a[7]-a[3]*a[4];
    const b03=a[1]*a[6]-a[2]*a[5], b04=a[1]*a[7]-a[3]*a[5], b05=a[2]*a[7]-a[3]*a[6];
    const b06=a[8]*a[13]-a[9]*a[12], b07=a[8]*a[14]-a[10]*a[12], b08=a[8]*a[15]-a[11]*a[12];
    const b09=a[9]*a[14]-a[10]*a[13], b10=a[9]*a[15]-a[11]*a[13], b11=a[10]*a[15]-a[11]*a[14];
    let det=b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
    if (!det) return mat4(); det=1/det;
    out[0]=(a[5]*b11-a[6]*b10+a[7]*b09)*det; out[1]=(a[2]*b10-a[1]*b11-a[3]*b09)*det;
    out[2]=(a[13]*b05-a[14]*b04+a[15]*b03)*det; out[3]=(a[10]*b04-a[9]*b05-a[11]*b03)*det;
    out[4]=(a[6]*b08-a[4]*b11-a[7]*b07)*det; out[5]=(a[0]*b11-a[2]*b08+a[3]*b07)*det;
    out[6]=(a[14]*b02-a[12]*b05-a[15]*b01)*det; out[7]=(a[8]*b05-a[10]*b02+a[11]*b01)*det;
    out[8]=(a[4]*b10-a[5]*b08+a[7]*b06)*det; out[9]=(a[1]*b08-a[0]*b10-a[3]*b06)*det;
    out[10]=(a[12]*b04-a[13]*b02+a[15]*b00)*det; out[11]=(a[9]*b02-a[8]*b04-a[11]*b00)*det;
    out[12]=(a[5]*b07-a[4]*b09-a[6]*b06)*det; out[13]=(a[0]*b09-a[1]*b07+a[2]*b06)*det;
    out[14]=(a[13]*b01-a[12]*b03-a[14]*b00)*det; out[15]=(a[8]*b03-a[9]*b01+a[10]*b00)*det;
    return out;
  }
  function projectPoint(m, p) {
    return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14],m[3]*p[0]+m[7]*p[1]+m[11]*p[2]+m[15]];
  }
  function rng(seed) {
    let s = seed >>> 0;
    return function () { s += 0x6D2B79F5; let t=s; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; };
  }
  function hash(x, y) { let n=Math.imul(x,374761393)+Math.imul(y,668265263); n=Math.imul(n^(n>>>13),1274126177); return ((n^(n>>>16))>>>0)/4294967295; }
  function noise(x, y) {
    const ix=Math.floor(x), iy=Math.floor(y); let fx=x-ix, fy=y-iy;
    fx=fx*fx*(3-2*fx); fy=fy*fy*(3-2*fy);
    return lerp(lerp(hash(ix,iy),hash(ix+1,iy),fx),lerp(hash(ix,iy+1),hash(ix+1,iy+1),fx),fy)*2-1;
  }
  function fbm(x,y,octaves=4) {
    let v=0, a=.5;
    for(let i=0;i<octaves;i++){v+=noise(x,y)*a; x=x*2.03+17.7;y=y*2.03+9.2;a*=.5;}
    return v;
  }
  F.math={TAU,clamp,lerp,smooth,V,mat4,multiply,perspective,lookAt,ortho,inverse,projectPoint,rng,hash,noise,fbm};
})(window.Forest);
