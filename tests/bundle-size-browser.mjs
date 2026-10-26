import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
const checks=[],errors=[];
const base='http://127.0.0.1:4173/';
const palette={background:'#fbfaf7',surface:'#f1f0eb',foreground:'#30342f',accent:'#59765b',muted:'#757b73',dark:false};
const examples={
 flow:'flowchart LR\nA[开始]-->B[完成]',
 sequence:'sequenceDiagram\n张三->>李四: 你好\n李四-->>张三: 收到',
 class:'classDiagram\nAnimal <|-- Duck\nAnimal : +int age',
 state:'stateDiagram-v2\n[*] --> Idle\nIdle --> Active\nActive --> [*]',
 er:'erDiagram\nCUSTOMER ||--o{ ORDER : places\nCUSTOMER {\nint id\n}',
 gantt:'gantt\ntitle 项目\ndateFormat YYYY-MM-DD\nsection 开发\n任务 :a1, 2026-10-01, 3d',
 pie:'pie title 比例\n"A" : 40\n"B" : 60',
 journey:'journey\ntitle 写作\nsection 编辑\n写文稿: 5: 作者',
 git:'gitGraph\ncommit id: "初始"\nbranch feature\ncommit id: "编辑"\ncheckout main\nmerge feature id: "合并"',
 mindmap:'mindmap\n  root((写作))\n    文稿\n    图表',
 timeline:'timeline\ntitle 计划\n2026 : 开始\n2027 : 发布',
 quadrant:'quadrantChart\ntitle 对比\nx-axis Low --> High\ny-axis Low --> High\nA: [0.3, 0.6]',
 xy:'xychart-beta\nx-axis [jan, feb, mar]\ny-axis "数量" 0 --> 100\nbar [10, 30, 80]',
 block:'block-beta\ncolumns 2\na["一"] b["二"]\na --> b',
 requirement:'requirementDiagram\nrequirement test_req {\nid: 1\ntext: "Requirement"\nrisk: low\nverifymethod: test\n}',
 sankey:'sankey-beta\nA,B,10\nB,C,7',
 packet:'packet-beta\n0-7: "Header"\n8-15: "Data"',
 c4:'C4Context\ntitle 系统\nPerson(user, "作者", "写作")\nSystem(app, "编辑器", "本地")\nRel(user, app, "使用")',
 mathLabel:'flowchart LR\nA["$$x^2+1$$"] --> B["完成"]'
};
try {
 const pages=[];
 for(const root of ['.build/size-audit/before/Mokune.app/Contents/Resources/web/','dist/web/']){
  const page=await browser.newPage({viewport:{width:1100,height:900}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+root);await page.waitForFunction(()=>window.mokune);
  await page.addScriptTag({url:base+root+'math-engine.js'});await page.addScriptTag({url:base+root+'mermaid-engine.js'});
  pages.push(page);
 }
 const [before,after]=pages;
 for(const [name,source]of Object.entries(examples)){
  const results=[];
  for(const page of pages)results.push(await page.evaluate(async({source,palette})=>{
   const fragment=await window.mokuneMermaid.render(source,palette),host=document.createElement('div');host.append(fragment);document.body.append(host);
   const result={text:host.textContent.replace(/mokune-diagram-\d+/g,'ID').replace(/#ID[^{}]*\{[^{}]*\}/g,'').replace(/\s+/g,' ').trim(),svg:host.querySelectorAll('svg').length,
    geometry:host.querySelectorAll('path,rect,circle,ellipse,polygon,line,polyline').length};
   // Generated style selectors/IDs vary between renditions. Compare visible text
   // and structure, not the renderer's internal stylesheet identifiers.
   result.text=[...host.querySelectorAll('text,foreignObject')].map(n=>n.textContent.trim()).join('|');host.remove();return result;
  },{source,palette}));
  assert.deepEqual(results[1],results[0],name);assert.ok(results[1].svg>0,name);checks.push(`${name}: original and optimized text/shape parity`);
 }
 for(const formula of ['E=mc^2','\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}','\\begin{aligned}x&=1\\\\y&=2\\end{aligned}','\\mathbb{R}+\\mathcal{L}+\\mathfrak{g}+\\text{中文}']){
  const results=[];for(const page of pages)results.push(await page.evaluate(formula=>window.mokuneMath.render(formula,true).outerHTML,formula));assert.equal(results[1],results[0]);
 }
 checks.push('standalone formulas retain identical HTML/MathML');
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),fontDir='.build/size-audit/before/Mokune.app/Contents/Resources/web/fonts';
 const oldFonts=await Promise.all((await readdir(fontDir)).filter(n=>n.endsWith('.woff2')).map(async n=>hash(await readFile(fontDir+'/'+n))));
 const newCSS=await after.evaluate(()=>window.mokuneMath.fontCSS),newFonts=[...newCSS.matchAll(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/g)].map(m=>hash(Buffer.from(m[1],'base64')));
 assert.deepEqual(newFonts.sort(),oldFonts.sort());checks.push(`all ${oldFonts.length} math font files retained byte-for-byte in one payload`);
 await after.evaluate(()=>document.fonts.ready);
 const status=await after.evaluate(async()=>{const node=window.mokuneMath.render('\\frac{x}{y}+\\mathbb{R}',true);document.body.append(node);await document.fonts.ready;return {loaded:document.fonts.check('16px KaTeX_Main'),failed:[...document.fonts].filter(f=>f.status==='error').length};});
 assert.equal(status.loaded,true);assert.equal(status.failed,0);checks.push('embedded fonts load with application CSP');
 const graph=JSON.parse(await readFile('.build/bundle-inputs.json','utf8'));
 assert.equal(Object.keys(graph['mermaid-engine'].inputs).some(p=>/\/katex\//.test(p)),false);assert.equal(Object.keys(graph.editor.inputs).filter(p=>p.includes('/@codemirror/language-data/')).length>0,true);
 checks.push('Mermaid no longer bundles a second KaTeX; language catalog remains included');
 assert.deepEqual(errors,[]);await writeFile('output/bundle-size-browser.json',JSON.stringify({checks,errors},null,2));console.log(`Bundle regression checks passed: ${checks.length}`);
} finally {await browser.close();}
