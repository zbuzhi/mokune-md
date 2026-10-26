import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {validateManifest} from '../scripts/lib/dependency-inventory.mjs';
import {sourceAllowed,sensitiveFindings,sourceManifest} from '../scripts/lib/source-package.mjs';
import {releaseReadiness} from '../scripts/lib/release-readiness.mjs';
test('lockfile mismatch is rejected before notices can claim completeness',()=>{
 const pkg={dependencies:{foo:'1.0.0'}},lock={importers:{'.':{dependencies:{foo:{specifier:'1.0.0'}}}}};assert.doesNotThrow(()=>validateManifest(pkg,lock));assert.throws(()=>validateManifest({dependencies:{foo:'2.0.0'}},lock),/drift/);assert.throws(()=>validateManifest(pkg,{importers:{}}),/drift/);
});
test('source selection rejects generated output, secrets, historical images and unreviewed binaries',()=>{
 for(const file of ['dist/a.js','src/.env','src/secret.p12','docs/design/a.md','docs/NAMING.md','docs/PDF-TEST-RESULTS.json','scripts/render-design.mjs','design/a.png','node_modules/lib/a.js','docs/screenshots/private.png','tests/fixtures/private.pdf','src/../password.txt'])assert.equal(sourceAllowed(file),false,file);
 assert.equal(sourceAllowed('assets/icons/.DS_Store',new Set(['assets/icons/.DS_Store'])),false);assert.equal(sourceAllowed('assets/icons/._icon.png',new Set(['assets/icons/._icon.png'])),false);assert.equal(sourceAllowed('THIRD_PARTY_NOTICES.md'),true);
 assert.equal(sourceAllowed('src/web/editor.js'),true);assert.equal(sourceAllowed('vendor/themes/ursine/LICENSE'),true);assert.equal(sourceAllowed('docs/screenshots/demo.png',new Set(['docs/screenshots/demo.png'])),true);
});
test('privacy scan reports categories/lines while never returning secret values',()=>{
 const token='gh'+'p_'+'x'.repeat(36),text='line\n'+token+'\n'+('/Users/'+'private')+'/file.md';const findings=sensitiveFindings('src/a.js',text,'/Users/'+'private');assert.deepEqual(findings.map(x=>x.kind),['github-token','local-home-path']);assert.ok(!JSON.stringify(findings).includes(token));assert.equal(findings[0].line,2);
});
test('source release and binary release have distinct non-bypassable readiness conditions',()=>{
 const state={repository:'owner/repo',copyrightHolder:'Author',rightsConfirmed:true,brandReviewComplete:true,privateSecurityContact:'private channel',privateSecurityContactVerified:true,reviewedSourceManifestSHA256:'hash',longTermBundleIdentityConfirmed:true},audit={binaryBlockers:['EPL source incomplete']};
 let r=releaseReadiness(state,audit,'hash');assert.equal(r.sourceReady,true);assert.equal(r.publicBinaryReady,false);assert.ok(r.binaryBlockers.includes('EPL source incomplete'));
 assert.equal(releaseReadiness({...state,rightsConfirmed:'false'},{binaryBlockers:[]},'hash').sourceReady,false);assert.equal(releaseReadiness({...state,rightsConfirmed:false},{binaryBlockers:[]},'hash').sourceReady,false);assert.equal(releaseReadiness(state,{binaryBlockers:[]},'changed').sourceReady,false);
 r=releaseReadiness(state,{binaryBlockers:[]},'hash',{developerID:true,hardenedRuntime:true,signatureVerified:true,stapledTicketValidated:true});assert.equal(r.publicBinaryReady,true);
});
async function fixture(run){const root=await mkdtemp(path.join(os.tmpdir(),'mokune-release-'));try{await mkdir(path.join(root,'legal'));await writeFile(path.join(root,'legal/public-assets.json'),JSON.stringify({files:[]}));await run(root);}finally{await rm(root,{recursive:true,force:true});}}
test('source export refuses symlinks instead of following them into private files',async()=>fixture(async root=>{await mkdir(path.join(root,'src'));await writeFile(path.join(root,'target.txt'),'data');await symlink(path.join(root,'target.txt'),path.join(root,'src/escape.js'));await assert.rejects(sourceManifest(root),/symlink/);}));
test('changed public asset cannot enter the source archive under an old approval hash',async()=>fixture(async root=>{await mkdir(path.join(root,'assets'));await writeFile(path.join(root,'assets/icon.svg'),'<svg/>');await writeFile(path.join(root,'legal/public-assets.json'),JSON.stringify({files:[{path:'assets/icon.svg',sha256:'bad'}]}));await assert.rejects(sourceManifest(root),/asset changed/);}));
test('incomplete source selection fails rather than making an apparently valid empty archive',async()=>fixture(async root=>{await assert.rejects(sourceManifest(root),/Required source file missing/);}));
test('Info.plist uses version/build source of truth and rejects malformed metadata',async()=>fixture(async root=>{
 const writer=path.resolve('scripts/write-app-plist.mjs');await writeFile(path.join(root,'package.json'),JSON.stringify({version:'3.4.5'}));await writeFile(path.join(root,'app.build.json'),JSON.stringify({build:9,minimumSystemVersion:'13.3',bundleIdentifier:'local.mokune.editor'}));const output=path.join(root,'Info.plist');let result=spawnSync(process.execPath,[writer,output],{cwd:root});assert.equal(result.status,0);let xml=await readFile(output,'utf8');assert.match(xml,/<string>3\.4\.5<\/string>/);assert.match(xml,/<key>CFBundleVersion<\/key><string>9<\/string>/);await writeFile(path.join(root,'package.json'),JSON.stringify({version:'bad<xml>'}));result=spawnSync(process.execPath,[writer,output],{cwd:root});assert.notEqual(result.status,0);
}));
test('review stamp excludes only itself, so acceptance can converge and still binds ownership decisions',async()=>{
 const {sourceReviewHash}=await import('../scripts/lib/source-review.mjs'),state={rightsConfirmed:true,reviewedSourceManifestSHA256:null},manifest={schemaVersion:1,files:[{path:'src/a.js',bytes:1,sha256:'code'},{path:'legal/release-state.json',bytes:50,sha256:'initial'}]};
 const hash=sourceReviewHash(manifest,state),stamped={...state,reviewedSourceManifestSHA256:hash},changedManifest={...manifest,files:manifest.files.map(f=>f.path==='legal/release-state.json'?{...f,bytes:100,sha256:'stamped'}:f)};
 assert.equal(sourceReviewHash(changedManifest,stamped),hash);assert.notEqual(sourceReviewHash(changedManifest,{...stamped,rightsConfirmed:false}),hash);assert.notEqual(sourceReviewHash({...manifest,files:[{path:'src/a.js',bytes:1,sha256:'changed'},manifest.files[1]]},stamped),hash);
});
test('a guessed ELK revision alone never clears preferred-source review',async()=>{
 const {elkSourceReviewRecorded}=await import('../scripts/lib/elk-source-review.mjs'),source={elkJavaRevision:'a'.repeat(40)};assert.equal(elkSourceReviewRecorded(source,null),false);
 const reviewed={...source,preferredSourceStatus:'reviewed-java-source-and-build-inputs',javaBuildInputsNoticeSHA256:'b'.repeat(64)};assert.equal(elkSourceReviewRecorded(reviewed,'c'.repeat(64)),false);assert.equal(elkSourceReviewRecorded(reviewed,'b'.repeat(64)),true);
});
