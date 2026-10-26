import Foundation

enum WorkspaceError: Error { case outsideRoot, notDirectory, notFound, invalidName, collision, recursiveMove, documentConflict }
struct WorkspaceDirectory {
    let root: URL
    static let extensions: Set<String> = ["md","markdown","txt"]
    init(root:URL) { self.root=root.standardizedFileURL.resolvingSymlinksInPath() }
    func resolve(_ relative:String) throws -> URL {
        guard !relative.hasPrefix("/"), !relative.contains("\0") else { throw WorkspaceError.outsideRoot }
        let path=root.appendingPathComponent(relative)
        guard FileManager.default.fileExists(atPath:path.path) else {throw WorkspaceError.notFound}
        let candidate=path.standardizedFileURL.resolvingSymlinksInPath()
        guard candidate.path==root.path||candidate.path.hasPrefix(root.path=="/" ? "/":root.path+"/") else { throw WorkspaceError.outsideRoot }
        return candidate
    }
    func relative(_ url:URL) -> String? {
        let url=url.standardizedFileURL.resolvingSymlinksInPath()
        let prefix=root.path=="/" ? "/":root.path+"/"
        guard url.path.hasPrefix(prefix) else {return nil}
        return String(url.path.dropFirst(prefix.count))
    }
    func destination(parent:String,name:String) throws -> URL {
        guard !name.isEmpty,name==name.trimmingCharacters(in:.whitespacesAndNewlines),name != ".",name != "..",!name.hasPrefix("."),name.utf8.count<=255,!name.contains(where:{"/:\0\n\r".contains($0)}) else {throw WorkspaceError.invalidName}
        let directory=try resolve(parent),values=try directory.resourceValues(forKeys:[.isDirectoryKey])
        guard values.isDirectory==true else {throw WorkspaceError.notDirectory}
        return directory.appendingPathComponent(name)
    }
    func create(parent:String,name:String,folder:Bool) throws -> URL {
        let target=try destination(parent:parent,name:name)
        guard folder||Self.extensions.contains(target.pathExtension.lowercased()) else {throw WorkspaceError.invalidName}
        guard !FileManager.default.fileExists(atPath:target.path) else {throw WorkspaceError.collision}
        if folder {try FileManager.default.createDirectory(at:target,withIntermediateDirectories:false)}
        else {try Data().write(to:target,options:.withoutOverwriting)}
        return target
    }
    func move(path:String,parent:String,name:String?=nil) throws -> URL {
        guard !path.isEmpty else {throw WorkspaceError.outsideRoot}
        let source=try resolve(path),target=try destination(parent:parent,name:name ?? source.lastPathComponent)
        let folder=try source.resourceValues(forKeys:[.isDirectoryKey]).isDirectory==true
        guard folder||Self.extensions.contains(target.pathExtension.lowercased()) else {throw WorkspaceError.invalidName}
        guard source != target else {return source}
        guard !target.path.hasPrefix(source.path+"/") else {throw WorkspaceError.recursiveMove}
        guard !FileManager.default.fileExists(atPath:target.path) else {throw WorkspaceError.collision}
        // moveItem fails on a collision; never replace a user's existing file.
        try FileManager.default.moveItem(at:source,to:target)
        return target
    }
    func relocatedDocument(_ current:URL?,from source:URL,to target:URL,baseline:Data?) throws -> URL? {
        guard let current=current,current.path==source.path||current.path.hasPrefix(source.path+"/") else {return nil}
        guard let disk=try? Data(contentsOf:current),disk==baseline else {throw WorkspaceError.documentConflict}
        return URL(fileURLWithPath:target.path+String(current.path.dropFirst(source.path.count)))
    }
    func children(_ relative:String) throws -> (items:[[String:String]],truncated:Bool) {
        let directory=try resolve(relative)
        var isDirectory:ObjCBool=false
        guard FileManager.default.fileExists(atPath:directory.path,isDirectory:&isDirectory),isDirectory.boolValue else {throw WorkspaceError.notDirectory}
        let urls=try FileManager.default.contentsOfDirectory(at:directory,includingPropertiesForKeys:[.isDirectoryKey,.isRegularFileKey,.isSymbolicLinkKey,.isPackageKey],options:[.skipsHiddenFiles])
        var entries=[[String:String]]()
        for url in urls {
            let values=try url.resourceValues(forKeys:[.isDirectoryKey,.isRegularFileKey,.isSymbolicLinkKey,.isPackageKey])
            if values.isSymbolicLink==true||values.isPackage==true||url.lastPathComponent=="node_modules" {continue}
            let folder=values.isDirectory==true
            if !folder&&(!(values.isRegularFile==true) || !Self.extensions.contains(url.pathExtension.lowercased())) {continue}
            guard let id=self.relative(url) else {continue}
            entries.append(["id":id,"name":url.lastPathComponent,"kind":folder ? "folder":"file"])
        }
        entries.sort { a,b in
            if a["kind"] != b["kind"] {return a["kind"]=="folder"}
            return (a["name"] ?? "").localizedStandardCompare(b["name"] ?? "") == .orderedAscending
        }
        return (Array(entries.prefix(1000)),entries.count>1000)
    }
}
