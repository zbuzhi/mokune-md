import {readdir,stat,readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const mode=process.argv[2];
if(!['before','after'].includes(mode))throw new Error('Usage: node scripts/measure-bundle.mjs before|after');
const root='.build/size-audit';await mkdir(root,{recursive:true});await mkdir('output',{recursive:true});
async function scan(path){const files=[];for(const entry of await readdir(path,{withFileTypes:true})){const file=path+'/'+entry.name;if(entry.isDirectory())files.push(...await scan(file));else files.push({path:file,bytes:(await stat(file)).size});}return files;}
execFileSync('/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent','dist/Mokune MD.app',`${root}/${mode}.zip`]);
const files=await scan('dist/Mokune MD.app'),measurement={appBytes:files.reduce((sum,file)=>sum+file.bytes,0),zipBytes:(await stat(`${root}/${mode}.zip`)).size,files};
await writeFile(`${root}/${mode}.json`,JSON.stringify(measurement,null,2)+'\n');
if(mode==='before'){console.log(JSON.stringify({appBytes:measurement.appBytes,zipBytes:measurement.zipBytes}));process.exit(0);}
const before=JSON.parse(await readFile(`${root}/before.json`)),after=measurement;
const diff={appBytes:before.appBytes-after.appBytes,zipBytes:before.zipBytes-after.zipBytes,appPercent:(1-after.appBytes/before.appBytes)*100,zipPercent:(1-after.zipBytes/before.zipBytes)*100};
const detail=[...new Set([...before.files,...after.files].map(file=>file.path))].map(path=>({path,before:before.files.find(file=>file.path===path)?.bytes||0,after:after.files.find(file=>file.path===path)?.bytes||0})).map(file=>({...file,saved:file.before-file.after})).filter(file=>file.saved).sort((a,b)=>b.saved-a.saved);
const graphs=JSON.parse(await readFile('.build/bundle-inputs.json'));
const packageBytes=new Map();
for(const graph of Object.values(graphs))for(const output of Object.values(graph.outputs))for(const [path,input]of Object.entries(output.inputs)){
 if(!path.includes('node_modules/'))continue;
 const parts=path.split('/node_modules/').pop().replace(/^node_modules\//,'').split('/'),name=parts[0].startsWith('@')?parts.slice(0,2).join('/'):parts[0];
 packageBytes.set(name,(packageBytes.get(name)||0)+input.bytesInOutput);
}
const dependencies=[...packageBytes].map(([name,bytes])=>({name,bytes})).sort((a,b)=>b.bytes-a.bytes);
await writeFile('output/bundle-size-comparison.json',JSON.stringify({before,after,diff,detail,dependencies},null,2)+'\n');
console.log(JSON.stringify({before:{appBytes:before.appBytes,zipBytes:before.zipBytes},after:{appBytes:after.appBytes,zipBytes:after.zipBytes},diff,dependencies:dependencies.slice(0,12)},null,2));
