import {readdir,readFile,stat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parse} from 'yaml';
export const digest=data=>createHash('sha256').update(data).digest('hex');
const reviewed=new Set(['MIT','Apache-2.0','PSF-2.0','ISC','BSD-3-Clause','BSD-2-Clause','Unlicense','EPL-2.0','(MPL-2.0 OR Apache-2.0)']);
export function validateManifest(manifest,lock){
 for(const section of ['dependencies','devDependencies']){
  if(JSON.stringify(Object.keys(manifest[section]||{}).sort())!==JSON.stringify(Object.keys(lock.importers?.['.']?.[section]||{}).sort()))throw Error(`Lockfile drift: ${section} package names`);
  for(const [name,specifier]of Object.entries(manifest[section]||{})){
  const entry=lock.importers?.['.']?.[section]?.[name];if(!entry||entry.specifier!==specifier)throw Error(`Lockfile drift: ${section}/${name}`);
  }
 }
}
export async function dependencyInventory(){
 const lockBytes=await readFile('pnpm-lock.yaml'),lock=parse(lockBytes.toString()),manifest=JSON.parse(await readFile('package.json','utf8'));validateManifest(manifest,lock);
 const keys=new Map(Object.entries(lock.packages||{}).map(([key,value])=>[key.replaceAll('/','+'),{key,value}])),rows=new Map(),directories=new Map();
 for(const entry of await readdir('node_modules/.pnpm',{withFileTypes:true})){
  if(!entry.isDirectory())continue;const locked=keys.get(entry.name.replace(/\(.*/,''))||[...keys].find(([key])=>entry.name.startsWith(key+'_'))?.[1];if(!locked)continue;
  const index=locked.key.lastIndexOf('@'),name=locked.key.slice(0,index),version=locked.key.slice(index+1),root=`node_modules/.pnpm/${entry.name}/node_modules/${name}`,pkg=JSON.parse(await readFile(`${root}/package.json`,'utf8'));
  if(pkg.name!==name||pkg.version!==version)throw Error(`Installed package differs from lock: ${root}`);
  const id=`${name}@${version}`;directories.set(await realpath(root),id);if(rows.has(id))continue;
  const files=(await readdir(root)).filter(file=>/^(licen[sc]e|copying|notice)([.-]|$)/i.test(file)),licenses=[];
  for(const file of files)if((await stat(`${root}/${file}`)).isFile()){const bytes=await readFile(`${root}/${file}`);licenses.push({file,sha256:digest(bytes),text:bytes.toString()});}
  if(!licenses.length&&name.startsWith('@esbuild/')){const bytes=await readFile('node_modules/esbuild/LICENSE.md');licenses.push({file:'esbuild/LICENSE.md (platform binary shares main package license)',sha256:digest(bytes),text:bytes.toString()});}
  const license=pkg.license||(name==='khroma'&&licenses.some(x=>x.text.includes('The MIT License (MIT)'))?'MIT':null);
  if(!license||!reviewed.has(license)||!licenses.length)throw Error(`License review required: ${id} (${license||'missing'})`);
  rows.set(id,{id,name,version,licenseDeclared:license,licenseSelected:name==='dompurify'?'Apache-2.0':license,repository:typeof pkg.repository==='string'?pkg.repository:pkg.repository?.url||'',integrity:locked.value.resolution?.integrity||null,licenses,bundles:[]});
 }
 if(!rows.size)throw Error('No installed dependency inventory');
 const graphs=JSON.parse(await readFile('.build/bundle-inputs.json','utf8')),packageAt=new Map();
 async function owner(file){if(!file.includes('node_modules/'))return null;const absolute=await realpath(file);if(packageAt.has(absolute))return packageAt.get(absolute);let current=path.dirname(absolute);while(current!==path.dirname(current)){if(directories.has(current)){const id=directories.get(current);packageAt.set(absolute,id);return id;}current=path.dirname(current);}throw Error(`Bundled package not inventoried: ${file}`);}
 const edges=new Map([['application:mokune-md',new Set()]]);
 for(const [bundle,graph]of Object.entries(graphs))for(const [input,details]of Object.entries(graph.inputs)){
  const id=await owner(input);if(id&&!rows.get(id).bundles.includes(bundle))rows.get(id).bundles.push(bundle);
  const from=id||'application:mokune-md';if(!edges.has(from))edges.set(from,new Set());
  for(const imported of details.imports||[]){if(imported.external)continue;const target=await owner(imported.path);if(target&&target!==from)edges.get(from).add(target);}
 }
 // Production shared-engine plugins bind Mermaid to the root renderer globals.
 const mermaid=[...rows.values()].find(p=>p.name==='mermaid'&&p.bundles.length);if(mermaid)for(const name of ['katex','dompurify']){const target=[...rows.values()].find(p=>p.name===name&&p.bundles.length);if(target)edges.get(mermaid.id)?.add(target.id);}

 for(const section of ['dependencies','devDependencies'])for(const name of Object.keys(manifest[section]||{})){
  const pkg=JSON.parse(await readFile(`node_modules/${name}/package.json`,'utf8')),expected=lock.importers['.'][section][name].version.split('(')[0];if(!rows.has(`${name}@${pkg.version}`)||pkg.version!==expected)throw Error(`Direct dependency missing or wrong version: ${name}`);
 }
 return {schemaVersion:1,application:{name:manifest.name,version:manifest.version,license:manifest.license},lockSHA256:digest(lockBytes),packageManifestSHA256:digest(await readFile('package.json')),graphsSHA256:digest(await readFile('.build/bundle-inputs.json')),dependencies:[...edges].map(([ref,targets])=>({ref,dependsOn:[...targets].sort()})).sort((a,b)=>a.ref.localeCompare(b.ref)),packages:[...rows.values()].sort((a,b)=>a.id.localeCompare(b.id))};
}
