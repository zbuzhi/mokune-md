#!/usr/bin/env python3
"""Local-only Sparkle integration test. Uses the authorized Keychain key without exporting it.
HTTP/ATS exceptions and the synthetic app exist only in .build, never in production.
"""
from pathlib import Path
import functools, http.server, json, plistlib, shutil, subprocess, tempfile, threading, time, uuid, sys
from xml.sax.saxutils import escape
root=Path(__file__).resolve().parent.parent
metadata=json.loads((root/'legal/sparkle.json').read_text());config=json.loads((root/'update.config.json').read_text())
cache=root/f'.build/sparkle-{metadata["version"]}';tools=cache/'bin'
qa=Path(tempfile.mkdtemp(prefix='update-runtime-',dir=root/'.build'));print(f'QA evidence: {qa}',flush=True)
subprocess.run(['swiftc','-swift-version','5','-module-cache-path',str(root/'.build/module-cache'),'-F',str(cache),'-framework','Sparkle','-framework','AppKit','-Xlinker','-rpath','-Xlinker','@executable_path/../Frameworks',str(root/'tests/update-runtime/main.swift'),'-o',str(qa/'driver')],check=True)
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(qa)))
threading.Thread(target=server.serve_forever,daemon=True).start();port=server.server_address[1]
try:
 for scenario in (sys.argv[1:] or ['empty','network','tampered-feed','tampered-archive','cancel','success']):
    work=qa/scenario;work.mkdir();app=work/'installed/Mokune Update QA.app';candidate=work/'candidate/Mokune Update QA.app'
    bundle_id='local.mokune.update-qa.'+uuid.uuid4().hex
    for destination,version in [(app,'30'),(candidate,'31')]:
        (destination/'Contents/MacOS').mkdir(parents=True);(destination/'Contents/Frameworks').mkdir()
        shutil.copy2(qa/'driver',destination/'Contents/MacOS/Driver')
        subprocess.run(['ditto',str(cache/'Sparkle.framework'),str(destination/'Contents/Frameworks/Sparkle.framework')],check=True)
        feed=f'http://127.0.0.1:{port}/{scenario}/appcast.xml' if scenario!='network' else f'http://127.0.0.1:{port}/{scenario}/missing.xml'
        info={'CFBundleIdentifier':bundle_id,'CFBundleExecutable':'Driver','CFBundleName':'Mokune Update QA','CFBundlePackageType':'APPL','CFBundleVersion':version,'CFBundleShortVersionString':'0.1.0' if version=='30' else '0.1.1','LSMinimumSystemVersion':'13.3','QAResultPath':str(work),'QAScenario':scenario,'SUFeedURL':feed,'SUPublicEDKey':config['publicKey'],'SUEnableAutomaticChecks':False,'SUAutomaticallyUpdate':False,'SUAllowsAutomaticUpdates':False,'SUEnableSystemProfiling':False,'SUVerifyUpdateBeforeExtraction':True,'SURequireSignedFeed':True,'NSAppTransportSecurity':{'NSAllowsArbitraryLoads':True}}
        (destination/'Contents/Info.plist').write_bytes(plistlib.dumps(info))
        subprocess.run(['codesign','--force','--sign','-',str(destination/'Contents/Frameworks/Sparkle.framework')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        subprocess.run(['codesign','--force','--sign','-',str(destination)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    archive=work/'update.zip';subprocess.run(['ditto','-c','-k','--sequesterRsrc','--keepParent',str(candidate),str(archive)],check=True)
    signature=subprocess.check_output([str(tools/'sign_update'),'--account',config['keychainAccount'],'-p',str(archive)],text=True).strip()
    item='' if scenario=='empty' else f'<item><title>0.1.1</title><sparkle:version>31</sparkle:version><sparkle:shortVersionString>0.1.1</sparkle:shortVersionString><enclosure url="http://127.0.0.1:{port}/{scenario}/update.zip" length="{archive.stat().st_size}" type="application/octet-stream" sparkle:edSignature="{escape(signature)}"/></item>'
    feedfile=work/'appcast.xml';feedfile.write_text(f'<?xml version="1.0" encoding="utf-8"?><rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"><channel><title>Local QA</title>{item}</channel></rss>')
    subprocess.run([str(tools/'sign_update'),'--account',config['keychainAccount'],str(feedfile)],check=True,stdout=subprocess.DEVNULL)
    if scenario=='tampered-feed':feedfile.write_bytes(feedfile.read_bytes().replace(b'Local QA',b'TAMPERED QA'))
    if scenario=='tampered-archive':
        with archive.open('ab') as stream:stream.write(b'tampered')
    with (work/'process.log').open('w') as output:
        process=subprocess.Popen([str(app/'Contents/MacOS/Driver')],stdout=output,stderr=output)
        deadline=time.monotonic()+50
        while time.monotonic()<deadline and not (work/'result').exists():time.sleep(.2)
        if not (work/'result').exists():
            process.terminate();print((work/'process.log').read_text());raise RuntimeError(f'{scenario}: timeout')
        outcome=(work/'result').read_text();print(f'{scenario}: {outcome}',flush=True)
        if outcome!='PASS':print((work/'events.log').read_text());print((work/'process.log').read_text());raise RuntimeError(f'{scenario}: failed')
        try:process.wait(timeout=5)
        except subprocess.TimeoutExpired:process.terminate()
    installed=plistlib.loads((app/'Contents/Info.plist').read_bytes())['CFBundleVersion']
    if scenario=='success':assert installed=='31' and (work/'session').read_text()=='session preserved'
    else:assert installed=='30'
 print('All requested local Sparkle runtime scenarios passed; no binary or private key uploaded.',flush=True)
finally:server.shutdown()
