import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState,Transaction} from '@codemirror/state';
import {history,undo,redo,isolateHistory} from '@codemirror/commands';
import {decodeSource,encodeSource,sourceExtensions} from '../src/web/source.mjs';

function editor(raw) {
  const metadata=decodeSource(raw),source=sourceExtensions(metadata);
  let state=EditorState.create({doc:metadata.text,extensions:[source.extensions,history()]});
  return {
    get state(){return state;},
    dispatch(tr){state=tr.state||state.update(tr).state;},
    change(changes,userEvent='input.type'){this.dispatch(state.update({changes,userEvent}));},
    raw(){return encodeSource(state.doc.toString(),state.field(source.field));}
  };
}

for(const [name,raw]of [
 ['LF','# 你好\n\n- [x] task  \n'],['CRLF','---\r\ntitle: 文稿\r\n---\r\n\r\n# 中文  \r\n'],
 ['BOM','\uFEFF# 中文\r\n\r\n尾随空格  '],['mixed','a\r\nb\nc\rd\r\n'],
 ['unknown',':::custom\n<custom-tag a="b">内容</custom-tag>\n:::'],['no-final-newline','普通文稿，没有末尾换行'],
 ['empty',''],['emoji','# 中文 👩🏽‍💻\n\nA😀B\r\n'],
 ])test(`no-op byte identity: ${name}`,()=>{assert.deepEqual(Buffer.from(editor(raw).raw()),Buffer.from(raw));});

test('local edit preserves untouched mixed line endings and trailing spaces',()=>{
 const e=editor('\uFEFF# 中文\r\n\r\n- item  \n\tcode\r末尾');
 const from=e.state.doc.toString().indexOf('item');e.change({from,to:from+4,insert:'项目'});
 assert.equal(e.raw(),'\uFEFF# 中文\r\n\r\n- 项目  \n\tcode\r末尾');
});
test('new lines use dominant convention',()=>{const e=editor('a\r\nb\r\nc\n');e.change({from:1,insert:'\n新行'});assert.equal(e.raw(),'a\r\n新行\r\nb\r\nc\n');});
test('undo restores deleted mixed line endings exactly; redo restores edited content',()=>{
 const original='\uFEFFa\r\nb\nc\rd\r\n';const e=editor(original);
 e.change({from:1,to:6,insert:'合并\n新行'});const edited=e.raw();assert.notEqual(edited,original);
 assert.equal(undo(e),true);assert.equal(e.raw(),original);assert.equal(redo(e),true);assert.equal(e.raw(),edited);
});
test('grouped typing and grouped line deletion restore the earliest metadata',()=>{
 const original='a\r\n\nb\rc';const e=editor(original);
 e.change({from:2,to:3,insert:''},'delete.backward');e.change({from:1,to:2,insert:''},'delete.backward');
 const edited=e.raw();assert.equal(undo(e),true);assert.equal(e.raw(),original);assert.equal(redo(e),true);assert.equal(e.raw(),edited);
});
test('multiple selections preserve line ending positions',()=>{
 const e=editor('a\r\nb\nc\r');e.change([{from:1,insert:'中\n文'},{from:4,to:5,insert:'C'}]);
 assert.equal(e.raw(),'a中\r\n文\r\nb\nC\r');
});
test('unrelated display transactions never change raw source',()=>{
 const raw='\uFEFFa\r\nb\nc\r';const e=editor(raw);
 e.dispatch(e.state.update({selection:{anchor:3},annotations:Transaction.addToHistory.of(false)}));assert.equal(e.raw(),raw);
});
