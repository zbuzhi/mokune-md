import Foundation

enum RecentDocuments {
    static func adding(_ url:URL,to paths:[String])->[String] {
        let path=url.standardizedFileURL.path
        return Array(([path]+paths.filter{$0 != path}).prefix(20))
    }
    static func available(_ paths:[String])->[URL] {
        var seen=Set<String>()
        return paths.compactMap { path in
            guard path.hasPrefix("/"),seen.insert(path).inserted else{return nil}
            let url=URL(fileURLWithPath:path);var directory:ObjCBool=false
            guard FileManager.default.fileExists(atPath:path,isDirectory:&directory),!directory.boolValue else{return nil}
            return url
        }.prefix(20).map{$0}
    }
}
