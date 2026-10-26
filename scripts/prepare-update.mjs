// Local update materials only. Never uploads a binary, edits the live feed, or exports a private key.
import {readFile,mkdir,copyFile,mkdtemp,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {digest} from './lib/dependency-inventory.mjs';
import {validateUpdateConfig} from './lib/update-config.mjs';
import {createPublicKey,verify} from 'node:crypto';
if(!process.argv.includes('--execute')){console.log('Plan: require reviewed notarized App -> archive locally -> Sparkle generate_appcast with Keychain account -> verify archive/feed signatures -> hashes. No publication. Pass --execute --app PATH.');process.exit(0);}
const at=process.argv.indexOf('--app'),app=process.argv[at+1];if(at<0||!app||!app.endsWith('.app'))throw Error('Expected --app path to a reviewed notarized application');
const pkg=JSON.parse(await readFile('package.json','utf8')),config=JSON.parse(await readFile('update.config.json','utf8')),sparkle=JSON.parse(await readFile('legal/sparkle.json','utf8'));
if(!validateUpdateConfig(config))throw Error('Updates are not configured');
execFileSync(process.execPath,['scripts/release-gate.mjs','--public-binary','--app',app],{stdio:'inherit'});
const info=path.join(app,'Contents/Info.plist');
for(const [key,value]of [['SUFeedURL',config.feedURL],['SUPublicEDKey',config.publicKey]])if(execFileSync('/usr/libexec/PlistBuddy',['-c',`Print :${key}`,info],{encoding:'utf8'}).trim()!==value)throw Error('App update identity differs from source');
const tools=`.build/sparkle-${sparkle.version}/bin`,publicKey=execFileSync(`${tools}/generate_keys`,['--account',config.keychainAccount,'-p'],{encoding:'utf8'}).trim();
if(publicKey!==config.publicKey)throw Error('Keychain public key differs from application key');
await mkdir('.release',{recursive:true});const destination=await mkdtemp('.release/update-'),name=`mokune-md-${pkg.version}-macos-universal.zip`,archive=path.join(destination,name);
// A public archive must contain both CPU slices, not a mislabeled host-only build.
for(const arch of ['arm64','x86_64'])execFileSync('lipo',[path.join(app,'Contents/MacOS/Mokune'),'-verify_arch',arch]);
execFileSync('ditto',['-c','-k','--sequesterRsrc','--keepParent',app,archive]);
await copyFile('updates/appcast.xml',path.join(destination,'appcast.xml'));
execFileSync(`${tools}/generate_appcast`,['--account',config.keychainAccount,'--maximum-deltas','0','--download-url-prefix',`https://github.com/zbuzhi/mokune-md/releases/download/v${pkg.version}/`,'--link','https://github.com/zbuzhi/mokune-md',destination],{stdio:'inherit'});
execFileSync(`${tools}/sign_update`,['--account',config.keychainAccount,path.join(destination,'appcast.xml')],{stdio:'inherit'});
execFileSync(`${tools}/sign_update`,['--account',config.keychainAccount,'--verify',path.join(destination,'appcast.xml')],{stdio:'inherit'});
const feed=await readFile(path.join(destination,'appcast.xml'),'utf8');
const enclosure=[...feed.matchAll(/<enclosure\b[^>]*>/g)].map(m=>m[0]).find(value=>value.includes(`/v${pkg.version}/${name}`));
const signature=enclosure?.match(/sparkle:edSignature="([^"]+)"/)?.[1];
const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(config.publicKey,'base64')]),format:'der',type:'spki'});
if(!signature||!verify(null,await readFile(archive),key,Buffer.from(signature,'base64')))throw Error('Generated archive signature does not match the application public key');
await writeFile(path.join(destination,'SHA256SUMS.txt'),`${digest(await readFile(archive))}  ${name}\n${digest(await readFile(path.join(destination,'appcast.xml')))}  appcast.xml\n`);
console.log(`Local signed update materials: ${destination}. Upload the archive only under separate release authorization; update the live feed last.`);
