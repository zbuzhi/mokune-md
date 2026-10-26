import test from 'node:test';
import assert from 'node:assert/strict';
import {mathSpans,inlineMathPrefix} from '../src/web/math-model.mjs';
test('inline dollar and parenthesis math preserve exact source offsets',()=>{
 const text='中文 $E=mc^2$，再写 \\(a+b\\)。';const spans=mathSpans(text);
 assert.deepEqual(spans.map(s=>s.source),['E=mc^2','a+b']);for(const s of spans)assert.equal(text.slice(s.contentFrom,s.contentTo),s.source);
});
test('display math supports multiline dollars, brackets and same-line display',()=>{
 const text='$$\n\\frac{a}{b}\n$$\n\n\\[\nx^2\n\\]\n\n$$y=2$$\n';
 assert.deepEqual(mathSpans(text).map(s=>s.source.trim()),['\\frac{a}{b}','x^2','y=2']);assert.ok(mathSpans(text).every(s=>s.display));
});
test('escaped dollars, ordinary prices, whitespace and unfinished syntax stay literal',()=>{
 for(const text of ['价格 $5 和 $10','\\$x$','$$ 未完成','$ x $','\\(unfinished','$x','$$\n未完成'])assert.deepEqual(mathSpans(text),[],text);
});
test('escaped closing delimiter is not consumed',()=>{assert.equal(mathSpans('$a\\$b$')[0].source,'a\\$b');});
test('code, links, tables and HTML exclusions never render math',()=>{
 const text='`$code$` $real$ [title $x$](url)';
 assert.deepEqual(mathSpans(text,[{from:0,to:8},{from:15,to:text.length}]).map(s=>s.source),['real']);
});
test('display spans never duplicate internal inline math and do not cross excluded code',()=>{
 const text='$$\na $b$ c\n$$';assert.equal(mathSpans(text).length,1);assert.deepEqual(mathSpans(text,[{from:0,to:text.length}]),[]);
});
test('source metadata, CRLF and unknown syntax remain untouched by scanning',()=>{
 const text='\uFEFF未知\r\n$x$  \r\n';const copy=String(text);mathSpans(text);assert.equal(text,copy);
});
test('dense formulas and many unfinished displays remain complete without changing source',()=>{
 const dense=('正文 $x^2+y^2$，$z_i$。\n').repeat(10000),spans=mathSpans(dense);assert.equal(spans.length,20000);assert.equal(spans.at(-1).source,'z_i');for(const span of spans)assert.equal(dense.slice(span.contentFrom,span.contentTo),span.source);
 const unfinished=('\\[\n未完成\n').repeat(10000);assert.deepEqual(mathSpans(unfinished),[]);
});
test('display close lookup retains blank padding, exclusions and mixed delimiter boundaries',()=>{
 const source='\\[\na $b$ c\n\\]  \n\n$$\nx\n$$\n\n\\[\nunfinished';assert.deepEqual(mathSpans(source).map(s=>s.source.trim()),['a $b$ c','x']);assert.deepEqual(mathSpans(source,[{from:0,to:source.indexOf('$$')}]).map(s=>s.source.trim()),['x']);
});

test('inline parser prefix keeps scanner semantics without traversing following formulas',()=>{
 const samples=['$x$','$a\\$b$ text $c$','\\(a+b\\)','$$x$$','$5 and $10','$ x $','$x$2','$x$\n$y$','\\[\nx\n\\]','\\(unclosed\nfoo','$x$ followed '+('$z$ '.repeat(10000))];
 for(const text of samples){const expected=mathSpans(text).find(s=>s.from===0&&!s.display),actual=inlineMathPrefix(text);assert.deepEqual(actual,expected?{from:0,to:expected.to,source:expected.source,display:false}:null,text.slice(0,50));}
});
