const puppeteer=require('../node_modules/puppeteer-core');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const val=p=>p.$eval('#maths-editor',e=>e.value);
(async()=>{
 const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',userDataDir:'/tmp/ilx-cgpt/v'+Date.now()});
 const p=await b.newPage();
 await p.goto('http://localhost:8642/index.html',{waitUntil:'networkidle2'});
 await sleep(400);
 await p.evaluate(()=>{const e=document.getElementById('maths-editor');e.focus();e.setSelectionRange(e.value.length,e.value.length);});
 await p.keyboard.type('+{',{delay:40}); await sleep(400);
 console.log('typed +{ ->',JSON.stringify(await val(p)));
 for(let i=0;i<3;i++){await p.evaluate(()=>{document.getElementById('maths-editor').focus();document.execCommand('undo');});await sleep(300);
  console.log('undo'+(i+1),JSON.stringify(await val(p)));}
 await b.close();
})();
