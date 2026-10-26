import {readFile,readdir,readlink,realpath} from 'node:fs/promises';
import path from 'node:path';
import {digest} from './dependency-inventory.mjs';
// Framework symlinks are required by macOS; source exports still reject all symlinks.
export async function bundleFiles(app){
 const root=await realpath(app),files=[];
 async function walk(dir=''){
  for(const entry of await readdir(path.join(root,dir),{withFileTypes:true})){
   const relative=path.join(dir,entry.name),file=path.join(root,relative);
   if(entry.isDirectory())await walk(relative);
   else if(entry.isFile())files.push({path:relative,sha256:digest(await readFile(file))});
   else if(entry.isSymbolicLink()){
    const target=await readlink(file),resolved=await realpath(file);
    if(path.isAbsolute(target)||!resolved.startsWith(root+path.sep))throw Error(`Bundle symlink escapes application: ${relative}`);
    files.push({path:relative,kind:'symlink',target,sha256:digest(target)});
   }else throw Error(`Unexpected bundle entry: ${relative}`);
  }
 }
 await walk();return files.sort((a,b)=>a.path.localeCompare(b.path));
}
