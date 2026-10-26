import {readdir,readFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {digest} from './dependency-inventory.mjs';
const rootFiles=new Set(['README.md','CHANGELOG.md','THIRD_PARTY_NOTICES.md','LICENSE','NOTICE','PRIVACY.md','CONTRIBUTING.md','SECURITY.md','ASSET_PROVENANCE.md','SOURCE_AVAILABILITY.md','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','app.build.json','update.config.json','.node-version','.gitignore','.gitattributes']);
const trees=new Set(['src','scripts','tests','legal','licenses','vendor','assets','docs','.github','updates']);
const textExtensions=new Set(['.py','.md','.txt','.json','.yaml','.yml','.mjs','.js','.swift','.sh','.html','.css','.scss','.svg','.xml','.plist','.ts']);
const policy=JSON.parse(await readFile(new URL('../../legal/source-policy.json',import.meta.url),'utf8'));
const documentation=new Set(policy.documentation),localOnlyScripts=new Set(policy.localOnlyScripts);
export function sourceAllowed(file,assets=new Set()){
 const parts=file.split('/');if(parts.some(p=>p==='..'||p==='.DS_Store'||p.startsWith('._')||['node_modules','.git','.build','dist','output','.release','design'].includes(p)))return false;
 if(/(?:^|\/)\.env(?:\.|$)|\.(?:p12|p8|pem|key|keychain|keychain-db|mobileprovision)$/i.test(file))return false;
 if(rootFiles.has(file))return true;if(!trees.has(parts[0]))return false;
 if(localOnlyScripts.has(file))return false;
 if(parts[0]==='docs'&&parts[1]!=='screenshots')return parts.length===2&&documentation.has(parts[1]);
 if(parts[0]==='assets'||parts[0]==='docs'&&parts[1]==='screenshots')return assets.has(file);
 if(parts[0]==='docs'&&parts[1]==='design')return false;
 return textExtensions.has(path.extname(file))||/^(?:licen[sc]e|copying|notice)(?:\.[a-z0-9-]+)?$/i.test(path.basename(file));
}
export function sensitiveFindings(file,text,home=os.homedir()){
 const patterns=[['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],['github-token',/\b(?:gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g],['aws-access-key',/\bAKIA[0-9A-Z]{16}\b/g]];
 const findings=[];for(const [kind,pattern]of patterns)for(const m of text.matchAll(pattern))findings.push({file,kind,line:text.slice(0,m.index).split('\n').length});
 if(home.length>4&&text.includes(home+'/'))findings.push({file,kind:'local-home-path',line:text.slice(0,text.indexOf(home+'/')).split('\n').length});return findings;
}
export async function sourceManifest(root='.'){
 const provenance=JSON.parse(await readFile(path.join(root,'legal/public-assets.json'),'utf8')),assets=new Map(provenance.files.map(f=>[f.path,f])),files=[],findings=[];
 async function walk(dir=''){
  for(const entry of await readdir(path.join(root,dir),{withFileTypes:true})){
   const relative=dir?`${dir}/${entry.name}`:entry.name,absolute=path.join(root,relative);
   if(entry.isSymbolicLink()&&(trees.has(relative.split('/')[0])||rootFiles.has(relative)))throw Error(`Source symlink rejected: ${relative}`);
   if(entry.isDirectory()){const parts=relative.split('/');if(parts.length===1&&!trees.has(relative))continue;if(parts.some(p=>['node_modules','.git','.build','dist','output','.release','design'].includes(p)))continue;await walk(relative);}
   else if(sourceAllowed(relative,new Set(assets.keys()))){if((await lstat(absolute)).isSymbolicLink())throw Error(`Source symlink rejected: ${relative}`);const bytes=await readFile(absolute);if(assets.has(relative)&&assets.get(relative).sha256!==digest(bytes))throw Error(`Public asset changed without review: ${relative}`);if(textExtensions.has(path.extname(relative))||rootFiles.has(relative)||/^(?:licen[sc]e|copying|notice)(?:\.[a-z0-9-]+)?$/i.test(entry.name))findings.push(...sensitiveFindings(relative,new TextDecoder('utf-8',{fatal:true}).decode(bytes)));files.push({path:relative,bytes:bytes.length,sha256:digest(bytes)});}
  }
 }
 await walk();files.sort((a,b)=>a.path.localeCompare(b.path));if(findings.length)throw Error('Source privacy/secret findings (values redacted): '+JSON.stringify(findings));
 for(const required of rootFiles)if(!files.some(file=>file.path===required))throw Error(`Required source file missing: ${required}`);
 for(const asset of assets.keys())if(!files.some(f=>f.path===asset))throw Error(`Reviewed asset missing from source selection: ${asset}`);
 return {schemaVersion:1,scope:'Explicit source allowlist; history/design/generated output and unreviewed binary assets excluded. Not a secret detector completeness guarantee.',files};
}
