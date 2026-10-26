import Foundation
func check(_ condition:Bool,_ name:String){if !condition{fatalError(name)};print("PASS: \(name)")}
let root=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
defer{try? FileManager.default.removeItem(at:root)}
let first=DocumentSession(id:"a"),second=DocumentSession(id:"b"),third=DocumentSession(id:"c")
first.url=root.appendingPathComponent("A.md");first.raw="\u{FEFF}# A\r\n尾随  \n";first.baseline=Data(first.raw!.utf8);try first.baseline!.write(to:first.url!)
first.position=ReadingState(["anchor":5,"head":8,"scroll":320.0,"sourceMode":true])
second.url=root.appendingPathComponent("B.md");second.baseline=Data("磁盘\r\n".utf8);try second.baseline!.write(to:second.url!);second.raw="\u{FEFF}未保存\r\n混合\n";second.dirty=true
third.name="空白.md";third.raw="";third.position=ReadingState(["anchor":0,"head":0,"scroll":0.0])
let archive=try SessionArchive.decode(SessionArchive([first,second,third],active:"b").encode())
let tabs=archive.restore()
check(tabs.map{$0.id}==["a","b","c"] && archive.active=="b","order, active ID and empty untitled tab")
check(tabs[0].position?.anchor==5 && tabs[0].position?.head==8 && tabs[0].position?.scroll==320 && tabs[0].position?.sourceMode==true,"selection direction, scroll and mode")
check(Data(tabs[1].raw!.utf8)==Data(second.raw!.utf8) && tabs[1].dirty && tabs[1].baseline==second.baseline,"unsaved exact bytes and disk baseline")
try Data("外部新内容".utf8).write(to:first.url!);try Data("外部冲突".utf8).write(to:second.url!)
let changed=archive.restore()
check(changed[0].raw=="外部新内容" && !changed[0].dirty,"clean tab reads latest disk")
check(changed[1].raw==second.raw && changed[1].baseline==second.baseline && changed[1].url==second.url,"dirty conflict keeps draft and original baseline")
try FileManager.default.removeItem(at:first.url!)
let missing=archive.restore()[0]
check(missing.url==nil && missing.dirty && missing.raw==first.raw && missing.restoreNotice != nil,"missing file keeps detached unsaved copy")
second.raw="";let empty=try SessionArchive.decode(SessionArchive([second],active:"b").encode()).restore()[0]
check(empty.raw=="" && empty.dirty,"unsaved deletion to empty survives")
let bad=Data("{\"version\":99,\"active\":\"a\",\"tabs\":[]}".utf8)
check((try? SessionArchive.decode(bad))==nil,"unknown archive fails safely")
