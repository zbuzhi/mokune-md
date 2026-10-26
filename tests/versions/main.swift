import Foundation
let root=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
defer{try? FileManager.default.removeItem(at:root)}
let store=VersionStore(root:root),doc=root.appendingPathComponent("中文.md"),data=Data("\u{FEFF}# 中文\r\n原样  \n".utf8)
try store.record(data,document:doc);try store.record(data,document:doc)
precondition(store.list(doc).count==1)
let restored=try store.read(store.list(doc)[0].id,document:doc);precondition(restored==data)
for i in 0..<35{try store.record(Data("version \(i)".utf8),document:doc)}
precondition(store.list(doc).count==30)
precondition(store.list(root.appendingPathComponent("other.md")).isEmpty)
do{_=try store.read("../escape",document:doc);fatalError("unsafe version id")}catch{}
print("PASS: version byte identity, deduplication, document isolation, retention and unsafe IDs")
