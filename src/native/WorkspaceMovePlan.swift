import Foundation

enum MovePlanError:Error {case changed,tooLarge,invalidUpdate,rollback}
struct WorkspaceMovePlan {
    struct File {
        let path:String,url:URL,disk:Data,raw:String,tabID:String?,revision:Int?
    }
    let id:String,token:String,operation:String,source:URL,target:URL,sourcePath:String,targetPath:String,files:[File],scannedPaths:Set<String>
    static func relocate(_ url:URL,from:URL,to:URL)->URL {
        url.path==from.path||url.path.hasPrefix(from.path+"/") ? URL(fileURLWithPath:to.path+String(url.path.dropFirst(from.path.count))):url
    }
    static func scan(id:String,token:String,operation:String,directory:WorkspaceDirectory,source:URL,target:URL,opened:[String:(id:String,revision:Int,raw:String)])throws->Self {
        let index=WorkspaceIndex.files(in:directory);guard !index.truncated else{throw MovePlanError.tooLarge}
        var budget=40*1024*1024,files=[File]()
        for item in index.items {
            guard let path=item["path"] else{continue};let url=try directory.resolve(path)
            let size=try url.resourceValues(forKeys:[.fileSizeKey]).fileSize ?? 0
            guard size<=20*1024*1024,size<=budget else{throw MovePlanError.tooLarge};budget-=size
            let data=try Data(contentsOf:url)
            guard let raw=try? FileStore.decode(data) else{continue}
            let tab=opened[url.path]
            files.append(File(path:path,url:url,disk:data,raw:tab?.raw ?? raw,tabID:tab?.id,revision:tab?.revision))
        }
        return Self(id:id,token:token,operation:operation,source:source,target:target,sourcePath:directory.relative(source)!,targetPath:directory.relative(target)!,files:files,scannedPaths:Set(index.items.compactMap{$0["path"]}))
    }
    func payload()->[String:Any]{["type":"workspaceMovePlan","id":id,"source":sourcePath,"destination":targetPath,"documents":files.map{["path":$0.path,"raw":$0.raw]}]}
    // Multi-file changes preflight every baseline and roll back only bytes written by this operation.
    func execute(_ updates:[String:Data],directory:WorkspaceDirectory,writer:(Data,URL,Data?)throws->Void={try FileStore.atomicWrite($0,to:$1,baseline:$2)})throws {
        let current=WorkspaceIndex.files(in:directory)
        guard !current.truncated,Set(current.items.compactMap{$0["path"]})==scannedPaths else{throw MovePlanError.changed}
        guard Set(updates.keys).isSubset(of:Set(files.map{$0.path})) else{throw MovePlanError.invalidUpdate}
        for file in files where updates[file.path] != nil || Self.relocate(file.url,from:source,to:target) != file.url {
            guard (try? Data(contentsOf:file.url))==file.disk else{throw MovePlanError.changed}
        }
        let closed=files.filter{$0.tabID==nil && updates[$0.path] != nil}
        var written=[File](),moved=false
        do {
            _ = try directory.move(path:sourcePath,parent:(targetPath as NSString).deletingLastPathComponent,name:target.lastPathComponent);moved=source != target
            for file in closed {
                let url=Self.relocate(file.url,from:source,to:target)
                try writer(updates[file.path]!,url,file.disk);written.append(file)
            }
        }catch{
            var failed=false
            for file in written.reversed(){let url=Self.relocate(file.url,from:source,to:target);do{try writer(file.disk,url,updates[file.path])}catch{failed=true}}
            if moved{do{try FileManager.default.moveItem(at:target,to:source)}catch{failed=true}}
            if failed{throw MovePlanError.rollback};throw error
        }
    }
}
