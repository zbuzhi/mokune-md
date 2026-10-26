import test from 'node:test';
import assert from 'node:assert/strict';
import {cellModel,cellChange,nextCell,pictureModel,pictureChanges} from '../src/web/visual-model.mjs';
import {imageAttributes,imageDimension,imageStyle} from '../src/web/image-properties.mjs';
import {createMarkdownParser} from '../src/web/extended-markdown.mjs';
import {EditorState} from '@codemirror/state';
import {history,undo,redo,isolateHistory} from '@codemirror/commands';
import {decodeSource,sourceExtensions,encodeSource} from '../src/web/source.mjs';
const apply=(text,changes)=>{let state=EditorState.create({doc:text});return state.update({changes}).state.doc.toString();};
test('cell edit touches only cell text, preserving table whitespace and escaping new pipes',()=>{
 const text='# T\n\n|  标题  |  B  |\n| :--- | ---: |\n|  旧内容  | 路径 \\| 保留 |\n尾随  \n';
 const model=cellModel(text,text.indexOf('|'),1,0),updated=apply(text,cellChange(model,'中文 | Rust\n下一行'));
 assert.equal(updated,text.replace('旧内容','中文 \\| Rust<br>下一行'));assert.deepEqual(cellChange(model,model.value),[]);assert.deepEqual(nextCell(model),{row:1,column:1});assert.deepEqual(nextCell(model,-1),{row:0,column:1});assert.equal(cellModel(text,text.indexOf('路径')).column,1);
});
test('incomplete table rows are padded without overwriting existing text; escaped edge pipes remain valid',()=>{
 for(const row of ['| one |','one','| one \\|']){const text='| A | B | C |\n| --- | --- | --- |\n'+row;const model=cellModel(text,0,1,2),updated=apply(text,cellChange(model,'三'));assert.ok(updated.includes(row.trimEnd().replace(/\|$/,'')));assert.equal(cellModel(updated,0,1,2).value,'三');}
 assert.equal(cellModel('```md\n| A |\n| --- |\n```',9),null);assert.equal(cellModel('---\nx: |\n  | A |\n  | --- |\n---',12),null);
});
test('image dimensions are bounded inert properties; unknown syntax is preserved as literal text',()=>{
 assert.equal(imageDimension('50%'),'50%');assert.equal(imageDimension('320'),'320px');assert.equal(imageAttributes('{width=320px height="180px"}').height,'180px');
 for(const value of ['url(x)','0px','9000px','101%','12px;display:none','NaN'])assert.throws(()=>imageDimension(value));assert.throws(()=>imageDimension('50%','height'));assert.equal(imageAttributes('{width=20px onclick=evil}'),null);assert.equal(imageAttributes('{width=20px width=30px}'),null);assert.ok(!imageStyle({width:'320px'}).includes('undefined'));
});
test('image title and dimensions edit only targeted spans and leave relative URL and unknown suffix untouched',()=>{
 const text='前\n\n![图](<assets/中文 图.svg> \'原题\'){width=50%} {#keep}  \n';const m=pictureModel(text,text.indexOf('!['));assert.equal(m.title,'原题');assert.equal(m.width,'50%');assert.equal(pictureModel(text,text.indexOf('50%')).from,m.from);
 const updated=apply(text,pictureChanges(m,{title:'新 "题"',width:'320px',height:'180px'}));assert.ok(updated.includes('<assets/中文 图.svg> "新 \\"题\\""'));assert.ok(updated.endsWith('{width=320px height=180px} {#keep}  \n'));
 assert.deepEqual(pictureChanges(m,{title:m.title,width:m.width,height:m.height}),[]);
 const removed=apply(text,pictureChanges(m,{title:'',width:'',height:''}));assert.equal(removed,'前\n\n![图](<assets/中文 图.svg>) {#keep}  \n');
});
test('reference image size stays local; a changed title converts only that occurrence to inline syntax',()=>{
 const text='![a][logo] 和 ![b][logo]\n\n[logo]: assets/logo.svg "shared"\n';const m=pictureModel(text,0);assert.equal(m.title,'shared');assert.equal(m.inline,false);
 assert.equal(apply(text,pictureChanges(m,{title:'shared',width:'50%',height:''})),text.replace('![a][logo]','![a][logo]{width=50%}'));
 assert.equal(apply(text,pictureChanges(m,{title:'独立',width:'',height:''})),text.replace('![a][logo]','![a](assets/logo.svg "独立")'));
});
test('preview/export parser consumes only valid image attributes and exact br; unsafe HTML stays text',()=>{
 const md=createMarkdownParser(),env={},tokens=md.parse('![图](a.svg "标题"){width=320px height=180px}',env),image=tokens.find(t=>t.children)?.children.find(t=>t.type==='image');assert.deepEqual(image.meta.dimensions,{width:'320px',height:'180px'});assert.ok(!tokens.find(t=>t.children).children.some(t=>t.type==='text'&&t.content.includes('width')));
 assert.ok(md.render('A<br>B<script>bad</script>').includes('A<br>'));assert.ok(md.render('A<br>B<script>bad</script>').includes('&lt;script&gt;'));
});
test('visual cell/image edits undo and redo with original BOM, mixed EOL and trailing spaces intact',()=>{
 const raw='\ufeff| A | B |\r\n| --- | --- |\n|  原文  | B |\r\n\r\n![图](a.svg "旧题")  \r',decoded=decodeSource(raw),source=sourceExtensions(decoded);let state=EditorState.create({doc:decoded.text,extensions:[source.extensions,history()]});const target={get state(){return state;},dispatch:tr=>state=tr.state||state.update(tr).state};
 const cell=cellModel(state.doc.toString(),0,1,0);state=state.update({changes:cellChange(cell,'更新'),annotations:isolateHistory.of('full')}).state;const after=encodeSource(state.doc.toString(),state.field(source.field));undo(target);assert.equal(encodeSource(state.doc.toString(),state.field(source.field)),raw);redo(target);assert.equal(encodeSource(state.doc.toString(),state.field(source.field)),after);undo(target);
 const text=state.doc.toString(),image=pictureModel(text,text.indexOf('!['));state=state.update({changes:pictureChanges(image,{title:'新题',width:'50%',height:''}),annotations:isolateHistory.of('full')}).state;undo(target);assert.equal(encodeSource(state.doc.toString(),state.field(source.field)),raw);
});

 test('image alignment is safe, shared by export and retained by later title/size edits',()=>{
  const original='![图](a.svg "原题"){width=320px align=right}';const model=pictureModel(original,0);assert.equal(model.align,'right');
  const sized=apply(original,pictureChanges(model,{title:model.title,width:'240px',height:'120px'}));assert.ok(sized.endsWith('{width=240px height=120px align=right}'));
  const md=createMarkdownParser(),token=md.parse(original,{}).find(t=>t.children).children.find(t=>t.type==='image');assert.equal(token.meta.dimensions.align,'right');assert.match(imageStyle(token.meta.dimensions),/margin-left:auto;margin-right:0/);
  assert.equal(imageAttributes('{align=right onclick=bad}'),null);assert.equal(imageAttributes('{align=diagonal}'),null);assert.throws(()=>imageStyle({align:'url(x)'}));
 });

