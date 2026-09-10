// CGPT harness: real main.js in jsdom, real index.html DOM.
const fs=require('fs'); const {JSDOM}=require('jsdom');
const HTML=fs.readFileSync('/Users/jonathanbaldie/Code-2/github.com/jonbaldie/InstantLaTeX/public_html/index.html','utf8')
  .replace(/<script[^>]*src="\/\/[^"]*"[^>]*><\/script>/g,'')
  .replace(/<script[^>]*cdn\.jsdelivr[^>]*><\/script>/g,'');
const MAIN=fs.readFileSync('/Users/jonathanbaldie/Code-2/github.com/jonbaldie/InstantLaTeX/public_html/main.js','utf8');

function boot(hash){
  const dom=new JSDOM(HTML,{url:'http://localhost/index.html'+(hash===undefined?'':'#'+hash),runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  w.eval('window.renderMathInElement=function(){};window.adsbygoogle=[];');
  w.eval(MAIN);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return {dom,w,ed:w.document.getElementById('maths-editor')};
}
function flush(w){ /* run timers */ }
module.exports={boot};
