import Foundation
let root=URL(fileURLWithPath:NSTemporaryDirectory()).appendingPathComponent(UUID().uuidString)
try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
defer{try? FileManager.default.removeItem(at:root)}
let file=root.appendingPathComponent("中文.md");try Data().write(to:file)
let paths=RecentDocuments.adding(file,to:[file.path,"/missing.md"])
precondition(paths==[file.path,"/missing.md"])
precondition(RecentDocuments.available(paths+[file.path,root.path]).map{$0.path}==[file.path])
precondition(RecentDocuments.adding(file,to:(0..<30).map{"/\($0).md"}).count==20)
print("PASS: recent documents deduplicate, cap at 20, preserve Unicode and skip missing files/directories")
