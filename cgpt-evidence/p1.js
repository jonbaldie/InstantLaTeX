const {boot}=require('./cgpt.js');
// P1 metamorphic: value -> app writes hash -> fresh load with that hash -> same value
function roundTrip(v){
  const a=boot();
  a.ed.value=v;
  a.ed.dispatchEvent(new a.w.Event('input'));
  return new Promise(res=>{
    setTimeout(()=>{
      const hash=a.w.location.hash;
      let val2, err=null;
      try{ const b=boot(hash.replace(/^#/,'')); val2=b.ed.value; b.dom.window.close(); }catch(e){err=e;}
      a.dom.window.close();
      res({hash,val2,err});
    },400);
  });
}
function gen(rng){
  const alpha=['\\frac{','}','{','}','^','_','%','\\\\','\n',' ','#','&','$','~','+','a','1','é','😀','\u0000','"','\'','<','>','/','?','=',';','\t','\\sqrt','\\','π','\u00a0','\r'];
  let n=1+Math.floor(rng()*12), s='';
  for(let i=0;i<n;i++) s+=alpha[Math.floor(rng()*alpha.length)];
  return s;
}
let seed=12345; const rng=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
(async()=>{
  const fails=[];
  const corpus=[];
  for(let i=0;i<400;i++){
    let v = (corpus.length&&rng()<0.5)? mutate(corpus[Math.floor(rng()*corpus.length)],rng) : gen(rng);
    if(v===''||v.includes('\r')) continue; // precondition: empty is intended-default behaviour (issue #3)
    const r=await roundTrip(v);
    if(r.err||r.val2!==v){ fails.push({v:JSON.stringify(v),hash:r.hash,got:JSON.stringify(r.val2),err:r.err&&r.err.message}); corpus.push(v); }
    if(fails.length>6) break;
  }
  console.log(JSON.stringify(fails,null,1));
})();
function mutate(s,rng){
  const ops=[()=>s+s,()=>s.slice(1),()=>s.slice(0,-1),()=>s+String.fromCharCode(Math.floor(rng()*0x2000)),()=>s.split('').reverse().join('')];
  return ops[Math.floor(rng()*ops.length)]();
}
