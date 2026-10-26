import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
try {
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{window.__messages=[];window.webkit={messageHandlers:{mokune:{postMessage:message=>window.__messages.push(message)}}};});
await page.goto('http://127.0.0.1:4173/dist/web/');await page.waitForFunction(()=>window.mokune);
const fixture=await readFile('tests/fixtures/preview.md','utf8');
const load=async(raw=fixture)=>{await page.evaluate(raw=>window.mokune.receive({type:'load',raw,name:'预览验收.md',hasPath:true,imageBase:'/tests/fixtures/'}),raw);};
const snapshot=()=>page.evaluate(()=>window.mokune.snapshot());
await load();await page.locator('.md-table-preview').waitFor();
await page.waitForFunction(()=>document.querySelector('.md-image-preview img')?.naturalWidth>0);
assert.equal(await page.locator('.md-table-preview th').count(),3);
assert.equal(await page.locator('.md-table-preview tbody tr').count(),3);
assert.equal((await snapshot()).raw,fixture);checks.push('table and relative SVG render without modifying source');
assert.equal(await page.locator('.md-table-preview tbody tr').last().locator('td').first().textContent(),'A | B');checks.push('escaped table pipe displays correctly');
await page.locator('.md-table-preview td').filter({hasText:'候选、退格与撤销'}).click({modifiers:['Alt']});
assert.equal((await snapshot()).selection.ranges[0].anchor,fixture.indexOf('候选、退格与撤销'));
assert.equal((await snapshot()).sourceMode,true);await page.keyboard.insertText('实时更新：');await page.locator('#live-mode').click();assert.ok(await page.locator('.md-table-preview').textContent().then(text=>text.includes('实时更新：')));
await page.evaluate(()=>window.mokune.receive({type:'action',action:'undo'}));assert.equal((await snapshot()).raw,fixture);checks.push('Option-click cell opens exact source position; live update and undo preserve Markdown');
await page.locator('.md-image-preview img').first().click({button:'right'});await page.getByRole('menuitem',{name:'编辑图片源码',exact:true}).click();
assert.equal((await snapshot()).selection.ranges[0].anchor,fixture.indexOf('![Mokune'));
assert.equal((await snapshot()).raw,fixture);checks.push('image preview returns to source without changing image markup');
await page.locator('#source-mode').click();assert.equal(await page.locator('.md-table-preview').count(),0);assert.equal(await page.locator('.md-image-preview').count(),0);
await page.locator('#live-mode').click();await page.locator('.md-table-preview').waitFor();assert.equal((await snapshot()).raw,fixture);checks.push('source mode toggles previews with original text unchanged');

await load('# 引用图片\n\n![中文描述][logo]\n\n[logo]: assets/preview.svg "引用标题"\n');
await page.waitForFunction(()=>document.querySelector('.md-image-preview img')?.naturalWidth>0);checks.push('reference-style images render');

await load('# 图片异常\n\n![丢失图片](assets/not-found.png)\n');
await page.locator('.image-unavailable').waitFor();assert.ok((await snapshot()).raw.includes('assets/not-found.png'));checks.push('missing image has a readable error and preserves source');

let remoteRequests=0;
await page.route('https://example.com/preview.svg',async route=>{remoteRequests++;assert.equal(route.request().headers()['referer'],undefined);await route.fulfill({contentType:'image/svg+xml',body:await readFile('tests/fixtures/assets/preview.svg','utf8')});});
await load('# 远程图片\n\n![远程](https://example.com/preview.svg)\n');
await page.locator('.md-image-preview').waitFor();await page.waitForTimeout(150);assert.equal(remoteRequests,0);
await page.getByRole('button',{name:'加载这张图片'}).click();await page.waitForFunction(()=>document.querySelector('.md-image-preview img')?.naturalWidth>0);assert.equal(remoteRequests,1);checks.push('remote image never loads before explicit click and sends no referrer');

await load('# 安全\n\n| 标题 |\n| --- |\n| <img src=x onerror="window.__executed=true"> |\n\n![危险](javascript:alert(1))\n');
await page.locator('.md-table-preview').waitFor();assert.equal(await page.locator('.md-table-preview img').count(),0);assert.equal(await page.evaluate(()=>window.__executed),undefined);checks.push('table HTML remains text; script image URL is blocked');

await load('# 组合输入\n\n原文');await page.locator('.cm-content').click();await page.keyboard.press('Meta+ArrowDown');
const composition=type=>page.evaluate(type=>document.querySelector('.cm-content').dispatchEvent(new CompositionEvent(type,{bubbles:true,data:''})),type);
await composition('compositionstart');await page.keyboard.insertText('第一段');await composition('compositionend');await composition('compositionstart');
await page.waitForTimeout(100);assert.equal((await snapshot()).composing,true);checks.push('previous compositionend never releases a newer composition');
await page.evaluate(()=>{window.__messages=[];window.mokune.receive({type:'action',action:'format',name:'bold'});});
const during=(await snapshot()).raw;assert.ok(!during.includes('**'));await page.keyboard.press('Escape');assert.equal((await snapshot()).composing,true);checks.push('formatting and Escape do not steal active composition');
await composition('compositionend');await page.waitForTimeout(80);assert.equal((await snapshot()).composing,false);

await load();await page.locator('.md-table-preview td').first().click();
await page.evaluate(()=>{window.__table=document.querySelector('.md-table-preview');});
await page.locator('.table-cell-input').dispatchEvent('compositionstart');await page.keyboard.insertText('输入法');
assert.equal(await page.evaluate(()=>window.__table===document.querySelector('.md-table-preview')),true);checks.push('direct table editor DOM stays stable during composition');
await page.locator('.table-cell-input').dispatchEvent('compositionend');await page.waitForTimeout(80);await page.keyboard.press('Enter');assert.ok((await page.locator('.md-table-preview').textContent()).includes('输入法'));

await load('快捷键');await page.locator('.cm-content').click();await page.keyboard.press('Meta+a');await page.keyboard.press('Meta+b');assert.equal((await snapshot()).raw,'**快捷键**');
await page.keyboard.press('Meta+i');assert.equal((await snapshot()).raw,'***快捷键***');
await page.keyboard.press('Meta+z');assert.equal((await snapshot()).raw,'**快捷键**');
await page.keyboard.press('Meta+Shift+m');assert.equal((await snapshot()).sourceMode,true);checks.push('real formatting, undo and source-mode shortcuts work');

await load();await page.locator('#live-mode').click();await page.locator('.cm-line').filter({hasText:'预览，也保留原文'}).first().click();
await page.waitForTimeout(200);await mkdir('docs/design/implementation',{recursive:true});
await page.screenshot({path:'docs/design/implementation/06-table-image-preview.png',fullPage:true});
await page.locator('#appearance-toggle').click();await page.locator('[data-theme="polar"]').click();await page.locator('#appearance-close').click();
await page.screenshot({path:'docs/design/implementation/07-preview-polar.png',fullPage:true});
assert.deepEqual(errors,[]);checks.push('no JavaScript runtime errors');
await writeFile('docs/PREVIEW-TEST-RESULTS.json',JSON.stringify({checks,engine:'Chromium / Microsoft Edge',errors},null,2));console.log(`Preview/browser checks passed: ${checks.length}`);
} finally {await browser.close();}
