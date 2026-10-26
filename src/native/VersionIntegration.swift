import AppKit
extension AppDelegate {
    var versionStore:VersionStore{VersionStore(root:recoveryURL.deletingLastPathComponent().appendingPathComponent("versions"))}
    @objc func showVersions(){if ready && !composing{action("versions")}}
    func compareDisk(_ body:[String:Any]) {
        guard let id=body["id"] as? String else{return}
        guard ready,!inputComposing,!modalBusy,let url=fileURL else{send(["type":"documentData","id":id,"error":"请先保存文稿，再比较磁盘版本。"]);return}
        do {
            let bytes=try Data(contentsOf:url),raw=try FileStore.decode(bytes)
            if let current=body["raw"] as? String,let revision=body["revision"] as? Int,revision==document.revision {
                let snapshot=DiskMergeSnapshot(url:url,current:Data(current.utf8),baseline:document.baseline,revision:revision,disk:bytes);document.diskMergeSnapshot=snapshot
                send(["type":"documentData","id":id,"raw":raw,"token":images.token,"snapshot":snapshot.id])
            }else{send(["type":"documentData","id":id,"raw":raw,"token":images.token])}
        }catch{send(["type":"documentData","id":id,"error":"磁盘文稿无法读取，当前编辑仍保留：\(error.localizedDescription)"])}
    }
    func validateMerge(_ body:[String:Any]) {
        guard let id=body["id"] as? String else{return}
        do {
            guard ready,!inputComposing,!modalBusy,pendingAction==nil,let snapshot=document.diskMergeSnapshot,let token=body["snapshot"] as? String,let url=fileURL,let raw=body["raw"] as? String,let revision=body["revision"] as? Int,document.revision==revision,document.raw==raw else{throw FileStoreError.conflict}
            try snapshot.validate(id:token,url:url,current:Data(raw.utf8),baseline:document.baseline,revision:revision)
            // Preserve both inputs before allowing the editor to apply a merge. Never write the document here.
            try versionStore.record(snapshot.current,document:url);try versionStore.record(snapshot.disk,document:url)
            try snapshot.validate(id:token,url:url,current:Data(raw.utf8),baseline:document.baseline,revision:document.revision)
            let authorization=UUID().uuidString;document.mergeAuthorization=(authorization,snapshot.disk)
            send(["type":"documentData","id":id,"mergeToken":authorization])
        }catch{send(["type":"documentData","id":id,"error":"磁盘或当前文稿已变化，未应用合并。请重新比较；当前编辑保持原样。"])}
    }
    func versionRequest(_ body:[String:Any]) {
        guard let id=body["id"] as? String else{return}
        func reply(_ value:[String:Any]){var result=value;result["type"]="documentData";result["id"]=id;send(result)}
        guard let url=fileURL else{reply(["error":"请先保存文稿，再使用版本历史。"]);return}
        do {
            if body["operation"] as? String == "read" {
                guard body["token"] as? String==images.token,let version=body["version"] as? String else{throw CocoaError(.fileReadNoPermission)}
                reply(["raw":try FileStore.decode(versionStore.read(version,document:url)),"token":images.token])
            }else {
                let entries=versionStore.list(url).map{["id":$0.id,"date":ISO8601DateFormatter().string(from:$0.date),"bytes":$0.bytes] as [String:Any]}
                reply(["items":entries,"token":images.token])
            }
        }catch{reply(["error":"无法读取这个版本：\(error.localizedDescription)"])}
    }
}
