const {run}=require('./stateful.js');
let seed=987; const rng=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
const strs=['x','\\frac{1}{2}','a b','%','\\\\','é','1+1','\\sqrt2','#','&x'];
function act(){const r=rng();
 if(r<0.45) return {t:'type',s:strs[Math.floor(rng()*strs.length)]};
 if(r<0.6) return {t:'key',k:'Backspace'};
 if(r<0.75) return {t:'nav',h:encodeURIComponent(strs[Math.floor(rng()*strs.length)])};
 if(r<0.85) return {t:'reload'};
 return {t:'key',k:'ArrowLeft'};}
(async()=>{
 for(let i=0;i<10;i++){
  const acts=Array.from({length:3+Math.floor(rng()*3)},act);
  const t=await run(acts,{});
  const v=t.filter(x=>x.violation||x.fatal);
  console.log('SEQ',i,JSON.stringify(acts));
  if(v.length) console.log('  VIOL',JSON.stringify(v.map(x=>({a:x.a,violation:x.violation,fatal:x.fatal,val:x.p&&x.p.value,hash:x.p&&x.p.hash}))));
 }
})();
