import AppKit
extension AppDelegate {
    func copyTableText(_ body:[String:Any],to pasteboard:NSPasteboard = .general) {
        guard let id=body["id"] as? String else{return}
        guard !composing,let text=body["text"] as? String,text.utf8.count<=1024*1024 else{send(["type":"clipboardResult","id":id,"error":"候选输入未完成或表格超过复制上限。"]);return}
        pasteboard.clearContents()
        let success=pasteboard.setString(text,forType:.string)
        send(success ? ["type":"clipboardResult","id":id] : ["type":"clipboardResult","id":id,"error":"未能写入系统剪贴板，请重试。"])
    }
    @objc func showPreferences(){if ready && !composing{action("preferences")}}
    @objc func toggleReading(){if ready && !composing{action("reading")}}
    @objc func documentStatistics(){if ready && !composing{action("statistics")}}
    @objc func toggleTask(){if ready && !composing{action("toggleTask")}}
    @objc func goTo(){if ready && !composing{action("goTo")}}
    @objc func showCommands(){if ready && !composing{action("commands")}}
    @objc func quickOpen(){if ready && !composing{action("quickOpen")}}
    func queryWorkspaceFiles(_ body:[String:Any]) {
        guard let id=body["id"] as? String else{return}
        guard let directory=workspace else{send(["type":"workspaceFiles","id":id,"error":"先打开文件夹（⌘⇧O），再快速查找文稿。"]);return}
        let token=workspaceToken
        if let cached=workspaceIndexCache,cached.token==token{send(["type":"workspaceFiles","id":id,"token":token,"items":cached.items,"truncated":cached.truncated]);return}
        DispatchQueue.global(qos:.userInitiated).async{
            let result=WorkspaceIndex.files(in:directory)
            DispatchQueue.main.async{guard self.workspaceToken==token else{self.send(["type":"workspaceFiles","id":id,"error":"文件夹已切换，请重新查找。"]);return};self.workspaceIndexCache=(token,result.items,result.truncated);self.send(["type":"workspaceFiles","id":id,"token":token,"items":result.items,"truncated":result.truncated])}
        }
    }
    @objc func workspaceSearch(){if ready && !composing{action("workspaceSearch")}}
    func searchWorkspace(_ body:[String:Any]){
        guard let id=body["id"] as? String,let query=body["query"] as? String else{return}
        guard let directory=workspace else{send(["type":"workspaceSearchResults","id":id,"error":"请先打开文件夹（⌘⇧O）。"]);return}
        let token=workspaceToken,cached=workspaceIndexCache
        workspaceSearchQueue.cancelAllOperations()
        let operation=BlockOperation()
        operation.addExecutionBlock{[weak operation] in
            let files=cached?.token==token ? cached!.items:WorkspaceIndex.files(in:directory).items
            let result=WorkspaceSearch.find(query,in:directory,files:files,cancelled:{operation?.isCancelled != false})
            DispatchQueue.main.async{guard self.workspaceToken==token else{self.send(["type":"workspaceSearchResults","id":id,"error":"文件夹已切换。"]);return};self.send(["type":"workspaceSearchResults","id":id,"token":token,"items":result.items,"truncated":result.truncated])}
        }
        workspaceSearchQueue.addOperation(operation)
    }

}
