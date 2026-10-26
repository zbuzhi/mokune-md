import test from 'node:test';
import assert from 'node:assert/strict';
import {extendedModel,frontMatter,createMarkdownParser,metadataHTML} from '../src/web/extended-markdown.mjs';
import {collectHeadings} from '../src/web/outline-model.mjs';
import {EditorState} from '@codemirror/state';
import {history,undo,redo} from '@codemirror/commands';
import {formatCommands} from '../src/web/formatting.mjs';
import {decodeSource,sourceExtensions,encodeSource} from '../src/web/source.mjs';
test('YAML metadata supports arrays, maps, block strings; never becomes body headings',()=>{
 const text='---\ntitle: 中文\ntags: [Rust, macOS]\nauthor:\n  name: 墨笺\nsummary: |\n  第一行\n  第二行\n---\n\n# 正文\n';
 const meta=frontMatter(text);assert.equal(meta.error,'');assert.deepEqual(meta.entries[1],['tags','Rust · macOS']);assert.equal(meta.entries[2][1],'name: 墨笺');assert.ok(meta.entries[3][1].includes('\n'));assert.deepEqual(collectHeadings(text).map(h=>h.title),['正文']);assert.equal(extendedModel(text).metadata.to,meta.to);
});
test('metadata delimiters are anchored, closed and safe; invalid YAML stays fully visible',()=>{
 assert.equal(frontMatter('\n---\nx: y\n---'),null);assert.equal(frontMatter('---\nx: y'),null);assert.ok(frontMatter('---\nx: y\n...'));
 for(const source of ['x: [','x: !execute evil','x: 1\nx: 2','[a, b]']){const meta=frontMatter(`---\n${source}\n---`);assert.ok(meta.error);assert.ok(metadataHTML(meta).includes(source.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')));}
 assert.ok(metadataHTML(frontMatter('---\nx: "<script>bad</script>"\n---')).includes('&lt;script&gt;'));
 const bomb='---\na: &a [one, two]\nb: &b [*a, *a, *a, *a]\nc: [*b, *b, *b, *b, *b, *b, *b, *b, *b, *b]\n---';assert.ok(frontMatter(bomb).error);
});
test('named notes follow first reference order, repeated backrefs, multiline bodies and exact source positions',()=>{
 const text='先[^b] 再[^a] 重复[^b]。\n\n[^a]: 第一注 **强调**\n\n    第二段\n\n[^b]: 第二注 $x$\n';
 const m=extendedModel(text);assert.deepEqual(m.notes.map(n=>n.label),['b','a']);assert.deepEqual(m.references.map(r=>r.id),[0,1,0]);for(const r of m.references)assert.equal(text.slice(r.from,r.to),`[^${r.label}]`);assert.ok(text.slice(m.definitions[0].from,m.definitions[0].to).includes('第二段'));
 const html=createMarkdownParser().render(text);assert.equal((html.match(/class="footnote-backref"/g)||[]).length,3);assert.ok(html.includes('<strong>强调</strong>'));
});
test('code, escapes, metadata and missing notes remain literal; source offsets survive block prefixes',()=>{
 const text='---\nx: "[^a]"\n---\n\n`[^a]` \\[^a] [^missing]\n\n```md\n[^a]\n```\n\n> 引用[^a]\n\n- 列表[^a]\n\n[^a]: 定义\n';
 const m=extendedModel(text);assert.equal(m.references.length,2);for(const r of m.references)assert.equal(text.slice(r.from,r.to),'[^a]');assert.equal(m.notes[0].count,2);
});
test('footnote and rule shortcuts are single undoable source edits preserving BOM and mixed EOLs',()=>{
 const raw='\uFEFF# 标题\r\n\r\n选中内容  \n',decoded=decodeSource(raw),source=sourceExtensions(decoded);let state=EditorState.create({doc:decoded.text,extensions:[source.extensions,history()],selection:{anchor:decoded.text.indexOf('选中'),head:decoded.text.indexOf('选中')+4}});
 const target={get state(){return state;},dispatch:tr=>{state=tr.state||state.update(tr).state;}};
 formatCommands.footnote(target);assert.ok(state.doc.toString().includes('[^1]: 选中内容'));assert.equal(state.sliceDoc(state.selection.main.from,state.selection.main.to),'选中内容');undo(target);assert.equal(encodeSource(state.doc.toString(),state.field(source.field)),raw);redo(target);assert.ok(state.doc.toString().includes('[^1]'));undo(target);formatCommands.horizontalRule(target);undo(target);assert.equal(encodeSource(state.doc.toString(),state.field(source.field)),raw);
});
test('long inline formula paragraphs tokenize each formula exactly once',()=>{
 const text=('正文 $x+1$。\n').repeat(10000),tokens=createMarkdownParser().parse(text,{}),math=tokens.flatMap(token=>token.children||[]).filter(token=>token.type==='mokune_math');assert.equal(math.length,10000);assert.ok(math.every(token=>token.content==='x+1'));
});
