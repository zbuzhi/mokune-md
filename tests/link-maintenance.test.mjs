import test from 'node:test';import assert from 'node:assert/strict';import {maintainLinks} from '../src/web/link-maintenance.mjs';
test('incoming links and fragments keep labels, titles, BOM and mixed EOL bytes',()=>{
 const raw='\ufeff# 文档\r\n[目标](旧目录/说明.md#章节 "标题")  \n![图片](旧目录/a.png)\r\n';
 assert.equal(maintainLinks(raw,'首页.md','旧目录','新目录').raw,'\ufeff# 文档\r\n[目标](%E6%96%B0%E7%9B%AE%E5%BD%95/%E8%AF%B4%E6%98%8E.md#章节 "标题")  \n![图片](%E6%96%B0%E7%9B%AE%E5%BD%95/a.png)\r\n');
});
test('moved document rebases outgoing images, references and self links',()=>{
 const raw='[文稿](other.md)\n![图](assets/a.png)\n\n[ref]: other.md "原题"\n';
 assert.equal(maintainLinks(raw,'note.md','note.md','子目录/note.md').raw,'[文稿](../other.md)\n![图](../assets/a.png)\n\n[ref]: ../other.md "原题"\n');
});
test('folder internal paths, remote, anchors and code examples remain untouched',()=>{
 const raw='[内部](other.md) [外部](https://x/a.md) [锚点](#abc)\n`[代码](../a.md)`\n\n```md\n[代码](../a.md)\n```\n';
 assert.equal(maintainLinks(raw,'old/note.md','old','new').raw,raw);
});
test('encoded spaces, nested parentheses, angle destinations and queries',()=>{
 const raw='[一](<old/a b.md#x>) [二](old/a(b).md?x=1#y)';
 assert.equal(maintainLinks(raw,'index.md','old','new').raw,'[一](<new/a%20b.md#x>) [二](new/a%28b%29.md?x=1#y)');
});
test('HTML image/link attributes are maintained without altering other attributes',()=>{
 const raw='<img src="old/a.png" width="300">\n<a href=\'old/b.md#x\'>标签</a>';
 assert.equal(maintainLinks(raw,'index.md','old','new').raw,'<img src="new/a.png" width="300">\n<a href=\'new/b.md#x\'>标签</a>');
});
test('front matter and inline code references are never rewritten',()=>{
 const raw='\ufeff---\r\nname: "[链接](old/a.md)"\r\n---\r\n\r\n[真实](old/a.md)';
 const result=maintainLinks(raw,'index.md','old','new').raw;
 assert.equal(result,'\ufeff---\r\nname: "[链接](old/a.md)"\r\n---\r\n\r\n[真实](new/a.md)');
});

test('HTML comments, data attributes and math source are preserved',()=>{
 const raw='<!-- <img src="old/a.png"> -->\n\n<img data-src="old/a.png" src="old/b.png">\n\n$[公式](old/a.md)$';
 assert.equal(maintainLinks(raw,'index.md','old','new').raw,'<!-- <img src="old/a.png"> -->\n\n<img data-src="old/a.png" src="new/b.png">\n\n$[公式](old/a.md)$');
});
