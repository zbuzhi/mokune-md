import AppKit
extension AppDelegate {
    func publishTabs(){scheduleSession();send(["type":"tabs","active":document.id,"items":documents.map{["id":$0.id,"name":$0.placeholder ? "写作札记.md":$0.displayName,"path":$0.url?.path ?? "","dirty":$0.dirty]}])}
    func activateDocument(_ target:DocumentSession){
        guard !composing else{return}
        document=target;images.root=target.url?.deletingLastPathComponent();images.token=target.imageToken;images.remember()
        window.title="\(target.displayName) — Mokune MD";window.isDocumentEdited=target.dirty
        send(["type":"load","tabID":target.id,"raw":target.raw ?? target.baseline.map{String(decoding:$0,as:UTF8.self)} ?? "","name":target.displayName,"hasPath":target.url != nil,"documentKey":target.url?.path ?? "","imageBase":images.base,"folder":target.url?.deletingLastPathComponent().lastPathComponent ?? "本地文稿","recovered":target.dirty,"savedRaw":target.baseline.map{String(decoding:$0,as:UTF8.self)} ?? "\0","position":target.position.map{$0.payload as Any} ?? NSNull(),"restoreNotice":target.restoreNotice ?? ""])
        publishTabs();publishWorkspace();checkExternalChange()
    }
    func switchTab(_ body:[String:Any]){sessionActiveOverride=nil;guard !composing,!modalBusy,pendingAction==nil,let id=body["id"] as? String,let target=documents.first(where:{$0.id==id}),target !== document else{return};activateDocument(target)}
    func closeTab(_ body:[String:Any]){
        guard !composing,!modalBusy,pendingAction==nil,let id=body["id"] as? String,let target=documents.first(where:{$0.id==id}) else{return}
        if target !== document {activateDocument(target)}
        guarded {
            guard let index=self.documents.firstIndex(where:{$0===target}) else{return}
            self.documents.remove(at:index);self.images.roots.removeValue(forKey:target.imageToken)
            self.send(["type":"tabClosed","id":id]);self.persistRecoveries()
            if self.documents.isEmpty{let empty=DocumentSession();self.documents=[empty];self.activateDocument(empty)}else{self.activateDocument(self.documents[min(index,self.documents.count-1)])}
        }
    }
    @objc func previousTab(){action("previousTab")}
    @objc func nextTab(){action("nextTab")}
    func closeAllDocuments(){
        guard !composing,!modalBusy,pendingAction==nil else{action("closeCancelled");return}
        if sessionActiveOverride==nil{sessionActiveOverride=document.id}
        if let pending=documents.first(where:{$0.dirty}) {
            if pending !== document{activateDocument(pending)}
            let draftBefore=pending.raw
            guarded{
                // Saving/discarding must not remove tabs from the next session.
                if pending.raw==nil,draftBefore != pending.baseline.map({String(decoding:$0,as:UTF8.self)}){self.send(["type":"load","tabID":pending.id,"replace":true,"raw":pending.baseline.map{String(decoding:$0,as:UTF8.self)} ?? "","name":pending.displayName,"hasPath":pending.url != nil,"documentKey":pending.url?.path ?? "","imageBase":self.images.base])}
                self.persistRecoveries();self.closeAllDocuments()
            }
        }else{
            guard flushSessionBeforeTermination() else {return}
            allowClose=true
            if terminationPending{terminationPending=false;NSApp.reply(toApplicationShouldTerminate:true)}else{window.close()}
        }
    }
    func persistRecoveries(){
        persistSession()
        let entries=documents.filter{$0.dirty && $0.raw != nil}

        do{if entries.isEmpty{try? FileManager.default.removeItem(at:recoveryURL);return};try FileManager.default.createDirectory(at:recoveryURL.deletingLastPathComponent(),withIntermediateDirectories:true);try RecoveryArchive.encode(documents).write(to:recoveryURL,options:.atomic)}catch{NSLog("Mokune recovery: %@",error.localizedDescription)}
    }
}
