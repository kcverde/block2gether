# Architecture

The app is an offline web game hosted by a small native macOS shell. There is no server and no runtime package dependency. Browser development tooling is separate from the shipped application.

## Modules

| Location                          | Responsibility                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `app/engine.js`                   | Deterministic rules, SRS, scoring, bag generation, gravity, lock delay, elapsed time and game events               |
| `app/match.js`                    | Two independent games with one seed and a shared pause state; compares scores after both finish                    |
| `app/input.js`                    | Immediate input and held-key repeat (DAS/ARR), independent of OS keyboard repeat                                   |
| `app/devices.js`                  | Keyboard layouts and controller action routing; aggregates sources so one release cannot cancel another held input |
| `app/renderer.js`                 | Retina Canvas rendering, cached block sprites, ghost projection and bounded visual effects                         |
| `app/audio.js`                    | Procedural Web Audio music and effects                                                                             |
| `app/profiles.js`                 | Validated local profiles, distinct player slots, image normalization and storage errors                            |
| `app/main.js`                     | App lifecycle, menus, accessibility focus, settings, HUD and animation loop                                        |
| `app/index.html`, `app/style.css` | Interface structure and responsive styling                                                                         |
| `native/Luma.swift`               | AppKit window/menu, bundled-asset scheme, native file picker, GameController bridge and isolated diagnostics       |
| `scripts/build-mac.sh`            | Universal macOS app assembly and local ad-hoc signing                                                              |

## Rules and time

`Game({ mode, seed, now })` supports `start`, `update`, `move`, `rotate`, `softDrop`, `hardDrop`, `hold`, `setPaused`, `cells`, `ghostY`, and `drainEvents`. The visible field is 10 × 20, with hidden rows for spawn and lock-out behavior. Events describe presentation changes without coupling the engine to rendering or sound.

Without `now`, elapsed time follows simulation delta time for deterministic tests. The app supplies `performance.now() / 1000` as a monotonic clock so foreground stalls count toward Sprint times while physics updates remain bounded. Pauses and countdowns are excluded; input-driven finishes capture their event time. Each multiplayer board stops its own clock on top-out.

## Native input

Swift polls Apple's extended gamepad profile and emits press/release transitions as `block2gether-controller` events. `block2gether-controllers` snapshots describe connected devices and assigned slots. JavaScript owns repeat timing. Multiple physical sources for one action are aggregated, and releases precede direction changes and reassignment. Blur and disconnect pause play.

See [the controller contract](../tests/native-controller.md) for event fields and verification commands.

## Local data and compatibility

Profiles live under `block2gether.profiles.v1`; settings and shared solo records retain `luma.settings.v1` and `luma.records.v1`. Photos are decoded, resized to at most 512 pixels on the longest side, and stored locally. Profile writes are validated and update in-memory state only after storage succeeds.

The original bundle identifier `com.kverde.luma`, `luma://app/` scheme, and internal native filenames remain intentionally unchanged to preserve existing installations' storage. Diagnostic launches use an ephemeral WebKit data store and expose a test bridge; normal launches do not. An optional one-launch profile import exists for local setup and is never part of a distribution build.
