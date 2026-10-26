import Foundation
let root=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString),manager=FileManager.default
try manager.createDirectory(at:root.appendingPathComponent("notes"),withIntermediateDirectories:true)
defer{try? manager.removeItem(at:root)}
let document=root.appendingPathComponent("notes/current.md"),target=root.appendingPathComponent("中文 文稿.md")
try Data().write(to:document);try Data().write(to:target)
let result=try DocumentLink.resolve("../%E4%B8%AD%E6%96%87%20%E6%96%87%E7%A8%BF.md#标题",document:document,root:root)
precondition(result.url.path==target.resolvingSymlinksInPath().path);precondition(result.fragment.removingPercentEncoding=="标题")
let anchor=try DocumentLink.resolve("#local",document:document,root:root);precondition(anchor.url==document.resolvingSymlinksInPath())
for reference in ["../../outside.md","file:///tmp/doc.md","//host/doc.md","javascript:alert(1)","../x.pdf"]{do{_=try DocumentLink.resolve(reference,document:document,root:root);fatalError("escape allowed")}catch{}}
try manager.createSymbolicLink(at:root.appendingPathComponent("outside.md"),withDestinationURL:URL(fileURLWithPath:"/etc/hosts"))
do{_=try DocumentLink.resolve("../outside.md",document:document,root:root);fatalError("symlink allowed")}catch{}
print("PASS: document links decode Unicode, support parent paths within workspace and reject external schemes/symlinks")
let attachment=root.appendingPathComponent("附件.pdf");try Data([1,2]).write(to:attachment)
let localAttachment=try DocumentLink.localFile("../%E9%99%84%E4%BB%B6.pdf",document:document,root:root)
precondition(localAttachment==attachment.resolvingSymlinksInPath())
do{_=try DocumentLink.localFile("../outside.md",document:document,root:root);fatalError("attachment symlink allowed")}catch{}
print("PASS: local attachments resolve within scope without widening Markdown document navigation")
