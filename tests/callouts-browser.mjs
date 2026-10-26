import {createTestPage} from './browser-page.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile,mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
const checks=[],errors=[],types=['NOTE','TIP','IMPORTANT','WARNING','CAUTION'];
const text='# 提示块\n\n'+types.map(type=>`> [!${type}]\n> **中文提示**与 \`code\`，可以直接编辑。\n> 第二行内容。`).join('\n\n')+'\n\n> [!CUSTOM]\n> 未知类型保留。\n\n普通段落。\n';
try{
 const page=await createTestPage(browser,{viewport:{width:1300,height:1300}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.__messages=[];window.webkit={messageHandlers:{mokune:{postMessage:m=>window.__messages.push(m)}}};localStorage.setItem('mokune.settings',JSON.stringify({autoSave:false}));});
 await page.goto('http://127.0.0.1:4173/dist/web/');await page.waitForFunction(()=>window.mokune);
 const load=raw=>page.evaluate(raw=>window.mokune.receive({type:'load',raw,name:'提示块.md',hasPath:true}),raw),snap=()=>page.evaluate(()=>window.mokune.snapshot()),action=action=>page.evaluate(action=>window.mokune.receive({type:'action',action}),action);
 await load(text);await page.waitForTimeout(150);
 for(const type of types)assert.equal(await page.locator('.cm-line.callout-'+type.toLowerCase()).count(),3);
 assert.equal(await page.locator('.md-callout-label').count(),5);assert.equal(await page.locator('.md-callout .md-strong .md-inline-code').count(),0);
 assert.equal(await page.locator('.md-callout .md-strong').count(),5);assert.equal(await page.locator('.md-callout .md-inline-code').count(),5);assert.equal((await snap()).raw,text);
 checks.push('five types style all body lines, nested emphasis/code remains editable; unknown marker preserved');
 const colors=await page.locator('.md-callout-label').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).color));assert.equal(new Set(colors).size,5);assert.equal(await page.locator('.md-callout-label [data-editable-link]').count(),0);assert.ok((await page.locator('.cm-line').allTextContents()).some(s=>s.includes('[!CUSTOM]')));const borders=await page.locator('.cm-line.callout-title').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).borderLeftColor));assert.deepEqual(borders,colors);
 checks.push('five semantic title colors remain distinct');
 const point=async(offset)=>page.evaluate(offset=>{const walker=document.createTreeWalker(document.querySelector('.cm-content'),NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){const i=n.textContent.indexOf('第二行内容');if(i<0)continue;const r=document.createRange();r.setStart(n,i+offset);r.setEnd(n,i+offset+1);const b=r.getBoundingClientRect();return {x:b.x+b.width*.2,y:b.y+b.height/2};}throw Error('No body text');},offset);
 for(const index of [1,3,2]){const p=await point(index);await page.mouse.click(p.x,p.y);const s=await snap();assert.ok(Math.abs(s.selection.ranges[0].head-(text.indexOf('第二行内容')+index))<=1);}
 const p=await point(0),q=await point(4);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(q.x,q.y,{steps:10});await page.mouse.up();let s=await snap();assert.ok(Math.abs(s.selection.ranges[0].head-s.selection.ranges[0].anchor)>=3);await page.keyboard.insertText('修改');assert.ok((await snap()).raw.includes('修改'));await action('undo');assert.equal((await snap()).raw,text);checks.push('repeated body clicks, drag selection, Chinese text insertion and exact undo');
 const raw='\ufeff'+text.replaceAll('\n','\r\n')+'尾部  \r';await load(raw);await action('source');await action('source');assert.equal((await snap()).raw,raw);
 await page.evaluate(()=>document.querySelector('.cm-content').dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'ni'})));const mode=(await snap()).sourceMode;await action('source');assert.equal((await snap()).sourceMode,mode);assert.equal((await snap()).raw,raw);await page.evaluate(()=>document.querySelector('.cm-content').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'你'})));await page.waitForTimeout(100);assert.equal((await snap()).raw,raw);checks.push('BOM/mixed EOL/source round trip and composition reconfiguration guard');
 await load(text);await mkdir('output/html',{recursive:true});
 for(const theme of ['paper','polar']){
  await page.locator('#appearance-toggle').click();await page.locator(`[data-theme="${theme}"]`).click();await page.locator('#appearance-close').click();
  const live=await page.locator('.md-callout-label').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).color));
  await page.evaluate(()=>window.__messages=[]);await action('exportHTML');await page.waitForFunction(()=>window.__messages.some(m=>m.command==='writeExport'));
  const html=await page.evaluate(()=>window.__messages.find(m=>m.command==='writeExport').html),out=await createTestPage(browser);await out.setContent(html);
  assert.equal(await out.locator('blockquote.md-callout').count(),5);assert.deepEqual(await out.locator('.callout-title').allTextContents(),types);assert.deepEqual(await out.locator('.callout-title').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).color)),live);assert.equal(await out.locator('blockquote:not(.md-callout)').count(),1);assert.equal(await out.locator('script').count(),0);assert.equal((await snap()).raw,text);
  await writeFile(`output/html/mokune-callouts-${theme}.html`,html);await out.screenshot({path:`output/callouts-export-${theme}.png`,fullPage:true});await out.close();await page.evaluate(()=>window.mokune.receive({type:'exportFinished',cancelled:true}));checks.push(theme+': export body, title, colors and safety match live preview without source edits');
 }
 await page.waitForTimeout(150);await page.screenshot({path:'output/callouts-live.png'});await load('# 引用边界\n\n[空目标]() 和 [未定义] 与 [引用][id]\n\n[id]: https://example.com\n');await page.waitForTimeout(120);assert.equal(await page.locator('[data-editable-link][data-link-reference=\"\"]').count(),1);assert.equal(await page.locator('[data-link-reference=\"https://example.com\"]').count(),1);assert.ok((await page.locator('.cm-line').allTextContents()).some(s=>s.includes('[未定义]')));checks.push('undefined shortcut stays literal; real reference and empty inline destination still render');assert.deepEqual(errors,[]);await writeFile('output/callouts-browser.json',JSON.stringify({checks,errors},null,2));console.log('Callout browser checks passed: '+checks.length);
}finally{await browser.close();}
