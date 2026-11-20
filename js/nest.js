/* Woven nest built from bent continuous twigs, not stacked cylinders. */
'use strict';
(function(F){
  function createNest(){
    const skin=new F.anatomy.Skin(),random=F.math.rng(558),colors=[[.20,.125,.056],[.29,.20,.095],[.34,.25,.12]];
    for(let i=0;i<58;i++){
      const angle=i/58*Math.PI*2+random()*.25,r=.19+random()*.095,y=-.025+random()*.075;
      const a=[Math.cos(angle)*r,y,Math.sin(angle)*r];
      const b=[Math.cos(angle+.7)*r,y+.008+random()*.025,Math.sin(angle+.7)*r];
      const points=F.anatomy.smooth([a,[(a[0]+b[0])*.5,y+.016,(a[2]+b[2])*.5],b],3);
      F.anatomy.loft(skin,points,points.map((_,j)=>.0045+Math.sin(j/(points.length-1)*Math.PI)*.003),colors[i%3],{sides:5});
    }
    for(let i=0;i<22;i++){
      const angle=random()*Math.PI*2,r=.10+random()*.13;
      const a=[Math.cos(angle)*r,-.045,Math.sin(angle)*r],b=[-Math.cos(angle)*r,-.026,-Math.sin(angle)*r];
      F.anatomy.organic(skin,[a,[0,-.035,0],b],[.004,.006,.002],colors[i%3],{sides:5,steps:3});
    }
    for(let i=0;i<22;i++){
      const a=random()*Math.PI*2,r=.08+random()*.10;
      const root=[Math.cos(a)*r,-.025,Math.sin(a)*r];
      F.anatomy.furLock(skin,root,[Math.cos(a)*.2,.1,Math.sin(a)*.2],.023,.025,[.13,.19,.065]);
    }
    // Three thin supports reach back into the actual branch fork.
    F.anatomy.organic(skin,[[-.29,-.085,-.06],[-.08,-.045,.0],[.08,-.035,.01]],[.012,.008,.005],colors[0],{sides:7});
    F.anatomy.organic(skin,[[.28,-.08,.11],[.06,-.045,.0],[-.04,-.025,-.02]],[.011,.007,.004],colors[0],{sides:7});
    return skin.finish();
  }
  F.createWildlifeNest=createNest;
})(window.Forest);
