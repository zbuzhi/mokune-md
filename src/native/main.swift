import AppKit
import WebKit
import UniformTypeIdentifiers
import Carbon

final class LocalImageHandler: NSObject, WKURLSchemeHandler {
    var roots=[String:URL]()
    var workspaceRoot:URL?
    func scope(for root:URL)->URL{guard let scope=workspaceRoot,root.path==scope.path||root.path.hasPrefix(scope.path+"/") else{return root};return scope}
    var root: URL?
    var token = UUID().uuidString
    var active = Set<ObjectIdentifier>()
    var base: String { root == nil ? "" : "mokune-image://local/\(token)/" }
    func remember(){if let root=root{roots[token]=root}}
    func configure(_ document: URL?) {
        roots.removeValue(forKey:token);root = document?.deletingLastPathComponent(); token = UUID().uuidString;remember()
    }
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url, let token=url.path.split(separator:"/").first.map(String.init),let root = roots[token],
              let reference = LocalImageResolver.reference(from: url, token: token),
              let image = LocalImageResolver.resolve(reference, root: root,allowedRoot:scope(for:root)), let mime = LocalImageResolver.formats[image.pathExtension.lowercased()] else {
            urlSchemeTask.didFailWithError(URLError(.noPermissionsToReadFile)); return
        }
        let id = ObjectIdentifier(urlSchemeTask); active.insert(id)
        DispatchQueue.global(qos: .userInitiated).async {
            let result: Result<Data, Error> = Result {
                let size = try image.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                guard size <= 20 * 1024 * 1024 else { throw URLError(.dataLengthExceedsMaximum) }
                return try Data(contentsOf: image, options: [.mappedIfSafe])
            }
            DispatchQueue.main.async {
                guard self.active.remove(id) != nil else { return }
                switch result {
                case .success(let data):
                    urlSchemeTask.didReceive(URLResponse(url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: nil))
                    urlSchemeTask.didReceive(data); urlSchemeTask.didFinish()
                case .failure(let error): urlSchemeTask.didFailWithError(error)
                }
            }
        }
    }
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) { active.remove(ObjectIdentifier(urlSchemeTask)) }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKScriptMessageHandler, WKNavigationDelegate, NSMenuItemValidation {
    var window: NSWindow!
    var webView: WKWebView!
    var document:DocumentSession={let entry=DocumentSession();entry.placeholder=true;return entry}()
    lazy var documents:[DocumentSession]=[document]
    var fileURL:URL?{get{document.url}set{document.url=newValue}}
    var originalData:Data?{get{document.baseline}set{document.baseline=newValue}}
    var diskStamp:String?{get{document.stamp}set{document.stamp=newValue}}
    var latestRevision:Int{get{document.revision}set{document.revision=newValue}}
    var dirty:Bool{get{document.dirty}set{document.dirty=newValue}}
    var inputComposing = false
    var editorPanelOpen = false
    var composing:Bool{get{inputComposing || editorPanelOpen}set{inputComposing=newValue}}
    var ready = false
    var allowClose = false
    var terminationPending = false
    var appUpdates: AppUpdates?
    var restoringSession=false
    var sessionWrite:DispatchWorkItem?
    var sessionActiveOverride:String?
    var pendingAction: (() -> Void)?
    var pendingOpen: URL?
    var modalBusy=false
    var deferredOpens=[URL]()
    var recentMenu:NSMenu?
    var untitledCounter=0
    var lastTrashed:(source:URL,trash:URL)?
    var navigationBack=[DocumentLocation](),navigationForward=[DocumentLocation]()
    var monitor: Timer?
    var shortcutHints: ShortcutHints?
    let images = LocalImageHandler()
    var exportBusy = false
    let pdfRenderer = PDFRenderer()
    var exportReaders = [String:ExportAssetReader]()
    var workspace: WorkspaceDirectory?{didSet{images.workspaceRoot=workspace?.root}}
    var pendingWorkspaceMove:WorkspaceMovePlan?
    var pendingWorkspaceMoveID:String?
    var resourceScanID:String?,resourceImageToken:String?
    var resourceScanProgress:Progress?
    var pendingResources:(id:String,inventory:ResourceInventory,approved:Set<String>)?
    var resourceTrash=[(source:URL,trash:URL)]()
    var resourceTrashRoot:URL?
    var pendingResourceNavigation:(id:String?,path:String?,line:Int)?
    let workspaceSearchQueue:OperationQueue={let queue=OperationQueue();queue.maxConcurrentOperationCount=1;queue.qualityOfService = .userInitiated;return queue}()
    var workspaceIndexCache:(token:String,items:[[String:String]],truncated:Bool)?
    var workspaceToken = UUID().uuidString
    var workspaceWatcher:WorkspaceWatcher?
    var workspaceRefresh:DispatchWorkItem?
    let recoveryURL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Mokune/recovery.json")

    func applicationDidFinishLaunching(_ notification: Notification) {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(images, forURLScheme: "mokune-image")
        config.userContentController.add(self, name: "mokune")
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 860), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Mokune MD"
        window.minSize = NSSize(width: 880, height: 600)
        window.contentView = webView
        window.delegate = self
        shortcutHints = ShortcutHints(canShow: { [weak self] in
            guard let self = self else { return false }
            return self.ready && self.window.isKeyWindow && NSApp.isActive && !self.composing && !self.modalBusy && self.pendingAction == nil && self.window.attachedSheet == nil && NSApp.modalWindow == nil
        }, display: { [weak self] visible in self?.send(["type":"shortcutHints", "visible":visible]) })
        shortcutHints?.install()
        window.center()
        window.setFrameAutosaveName("Mokune.MainWindow")
        appUpdates = AppUpdates(owner: self)
        makeMenus()
        guard let resources = Bundle.main.resourceURL else { fatalError("Missing application resources") }
        webView.loadFileURL(resources.appendingPathComponent("web/index.html"), allowingReadAccessTo: resources.appendingPathComponent("web"))
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        monitor = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.checkExternalChange(); self?.updateInputSource() }
    }

    func makeMenus() {
        let main = NSMenu()
        let appItem = NSMenuItem(); main.addItem(appItem)
        let app = NSMenu(); appItem.submenu = app
        item(app, "关于 Mokune MD", #selector(about), "");item(app,"设置…",#selector(showPreferences),",")
        appUpdates?.addMenuItems(to: app)
        app.addItem(.separator()); item(app, "退出 Mokune MD", #selector(quit), "q")
        let fileItem = NSMenuItem(); main.addItem(fileItem); let file = NSMenu(title: "文件"); fileItem.submenu = file
        item(file, "新建文稿", #selector(newDocument), "n")
        item(file, "打开…", #selector(openDocument), "o")
        item(file,"快速打开…",#selector(quickOpen),"p")
        item(file, "打开文件夹…", #selector(openFolder), "o", [.command, .shift])
        let recentItem=NSMenuItem(title:"最近文稿",action:nil,keyEquivalent:"");let recent=NSMenu(title:"最近文稿");recentItem.submenu=recent;recentMenu=recent;file.addItem(recentItem);refreshRecentMenu()
        item(file,"在 Finder 中显示",#selector(revealCurrentDocument),"")
        item(file,"版本历史…",#selector(showVersions),"")
        item(file,"图片与附件…",#selector(showResources),"")
        item(file,"插入附件…",#selector(insertAttachment),"")
        file.addItem(.separator()); item(file, "保存", #selector(saveDocument), "s")
        item(file, "另存为…", #selector(saveAsDocument), "s", [.command, .shift])
        file.addItem(.separator())
        item(file, "导出 PDF…", #selector(exportPDF), "e", [.command, .shift])
        item(file, "导出 HTML…", #selector(exportHTML), "e", [.command, .option, .shift])
        file.addItem(.separator()); item(file, "关闭标签", #selector(closeWindow), "w")
        let editItem = NSMenuItem(); main.addItem(editItem); let edit = NSMenu(title: "编辑"); editItem.submenu = edit
        item(edit, "撤销", #selector(undoAction), "z"); item(edit, "重做", #selector(redoAction), "z", [.command, .shift]); edit.addItem(.separator())
        for (title, action, key) in [("剪切", "cut:", "x"), ("复制", "copy:", "c"), ("粘贴", "paste:", "v"), ("全选", "selectAll:", "a")] {
            let entry = NSMenuItem(title: title, action: Selector(action), keyEquivalent: key); edit.addItem(entry)
        }
        edit.addItem(.separator()); item(edit,"跳转行列…",#selector(goTo),"l");item(edit, "查找与替换…", #selector(find), "f");item(edit,"在文件夹中搜索…",#selector(workspaceSearch),"f",[.command,.option])
        let formatItem = NSMenuItem(); main.addItem(formatItem); let format = NSMenu(title: "格式"); formatItem.submenu = format
        if let url = Bundle.main.resourceURL?.appendingPathComponent("web/shortcuts.json"), let data = try? Data(contentsOf: url), let definitions = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            for definition in definitions {
                guard let title = definition["title"] as? String, let key = definition["key"] as? String, let name = definition["action"] as? String else { continue }
                var flags: NSEvent.ModifierFlags = []
                for flag in definition["modifiers"] as? [String] ?? [] {
                    if flag == "command" { flags.insert(.command) }; if flag == "shift" { flags.insert(.shift) }; if flag == "option" { flags.insert(.option) }
                }
                let entry = NSMenuItem(title: title, action: #selector(formatDocument(_:)), keyEquivalent: key)
                entry.target = self; entry.keyEquivalentModifierMask = flags; entry.representedObject = name; format.addItem(entry)
            }
        }
        item(format,"导入本地图片…",#selector(insertLocalImage),"i",[.command,.option]);format.addItem(.separator());item(format,"切换任务完成状态",#selector(toggleTask),"\r")
        let viewItem = NSMenuItem(); main.addItem(viewItem); let view = NSMenu(title: "显示"); viewItem.submenu = view
        item(view,"返回链接位置",#selector(goBack),"\u{F702}",[.command,.option])
        item(view,"前进链接位置",#selector(goForward),"\u{F703}",[.command,.option])
        item(view,"打开光标处的链接",#selector(openCursorLink),"\r",[.command,.option])
        item(view,"上一个标签",#selector(previousTab),"[",[.command,.shift]);item(view,"下一个标签",#selector(nextTab),"]",[.command,.shift])
        item(view,"只读阅读模式",#selector(toggleReading),"r",[.command,.shift])
        item(view,"文稿与选区统计…",#selector(documentStatistics),"")
        item(view,"命令面板…",#selector(showCommands),"p",[.command,.shift])
        item(view, "切换源码 / 即时预览", #selector(source), "/", [.command])
        item(view, "切换源码模式（兼容快捷键）", #selector(source), "m", [.command, .shift])
        item(view, "专注模式", #selector(focus), "f", [.command, .shift])
        item(view, "外观与主题", #selector(appearance), "")
        item(view, "切换侧栏", #selector(sidebar), "b", [.command, .shift])
        item(view, "展开本篇大纲", #selector(showOutline), "")
        let helpItem = NSMenuItem(); main.addItem(helpItem); let help = NSMenu(title: "帮助"); helpItem.submenu = help
        item(help, "输入诊断…", #selector(inputDiagnostics), "")
        NSApp.mainMenu = main
    }
    func item(_ menu: NSMenu, _ title: String, _ action: Selector, _ key: String, _ modifiers: NSEvent.ModifierFlags = [.command]) {
        let entry = NSMenuItem(title: title, action: action, keyEquivalent: key); entry.target = self; entry.keyEquivalentModifierMask = modifiers; menu.addItem(entry)
    }
    @objc func about() {
        let version=Bundle.main.object(forInfoDictionaryKey:"CFBundleShortVersionString") as? String ?? "开发版"
        let alert = NSAlert(); alert.messageText = "Mokune MD"; alert.informativeText = "\(version) · 本地预览版\n安静的纸面，可靠的源文。\nMIT · 原创与开源适配主题\n\n当前为未公证的本机构建。"; alert.addButton(withTitle: "好"); alert.runModal()
    }
    @objc func quit() { window.performClose(nil) }
    @objc func closeWindow() { action("closeTab") }
    @objc func newDocument() {guard ready,!composing,!modalBusy,pendingAction==nil else{return};guard documents.count<30 else{error("最多同时打开 30 份文稿，请先关闭部分标签。");return};let entry=DocumentSession();repeat{untitledCounter+=1;entry.name="未命名 \(untitledCounter).md"}while documents.contains(where:{$0.displayName==entry.name});entry.raw="";documents.append(entry);activateDocument(entry)}
    @objc func openDocument() {
        guard ready,!composing else{return}
        let panel=NSOpenPanel();panel.allowedContentTypes=[.plainText,.text,UTType(filenameExtension:"md") ?? .text];panel.allowsMultipleSelection=true
        modalBusy=true;let response=panel.runModal();modalBusy=false
        if response == .OK {for url in panel.urls{open(url)}}
        drainDeferredOpens()
    }
    @objc func saveDocument() { action("save") }
    @objc func saveAsDocument() { action("saveAs") }
    @objc func exportPDF() { if !composing && !exportBusy { action("exportPDF") } }
    @objc func exportHTML() { if !composing && !exportBusy { action("exportHTML") } }
    @objc func undoAction() { action("undo") }
    @objc func redoAction() { action("redo") }
    @objc func find() { action("find") }
    @objc func source() { action("source") }
    @objc func focus() { action("focus") }
    @objc func appearance() { action("appearance") }
    @objc func sidebar() { action("sidebar") }
    @objc func formatDocument(_ sender: NSMenuItem) { if !composing, let name = sender.representedObject as? String { send(["type":"action", "action":"format", "name":name]) } }
    func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
        if menuItem.action == #selector(openFolder) || menuItem.action == #selector(showOutline) { return ready && !composing }
        if menuItem.action == #selector(exportPDF) || menuItem.action == #selector(exportHTML) { return ready && !composing && !exportBusy }
        if editorPanelOpen && (menuItem.action == #selector(undoAction) || menuItem.action == #selector(redoAction)){return !inputComposing}
        let editing: [Selector] = [#selector(undoAction), #selector(redoAction), #selector(formatDocument(_:)), #selector(source), #selector(find)]
        if menuItem.action.map({ editing.contains($0) }) == true { return ready && !composing }
        return true
    }
    @objc func inputDiagnostics() {
        let active = NSApp.isActive, key = window.isKeyWindow
        let responder = String(describing: window.firstResponder.map { type(of: $0) })
        webView.evaluateJavaScript("window.mokune.diagnostics()") { result, _ in
            var info = result as? [String: Any] ?? [:]
            info["appActive"] = active; info["keyWindow"] = key; info["nativeResponder"] = responder
            let data = try? JSONSerialization.data(withJSONObject: info, options: [.prettyPrinted, .sortedKeys])
            let alert = NSAlert(); alert.messageText = "输入诊断（不包含文稿正文）"
            alert.informativeText = data.flatMap { String(data: $0, encoding: .utf8) } ?? "未收到编辑器诊断。"
            alert.addButton(withTitle: "关闭"); alert.runModal()
            self.action("focusEditor")
        }
    }

    func send(_ payload: [String: Any]) {
        var payload=payload
        if ["load","saved","conflict","error","relocated"].contains(payload["type"] as? String ?? ""){if payload["tabID"]==nil{payload["tabID"]=document.id}}
        guard let data = try? JSONSerialization.data(withJSONObject: payload, options: [.fragmentsAllowed]), let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.mokune.receive(\(json))") { _, error in
            if let error = error { NSLog("Mokune bridge: %@", error.localizedDescription) }
        }
    }
    func action(_ name: String, extra: [String: Any] = [:]) {
        if name == "closeCancelled", terminationPending { terminationPending=false;NSApp.reply(toApplicationShouldTerminate:false) }
        send(["type": "action", "action": name, "extra": extra]) }
    func updateInputSource() {
        guard ready, let source = TISCopyCurrentKeyboardInputSource()?.takeRetainedValue() else { return }
        func property(_ key: CFString) -> String {
            guard let ptr = TISGetInputSourceProperty(source, key) else { return "" }
            return Unmanaged<CFString>.fromOpaque(ptr).takeUnretainedValue() as String
        }
        send(["type": "inputSource", "name": property(kTISPropertyLocalizedName), "id": property(kTISPropertyInputSourceID)])
    }
    func installedInputSources() -> [TISInputSource] {
        let filter = [kTISPropertyInputSourceIsSelectCapable as String: true, kTISPropertyInputSourceIsEnabled as String: true] as CFDictionary
        return TISCreateInputSourceList(filter, false).takeRetainedValue() as! [TISInputSource]
    }
    func inputProperty(_ source: TISInputSource, _ key: CFString) -> String {
        guard let ptr = TISGetInputSourceProperty(source, key) else { return "" }
        return Unmanaged<CFString>.fromOpaque(ptr).takeUnretainedValue() as String
    }
    func showInputSourceMenu() {
        let menu = NSMenu(title: "输入法")
        let current = TISCopyCurrentKeyboardInputSource().takeRetainedValue()
        for source in installedInputSources() {
            let entry = NSMenuItem(title: inputProperty(source, kTISPropertyLocalizedName), action: #selector(selectInputSource(_:)), keyEquivalent: "")
            entry.target = self; entry.representedObject = inputProperty(source, kTISPropertyInputSourceID)
            entry.state = inputProperty(source, kTISPropertyInputSourceID) == inputProperty(current, kTISPropertyInputSourceID) ? .on : .off
            menu.addItem(entry)
        }
        menu.popUp(positioning: nil, at: NSPoint(x: max(100, webView.bounds.width - 380), y: 28), in: webView)
    }
    @objc func selectInputSource(_ sender: NSMenuItem) {
        guard let id = sender.representedObject as? String, let source = installedInputSources().first(where: { inputProperty($0, kTISPropertyInputSourceID) == id }) else { return }
        if TISSelectInputSource(source) != noErr { error("无法切换输入法，请使用系统输入法菜单。"); return }
        updateInputSource()
        // Native pop-up tracking and the Web button temporarily own focus.
        // Restore the document only after menu tracking has finished.
        DispatchQueue.main.async {
            self.window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            self.action("focusEditor")
        }
    }
    func error(_ message: String) { send(["type": "error", "message": message]) }
    func load(raw: String, name: String, saved: Bool, recovered: Bool = false) {
        document.name=name;document.raw=raw;document.imageToken=images.token;latestRevision = 0; dirty = recovered; composing = false; window.isDocumentEdited = dirty; window.title = "\(name) — Mokune MD"
        send(["type": "load", "raw": raw, "name": name, "hasPath": saved, "recovered": recovered, "imageBase": images.base, "replace":true, "documentKey": fileURL?.standardizedFileURL.path ?? "", "folder": fileURL?.deletingLastPathComponent().lastPathComponent ?? "本地文稿"])
        adoptDocumentFolderIfNeeded(); publishWorkspace();publishTabs()
    }
    func drainDeferredOpens(){guard !modalBusy,pendingAction==nil,!allowClose,!composing else{return};let queued=deferredOpens;deferredOpens=[];for url in queued{open(url)}}
    func open(_ supplied: URL,replace:Bool=false) {
        if modalBusy||editorPanelOpen||pendingAction != nil{deferredOpens.append(supplied);return}
        guard !composing else{return}
        let url=supplied.standardizedFileURL.resolvingSymlinksInPath()
        if !replace,let existing=documents.first(where:{$0.url==url}){if existing !== document{activateDocument(existing)};return}
        do {
            let data = try Data(contentsOf: url)
            let raw = try FileStore.decode(data)
            if !replace && !(document.placeholder && !dirty) {
                guard documents.count<30 else{error("最多同时打开 30 份文稿。");return}
                let entry=DocumentSession();documents.append(entry);document=entry
            }
            document.placeholder=false;fileURL = url; images.configure(url); originalData = data; diskStamp = stamp(url); clearRecovery(); load(raw: raw, name: url.lastPathComponent, saved: true);noteRecent(url)
        } catch FileStoreError.invalidEncoding { self.error("此文件不是有效的 UTF-8 文本。为保护原文，没有自动转换编码。") }
        catch FileStoreError.tooLarge { self.error("此预览版暂支持 20 MB 以内的文本文件。") }
        catch { self.error("无法打开文稿：\(error.localizedDescription)") }
    }
    func guarded(_ operation: @escaping () -> Void) {
        guard !modalBusy,pendingAction==nil else{return}
        defer{drainDeferredOpens()}
        guard ready else { return }
        if !dirty { operation(); return }
        let alert = NSAlert(); alert.messageText = "要保存“\(document.displayName)”的更改吗？"; alert.informativeText = "你的编辑尚未全部保存。"; alert.addButton(withTitle: "保存"); alert.addButton(withTitle: "取消"); alert.addButton(withTitle: "不保存")
        modalBusy=true;let response=alert.runModal();modalBusy=false
        switch response {
        case .alertFirstButtonReturn: pendingAction = operation; action("save", extra: ["beforeAction": true])
        case .alertThirdButtonReturn: dirty=false;clearRecovery(); operation()
        default: sessionActiveOverride=nil;persistSession();action("closeCancelled")
        }
    }
    func save(raw: String, revision: Int, saveAs: Bool, beforeAction: Bool,mergeToken:String?=nil) {
        guard !modalBusy else{return}
        defer{drainDeferredOpens()}
        var destination = fileURL
        if saveAs || destination == nil {
            let panel = NSSavePanel(); panel.nameFieldStringValue = fileURL?.lastPathComponent ?? document.name; panel.allowedContentTypes = [UTType(filenameExtension: "md") ?? .plainText]; panel.canCreateDirectories = true
            modalBusy=true;let response=panel.runModal();modalBusy=false
            if response != .OK { pendingAction = nil;sessionActiveOverride=nil;persistSession();action("closeCancelled");return }; destination = panel.url
        }
        guard let target = destination else { return }
        if documents.contains(where:{$0 !== document && $0.url?.standardizedFileURL.resolvingSymlinksInPath()==target.standardizedFileURL.resolvingSymlinksInPath()}){pendingAction=nil;error("目标已在另一标签打开，请切换到该标签，或选择其他文件名。");action("closeCancelled");return}
        let encoded = Data(raw.utf8)
        let writeBaseline=(mergeToken != nil && document.mergeAuthorization?.token==mergeToken) ? document.mergeAuthorization!.disk:originalData
        do {
            if target == fileURL,let baseline=writeBaseline,let disk=try? Data(contentsOf:target),disk==baseline,baseline != encoded { try versionStore.record(baseline,document:target) }
            try FileStore.atomicWrite(encoded, to: target, baseline: target == fileURL ? writeBaseline : nil)
            if fileURL != target { images.configure(target) }
            fileURL = target;document.raw=raw;document.imageToken=images.token;originalData = encoded;document.mergeAuthorization=nil;document.diskMergeSnapshot=nil; diskStamp = stamp(target); dirty = latestRevision != revision; window.isDocumentEdited = dirty; window.title = "\(target.lastPathComponent) — Mokune MD"; if !dirty { clearRecovery() }
            send(["type": "saved", "revision": revision, "name": target.lastPathComponent, "imageBase": images.base,"documentKey":target.standardizedFileURL.path])
            adoptDocumentFolderIfNeeded(); publishWorkspace();noteRecent(target);publishTabs()
            if beforeAction, let next = pendingAction { pendingAction = nil; next() }
        } catch FileStoreError.conflict { pendingAction = nil; send(["type": "conflict"]); saveRecovery(raw: raw);if beforeAction {action("closeCancelled")} }
        catch { pendingAction = nil; self.error("保存失败，编辑仍然保留：\(error.localizedDescription)"); saveRecovery(raw: raw);if beforeAction {action("closeCancelled")} }
    }
    func stamp(_ url: URL) -> String? {
        guard let values = try? url.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey, .fileResourceIdentifierKey]) else { return nil }
        return "\(values.contentModificationDate?.timeIntervalSince1970 ?? 0):\(values.fileSize ?? -1):\(String(describing: values.fileResourceIdentifier))"
    }
    func checkExternalChange() {
        guard ready, let url = fileURL else { return }
        let now = stamp(url)
        guard now != diskStamp else { return }
        diskStamp = now
        guard let data = try? Data(contentsOf: url), data == originalData else {
            // Do not reset the editor, selection or history behind the user's back.
            send(["type": "conflict"]); return
        }
    }
    func saveRecovery(raw:String){document.raw=raw;persistRecoveries()}
    func clearRecovery(){document.raw=nil;persistRecoveries()}
    func recoverIfNeeded()->Bool {
        guard let data=try? Data(contentsOf:recoveryURL),let drafts=try? RecoveryArchive.decode(data) else{return false}
        guard !drafts.isEmpty else{return false}
        let alert=NSAlert();alert.messageText="发现上次未保存的文稿";alert.informativeText="可恢复 \(drafts.count) 份文稿到独立标签。";alert.addButton(withTitle:"恢复文稿");alert.addButton(withTitle:"丢弃恢复副本")
        guard alert.runModal() == .alertFirstButtonReturn else{try? FileManager.default.removeItem(at:recoveryURL);return false}
        documents=[]
        for draft in drafts.prefix(30){guard let raw=draft["raw"] as? String else{continue};let entry=DocumentSession();entry.name=draft["name"] as? String ?? "恢复文稿.md";entry.raw=raw;entry.dirty=true
            if let path=draft["path"] as? String,let base=draft["baseline"] as? String,let bytes=Data(base64Encoded:base),let disk=try? Data(contentsOf:URL(fileURLWithPath:path)),disk==bytes{entry.url=URL(fileURLWithPath:path);entry.baseline=bytes;entry.stamp=stamp(entry.url!)}
            documents.append(entry);document=entry;images.root=entry.url?.deletingLastPathComponent();images.token=entry.imageToken;images.remember()
            send(["type":"load","tabID":entry.id,"raw":raw,"name":draft["name"] as? String ?? "恢复文稿.md","hasPath":entry.url != nil,"recovered":true,"documentKey":entry.url?.path ?? "","imageBase":images.base])
        }
        guard let last=documents.last else{let empty=DocumentSession();document=empty;documents=[empty];return false};document=last;publishTabs();publishWorkspace();return true
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.isFileURL == true, let body = message.body as? [String: Any], let command = body["command"] as? String else { return }
        if ["changed","clean","draft","syncTab"].contains(command),let id=body["tabID"] as? String,let target=documents.first(where:{$0.id==id}) {
            if command=="changed"{target.placeholder=false;target.dirty=true;target.revision=body["revision"] as? Int ?? target.revision}
            if command=="clean",body["revision"] as? Int==target.revision{target.dirty=false;target.raw=nil}
            if let position=body["position"] as? [String:Any]{target.position=ReadingState(position)}
            if command=="draft"||command=="syncTab"{if let raw=body["raw"] as? String{target.raw=raw};if command=="syncTab"{target.revision=body["revision"] as? Int ?? target.revision;target.dirty=body["dirty"] as? Bool ?? target.dirty}}
            if target === document{window.isDocumentEdited=target.dirty};if command != "changed"{persistRecoveries()};publishTabs();return
        }
        if let id=body["tabID"] as? String,id != document.id,["save","saveAs","composition","editingPanel","reload","versions","compareDisk","validateMerge","importLocalImage","importImageData","importAttachment","revealImage","resourceScan","resourceCleanup","resourceRestore","openDocumentLink","navigateHistory","copyTableText"].contains(command){return}
        switch command {
        case "ready":
            ready = true
            restoreWorkspace()
            if let url = pendingOpen { pendingOpen = nil;_ = restoreSession();open(url) }
            else if !restoreSession(),!recoverIfNeeded(),!resumeLastDocument() { document.placeholder=true;send(["type": "load", "name": "写作札记.md", "hasPath": false]);publishTabs();publishWorkspace() }
        case "quitReady": closeAllDocuments()
        case "quitDeferred": action("closeCancelled")
        case "switchTab": switchTab(body)
        case "closeTab": closeTab(body)
        case "revealCurrent": revealCurrentDocument()
        case "open": openDocument()
        case "new": newDocument()
        case "importTheme": importTheme()
        case "exportTheme": exportTheme(body)
        case "openFolder": openFolder()
        case "closeFolder": setWorkspace(nil)
        case "openDocumentLink": openDocumentLink(body)
        case "navigateHistory": navigateHistory(body)
        case "sessionPosition":
            if !composing,let id=body["tabID"] as? String,let entry=documents.first(where:{$0.id==id}),let position=body["position"] as? [String:Any]{entry.position=ReadingState(position);persistSession()}
        case "preferences": UserDefaults.standard.set(body["resumeLastDocument"] as? Bool ?? true,forKey:"Mokune.ResumeLastDocument")
        case "compareDisk": compareDisk(body)
        case "validateMerge": validateMerge(body)
        case "versions": versionRequest(body)
        case "importImageData": importImageData(body)
        case "importLocalImage": importLocalImage(body)
        case "importAttachment": importAttachment(body)
        case "resourceScan": scanResources(body)
        case "resourceClassified": classifyResourceScan(body)
        case "resourceClose": closeResources()
        case "resourceReveal": revealResource(body)
        case "resourceNavigate": navigateResource(body)
        case "revealImage": revealImage(body)
        case "resourceCleanup": cleanupResources(body)
        case "resourceRestore": restoreResourceTrash(body)
        case "searchWorkspace": searchWorkspace(body)
        case "copyTableText": copyTableText(body)
        case "queryWorkspaceFiles": queryWorkspaceFiles(body)
        case "readDirectory": readWorkspaceDirectory(body)
        case "workspaceMutation": mutateWorkspace(body)
        case "workspaceMoveCommit": commitWorkspaceMove(body)
        case "openWorkspaceFile": openWorkspaceFile(body)
        case "inputSourceMenu": showInputSourceMenu()
        case "exportStatus": exportBusy = body["busy"] as? Bool ?? false
        case "exportFailure": exportFailed(body["message"] as? String ?? "导出未完成。")
        case "exportImages": readExportImages(body)
        case "writeExport": writeExport(body)
        case "save", "saveAs":
            guard let raw = body["raw"] as? String, let revision = body["revision"] as? Int else { return }
            save(raw: raw, revision: revision, saveAs: command == "saveAs", beforeAction: body["beforeAction"] as? Bool ?? false,mergeToken:body["mergeToken"] as? String)
        case "changed": latestRevision = body["revision"] as? Int ?? latestRevision; dirty = true; window.isDocumentEdited = true
        case "clean": if body["revision"] as? Int == latestRevision { dirty = false; window.isDocumentEdited = false; clearRecovery() }
        case "editingPanel": editorPanelOpen = body["active"] as? Bool ?? false;if editorPanelOpen{shortcutHints?.cancel()}else{drainDeferredOpens();drainResourceNavigation()}
        case "composition": composing = body["active"] as? Bool ?? false;if composing{shortcutHints?.cancel()}
        case "draft": if dirty, let raw = body["raw"] as? String { saveRecovery(raw: raw) }
        case "reload":
            guard let url = fileURL else { return }
            let alert = NSAlert(); alert.messageText = "载入磁盘上的版本？"; alert.informativeText = "当前编辑将被磁盘内容替换。建议先另存你的版本。"; alert.addButton(withTitle: "取消"); alert.addButton(withTitle: "载入磁盘版本")
            if alert.runModal() == .alertSecondButtonReturn { open(url,replace:true) }
        case "theme":
            let dark = body["dark"] as? Bool ?? false; window.appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
            if let hex = body["background"] as? String, let number = UInt32(hex.dropFirst(), radix: 16) { window.backgroundColor = NSColor(srgbRed: CGFloat((number >> 16) & 255)/255, green: CGFloat((number >> 8) & 255)/255, blue: CGFloat(number & 255)/255, alpha: 1) }
        default: break
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.isFileURL, let webRoot = Bundle.main.resourceURL?.appendingPathComponent("web").standardizedFileURL.path, url.standardizedFileURL.path.hasPrefix(webRoot + "/") { decisionHandler(.allow) }
        else { if navigationAction.navigationType == .linkActivated, ["https", "http", "mailto"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }; decisionHandler(.cancel) }
    }
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        if !ready { return true }
        if allowClose { return true }
        if composing||modalBusy||pendingAction != nil{return false}
        action("prepareQuit");return false
    }
    func windowDidResignKey(_ notification: Notification) { shortcutHints?.cancel(reset: true) }
    func applicationWillResignActive(_ notification: Notification) { shortcutHints?.cancel(reset: true) }
    func windowWillClose(_ notification: Notification) { shortcutHints?.cancel(reset: true); monitor?.invalidate(); NSApp.terminate(nil) }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if allowClose || !ready {return .terminateNow}
        if terminationPending {return .terminateLater}
        guard !composing,!modalBusy,pendingAction==nil,!exportBusy else{return .terminateCancel}
        terminationPending=true
        action("prepareQuit")
        return .terminateLater
    }
    func application(_ application: NSApplication, open urls: [URL]) {
        guard let url = urls.first else { return }
        if ready {for url in urls{open(url)}}else{pendingOpen=url}
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { window.makeKeyAndOrderFront(nil); return true }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
