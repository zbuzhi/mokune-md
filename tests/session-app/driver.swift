let qaRoot=URL(fileURLWithPath:ProcessInfo.processInfo.arguments[1])
let qaPhase=ProcessInfo.processInfo.arguments[2]
func qaCheck(_ value:Bool,_ message:String){guard value else{fputs("FAIL: \(message)\n",stderr);exit(1)};print("PASS: \(message)")}
func qaPause()async{try? await Task.sleep(nanoseconds:500_000_000)}
@MainActor func qaJS(_ owner:AppDelegate,_ script:String)async throws->Any? {
    try await withCheckedThrowingContinuation{c in owner.webView.evaluateJavaScript(script){v,e in if let e=e{c.resume(throwing:e)}else{c.resume(returning:v)}}}
}
func sessionHarnessReady(_ owner:AppDelegate){Task{@MainActor in
 do{
 if qaPhase=="write" {
    let clipboard=NSPasteboard(name:NSPasteboard.Name("mokune-md-table-qa-"+UUID().uuidString));defer{clipboard.releaseGlobally()}
    let clipboardText="列一\t列二\r\n中文\t\"两行\n内容\""
    owner.copyTableText(["id":"qa-copy","text":clipboardText],to:clipboard)
    qaCheck(clipboard.string(forType:.string)==clipboardText,"native table copy preserves quoted TSV Unicode and line endings on private pasteboard")
    owner.composing=true;owner.copyTableText(["id":"qa-copy-blocked","text":"不得覆盖"],to:clipboard);owner.composing=false
    qaCheck(clipboard.string(forType:.string)==clipboardText,"composition guard preserves clipboard contents")
    owner.copyTableText(["id":"qa-copy-large","text":String(repeating:"x",count:1024*1024+1)],to:clipboard)
    qaCheck(clipboard.string(forType:.string)==clipboardText,"oversized copy leaves clipboard unchanged")
    let a=DocumentSession(id:"a"),b=DocumentSession(id:"b"),c=DocumentSession(id:"c")
    a.url=qaRoot.appendingPathComponent("A.md");a.raw="\u{FEFF}# A\r\n原文  \n";a.baseline=Data(a.raw!.utf8);try a.baseline!.write(to:a.url!)
    b.url=qaRoot.appendingPathComponent("B.md");b.baseline=Data("原始磁盘".utf8);try b.baseline!.write(to:b.url!);b.raw="\u{FEFF}# B\r\n\r\n"+Array(repeating:"会话恢复测试  \r\n",count:80).joined();b.dirty=true;b.position=ReadingState(["anchor":150,"head":150,"scroll":500.0,"sourceMode":true])
    c.raw="";c.name="空白.md";owner.documents=[a,b,c];owner.activateDocument(b);await qaPause()
    _ = try await qaJS(owner,"document.execCommand('insertText',false,'中文')");await qaPause();await qaPause()
    owner.persistRecoveries();try Data(owner.document.raw!.utf8).write(to:qaRoot.appendingPathComponent("expected.txt"))
    qaCheck(owner.document.raw!.contains("中文"),"native bridge records inserted Chinese draft")
    let archive=try SessionArchive.decode(Data(contentsOf:owner.sessionURL));qaCheck(archive.active=="b" && archive.tabs.map{$0.id}==["a","b","c"],"process one persists full tab order and active ID");exit(0)
 } else if qaPhase=="move" {
    let root=qaRoot.appendingPathComponent("workspace",isDirectory:true);try FileManager.default.createDirectory(at:root.appendingPathComponent("old"),withIntermediateDirectories:true);try FileManager.default.createDirectory(at:root.appendingPathComponent("deep/sub"),withIntermediateDirectories:true);try FileManager.default.createDirectory(at:root.appendingPathComponent("assets"),withIntermediateDirectories:true)
    let image="<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"80\" height=\"60\"><rect width=\"80\" height=\"60\" fill=\"red\"/></svg>";try Data(image.utf8).write(to:root.appendingPathComponent("assets/a.svg"))
    let a=DocumentSession(id:"a"),b=DocumentSession(id:"b")
    a.url=root.appendingPathComponent("index.md");a.raw="\u{FEFF}# 首页\r\n\r\n[目标](old/b.md)\r\n未保存 A";a.baseline=Data("[目标](old/b.md)\r\n".utf8);a.dirty=true;try a.baseline!.write(to:a.url!)
    b.url=root.appendingPathComponent("old/b.md");b.raw="# B\n\n![图](../assets/a.svg)\n\n[首页](../index.md)\n未保存 B";b.baseline=Data("# B\n".utf8);b.dirty=true;try b.baseline!.write(to:b.url!)
    let closed=root.appendingPathComponent("closed.md");try Data("[目标](old/b.md)  \r\n".utf8).write(to:closed)
    owner.workspace=WorkspaceDirectory(root:root);owner.documents=[a,b];owner.activateDocument(a);await qaPause()
    owner.mutateWorkspace(["id":"native-move","operation":"move","path":"old/b.md","parent":"deep/sub","workspaceToken":owner.workspaceToken])
    for _ in 0..<20{await qaPause();if owner.pendingWorkspaceMoveID==nil{break}}
    qaCheck(b.url?.path==root.appendingPathComponent("deep/sub/b.md").path,"real bridge moves source and updates background tab path")
    qaCheck(a.raw!.contains("deep/sub/b.md") && a.raw!.contains("未保存 A"),"active unsaved draft keeps edits while incoming link changes")
    qaCheck(b.raw!.contains("../../assets/a.svg") && b.raw!.contains("未保存 B"),"background unsaved draft rebases outgoing image without losing text")
    qaCheck((try FileStore.decode(Data(contentsOf:closed)))=="[目标](deep/sub/b.md)  \r\n","closed document link changes preserve CRLF and trailing spaces")
    let diskA=try Data(contentsOf:a.url!),diskB=try Data(contentsOf:b.url!)
    qaCheck(diskA==a.baseline && diskB==b.baseline,"open drafts stay unsaved on disk")
    _ = try await qaJS(owner,"window.mokune.receive({type:'action',action:'undo'})");qaCheck((try await qaJS(owner,"window.mokune.snapshot().raw") as! String).contains("old/b.md"),"native WebKit link update is undoable")
    owner.activateDocument(b);await qaPause();await qaPause()
    qaCheck((try await qaJS(owner,"document.querySelector('.md-image-preview img')?.naturalWidth || 0") as? Int)==80,"rebased image renders through native workspace-scoped image handler")
    let imageRoot=b.url!.deletingLastPathComponent(),reader=ExportAssetReader()
    let exported:[String]=try await withCheckedThrowingContinuation{continuation in reader.read([["reference":"../../assets/a.svg","url":"local","kind":"local"]],root:imageRoot,allowedRoot:owner.images.scope(for:imageRoot)){continuation.resume(with:$0)}}
    qaCheck(exported.first=="data:image/svg+xml;base64,"+Data(image.utf8).base64EncodedString(),"export reads the same rebased image bytes as native preview")
    print("Native link-maintenance integration passed");exit(0)
 } else if qaPhase=="quit" {
    let a=DocumentSession(id:"a"),b=DocumentSession(id:"b"),c=DocumentSession(id:"c")
    a.raw="";b.raw="未保存";b.dirty=true;c.raw="";owner.documents=[a,b,c];owner.activateDocument(a);await qaPause();owner.closeAllDocuments()
 } else {
    qaCheck(owner.restoreSession(),"fresh native process restores session")
    qaCheck(owner.documents.map{$0.id}==["a","b","c"] && owner.document.id=="b","all tabs and selected tab survive restart")
    await qaPause()
    let expected=try FileStore.decode(Data(contentsOf:qaRoot.appendingPathComponent("expected.txt")))
    let snap=try await qaJS(owner,"window.mokune.snapshot()") as! [String:Any]
    qaCheck(Data((snap["raw"] as! String).utf8)==Data(expected.utf8),"WebKit restores exact unsaved source")
    let selections=(snap["selection"] as! [String:Any])["ranges"] as! [[String:Any]]
    qaCheck(selections[0]["head"] as? Int==152 && snap["sourceMode"] as? Bool==true,"restored caret and editing mode")
    let scroll=try await qaJS(owner,"document.querySelector('.cm-scroller').scrollTop") as! Double
    qaCheck(scroll>100,"restored WebKit reading position")
    _ = try await qaJS(owner,"document.execCommand('insertText',false,'续写')");_ = try await qaJS(owner,"window.mokune.receive({type:'action',action:'undo'})")
    let after=try await qaJS(owner,"window.mokune.snapshot().raw") as! String;qaCheck(Data(after.utf8)==Data(expected.utf8),"fresh-session insertion undo preserves recovered draft")
    owner.activateDocument(owner.documents[0]);await qaPause();let a=try await qaJS(owner,"window.mokune.snapshot().raw") as! String
    qaCheck(a=="\u{FEFF}# A\r\n原文  \n","lazy background tab restore preserves original bytes")
    owner.activateDocument(owner.documents[2]);await qaPause();qaCheck((try await qaJS(owner,"window.mokune.snapshot().raw") as? String)=="","empty unnamed tab restores")
    owner.activateDocument(owner.documents[1]);await qaPause();owner.persistRecoveries()
    let report=["native process restart, order and active tab","dirty source bytes and reading position","Chinese insertion undo after restore","background saved and empty unnamed tabs"]
    try JSONSerialization.data(withJSONObject:report,options:.prettyPrinted).write(to:URL(fileURLWithPath:FileManager.default.currentDirectoryPath).appendingPathComponent("output/session-app-checks.json"));exit(0)
 }
 }catch{fputs("Session app QA: \(error)\n",stderr);exit(1)}
}}
func qaWillClose(_ owner:AppDelegate){if qaPhase=="quit"{do{let archive=try SessionArchive.decode(Data(contentsOf:owner.sessionURL));qaCheck(archive.tabs.map{$0.id}==["a","b","c"] && archive.active=="a","graceful quit retains tabs and original active tab after discard");qaCheck(!archive.tabs[1].dirty && archive.tabs[1].raw.isEmpty,"discarded untitled content is not recovered");exit(0)}catch{fatalError("quit archive: \(error)")}}}
let app=NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate=AppDelegate();app.delegate=delegate
DispatchQueue.main.asyncAfter(deadline:.now()+40){fputs("Session app QA timeout\n",stderr);exit(1)}
app.run()