test('alt and replacement remain local and reference images do not alter shared definitions',()=>{
 const raw='![旧\\[图\\]](assets/old.png "标题"){width=320px align=right}\n\n![共享][id]\n\n[id]: assets/old.png "共享标题"';
 const first=pictureModel(raw,3),changes=pictureChanges(first,{alt:'新[图]',reference:'assets/new.png'});let result=raw;for(const change of [...changes].reverse())result=result.slice(0,change.from)+change.insert+result.slice(change.to??change.from);
 assert.ok(result.startsWith('![新\\[图\\]](assets/new.png "标题"){width=320px align=right}'));assert.ok(result.includes('[id]: assets/old.png "共享标题"'));
 const ref=pictureModel(raw,raw.indexOf('![共享]')+3),edits=pictureChanges(ref,{alt:'另一幅',reference:'assets/new.png'});let second=raw;for(const change of [...edits].reverse())second=second.slice(0,change.from)+change.insert+second.slice(change.to??change.from);assert.ok(second.includes('![另一幅](assets/new.png "共享标题")'));assert.ok(second.includes('[id]: assets/old.png "共享标题"'));
});

test('updated alt, URL, title and dimensions reach the shared preview/export parser',()=>{
 const source='![旧图](assets/old.png "标题"){width=200px}';const model=pictureModel(source,3),raw=apply(source,pictureChanges(model,{alt:'新图[描述]',reference:'assets/new.png',width:'320px',height:'180px'}));const html=createMarkdownParser({html:true}).render(raw);assert.match(html,/src="assets\/new.png"/);assert.match(html,/alt="新图\[描述\]"/);assert.match(html,/title="标题"/);const tokens=createMarkdownParser({html:true}).parse(raw,{}),image=tokens.find(t=>t.type==='inline').children.find(t=>t.type==='image');assert.equal(image.meta.dimensions.width,'320px');assert.equal(image.meta.dimensions.height,'180px');
});
