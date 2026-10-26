#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .build/module-cache
QA_DIR=$(mktemp -d "$PWD/.build/resources-app.XXXXXX")
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
s+='\n'+(root/'tests/resources-app/driver.swift').read_text()
(out/'main.swift').write_text(s)
PY
python3 - "$QA_DIR" <<'COPY'
import pathlib,sys
root=pathlib.Path.cwd();out=pathlib.Path(sys.argv[1])
for source in (root/'src/native').glob('*.swift'):
 if source.name=='main.swift':continue
 s=source.read_text()
 if source.name=='ResourceIntegration.swift':
  s=s.replace('let response=alert.runModal()','let response:NSApplication.ModalResponse = .alertFirstButtonReturn')
  s=s.replace('let response=panel.runModal()','let response:NSApplication.ModalResponse = .OK').replace('let source=panel.url','let source=Optional(qaRoot.appendingPathComponent("source.pdf"))')
 if source.name=='ImageImportIntegration.swift':
  s=s.replace('let response=panel.runModal()','let response:NSApplication.ModalResponse = .OK').replace('let source=panel.url','let source=Optional(qaRoot.appendingPathComponent("new.svg"))')
 s=s.replace('NSWorkspace.shared.activateFileViewerSelecting([url])','qaRevealed=url')
 (out/source.name).write_text(s)
COPY
SOURCES=()
for SOURCE in "$QA_DIR"/*.swift; do
  if [[ "$SOURCE" != "$QA_DIR/main.swift" ]]; then SOURCES+=("$SOURCE"); fi
done
swiftc -swift-version 5 -module-cache-path .build/module-cache -framework AppKit -framework WebKit -framework UniformTypeIdentifiers "${SOURCES[@]}" "$QA_DIR/main.swift" -o "$QA_DIR/resources-qa"
"$QA_DIR/resources-qa" "$QA_DIR"
