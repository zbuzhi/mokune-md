import test from 'node:test';
import assert from 'node:assert/strict';
import {collectHeadings,headingAt} from '../src/web/outline-model.mjs';
test('extracts ATX and setext heading hierarchy with original source positions',()=>{
 const text='# 项目\n\n## 设计\n\n### 细节\n\n兼容标题\n===\n';const headings=collectHeadings(text);
 assert.deepEqual(headings.map(h=>[h.title,h.level]),[['项目',1],['设计',2],['细节',3],['兼容标题',1]]);assert.equal(headings[1].from,text.indexOf('## 设计'));
});
test('code blocks and display formula internals never become outline entries',()=>{
 const text='# 正文\n\n```md\n# 代码标题\n```\n\n$$\n# 公式内部\n$$\n\n    # 缩进代码\n\n## 末尾\n';assert.deepEqual(collectHeadings(text).map(h=>h.title),['正文','末尾']);
});
test('heading labels remove inline marks but stay plain inert text',()=>{
 const headings=collectHeadings('## **加粗**、`code` 与 [链接](https://example.com)\n\n# <img onerror=x>');assert.equal(headings[0].title,'加粗、code 与 链接');assert.equal(headings[1].title,'<img onerror=x>');
});
test('active heading lookup handles start, between sections and end',()=>{
 const headings=collectHeadings('# 一\n\n段落\n\n## 二\n\n末尾');assert.equal(headingAt(headings,0),0);assert.equal(headingAt(headings,8),0);assert.equal(headingAt(headings,999),1);
});
