let qaRoot=URL(fileURLWithPath:ProcessInfo.processInfo.arguments[1],isDirectory:true)
func qaCheck(_ value:Bool,_ message:String){guard value else{fputs("FAIL: \(message)\n",stderr);exit(1)};print("PASS: \(message)")}
func qaWillClose(_ owner:AppDelegate){}
func qaPause()async{try? await Task.sleep(nanoseconds:300_000_000)}
@MainActor func qaJS(_ owner:AppDelegate,_ script:String)async throws->Any?{try await withCheckedThrowingContinuation{c in owner.webView.evaluateJavaScript(script){v,e in if let e=e{c.resume(throwing:e)}else{c.resume(returning:v)}}}}
@MainActor func qaWait(_ owner:AppDelegate,_ script:String)async throws{for _ in 0..<65{if try await qaJS(owner,script) as? Bool==true{return};await qaPause()};throw NSError(domain:script,code:1)}
func sessionHarnessReady(_ owner:AppDelegate){Task{@MainActor in
 do{
  let a=DocumentSession(id:"a"),b=DocumentSession(id:"b")
  let local="\u{FEFF}# 冲突处理\r\n\r\n当前第一段  \r\n\r\n相同内容\n\n当前第二段\r\n",disk="\u{FEFF}# 冲突处理\r\n\r\n磁盘第一段\r\n\r\n相同内容\n\n磁盘第二段\r\n"
  a.url=qaRoot.appendingPathComponent("A.md");a.raw=local;a.baseline=Data("原始基线".utf8);a.dirty=true;try Data(disk.utf8).write(to:a.url!)
  b.url=qaRoot.appendingPathComponent("B.md");b.raw="后台未保存 B";b.baseline=Data("# B".utf8);b.dirty=true;try b.baseline!.write(to:b.url!)
  owner.documents=[a,b];owner.activateDocument(a);await qaPause()
  _ = try await qaJS(owner,"window.mokune.receive({type:'action',action:'navigateLine',line:8,column:999});document.execCommand('insertText',false,'预先编辑')")
  let before=try await qaJS(owner,"window.mokune.snapshot().raw") as! String
  _ = try await qaJS(owner,"window.mokune.receive({type:'action',action:'compareDisk'})")
  try await qaWait(owner,"document.querySelectorAll('#conflict-merge .merge-hunk').length===2 && document.querySelector('#conflict-merge').open")
  _ = try await qaJS(owner,"const groups=document.querySelectorAll('.merge-hunk');groups[0].querySelector('[data-choice=current]').click();groups[1].querySelector('[data-choice=disk]').click();document.querySelector('#conflict-merge [data-confirm]').click()")
  let merged=local.replacingOccurrences(of:"当前第二段",with:"磁盘第二段")
  qaCheck((try await qaJS(owner,"window.mokune.snapshot().raw") as? String)==before,"preview keeps current unsaved source unchanged")
  qaCheck((try Data(contentsOf:a.url!))==Data(disk.utf8),"preview never writes the disk document")
  let shot:NSImage=try await withCheckedThrowingContinuation{c in owner.webView.takeSnapshot(with:nil){image,error in if let image=image{c.resume(returning:image)}else{c.resume(throwing:error ?? NSError(domain:"snapshot",code:1))}}}
  if let tiff=shot.tiffRepresentation,let rep=NSBitmapImageRep(data:tiff),let png=rep.representation(using:.png,properties:[:]){try png.write(to:URL(fileURLWithPath:FileManager.default.currentDirectoryPath).appendingPathComponent("output/conflict-native.png"))}
  _ = try await qaJS(owner,"document.querySelector('#conflict-merge [data-confirm]').click()")
  try await qaWait(owner,"!document.querySelector('#conflict-merge').open")
  qaCheck((try await qaJS(owner,"window.mokune.snapshot().raw") as? String)==merged,"native validated merge applies selected sections with exact BOM and mixed EOL")
  qaCheck((try Data(contentsOf:a.url!))==Data(disk.utf8),"apply changes only the editor until explicit save")
  _ = try await qaJS(owner,"window.mokune.receive({type:'action',action:'undo'})")
  qaCheck((try await qaJS(owner,"window.mokune.snapshot().raw") as? String)==before,"one undo restores the entire pre-merge draft")
  _ = try await qaJS(owner,"window.mokune.receive({type:'action',action:'undo'})")
  qaCheck((try await qaJS(owner,"window.mokune.snapshot().raw") as? String)==local,"earlier Chinese typing remains independently undoable")
  _ = try await qaJS(owner,"window.mokune.receive({type:'action',action:'redo'});window.mokune.receive({type:'action',action:'redo'})")
  owner.activateDocument(b);await qaPause();qaCheck((try await qaJS(owner,"window.mokune.snapshot().raw") as? String)=="后台未保存 B","switching preserves the background draft")
  owner.activateDocument(a);await qaPause();qaCheck((try await qaJS(owner,"window.mokune.snapshot().raw") as? String)==merged,"switching back preserves merged source and its history")
  _ = try await qaJS(owner,"window.mokune.receive({type:'action',action:'save'})")
  try await qaWait(owner,"document.querySelector('#save-status').textContent==='已保存'")
  qaCheck((try Data(contentsOf:a.url!))==Data(merged.utf8),"explicit save uses the validated disk baseline")
  qaCheck((try Data(contentsOf:b.url!))==b.baseline && b.dirty,"saving merged A does not save or clear B")
  let archived=try owner.versionStore.list(a.url!).map{try owner.versionStore.read($0.id,document:a.url!)}
  qaCheck(archived.contains(Data(before.utf8)) && archived.contains(Data(disk.utf8)),"both original inputs are preserved in version history")
  // External writes after preview and again after apply must never be overwritten.
  let second=merged+"磁盘新段落\n";try Data(second.utf8).write(to:a.url!);owner.checkExternalChange()
  _ = try await qaJS(owner,"window.mokune.receive({type:'action',action:'compareDisk'})")
  try await qaWait(owner,"document.querySelector('#conflict-merge').open")
  _ = try await qaJS(owner,"document.querySelector('[data-all=current]').click();document.querySelector('#conflict-merge [data-confirm]').click()")
  let third=second+"再次变化\n";try Data(third.utf8).write(to:a.url!)
  _ = try await qaJS(owner,"document.querySelector('#conflict-merge [data-confirm]').click()")
  try await qaWait(owner,"document.querySelector('.merge-message').textContent.includes('未应用合并')")
  qaCheck((try await qaJS(owner,"window.mokune.snapshot().raw") as? String)==merged,"disk write after preview rejects application without losing local draft")
  _ = try await qaJS(owner,"document.querySelector('#conflict-merge [data-refresh]').click()")
  try await qaWait(owner,"document.querySelector('.merge-message').textContent.includes('已重新比较')")
  _ = try await qaJS(owner,"document.querySelector('[data-all=current]').click();document.querySelector('#conflict-merge [data-confirm]').click();document.querySelector('#conflict-merge [data-confirm]').click()")
  try await qaWait(owner,"!document.querySelector('#conflict-merge').open")
  let fourth=third+"保存前变化\n";try Data(fourth.utf8).write(to:a.url!)
  _ = try await qaJS(owner,"window.mokune.receive({type:'action',action:'save'})")
  try await qaWait(owner,"document.querySelector('#save-status').textContent.includes('外部更改')")
  qaCheck((try Data(contentsOf:a.url!))==Data(fourth.utf8),"new disk change after apply is rejected again at save")
  owner.persistRecoveries();let drafts=try RecoveryArchive.decode(Data(contentsOf:owner.recoveryURL))
  qaCheck(drafts.contains(where:{$0["id"] as? String=="a" && $0["raw"] as? String==merged}),"keep-current merge is recovered even if raw equals the previous saved baseline")
  let c=DocumentSession(id:"metadata");c.url=qaRoot.appendingPathComponent("format.md");c.raw="\u{FEFF}a\r\nb\n";c.baseline=Data(c.raw!.utf8);let format="a\nb\r\n";try Data(format.utf8).write(to:c.url!);owner.documents.append(c);owner.activateDocument(c);await qaPause()
  _ = try await qaJS(owner,"window.mokune.receive({type:'action',action:'compareDisk'})")
  try await qaWait(owner,"document.querySelector('#conflict-merge').open")
  _ = try await qaJS(owner,"document.querySelector('[data-all=disk]').click();document.querySelector('#conflict-merge [data-confirm]').click();document.querySelector('#conflict-merge [data-confirm]').click()")
  try await qaWait(owner,"!document.querySelector('#conflict-merge').open")
  qaCheck((try await qaJS(owner,"window.mokune.snapshot().raw") as? String)==format && c.revision>0,"metadata-only merge reaches native draft revision tracking")
  _ = try await qaJS(owner,"window.mokune.receive({type:'action',action:'undo'})")
  qaCheck((try await qaJS(owner,"window.mokune.snapshot().raw") as? String)=="\u{FEFF}a\r\nb\n","native metadata-only undo restores original bytes")
  let d=DocumentSession(id:"equal");d.url=qaRoot.appendingPathComponent("equal.md");d.raw="相同内容\n";d.baseline=Data("不同旧基线".utf8);try Data(d.raw!.utf8).write(to:d.url!);owner.documents.append(d);owner.activateDocument(d);await qaPause()
  _ = try await qaJS(owner,"window.mokune.receive({type:'action',action:'compareDisk'})")
  try await qaWait(owner,"document.querySelector('#conflict-merge').open")
  _ = try await qaJS(owner,"document.querySelector('#conflict-merge [data-confirm]').click();document.querySelector('#conflict-merge [data-confirm]').click()")
  try await qaWait(owner,"!document.querySelector('#conflict-merge').open")
  _ = try await qaJS(owner,"window.mokune.receive({type:'action',action:'save'})")
  try await qaWait(owner,"document.querySelector('#save-status').textContent==='已保存'")
  qaCheck((try Data(contentsOf:d.url!))==Data("相同内容\n".utf8) && !d.dirty,"identical content resolves a stale native save baseline without a conflict loop")
  try JSONSerialization.data(withJSONObject:["checks":17,"nativeSave":true,"isolatedDocuments":true],options:.prettyPrinted).write(to:URL(fileURLWithPath:FileManager.default.currentDirectoryPath).appendingPathComponent("output/conflict-app-checks.json"))
  print("Native conflict integration passed");exit(0)
 }catch{fputs("Native conflict QA: \(error)\n",stderr);exit(1)}
}}
let app=NSApplication.shared;app.setActivationPolicy(.accessory);let delegate=AppDelegate();app.delegate=delegate
DispatchQueue.main.asyncAfter(deadline:.now()+90){fputs("Conflict QA timed out\n",stderr);exit(1)}
app.run()
