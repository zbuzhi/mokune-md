import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
const label=process.env.PERF_LABEL||'after';
try{
 const page=await browser.newPage();await page.addInitScript(()=>{window.webkit={messageHandlers:{mokune:{postMessage:()=>{}}}};localStorage.setItem('mokune.settings',JSON.stringify({autoSave:false}));});await page.goto('http://127.0.0.1:4173/dist/web/');await page.waitForFunction(()=>window.mokune);
 const raw='# 样式复用\n\n```java\npublic class Main { String text = "hi"; }\n```';const load=()=>page.evaluate(raw=>window.mokune.receive({type:'load',raw,name:'样式.md',hasPath:false}),raw);
 const rules=()=>page.evaluate(()=>[...document.styleSheets].reduce((n,s)=>{try{return n+s.cssRules.length;}catch{return n;}},0));
 await load();await page.locator('.md-code .tok-keyword').first().waitFor();const initial=await rules();for(let i=0;i<100;i++)await load();const afterLoads=await rules();
 for(const id of ['polar','paper','catppuccin-latte','polar','paper']){await page.locator('#appearance-toggle').click();await page.locator(`[data-theme="${id}"]`).click();await page.locator('#appearance-close').click();if(label==='after'){const color=await page.evaluate(()=>{const probe=document.createElement('span');probe.style.color='var(--keyword)';document.body.append(probe);const expected=getComputedStyle(probe).color;probe.remove();return {expected,actual:getComputedStyle(document.querySelector('.md-code .tok-keyword')).color,string:getComputedStyle(document.querySelector('.md-code .tok-string')).color};});assert.equal(color.actual,color.expected);assert.notEqual(color.actual,color.string);}}
 const final=await rules();if(label==='after'){assert.equal(afterLoads,initial);assert.equal(final,initial);}
 assert.equal(await page.evaluate(()=>window.mokune.snapshot().raw),raw);await writeFile(`output/highlight-lifecycle-${label}.json`,JSON.stringify({loads:100,themeSwitches:5,initialRules:initial,afterLoadsRules:afterLoads,finalRules:final},null,2));console.log(JSON.stringify({label,initial,afterLoads,final}));
}finally{await browser.close();}
