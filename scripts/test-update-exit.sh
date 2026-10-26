#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .build/module-cache
QA_DIR=$(mktemp -d "$PWD/.build/update-exit.XXXXXX")
trap 'rm -rf "$QA_DIR"' EXIT
python3 - "$QA_DIR" <<'PY'
from pathlib import Path
import sys
root=Path.cwd();out=Path(sys.argv[1])
for source in (root/'src/native').glob('*.swift'):
    s=source.read_text()
    if source.name=='main.swift':
        s=s[:s.index('let app = NSApplication.shared')]
        s=s.replace('UserDefaults.standard','UserDefaults(suiteName:"local.mokune.update-exit-qa")!')
        s=s.replace('FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Mokune/recovery.json")','qaRoot.appendingPathComponent("recovery.json")')
        s=s.replace('let config = WKWebViewConfiguration()','let config = WKWebViewConfiguration();config.websiteDataStore = .nonPersistent()')
        s=s.replace('Bundle.main.resourceURL',f'Optional(URL(fileURLWithPath:"{root / "dist"}"))')
        s=s.replace('NSApp.activate(ignoringOtherApps: true)','/* keep user app focus */')
        a=s.index('            ready = true\n            restoreWorkspace()');b=s.index('        case "quitReady":',a)
        s=s[:a]+'            ready=true;updateHarnessReady(self)\n'+s[b:]
        s=s.replace('modalBusy=true;let response=alert.runModal();modalBusy=false','modalBusy=true;let response:NSApplication.ModalResponse = .alertSecondButtonReturn;modalBusy=false')
        s+='\n'+(root/'tests/update-exit/driver.swift').read_text()
    s=s.replace('NSApp.reply(toApplicationShouldTerminate:', 'qaTerminationReply(')
    (out/source.name).write_text(s)
PY
swiftc -swift-version 5 -module-cache-path .build/module-cache -F .build/sparkle-2.10.1 -framework Sparkle -framework AppKit -framework WebKit -framework UniformTypeIdentifiers "$QA_DIR"/*.swift -o "$QA_DIR/update-exit-qa"
python3 - "$QA_DIR" <<'PYINFO'
from pathlib import Path
import plistlib,json,sys,shutil
qa=Path(sys.argv[1]);app=qa/'Update Exit QA.app';(app/'Contents/MacOS').mkdir(parents=True)
shutil.copy2(qa/'update-exit-qa',app/'Contents/MacOS/Driver')
config=json.loads(Path('update.config.json').read_text())
info={'CFBundleIdentifier':'local.mokune.update-exit.'+qa.name.split('.')[-1], 'CFBundleName':'Update Exit QA','CFBundleExecutable':'Driver','CFBundlePackageType':'APPL','CFBundleVersion':'30','CFBundleShortVersionString':'0.1.0','SUFeedURL':config['feedURL'],'SUPublicEDKey':config['publicKey'],'SUEnableAutomaticChecks':False,'SUAutomaticallyUpdate':False,'SUEnableSystemProfiling':False,'SURequireSignedFeed':True,'SUVerifyUpdateBeforeExtraction':True}
(app/'Contents/Info.plist').write_bytes(plistlib.dumps(info))
PYINFO
for SCENARIO in clean cancel composition web-composition diskfail; do
  DYLD_FRAMEWORK_PATH="$PWD/.build/sparkle-2.10.1" "$QA_DIR/Update Exit QA.app/Contents/MacOS/Driver" "$QA_DIR/$SCENARIO" "$SCENARIO"
done
