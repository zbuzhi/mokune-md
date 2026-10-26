import Darwin
let performanceDirectory=URL(fileURLWithPath:ProcessInfo.processInfo.arguments[1])
let performancePhase=ProcessInfo.processInfo.arguments[2]
let performanceOutput=URL(fileURLWithPath:ProcessInfo.processInfo.arguments[3])
let performanceDefaults=UserDefaults(suiteName:"local.mokune.performance.\(ProcessInfo.processInfo.processIdentifier)")!
func hostRSS()->UInt64{
 var info=mach_task_basic_info(),count=mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size/MemoryLayout<integer_t>.size)
 let result=withUnsafeMutablePointer(to:&info){pointer in pointer.withMemoryRebound(to:integer_t.self,capacity:Int(count)){task_info(mach_task_self_,task_flavor_t(MACH_TASK_BASIC_INFO),$0,&count)}}
 return result == KERN_SUCCESS ? UInt64(info.resident_size):0
}
func performanceHarnessReady(_ owner:AppDelegate){
 let ready=(ProcessInfo.processInfo.systemUptime-performanceProcessStart)*1000
 Task { @MainActor in
  do{
   let script=try String(contentsOfFile:"tests/performance-native/checks.js",encoding:.utf8)
   let fixtures=try JSONSerialization.jsonObject(with:Data(contentsOf:URL(fileURLWithPath:".build/performance-fixtures.json")))
   let before=hostRSS(),result:Any=try await withCheckedThrowingContinuation{continuation in owner.webView.callAsyncJavaScript(script,arguments:["phase":performancePhase,"fixtures":fixtures],in:nil,in:.page){continuation.resume(with:$0)}}
   let report:[String:Any]=["readyFromProcessGlobalMs":ready,"finishedFromProcessGlobalMs":(ProcessInfo.processInfo.systemUptime-performanceProcessStart)*1000,"hostRSSBeforeBytes":before,"hostRSSAfterBytes":hostRSS(),"measurement":"Optimized real AppDelegate with isolated defaults, recovery directory and ephemeral WK store. New process; OS file caches not purged. RSS is native host only, excludes WebContent/GPU. Initial frame includes two rAF; scientific engines remain lazy for plain documents.","result":result]
   try JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys]).write(to:performanceOutput);exit(0)
  }catch{fputs("Native performance failed: \(error)\n",stderr);exit(1)}
 }
}
let app=NSApplication.shared
let delegate=AppDelegate()
app.delegate=delegate
app.setActivationPolicy(.accessory)
DispatchQueue.main.asyncAfter(deadline:.now()+120){fputs("Native performance timeout\n",stderr);exit(1)}
app.run()
