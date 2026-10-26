import {readFile,mkdir,access,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {digest} from './lib/dependency-inventory.mjs';
const info=JSON.parse(await readFile('legal/sparkle.json','utf8'));
const root=`.build/sparkle-${info.version}`,archive=`${root}/Sparkle.tar.xz`;
await mkdir(root,{recursive:true});
let cached=false;try{cached=digest(await readFile(archive))===info.archiveSHA256;}catch(error){if(error.code!=='ENOENT')throw error;}
if(!cached){await rm(archive,{force:true});execFileSync('curl',['--fail','--location','--silent','--show-error','--connect-timeout','20','--max-time','300',info.archiveURL,'-o',archive],{stdio:'inherit'});}
if(digest(await readFile(archive))!==info.archiveSHA256)throw Error('Sparkle archive checksum mismatch');
// Always extract the verified distribution to prevent stale/modified cached helpers.
await rm(`${root}/Sparkle.framework`,{recursive:true,force:true});
execFileSync('/usr/bin/tar',['-xf',archive,'-C',root],{stdio:'inherit'});
if(digest(await readFile(`${root}/LICENSE`))!==digest(await readFile(info.licenseFile)))throw Error('Sparkle license differs from reviewed upstream notices');
await access(`${root}/Sparkle.framework/Sparkle`);
console.log(`Verified Sparkle ${info.version}; no update feed or release uploaded.`);
