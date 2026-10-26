import Foundation
import CryptoKit
struct DocumentVersion:Codable {let id:String;let date:Date;let bytes:Int}
struct VersionStore {
    let root:URL
    func folder(_ document:URL)->URL {let key=SHA256.hash(data:Data(document.standardizedFileURL.path.utf8)).map{String(format:"%02x",$0)}.joined();return root.appendingPathComponent(key)}
    func list(_ document:URL)->[DocumentVersion] {
        let directory=folder(document)
        guard let names=try? FileManager.default.contentsOfDirectory(at:directory,includingPropertiesForKeys:[.contentModificationDateKey,.fileSizeKey]) else{return []}
        return names.compactMap{url in guard url.pathExtension=="md",UUID(uuidString:url.deletingPathExtension().lastPathComponent) != nil,let v=try? url.resourceValues(forKeys:[.contentModificationDateKey,.fileSizeKey]) else{return nil};return DocumentVersion(id:url.deletingPathExtension().lastPathComponent,date:v.contentModificationDate ?? .distantPast,bytes:v.fileSize ?? 0)}.sorted{$0.date>$1.date}
    }
    func read(_ id:String,document:URL)throws->Data {guard UUID(uuidString:id) != nil else{throw CocoaError(.fileReadInvalidFileName)};let data=try Data(contentsOf:folder(document).appendingPathComponent(id+".md"));_=try FileStore.decode(data);return data}
    func record(_ data:Data,document:URL)throws {
        _=try FileStore.decode(data)
        let directory=folder(document),manager=FileManager.default
        if let recent=list(document).first,try read(recent.id,document:document)==data{return}
        try manager.createDirectory(at:directory,withIntermediateDirectories:true)
        try data.write(to:directory.appendingPathComponent(UUID().uuidString+".md"),options:.atomic)
        var total=0
        for (index,entry) in list(document).enumerated(){total+=entry.bytes;if index>=30 || (index>0 && total>40*1024*1024){try manager.removeItem(at:directory.appendingPathComponent(entry.id+".md"))}}
        // Global retention also bounds histories for documents no longer used.
        let folders=(try? manager.contentsOfDirectory(at:root,includingPropertiesForKeys:nil)) ?? []
        let entries=folders.flatMap{folder->[(URL,Date,Int)] in ((try? manager.contentsOfDirectory(at:folder,includingPropertiesForKeys:[.contentModificationDateKey,.fileSizeKey])) ?? []).compactMap{url in guard url.pathExtension=="md",let v=try? url.resourceValues(forKeys:[.contentModificationDateKey,.fileSizeKey]) else{return nil};return (url,v.contentModificationDate ?? .distantPast,v.fileSize ?? 0)}}.sorted{$0.1>$1.1}
        var bytes=0;for entry in entries{bytes+=entry.2;if bytes>200*1024*1024{try? manager.removeItem(at:entry.0)}}
    }
}
