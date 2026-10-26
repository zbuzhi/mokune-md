#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .build/module-cache output
PERFORMANCE_DIR=$(mktemp -d "$PWD/.build/performance-native.XXXXXX")
trap 'rm -rf "$PERFORMANCE_DIR"' EXIT
node --input-type=module -e 'import {fixtures} from "./tests/performance-fixtures.mjs";import{writeFileSync}from"node:fs";writeFileSync(".build/performance-fixtures.json",JSON.stringify(fixtures));'
python3 - "$PERFORMANCE_DIR" <<'PY'
import pathlib,sys
out=pathlib.Path(sys.argv[1]);root=pathlib.Path.cwd()
for path in (root/'src/native').glob('*.swift'):
 s=path.read_text().replace('UserDefaults.standard','performanceDefaults')
 if path.name=='main.swift':
  s=s[:s.index('let app = NSApplication.shared')]
  s=s.replace('import Carbon','import Carbon\nlet performanceProcessStart=ProcessInfo.processInfo.systemUptime')
  s=s.replace('FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Mokune/recovery.json")','performanceDirectory.appendingPathComponent("recovery.json")')
  s=s.replace('let config = WKWebViewConfiguration()','let config = WKWebViewConfiguration();config.websiteDataStore = .nonPersistent();config.userContentController.addUserScript(WKUserScript(source:"localStorage.setItem(\'mokune.settings\',JSON.stringify({autoSave:false,rememberPosition:false}));",injectionTime:.atDocumentStart,forMainFrameOnly:true))')
  s=s.replace('Bundle.main.resourceURL',f'Optional(URL(fileURLWithPath:{str(root / "dist")!r}))'.replace("'",'"'))
  s=s.replace('NSApp.activate(ignoringOtherApps: true)','/* Keep user application focus. */')
  s=s.replace('window.setFrameAutosaveName("Mokune.MainWindow")','/* Do not alter user window defaults. */')
  s=s.replace('        case "quitReady": closeAllDocuments()','            performanceHarnessReady(self)\n        case "quitReady": closeAllDocuments()')
  s+='\n'+(root/'tests/performance-native/driver.swift').read_text()
 (out/path.name).write_text(s)
PY
swiftc -O -swift-version 5 -module-cache-path .build/module-cache -framework AppKit -framework WebKit -framework UniformTypeIdentifiers "$PERFORMANCE_DIR"/*.swift -o "$PERFORMANCE_DIR/performance-qa"
python3 - "$PERFORMANCE_DIR" "${PERF_LABEL:-after}" <<'PY'
import pathlib,subprocess,json,time,sys
root=pathlib.Path(sys.argv[1]);label=sys.argv[2];records=[]
for phase in ['cold']*5+['stress']:
 folder=root/str(len(records));folder.mkdir();output=folder/'report.json';start=time.perf_counter()
 subprocess.run([str(root/'performance-qa'),str(folder),phase,str(output)],check=True,timeout=125)
 report=json.loads(output.read_text());report['wallProcessMs']=(time.perf_counter()-start)*1000;report['phase']=phase;records.append(report)
 print(json.dumps({'phase':phase,'readyMs':report['readyFromProcessGlobalMs'],'wallMs':report['wallProcessMs']}),flush=True)
pathlib.Path(f'output/native-performance-{label}.json').write_text(json.dumps({'label':label,'runs':records},ensure_ascii=False,indent=2))
print('Native cold/stress process checks passed: 6')
PY
