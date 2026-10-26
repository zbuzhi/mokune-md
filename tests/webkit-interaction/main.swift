import AppKit
import WebKit
let app=NSApplication.shared
app.setActivationPolicy(.accessory)
final class Probe: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
 let root=URL(fileURLWithPath:FileManager.default.currentDirectoryPath)
 var window:NSWindow!
 var web:WKWebView!
 func start(){
  let config=WKWebViewConfiguration()
  config.userContentController.add(self,name:"mokune")
  config.userContentController.addUserScript(WKUserScript(source:"localStorage.setItem('mokune.settings',JSON.stringify({autoSave:false}));window.__messages=[];",injectionTime:.atDocumentStart,forMainFrameOnly:true))
  web=WKWebView(frame:NSRect(x:0,y:0,width:1100,height:1000),configuration:config)
  window=NSWindow(contentRect:web.frame,styleMask:[.titled],backing:.buffered,defer:false);window.contentView=web
  web.navigationDelegate=self
  window.orderFrontRegardless()
  web.loadFileURL(root.appendingPathComponent("dist/web/index.html"),allowingReadAccessTo:root)
 }
 func userContentController(_ userContentController:WKUserContentController,didReceive message:WKScriptMessage){
  guard let value=message.body as? [String:Any] else{return}
  if value["command"] as? String == "openDocumentLink"{print("Native bridge link: \(value["reference"] ?? "")")}
 }
 func webView(_ webView:WKWebView,didFinish navigation:WKNavigation!){
  Task { @MainActor in
   do {
    let script=try String(contentsOf:root.appendingPathComponent("tests/webkit-interaction/checks.js"),encoding:.utf8)
    let result:Any = try await withCheckedThrowingContinuation { continuation in
     web.callAsyncJavaScript(script,arguments:["base":root.appendingPathComponent("output/").absoluteString],in:nil,in:.page){result in continuation.resume(with:result)}
    }
    guard let report=result as? [String:Any] else{fatalError("Missing test report")}
    try JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys]).write(to:root.appendingPathComponent("output/webkit-interaction-checks.json"))
    print("Native WebKit interaction checks passed: \((report["checks"] as? [String])?.count ?? 0)");exit(0)
   } catch {fputs("WebKit interaction failed: \(error)\n",stderr);exit(1)}
  }
 }
}
let probe=Probe();probe.start()
DispatchQueue.main.asyncAfter(deadline:.now()+90){fputs("WebKit interaction timed out\n",stderr);exit(1)}
app.run()
