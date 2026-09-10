const puppeteer=require('../node_modules/puppeteer-core');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',userDataDir:'/tmp/ilx-cgpt/ctl'+Date.now()});
 const p=await b.newPage();
 await p.setContent('<textarea id="t"></textarea>');
 await p.click('#t'); await p.keyboard.type('abc',{delay:20});
 const before=await p.$eval('#t',e=>e.value);
 for(const combo of [['Meta','KeyZ'],['Control','KeyZ']]){
   await p.keyboard.down(combo[0]);await p.keyboard.press(combo[1]);await p.keyboard.up(combo[0]);
   await sleep(100);
   console.log(combo.join('+'),JSON.stringify(await p.$eval('#t',e=>e.value)));
 }
 // execCommand undo control
 await p.evaluate(()=>{document.getElementById('t').focus();document.execCommand('undo');});
 console.log('execCommand undo',JSON.stringify(await p.$eval('#t',e=>e.value)),'before=',before);
 await b.close();
})();
