import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
try{
 const page=await browser.newPage({viewport:{width:1000,height:1000}});await page.addInitScript(()=>{window.webkit={messageHandlers:{mokune:{postMessage(){}}}};localStorage.setItem('mokune.settings',JSON.stringify({autoSave:false}));});
 await page.goto('http://127.0.0.1:4173/dist/web/');await page.waitForFunction(()=>window.mokune);
 const raw='\ufeff# 重复定位\r\n\r\n![前置图](assets/preview.svg){width=520px}\r\n\r\n\r\n\r\n第一段正文可以从任意位置插入，请准确定位。\r\n\r\n由[美国](https://example.com/usa)作家[伊莎贝尔·布里格斯·迈尔斯](https://example.com/'+('long-destination/'.repeat(12))+')和她的母亲共同制定的一种人格类型理论模型。\r\n\r\n第四段需要准确定位光标，重复点击后仍应落在文字内部。\r\n\r\n'+('这是一个用于验证自动换行和重复插入位置的长段落，'.repeat(12))+'段落结尾。\r\n\r\n| A | B |\r\n| --- | --- |\r\n| 中文单元格 | 内容 |\r\n\r\n![图片](assets/preview.svg){width=320px}\r\n';
 const snap=()=>page.evaluate(()=>window.mokune.snapshot());
 const point=async(text,offset=2)=>page.locator('.cm-content').evaluate((el,{text,offset})=>{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){const index=n.textContent.indexOf(text);if(index<0)continue;const r=document.createRange();r.setStart(n,index+offset);r.setEnd(n,index+offset+1);const b=r.getBoundingClientRect();return {x:b.x+b.width*.25,y:b.y+b.height/2};}throw new Error('Missing '+text);},{text,offset});
 const checks=[];
 for(const width of [880,1360,2056]){
  await page.setViewportSize({width,height:1100});if(width===2056)await page.evaluate(()=>{const field=document.querySelector('#line-width');field.value='full';field.dispatchEvent(new Event('change',{bubbles:true}));});await page.evaluate(raw=>window.mokune.receive({type:'load',raw,name:'重复定位.md',hasPath:true,imageBase:'/tests/fixtures/'}),raw);
  for(let repeat=0;repeat<5;repeat++)for(const [text,offset] of [['第一段正文',3],['伊莎贝尔·布里格斯·迈尔斯',4],['第四段需要准确定位光标',6],['和她的母亲共同制定',4],['第一段正文',7]]){
   await page.locator('.cm-line').filter({hasText:text}).first().scrollIntoViewIfNeeded();const p=await point(text,offset);await page.mouse.click(p.x,p.y);await page.waitForTimeout(30);const state=await snap(),expected=state.text.indexOf(text)+offset;assert.ok(Math.abs(state.selection.ranges[0].head-expected)<=1,`${width} round ${repeat}: ${text}, expected ${expected}, got ${state.selection.ranges[0].head}`);
  }
  for(let round=0;round<4;round++){
   const start=await point('第一段正文',2),end=await point('第一段正文',14);await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:12});await page.mouse.up();assert.ok((await snap()).selection.ranges[0].anchor!==(await snap()).selection.ranges[0].head);
   const at=await point('第一段正文',8);await page.mouse.click(at.x,at.y);const state=await snap();assert.ok(Math.abs(state.selection.ranges[0].head-(state.text.indexOf('第一段正文')+8))<=1);assert.equal(state.selection.ranges[0].anchor,state.selection.ranges[0].head);await page.keyboard.insertText('验');await page.evaluate(()=>window.mokune.receive({type:'action',action:'undo'}));assert.equal((await snap()).raw,raw);
  }
  await page.locator('.cm-line').filter({hasText:'这是一个用于验证自动换行'}).first().scrollIntoViewIfNeeded();for(const offset of [0,35,70,115,160,220]){const at=await point('这是一个用于验证自动换行',offset);await page.mouse.click(at.x,at.y);const state=await snap();assert.ok(Math.abs(state.selection.ranges[0].head-(state.text.indexOf('这是一个用于验证自动换行')+offset))<=1);}
  checks.push(width+'px: 25 repeated paragraph/link clicks');
 }
 await page.locator('.md-editable-link').filter({hasText:'伊莎贝尔'}).click();await page.waitForFunction(()=>document.querySelector('.cm-content').textContent.includes('long-destination/'));await page.evaluate(()=>{window.__duringMouseup=null;document.addEventListener('mouseup',()=>{window.__duringMouseup=document.querySelector('.cm-content').textContent.includes('long-destination/');},{capture:true,once:true});});const other=await point('第四段需要准确定位光标',6);await page.mouse.click(other.x,other.y);assert.equal(await page.evaluate(()=>window.__duringMouseup),true,'link layout must stay frozen through mouseup, including CodeMirror final caret placement');await page.waitForTimeout(60);assert.equal(await page.locator('.cm-content').evaluate(el=>el.textContent.includes('long-destination/')),false);checks.push('layout stays frozen until mouseup selection is settled');
 await writeFile('output/repeated-pointer-checks.json',JSON.stringify({checks},null,2));console.log('Repeated pointer checks passed: '+checks.length);
}finally{await browser.close();}
