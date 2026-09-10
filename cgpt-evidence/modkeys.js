const puppeteer=require('../node_modules/puppeteer-core');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const val=p=>p.$eval('#maths-editor',e=>e.value);
(async()=>{
 const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',userDataDir:'/tmp/ilx-cgpt/m'+Date.now()});
 const p=await b.newPage();
 await p.goto('http://localhost:8642/index.html',{waitUntil:'networkidle2'});await sleep(400);
 for(const mod of ['Control','Alt','Meta']){
  await p.evaluate(()=>{const e=document.getElementById('maths-editor');e.focus();e.value='X';e.setSelectionRange(1,1);});
  await p.keyboard.down(mod); await p.keyboard.press('BracketLeft'); await p.keyboard.up(mod); await sleep(200);
  console.log(mod+'+[ ->',JSON.stringify(await val(p)));
 }
 // select-all then type opener (wrap behaviour) and check selection direction
 await p.evaluate(()=>{const e=document.getElementById('maths-editor');e.focus();e.value='abc';e.setSelectionRange(0,3,'backward');});
 await p.keyboard.press('BracketLeft'); await sleep(200);
 console.log('wrap ->',JSON.stringify(await p.$eval('#maths-editor',e=>[e.value,e.selectionStart,e.selectionEnd])));
 await b.close();
})();
