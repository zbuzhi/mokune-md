import Foundation
func check(_ value:Bool,_ name:String){if !value{fatalError(name)};print("PASS: \(name)")}
let root=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString);try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true);defer{try? FileManager.default.removeItem(at:root)}
let url=root.appendingPathComponent("a.md"),local=Data("\u{FEFF}当前\r\n尾随  \n".utf8),old=Data("旧基线".utf8),disk=Data("\u{FEFF}磁盘\r\n".utf8)
try disk.write(to:url)
let snapshot=DiskMergeSnapshot(url:url,current:local,baseline:old,revision:7,disk:disk)
try snapshot.validate(id:snapshot.id,url:url,current:local,baseline:old,revision:7)
check((try Data(contentsOf:url))==disk,"validation does not write disk")
check((try? snapshot.validate(id:"wrong",url:url,current:local,baseline:old,revision:7))==nil,"wrong snapshot cannot authorize merge")
check((try? snapshot.validate(id:snapshot.id,url:url,current:local,baseline:old,revision:8))==nil,"new revision invalidates preview")
check((try? snapshot.validate(id:snapshot.id,url:url,current:Data("新编辑".utf8),baseline:old,revision:7))==nil,"changed local source invalidates preview")
check((try? snapshot.validate(id:snapshot.id,url:url,current:local,baseline:disk,revision:7))==nil,"changed save baseline invalidates preview")
try Data("外部变化".utf8).write(to:url)
check((try? snapshot.validate(id:snapshot.id,url:url,current:local,baseline:old,revision:7))==nil,"disk bytes are rechecked at apply time")
