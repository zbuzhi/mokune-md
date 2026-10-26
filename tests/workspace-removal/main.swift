import Foundation
let root=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
try FileManager.default.createDirectory(at:root.appendingPathComponent("folder/nested"),withIntermediateDirectories:true)
defer{try? FileManager.default.removeItem(at:root)}
let directory=WorkspaceDirectory(root:root),a=DocumentSession(),b=DocumentSession(),outside=DocumentSession()
a.url=root.appendingPathComponent("folder/A.md");a.baseline=Data("A\r\n".utf8);try a.baseline!.write(to:a.url!)
b.url=root.appendingPathComponent("folder/nested/B.md");b.baseline=Data("B  \n".utf8);try b.baseline!.write(to:b.url!)
outside.url=root.appendingPathComponent("other.md");outside.dirty=true
let plan=try WorkspaceRemoval.plan("folder",in:directory,documents:[a,b,outside]);precondition(plan.affected.count==2)
b.dirty=true
do{_=try WorkspaceRemoval.plan("folder",in:directory,documents:[a,b]);fatalError("unsaved descendant allowed")}catch WorkspaceRemovalError.unsaved(let count){precondition(count==1)}
b.dirty=false;try Data("External".utf8).write(to:a.url!)
do{_=try WorkspaceRemoval.plan("folder",in:directory,documents:[a,b]);fatalError("external change allowed")}catch WorkspaceRemovalError.changed{}
do{_=try WorkspaceRemoval.plan("",in:directory,documents:[]);fatalError("root allowed")}catch{}
precondition(FileManager.default.fileExists(atPath:a.url!.path));precondition(FileManager.default.fileExists(atPath:b.url!.path))
print("PASS: removal checks every open descendant, rejects dirty/conflicted/root targets and leaves files untouched")
