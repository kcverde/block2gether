// Compile with native/Luma.swift and -D CONTROLLER_TEST -parse-as-library.
// These are GameController snapshot fixtures, never physical-input claims.
import Foundation
import GameController

@main
struct NativeControllerTests {
    @MainActor static func main() {
        if CommandLine.arguments.contains("--list") {
            RunLoop.main.run(until: Date(timeIntervalSinceNow: 2))
            let devices = GCController.controllers().map { ["name": $0.vendorName ?? "Game controller", "extendedGamepad": $0.extendedGamepad != nil] as [String: Any] }
            let data = try! JSONSerialization.data(withJSONObject: devices, options: [.prettyPrinted, .sortedKeys])
            print(String(decoding: data, as: UTF8.self)); return
        }
        var events: [(String, [String: Any])] = []
        var assertions = 0
        func check(_ condition: Bool, _ name: String) {
            precondition(condition, name); assertions += 1
        }
        let bridge = ControllerBridge()
        bridge.eventSink = { events.append(($0, $1)) }
        let one = GCController.withExtendedGamepad(), two = GCController.withExtendedGamepad(), three = GCController.withExtendedGamepad()
        bridge.connect(one); bridge.connect(two); bridge.connect(three)
        check(bridge.entries.map(\.slot) == [0, 1, -1], "Two lanes, third unassigned")
        let ids = bridge.entries.map(\.id)
        bridge.connect(one)
        check(bridge.entries.count == 3, "Duplicate connection ignored")
        bridge.connect(GCController.withMicroGamepad())
        check(bridge.entries.count == 3, "Unsupported profile excluded")
        events.removeAll()
        let pad = one.extendedGamepad!
        pad.dpad.setValueForXAxis(-1, yAxis: 0); bridge.sample(acceptInput: true)
        check(events.count == 1 && events[0].1["action"] as? String == "left" && events[0].1["pressed"] as? Bool == true, "Dpad left presses once")
        bridge.sample(acceptInput: true)
        check(events.count == 1, "Held direction has no repeated native events")
        pad.leftThumbstick.setValueForXAxis(-1, yAxis: 0); bridge.sample(acceptInput: true)
        check(events.count == 1, "Stick and Dpad merge")
        pad.dpad.setValueForXAxis(0, yAxis: 0); bridge.sample(acceptInput: true)
        check(events.count == 1, "Releasing one source preserves the other")
        pad.leftThumbstick.setValueForXAxis(0, yAxis: 0); bridge.sample(acceptInput: true)
        check(events.count == 2 && events.last!.1["pressed"] as? Bool == false, "Last source releases")
        let mappings: [(GCControllerButtonInput, String)] = [(pad.buttonA,"cw"),(pad.buttonB,"ccw"),(pad.buttonX,"hold"),(pad.buttonY,"hold"),(pad.buttonMenu,"pause"),(pad.leftShoulder,"hold"),(pad.rightShoulder,"hold")]
        for (button, action) in mappings {
            events.removeAll(); button.setValue(1); bridge.sample(acceptInput: true)
            check(events.count == 1 && events[0].1["action"] as? String == action && events[0].1["slot"] as? Int == 0, "Button mapping \(action)")
            button.setValue(0); bridge.sample(acceptInput: true)
        }
        events.removeAll(); pad.dpad.setValueForXAxis(0, yAxis: 1); bridge.sample(acceptInput: true)
        check(events.count == 1 && events[0].1["action"] as? String == "drop" && events[0].1["pressed"] as? Bool == true, "Dpad up hard drops without rotating")
        bridge.sample(acceptInput: true)
        check(events.count == 1, "Held Dpad up does not repeat hard drop")
        pad.dpad.setValueForXAxis(0, yAxis: 0); bridge.sample(acceptInput: true)
        check(events.count == 2 && events.last!.1["action"] as? String == "drop" && events.last!.1["pressed"] as? Bool == false, "Dpad up releases hard drop")
        events.removeAll(); pad.buttonY.setValue(1); pad.buttonX.setValue(1); pad.leftShoulder.setValue(1); bridge.sample(acceptInput: true)
        check(events.count == 1, "Hold aliases merge")
        bridge.assign(id: ids[0], slot: 1)
        check(bridge.entries.map(\.slot) == [1,0,-1], "Assign swaps lane occupant")
        check(events.contains { $0.1["slot"] as? Int == 0 && $0.1["action"] as? String == "hold" && $0.1["pressed"] as? Bool == false }, "Reassignment releases old lane")
        bridge.sample(acceptInput: true)
        check(events.last!.1["slot"] as? Int == 1, "Following state routes new lane")
        events.removeAll(); bridge.sample(acceptInput: false)
        check(events.count == 1 && events[0].1["pressed"] as? Bool == false, "Inactive app releases")
        bridge.sample(acceptInput: true); events.removeAll(); bridge.disconnect(one)
        check(events.count == 2 && events[0].1["pressed"] as? Bool == false && events[1].1["disconnectedId"] as? String == ids[0], "Disconnect releases before snapshot")
        check(bridge.entries.first!.slot == 0, "Disconnect preserves other lane")
        bridge.assign(id: ids[2], slot: 1)
        check(bridge.entries.map(\.slot) == [0,1], "Extra controller can take available lane")
        bridge.assign(id: "missing", slot: 0); bridge.assign(id: ids[2], slot: 9)
        check(bridge.entries.map(\.slot) == [0,1], "Invalid assignments ignored")
        print("Native controller snapshot assertions passed: \(assertions)")
    }
}
