import Foundation
var passed=0
func check(_ value:Bool,_ label:String){guard value else{fatalError(label)};passed+=1;print("PASS: \(label)")}
let root=URL(fileURLWithPath:FileManager.default.currentDirectoryPath).appendingPathComponent(".build/workspace-tests",isDirectory:true)
try FileManager.default.createDirectory(at:root.appendingPathComponent("notes/sub",isDirectory:true),withIntermediateDirectories:true)
for name in ["README.md","2.md","10.md","image.png",".hidden.md","notes/中文 笔记.markdown","notes/sub/readme.txt"]{try Data("# 原文\r\n".utf8).write(to:root.appendingPathComponent(name))}
let workspace=WorkspaceDirectory(root:root),top=try workspace.children("")
check(top.items.first?["kind"]=="folder","folders precede files")
check(top.items.filter{$0["kind"]=="file"}.compactMap{$0["name"]}==["2.md","10.md","README.md"],"Markdown files sort naturally and exclude binary/hidden files")
let children=try workspace.children("notes")
check(children.items.contains{$0["id"]=="notes/中文 笔记.markdown"},"child identifiers keep relative hierarchy and Chinese names")
check(workspace.relative(root.appendingPathComponent("notes/sub/readme.txt"))=="notes/sub/readme.txt","current document resolves within workspace")
check(workspace.relative(root.deletingLastPathComponent().appendingPathComponent("other.md"))==nil,"outside document stays separate")
do{_=try workspace.resolve("../outside.md");check(false,"parent escape rejected")}catch{check(true,"parent escape rejected")}
do{_=try workspace.resolve("/etc/passwd");check(false,"absolute path rejected")}catch{check(true,"absolute path rejected")}
let link=root.appendingPathComponent("escape")
if !FileManager.default.fileExists(atPath:link.path){try FileManager.default.createSymbolicLink(at:link,withDestinationURL:root.deletingLastPathComponent())}
do{_=try workspace.resolve("escape/outside.md");check(false,"symlink escape rejected")}catch{check(true,"symlink escape rejected")}
check(!(try workspace.children("").items.contains{$0["name"]=="escape"}),"symlink directories do not appear as browsable children")
let many=root.appendingPathComponent("many",isDirectory:true);try FileManager.default.createDirectory(at:many,withIntermediateDirectories:true)
for n in 0...1000{let file=many.appendingPathComponent("\(n).md");if !FileManager.default.fileExists(atPath:file.path){try Data().write(to:file)}}
let limited=try workspace.children("many");check(limited.truncated&&limited.items.count==1000,"large directories return an explicit bounded result")
print("Navigation native checks passed: \(passed)")
let scratch=try workspace.create(parent:"notes",name:"operations-"+UUID().uuidString,folder:true)
defer{try? FileManager.default.removeItem(at:scratch)}
let base=workspace.relative(scratch)!
let source=try workspace.create(parent:base,name:"中文.md",folder:false)
let bytes=Data([0xef,0xbb,0xbf])+Data("# 未保存保护\r\n\n尾随空格  \r".utf8)
try bytes.write(to:source)
let renamed=try workspace.move(path:base+"/中文.md",parent:base,name:"新名字.md")
check(try Data(contentsOf:renamed)==bytes,"rename preserves exact source bytes")
let child=try workspace.create(parent:base,name:"子目录",folder:true)
let moved=try workspace.move(path:base+"/新名字.md",parent:base+"/子目录")
check(try Data(contentsOf:moved)==bytes,"move preserves original bytes and hierarchy")
do{_=try workspace.create(parent:base+"/子目录",name:"新名字.md",folder:false);check(false,"collision must not overwrite")}catch{check(try Data(contentsOf:moved)==bytes,"collision leaves the existing file intact")}
for invalid in ["../escape.md","/absolute.md",".","..","hidden/name.md","a:b.md"," a.md",".hidden.md","a.exe"] {
 do{_=try workspace.create(parent:base,name:invalid,folder:false);check(false,"invalid name rejected")}catch{check(true,"invalid name rejected: \(invalid)")}
}
do{_=try workspace.move(path:base,parent:base+"/子目录");check(false,"recursive move rejected")}catch{check(true,"recursive move rejected")}
do{_=try workspace.move(path:"",parent:base);check(false,"workspace root cannot move")}catch{check(true,"workspace root cannot move")}
let outside=try workspace.create(parent:base,name:"outside",folder:true)
let alias=scratch.appendingPathComponent("alias");try FileManager.default.createSymbolicLink(at:alias,withDestinationURL:root.deletingLastPathComponent())
do{_=try workspace.create(parent:base+"/alias",name:"escape.md",folder:false);check(false,"creation through outside symlink rejected")}catch{check(true,"creation through outside symlink rejected")}
let destination=scratch.appendingPathComponent("renamed-folder")
check(try workspace.relocatedDocument(moved,from:child,to:destination,baseline:bytes)?.path==destination.appendingPathComponent("新名字.md").path,"moving an active document ancestor retargets its path without rewriting source")
check(try workspace.relocatedDocument(moved,from:outside,to:destination,baseline:Data())==nil,"unrelated folder operations do not touch the current document")
do{_=try workspace.relocatedDocument(moved,from:child,to:destination,baseline:Data());check(false,"changed disk baseline must block relocation")}catch{check(try Data(contentsOf:moved)==bytes,"disk conflicts prevent relocation and preserve the original")}
let renamedFolder=try workspace.move(path:base+"/子目录",parent:base,name:"归档")
check(try Data(contentsOf:renamedFolder.appendingPathComponent("新名字.md"))==bytes,"renaming a folder preserves nested document bytes")
print("Navigation native total checks passed: \(passed)")
