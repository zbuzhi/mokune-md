const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))),wait=ms=>new Promise(r=>setTimeout(r,ms));
const rows=[];
if(phase==='cold'){
 await frame();if(!window.mokune?.snapshot().text)throw Error('Initial document missing');
 if(window.mokuneMath||window.mokuneMermaid)throw Error('Plain startup eagerly loaded scientific engines');
 return {initialFramesMs:performance.now(),plainScientificEnginesLoaded:false};
}
for(const kind of ['plain','math','diagrams','tables']){
 const raw=fixtures[kind];
 const t=performance.now();window.mokune.receive({type:'load',raw,name:'性能验收.md',hasPath:false});const syncMs=performance.now()-t;await frame();const framesMs=performance.now()-t;await wait(300);
 if(window.mokune.snapshot().raw!==raw)throw Error('Native source changed: '+kind);
 const content=document.querySelector('.cm-content');content.focus();const sel=getSelection(),range=document.createRange(),first=content.querySelector('.cm-line');range.selectNodeContents(first);range.collapse(false);sel.removeAllRanges();sel.addRange(range);await frame();
 const latency=[];for(let i=0;i<6;i++){const previousLength=window.mokune.snapshot().text.length,start=performance.now();document.execCommand('insertText',false,'测');await frame();latency.push(performance.now()-start);if(window.mokune.snapshot().text.length!==previousLength+1)throw Error('Native insertion failed: '+kind);}
 for(let i=0;i<6;i++)window.mokune.receive({type:'action',action:'undo'});
 if(window.mokune.snapshot().raw!==raw)throw Error('Native exact undo failed: '+kind);
 rows.push({kind,bytes:new TextEncoder().encode(raw).length,load:{syncMs,twoFramesMs:framesMs},inputToTwoFramesMs:{median:latency.sort((a,b)=>a-b)[3],max:Math.max(...latency)}});
}
window.mokune.receive({type:'load',raw:'# 空白检查\n\n保留正文',name:'释放.md',hasPath:false});await wait(800);
return {rows,sourceAndUndo:true,engine:navigator.userAgent,physicalIME:false};
