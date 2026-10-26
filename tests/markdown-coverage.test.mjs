import test from 'node:test';
import assert from 'node:assert/strict';
import {createMarkdownParser} from '../src/web/extended-markdown.mjs';
const md=createMarkdownParser({html:true});
test('GFM task lists export checked/unchecked states inside actual list items',()=>{
 const html=md.render('- [x] **完成 `code`**\n- [ ] 待办\n  - [X] 子任务\n\n[x] 普通文本\n\n```md\n- [x] 源码\n```');
 assert.equal((html.match(/role="checkbox"/g)||[]).length,3);assert.equal((html.match(/aria-checked="true"/g)||[]).length,2);assert.ok(html.includes('<strong>完成 <code>code</code></strong>'));assert.ok(html.includes('[x] 普通文本'));
});
test('GFM bare links, references and nested inline code preserve semantics',()=>{
 const html=md.render('www.example.com https://example.com a@example.com\n\n**加粗 ``内有 ` 字符``** 和 ~~*删除*~~\n\n[引用][id]\n\n[id]: https://example.com "标题"');
 assert.ok(html.includes('href="http://www.example.com"'));assert.ok(html.includes('href="mailto:a@example.com"'));assert.ok(html.includes('<strong>加粗 <code>内有 ` 字符</code></strong>'));assert.ok(html.includes('<s><em>删除</em></s>'));assert.ok(html.includes('title="标题"'));
});
test('headings, rules, nested lists/quotes, escapes, code blocks, tables and line breaks',()=>{
 const examples=[['# 标题\n\n第二标题\n---','<h1>标题</h1>','<h2>第二标题</h2>'],['- 项目\n  - 子项\n\n1. 编号\n2. 第二','<ul>','<ol>'],['> 引用\n>\n> - 列表','<blockquote>','<li>列表</li>'],['a  \nb\n\n---\n\n\\*literal\\*','<br>','<hr>','*literal*'],['    code\n\n~~~js\nconst a=1\n~~~','<pre><code>code','language-js'],['| A | B |\n| :--- | ---: |\n| **粗体** | `代码` |','<table>','<strong>粗体</strong>','<code>代码</code>']];
 for(const [source,...needles]of examples){const html=md.render(source);for(const needle of needles)assert.ok(html.includes(needle),source+': '+needle);}
});
