// First unnotarized preview only. Writes a local candidate feed, never the live feed.
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {createPublicKey,verify} from 'node:crypto';
const directory=process.argv[2];if(!directory)throw Error('Expected local package directory');
const state=JSON.parse(await readFile('legal/release-state.json','utf8'));
if(state.binaryPublicationAuthorized!==true||state.unnotarizedPreviewPublicationAuthorized!==true)throw Error('Explicit unnotarized-preview authorization required');
execFileSync(process.execPath,['scripts/audit-bundle-licenses.mjs','--public-binary'],{stdio:'inherit'});
if((await readFile('updates/appcast.xml','utf8')).includes('<item>'))throw Error('This helper only initializes the first preview feed');
const pkg=JSON.parse(await readFile('package.json','utf8')),build=JSON.parse(await readFile('app.build.json','utf8')),config=JSON.parse(await readFile('update.config.json','utf8')),sparkle=JSON.parse(await readFile('legal/sparkle.json','utf8')),report=JSON.parse(await readFile(path.join(directory,'package-report.json'),'utf8')),signed=JSON.parse(await readFile(path.join(directory,'update-signature.json'),'utf8'));
if(report.version!==pkg.version||report.build!==build.build||report.officialSigning!==false||!signed.file.includes('UNNOTARIZED-PREVIEW')||signed.publicKey!==config.publicKey)throw Error('Preview package identity mismatch');
const bytes=await readFile(path.join(directory,signed.file)),key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(config.publicKey,'base64')]),format:'der',type:'spki'});
if(bytes.length!==signed.length||!verify(null,bytes,key,Buffer.from(signed.edSignature,'base64')))throw Error('Preview ZIP signature mismatch');
const url=`https://github.com/zbuzhi/mokune-md/releases/download/v${pkg.version}/${encodeURIComponent(signed.file)}`;
const xml=`<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"><channel>
<title>Mokune MD Updates</title><link>https://github.com/zbuzhi/mokune-md</link><description>Mokune MD preview updates</description><language>zh-CN</language>
<item><title>Mokune MD ${pkg.version} · 未公证预览版</title><pubDate>${new Date().toUTCString()}</pubDate>
<sparkle:version>${build.build}</sparkle:version><sparkle:shortVersionString>${pkg.version}</sparkle:shortVersionString><sparkle:minimumSystemVersion>${build.minimumSystemVersion}</sparkle:minimumSystemVersion>
<description><![CDATA[<p>首个公开预览版，支持即时 Markdown 编辑、主题和 HTML/PDF 导出。</p><p>本版未经过 Apple Developer ID 签名或公证，macOS 可能拦截首次打开。更新归档已使用项目 Ed25519 密钥签名。</p><p>第三方许可与对应源码附件见 <a href="https://github.com/zbuzhi/mokune-md/releases/tag/v${pkg.version}">发行页面</a>。</p>]]></description>
<enclosure url="${url}" length="${bytes.length}" type="application/octet-stream" sparkle:edSignature="${signed.edSignature}"/>
</item></channel></rss>\n`;
const output=path.join(directory,'appcast.xml');await writeFile(output,xml);
execFileSync(`.build/sparkle-${sparkle.version}/bin/sign_update`,['--account',config.keychainAccount,output],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/verify-update-feed.mjs',output],{stdio:'inherit'});
console.log(`Local candidate feed: ${output}. Publish only after the actual release downloads have been verified.`);
