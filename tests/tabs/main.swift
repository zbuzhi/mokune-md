import Foundation
let a=DocumentSession(id:"a"),b=DocumentSession(id:"b"),clean=DocumentSession(id:"clean")
a.raw="\u{FEFF}# A\r\n未保存 A  \n";a.dirty=true;a.url=URL(fileURLWithPath:"/tmp/A.md");a.baseline=Data("旧版 A\r\n".utf8)
b.raw="# B\n未保存 B";b.dirty=true;clean.raw="已保存";clean.dirty=false
let encoded=try RecoveryArchive.encode([a,b,clean]),drafts=try RecoveryArchive.decode(encoded)
precondition(drafts.count==2);precondition(drafts[0]["raw"] as? String==a.raw);precondition(drafts[1]["raw"] as? String==b.raw);precondition(drafts[1]["path"]==nil)
let baseline=Data(base64Encoded:drafts[0]["baseline"] as! String);precondition(baseline==a.baseline)
a.dirty=false
let remaining=try RecoveryArchive.decode(RecoveryArchive.encode([a,b]));precondition(remaining.count==1&&remaining[0]["id"] as? String=="b")
let legacy=try JSONSerialization.data(withJSONObject:["raw":"\u{FEFF}旧草稿\r\n","name":"旧版.md"]);let migrated=try RecoveryArchive.decode(legacy);precondition(migrated.count==1)
print("PASS: independent saved/untitled recovery, raw bytes, baselines, clean-tab isolation and legacy migration")
