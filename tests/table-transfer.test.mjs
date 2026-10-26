import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTSV,pasteTable,copyTableTSV} from '../src/web/table-transfer.mjs';
import {tableCells} from '../src/web/preview-model.mjs';
const apply=(source,changes)=>changes.slice().sort((a,b)=>b.from-a.from).reduce((s,c)=>s.slice(0,c.from)+c.insert+s.slice(c.to??c.from),source);
const source='# 表格\n\n|  A  | B |\n| :--- | ---: |\n| 原文 | 保留 |\n\n后文  ';
test('TSV parses quoted tabs/newlines/quotes, empty fields and spreadsheet terminator',()=>{
 assert.deepEqual(parseTSV('A\tB\r\n"x\ty"\t"line1\nline2"\r\n'),[['A','B'],['x\ty','line1\nline2']]);assert.deepEqual(parseTSV('"a""b"\t\t'),[['a"b','','']]);assert.throws(()=>parseTSV('"bad'),/未闭合/);assert.throws(()=>parseTSV('"ok"x'),/引号/);
});
test('matrix paste preserves unaffected bytes and alignment while expanding rows/columns',()=>{
 const result=apply(source,pasteTable(source,source.indexOf('原文'),1,1,'甲\t乙\r\n丙\t丁\r\n'));
 assert.ok(result.startsWith('# 表格\n\n|  A  | B |  |\n| :--- | ---: | --- |'));assert.ok(result.includes('| 原文 | 甲 | 乙 |'));assert.ok(result.includes('|  | 丙 | 丁 |'));assert.ok(result.endsWith('\n\n后文  '));
});
test('paste from header crosses separator correctly and escapes pipes/multiline data',()=>{
 const result=apply(source,pasteTable(source,source.indexOf('|  A'),0,0,'新A\t新B\n"x|y"\t"line1\nline2"'));
 assert.ok(result.includes('|  新A  | 新B |\n| :--- | ---: |\n| x\\|y | line1<br>line2 |'));assert.equal((result.match(/:---/g)||[]).length,1);
});
test('copy emits display text and lossless quoted TSV; code blocks are excluded',()=>{
 const text='| A | B |\n| --- | --- |\n| **粗体** | `x`<br>换行 |\n| a\\|b | "quoted" |';const tsv=copyTableTSV(text,0);assert.deepEqual(parseTSV(tsv),[['A','B'],['粗体','x\n换行'],['a|b','"quoted"']]);assert.equal(copyTableTSV('```md\n'+text+'\n```',12),null);
});
test('bounded paste rejects oversize before editing',()=>{assert.throws(()=>pasteTable(source,source.indexOf('原文'),1,1,Array(101).fill('x').join('\t')),/100/);assert.throws(()=>parseTSV('x'.repeat(1024*1024+1)),/1 MB/);});
test('blockquote table markers are not cells and new rows remain in the quote',()=>{
 const text='> | A | B |\n> | :--- | ---: |\n> | **x** | y |',position=text.indexOf('| A');
 assert.deepEqual(parseTSV(copyTableTSV(text,position)),[['A','B'],['x','y']]);
 const result=apply(text,pasteTable(text,position,1,1,'甲\t乙\n丙\t丁'));
 assert.ok(result.includes('> | **x** | 甲 | 乙 |'));assert.ok(result.includes('\n> |  | 丙 | 丁 |'));
 assert.ok(result.includes('> | :--- | ---: | --- |'));assert.equal(parseTSV(copyTableTSV(result,position))[2][2],'丁');
});
test('blockquote cell edits target actual content; row/column tools retain containers',async()=>{
 const {cellModel,cellChange}=await import('../src/web/visual-model.mjs'),{tableOperation}=await import('../src/web/table-tools.mjs');
 const text='> | A | B |\n> | --- | --- |\n> | x | y |',pos=text.indexOf('| A');
 const model=cellModel(text,pos,1,0);assert.equal(model.value,'x');assert.equal(apply(text,cellChange(model,'新')),'> | A | B |\n> | --- | --- |\n> | 新 | y |');
 const added=apply(text,tableOperation(text,model.cell.from,'rowAfter'));assert.ok(added.endsWith('\n> |  |  |'));
 const wide=apply(text,tableOperation(text,model.cell.from,'columnAfter'));assert.ok(wide.includes('\n> | x |  | y |'));
 const listed='- 项目\n\n  | A | B |\n  | --- | --- |\n  | x | y |';
 const listWide=apply(listed,tableOperation(listed,listed.indexOf('x'),'columnAfter'));assert.ok(listWide.includes('\n  | x |  | y |'));
});
