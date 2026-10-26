import AppKit
extension AppDelegate {
    @objc func openCursorLink(){if ready && !composing{action("openLink")}}
    @objc func goBack(){if ready && !composing{action("navigateBack")}}
    @objc func goForward(){if ready && !composing{action("navigateForward")}}
    func navigationState(){send(["type":"navigationState","back":!navigationBack.isEmpty,"forward":!navigationForward.isEmpty])}
    func currentLocation(_ body:[String:Any])->DocumentLocation?{guard let url=fileURL else{return nil};return DocumentLocation(url:url,line:max(1,body["line"] as? Int ?? 1),column:max(1,body["column"] as? Int ?? 1))}
    func openDocumentLink(_ body:[String:Any]) {
        guard ready,!composing,let reference=body["reference"] as? String else{return}
        if let url=URL(string:reference),["https","http","mailto"].contains(url.scheme?.lowercased() ?? ""){NSWorkspace.shared.open(url);return}
        guard let document=fileURL else{error("请先保存文稿，再打开相对链接。");return}
        do {
            let root=workspace.flatMap{$0.relative(document) != nil ? $0.root:nil} ?? document.deletingLastPathComponent()
            let local=try DocumentLink.localFile(reference,document:document,root:root)
            if !WorkspaceDirectory.extensions.contains(local.pathExtension.lowercased()) {
                let passive=ImageImport.extensions.union(["pdf","mp3","wav","m4a","mp4","mov","webm","csv","docx","xlsx","pptx"])
                if passive.contains(local.pathExtension.lowercased()){_ = NSWorkspace.shared.open(local)}else{NSWorkspace.shared.activateFileViewerSelecting([local])}
                return
            }
            let target=try DocumentLink.resolve(reference,document:document,root:root)
            let navigate={
                let origin=self.currentLocation(body),previous=self.images.token
                if target.url != self.fileURL?.standardizedFileURL.resolvingSymlinksInPath(){self.open(target.url);guard self.images.token != previous else{return}}
                if let origin=origin{self.navigationBack.append(origin);self.navigationBack=Array(self.navigationBack.suffix(100))};self.navigationForward=[]
                self.send(["type":"action","action":"navigateAnchor","fragment":target.fragment]);self.navigationState()
            }
            if target.url==document.standardizedFileURL.resolvingSymlinksInPath(){navigate()}else{navigate()}
        }catch{self.error("无法打开这个文稿链接；目标需要位于当前文件夹内，且是可读取的普通文件。")}
    }
    func navigateHistory(_ body:[String:Any]) {
        guard ready,!composing else{return};let backward=body["direction"] as? String != "forward"
        guard let target=(backward ? navigationBack:navigationForward).last else{return}
        let navigate={
            let origin=self.currentLocation(body),previous=self.images.token
            if target.url != self.fileURL{self.open(target.url);guard self.images.token != previous else{return}}
            if backward{self.navigationBack.removeLast();if let origin=origin{self.navigationForward.append(origin)}}else{self.navigationForward.removeLast();if let origin=origin{self.navigationBack.append(origin)}}
            self.send(["type":"action","action":"navigateLine","line":target.line,"column":target.column]);self.navigationState()
        }
        if target.url==fileURL{navigate()}else{navigate()}
    }
}
