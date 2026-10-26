import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
try{
 const page=await browser.newPage();await page.addInitScript(()=>{window.__messages=[];window.webkit={messageHandlers:{mokune:{postMessage:m=>window.__messages.push(m)}}};});
 await page.goto('http://127.0.0.1:4173/dist/web/');await page.waitForFunction(()=>window.mokune);
 const text='[跳到目标](#same-1-1)\n\n<div><h2>HTML 标题</h2></div>\n\n# 中文 标题\n\n'+Array(80).fill('普通段落。\n').join('\n')+'\n# Same\n\n# Same\n\n# Same-1\n\n# **粗体** `code`\n';
 await page.evaluate(raw=>window.mokune.receive({type:'load',raw,name:'anchors.md',hasPath:true}),text);await page.evaluate(()=>window.mokune.receive({type:'action',action:'exportHTML'}));await page.waitForFunction(()=>window.__messages.some(m=>m.command==='writeExport'));
 const html=await page.evaluate(()=>window.__messages.find(m=>m.command==='writeExport').html),output=await browser.newPage({viewport:{width:1100,height:700}});await output.setContent(html);
 const ids=await output.locator('h1[id],h2[id]').evaluateAll(nodes=>nodes.map(n=>n.id));assert.deepEqual(ids,['中文-标题','same','same-1','same-1-1','粗体-code']);
 assert.equal(await output.locator('h2:not([id])').textContent(),'HTML 标题');await output.locator('a[href="#same-1-1"]').click();await output.waitForFunction(()=>scrollY>1000);assert.equal(await output.evaluate(()=>location.hash),'#same-1-1');assert.equal(await page.evaluate(()=>window.mokune.snapshot().raw),text);
 await writeFile('output/html/mokune-heading-anchors.html',html);await writeFile('output/heading-anchors-browser.json',JSON.stringify({checks:['Unicode and formatted heading IDs match editor','duplicate IDs remain unique even with suffix-like titles','HTML headings do not steal Markdown anchors','exported anchor link scrolls to target','export leaves original Markdown unchanged']},null,2));console.log('Heading anchor browser checks passed: 5');
}finally{await browser.close();}
