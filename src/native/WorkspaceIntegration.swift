import AppKit

extension AppDelegate {
    @objc func openFolder() {
        guard ready,!composing else {return}
        let panel=NSOpenPanel();panel.canChooseDirectories=true;panel.canChooseFiles=false;panel.allowsMultipleSelection=false
        panel.title="打开 Markdown 文件夹";panel.prompt="打开文件夹"
        if panel.runModal() == .OK,let url=panel.url {setWorkspace(url)}
        action("focusEditor")
    }
    @objc func showOutline(){action("outline")}
    func setWorkspace(_ root:URL?) {
        workspaceIndexCache=nil;workspace=root.map{WorkspaceDirectory(root:$0)};workspaceToken=UUID().uuidString
        if let root=root {UserDefaults.standard.set(root.path,forKey:"Mokune.WorkspacePath")}else{UserDefaults.standard.removeObject(forKey:"Mokune.WorkspacePath")}
        watchWorkspace();publishWorkspace(invalidate:true)
    }
    func restoreWorkspace() {
        defer {watchWorkspace()}
        if let path=UserDefaults.standard.string(forKey:"Mokune.WorkspacePath") {
            let url=URL(fileURLWithPath:path,isDirectory:true);var directory:ObjCBool=false
            if FileManager.default.fileExists(atPath:url.path,isDirectory:&directory),directory.boolValue {workspace=WorkspaceDirectory(root:url)}
        }
    }
    func adoptDocumentFolderIfNeeded() {
        if workspace == nil,let url=fileURL {workspace=WorkspaceDirectory(root:url.deletingLastPathComponent());workspaceToken=UUID().uuidString;watchWorkspace()}
    }
    func publishWorkspace(invalidate:Bool=false) {
        guard let directory=workspace else {send(["type":"workspace","token":NSNull(),"children":[],"currentPath":NSNull()]);return}
        let token=workspaceToken,current=fileURL.flatMap{directory.relative($0)},document=fileURL
        DispatchQueue.global(qos:.userInitiated).async {
            do {
                let result=try directory.children("")
                DispatchQueue.main.async {
                    guard self.workspaceToken==token,self.fileURL==document else{return}
                    self.send(["type":"workspace","token":token,"name":directory.root.lastPathComponent,"children":result.items,"truncated":result.truncated,"invalidate":invalidate,"currentPath":current.map { $0 as Any } ?? NSNull()])
                }
            }catch{DispatchQueue.main.async{if self.workspaceToken==token{self.send(["type":"workspaceError","message":"文件夹暂时无法读取，请重新打开文件夹。"] )}}}
        }
    }
    func readWorkspaceDirectory(_ body:[String:Any]) {
        guard let id=body["id"] as? String,let path=body["path"] as? String else{return}
        guard let directory=workspace,body["workspaceToken"] as? String==workspaceToken else{send(["type":"directoryChildren","id":id,"error":"文件夹已切换。"]);return}
        let token=workspaceToken
        DispatchQueue.global(qos:.userInitiated).async {
            do {
                let result=try directory.children(path)
                DispatchQueue.main.async {
                    guard self.workspaceToken==token else{return}
                    self.send(["type":"directoryChildren","id":id,"path":path,"children":result.items,"truncated":result.truncated])
                }
            }catch{DispatchQueue.main.async{self.send(["type":"directoryChildren","id":id,"error":"无法读取此目录，请检查文件权限。"] )}}
        }
    }
    func openWorkspaceFile(_ body:[String:Any]) {
        guard ready,!composing,body["workspaceToken"] as? String==workspaceToken,let directory=workspace,let path=body["path"] as? String else{return}
        do {
            let url=try directory.resolve(path),values=try url.resourceValues(forKeys:[.isRegularFileKey])
            guard values.isRegularFile==true,WorkspaceDirectory.extensions.contains(url.pathExtension.lowercased()) else{return}
            do{self.open(url);if self.fileURL==url,let line=body["line"] as? Int {self.send(["type":"action","action":"navigateLine","line":line])}}
        }catch{send(["type":"workspaceError","message":"文稿无法打开，可能已被移动或没有读取权限。"])}
    }
    func watchWorkspace() {
        workspaceRefresh?.cancel();workspaceWatcher=nil
        if let root=workspace?.root {workspaceWatcher=WorkspaceWatcher(root:root){[weak self] in self?.scheduleWorkspaceRefresh()}}
    }
    func scheduleWorkspaceRefresh() {
        workspaceIndexCache=nil
        workspaceRefresh?.cancel()
        let job=DispatchWorkItem{[weak self] in
            guard let self=self else{return}
            if self.composing {self.scheduleWorkspaceRefresh();return}
            self.publishWorkspace(invalidate:true)
        }
        workspaceRefresh=job;DispatchQueue.main.asyncAfter(deadline:.now()+0.35,execute:job)
    }
    func mutateWorkspace(_ body:[String:Any]) {
        guard let id=body["id"] as? String else{return}
        func reply(_ error:String){send(["type":"workspaceMutationResult","id":id,"error":error])}
        guard ready,!composing else {reply("请先完成当前输入，再整理文件。");return}
        guard let directory=workspace,body["workspaceToken"] as? String==workspaceToken else {reply("文件夹已切换，请重试。");return}
        let operation=body["operation"] as? String ?? "",path=body["path"] as? String ?? "",parent=body["parent"] as? String ?? "",name=body["name"] as? String ?? ""
        if ["trash","restoreTrash","reveal"].contains(operation){workspaceRemoval(body,directory:directory);return}
        do {
            if operation=="rename"||operation=="move"{try prepareWorkspaceMove(body,directory:directory);return}
            guard pendingWorkspaceMoveID==nil else{reply("正在维护移动后的链接，请稍候。");return}
            let target:URL
            if operation=="createFile"||operation=="createFolder" {
                target=try directory.create(parent:parent,name:name,folder:operation=="createFolder")
            }else {reply("未知文件操作。");return}
            persistRecoveries();publishTabs()

            send(["type":"workspaceMutationResult","id":id,"operation":operation,"oldPath":path,"path":directory.relative(target) ?? "","parent":directory.relative(target.deletingLastPathComponent()) ?? ""])
            publishWorkspace(invalidate:true)
            if operation=="createFile" {open(target)}
        }catch WorkspaceError.documentConflict {send(["type":"conflict"]);reply("磁盘文稿已变化。请先处理外部更改，再移动或重命名。") }
        catch WorkspaceError.collision {reply("同名项目已存在，请换一个名字。")}
        catch WorkspaceError.invalidName {reply("名称不能以点开头或包含 /、:；文稿请使用 .md、.markdown 或 .txt。")}
        catch WorkspaceError.recursiveMove {reply("不能把文件夹移入它自己或它的子目录。")}
        catch {reply("操作未完成，原有文稿保留：\(error.localizedDescription)")}
    }

}
