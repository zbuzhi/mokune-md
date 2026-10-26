import {readFile,writeFile} from 'node:fs/promises';
import {validateUpdateConfig} from './lib/update-config.mjs';
let updates=null;try{updates=validateUpdateConfig(JSON.parse(await readFile('update.config.json','utf8')));}catch(error){if(error.code!=='ENOENT')throw error;}
const escapeXML=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\"','&quot;');
const updateXML=updates?`<key>SUFeedURL</key><string>${escapeXML(updates.feedURL)}</string>
<key>SUPublicEDKey</key><string>${updates.publicKey}</string>
<key>SUEnableAutomaticChecks</key><false/>
<key>SUAutomaticallyUpdate</key><false/>
<key>SUAllowsAutomaticUpdates</key><false/>
<key>SUEnableSystemProfiling</key><false/>
<key>SUEnableJavaScript</key><false/>
<key>SUVerifyUpdateBeforeExtraction</key><true/>
<key>SURequireSignedFeed</key><true/>
<key>SUSignedFeedFailureExpirationInterval</key><integer>0</integer>`:'';
const pkg=JSON.parse(await readFile('package.json','utf8')),build=JSON.parse(await readFile('app.build.json','utf8'));
if(!/^\d+\.\d+\.\d+$/.test(pkg.version)||!Number.isSafeInteger(build.build)||build.build<1||!/^\d+\.\d+$/.test(build.minimumSystemVersion)||!/^[-A-Za-z0-9.]+$/.test(build.bundleIdentifier))throw Error('Invalid app version/build metadata');
const xml=`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Mokune MD</string>
<key>CFBundleDisplayName</key><string>Mokune MD</string>
<key>CFBundleIdentifier</key><string>${build.bundleIdentifier}</string>
<key>CFBundleExecutable</key><string>Mokune</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleIconFile</key><string>Mokune.icns</string>
<key>CFBundleShortVersionString</key><string>${pkg.version}</string>
<key>CFBundleVersion</key><string>${build.build}</string>
${updateXML}
<key>NSHighResolutionCapable</key><true/>
<key>LSMinimumSystemVersion</key><string>${build.minimumSystemVersion}</string>
<key>NSPrincipalClass</key><string>NSApplication</string>
<key>CFBundleDocumentTypes</key><array><dict><key>CFBundleTypeName</key><string>Markdown 文稿</string><key>CFBundleTypeRole</key><string>Editor</string><key>LSHandlerRank</key><string>Alternate</string><key>CFBundleTypeExtensions</key><array><string>md</string><string>markdown</string></array></dict></array>
</dict></plist>\n`;
if(!process.argv[2])throw Error('Expected output Info.plist path');await writeFile(process.argv[2],xml);
