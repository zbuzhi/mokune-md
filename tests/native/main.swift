import Foundation

var passed = 0
func check(_ condition: @autoclosure () -> Bool, _ name: String) {
    if !condition() { fputs("FAIL: \(name)\n", stderr); exit(1) }
    passed += 1; print("PASS: \(name)")
}
let cases = ["\u{FEFF}# 中文\r\n\r\n尾随空格  ", "\u{FEFF}\u{FEFF}double BOM\n", "a\r\nb\nc\rd", "👩🏽‍💻\n😀", ""]
for (index, raw) in cases.enumerated() {
    let bytes = Data(raw.utf8), decoded = try FileStore.decode(bytes)
    check(Data(decoded.utf8) == bytes, "UTF-8/BOM byte identity \(index)")
}
do { _ = try FileStore.decode(Data([0xFF, 0xFE, 0x41])); check(false, "invalid encoding rejected") }
catch FileStoreError.invalidEncoding { check(true, "invalid encoding rejected") }
do { _ = try FileStore.decode(Data([0x61, 0, 0x62])); check(false, "binary rejected") }
catch FileStoreError.invalidEncoding { check(true, "binary rejected") }
let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent(".build/native-tests")
try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
let file = root.appendingPathComponent("roundtrip.md")
let original = Data("\u{FEFF}# 中文\r\n\r\n保留原文  \n".utf8)
try original.write(to: file)
let decoded = try FileStore.decode(Data(contentsOf: file))
try FileStore.atomicWrite(Data(decoded.utf8), to: file, baseline: original)
let saved = try Data(contentsOf: file); check(saved == original, "native atomic no-op save byte identity")
let external = Data("EXTERNAL\n".utf8); try external.write(to: file)
do { try FileStore.atomicWrite(Data("MY EDITS\n".utf8), to: file, baseline: original); check(false, "external conflict rejected") }
catch FileStoreError.conflict { check(true, "external conflict rejected") }
let afterConflict = try Data(contentsOf: file); check(afterConflict == external, "external changes remain untouched")
try FileManager.default.removeItem(at: file)
do { try FileStore.atomicWrite(original, to: file, baseline: original); check(false, "deleted file treated as conflict") }
catch FileStoreError.conflict { check(true, "deleted file treated as conflict") }
let copy = root.appendingPathComponent("copy.md"); try FileStore.atomicWrite(original, to: copy, baseline: nil)
let copied = try Data(contentsOf: copy); check(copied == original, "save-as creates byte-identical copy")
print("Native file checks passed: \(passed)")
let imageRoot = root.appendingPathComponent("images", isDirectory: true)
try FileManager.default.createDirectory(at: imageRoot.appendingPathComponent("assets", isDirectory: true), withIntermediateDirectories: true)
let inside = imageRoot.appendingPathComponent("assets/测试 图片.png")
try Data([0]).write(to: inside)
check(LocalImageResolver.resolve("assets/测试%20图片.png", root: imageRoot)?.path == inside.path, "local image handles Chinese and encoded spaces")
check(LocalImageResolver.resolve(inside.absoluteString, root: imageRoot)?.path == inside.path, "absolute file URL inside document folder")
check(LocalImageResolver.resolve("../outside.png", root: imageRoot) == nil, "parent directory escape blocked")
check(LocalImageResolver.resolve("%2e%2e/outside.png", root: imageRoot) == nil, "encoded directory escape blocked")
check(LocalImageResolver.resolve("/etc/example.png", root: imageRoot) == nil, "absolute outside image blocked")
check(LocalImageResolver.resolve("file://example.com/a.png", root: imageRoot) == nil, "remote file host blocked")
check(LocalImageResolver.resolve("assets/private.md", root: imageRoot) == nil, "non-image file blocked")
let alias = imageRoot.appendingPathComponent("alias")
try Data([0]).write(to: root.appendingPathComponent("outside.png"))
if !FileManager.default.fileExists(atPath: alias.path) { try FileManager.default.createSymbolicLink(at: alias, withDestinationURL: root) }
check(LocalImageResolver.resolve("alias/outside.png", root: imageRoot) == nil, "symlink escape blocked")
let request = URL(string: "mokune-image://local/session/?path=assets%2Fpreview.svg")!
check(LocalImageResolver.reference(from: request, token: "session") == "assets/preview.svg", "scheme request preserves trailing slash and decodes path")
check(LocalImageResolver.reference(from: request, token: "old-session") == nil, "stale document image token rejected")
check(LocalImageResolver.reference(from: URL(string: "mokune-image://other/session/?path=a.png")!, token: "session") == nil, "foreign image scheme host rejected")
print("All native checks passed: \(passed)")
