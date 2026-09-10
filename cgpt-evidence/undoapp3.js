const puppeteer=require('../node_modules/puppeteer-core');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const val=p=>p.$eval('#maths-editor',e=>e.value);
(async()=>{
 const seq=process.argv[2];
 for(let run=1;run<=3;run++){
  const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',userDataDir:'/tmp/ilx-cgpt/w'+Date.now()+run});
  const p=await b.newPage();
  await p.goto('http://localhost:8642/index.html',{waitUntil:'networkidle2'});await sleep(400);
  await p.evaluate(()=>{const e=document.getElementById('maths-editor');e.focus();e.setSelectionRange(e.value.length,e.value.length);});
  await p.keyboard.type(seq,{delay:40}); await sleep(400);
  const after=await val(p);
  await p.evaluate(()=>{document.getElementById('maths-editor').focus();document.execCommand('undo');});await sleep(300);
  const undone=await val(p);
  console.log(`run${run} seq=${JSON.stringify(seq)} typed=${JSON.stringify(after)} afterUndo=${JSON.stringify(undone)} changed=${after!==undone}`);
  await b.close();
 }
})();
