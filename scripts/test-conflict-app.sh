#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .build/module-cache
QA_DIR=$(mktemp -d "$PWD/.build/conflict-app.XXXXXX")
trap 'rm -rf "$QA_DIR"' EXIT
python3 - "$QA_DIR" <<'PY'
import pathlib,sys
out=pathlib.Path(sys.argv[1]);root=pathlib.Path.cwd()
s=(root/'src/native/main.swift').read_text()
s=s[:s.index('let app = NSApplication.shared')]
s=s.replace('UserDefaults.standard','UserDefaults(suiteName: "local.mokune.session-qa")!')
s=s.replace('FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Mokune/recovery.json")','URL(fileURLWithPath:ProcessInfo.processInfo.arguments[1]).appendingPathComponent("recovery.json")')
s=s.replace('let config = WKWebViewConfiguration()','let config = WKWebViewConfiguration();config.websiteDataStore = .nonPersistent();config.userContentController.addUserScript(WKUserScript(source:"localStorage.setItem(\'mokune.settings\',JSON.stringify({autoSave:false}));",injectionTime:.atDocumentStart,forMainFrameOnly:true))')
s=s.replace('Bundle.main.resourceURL',f'Optional(URL(fileURLWithPath:{str(root / "dist")!r}))'.replace("'",'"'))
s=s.replace('NSApp.activate(ignoringOtherApps: true)','/* QA does not activate the user window. */')
a=s.index('            ready = true\n            restoreWorkspace()');b=s.index('        case "quitReady":',a)
s=s[:a]+'            ready=true;sessionHarnessReady(self)\n'+s[b:]
s=s.replace('modalBusy=true;let response=alert.runModal();modalBusy=false','modalBusy=true;let response:NSApplication.ModalResponse = .alertThirdButtonReturn;modalBusy=false')
s=s.replace('func windowWillClose(_ notification: Notification) {','func windowWillClose(_ notification: Notification) {qaWillClose(self);')
s+='\n'+(root/'tests/conflict-app/driver.swift').read_text()
(out/'main.swift').write_text(s)
PY
SOURCES=()
for SOURCE in src/native/*.swift; do
  if [[ "$SOURCE" != src/native/main.swift ]]; then SOURCES+=("$SOURCE"); fi
done
swiftc -swift-version 5 -module-cache-path .build/module-cache -framework AppKit -framework WebKit -framework UniformTypeIdentifiers "${SOURCES[@]}" "$QA_DIR/main.swift" -o "$QA_DIR/session-qa"
"$QA_DIR/session-qa" "$QA_DIR"
