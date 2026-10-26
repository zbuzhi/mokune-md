import {spawnSync} from 'node:child_process';
import path from 'node:path';
export function binaryEvidence(app){
 if(!app)return {provided:false};if(process.platform!=='darwin')throw Error('macOS required for signature evidence');app=path.resolve(app);if(!app.endsWith('.app'))throw Error('Expected an .app directory');
 const details=spawnSync('/usr/bin/codesign',['-dv','--verbose=4',app],{encoding:'utf8'}),text=details.stderr||'',developerID=/Authority=Developer ID Application:/.test(text),runtime=/flags=.*\bruntime\b/.test(text),verified=spawnSync('/usr/bin/codesign',['--verify','--deep','--strict',app],{encoding:'utf8'}).status===0;
 const info={};for(const [key,name]of [['CFBundleShortVersionString','version'],['CFBundleVersion','build'],['CFBundleIdentifier','bundleIdentifier']]){const result=spawnSync('/usr/libexec/PlistBuddy',['-c',`Print :${key}`,path.join(app,'Contents/Info.plist')],{encoding:'utf8'});if(result.status!==0)throw Error('Cannot read app identity metadata');info[name]=result.stdout.trim();}
 const staple=developerID&&runtime&&verified?spawnSync('/usr/bin/xcrun',['stapler','validate',app],{encoding:'utf8'}).status===0:false;
 return {provided:true,...info,developerID,hardenedRuntime:runtime,signatureVerified:verified,stapledTicketValidated:staple};
}
