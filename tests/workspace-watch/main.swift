import Foundation
let directory=URL(fileURLWithPath:FileManager.default.currentDirectoryPath).appendingPathComponent(".build/watch-"+UUID().uuidString)
try FileManager.default.createDirectory(at:directory.appendingPathComponent("nested"),withIntermediateDirectories:true)
defer{try? FileManager.default.removeItem(at:directory)}
var observed=false
let watcher=WorkspaceWatcher(root:directory){observed=true}
guard watcher.active else{fatalError("FSEvents did not start")}
DispatchQueue.global().asyncAfter(deadline:.now()+0.5){try! Data("# external".utf8).write(to:directory.appendingPathComponent("nested/external.md"))}
let timeout=Date().addingTimeInterval(5)
while !observed&&Date()<timeout{RunLoop.current.run(until:Date().addingTimeInterval(0.05))}
guard observed else{fatalError("nested external change not observed")}
print("PASS: recursive FSEvents observes external writes in a nested folder")
