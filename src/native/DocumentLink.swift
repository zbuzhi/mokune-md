import Foundation
struct DocumentLink {
    static func localFile(_ reference:String,document:URL,root:URL)throws->URL {
        guard !reference.contains("\0"),!reference.hasPrefix("/"),!reference.hasPrefix("\\"),let components=URLComponents(string:reference),components.scheme==nil,components.host==nil,components.query==nil else{throw WorkspaceError.outsideRoot}
        guard let target=URL(string:reference,relativeTo:document)?.absoluteURL,target.isFileURL else{throw WorkspaceError.outsideRoot}
        let url=URL(fileURLWithPath:target.path).standardizedFileURL.resolvingSymlinksInPath(),allowed=root.standardizedFileURL.resolvingSymlinksInPath()
        guard url.path.hasPrefix(allowed.path+"/"),try url.resourceValues(forKeys:[.isRegularFileKey]).isRegularFile==true else{throw WorkspaceError.outsideRoot}
        return url
    }
    static func resolve(_ reference:String,document:URL,root:URL)throws->(url:URL,fragment:String) {
        let url=try localFile(reference,document:document,root:root)
        guard WorkspaceDirectory.extensions.contains(url.pathExtension.lowercased()),let components=URLComponents(string:reference) else{throw WorkspaceError.outsideRoot}
        return (url,components.percentEncodedFragment ?? "")
    }
}
struct DocumentLocation {let url:URL;let line:Int;let column:Int}
