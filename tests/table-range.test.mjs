import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '@codemirror/state';
import {history,undo,redo,isolateHistory} from '@codemirror/commands';
import {sourceExtensions,decodeSource,encodeSource} from '../src/web/source.mjs';
import {rectangle,copyTableRange,tableRangeOperation} from '../src/web/table-range.mjs';
const apply=(s,edits)=>edits.slice().sort((a,b)=>b.from-a.from).reduce((s,e)=>s.slice(0,e.from)+e.insert+s.slice(e.to??e.from),s);
const text='前文  \n\n| A | B | C |\n| :--- | ---: | :---: |\n| **甲** | x\\|y | 末尾 |\n| 第二行 | `code` | 保留 |\n\n后文  ';
const pos=text.indexOf('| A'),range={top:1,bottom:2,left:0,right:1};
test('reverse rectangle and area TSV preserve display text and quoted line breaks',()=>{
 assert.deepEqual(rectangle({row:2,column:1},{row:1,column:0}),range);assert.equal(copyTableRange(text,pos,range),'甲\tx|y\r\n第二行\tcode');
 const s='| A | B |\n| --- | --- |\n| a<br>b | "q" |';assert.equal(copyTableRange(s,0,{top:1,bottom:1,left:0,right:1}),'"a\nb"\t"""q"""');
});
test('clear edits exactly selected cell contents without touching delimiters or whitespace',()=>{
 const edits=tableRangeOperation(text,pos,range,'clear');assert.equal(edits.length,4);const result=apply(text,edits);assert.equal(result,text.replace('**甲**','').replace('x\\|y','').replace('第二行','').replace('`code`',''));assert.ok(result.includes('| :--- | ---: | :---: |'));assert.ok(result.endsWith('\n\n后文  '));
});
test('delete selected rows retains header/separator, surrounding text and quote containers',()=>{
 assert.equal(apply(text,tableRangeOperation(text,pos,range,'deleteRows')),'前文  \n\n| A | B | C |\n| :--- | ---: | :---: |\n\n后文  ');
 const s='> | A | B |\n> | --- | --- |\n> | x | y |\n> | z | w |\n>\n> 后文';const p=s.indexOf('| A');assert.equal(apply(s,tableRangeOperation(s,p,{top:1,bottom:1,left:0,right:0},'deleteRows')),s.replace('> | x | y |\n',''));
 assert.throws(()=>tableRangeOperation(text,pos,{top:0,bottom:1,left:0,right:0},'deleteRows'),/表头/);
});
test('delete selected columns preserves raw survivor whitespace/escapes for all edge-pipe forms',()=>{
 for(const edges of [true,false])for(const [left,right]of [[0,0],[1,1],[2,2],[0,1],[1,2]]){
  const rows=['A  | B |  C ',':--- | ---: | :---: ','x\\|y | **b** | z '].map(s=>edges?'|'+s+'|':s),s=rows.join('\n'),result=apply(s,tableRangeOperation(s,0,{top:0,bottom:1,left,right},'deleteColumns'));
  const expected=rows.map(row=>{const raw=edges?row.slice(1,-1):row;const parts=raw.split(/(?<!\\)\|/);parts.splice(left,right-left+1);return (edges?'|':'')+parts.join('|')+(edges?'|':'');}).join('\n');assert.equal(result,expected);
 }
 const s='> | A | B | C |\n> | --- | --- | --- |\n> | x | y | z |';assert.equal(apply(s,tableRangeOperation(s,s.indexOf('| A'),{top:1,bottom:1,left:1,right:1},'deleteColumns')),s.replaceAll(' | B','').replace(' | --- | --- | ---',' | --- | ---').replace(' | y',''));
});
test('invalid/missing ranges, ragged structural edits and deleting all columns fail before mutation',()=>{
 assert.throws(()=>tableRangeOperation(text,pos,{...range,bottom:100},'clear'),/选区/);assert.throws(()=>tableRangeOperation(text,pos,{...range,left:0,right:2},'deleteColumns'),/至少/);assert.equal(copyTableRange('```md\n'+text+'\n```',pos+6,range),null);
 const ragged='| A | B |\n| --- | --- |\n| x |';assert.throws(()=>tableRangeOperation(ragged,0,{top:1,bottom:1,left:0,right:0},'deleteColumns'),/补齐/);assert.deepEqual(tableRangeOperation(ragged,0,{top:1,bottom:1,left:1,right:1},'clear'),[]);
});
test('each area operation restores exact BOM/mixed EOL bytes with one undo/redo',()=>{
 const raw='\ufeff'+text.replaceAll('\n','\r\n')+'\r';
 for(const operation of ['clear','deleteRows','deleteColumns']){
  const meta=decodeSource(raw),source=sourceExtensions(meta);let state=EditorState.create({doc:meta.text,extensions:[source.extensions,history()]});
  const dispatch=tr=>{state=tr.state;},owner={get state(){return state;},dispatch};
  const edits=tableRangeOperation(state.doc.toString(),pos,range,operation);state=state.update({changes:edits,annotations:isolateHistory.of('full')}).state;const changed=encodeSource(state.doc.toString(),state.field(source.field));assert.notEqual(changed,raw);assert.equal(undo(owner),true);assert.equal(encodeSource(state.doc.toString(),state.field(source.field)),raw);assert.equal(redo(owner),true);assert.equal(encodeSource(state.doc.toString(),state.field(source.field)),changed);
 }
});
