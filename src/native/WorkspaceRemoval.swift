import Foundation
enum WorkspaceRemovalError:Error{case unsaved(Int),changed}
struct WorkspaceRemoval {
    static func plan(_ path:String,in directory:WorkspaceDirectory,documents:[DocumentSession])throws->(source:URL,affected:[DocumentSession]){
        guard !path.isEmpty else{throw WorkspaceError.outsideRoot}
        let source=try directory.resolve(path)
        guard source != directory.root else{throw WorkspaceError.outsideRoot}
        let affected=documents.filter{guard let url=$0.url else{return false};return url.path==source.path||url.path.hasPrefix(source.path+"/")}
        let dirty=affected.filter{$0.dirty}.count;guard dirty==0 else{throw WorkspaceRemovalError.unsaved(dirty)}
        for entry in affected{guard let url=entry.url,let disk=try? Data(contentsOf:url),disk==entry.baseline else{throw WorkspaceRemovalError.changed}}
        return (source,affected)
    }
}
