import Foundation
struct WorkspaceIndex {
    static func files(in directory:WorkspaceDirectory)->(items:[[String:String]],truncated:Bool) {
        var folders=[""],cursor=0,items=[[String:String]](),truncated=false
        while cursor<folders.count&&cursor<1000&&items.count<10000 {
            let path=folders[cursor];cursor+=1
            guard let result=try? directory.children(path) else{continue}
            truncated = truncated || result.truncated
            for node in result.items {
                guard let id=node["id"],let name=node["name"] else{continue}
                if node["kind"]=="folder" {if folders.count<1000{folders.append(id)}else{truncated=true}}
                else if items.count<10000 {items.append(["path":id,"name":name])}else{truncated=true}
            }
        }
        return (items,truncated || cursor<folders.count)
    }
}
