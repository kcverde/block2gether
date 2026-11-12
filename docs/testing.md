# Testing and development tools

## Automated checks

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
npm run format:check
```

`npm test` runs the deterministic engine, clock, input, match, and profile tests with Node's built-in test runner. No browser or Mac is required.

`npm run test:browser` runs five integration suites: solo play, local multiplayer, profiles/photos, controller settings, and timing. They intercept asset requests in disposable Playwright contexts; no HTTP server or personal browser profile is used. Generated screenshots/reports stay in `.build/qa/` and do not modify README screenshots. The profile fixture is a generic generated image in `tests/fixtures/avatar.png`.

On Linux CI, install browser system dependencies with `npx playwright install --with-deps chromium`. The workflow in `.github/workflows/ci.yml` runs JavaScript checks and a macOS build/controller job. A locally prepared workflow is not evidence of a successful hosted CI run.

For a specific locally installed browser, set `CHROME_PATH` to its executable. To test a different photo, set `PROFILE_TEST_PHOTO`; its output stays in ignored `.build/qa/profiles/`.

## Native checks (macOS)

```sh
npm run test:native
npm run build
open dist/block2gether.app
```

Native tests use Apple's writable controller snapshots. They check mappings, alias aggregation, reassignment, disconnect releases, and slot routing. They do not test physical controllers. The build compiles arm64 and x86_64 and verifies its ad-hoc signature.

## Isolated WebKit diagnostics

The native host supports these optional environment variables:

| Variable           | Purpose                                                                             |
| ------------------ | ----------------------------------------------------------------------------------- |
| `LUMA_DIAGNOSTICS` | Log path; enables an ephemeral data store and JavaScript test bridge                |
| `LUMA_TEST_SCRIPT` | JavaScript body to run after navigation; may return a result from an async function |
| `LUMA_SCREENSHOT`  | Optional native snapshot output path                                                |
| `LUMA_WINDOW_SIZE` | Optional diagnostic content size, such as `900x700`                                 |

For example, from the repository root:

```sh
mkdir -p .build/qa
LUMA_DIAGNOSTICS="$PWD/.build/qa/native.log" \
LUMA_TEST_SCRIPT="$PWD/scripts/verify-native-duo.js" \
  dist/block2gether.app/Contents/MacOS/block2gether
```

Keep the diagnostic window in the foreground; switching away deliberately pauses the game. Read `.build/qa/native.log` for the result, then close the diagnostic app. Always enable `LUMA_DIAGNOSTICS` when running test scripts so they cannot change normal profiles, preferences, or records.

## Visual and manual checks

```sh
npm run screenshots
```

This explicitly refreshes public-facing screenshots using generic profiles and staged game state. Review title, solo, and multiplayer output. For UI changes also inspect pause/settings/player editing, keyboard focus, reduced motion, and the minimum 900 × 700 Mac window.

Before distributing a release, check the built app on target hardware, real USB/Bluetooth controllers, focus loss, audio, fullscreen, and persisted profiles. Run `codesign --verify --deep --strict dist/block2gether.app`. Local ad-hoc signing is not Developer ID signing or notarization.
