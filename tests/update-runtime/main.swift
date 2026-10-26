import AppKit
import Sparkle
let qaRoot=URL(fileURLWithPath:Bundle.main.object(forInfoDictionaryKey:"QAResultPath") as! String)
let scenario=Bundle.main.object(forInfoDictionaryKey:"QAScenario") as! String
func record(_ message:String){let url=qaRoot.appendingPathComponent("events.log");let text=((try? String(contentsOf:url,encoding:.utf8)) ?? "")+message+"\n";try? text.write(to:url,atomically:true,encoding:.utf8);print(message)}
func finish(_ success:Bool,_ message:String){record(message);try? (success ? "PASS":"FAIL").write(to:qaRoot.appendingPathComponent("result"),atomically:true,encoding:.utf8);exit(success ? 0:1)}
final class Driver:NSObject,SPUUserDriver {
    var ready=false,cancellationRequested=false
    func show(_ request:SPUUpdatePermissionRequest,reply:@escaping(SUUpdatePermissionResponse)->Void){reply(SUUpdatePermissionResponse(automaticUpdateChecks:false,sendSystemProfile:false))}
    func showUserInitiatedUpdateCheck(cancellation:@escaping()->Void){record("checking")}
    func showUpdateFound(with appcastItem:SUAppcastItem,state:SPUUserUpdateState,reply:@escaping(SPUUserUpdateChoice)->Void){record("found update");reply(.install)}
    func showUpdateReleaseNotes(with downloadData:SPUDownloadData){}
    func showUpdateReleaseNotesFailedToDownloadWithError(_ error:Error){}
    func showUpdateNotFoundWithError(_ error:Error,acknowledgement:@escaping()->Void){acknowledgement();finish(scenario=="empty","no update")}
    func showUpdaterError(_ error:Error,acknowledgement:@escaping()->Void){
        var codes=[Int]();var current:Error?=error
        while let item=current{let ns=item as NSError;codes.append(ns.code);current=ns.userInfo[NSUnderlyingErrorKey] as? Error}
        record("error codes \(codes): \(error.localizedDescription)");acknowledgement()
        let expected=scenario=="network" ? codes.contains(where:{[1002,2001].contains($0)}) : (["tampered-archive","tampered-feed"].contains(scenario) && codes.contains(where:{[3001,3002].contains($0)}))
        finish(expected && !ready,"rejected before installation readiness")
    }
    func showDownloadInitiated(cancellation:@escaping()->Void){record("download started")}
    func showDownloadDidReceiveExpectedContentLength(_ expectedContentLength:UInt64){}
    func showDownloadDidReceiveData(ofLength length:UInt64){}
    func showDownloadDidStartExtractingUpdate(){record("verification/extraction phase")}
    func showExtractionReceivedProgress(_ progress:Double){}
    func showReady(toInstallAndRelaunch reply:@escaping(SPUUserUpdateChoice)->Void){ready=true;record("ready to install");if scenario=="cancel"{cancellationRequested=true;reply(.skip);record("requested installation cancel")}else{reply(.install)}}
    func showInstallingUpdate(withApplicationTerminated applicationTerminated:Bool,retryTerminatingApplication:@escaping()->Void){record("installing")}
    func showUpdateInstalledAndRelaunched(_ relaunched:Bool,acknowledgement:@escaping()->Void){acknowledgement();record("installed")}
    func dismissUpdateInstallation(){}
}
final class Delegate:NSObject,NSApplicationDelegate,SPUUpdaterDelegate {
    let driver=Driver();var updater:SPUUpdater!
    func applicationDidFinishLaunching(_ notification:Notification){
        if Bundle.main.object(forInfoDictionaryKey:"CFBundleVersion") as? String == "31"{finish(true,"relaunched build 31")}
        updater=SPUUpdater(hostBundle:Bundle.main,applicationBundle:Bundle.main,userDriver:driver,delegate:self)
        do{try updater.start();updater.checkForUpdates()}catch{finish(false,"start error: \(error)")}
    }
    func applicationShouldTerminate(_ sender:NSApplication)->NSApplication.TerminateReply{
        record("termination deferred for session flush")
        DispatchQueue.main.asyncAfter(deadline:.now()+0.1){try? "session preserved".write(to:qaRoot.appendingPathComponent("session"),atomically:true,encoding:.utf8);NSApp.reply(toApplicationShouldTerminate:true)}
        return .terminateLater
    }
    func updater(_ updater:SPUUpdater,didFinishUpdateCycleFor updateCheck:SPUUpdateCheck,error:Error?){
        if scenario=="cancel" && driver.cancellationRequested {
            DispatchQueue.main.asyncAfter(deadline:.now()+0.5){finish(true,"installation cancel acknowledged by update cycle")}
        }
    }
}
let app=NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate=Delegate();app.delegate=delegate
DispatchQueue.main.asyncAfter(deadline:.now()+40){finish(false,"runtime timeout")}
app.run()
