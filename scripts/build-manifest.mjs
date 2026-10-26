import {bundleFiles} from './lib/bundle-files.mjs';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {digest} from './lib/dependency-inventory.mjs';
const app=process.argv[2],architecture=process.argv[3];if(!app||!architecture)throw Error('Expected application and architecture');const pkg=JSON.parse(await readFile('package.json','utf8')),build=JSON.parse(await readFile('app.build.json','utf8'));
const files=await bundleFiles(app);
const report={version:pkg.version,build:build.build,bundleIdentifier:build.bundleIdentifier,architecture,minimumSystemVersion:build.minimumSystemVersion,signature:'ad-hoc',notarized:false,published:false,node:process.version,pnpm:execFileSync('pnpm',['--version'],{encoding:'utf8'}).trim(),xcode:execFileSync('xcodebuild',['-version'],{encoding:'utf8'}).trim(),swift:execFileSync('xcrun',['swiftc','--version'],{encoding:'utf8'}).trim(),lockSHA256:digest(await readFile('pnpm-lock.yaml')),sbomSHA256:digest(await readFile('legal/sbom.cdx.json')),files};await writeFile('dist/build-manifest.json',JSON.stringify(report,null,2)+'\n');
