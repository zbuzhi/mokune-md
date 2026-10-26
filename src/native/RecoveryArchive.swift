import Foundation
struct RecoveryArchive {
    static func encode(_ documents:[DocumentSession])throws->Data {
        let entries=documents.filter{$0.dirty && $0.raw != nil}.map{entry->[String:Any] in
            // Foundation's JSON reader may strip a leading BOM from string values.
            // Base64 stores the complete UTF-8 bytes for each independent draft.
            var value:[String:Any]=["id":entry.id,"rawBase64":Data(entry.raw!.utf8).base64EncodedString(),"name":entry.displayName]
            if let url=entry.url{value["path"]=url.path};if let base=entry.baseline{value["baseline"]=base.base64EncodedString()};return value
        }
        return try JSONSerialization.data(withJSONObject:["documents":entries])
    }
    static func decode(_ data:Data)throws->[[String:Any]]{
        guard let object=try JSONSerialization.jsonObject(with:data) as? [String:Any] else{return []}
        let entries=(object["documents"] as? [[String:Any]]) ?? (object["raw"] != nil ? [object]:[])
        return entries.prefix(30).compactMap{entry in
            var value=entry;let raw:String
            if let encoded=entry["rawBase64"] as? String,let bytes=Data(base64Encoded:encoded),let decoded=try? FileStore.decode(bytes){raw=decoded}
            else if var legacy=entry["raw"] as? String {
                if let encoded=entry["baseline"] as? String,let bytes=Data(base64Encoded:encoded),bytes.starts(with:[0xEF,0xBB,0xBF]),!legacy.hasPrefix("\u{FEFF}"){legacy="\u{FEFF}"+legacy}
                guard (try? FileStore.decode(Data(legacy.utf8))) != nil else{return nil};raw=legacy
            }else{return nil}
            value["raw"]=raw;return value
        }
    }
}
