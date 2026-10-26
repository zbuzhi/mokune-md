import test from 'node:test';
import assert from 'node:assert/strict';
import {markdownLanguage} from '@codemirror/lang-markdown';
import {inlineStyles} from '../src/web/inline-style.mjs';
const styles=source=>inlineStyles(markdownLanguage.parser.parse(source));
const content=(source,role)=>styles(source).filter(span=>span.role===role).map(span=>source.slice(span.from,span.to));
test('nested emphasis and code use parsed boundaries, including multiple backticks',()=>{
 const s='**加粗 `code`** 和 ***双重强调***，``含 ` 单反引号``';
 assert.deepEqual(content(s,'strong'),['加粗 `code`','双重强调']);assert.deepEqual(content(s,'emphasis'),['**双重强调**']);
 assert.deepEqual(content(s,'inline-code'),['code','含 ` 单反引号']);
});
test('escaped/unmatched delimiters stay literal and inline code masks emphasis',()=>{
 assert.deepEqual(styles('\\*字面* 和 **未闭合'),[]);
 assert.deepEqual(content('`**literal**`','strong'),[]);assert.deepEqual(content('`**literal**`','inline-code'),['**literal**']);
 assert.deepEqual(content('a_b_c foo__bar__baz','strong'),[]);
});
test('block/inline code, table/image source are never decorated as prose',()=>{
 for(const s of ['```md\n**literal**\n```','    **literal**','| A |\n| --- |\n| **cell** |','![**alt**](a.png)'])assert.deepEqual(content(s,'strong'),[]);
 assert.deepEqual(content('> - **项目 `x`**\n\n*multi\nline*','inline-code'),['x']);
 assert.deepEqual(content('> - **项目 `x`**\n\n*multi\nline*','emphasis'),['multi\nline']);
});
