// Official fixtures are downloaded to .build, not redistributed in the repo.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createMarkdownParser} from '../src/web/extended-markdown.mjs';
const file=process.argv[2]||'.build/commonmark-0.31.2.json',bytes=await readFile(file),examples=JSON.parse(bytes);
const parser=createMarkdownParser({html:true,frontMatterEnabled:false});parser.options.linkify=false;
// HTML5 void elements and an empty blockquote are semantically equivalent to
// the reference serializer's XHTML slashes / whitespace-only block content.
const normalize=html=>html.replace(/<(hr|br|img)(\b[^>]*?)\s*\/>/g,'<$1$2>').replace(/<blockquote>\n<\/blockquote>/g,'<blockquote></blockquote>');
const failures=[];for(const example of examples)if(normalize(parser.render(example.markdown))!==normalize(example.html))failures.push({example:example.example,section:example.section});
await mkdir('output',{recursive:true});await writeFile('output/commonmark-results.json',JSON.stringify({source:'https://spec.commonmark.org/0.31.2/spec.json',license:'CC-BY-SA-4.0; upstream fixture remains in .build only',sha256:createHash('sha256').update(bytes).digest('hex'),profile:'CommonMark parser; Front Matter and GFM bare-URL linking disabled for this standard profile. Safety sanitization and interactive layout tested separately.',examples:examples.length,failures},null,2));
assert.deepEqual(failures,[]);console.log(`CommonMark official parser examples passed: ${examples.length}`);
