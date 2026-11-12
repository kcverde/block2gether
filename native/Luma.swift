import AppKit
import WebKit
import GameController
import UniformTypeIdentifiers

// Assets stay in the signed application bundle. No localhost server or network is used.
@MainActor
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    let root: URL
    init(root: URL) { self.root = root.standardizedFileURL.resolvingSymlinksInPath() }
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url, url.host == "app" else {
            task.didFailWithError(URLError(.badURL)); return
        }
        let relative = url.path == "/" ? "index.html" : String(url.path.dropFirst())
        let file = root.appendingPathComponent(relative).standardizedFileURL.resolvingSymlinksInPath()
        guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file) else {
            task.didFailWithError(URLError(.fileDoesNotExist)); return
        }
        let types = ["html": "text/html", "js": "text/javascript", "css": "text/css", "json": "application/json", "svg": "image/svg+xml", "png": "image/png", "woff2": "font/woff2", "wav": "audio/wav"]
        task.didReceive(URLResponse(url: url, mimeType: types[file.pathExtension] ?? "application/octet-stream", expectedContentLength: data.count, textEncodingName: "utf-8"))
        task.didReceive(data)
        task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

// Native GameController owns controller input; the web layer must not also poll Gamepad API.
@MainActor
final class ControllerBridge: NSObject {
    struct Entry {
        let controller: GCController
        let id: String
        var slot: Int
        var pressed: Set<String> = []
    }
    weak var webView: WKWebView?
    var entries: [Entry] = []
    var timer: Timer?
    var eventSink: ((String, [String: Any]) -> Void)?
    private let actions = ["left", "right", "down", "cw", "ccw", "drop", "hold", "pause"]

