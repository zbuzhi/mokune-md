import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile,mkdir} from 'node:fs/promises';
import os from 'node:os';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
try {
 const page=await browser.newPage({viewport:{width:1280,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('mokune.settings',JSON.stringify({autoSave:false,rememberPosition:false}));window.webkit={messageHandlers:{mokune:{postMessage:()=>{}}}};window.__syncSamples=[];window.__inputSamples=[];document.addEventListener('beforeinput',()=>{window.__inputBegin=performance.now();},true);document.addEventListener('input',()=>{const begin=window.__inputBegin;window.__syncSamples.push(performance.now()-begin);requestAnimationFrame(()=>requestAnimationFrame(()=>window.__inputSamples.push(performance.now()-begin)));},true);});
 await page.goto('http://127.0.0.1:4173/dist/web/');await page.waitForFunction(()=>window.mokune);
 const rows=[];
 for(const targetBytes of [100000,300000,1000000]){
  const section='## 实现与思考\n\n让思绪留在正文，保持中文输入、原样保存与编辑状态。 Rust makes reliable tools.\n\n- 可读的文稿\n- 可追溯的变化\n\n```rust\nfn main() { println!("hello"); }\n```\n\n';
  const repeats=Math.ceil(targetBytes/Buffer.byteLength(section)),raw='# 大文稿测量\n\n'+section.repeat(repeats),bytes=Buffer.byteLength(raw);
  const load=await page.evaluate(async raw=>{const start=performance.now();window.mokune.receive({type:'load',raw,name:'性能样本.md',hasPath:false});const synchronous=performance.now()-start;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {synchronousMs:synchronous,firstTwoFramesMs:performance.now()-start};},raw);
  await page.waitForTimeout(500);await page.locator('.cm-content').click();await page.keyboard.press('Meta+ArrowUp');await page.keyboard.press('ArrowRight');await page.evaluate(()=>{window.__inputSamples=[];window.__syncSamples=[];});
  for(let i=0;i<12;i++){const count=await page.evaluate(()=>window.__inputSamples.length);await page.keyboard.insertText('测');await page.waitForFunction(count=>window.__inputSamples.length>count,count);}
  const sync=await page.evaluate(()=>window.__syncSamples),input=await page.evaluate(()=>window.__inputSamples),sorted=[...input].sort((a,b)=>a-b);
  await page.waitForTimeout(500);
  const toggle=await page.evaluate(()=>{const start=performance.now();window.mokune.receive({type:'action',action:'source'});const sourceMs=performance.now()-start;const next=performance.now();window.mokune.receive({type:'action',action:'source'});return {sourceMs,liveMs:performance.now()-next};});
  const edited=await page.evaluate(()=>window.mokune.snapshot().raw);assert.equal(edited.replace('测'.repeat(12),''),raw);for(let i=0;i<12;i++)await page.keyboard.press('Meta+z');assert.equal(await page.evaluate(()=>window.mokune.snapshot().raw),raw);
  rows.push({synchronousInputEventMs:{median:[...sync].sort((a,b)=>a-b)[Math.floor(sync.length/2)],maximum:Math.max(...sync)},bytes,lines:raw.split('\n').length,headings:repeats+1,load,inputToTwoFramesMs:{median:sorted[Math.floor(sorted.length/2)],p95:sorted[Math.ceil(sorted.length*.95)-1],samples:input.length},modeToggleMs:toggle});
  console.log(JSON.stringify(rows.at(-1)));
 }
 assert.deepEqual(errors,[]);await mkdir('docs',{recursive:true});await writeFile(`docs/PERFORMANCE-${process.env.PERF_LABEL||'RESULTS'}.json`,JSON.stringify({runtime:await browser.version(),platform:os.platform(),architecture:os.arch(),cpu:os.cpus()[0]?.model,measurement:'warm browser, synchronous document load + two animation frames; beforeinput through two animation frames, 12 inputs; no CPU throttling; generated headings/lists/Rust blocks; not native cold launch or physical IME',rows,errors},null,2));
}finally{await browser.close();}
