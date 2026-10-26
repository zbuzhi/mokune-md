import AppKit
extension AppDelegate {
    @objc func revealCurrentDocument(){guard let url=fileURL else{error("请先保存文稿，再在 Finder 中显示。");return};NSWorkspace.shared.activateFileViewerSelecting([url])}
    func workspaceRemoval(_ body:[String:Any],directory:WorkspaceDirectory){
        guard let id=body["id"] as? String else{return};let operation=body["operation"] as? String ?? "",path=body["path"] as? String ?? ""
        func reply(_ error:String){send(["type":"workspaceMutationResult","id":id,"error":error])}
        do {
            if operation=="reveal"{let url=try directory.resolve(path);NSWorkspace.shared.activateFileViewerSelecting([url]);send(["type":"workspaceMutationResult","id":id,"operation":"reveal"]);return}
            if operation=="restoreTrash"{
                guard let last=lastTrashed,last.source.path.hasPrefix(directory.root.path+"/") else{reply("没有可以在当前文件夹撤销的移除操作。");return}
                guard let relative=directory.relative(last.source) else{throw WorkspaceError.outsideRoot}
                let destination=try directory.destination(parent:(relative as NSString).deletingLastPathComponent,name:last.source.lastPathComponent)
                guard destination.path==last.source.path else{throw WorkspaceError.outsideRoot}
                guard !FileManager.default.fileExists(atPath:last.source.path) else{reply("原位置已有同名项目，未覆盖；原文件仍在废纸篓。");return}
                try FileManager.default.moveItem(at:last.trash,to:last.source);lastTrashed=nil
                send(["type":"workspaceMutationResult","id":id,"operation":"restoreTrash"]);publishWorkspace(invalidate:true)
                if WorkspaceDirectory.extensions.contains(last.source.pathExtension.lowercased()){open(last.source)};return
            }
            let plan=try WorkspaceRemoval.plan(path,in:directory,documents:documents)
            let alert=NSAlert();alert.messageText="将“\(plan.source.lastPathComponent)”移入废纸篓？";alert.informativeText="可从 Finder 废纸篓还原，或立即撤销本次移除。已保存的相关标签会关闭。";alert.addButton(withTitle:"移入废纸篓");alert.addButton(withTitle:"取消")
            guard alert.runModal() == .alertFirstButtonReturn else{reply("已取消移入废纸篓。");return}
            // Recheck after the modal in case an external editor changed a file.
            _=try WorkspaceRemoval.plan(path,in:directory,documents:documents)
            var trashed:NSURL?;try FileManager.default.trashItem(at:plan.source,resultingItemURL:&trashed)
            if let trashed=trashed{lastTrashed=(plan.source,trashed as URL)}
            let wasActive=plan.affected.contains(where:{$0===document})
            for entry in plan.affected{documents.removeAll{$0===entry};images.roots.removeValue(forKey:entry.imageToken);send(["type":"tabClosed","id":entry.id])}
            persistRecoveries()
            if wasActive{if documents.isEmpty{documents=[DocumentSession()]};activateDocument(documents[0])}
            send(["type":"workspaceMutationResult","id":id,"operation":"trash","path":path,"parent":(path as NSString).deletingLastPathComponent,"canUndo":lastTrashed != nil]);publishTabs();publishWorkspace(invalidate:true)
        }catch WorkspaceRemovalError.unsaved(let count){reply("包含 \(count) 份未保存文稿。请先保存或另存，再移入废纸篓；编辑内容仍保留。")}
        catch WorkspaceRemovalError.changed{reply("相关文稿存在外部更改。请先处理版本冲突，未移除任何内容。")}
        catch{reply("操作未完成，未覆盖原位置：\(error.localizedDescription)。已移除的项目可从 Finder 废纸篓恢复。")}
    }
}
