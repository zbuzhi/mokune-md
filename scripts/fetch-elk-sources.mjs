// Explicit source-material download; normal builds use reviewed metadata only.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {digest} from './lib/dependency-inventory.mjs';
const source=JSON.parse(await readFile('legal/elk-source.json','utf8')),java=JSON.parse(await readFile('legal/elk-java-components.json','utf8')),root='.build/license-evidence/elk-java';await mkdir(root,{recursive:true});
const files=[...java.sourceArtifacts,...java.components,{file:source.archiveFile,url:source.archiveURL,sha256:source.archiveSHA256}];
for(const entry of files){
 const url=new URL(entry.url);if(url.protocol!=='https:'||url.username||url.password||!['codeload.github.com','github.com','repo.maven.apache.org'].includes(url.hostname)||!/^[-.A-Za-z0-9_]+$/.test(entry.file)||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('Invalid source download metadata');
 const file=path.join(root,entry.file);let valid=false;try{valid=digest(await readFile(file))===entry.sha256;}catch(error){if(error.code!=='ENOENT')throw error;}
 if(!valid){execFileSync('curl',['--fail','--location','--silent','--show-error','--connect-timeout','20','--max-time','180',entry.url,'-o',file],{stdio:'inherit'});}
 const bytes=await readFile(file);if(bytes.length>50*1024*1024||digest(bytes)!==entry.sha256)throw Error(`Source checksum differs: ${entry.file}`);
}
for(const [file,target]of [['SOURCE_AVAILABILITY.md','SOURCE_AVAILABILITY.md'],['legal/elk-java-build-inputs.md','BUILD-INPUTS.md'],['legal/elk-java-components.json','components.json'],['licenses/elk-java-notices.txt','NOTICES.txt'],['licenses/EPL-1.0.txt','EPL-1.0.txt']])await writeFile(path.join(root,target),await readFile(file));
await writeFile(path.join(root,'SHA256SUMS.txt'),files.map(f=>`${f.sha256}  ${f.file}`).join('\n')+'\n');
console.log(`Verified ${files.length} preferred-source artifacts in ${root}; no Java execution or installation.`);
