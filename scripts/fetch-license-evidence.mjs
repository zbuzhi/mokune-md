// Explicit network step; normal builds and checks use the recorded local data.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=data=>createHash('sha256').update(data).digest('hex'),root='.build/license-evidence';await mkdir(root,{recursive:true});
async function get(url,file,max=30*1024*1024){const response=await fetch(url);if(!response.ok)throw Error(`${response.status}: ${url}`);const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>max)throw Error('Evidence download exceeds limit');await writeFile(file,bytes);return bytes;}
let existingELK=null;try{existingELK=JSON.parse(await readFile('legal/elk-source.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const themes=[];
for(const source of JSON.parse(await readFile('vendor/themes/sources.json','utf8'))){
 const repo=source.repository.replace('https://github.com/',''),files=[];await mkdir(`${root}/${source.id}`,{recursive:true});
 for(const name of ['LICENSE',...source.files]){
  const url=`https://raw.githubusercontent.com/${repo}/${source.revision}/${name}`,bytes=await get(url,`${root}/${source.id}/${name}`),local=await readFile(`vendor/themes/${source.id}/${name}`);
  if(!bytes.equals(local))throw Error(`Upstream differs: ${source.id}/${name}`);files.push({path:name,url,sha256:sha(bytes)});
 }
 themes.push({...source,files,verifiedDate:'2026-10-26'});
}
await writeFile('legal/theme-provenance.json',JSON.stringify(themes,null,2)+'\n');
const commit='a8304cf79fde75bc2ab1a89d28320f53f8637436',url=`https://codeload.github.com/kieler/elkjs/tar.gz/${commit}`,archive=`${root}/elkjs-${commit}.tar.gz`,bytes=await get(url,archive);
const manifest={package:'elkjs',version:'0.9.3',license:'EPL-2.0',commit,archiveURL:url,archiveFile:`elkjs-${commit}.tar.gz`,archiveSHA256:sha(bytes),repository:`https://github.com/kieler/elkjs/tree/${commit}`,preferredSourceStatus:'elkjs-wrapper-and-build-scripts-archived; upstream-ELK-Java-revision-unverified',elkJavaRevision:null,verifiedDate:'2026-10-26',bundledFile:{path:'lib/elk.bundled.js',gitBlobSHA1:'5e77ca50087cf50f52eeb732490fbe33d9eaf8c8'}};
const local=await readFile('node_modules/.pnpm/elkjs@0.9.3/node_modules/elkjs/lib/elk.bundled.js');manifest.bundledFile.sha256=sha(local);const blob=createHash('sha1').update(`blob ${local.length}\0`).update(local).digest('hex');if(blob!==manifest.bundledFile.gitBlobSHA1)throw Error('Installed ELK differs from pinned upstream tag');
if(existingELK?.commit===commit){manifest.elkJavaRevision=existingELK.elkJavaRevision;if(existingELK.javaBuildInputsNoticeSHA256){manifest.javaBuildInputsNoticeSHA256=existingELK.javaBuildInputsNoticeSHA256;manifest.preferredSourceStatus=existingELK.preferredSourceStatus;}}
await writeFile('legal/elk-source.json',JSON.stringify(manifest,null,2)+'\n');console.log('Theme byte provenance verified; ELK wrapper archive downloaded and npm artifact matched to upstream Git blob. Java source correspondence remains unverified.');
