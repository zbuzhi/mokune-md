import assert from 'node:assert/strict';
import {readFile,readdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const graphs=JSON.parse(await readFile('.build/bundle-inputs.json','utf8'));
const inputs=name=>Object.keys(graphs[name].inputs);
assert.ok(inputs('math-engine').some(path=>path.includes('/katex/')),'Shared KaTeX renderer missing');
assert.ok(!inputs('mermaid-engine').some(path=>/\/(katex|dompurify)\//.test(path)),'Diagram engine includes duplicate renderer/sanitizer');
assert.ok(!inputs('export-engine').some(path=>/\/(katex|dompurify|markdown-it|yaml)\//.test(path)),'Export engine includes duplicate parser/renderer');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fonts=await Promise.all((await readdir('node_modules/katex/dist/fonts')).filter(name=>name.endsWith('.woff2')).map(async name=>hash(await readFile('node_modules/katex/dist/fonts/'+name))));
const math=await readFile('dist/web/math-engine.js','utf8');
const embedded=[...math.matchAll(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/g)].map(match=>hash(Buffer.from(match[1],'base64')));
assert.deepEqual(embedded.sort(),fonts.sort(),'Shared font payload must contain all original WOFF2 bytes exactly once');
for(const stale of ['dist/web/fonts','dist/web/katex.min.css']){
 let exists=true;try{await access(stale);}catch(error){if(error.code!=='ENOENT')throw error;exists=false;}
 assert.equal(exists,false,`Stale duplicated resource: ${stale}`);
}
console.log(`Verified shared renderer/parser graph and all ${fonts.length} unchanged math fonts.`);
