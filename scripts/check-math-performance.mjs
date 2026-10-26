import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
let before;try{before=(await import('../.build/math-model-before.mjs')).mathSpans;}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
import {createMarkdownParser} from '../src/web/extended-markdown.mjs';
import {mathSpans as after,inlineMathPrefix} from '../src/web/math-model.mjs';
let seed=17;const random=n=>(seed=(Math.imul(seed,1664525)+1013904223)>>>0)%n;
const chunks=['正文','$x$','$$\nx+$y$\n$$','\\[\nz\n\\]','\\(a\\)','\\$literal','`$code$`','$$未完成','\\[\n未完成','\n','\n\n','**bold**',' $5 '];
for(let i=0;i<1500;i++){let text='';for(let j=0;j<30;j++)text+=chunks[random(chunks.length)];const excluded=[];for(let j=0;j<5;j++){const from=random(text.length);excluded.push({from,to:Math.min(text.length,from+1+random(20))});}if(before){assert.deepEqual(after(text,excluded),before(text,excluded),'semantic case '+i);const expected=before(text).find(s=>s.from===0&&!s.display);assert.deepEqual(inlineMathPrefix(text),expected?{from:0,to:expected.to,source:expected.source,display:false}:null,'prefix case '+i);}}
const results=[];
for(const [kind,text]of [['inline',('正文 $x^2+y^2$，$z_i$。\n').repeat(10000)],['unfinished',('\\[\n未完成\n').repeat(10000)]]){
 const row={kind,bytes:Buffer.byteLength(text)};for(const [name,scan]of [['before',before],['after',after]].filter(([,scan])=>scan)){const times=[];let spans;for(let i=0;i<3;i++){const t=performance.now();spans=scan(text);times.push(performance.now()-t);}row[name]={medianMs:times.toSorted((a,b)=>a-b)[1],spans:spans.length};}results.push(row);
}
const parserResults=[];
for(const n of [1000,10000]){
 const text=('正文 $x+1$。\n').repeat(n),times=[];let rendered='';for(let i=0;i<3;i++){const t=performance.now();rendered=createMarkdownParser().parse(text,{});times.push(performance.now()-t);}parserResults.push({formulas:n,medianMs:times.toSorted((a,b)=>a-b)[1]});assert.equal(rendered.flatMap(token=>token.children||[]).filter(token=>token.type==='mokune_math').length,n);
}
await writeFile('output/math-performance.json',JSON.stringify({equivalenceCases:before?1500:0,results,parserResults},null,2));console.log(JSON.stringify(results));