    func start() {
        NotificationCenter.default.addObserver(self, selector: #selector(connected(_:)), name: .GCControllerDidConnect, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(disconnected(_:)), name: .GCControllerDidDisconnect, object: nil)
        for controller in GCController.controllers() { connect(controller) }
        // Poll on the main run loop, including tracking modes. Input repeat is owned by JS.
        let pollTimer = Timer(timeInterval: 1.0 / 120, target: self, selector: #selector(poll), userInfo: nil, repeats: true)
        RunLoop.main.add(pollTimer, forMode: .common)
        timer = pollTimer
    }
    @objc private func connected(_ note: Notification) {
        if let controller = note.object as? GCController { connect(controller) }
    }
    @objc private func disconnected(_ note: Notification) {
        if let controller = note.object as? GCController { disconnect(controller) }
    }
    func connect(_ controller: GCController) {
        guard controller.extendedGamepad != nil, !entries.contains(where: { $0.controller === controller }) else { return }
        let used = Set(entries.map(\.slot))
        let slot = [0, 1].first { !used.contains($0) } ?? -1
        entries.append(Entry(controller: controller, id: UUID().uuidString, slot: slot))
        controller.playerIndex = playerIndex(slot)
        snapshot(reason: "connected")
    }
    func disconnect(_ controller: GCController) {
        guard let index = entries.firstIndex(where: { $0.controller === controller }) else { return }
        release(index)
        let id = entries[index].id
        entries.remove(at: index)
        snapshot(reason: "disconnected", disconnectedID: id)
    }
    func assign(id: String, slot: Int) {
        guard (0...1).contains(slot), let index = entries.firstIndex(where: { $0.id == id }) else { return }
        let oldSlot = entries[index].slot
        guard oldSlot != slot else { snapshot(reason: "assigned"); return }
        // Release in the old lanes before changing routing, then swap any occupant.
        release(index)
        if let other = entries.firstIndex(where: { $0.slot == slot && $0.id != id }) {
            release(other)
            entries[other].slot = oldSlot
            entries[other].controller.playerIndex = playerIndex(oldSlot)
        }
        entries[index].slot = slot
        entries[index].controller.playerIndex = playerIndex(slot)
        snapshot(reason: "assigned")
    }
    private func playerIndex(_ slot: Int) -> GCControllerPlayerIndex {
        slot == 0 ? .index1 : slot == 1 ? .index2 : .indexUnset
    }
    func snapshot(reason: String, disconnectedID: String? = nil) {
        var detail: [String: Any] = ["controllers": entries.map { ["id": $0.id, "name": $0.controller.vendorName ?? "Game controller", "slot": $0.slot] as [String: Any] }, "reason": reason]
        if let disconnectedID { detail["disconnectedId"] = disconnectedID }
        emit("block2gether-controllers", detail)
    }
    @objc func poll() { sample(acceptInput: NSApp.isActive) }
    func sample(acceptInput: Bool) {
        for index in entries.indices {
            guard acceptInput, let pad = entries[index].controller.extendedGamepad else { release(index); continue }
            // Direction-pad button states already apply Apple's device-specific thresholds.
            // Merge physical sources per action so D-pad+stick or X+shoulder never double-fire.
            var held: Set<String> = []
            if pad.dpad.left.isPressed || pad.leftThumbstick.left.isPressed { held.insert("left") }
            if pad.dpad.right.isPressed || pad.leftThumbstick.right.isPressed { held.insert("right") }
            if pad.dpad.down.isPressed || pad.leftThumbstick.down.isPressed { held.insert("down") }
            if pad.buttonA.isPressed { held.insert("cw") }
            if pad.buttonB.isPressed { held.insert("ccw") }
            if pad.dpad.up.isPressed { held.insert("drop") }
            if pad.buttonY.isPressed || pad.buttonX.isPressed || pad.leftShoulder.isPressed || pad.rightShoulder.isPressed { held.insert("hold") }
            if pad.buttonMenu.isPressed { held.insert("pause") }
            let previous = entries[index].pressed
            // Releases precede presses when crossing directions.
            for action in actions where previous.contains(action) && !held.contains(action) { input(index, action, false) }
            for action in actions where held.contains(action) && !previous.contains(action) { input(index, action, true) }
            entries[index].pressed = held
        }
    }
    func releaseAll() { for index in entries.indices { release(index) } }
    private func release(_ index: Int) {
        for action in actions where entries[index].pressed.contains(action) { input(index, action, false) }
        entries[index].pressed = []
    }
    private func input(_ index: Int, _ action: String, _ pressed: Bool) {
        let entry = entries[index]
        emit("block2gether-controller", ["id": entry.id, "slot": entry.slot, "action": action, "pressed": pressed])
    }
    private func emit(_ name: String, _ detail: [String: Any]) {
        eventSink?(name, detail)
        guard let data = try? JSONSerialization.data(withJSONObject: detail, options: [.sortedKeys]), let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('\(name)',{detail:\(json)}))", completionHandler: nil)
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKScriptMessageHandler, WKUIDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    let controllers = ControllerBridge()
    let environment = ProcessInfo.processInfo.environment
    var diagnosticsURL: URL? { environment["LUMA_DIAGNOSTICS"].map { URL(fileURLWithPath: $0) } }
    func log(_ value: Any) {
        guard let url = diagnosticsURL else { return }
        let line = "\(Date().ISO8601Format()) \(value)\n"
        guard let data = line.data(using: .utf8) else { return }
        if !FileManager.default.fileExists(atPath: url.path) { FileManager.default.createFile(atPath: url.path, contents: nil) }
        if let handle = try? FileHandle(forWritingTo: url) {
            defer { try? handle.close() }
            _ = try? handle.seekToEnd()
            try? handle.write(contentsOf: data)
        }
    }
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.appearance = NSAppearance(named: .darkAqua)
        buildMenus()
        let config = WKWebViewConfiguration()
        // QA sessions must never modify the player's personal records or preferences.
        config.websiteDataStore = diagnosticsURL == nil ? .default() : .nonPersistent()
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.add(self, name: "controllers")
        config.userContentController.addUserScript(WKUserScript(source: "window.__block2getherNativeControllers=true;", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        // Explicit one-launch import only. The player module consumes the value once and
        // persists it locally; no private profile image is added to the distributable app.
        if diagnosticsURL == nil, let path = environment["BLOCK2GETHER_IMPORT_PLAYERS"],
           let data = try? Data(contentsOf: URL(fileURLWithPath: path)), data.count <= 12_000_000,
           let object = try? JSONSerialization.jsonObject(with: data),
           JSONSerialization.isValidJSONObject(object),
           let safeData = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]),
           let json = String(data: safeData, encoding: .utf8) {
            config.userContentController.addUserScript(WKUserScript(source: "window.__block2getherImportProfiles=\(json);", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        config.setURLSchemeHandler(BundleSchemeHandler(root: Bundle.main.resourceURL!.appendingPathComponent("app")), forURLScheme: "luma")
        if diagnosticsURL != nil {
            config.userContentController.add(self, name: "diagnostics")
            config.userContentController.addUserScript(WKUserScript(source: """
            window.addEventListener('error', e => window.webkit.messageHandlers.diagnostics.postMessage({error:e.message,source:e.filename,line:e.lineno}));
            window.addEventListener('unhandledrejection', e => window.webkit.messageHandlers.diagnostics.postMessage({rejection:String(e.reason)}));
            const originalError = console.error; console.error = (...v) => { originalError(...v); window.webkit.messageHandlers.diagnostics.postMessage({consoleError:v.map(String)}); };
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        controllers.webView = webView
        controllers.start()
        webView.underPageBackgroundColor = NSColor(srgbRed: 0.031, green: 0.043, blue: 0.078, alpha: 1)
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1180, height: 830), styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
        window.title = "block2gether"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.backgroundColor = webView.underPageBackgroundColor
        window.minSize = NSSize(width: 900, height: 700)
        window.collectionBehavior = [.fullScreenPrimary]
        window.isReleasedWhenClosed = false
        window.contentView = webView
        if diagnosticsURL != nil, let value = environment["LUMA_WINDOW_SIZE"] {
            let parts = value.split(separator: "x").compactMap { Double($0) }
            if parts.count == 2 { window.setContentSize(NSSize(width: max(900, parts[0]), height: max(700, parts[1]))) }
        }
        window.center()
        window.makeKeyAndOrderFront(nil)
        window.makeFirstResponder(webView)
        NSApp.activate(ignoringOtherApps: true)
        webView.load(URLRequest(url: URL(string: "luma://app/index.html")!))
        log("launch \(Bundle.main.bundlePath)")
    }
    func buildMenus() {
        let main = NSMenu()
        let application = NSMenuItem()
        main.addItem(application)
        let app = NSMenu()
        app.addItem(withTitle: "About block2gether", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        app.addItem(.separator())
        app.addItem(withTitle: "Hide block2gether", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        app.addItem(.separator())
        app.addItem(withTitle: "Quit block2gether", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        application.submenu = app
        let viewItem = NSMenuItem(title: "View", action: nil, keyEquivalent: "")
        let view = NSMenu(title: "View")
        let fullscreen = view.addItem(withTitle: "Toggle Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fullscreen.keyEquivalentModifierMask = [.command, .control]
        viewItem.submenu = view
        main.addItem(viewItem)
        NSApp.mainMenu = main
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationDidResignActive(_ notification: Notification) {
        controllers.releaseAll()
        webView?.evaluateJavaScript("window.dispatchEvent(new Event('blur'))", completionHandler: nil)
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame else { return }
        if message.name == "controllers", let command = message.body as? [String: Any] {
            if command["type"] as? String == "request" { controllers.snapshot(reason: "requested") }
            else if command["type"] as? String == "assign", let id = command["id"] as? String, let slot = command["slot"] as? Int { controllers.assign(id: id, slot: slot) }
        } else if message.name == "diagnostics" { log(message.body) }
    }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor @Sendable ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.title = "Choose a player photo"
        panel.allowedContentTypes = [.image]
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.beginSheetModal(for: window) { response in completionHandler(response == .OK ? panel.urls : nil) }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        log("navigation complete")
        controllers.snapshot(reason: "requested")
        log("controllers: \(controllers.entries.map { ["name": $0.controller.vendorName ?? "Game controller", "slot": String($0.slot)] })")
        guard diagnosticsURL != nil else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [self] in
            webView.evaluateJavaScript("JSON.stringify({title:document.title,ready:document.readyState,canvas:document.querySelectorAll('canvas').length,storage:(()=>{try{localStorage.setItem('__luma_probe','ok');let x=localStorage.getItem('__luma_probe');localStorage.removeItem('__luma_probe');return x}catch(e){return String(e)}})()})") { value, error in self.log(error.map { "probe error: \($0)" } ?? "probe: \(value ?? "nil")") }
            if let path = environment["LUMA_TEST_SCRIPT"], let source = try? String(contentsOfFile: path, encoding: .utf8) {
                webView.callAsyncJavaScript(source, arguments: [:], in: nil, in: .page) { result in self.log("test: \(result)") }
            }
        }
        if let path = environment["LUMA_SCREENSHOT"] {
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [self] in
                webView.takeSnapshot(with: nil) { image, error in
                    if let tiff = image?.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff), let data = bitmap.representation(using: .png, properties: [:]) {
                        do { try data.write(to: URL(fileURLWithPath: path)); self.log("snapshot: \(path)") } catch { self.log("snapshot write: \(error)") }
                    } else { self.log("snapshot failed: \(String(describing: error))") }
                }
            }
        }
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { log("navigation failed: \(error)") }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { log("navigation failed: \(error)") }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(action.request.url?.scheme == "luma" ? .allow : .cancel)
    }
}

#if !CONTROLLER_TEST
@main
struct LumaApplication {
    @MainActor static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        withExtendedLifetime(delegate) { app.run() }
    }
}

#endif
