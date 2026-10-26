import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validateUpdateConfig} from '../scripts/lib/update-config.mjs';
import {bundleFiles} from '../scripts/lib/bundle-files.mjs';

const valid={enabled:true,feedURL:'https://example.invalid/appcast.xml',publicKey:Buffer.alloc(32,1).toString('base64')};
test('disabled updater emits no feed; enabled updater requires HTTPS and a signing public key',()=>{
 assert.equal(validateUpdateConfig({enabled:false,publicKey:null}),null);
 assert.equal(validateUpdateConfig(valid).publicKey,valid.publicKey);
 for(const feedURL of ['http://example.invalid/feed','file:///tmp/feed','https://user:pass@example.invalid/feed','https://example.invalid/feed#fragment'])assert.throws(()=>validateUpdateConfig({...valid,feedURL}));
 for(const publicKey of [null,'placeholder',Buffer.alloc(31).toString('base64')])assert.throws(()=>validateUpdateConfig({...valid,publicKey}));
 assert.throws(()=>validateUpdateConfig({...valid,enabled:'false'}));
});
test('framework inventory preserves internal symlinks and refuses external targets',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'mokune-bundle-'));
 try{
  await mkdir(path.join(root,'app/Versions/B'),{recursive:true});await writeFile(path.join(root,'app/Versions/B/Sparkle'),'binary');
  await symlink('B',path.join(root,'app/Versions/Current'));await symlink('Versions/Current/Sparkle',path.join(root,'app/Sparkle'));
  const files=await bundleFiles(path.join(root,'app'));assert.equal(files.length,3);assert.equal(files.find(f=>f.path==='Sparkle').kind,'symlink');
  await writeFile(path.join(root,'private'),'secret');await symlink('../private',path.join(root,'app/escape'));
  await assert.rejects(bundleFiles(path.join(root,'app')),/escapes application/);
 }finally{await rm(root,{recursive:true,force:true});}
});
