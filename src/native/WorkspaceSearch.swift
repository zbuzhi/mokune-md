import Foundation
struct WorkspaceSearch {
    static func find(_ query:String,in directory:WorkspaceDirectory,files:[[String:String]],cancelled:()->Bool={false})->(items:[[String:Any]],truncated:Bool){
        guard !query.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,query.count<=200 else{return ([],false)}
        var items=[[String:Any]](),budget=20*1024*1024,truncated=false
        for entry in files {
            if cancelled(){break}
            guard let path=entry["path"],let url=try? directory.resolve(path),let size=try? url.resourceValues(forKeys:[.fileSizeKey]).fileSize,size<=2*1024*1024 else{continue}
            guard size<=budget else{truncated=true;break};budget-=size
            guard let data=try? Data(contentsOf:url),var text=String(data:data,encoding:.utf8),!text.contains("\0") else{continue}
            text=text.replacingOccurrences(of:"\r\n",with:"\n").replacingOccurrences(of:"\r",with:"\n")
            for (index,line) in text.components(separatedBy:"\n").enumerated(){
                if cancelled(){break}
                if line.range(of:query,options:.caseInsensitive) != nil {
                    items.append(["path":path,"name":entry["name"] ?? url.lastPathComponent,"line":index+1,"snippet":String(line.trimmingCharacters(in:.whitespaces).prefix(160))])
                    if items.count==200{return (items,true)}
                }
            }
        }
        return (items,truncated)
    }
}
