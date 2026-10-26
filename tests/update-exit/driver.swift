let qaRoot=URL(fileURLWithPath:ProcessInfo.processInfo.arguments[1])
let qaScenario=ProcessInfo.processInfo.arguments[2]
var qaOwner:AppDelegate?
var qaExpected="原始文稿\r\n"
func qaCheck(_ condition:Bool,_ message:String){guard condition else{fputs("FAIL: \(message)\n",stderr);exit(1)};print("PASS: \(message)")}
func qaTerminationReply(_ allowed:Bool){
    guard let owner=qaOwner else{fatalError("Missing owner")}
    qaCheck(!owner.terminationPending,"termination reply clears pending state")
    if qaScenario=="clean" {
        qaCheck(allowed,"clean update termination waits for editor handshake then succeeds")
        do{let archive=try SessionArchive.decode(Data(contentsOf:owner.sessionURL));qaCheck(archive.tabs.map{$0.id}==["a","b"] && archive.active=="a","termination flush preserves all tabs, order and active document")}
        catch{fatalError("session flush: \(error)")}
    }else{
        qaCheck(!allowed && !owner.allowClose,"cancel or persistence failure prevents update termination")
        qaCheck(owner.documents[0].raw==qaExpected && owner.documents.count==2,"canceled update preserves document bytes and tabs")
    }
    exit(0)
}
func updateHarnessReady(_ owner:AppDelegate){qaOwner=owner;Task{@MainActor in
    let a=DocumentSession(id:"a"),b=DocumentSession(id:"b");a.raw="原始文稿\r\n";a.baseline=Data(a.raw!.utf8);b.raw="第二份";b.baseline=Data(b.raw!.utf8);owner.documents=[a,b];owner.activateDocument(a)
    try? await Task.sleep(nanoseconds:400_000_000)
    qaCheck(owner.appUpdates?.available==true,"real Sparkle controller starts from configured application metadata")
    let entries=NSApp.mainMenu!.items[0].submenu!.items
    qaCheck(entries.contains{$0.title=="检查更新…"} && entries.contains{$0.title=="自动检查更新"},"configured update actions appear in application menu")
    if qaScenario=="web-composition" {
        _ = try? await owner.webView.evaluateJavaScript("document.querySelector('.cm-content').dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'ni'}))")
        owner.inputComposing=false // Simulate the native flag lagging behind the web editor.
    }
    if qaScenario=="composition" {
        owner.inputComposing=true
        qaCheck(owner.applicationShouldTerminate(NSApp) == .terminateCancel,"active Chinese composition immediately refuses update termination")
        qaCheck(!owner.terminationPending && owner.documents[0].raw=="原始文稿\r\n","composition guard preserves source and exit state");exit(0)
    }
    if qaScenario=="cancel"{
        _ = try? await owner.webView.evaluateJavaScript("document.execCommand('insertText',false,'未保存')")
        try? await Task.sleep(nanoseconds:400_000_000)
        qaCheck(a.dirty,"real editor insertion marks the document unsaved before installation")
        qaExpected=(try? await owner.webView.evaluateJavaScript("window.mokune.snapshot().raw")) as? String ?? ""
    }
    if qaScenario=="diskfail"{try? FileManager.default.removeItem(at:qaRoot);try? Data("blocking file".utf8).write(to:qaRoot)}
    qaCheck(owner.applicationShouldTerminate(NSApp) == .terminateLater,"updater termination is deferred until editor and unsaved-document checks complete")
}}
let app=NSApplication.shared
app.setActivationPolicy(.accessory)
try? FileManager.default.createDirectory(at:qaRoot,withIntermediateDirectories:true)
let delegate=AppDelegate();app.delegate=delegate
DispatchQueue.main.asyncAfter(deadline:.now()+25){fputs("Update exit QA timeout\n",stderr);exit(1)}
app.run()
