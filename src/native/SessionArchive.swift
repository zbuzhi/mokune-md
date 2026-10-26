import Foundation

struct ReadingState: Codable {
    var anchor:Int=0, head:Int=0
    var scroll:Double=0, scrollLeft:Double=0
    var sourceMode:Bool=false, reading:Bool=false
    var payload:[String:Any]{["anchor":anchor,"head":head,"scroll":scroll,"scrollLeft":scrollLeft,"sourceMode":sourceMode,"reading":reading]}
    init(_ body:[String:Any]) {
        anchor=max(0,body["anchor"] as? Int ?? 0);head=max(0,body["head"] as? Int ?? anchor)
        scroll=max(0,body["scroll"] as? Double ?? 0);scrollLeft=max(0,body["scrollLeft"] as? Double ?? 0)
        sourceMode=body["sourceMode"] as? Bool ?? false;reading=body["reading"] as? Bool ?? false
    }
}

struct SessionArchive: Codable {
    struct Tab: Codable {
        var id:String, name:String, path:String?, raw:Data, baseline:Data?, dirty:Bool, position:ReadingState?
    }
    var version=1
    var active:String
    var tabs:[Tab]
    init(_ documents:[DocumentSession],active:String) {
        self.active=active
        tabs=documents.filter{!$0.placeholder}.prefix(30).map{entry in
            Tab(id:entry.id,name:entry.displayName,path:entry.url?.path,raw:Data((entry.raw ?? entry.baseline.map{String(decoding:$0,as:UTF8.self)} ?? "").utf8),baseline:entry.baseline,dirty:entry.dirty,position:entry.position)
        }
    }
    func encode()throws->Data{try JSONEncoder().encode(self)}
    static func decode(_ data:Data)throws->SessionArchive {
        let archive=try JSONDecoder().decode(Self.self,from:data)
        guard archive.version==1,archive.tabs.count<=30,Set(archive.tabs.map{$0.id}).count==archive.tabs.count else{throw FileStoreError.invalidEncoding}
        for tab in archive.tabs {_ = try FileStore.decode(tab.raw);if let base=tab.baseline{_ = try FileStore.decode(base)}}
        return archive
    }
    // Disk changes while the app was closed must never overwrite a recovered draft.
    func restore()->[DocumentSession] {
        var paths=Set<String>()
        return tabs.map{tab in
            let entry=DocumentSession(id:tab.id);entry.name=tab.name;entry.raw=String(decoding:tab.raw,as:UTF8.self);entry.baseline=tab.baseline;entry.dirty=tab.dirty;entry.position=tab.position
            if let path=tab.path, path.hasPrefix("/"),paths.insert(URL(fileURLWithPath:path).standardizedFileURL.resolvingSymlinksInPath().path).inserted {
                let url=URL(fileURLWithPath:path)
                if let bytes=try? Data(contentsOf:url),let raw=try? FileStore.decode(bytes) {
                    entry.url=url
                    if !tab.dirty{entry.raw=raw;entry.baseline=bytes}
                }else{entry.dirty=true;entry.baseline=nil;entry.restoreNotice="原文件暂时无法读取，已保留会话副本，请另存文稿。"}
            }else if tab.path != nil{entry.dirty=true;entry.baseline=nil;entry.restoreNotice="原路径不可用，已保留会话副本，请另存文稿。"}
            return entry
        }
    }
}
