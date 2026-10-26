import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile,mkdir} from 'node:fs/promises';
import os from 'node:os';
import {fixtures} from './performance-fixtures.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
const label=process.env.PERF_LABEL||'after',seconds=Number(process.env.PERF_SOAK_SECONDS??120),rows=[],errors=[],soak=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:950}});page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('mokune.settings',JSON.stringify({autoSave:false,rememberPosition:false}));window.webkit={messageHandlers:{mokune:{postMessage:()=>{}}}};window.__latency=[];document.addEventListener('beforeinput',()=>window.__inputTime=performance.now(),true);document.addEventListener('input',()=>{const t=window.__inputTime;requestAnimationFrame(()=>requestAnimationFrame(()=>window.__latency.push(performance.now()-t)));},true);});
 await page.goto('http://127.0.0.1:4173/dist/web/');await page.waitForFunction(()=>window.mokune);const cdp=await page.context().newCDPSession(page);
 const load=raw=>page.evaluate(async raw=>{const t=performance.now();window.mokune.receive({type:'load',raw,name:'性能验收.md',hasPath:false});const syncMs=performance.now()-t;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {syncMs,twoFramesMs:performance.now()-t};},raw);
 const sample=async()=>{await cdp.send('HeapProfiler.collectGarbage');const heap=await cdp.send('Runtime.getHeapUsage'),dom=await cdp.send('Memory.getDOMCounters');const cssRules=await page.evaluate(()=>[...document.styleSheets].reduce((n,s)=>{try{return n+s.cssRules.length;}catch{return n;}},0));return {usedHeapBytes:heap.usedSize,domNodes:dom.nodes,listeners:dom.jsEventListeners,documents:dom.documents,cssRules};};
 for(const [kind,raw]of Object.entries(fixtures)){
  const loading=await load(raw);await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>window.mokune.snapshot().raw),raw);
  await page.locator('.cm-content').click({position:{x:160,y:25}});await page.keyboard.press('Meta+ArrowUp');await page.keyboard.press('ArrowRight');await page.evaluate(()=>window.__latency=[]);
  for(let i=0;i<6;i++){const n=await page.evaluate(()=>window.__latency.length);await page.keyboard.insertText('测');await page.waitForFunction(n=>window.__latency.length>n,n);}
  const latency=await page.evaluate(()=>window.__latency);for(let i=0;i<6;i++)await page.evaluate(()=>window.mokune.receive({type:'action',action:'undo'}));assert.equal(await page.evaluate(()=>window.mokune.snapshot().raw),raw);
  const scroll=await page.evaluate(async()=>{const scroller=document.querySelector('.cm-scroller'),t=performance.now();for(const f of [.3,.6,1,0]){scroller.scrollTop=(scroller.scrollHeight-scroller.clientHeight)*f;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));}return performance.now()-t;});
  rows.push({kind,bytes:Buffer.byteLength(raw),lines:raw.split('\n').length,load:loading,inputToTwoFramesMs:{median:latency.toSorted((a,b)=>a-b)[3],max:Math.max(...latency)},scrollFourPositionsMs:scroll,heap:await sample()});console.log(JSON.stringify(rows.at(-1)));
 }
 const soakStart=performance.now(),until=soakStart+seconds*1000;let cycles=0;
 while(performance.now()<until){for(const kind of ['tables','diagrams','math']){await load(fixtures[kind]);await page.waitForTimeout(220);await page.evaluate(()=>{const s=document.querySelector('.cm-scroller');s.scrollTop=s.scrollHeight*.7;});}await load('# 空白检查\n\n保留正文');await page.waitForTimeout(300);cycles++;if(cycles%5===0){const entry={cycles,elapsedSeconds:(performance.now()-soakStart)/1000,...await sample()};soak.push(entry);console.log('soak '+JSON.stringify(entry));}}
 await load('# 释放后\n\n保留正文');await page.waitForTimeout(600);const released=await sample();assert.deepEqual(errors,[]);
 // Bounds detect retained detached editors/listeners after repeated full loads;
 // heap itself is reported as a trend rather than a machine-specific pass claim.
 if(soak.length>=3){assert.ok(released.domNodes<soak[0].domNodes+5000);assert.ok(released.listeners<soak[0].listeners+500);assert.equal(released.cssRules,soak[0].cssRules);}
 await mkdir('output',{recursive:true});await writeFile(`output/dense-performance-${label}.json`,JSON.stringify({label,browser:await browser.version(),cpu:os.cpus()[0].model,measurement:'Warm browser; six real insertText inputs and bridge undo per scenario. CDP heap/DOM snapshots after forced GC; no physical IME. Soak duration is measured with a monotonic clock; bounded stress is not an hours-long leak proof.',rows,soak,requestedSoakSeconds:seconds,actualSoakSeconds:(performance.now()-soakStart)/1000,cycles,released,errors},null,2));
 console.log('Dense performance checks passed: '+label);
}finally{await browser.close();}
