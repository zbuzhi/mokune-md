import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '@codemirror/state';
import {history,undo} from '@codemirror/commands';
import {formatCommands} from '../src/web/formatting.mjs';
import {decodeSource,encodeSource,sourceExtensions} from '../src/web/source.mjs';

function editor(raw,from=0,to=from) {
 const metadata=decodeSource(raw),source=sourceExtensions(metadata);
 let state=EditorState.create({doc:metadata.text,selection:{anchor:from,head:to},extensions:[source.extensions,history()]});
 return {get state(){return state;},dispatch:tr=>{state=tr.state;},raw:()=>encodeSource(state.doc.toString(),state.field(source.field))};
}
test('bold selected Chinese text and toggle back without changing source outside selection',()=>{
 const e=editor('\uFEFF中文\r\n尾随  ',0,2);formatCommands.bold(e);assert.equal(e.raw(),'\uFEFF**中文**\r\n尾随  ');formatCommands.bold(e);assert.equal(e.raw(),'\uFEFF中文\r\n尾随  ');
});
test('empty inline code leaves the caret between markers',()=>{const e=editor('');formatCommands.inlineCode(e);assert.equal(e.raw(),'``');assert.equal(e.state.selection.main.head,1);});
test('bold and italic compose and toggle independently',()=>{
 const e=editor('文字',0,2);formatCommands.bold(e);formatCommands.italic(e);assert.equal(e.raw(),'***文字***');formatCommands.italic(e);assert.equal(e.raw(),'**文字**');formatCommands.bold(e);assert.equal(e.raw(),'文字');
});
test('link selects the destination placeholder',()=>{const e=editor('文档',0,2);formatCommands.link(e);assert.equal(e.raw(),'[文档](https://)');assert.equal(e.state.sliceDoc(e.state.selection.main.from,e.state.selection.main.to),'https://');});
test('image inserts source markup and selects image path',()=>{const e=editor('');formatCommands.image(e);assert.equal(e.raw(),'![图片描述](图片路径)');assert.equal(e.state.sliceDoc(e.state.selection.main.from,e.state.selection.main.to),'图片路径');});
test('heading changes only its prefix and undo restores mixed line endings',()=>{
 const raw='# 标题\r\n\n段落  \r';const e=editor(raw,2,4);formatCommands.heading3(e);assert.equal(e.raw(),'### 标题\r\n\n段落  \r');undo(e);assert.equal(e.raw(),raw);
});
test('paragraph removes heading syntax',()=>{const e=editor('## 标题',3,5);formatCommands.paragraph(e);assert.equal(e.raw(),'标题');});
test('multiline task list toggles without reformatting text',()=>{const e=editor('甲\r\n乙  ',0,5);formatCommands.taskList(e);assert.equal(e.raw(),'- [ ] 甲\r\n- [ ] 乙  ');formatCommands.taskList(e);assert.equal(e.raw(),'甲\r\n乙  ');});
test('fenced code is one undoable source edit',()=>{const raw='原文\r\n尾行';const e=editor(raw,0,2);formatCommands.codeBlock(e);assert.ok(e.raw().startsWith('```\r\n原文\r\n```'));undo(e);assert.equal(e.raw(),raw);});
test('table shortcut is undoable and preserves following text',()=>{const e=editor('后文');formatCommands.table(e);assert.ok(e.raw().startsWith('| 名称 | 内容 |'));assert.ok(e.raw().endsWith('后文'));undo(e);assert.equal(e.raw(),'后文');});
