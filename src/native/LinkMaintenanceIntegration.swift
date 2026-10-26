import AppKit
extension AppDelegate {
    func prepareWorkspaceMove(_ body:[String:Any],directory:WorkspaceDirectory)throws {
        guard pendingWorkspaceMoveID==nil else{throw MovePlanError.changed}
        let id=body["id"] as! String,path=body["path"] as? String ?? "",operation=body["operation"] as? String ?? ""
        guard !path.isEmpty else{throw WorkspaceError.outsideRoot}
        let source=try directory.resolve(path),target=try directory.destination(parent:operation=="rename" ? (path as NSString).deletingLastPathComponent:body["parent"] as? String ?? "",name:operation=="rename" ? body["name"] as? String ?? "":source.lastPathComponent)
        guard source != target else{send(["type":"workspaceMutationResult","id":id,"operation":operation,"oldPath":path,"path":path,"parent":(path as NSString).deletingLastPathComponent]);return}
        guard !target.path.hasPrefix(source.path+"/") else{throw WorkspaceError.recursiveMove}
        guard !FileManager.default.fileExists(atPath:target.path) else{throw WorkspaceError.collision}
        for entry in documents{_ = try directory.relocatedDocument(entry.url,from:source,to:target,baseline:entry.baseline)}
        var opened=[String:(id:String,revision:Int,raw:String)]()
        for entry in documents{if let url=entry.url{opened[url.path]=(entry.id,entry.revision,entry.raw ?? entry.baseline.map{String(decoding:$0,as:UTF8.self)} ?? "")}}
        pendingWorkspaceMoveID=id;let token=workspaceToken
        DispatchQueue.main.asyncAfter(deadline:.now()+20){[weak self] in if self?.pendingWorkspaceMoveID==id{self?.finishWorkspaceMove(id,error:"链接检查超时，原文件尚未移动，请重试。")}}
        DispatchQueue.global(qos:.userInitiated).async {
            let result=Result{try WorkspaceMovePlan.scan(id:id,token:token,operation:operation,directory:directory,source:source,target:target,opened:opened)}
            DispatchQueue.main.async {
                guard self.pendingWorkspaceMoveID==id else{return}
                guard token==self.workspaceToken,!self.composing else{self.finishWorkspaceMove(id,error:"输入或文件夹状态已变化，请重试。 ");return}
                switch result {
                case .success(let plan):self.pendingWorkspaceMove=plan;self.send(plan.payload())
                case .failure:self.finishWorkspaceMove(id,error:"无法完整检查工作区链接，原文件尚未移动。工作区扫描上限为 10,000 份文稿／40 MB，请缩小工作区后重试。")
                }
            }
        }
    }
    func finishWorkspaceMove(_ id:String,error:String){pendingWorkspaceMove=nil;pendingWorkspaceMoveID=nil;send(["type":"workspaceMutationResult","id":id,"error":error])}
    func commitWorkspaceMove(_ body:[String:Any]) {
        guard let id=body["id"] as? String,id==pendingWorkspaceMoveID,let plan=pendingWorkspaceMove,let directory=workspace else{return}
        if let error=body["error"] as? String{finishWorkspaceMove(id,error:error);return}
        guard ready,!composing,!modalBusy,pendingAction==nil,!allowClose,plan.token==workspaceToken,let supplied=body["updates"] as? [[String:Any]] else{finishWorkspaceMove(id,error:"状态已变化，原文件尚未移动，请重试。");return}
        do{
            var updates=[String:Data](),patches=[String:[[String:Any]]]()
            for item in supplied{guard let path=item["path"] as? String,let raw=item["raw"] as? String else{throw MovePlanError.invalidUpdate};let data=Data(raw.utf8);_ = try FileStore.decode(data);updates[path]=data;patches[path]=item["changes"] as? [[String:Any]] ?? []}
            // All open snapshots must still match, including drafts changed during the scan.
            for file in plan.files {
                if let id=file.tabID {
                    guard let entry=documents.first(where:{$0.id==id}),entry.url==file.url,entry.revision==file.revision,(entry.raw ?? entry.baseline.map{String(decoding:$0,as:UTF8.self)} ?? "")==file.raw else{throw MovePlanError.changed}
                    if updates[file.path] != nil {guard entry.baseline==file.disk else{throw MovePlanError.changed}}
                }else if documents.contains(where:{$0.url==file.url}){throw MovePlanError.changed}
            }
            for file in plan.files where updates[file.path] != nil && file.tabID==nil{try versionStore.record(file.disk,document:file.url)}
            try plan.execute(updates,directory:directory)
            var patched=[[String:Any]]()
            for entry in documents {
                guard let url=entry.url else{continue}
                let relocated=WorkspaceMovePlan.relocate(url,from:plan.source,to:plan.target)
                if relocated != url {
                    entry.url=relocated;entry.stamp=stamp(relocated);images.roots[entry.imageToken]=relocated.deletingLastPathComponent()
                    if entry === document{images.root=relocated.deletingLastPathComponent();window.title="\(relocated.lastPathComponent) — Mokune MD"}
                    send(["type":"relocated","tabID":entry.id,"documentKey":relocated.path,"name":relocated.lastPathComponent,"folder":relocated.deletingLastPathComponent().lastPathComponent,"imageBase":"mokune-image://local/\(entry.imageToken)/"])
                }
                if let file=plan.files.first(where:{$0.tabID==entry.id}),let update=updates[file.path]{
                    if var position=entry.position {
                        func mapped(_ offset:Int)->Int{var delta=0;for change in patches[file.path] ?? []{guard let from=change["from"] as? Int,let to=change["to"] as? Int,let insert=change["insert"] as? String else{continue};if offset<from{break};if offset<=to{return from+delta+min(max(0,offset-from),insert.utf16.count)};delta+=insert.utf16.count-(to-from)};return max(0,offset+delta)}
                        position.anchor=mapped(position.anchor);position.head=mapped(position.head);entry.position=position
                    }
                    entry.raw=String(decoding:update,as:UTF8.self);entry.dirty=update != entry.baseline;entry.revision+=1
                    patched.append(["tabID":entry.id,"path":file.path])
                }
            }
            if !patched.isEmpty{send(["type":"linkMaintenance","source":plan.sourcePath,"destination":plan.targetPath,"tabs":patched])}
            pendingWorkspaceMove=nil;pendingWorkspaceMoveID=nil;persistRecoveries();publishTabs();publishWorkspace(invalidate:true)
            send(["type":"workspaceMutationResult","id":id,"operation":plan.operation,"oldPath":plan.sourcePath,"path":plan.targetPath,"parent":(plan.targetPath as NSString).deletingLastPathComponent,"message":"已移动，并维护 \(updates.count) 份文稿的相对链接"])
        }catch MovePlanError.rollback{finishWorkspaceMove(id,error:"移动未完整完成，部分文件发生外部变化，无法安全回退。编辑与历史副本已保留，请检查文件树。 ");publishWorkspace(invalidate:true)}
        catch{finishWorkspaceMove(id,error:"文件或编辑在检查后发生变化，未覆盖你的内容；请重试移动。")}
    }
}
