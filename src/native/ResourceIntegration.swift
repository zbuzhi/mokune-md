import AppKit
extension AppDelegate {
    @objc func showResources(){if ready && !composing{action("resources")}}
    @objc func insertAttachment(){if ready && !composing{action("importAttachment")}}
    func resourceDocuments()->[ResourceDocument]{documents.map{ResourceDocument(id:$0.id,path:$0.url?.standardizedFileURL.resolvingSymlinksInPath().path,name:$0.displayName,raw:$0.raw ?? $0.baseline.map{String(decoding:$0,as:UTF8.self)} ?? "",revision:$0.revision,disk:nil)}}
    func scanResources(_ body:[String:Any]) {
        guard let id=body["id"] as? String else{return}
        guard ready,!inputComposing,!modalBusy,let root=workspace?.root ?? fileURL?.deletingLastPathComponent() else{send(["type":"resourceResult","id":id,"error":"请先保存文稿或打开文件夹，再检查资源。"]);return}
        resourceScanProgress?.cancel();let progress=Progress(totalUnitCount:1);resourceScanProgress=progress
        let opened=resourceDocuments(),scanID=UUID().uuidString;pendingResources=nil;resourceScanID=scanID
        if let token=resourceImageToken{images.roots.removeValue(forKey:token)};resourceImageToken=nil
        DispatchQueue.global(qos:.userInitiated).async {
            let result=Result{try ResourceInventory.scan(root:root,opened:opened,cancelled:{progress.isCancelled})}
            DispatchQueue.main.async {
                guard self.resourceScanID==scanID else{self.send(["type":"resourceResult","id":id,"error":"资源检查已取消。"]);return}
                switch result {
                case .success(let inventory):
                    self.pendingResources=(scanID,inventory,[]);let token=UUID().uuidString;self.images.roots[token]=inventory.root;self.resourceImageToken=token
                    self.send(["type":"resourceResult","id":id,"scanID":scanID,"root":inventory.root.path,"caseSensitive":inventory.caseSensitive,"paths":inventory.paths,"assets":inventory.assets.map{$0.payload},"documents":inventory.documents.map{$0.payload},"complete":inventory.complete,"imageBase":"mokune-image://local/\(token)/","canUndo":self.resourceTrashRoot==inventory.root && !self.resourceTrash.isEmpty])
                case .failure:self.send(["type":"resourceResult","id":id,"error":"无法完整扫描资源。请检查目录权限或缩小工作区（最多 20,000 个项目、2,000 个资源、40 MB 文本）。未清理任何内容。"])
                }
            }
        }
    }
    func classifyResourceScan(_ body:[String:Any]) {
        guard let id=body["scanID"] as? String,var pending=pendingResources,pending.id==id,let paths=body["unused"] as? [String] else{return}
        pending.approved=body["complete"] as? Bool==true ? Set(paths).intersection(Set(pending.inventory.assets.filter{$0.eligible && !$0.open}.map{$0.path})):[];pendingResources=pending
    }
    func closeResources(){resourceScanProgress?.cancel();resourceScanProgress=nil;resourceScanID=nil;pendingResources=nil;if let token=resourceImageToken{images.roots.removeValue(forKey:token)};resourceImageToken=nil}
    func revealImage(_ body:[String:Any]) {
        guard ready,!inputComposing,let reference=body["reference"] as? String,let root=fileURL?.deletingLastPathComponent(),let url=LocalImageResolver.resolve(reference,root:root,allowedRoot:images.scope(for:root)) else{send(["type":"resourceResult","id":body["id"] ?? "","error":"本地原图片无法定位；远程图片需先下载，失效路径需先修复。"]);return}
        NSWorkspace.shared.activateFileViewerSelecting([url]);send(["type":"resourceResult","id":body["id"] ?? "","ok":true])
    }
    func revealResource(_ body:[String:Any]) {
        guard let id=body["id"] as? String,let pending=pendingResources,body["scanID"] as? String==pending.id,let path=body["path"] as? String,pending.inventory.files[path] != nil else{return}
        let url=URL(fileURLWithPath:path)
        guard url.resolvingSymlinksInPath().path==path,(try? ResourceInventory.stamp(url))==pending.inventory.files[path] else{send(["type":"resourceResult","id":id,"error":"资源已变化，请重新检查。"]) ;return}
        NSWorkspace.shared.activateFileViewerSelecting([url]);send(["type":"resourceResult","id":id,"ok":true])
    }
    func navigateResource(_ body:[String:Any]) {
        guard let pending=pendingResources,body["scanID"] as? String==pending.id,
              let doc=pending.inventory.documents.first(where:{($0.id != nil && $0.id==body["documentID"] as? String)||($0.path != nil && $0.path==body["path"] as? String)}) else{return}
        pendingResourceNavigation=(doc.id,doc.path,max(1,body["line"] as? Int ?? 1))
    }
    func drainResourceNavigation(){
        guard !composing,let target=pendingResourceNavigation else{return};pendingResourceNavigation=nil
        if let entry=documents.first(where:{$0.id==target.id}){activateDocument(entry)}
        else if let path=target.path{open(URL(fileURLWithPath:path))}else{return}
        send(["type":"action","action":"navigateLine","line":target.line])
    }
    func cleanupResources(_ body:[String:Any]) {
        guard let id=body["id"] as? String else{return}
        func reply(_ message:String){send(["type":"resourceResult","id":id,"error":message,"canUndo":!resourceTrash.isEmpty])}
        guard ready,!inputComposing,!modalBusy,pendingAction==nil,pendingWorkspaceMoveID==nil,let pending=pendingResources,body["scanID"] as? String==pending.id,let paths=body["paths"] as? [String],!paths.isEmpty else{reply("请重新检查资源并选择要清理的项目。");return}
        do {
            guard Set(paths).isSubset(of:pending.approved) else{throw ResourceError.referenced}
            try pending.inventory.validate(opened:resourceDocuments())
            let alert=NSAlert();alert.messageText="将 \(paths.count) 个资源移入废纸篓？";alert.informativeText=paths.prefix(8).map{String($0.dropFirst(pending.inventory.root.path.count+1))}.joined(separator:"\n")+(paths.count>8 ? "\n…":"")+"\n\n已核对磁盘文稿与未保存草稿。可撤销本次清理，也可从 Finder 废纸篓恢复。";alert.addButton(withTitle:"移入废纸篓");alert.addButton(withTitle:"取消")
            modalBusy=true;let response=alert.runModal();modalBusy=false
            guard response == .alertFirstButtonReturn else{send(["type":"resourceResult","id":id,"cancelled":true]);return}
            var started=false
            try pending.inventory.cleanup(paths,approved:pending.approved,opened:resourceDocuments()){url in
                var trashed:NSURL?;try FileManager.default.trashItem(at:url,resultingItemURL:&trashed)
                if !started{self.resourceTrash=[];self.resourceTrashRoot=pending.inventory.root;started=true}
                if let trashed=trashed{self.resourceTrash.append((url,trashed as URL))}
            }
            pendingResources=nil;send(["type":"resourceResult","id":id,"removed":paths.count,"canUndo":!resourceTrash.isEmpty]);publishWorkspace(invalidate:true)
        }catch{reply("清理已停止：文稿、资源或引用状态发生变化，请重新检查。已移走的资源可撤销或从系统废纸篓恢复。")}
    }
    func restoreResourceTrash(_ body:[String:Any]) {
        guard let id=body["id"] as? String else{return}
        guard !inputComposing,!modalBusy,!resourceTrash.isEmpty,let root=resourceTrashRoot,pendingResources?.inventory.root==root else{send(["type":"resourceResult","id":id,"error":"当前工作区没有可撤销的资源清理。"]);return}
        do {
            for pair in resourceTrash{guard !FileManager.default.fileExists(atPath:pair.source.path),pair.source.deletingLastPathComponent().resolvingSymlinksInPath().path.hasPrefix(root.path+"/") else{throw ResourceError.changed}}
            while let pair=resourceTrash.first{try FileManager.default.moveItem(at:pair.trash,to:pair.source);resourceTrash.removeFirst()}
            send(["type":"resourceResult","id":id,"restored":true]);publishWorkspace(invalidate:true)
        }catch{send(["type":"resourceResult","id":id,"error":"还原未完成：原位置已变化或出现同名文件，没有覆盖现有内容。剩余资源仍在废纸篓。"])}
    }
    func importAttachment(_ body:[String:Any]) {
        guard let id=body["id"] as? String else{return}
        guard ready,!composing,!modalBusy,let url=fileURL else{send(["type":"resourceResult","id":id,"error":"请先保存文稿，再插入附件。"]);return}
        defer{drainDeferredOpens()}
        let panel=NSOpenPanel();panel.title="复制附件到文稿 assets";panel.allowsMultipleSelection=false;panel.canChooseDirectories=false
        modalBusy=true;let response=panel.runModal();modalBusy=false
        guard response == .OK,let source=panel.url else{send(["type":"resourceResult","id":id,"cancelled":true]);return}
        do{let result=try ImageImport.copy(source,beside:url,allowAny:true);send(["type":"resourceResult","id":id,"reference":result.reference,"name":result.name])}
        catch{send(["type":"resourceResult","id":id,"error":"附件复制未完成。仅支持普通文件、每份不超过 20 MB，原文件保持不变。"])}
    }
}
