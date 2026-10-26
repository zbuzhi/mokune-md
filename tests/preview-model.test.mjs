import test from 'node:test';
import assert from 'node:assert/strict';
import {tableCells,tableModel,imageLocation} from '../src/web/preview-model.mjs';

test('table handles escaped pipes and empty cells with original positions',()=>{
 const cells=tableCells('| A \\| B | | C |',10);assert.deepEqual(cells.map(c=>c.text),['A \\| B','','C']);assert.equal(cells[0].from,12);
});
test('table alignment and incomplete rows follow header width',()=>{
 const table=tableModel('| 左 | 中 | 右 |\n| :--- | :---: | ---: |\n| 内容 |\n');assert.deepEqual(table.align,['left','center','right']);assert.deepEqual(table.rows[0].map(c=>c.text),['内容','','']);
});
test('table does not alter original Markdown or execute cell HTML',()=>{
 const text='| 标题 |\n| --- |\n| <script>alert(1)</script> |';const model=tableModel(text);assert.equal(model.rows[0][0].text,'<script>alert(1)</script>');assert.equal(text,'| 标题 |\n| --- |\n| <script>alert(1)</script> |');
});
test('native local image URL keeps Chinese and spaces encoded once',()=>{const location=imageLocation('<assets/测试%20图片.png>','mokune-image://local/token/');assert.equal(location.kind,'local');assert.equal(new URL(location.url).searchParams.get('path'),'assets/测试%20图片.png');});
test('remote images require explicit permission at the view layer',()=>{assert.deepEqual(imageLocation('https://example.com/a.png',''),{kind:'remote',url:'https://example.com/a.png',host:'example.com'});});
test('script, insecure, protocol-relative and credential-bearing image URLs are blocked',()=>{for(const source of ['javascript:alert(1)','http://example.com/a.png','//example.com/a.png','https://user:password@example.com/a.png','data:text/html;base64,PGgxPg=='])assert.equal(imageLocation(source,'').kind,'blocked');});
test('unsaved local references provide a clear save-first state',()=>{assert.equal(imageLocation('assets/a.png','').kind,'unsaved');});
