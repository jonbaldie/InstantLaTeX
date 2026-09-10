// Stateful action-sequence harness against real Chrome.
const puppeteer=require('/Users/jonathanbaldie/Code-2/github.com/jonbaldie/InstantLaTeX/node_modules/puppeteer-core');
const BASE='http://localhost:8642/index.html';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function probe(page){
  return page.evaluate(()=>{
    const e=document.getElementById('maths-editor');
    return {value:e.value,ss:e.selectionStart,se:e.selectionEnd,hash:location.hash,
      out:(document.querySelector('#math-output p')||{}).textContent||'',
      err:!!document.querySelector('#math-output .katex-error')};
  });
}

async function reset(page){
  await page.goto(BASE,{waitUntil:'networkidle2'});
  await page.evaluate(()=>{history.replaceState(null,'',location.pathname);});
  await page.goto(BASE,{waitUntil:'networkidle2'});
  await sleep(400);
  const p=await probe(page);
  if(p.hash!=='' ) throw new Error('reset probe failed: hash='+p.hash);
  return p;
}

async function clearEditor(page){
  await page.click('#maths-editor');
  await page.evaluate(()=>{const e=document.getElementById('maths-editor');e.focus();e.setSelectionRange(0,e.value.length);});
  await page.keyboard.press('Backspace');
  await sleep(400);
}

async function run(actions,{log}){
  const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',userDataDir:`/tmp/ilx-cgpt/${Date.now()}-${Math.random()}`,args:['--no-first-run','--disable-extensions']});
  const page=await browser.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const trace=[];
  try{
    await reset(page); await clearEditor(page);
    for(const a of actions){
      if(a.t==='type') await page.keyboard.type(a.s,{delay:20});
      else if(a.t==='key') await page.keyboard.press(a.k);
      else if(a.t==='undo') await page.keyboard.down('Meta'),await page.keyboard.press('KeyZ'),await page.keyboard.up('Meta');
      else if(a.t==='redo') {await page.keyboard.down('Meta');await page.keyboard.down('Shift');await page.keyboard.press('KeyZ');await page.keyboard.up('Shift');await page.keyboard.up('Meta');}
      else if(a.t==='nav') await page.evaluate(h=>{location.hash=h;},a.h);
      else if(a.t==='reload') await page.reload({waitUntil:'networkidle2'});
      await sleep(450);
      const p=await probe(page);
      trace.push({a,p});
      // Invariant: hash and editor stay in sync after debounce (non-empty editor)
      if(p.value!==''&&a.t!=='nav'){
        let dec=null; try{dec=decodeURIComponent(p.hash.slice(1));}catch(e){}
        if(dec!==p.value) trace[trace.length-1].violation=`hash-desync: hash=${p.hash} value=${JSON.stringify(p.value)}`;
      }
      if(errors.length) trace[trace.length-1].violation=(trace[trace.length-1].violation||'')+' pageerror:'+errors.join('|');
    }
  }catch(e){ trace.push({fatal:e.message}); }
  await browser.close();
  return trace;
}
module.exports={run};
if(require.main===module){
  const acts=JSON.parse(process.argv[2]);
  run(acts,{}).then(t=>console.log(JSON.stringify(t,null,1)));
}
