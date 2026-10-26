import test from 'node:test';
import assert from 'node:assert/strict';
import {createMarkdownParser,extendedModel} from '../src/web/extended-markdown.mjs';
const md=createMarkdownParser();
test('five GitHub alerts and lowercase markers share semantic rendering',()=>{
 for(const type of ['NOTE','TIP','IMPORTANT','WARNING','CAUTION','note']){
  const src=`> [!${type}]\n> **内容**和 \`code\`\n>\n> - 项目\n\n正文`;
  const model=extendedModel(src),html=md.render(src);
  assert.deepEqual(model.callouts,[{type:type.toUpperCase(),startLine:0,endLine:4}]);
  assert.match(html,new RegExp(`class="md-callout callout-${type.toLowerCase()}"`));
  assert.match(html,/<strong>内容<\/strong>/);assert.match(html,/<code>code<\/code>/);assert.match(html,/<li>项目<\/li>/);assert.ok(!html.includes('[!'));assert.match(html,/<p>正文<\/p>/);
 }
});
test('unknown, inline, escaped, code and nested markers remain literal',()=>{
 for(const src of ['> [!CUSTOM]\n> 内容','> 前文 [!NOTE]\n> 内容','> \\[!NOTE]\n> 内容','> [!NOTE] 后缀\n> 内容','```md\n> [!NOTE]\n```','    > [!NOTE]\n','> > [!NOTE]\n> > 内容','- 项目\n  > [!NOTE]\n  > 内容'])assert.equal(extendedModel(src).callouts.length,0,src);
});
test('empty/consecutive alerts and footnote offsets remain valid',()=>{
 const src='> [!NOTE]\n\n> [!TIP]\n> 有脚注[^a]\n\n[^a]: 说明';
 const model=extendedModel(src);assert.equal(model.callouts.length,2);assert.equal(model.references.length,1);assert.equal(src.slice(model.references[0].from,model.references[0].to),'[^a]');
 const html=md.render(src);assert.equal((html.match(/class="callout-title"/g)||[]).length,2);assert.match(html,/有脚注/);
});
