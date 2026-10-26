import Foundation
final class DocumentSession {
    let id:String
    var url:URL?,baseline:Data?,stamp:String?,raw:String?
    var revision=0,dirty=false,placeholder=false
    var name="未命名.md"
    var displayName:String{url?.lastPathComponent ?? name}
    var diskMergeSnapshot:DiskMergeSnapshot?
    var mergeAuthorization:(token:String,disk:Data)?
    var position:ReadingState?
    var restoreNotice:String?
    var imageToken=UUID().uuidString
    init(id:String=UUID().uuidString){self.id=id}
}
