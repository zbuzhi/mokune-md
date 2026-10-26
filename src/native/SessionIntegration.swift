import AppKit
extension AppDelegate {
    var sessionURL:URL{recoveryURL.deletingLastPathComponent().appendingPathComponent("session.json")}
    func scheduleSession(){
        guard ready,!restoringSession else{return}
        sessionWrite?.cancel();let job=DispatchWorkItem{[weak self] in self?.persistSession()};sessionWrite=job;DispatchQueue.main.asyncAfter(deadline:.now()+0.4,execute:job)
    }
    func flushSessionBeforeTermination()->Bool {
        sessionWrite?.cancel()
        guard ready,!restoringSession,!composing else{action("closeCancelled");return false}
        do{
            try FileManager.default.createDirectory(at:sessionURL.deletingLastPathComponent(),withIntermediateDirectories:true)
            try SessionArchive(documents,active:sessionActiveOverride ?? document.id).encode().write(to:sessionURL,options:.atomic)
            return true
        }catch{
            action("closeCancelled");self.error("会话保存失败，已取消退出或更新，请检查磁盘空间后重试：\(error.localizedDescription)")
            return false
        }
    }
    func persistSession(){
        sessionWrite?.cancel()
        guard ready,!restoringSession else{return}
        do{
            try FileManager.default.createDirectory(at:sessionURL.deletingLastPathComponent(),withIntermediateDirectories:true)
            try SessionArchive(documents,active:sessionActiveOverride ?? document.id).encode().write(to:sessionURL,options:.atomic)
        }catch{NSLog("Mokune session: %@",error.localizedDescription)}
    }
    func restoreSession()->Bool {
        guard UserDefaults.standard.object(forKey:"Mokune.ResumeLastDocument") as? Bool != false,
              let data=try? Data(contentsOf:sessionURL),let archive=try? SessionArchive.decode(data),!archive.tabs.isEmpty else{return false}
        restoringSession=true;defer{restoringSession=false}
        documents=archive.restore()
        // recovery.json can be newer than session.json if a previous write was interrupted.
        if let data=try? Data(contentsOf:recoveryURL),let drafts=try? RecoveryArchive.decode(data){
            for draft in drafts {
                guard let raw=draft["raw"] as? String else{continue}
                let id=draft["id"] as? String,path=draft["path"] as? String
                let existing=documents.first{(id != nil && $0.id==id)||(path != nil && $0.url?.path==path)}
                let entry=existing ?? DocumentSession(id:id ?? UUID().uuidString)
                guard existing != nil || documents.count<30 else{continue}
                entry.raw=raw;entry.dirty=true
                if let base=draft["baseline"] as? String{entry.baseline=Data(base64Encoded:base)}
                if existing==nil{entry.name=draft["name"] as? String ?? "恢复文稿.md";if let path=path,FileManager.default.fileExists(atPath:path){entry.url=URL(fileURLWithPath:path)};documents.append(entry)}
            }
        }
        let selected=documents.first{$0.id==archive.active} ?? documents[0]
        activateDocument(selected)
        publishTabs();return true
    }
}
