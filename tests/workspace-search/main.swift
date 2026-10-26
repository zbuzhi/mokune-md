import Foundation
let root=URL(fileURLWithPath:NSTemporaryDirectory()).appendingPathComponent(UUID().uuidString)
try FileManager.default.createDirectory(at:root.appendingPathComponent("nested"),withIntermediateDirectories:true)
defer{try? FileManager.default.removeItem(at:root)}
try Data("# Title\r\n中文\rHello\n中文 again\n".utf8).write(to:root.appendingPathComponent("nested/notes.md"))
let directory=WorkspaceDirectory(root:root),files=WorkspaceIndex.files(in:directory).items
precondition(files.count==1)
let result=WorkspaceSearch.find("中文",in:directory,files:files)
precondition(result.items.compactMap{$0["line"] as? Int}==[2,4])
precondition(WorkspaceSearch.find("hello",in:directory,files:files).items.count==1)
precondition(WorkspaceSearch.find("",in:directory,files:files).items.isEmpty)
precondition(WorkspaceSearch.find("中文",in:directory,files:files,cancelled:{true}).items.isEmpty)
print("PASS: recursive indexing, Chinese literal search, mixed line endings, case matching and cancellation")
