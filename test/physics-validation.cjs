const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert');
const ctx={window:{Forest:{}},console};vm.createContext(ctx);
for(const name of ['math.js','vegetation.js','world.js','physics.js'])vm.runInContext(fs.readFileSync('/Users/user/Documents/personal/autumn-forest/js/'+name,'utf8'),ctx);
const F=ctx.window.Forest,w=F.createWorld();
const upstream=w.creekLevel(10),downstream=w.creekLevel(45);
assert(downstream<upstream,'Water must descend with terrain');
for(let z=-90;z<90;z+=3){assert(w.creekLevel(z+3)<w.creekLevel(z),'Non-monotonic downstream elevation');}
for(const z of [-50,0,25,60]){
 const x=w.creekX(z),depth=w.waterDepth(x,z),flow=w.flowAt(x,z);
 assert(depth>0,'No water in thalweg');assert(flow[1]>0,'Water must flow downstream');assert(depth<.8,'Unexpected excessive creek depth');
}
const tree=w.trees[0][0],p=new F.Player(w);p.teleport({x:tree.position[0],z:tree.position[2]+2.5,yaw:0,pitch:0});p.input.forward=1;
let closest=Infinity;
for(let i=0;i<480;i++){p.update(1/120,i/120);closest=Math.min(closest,Math.hypot(p.position[0]-tree.position[0],p.position[2]-tree.position[2]));}
assert(closest>.70&&closest<.92,'Tree collision mismatch '+closest);
console.log(JSON.stringify({passed:true,upstream,downstream,treeContact:closest,treeVariants:[...new Set(w.trees.flat().map(t=>t.variant))],waterObstacles:w.waterObstacles.length},null,2));
