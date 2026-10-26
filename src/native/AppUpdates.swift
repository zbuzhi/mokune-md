import AppKit
#if canImport(Sparkle)
import Sparkle
#endif

/// No updater or update UI starts until a real HTTPS feed and signing key are configured.
final class AppUpdates: NSObject {
    weak var owner: AppDelegate?
    #if canImport(Sparkle)
    private var controller: SPUStandardUpdaterController?
    #endif

    init(owner: AppDelegate) {
        self.owner = owner
        super.init()
        #if canImport(Sparkle)
        guard let feed = Bundle.main.object(forInfoDictionaryKey: "SUFeedURL") as? String,
              let url = URL(string: feed), url.scheme == "https", url.host != nil,
              url.user == nil, url.password == nil,
              let key = Bundle.main.object(forInfoDictionaryKey: "SUPublicEDKey") as? String,
              Data(base64Encoded: key)?.count == 32 else { return }
        controller = SPUStandardUpdaterController(startingUpdater: false, updaterDelegate: self, userDriverDelegate: nil)
        controller?.startUpdater()
        #endif
    }
    var available: Bool {
        #if canImport(Sparkle)
        return controller != nil
        #else
        return false
        #endif
    }
    func addMenuItems(to menu: NSMenu) {
        guard available else { return }
        let check = NSMenuItem(title: "检查更新…", action: #selector(checkForUpdates(_:)), keyEquivalent: "")
        check.target = self; menu.addItem(check)
        let automatic = NSMenuItem(title: "自动检查更新", action: #selector(toggleAutomaticChecks(_:)), keyEquivalent: "")
        automatic.target = self; menu.addItem(automatic)
    }
    private var canInteract: Bool {
        guard let owner = owner else { return false }
        return owner.ready && !owner.composing && !owner.modalBusy && owner.pendingAction == nil && !owner.exportBusy && !owner.allowClose && !owner.terminationPending
    }
    @objc func checkForUpdates(_ sender: Any?) {
        #if canImport(Sparkle)
        guard canInteract else { return }
        controller?.checkForUpdates(sender)
        #endif
    }
    @objc private func toggleAutomaticChecks(_ sender: Any?) {
        #if canImport(Sparkle)
        guard canInteract, let updater = controller?.updater else { return }
        updater.automaticallyChecksForUpdates.toggle()
        #endif
    }
}

extension AppUpdates: NSMenuItemValidation {
    func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
        #if canImport(Sparkle)
        guard let updater = controller?.updater else { return false }
        if menuItem.action == #selector(toggleAutomaticChecks(_:)) {
            menuItem.state = updater.automaticallyChecksForUpdates ? .on : .off
            return canInteract
        }
        return canInteract && updater.canCheckForUpdates
        #else
        return false
        #endif
    }
}
#if canImport(Sparkle)
extension AppUpdates: SPUUpdaterDelegate {
    func updater(_ updater: SPUUpdater, mayPerform updateCheck: SPUUpdateCheck) throws {
        guard canInteract else {
            throw NSError(domain: "Mokune.Updates", code: 1, userInfo: [NSLocalizedDescriptionKey:"请先完成当前输入或对话框，再检查更新。"])
        }
    }
}
#endif
