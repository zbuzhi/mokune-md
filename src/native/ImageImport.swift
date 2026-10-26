import Foundation

enum ImageImportError:Error{case unsupported,tooLarge,unsafeAssets,empty}
struct ImageImport {
    static let extensions:Set<String>=["png","jpg","jpeg","gif","webp","avif","svg","heic"]
    static func copy(_ source:URL,beside document:URL,allowAny:Bool=false)throws->(reference:String,name:String){
        guard allowAny||extensions.contains(source.pathExtension.lowercased()) else{throw ImageImportError.unsupported}
        let values=try source.resourceValues(forKeys:[.isRegularFileKey,.isSymbolicLinkKey,.isPackageKey]);guard values.isRegularFile==true,values.isSymbolicLink != true,values.isPackage != true else{throw ImageImportError.unsupported}
        let sourceHandle=try FileHandle(forReadingFrom:source);defer{try? sourceHandle.close()}
        let data=try sourceHandle.read(upToCount:20*1024*1024+1) ?? Data()
        return try write(data,name:source.lastPathComponent,beside:document,allowAny:allowAny)
    }
    static func write(_ data:Data,name:String,beside document:URL,allowAny:Bool=false)throws->(reference:String,name:String){
        let source=URL(fileURLWithPath:name)
        guard allowAny||extensions.contains(source.pathExtension.lowercased()) else{throw ImageImportError.unsupported}
        guard allowAny || !data.isEmpty else{throw ImageImportError.empty};guard data.count<=20*1024*1024 else{throw ImageImportError.tooLarge}
        let root=document.deletingLastPathComponent().standardizedFileURL.resolvingSymlinksInPath(),assets=root.appendingPathComponent("assets",isDirectory:true),manager=FileManager.default
        if manager.fileExists(atPath:assets.path){let values=try assets.resourceValues(forKeys:[.isSymbolicLinkKey,.isDirectoryKey]);guard values.isSymbolicLink != true,values.isDirectory==true,assets.resolvingSymlinksInPath().path==assets.path else{throw ImageImportError.unsafeAssets}}
        else{try manager.createDirectory(at:assets,withIntermediateDirectories:false)}
        let originalStem=String(source.deletingPathExtension().lastPathComponent.prefix(80)),stem=originalStem.hasPrefix(".") ? "附件-"+originalStem:originalStem,ext=source.pathExtension.lowercased()
        for suffix in 1...1000{
            let name=stem+(suffix==1 ? "":"-\(suffix)")+(ext.isEmpty ? "":"."+ext),target=assets.appendingPathComponent(name)
            if manager.fileExists(atPath:target.path){continue}
            do {try data.write(to:target,options:.withoutOverwriting)}catch{if manager.fileExists(atPath:target.path){continue};throw error}
            var allowed=CharacterSet.urlPathAllowed;allowed.remove(charactersIn:"?#()[]\\")
            let reference="assets/"+(name.addingPercentEncoding(withAllowedCharacters:allowed) ?? name)
            return (reference,name)
        }
        throw CocoaError(.fileWriteFileExists)
    }
}
