let qaRoot=URL(fileURLWithPath:ProcessInfo.processInfo.arguments[1],isDirectory:true)
var qaRevealed:URL?
func qaCheck(_ value:Bool,_ message:String){guard value else{fputs("FAIL: \(message)\n",stderr);exit(1)};print("PASS: \(message)")}
func qaWillClose(_ owner:AppDelegate){}
func qaPause()async{try? await Task.sleep(nanoseconds:300_000_000)}
@MainActor func qaJS(_ owner:AppDelegate,_ script:String)async throws->Any?{try await withCheckedThrowingContinuation{c in owner.webView.evaluateJavaScript(script){v,e in if let e=e{c.resume(throwing:e)}else{c.resume(returning:v)}}}}
@MainActor func qaWait(_ owner:AppDelegate,_ script:String)async throws {
 for _ in 0..<70{if try await qaJS(owner,script) as? Bool==true{return};await qaPause()};throw NSError(domain:"Resource QA wait: "+script,code:1)
}
func sessionHarnessReady(_ owner:AppDelegate){Task{@MainActor in
 do{
  let root=qaRoot.appendingPathComponent("workspace",isDirectory:true),assets=root.appendingPathComponent("assets",isDirectory:true);try FileManager.default.createDirectory(at:assets,withIntermediateDirectories:true)
  let svg="<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"80\" height=\"60\"><rect width=\"80\" height=\"60\" fill=\"red\"/></svg>"
  for name in ["old.svg","disk.svg"]{try Data(svg.utf8).write(to:assets.appendingPathComponent(name))};try Data(svg.utf8).write(to:qaRoot.appendingPathComponent("new.svg"));try Data("%PDF fixture".utf8).write(to:qaRoot.appendingPathComponent("source.pdf"))
  let orphan=assets.appendingPathComponent("orphan.pdf"),pinned=assets.appendingPathComponent("pinned.pdf");try Data("orphan bytes".utf8).write(to:orphan);try Data("pinned bytes".utf8).write(to:pinned)
  let a=DocumentSession(id:"a"),b=DocumentSession(id:"b");a.url=root.appendingPathComponent("a.md");a.raw="\u{FEFF}# 图片与附件\r\n\r\n![原图](assets/old.svg \"题注\"){width=320px}\r\n\r\n[失效](assets/missing.pdf)\r\n未保存文字  \n";a.baseline=Data("![盘图](assets/disk.svg)\r\n".utf8);a.dirty=true;try a.baseline!.write(to:a.url!)
  b.url=root.appendingPathComponent("b.md");b.raw="[草稿引用](assets/pinned.pdf)未保存 B";b.baseline=Data("# B".utf8);b.dirty=true;try b.baseline!.write(to:b.url!)
  owner.documents=[a,b];owner.workspace=WorkspaceDirectory(root:root);owner.activateDocument(a);await qaPause()
  let before=a.raw!
  _ = try await qaJS(owner,"document.querySelector('.md-image-preview img').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,button:2}));[...document.querySelectorAll('.image-context-menu button')].find(x=>x.textContent==='图片设置').click();document.querySelector('#visual-editor [name=alt]').value='替代中文[图]';[...document.querySelectorAll('.visual-image-actions button')].find(x=>x.textContent==='替换图片…').click()")
  try await qaWait(owner,"document.querySelector('.visual-image-path')?.textContent==='assets/new.svg'")
  _ = try await qaJS(owner,"[...document.querySelectorAll('.visual-image-actions button')].find(x=>x.textContent==='定位原文件').click()")
  for _ in 0..<10{if qaRevealed != nil{break};await qaPause()}
  qaCheck(qaRevealed?.path==assets.appendingPathComponent("new.svg").path,"native image reveal validates the copied original path")
  _ = try await qaJS(owner,"document.querySelector('#visual-editor [data-apply]').click()")
  let replaced=try await qaJS(owner,"window.mokune.snapshot().raw") as! String
  qaCheck(replaced.contains("![替代中文\\[图\\]](assets/new.svg \"题注\"){width=320px}"),"native replacement and alt update preserve caption and size")
  _ = try await qaJS(owner,"window.mokune.receive({type:'action',action:'resources'})")
  try await qaWait(owner,"document.querySelector('.resources-status')?.textContent.includes('个资源')===true")
  for _ in 0..<10{if owner.pendingResources?.approved==Set([orphan.path]){break};await qaPause()}
  if owner.pendingResources?.approved != Set([orphan.path]){fputs("Approved: \(String(describing:owner.pendingResources?.approved))\n",stderr)}
  qaCheck(owner.pendingResources?.approved==Set([orphan.path]),"cleanup excludes current image, disk image, undo image and background draft attachment")
  qaCheck((try await qaJS(owner,"window.mokune.snapshot().raw") as? String)==replaced,"resource scan leaves current unsaved raw unchanged")
  _ = try await qaJS(owner,"[...document.querySelectorAll('.resource-row-main')].find(x=>x.querySelector('strong').textContent==='old.svg').click()")
  try await qaWait(owner,"document.querySelector('.resources-detail img')?.naturalWidth===80")
  qaCheck(true,"resource inspector renders local image preview")
  let shot:NSImage=try await withCheckedThrowingContinuation{continuation in owner.webView.takeSnapshot(with:nil){image,error in if let image=image{continuation.resume(returning:image)}else{continuation.resume(throwing:error ?? NSError(domain:"snapshot",code:1))}}}
  if let tiff=shot.tiffRepresentation,let rep=NSBitmapImageRep(data:tiff),let png=rep.representation(using:.png,properties:[:]){try png.write(to:URL(fileURLWithPath:FileManager.default.currentDirectoryPath).appendingPathComponent("output/resources-native.png"))}
  _ = try await qaJS(owner,"document.querySelector('#resource-manager select').value='missing';document.querySelector('#resource-manager select').dispatchEvent(new Event('change'))")
  qaCheck((try await qaJS(owner,"document.querySelector('.resources-list').textContent.includes('assets/missing.pdf')") as? Bool)==true,"native inventory reports broken attachment references")
  _ = try await qaJS(owner,"document.querySelector('#resource-manager select').value='unused';document.querySelector('#resource-manager select').dispatchEvent(new Event('change'));document.querySelector('.resource-row input').click();document.querySelector('[data-clean]').click()")
  try await qaWait(owner,"document.querySelector('.resources-status')?.textContent.includes('已移入废纸篓')===true")
  qaCheck(!FileManager.default.fileExists(atPath:orphan.path) && owner.resourceTrash.count==1,"explicit cleanup moves only selected fixture to the real macOS Trash")
  qaCheck(FileManager.default.fileExists(atPath:pinned.path) && b.raw!.contains("未保存 B"),"cleanup preserves background draft resources and content")
  _ = try await qaJS(owner,"document.querySelector('[data-undo]').click()")
  try await qaWait(owner,"document.querySelector('.resources-status')?.textContent.includes('已还原')===true")
  qaCheck((try Data(contentsOf:orphan))==Data("orphan bytes".utf8),"restore from real Trash preserves original bytes")
  // A disk change after preview must reject cleanup without altering that edit.
  try Data("外部更改 [保留](assets/orphan.pdf)".utf8).write(to:a.url!)
  _ = try await qaJS(owner,"document.querySelector('#resource-manager select').value='unused';document.querySelector('#resource-manager select').dispatchEvent(new Event('change'));document.querySelector('.resource-row input').click();document.querySelector('[data-clean]').click()")
  try await qaWait(owner,"document.querySelector('.resources-status')?.textContent.includes('清理已停止')===true")
  qaCheck(FileManager.default.fileExists(atPath:orphan.path),"stale cleanup preview rejects deletion after external reference changes")
  _ = try await qaJS(owner,"document.querySelector('#resource-manager [data-close]').click();window.mokune.receive({type:'action',action:'undo'})")
  qaCheck((try await qaJS(owner,"window.mokune.snapshot().raw") as? String)==before,"resource scanning and cleanup preserve image edit undo exactly")
  // The attachment chooser is substituted with a test file; copying and insertion are production code.
  _ = try await qaJS(owner,"window.mokune.receive({type:'action',action:'importAttachment'})")
  try await qaWait(owner,"window.mokune.snapshot().raw.includes('[source.pdf](assets/source.pdf)')")
  qaCheck((try Data(contentsOf:assets.appendingPathComponent("source.pdf")))==Data("%PDF fixture".utf8),"native attachment import copies original bytes")
  _ = try await qaJS(owner,"window.mokune.receive({type:'action',action:'undo'})")
  qaCheck((try await qaJS(owner,"window.mokune.snapshot().raw") as? String)==before,"native attachment insertion is one undoable edit")
  try JSONSerialization.data(withJSONObject:["checks":13,"realTrashAndRestore":true,"chooserAndConfirmation":"substituted in test build","finder":"validated URL, activation substituted"],options:.prettyPrinted).write(to:URL(fileURLWithPath:FileManager.default.currentDirectoryPath).appendingPathComponent("output/resources-app-checks.json"))
  print("Native resource integration passed");exit(0)
 }catch{fputs("Native resources QA: \(error)\n",stderr);exit(1)}
}}
let app=NSApplication.shared;app.setActivationPolicy(.accessory)
let delegate=AppDelegate();app.delegate=delegate
DispatchQueue.main.asyncAfter(deadline:.now()+90){fputs("Native resources QA timed out\n",stderr);exit(1)}
app.run()
