import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:860}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/dist/web/');await page.waitForFunction(()=>window.mokune);
 const raw='\ufeff# 快捷键\r\n\r\n中文输入保持原样。\n\n| A | B |\r\n| --- | --- |\r\n| 1 | 2 |\r\n';
 await page.evaluate(raw=>window.mokune.receive({type:'load',raw,name:'快捷键.md',tabID:'hints-a'}),raw);
 await page.locator('.cm-content').click();
 const snapshot=()=>page.evaluate(()=>{const s=window.mokune.snapshot();return {raw:s.raw,selection:s.selection,revision:s.revision};});
 const before=await snapshot(),focus=await page.evaluate(()=>document.activeElement.className);
 const key=(type,key='Meta',meta=true,extra={})=>page.evaluate(({type,key,meta,extra})=>document.dispatchEvent(new KeyboardEvent(type,{key,metaKey:meta,bubbles:true,...extra})),{type,key,meta,extra});
 await page.clock.install();
 await key('keydown');await page.clock.fastForward(490);assert.equal(await page.locator('.shortcut-hints.is-visible').count(),0);
 await page.clock.fastForward(20);assert.equal(await page.locator('.shortcut-hints.is-visible').count(),1);
 assert.equal(await page.evaluate(()=>document.activeElement.className),focus);assert.deepEqual(await snapshot(),before);
 assert.equal(await page.locator('.shortcut-hint').count(),16);assert.ok((await page.locator('.shortcut-hints').textContent()).includes('⌘/'));
 await key('keyup','Meta',false);assert.equal(await page.locator('.shortcut-hints').getAttribute('aria-hidden'),'true');
 await key('keydown');await page.clock.fastForward(200);await key('keyup','Meta',false);await page.clock.fastForward(1600);assert.equal(await page.locator('.shortcut-hints.is-visible').count(),0);
 await key('keydown');await key('keydown','s');await page.clock.fastForward(1600);assert.equal(await page.locator('.shortcut-hints.is-visible').count(),0);await key('keyup','Meta',false);
 await key('keydown');await page.clock.fastForward(510);await key('keydown','Shift',true,{shiftKey:true});assert.equal(await page.locator('.shortcut-hints.is-visible').count(),0);await page.clock.fastForward(1600);assert.equal(await page.locator('.shortcut-hints.is-visible').count(),0);await key('keyup','Meta',false);
 await key('keydown');await page.clock.fastForward(510);await page.locator('.cm-content').dispatchEvent('compositionstart');assert.equal(await page.locator('.shortcut-hints.is-visible').count(),0);await key('keyup','Meta',false);await key('keydown');await page.clock.fastForward(510);assert.equal(await page.locator('.shortcut-hints.is-visible').count(),0);await page.locator('.cm-content').dispatchEvent('compositionend');await key('keyup','Meta',false);await page.clock.fastForward(100);
 assert.deepEqual(await snapshot(),before);
 await key('keydown');await page.clock.fastForward(510);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await page.locator('.shortcut-hints.is-visible').count(),0);await page.clock.fastForward(1600);assert.equal(await page.locator('.shortcut-hints.is-visible').count(),0);
 await page.evaluate(()=>window.mokune.receive({type:'shortcutHints',visible:true}));assert.equal(await page.locator('.shortcut-hints.is-visible').count(),1);await page.evaluate(()=>window.mokune.receive({type:'shortcutHints',visible:false}));assert.equal(await page.locator('.shortcut-hints.is-visible').count(),0);
 await page.evaluate(()=>window.mokune.receive({type:'action',action:'preferences'}));await page.evaluate(()=>window.mokune.receive({type:'shortcutHints',visible:true}));assert.equal(await page.locator('.shortcut-hints.is-visible').count(),0);await page.locator('#preferences-close').click();
 await page.clock.resume();
 for(const [theme,width] of [['paper',1280],['graphite',880]]){
  await page.setViewportSize({width,height:860});await page.evaluate(theme=>{window.mokune.receive({type:'action',action:'appearance'});document.querySelector(`[data-theme="${theme}"]`)?.click();},theme);
  await page.keyboard.press('Escape');await page.evaluate(()=>window.mokune.receive({type:'shortcutHints',visible:true}));await page.waitForFunction(()=>getComputedStyle(document.querySelector('.shortcut-hints')).opacity==='1');
  const fits=await page.locator('.shortcut-hints').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&[...el.querySelectorAll('.shortcut-hint')].every(row=>row.scrollWidth<=row.clientWidth+1);});assert.ok(fits,theme+' fits at '+width);
  await mkdir('docs/design/implementation',{recursive:true});await page.screenshot({path:`docs/design/implementation/shortcut-hints-${theme}.png`});await page.evaluate(()=>window.mokune.receive({type:'shortcutHints',visible:false}));
 }
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.shortcut-hints').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
 assert.deepEqual(errors,[]);await writeFile('output/shortcut-hints-checks.json',JSON.stringify({passed:true,checks:['500ms delay','release','quick tap','shortcut chord','modifier chord','composition','focus','source bytes/selection/revision','blur','native messages','modal suppression','light/dark responsive layout','reduced motion'],errors},null,2));console.log('Shortcut hints browser checks passed.');
}finally{await browser.close();}
