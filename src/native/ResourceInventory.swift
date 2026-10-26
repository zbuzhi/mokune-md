import Foundation

enum ResourceError:Error {case limit,incomplete,changed,outside,referenced}
struct ResourceDocument {
    let id:String?,path:String?,name:String,raw:String,revision:Int?,disk:Data?
    var payload:[String:Any]{["id":id.map{$0 as Any} ?? NSNull(),"path":path.map{$0 as Any} ?? NSNull(),"name":name,"raw":raw]}
}
struct ResourceInventory {
    struct Asset {
        let path:String,name:String,relative:String,size:Int,modified:Double,image:Bool,eligible:Bool,open:Bool,managed:Bool
        var payload:[String:Any]{["path":path,"name":name,"relative":relative,"size":size,"modified":modified,"image":image,"eligible":eligible,"open":open,"managed":managed]}
    }
    let root:URL,files:[String:String],paths:[String],assets:[Asset],documents:[ResourceDocument],complete:Bool
    var caseSensitive:Bool{(try? root.resourceValues(forKeys:[.volumeSupportsCaseSensitiveNamesKey]))?.volumeSupportsCaseSensitiveNames ?? false}
    static let attachments:Set<String>=["pdf","zip","7z","tar","gz","doc","docx","xls","xlsx","ppt","pptx","csv","mp3","wav","m4a","mp4","mov","webm","woff","woff2"]
    static func stamp(_ url:URL)throws->String{
        let value=try url.resourceValues(forKeys:[.fileResourceIdentifierKey,.fileSizeKey,.contentModificationDateKey,.isSymbolicLinkKey])
        guard value.isSymbolicLink != true else{throw ResourceError.outside}
        return "\(value.fileSize ?? 0):\(value.contentModificationDate?.timeIntervalSince1970 ?? 0):\(String(describing:value.fileResourceIdentifier))"
    }
    static func scan(root:URL,opened:[ResourceDocument],cancelled:()->Bool={false})throws->Self {
        let root=root.standardizedFileURL.resolvingSymlinksInPath(),fm=FileManager.default
        var complete=true
        guard let enumerator=fm.enumerator(at:root,includingPropertiesForKeys:[.isDirectoryKey,.isRegularFileKey,.isSymbolicLinkKey,.isPackageKey,.fileSizeKey,.contentModificationDateKey],options:[.skipsHiddenFiles],errorHandler:{_,_ in complete=false;return true}) else{throw ResourceError.incomplete}
        var files=[String:String](),paths=[root.path],assets=[Asset](),docs=[ResourceDocument](),budget=40*1024*1024,items=0
        for case let enumerated as URL in enumerator {
            let url=enumerated.standardizedFileURL.resolvingSymlinksInPath()
            if cancelled(){throw ResourceError.incomplete}
            items+=1;guard items<=20000 else{throw ResourceError.limit}
            let values=try enumerated.resourceValues(forKeys:[.isDirectoryKey,.isRegularFileKey,.isSymbolicLinkKey,.isPackageKey,.fileSizeKey,.contentModificationDateKey])
            if ["node_modules",".git",".build"].contains(url.lastPathComponent){enumerator.skipDescendants();continue}
            if values.isSymbolicLink==true{enumerator.skipDescendants();complete=false;continue}
            if values.isPackage==true{enumerator.skipDescendants();complete=false;continue}
            guard url.resolvingSymlinksInPath().path.hasPrefix(root.path+"/") else{throw ResourceError.outside}
            paths.append(url.path)
            guard values.isRegularFile==true else{continue}
            let fingerprint=try stamp(url);files[url.path]=fingerprint
            let size=values.fileSize ?? 0,ext=url.pathExtension.lowercased(),relative=String(url.path.dropFirst(root.path.count+1)),tab=opened.first{$0.path==url.path}
            let managed=relative.split(separator:"/").dropLast().contains("assets")
            if managed||ImageImport.extensions.contains(ext)||attachments.contains(ext) {
                guard assets.count<2000 else{throw ResourceError.limit}
                assets.append(Asset(path:url.path,name:url.lastPathComponent,relative:relative,size:size,modified:values.contentModificationDate?.timeIntervalSince1970 ?? 0,image:ImageImport.extensions.contains(ext),eligible:managed&&(ImageImport.extensions.contains(ext)||attachments.contains(ext)),open:tab != nil,managed:managed))
            }
            // Bound every byte read, including unknown binaries, and skip known binary formats.
            let binary=ImageImport.extensions.subtracting(["svg"]).union(attachments.subtracting(["csv"]))
            if !binary.contains(ext) {
                if !WorkspaceDirectory.extensions.contains(ext)&&size>2*1024*1024{complete=false;continue}
                guard size<=20*1024*1024,size<=budget else{throw ResourceError.limit};budget-=size
                let data=try Data(contentsOf:url)
                if let raw=try? FileStore.decode(data){docs.append(ResourceDocument(id:tab?.id,path:url.path,name:relative,raw:tab?.raw ?? raw,revision:tab?.revision,disk:data));if let tab=tab,tab.raw != raw{docs.append(ResourceDocument(id:nil,path:url.path,name:"磁盘 · "+relative,raw:raw,revision:nil,disk:data))}}
                else if WorkspaceDirectory.extensions.contains(ext){complete=false}
            }

        }
        for tab in opened where !docs.contains(where:{$0.id==tab.id && tab.id != nil}){docs.append(tab)}
        return Self(root:root,files:files,paths:paths,assets:assets.sorted{$0.relative.localizedStandardCompare($1.relative) == .orderedAscending},documents:docs,complete:complete)
    }
    func validate(opened:[ResourceDocument])throws {
        let old=documents.filter{$0.id != nil}
        guard Set(old.compactMap{$0.id})==Set(opened.compactMap{$0.id}) else{throw ResourceError.changed}
        for doc in old{guard let current=opened.first(where:{$0.id==doc.id}),current.path==doc.path,current.raw==doc.raw,current.revision==doc.revision else{throw ResourceError.changed}}
        let current=try Self.scan(root:root,opened:opened)
        guard complete,current.complete,current.files==files,Set(current.paths)==Set(paths) else{throw ResourceError.changed}
        for doc in documents{if let path=doc.path,let baseline=doc.disk{guard (try? Data(contentsOf:URL(fileURLWithPath:path)))==baseline else{throw ResourceError.changed}}}
    }
    func cleanup(_ selected:[String],approved:Set<String>,opened:[ResourceDocument],move:(URL)throws->Void)throws {
        guard complete,!selected.isEmpty,Set(selected).count==selected.count,Set(selected).isSubset(of:approved) else{throw ResourceError.referenced}
        try validate(opened:opened)
        for path in selected {
            guard let asset=assets.first(where:{$0.path==path}),asset.eligible,!asset.open else{throw ResourceError.referenced}
            let url=URL(fileURLWithPath:path)
            guard url.standardizedFileURL.resolvingSymlinksInPath().path==path,(try? Self.stamp(url))==files[path] else{throw ResourceError.changed}
        }
        for path in selected{try move(URL(fileURLWithPath:path))}
    }
}
