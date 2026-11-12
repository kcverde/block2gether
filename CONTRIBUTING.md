# Contributing to block2gether

Thanks for helping improve the game. Small, focused changes are easiest to review. For changes to game rules, controls, storage formats, or the native host, open an issue first so we can agree on the behavior.

## Set up

Use Node.js 24 (`nvm use` if you use nvm). JavaScript tests work without macOS; the native build and native controller tests require macOS and Xcode Command Line Tools.

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

Playwright and Prettier are development dependencies only. `npm ci` installs the exact versions in the lockfile. Browser tests use Playwright's Chromium by default; no separate Chrome installation or running server is required. See [Playwright's browser setup](https://playwright.dev/docs/browsers) for system dependencies on Linux.

## Make a change

1. Create a branch from `main`.
2. Read the relevant module and nearby tests; keep changes scoped to the issue.
3. Add a regression test for a behavior fix. Keep game-rule tests deterministic using a seed; use an injected clock for time-dependent cases.
4. Run `npm test`, `npm run test:browser`, and `npm run format:check`. Use `npm run format` to apply the repository's formatting.
5. For Swift, input mappings, or packaging changes, also run `npm run test:native` and `npm run build` on macOS.
6. Open a pull request describing the problem, resulting behavior, tests run, and any remaining verification gaps. Include a screenshot for visible UI changes.

Do not commit `dist/`, `.build/`, `node_modules/`, personal profiles, photos, or diagnostic logs. Automated tests must use disposable storage. Keep normal app data and saved records intact.

## Design and implementation

- Preserve modern falling-block rules and the score-duel format: identical piece sequences, independent boards, and a result only after both players top out.
- Keep the rules engine free of DOM, audio, and native dependencies.
- Keep physics work bounded while measuring active elapsed time independently of rendering delays.
- Use semantic buttons and inputs, visible keyboard focus, and reduced-motion behavior. Check the minimum supported Mac window size as well as fullscreen.
- Keep controller actions consistent across Swift mappings, JavaScript routing, tests, the in-game guide, and README.
- Avoid new runtime dependencies without a concrete need.
- Preserve the existing bundle identifier, custom URL scheme, and storage keys unless there is an explicit migration plan. Some internal `Luma` names are retained for compatibility.

See [architecture](docs/architecture.md) for module boundaries.

## Screenshots

`npm run screenshots` intentionally refreshes the three images in `docs/screenshots/`. It uses generic profiles, deterministic staged boards, and isolated browser storage. Inspect the output before committing it. Ordinary tests write artifacts only to ignored `.build/qa/`.

## Reporting bugs

Include macOS version, Mac architecture, game mode, steps to reproduce, expected and actual behavior, and input device. For controllers, include the model, connection type, and whether it appears in the app's Controllers screen. Use generic players in screenshots where possible.

## What is not yet validated

Native execution is tested on Apple Silicon. Intel builds and physical controller transport still need hardware testing. Automated controller snapshots validate mappings and routing, not Bluetooth/USB compatibility. Do not describe a synthetic test as a physical-device test.

## License

Contributions are made under the project’s [MIT license](LICENSE).
