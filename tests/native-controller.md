# Native controller contract

Run `npm run test:native` on macOS with Xcode Command Line Tools installed. The suite uses Apple's writable `GCController.withExtendedGamepad()` snapshots to check mapping and aggregation. It does not emulate Bluetooth/USB hardware.

After compiling, `.build/tests/native-controller --list` enumerates actual attached controllers. A device appearing in system Bluetooth settings does not guarantee Apple's GameController framework exposes it.

## Web bridge

Swift sets `window.__block2getherNativeControllers = true`. The app uses native input rather than polling the browser Gamepad API.

JavaScript sends commands through `window.webkit.messageHandlers.controllers.postMessage(...)`:

- `{type:'request'}` requests a current snapshot.
- `{type:'assign',id,slot:0}` assigns a device to slot zero (or one). An existing occupant swaps to the device's former slot.

`block2gether-controllers` events carry `{controllers:[{id,name,slot}],reason,disconnectedId?}`. Slots are `0`, `1`, or `-1` for an extra unassigned device. IDs remain stable for one connection, not across reconnection or app restart. Reasons are `connected`, `disconnected`, `assigned`, and `requested`.

`block2gether-controller` events carry `{id,slot,action,pressed}`. Actions are `left`, `right`, `down`, `cw`, `ccw`, `drop`, `hold`, and `pause`. The native layer emits press/release transitions; JavaScript owns repeat timing.

| Physical control                             | Action                  |
| -------------------------------------------- | ----------------------- |
| D-pad / left stick left, right, down         | `left`, `right`, `down` |
| D-pad Up                                     | `drop`                  |
| A / bottom face                              | `cw`                    |
| B / right face                               | `ccw`                   |
| Y / top face, X / left face, either shoulder | `hold`                  |
| Menu / Start                                 | `pause`                 |

Multiple physical controls for one action are combined. Releasing one source cannot release a still-held second source. Menus interpret `cw` as confirm and `ccw` as back. In solo mode, either assigned controller slot routes to the solo board.

Reassignment releases inputs in the old lane before changing routing. Disconnect releases inputs before the disconnect snapshot. App deactivation releases inputs and dispatches blur; the web layer pauses.

## References

- [Apple GameController](https://developer.apple.com/documentation/gamecontroller)
- [Playwright browser installation](https://playwright.dev/docs/browsers)
