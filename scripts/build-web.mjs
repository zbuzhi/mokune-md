import {build} from 'esbuild';
import {mkdir,copyFile,readdir,readFile,writeFile,rm} from 'node:fs/promises';
// Recreate generated resources so a removed font/engine cannot linger in releases.
await rm('dist/web',{recursive:true,force:true});
await mkdir('dist/web',{recursive:true});
await mkdir('.build',{recursive:true});
const reports={};
const options={bundle:true,minify:true,sourcemap:false,target:['safari16.4'],format:'iife',legalComments:'eof',metafile:true};
async function bundle(name,extra={}){
  const result=await build({...options,entryPoints:[`src/web/${name}.js`],outfile:`dist/web/${name}.js`,...extra});
  reports[name]=result.metafile;
}
await bundle('editor');
const fontBuffers=new Map(await Promise.all((await readdir('node_modules/katex/dist/fonts')).filter(name=>name.endsWith('.woff2')).map(async name=>[name,(await readFile(`node_modules/katex/dist/fonts/${name}`)).toString('base64')])));
// Keep every KaTeX font, byte-for-byte, but store it only once. Live preview and
// standalone exports share this local CSS; neither needs network or file fetches.
const css=(await readFile('node_modules/katex/dist/katex.min.css','utf8')).replace(/src:[^;]+;/g,source=>{const match=source.match(/url\([^)]*\.woff2\)[^,;]*/);return match?`src:${match[0]};`:source;});
const embeddedCSS=css.replace(/url\(fonts\/([^)]*\.woff2)\)/g,(_match,name)=>{
  if(!fontBuffers.has(name))throw new Error(`Missing KaTeX font: ${name}`);
  return `url(data:font/woff2;base64,${fontBuffers.get(name)})`;
})+'\n/*'+await readFile('licenses/OFL-1.1.txt','utf8')+'\n'+await readFile('node_modules/katex/LICENSE','utf8')+'*/';
await bundle('math-engine',{plugins:[{name:'embedded-fonts',setup(build){
  build.onResolve({filter:/^mokune:font-css$/},()=>({path:'font-css',namespace:'mokune'}));
  build.onLoad({filter:/.*/,namespace:'mokune'},()=>({contents:`export default ${JSON.stringify(embeddedCSS)}`,loader:'js'}));
}}]});
// Mermaid only uses KaTeX's public renderToString API. Reuse the tested root
// KaTeX instead of shipping another full renderer through Mermaid's dependency.
await bundle('mermaid-engine',{plugins:[{name:'shared-katex',setup(build){
  build.onResolve({filter:/^katex$/},()=>({path:'katex',namespace:'mokune-shared'}));
  build.onLoad({filter:/.*/,namespace:'mokune-shared'},()=>({contents:'export default window.mokuneMath.katex;',loader:'js'}));
}},{name:'shared-sanitizer',setup(build){
  build.onResolve({filter:/^dompurify$/},()=>({path:'dompurify',namespace:'mokune-sanitizer'}));
  // Mermaid installs DOMPurify hooks: share the factory code, not the mutable
  // instance, so diagram hooks can never change document HTML sanitization.
  build.onLoad({filter:/.*/,namespace:'mokune-sanitizer'},()=>({contents:'export default window.mokuneRenderShared.createSanitizer();',loader:'js'}));
}}]});
await bundle('export-engine',{loader:{'.css':'text'}});
await Promise.all(['index.html','app.css','extensions.css','shortcuts.json'].map(name=>copyFile(`src/web/${name}`,`dist/web/${name}`)));
await writeFile('.build/bundle-inputs.json',JSON.stringify(reports,null,2)+'\n');
await import('./verify-web-bundle.mjs');
console.log('Web editor bundled; input attribution saved to .build/bundle-inputs.json.');
