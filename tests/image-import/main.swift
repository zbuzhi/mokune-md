import Foundation
let root=URL(fileURLWithPath:NSTemporaryDirectory()).appendingPathComponent(UUID().uuidString)
try FileManager.default.createDirectory(at:root.appendingPathComponent("doc"),withIntermediateDirectories:true)
defer{try? FileManager.default.removeItem(at:root)}
let source=root.appendingPathComponent("中文 图(1).png"),document=root.appendingPathComponent("doc/readme.md"),bytes=Data([1,2,3,4]);try bytes.write(to:source)
let first=try ImageImport.copy(source,beside:document),second=try ImageImport.copy(source,beside:document)
precondition(first.reference.contains("%20")&&first.reference.contains("%28"));precondition(first.name != second.name)
let imported=try Data(contentsOf:document.deletingLastPathComponent().appendingPathComponent("assets/"+first.name))
precondition(imported==bytes)
try FileManager.default.createDirectory(at:root.appendingPathComponent("unsafe"),withIntermediateDirectories:true)
try FileManager.default.createSymbolicLink(at:root.appendingPathComponent("unsafe/assets"),withDestinationURL:root)
do{_=try ImageImport.copy(source,beside:root.appendingPathComponent("unsafe/readme.md"));fatalError("symlink must fail")}catch{}
let pasted=try ImageImport.write(bytes,name:"粘贴图片.png",beside:document)
let pastedData=try Data(contentsOf:document.deletingLastPathComponent().appendingPathComponent("assets/"+pasted.name));precondition(pastedData==bytes)
print("PASS: imported image byte identity, Unicode/space/parenthesis paths, collisions and symlink isolation")
