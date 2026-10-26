import AppKit

/// Observes only this app's events and always returns them unchanged.
final class ShortcutHints {
    private var monitor: Any?
    private var pending: DispatchWorkItem?
    private var commandDown = false
    private var suppressed = false
    private var visible = false
    private let delay: TimeInterval
    private let canShow: () -> Bool
    private let display: (Bool) -> Void

    init(delay: TimeInterval = 0.5, canShow: @escaping () -> Bool, display: @escaping (Bool) -> Void) {
        self.delay = delay; self.canShow = canShow; self.display = display
    }
    func install() {
        guard monitor == nil else { return }
        monitor = NSEvent.addLocalMonitorForEvents(matching: [.flagsChanged, .keyDown, .leftMouseDown, .rightMouseDown, .otherMouseDown]) { [weak self] event in
            self?.handle(flags: event.modifierFlags, modifierChange: event.type == .flagsChanged)
            return event
        }
    }
    func handle(flags: NSEvent.ModifierFlags, modifierChange: Bool) {
        guard flags.contains(.command) else { cancel(reset: true); return }
        let wasDown = commandDown
        commandDown = true
        let onlyCommand = flags.intersection([.command, .shift, .option, .control, .function]) == .command
        guard modifierChange, onlyCommand else { cancel(); return }
        guard !wasDown, !suppressed, canShow() else { return }
        let work = DispatchWorkItem { [weak self] in
            guard let self = self, self.commandDown, !self.suppressed, self.canShow() else { return }
            self.pending = nil; self.visible = true; self.display(true)
        }
        pending = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }
    func cancel(reset: Bool = false) {
        pending?.cancel(); pending = nil
        suppressed = !reset
        if reset { commandDown = false }
        if visible { visible = false; display(false) }
    }
    deinit { pending?.cancel(); if let monitor = monitor { NSEvent.removeMonitor(monitor) } }
}
