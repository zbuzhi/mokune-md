import Foundation
struct DiskMergeSnapshot {
    let id:String,url:URL,current:Data,baseline:Data?,revision:Int,disk:Data
    init(url:URL,current:Data,baseline:Data?,revision:Int,disk:Data){self.id=UUID().uuidString;self.url=url;self.current=current;self.baseline=baseline;self.revision=revision;self.disk=disk}
    func validate(id:String,url:URL,current:Data,baseline:Data?,revision:Int)throws {
        guard self.id==id,self.url==url,self.current==current,self.baseline==baseline,self.revision==revision else{throw FileStoreError.conflict}
        guard (try? Data(contentsOf:url))==disk else{throw FileStoreError.conflict}
    }
}
