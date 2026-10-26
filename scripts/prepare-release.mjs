import {bundleFiles} from './lib/bundle-files.mjs';
// Local draft only. Contains no GitHub, git push, upload or publishing commands.
import {mkdir,mkdtemp,rename,rm,readFile,writeFile,cp,copyFile,stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {sourceManifest} from './lib/source-package.mjs';
import {digest} from './lib/dependency-inventory.mjs';
const pkg=JSON.parse(await readFile('package.json','utf8')),build=JSON.parse(await readFile('app.build.json','utf8')),manifest=await sourceManifest(),root=path.resolve('.release'),finalDestination=path.join(root,`mokune-md-${pkg.version}-build${build.build}-draft`);
const readiness=JSON.parse(await readFile('output/release-readiness.json','utf8'));if(readiness.sourceManifestSHA256!==digest(JSON.stringify(manifest)))throw Error('Stale source readiness report; rerun release gate');
await mkdir(root,{recursive:true});try{await stat(finalDestination);throw Error('Draft destination already exists; refusing overwrite');}catch(error){if(error.code!=='ENOENT')throw error;}
const destination=await mkdtemp(path.join(root,'.staging-'));try{const source=path.join(destination,'source');await mkdir(source);
for(const file of manifest.files){const output=path.join(source,file.path);await mkdir(path.dirname(output),{recursive:true});await copyFile(file.path,output);if(digest(await readFile(output))!==file.sha256)throw Error(`Source changed during copy: ${file.path}`);}
await writeFile(path.join(destination,'source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const sourceZip=path.join(destination,`mokune-md-${pkg.version}-source-draft.zip`);execFileSync('/usr/bin/ditto',['-c','-k','--keepParent',source,sourceZip]);
const report=readiness;await writeFile(path.join(destination,'release-readiness.json'),JSON.stringify({...report,published:false},null,2)+'\n');
const hashes=[{name:path.basename(sourceZip),sha256:digest(await readFile(sourceZip))}];
if(process.argv.includes('--with-app')){
 const option=(flag,fallback)=>{const at=process.argv.indexOf(flag);if(at<0)return fallback;const value=process.argv[at+1];if(!value||value.startsWith('--'))throw Error(`Missing ${flag} value`);return value;};
 const app=option('--app','dist/Mokune MD.app'),built=JSON.parse(await readFile(option('--build-manifest','dist/build-manifest.json'),'utf8'));if(built.version!==pkg.version||built.build!==build.build)throw Error('App version/build differs from source');
 const actual=await bundleFiles(app);
 if(JSON.stringify(actual)!==JSON.stringify(built.files))throw Error('App differs from checked build manifest');
 const copy=path.join(destination,'Mokune MD.app');await cp(app,copy,{recursive:true,errorOnExist:true,force:false,verbatimSymlinks:true});
 if(JSON.stringify(await bundleFiles(copy))!==JSON.stringify(built.files))throw Error('Copied app inventory differs; framework symlinks or bytes changed');
 execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',copy]);
 const zip=path.join(destination,`mokune-md-${pkg.version}-macos-${built.architecture}-LOCAL-DRAFT.zip`);execFileSync('/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',copy,zip]);hashes.push({name:path.basename(zip),sha256:digest(await readFile(zip))});await copyFile(option('--build-manifest','dist/build-manifest.json'),path.join(destination,'build-manifest.json'));
 const elk=JSON.parse(await readFile('legal/elk-source.json','utf8')),archive=path.join('.build/license-evidence',elk.archiveFile);if(digest(await readFile(archive))!==elk.archiveSHA256)throw Error('Missing or changed ELK evidence archive');await mkdir(path.join(destination,'source-evidence'));await copyFile(archive,path.join(destination,'source-evidence',elk.archiveFile));hashes.push({name:'source-evidence/'+elk.archiveFile,sha256:elk.archiveSHA256});
}
for(const name of ['source-manifest.json','release-readiness.json',...(process.argv.includes('--with-app')?['build-manifest.json']:[])])hashes.push({name,sha256:digest(await readFile(path.join(destination,name)))});
await writeFile(path.join(destination,'SHA256SUMS.txt'),hashes.map(item=>`${item.sha256}  ${item.name}`).join('\n')+'\n');
await writeFile(path.join(destination,'DRAFT-NOT-PUBLISHED.txt'),'Local review material only. Public source and binary blockers are in release-readiness.json. Ad-hoc app is not a notarized release. No repository was created, no tag pushed, no release uploaded.\n');
await rename(destination,finalDestination);console.log(JSON.stringify({destination:finalDestination,files:manifest.files.length,hashes,published:false},null,2));

}catch(error){await rm(destination,{recursive:true,force:true});throw error;}
